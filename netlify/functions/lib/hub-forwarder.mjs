// Leitet Netlify-Formulare an den Kunden-Hub (hub.schmidtke-gmbh.de) weiter.
// Läuft parallel zur LeadTable-Weiterleitung, solange beide eingerichtet sind.

const HUB_HOST = 'wjxtqadtknafadfexjas.supabase.co';
export const HUB_DEFAULT_ENDPOINT = `https://${HUB_HOST}/functions/v1/lead-eingang`;

const FORM_LABELS = {
  erstgespraech: 'Erstgespräch',
  kontakt: 'Kontakt',
  bewerbung: 'Bewerbung',
};

// Diese Felder gehen als name / email / telefon direkt in den Lead
// oder sind technisch und gehören nicht in den Hub.
const RESERVED = new Set([
  'form-name', 'bot-field', 'vorname', 'nachname', 'name', 'email', 'telefon', 'phone',
  'consent', 'files', 'files[]', 'quelle', 'kampagne',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function validHubEndpoint(endpoint) {
  try {
    const url = new URL(endpoint || HUB_DEFAULT_ENDPOINT);
    if (url.protocol !== 'https:' || url.hostname !== HUB_HOST || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function campaignFor(formName, campaigns) {
  return campaigns?.[formName] || null;
}

export function buildHubPayload(submission, kampagne, files = []) {
  const data = submission.data;
  const felder = {};
  for (const [key, value] of Object.entries(data)) {
    if (RESERVED.has(key)) continue;
    const v = text(value);
    if (v) felder[key] = v;
  }
  if (files.length) felder.anhaenge = files.map((f) => `${f.filename}: ${f.url}`).join('\n');
  felder.formular = FORM_LABELS[submission.formName] || submission.formName;
  felder.quelle = `Website ${felder.formular} (hellriegel-zahnmedizin.de)`;
  felder.netlify_submission_id = submission.id;

  return {
    kampagne,
    name: [data.vorname, data.nachname].map(text).filter(Boolean).join(' ') || text(data.name),
    email: text(data.email),
    telefon: text(data.telefon ?? data.phone),
    felder,
  };
}

export function buildHubForwarder({
  portalKey,
  campaigns,
  endpoint,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  signalFactory = (ms) => AbortSignal.timeout(ms),
}) {
  const endpointUrl = validHubEndpoint(endpoint);

  // Gibt { skipped } zurück, wenn der Hub für dieses Formular nicht eingerichtet ist.
  // So läuft LeadTable unverändert weiter, bis die Werte in Netlify eingetragen sind.
  return async function forward(submission, files = []) {
    const kampagne = campaignFor(submission.formName, campaigns);
    if (!portalKey || !kampagne) return { ok: true, skipped: true };
    if (!endpointUrl) return { ok: false, error: 'Hub endpoint is invalid' };

    try {
      const response = await fetchImpl(endpointUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-portal-key': portalKey },
        body: JSON.stringify(buildHubPayload(submission, kampagne, files)),
        redirect: 'error',
        signal: signalFactory(timeoutMs),
      });
      if (!response.ok) {
        console.error('Hub forwarding failed', response.status);
        return { ok: false, error: 'Hub forwarding failed' };
      }
      const result = await response.json().catch(() => ({}));
      return { ok: true, hubLeadId: isPlainObject(result) ? result.id ?? null : null };
    } catch (error) {
      console.error('Hub forwarding failed', error?.name ?? 'Error');
      return { ok: false, error: 'Hub forwarding failed' };
    }
  };
}
