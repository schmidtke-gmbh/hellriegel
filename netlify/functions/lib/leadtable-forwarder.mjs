const ALLOWED_FORMS = new Set(['erstgespraech', 'kontakt', 'bewerbung']);
const MAX_ATTACHMENT_BYTES = 10_000_000;
const ALLOWED_FILE_HOSTS = new Set(['d33wubrfki0l68.cloudfront.net', 'api.netlify.com']);

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validEndpoint(endpoint) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.hostname !== 'api-v2.lead-table.com' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseSubmission(rawBody) {
  const body = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody;
  if (!isPlainObject(body)) throw new Error('Invalid submission');
  const payload = Object.hasOwn(body, 'payload') ? body.payload : body;
  if (!isPlainObject(payload)) throw new Error('Invalid submission');
  const formName = payload.form_name ?? payload.formName ?? payload.data?.['form-name'];
  if (!ALLOWED_FORMS.has(formName)) return null;
  if (typeof payload.id !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.id) || !isPlainObject(payload.data)) {
    throw new Error('Invalid submission');
  }
  return { id: payload.id, formName, createdAt: String(payload.created_at ?? ''), data: payload.data, files: payload.files };
}

function normalizeFileEntries(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) normalizeFileEntries(item, result);
    return result;
  }
  if (!isPlainObject(value)) return result;
  if (typeof value.url === 'string' && typeof value.filename === 'string') {
    result.push({ url: value.url, filename: value.filename, size: Number(value.size) || 0 });
    return result;
  }
  for (const item of Object.values(value)) normalizeFileEntries(item, result);
  return result;
}

function validFileUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_FILE_HOSTS.has(url.hostname) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getSubmissionFiles(submission) {
  const entries = normalizeFileEntries(submission.files);
  normalizeFileEntries(submission.data.files, entries);
  normalizeFileEntries(submission.data['files[]'], entries);
  const unique = new Map();
  for (const file of entries) {
    if (!validFileUrl(file.url) || file.size > MAX_ATTACHMENT_BYTES) continue;
    unique.set(`${file.url}\n${file.filename}`, file);
  }
  return [...unique.values()];
}

function stringifyValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function buildLeadTablePayload(submission) {
  const data = submission.data;
  const reservedFields = new Set([
    'form-name', 'bot-field', 'name', 'email', 'phone', 'telefon', 'formular',
    'eingang', 'netlify_submission_id', 'quelle', 'vorname', 'nachname',
  ]);
  const fields = {
    name: [data.vorname, data.nachname].filter(Boolean).map(String).join(' ').trim(),
    email: stringifyValue(data.email),
    phone: stringifyValue(data.telefon),
    formular: submission.formName,
    eingang: submission.createdAt,
    netlify_submission_id: submission.id,
    quelle: 'hellriegel-zahnmedizin.de',
  };

  for (const [key, value] of Object.entries(data)) {
    if (reservedFields.has(key)) continue;
    fields[key] = stringifyValue(value);
  }
  fields.vorname = stringifyValue(data.vorname);
  fields.nachname = stringifyValue(data.nachname);
  return { fields };
}

export function buildSubmissionHandler({
  endpoint,
  applicationEndpoint,
  leadTableApiKey,
  leadTableApiEmail,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  signalFactory = (milliseconds) => AbortSignal.timeout(milliseconds),
}) {
  const endpointUrl = validEndpoint(endpoint);
  const applicationEndpointUrl = validEndpoint(applicationEndpoint);
  return async function handler(event) {
    let submission;
    try { submission = parseSubmission(event?.body ?? '{}'); }
    catch { return jsonResponse(400, { ok: false, error: 'Invalid submission payload' }); }
    if (!submission) return jsonResponse(200, { ok: true, ignored: true });
    const selectedEndpoint = submission.formName === 'bewerbung' ? applicationEndpointUrl : endpointUrl;
    if (!selectedEndpoint) return jsonResponse(500, { ok: false, error: 'Integration is not configured' });
    const files = submission.formName === 'bewerbung' ? getSubmissionFiles(submission) : [];
    if (files.length && (!leadTableApiKey || !leadTableApiEmail)) {
      return jsonResponse(500, { ok: false, error: 'Attachment integration is not configured' });
    }

    try {
      const response = await fetchImpl(selectedEndpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildLeadTablePayload(submission)),
        redirect: 'error', signal: signalFactory(timeoutMs),
      });
      if (!response.ok) return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
      const responseBody = (await response.text()).trim();
      let leadUid = null;
      try {
        const result = JSON.parse(responseBody);
        if (result?.success !== true) return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
        leadUid = result.uid ?? null;
      } catch {
        if (!/^[a-f0-9]{24}$/i.test(responseBody)) {
          return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
        }
        leadUid = responseBody;
      }
      let attachmentsUploaded = 0;
      let attachmentErrors = 0;
      for (const file of files) {
        try {
          const fileResponse = await fetchImpl(validFileUrl(file.url), {
            method: 'GET', redirect: 'error', signal: signalFactory(timeoutMs),
          });
          if (!fileResponse.ok) throw new Error('Attachment download failed');
          const blob = await fileResponse.blob();
          if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment too large');
          const form = new FormData();
          form.append('avatar', blob, file.filename);
          const uploadResponse = await fetchImpl(`https://app.lead-table.com/api/upload/${leadUid}`, {
            method: 'POST',
            headers: { 'x-api-key': leadTableApiKey, email: leadTableApiEmail },
            body: form,
            redirect: 'error',
            signal: signalFactory(timeoutMs),
          });
          if (!uploadResponse.ok) throw new Error('Attachment upload failed');
          attachmentsUploaded += 1;
        } catch (error) {
          attachmentErrors += 1;
          console.error('LeadTable attachment forwarding failed', error?.name ?? 'Error');
        }
      }
      return jsonResponse(200, { ok: true, leadUid, attachmentsUploaded, attachmentErrors });
    } catch (error) {
      console.error('LeadTable forwarding failed', error?.name ?? 'Error');
      return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
    }
  };
}
