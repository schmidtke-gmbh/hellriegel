const ALLOWED_FORMS = new Set(['erstgespraech', 'kontakt', 'bewerbung']);

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
  return { id: payload.id, formName, createdAt: String(payload.created_at ?? ''), data: payload.data };
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
  fetchImpl = fetch,
  timeoutMs = 10_000,
  signalFactory = (milliseconds) => AbortSignal.timeout(milliseconds),
}) {
  const endpointUrl = validEndpoint(endpoint);
  return async function handler(event) {
    let submission;
    try { submission = parseSubmission(event?.body ?? '{}'); }
    catch { return jsonResponse(400, { ok: false, error: 'Invalid submission payload' }); }
    if (!submission) return jsonResponse(200, { ok: true, ignored: true });
    if (!endpointUrl) return jsonResponse(500, { ok: false, error: 'Integration is not configured' });

    try {
      const response = await fetchImpl(endpointUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildLeadTablePayload(submission)),
        redirect: 'error', signal: signalFactory(timeoutMs),
      });
      if (!response.ok) return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
      const result = await response.json();
      if (result?.success !== true) return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
      return jsonResponse(200, { ok: true, leadUid: result.uid ?? null });
    } catch (error) {
      console.error('LeadTable forwarding failed', error?.name ?? 'Error');
      return jsonResponse(502, { ok: false, error: 'LeadTable forwarding failed' });
    }
  };
}
