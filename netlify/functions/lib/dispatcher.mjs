// Verteilt eine Netlify-Formular-Einsendung an alle eingerichteten Ziele
// (LeadTable und/oder Kunden-Hub). Ein Ziel ist eingerichtet, wenn seine
// Umgebungsvariablen in Netlify gesetzt sind. Zum Abschalten von LeadTable
// reicht es, die LEADTABLE_*-Variablen zu löschen.

import { parseSubmission, getSubmissionFiles } from './leadtable-forwarder.mjs';

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

export function buildDispatcher({ leadTableHandler, leadTableEndpoints = {}, hubForward }) {
  return async function handler(event) {
    let submission;
    try { submission = parseSubmission(event?.body ?? '{}'); }
    catch { return jsonResponse(400, { ok: false, error: 'Invalid submission payload' }); }
    if (!submission) return jsonResponse(200, { ok: true, ignored: true });

    const leadTableActive = submission.formName === 'bewerbung'
      ? Boolean(leadTableEndpoints.application)
      : Boolean(leadTableEndpoints.patient);

    const files = submission.formName === 'bewerbung' ? getSubmissionFiles(submission) : [];

    const [leadTable, hub] = await Promise.all([
      leadTableActive
        ? leadTableHandler(event).then((r) => ({ ok: r.statusCode < 300, ...JSON.parse(r.body || '{}') }))
            .catch(() => ({ ok: false, error: 'LeadTable forwarding failed' }))
        : Promise.resolve({ ok: true, skipped: true }),
      hubForward(submission, files),
    ]);

    if (leadTable.skipped && hub.skipped) {
      return jsonResponse(500, { ok: false, error: 'No integration is configured' });
    }
    const ok = leadTable.ok && hub.ok;
    return jsonResponse(ok ? 200 : 502, { ok, leadTable, hub });
  };
}
