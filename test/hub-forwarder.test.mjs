import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHubForwarder, buildHubPayload, HUB_DEFAULT_ENDPOINT } from '../netlify/functions/lib/hub-forwarder.mjs';
import { buildDispatcher } from '../netlify/functions/lib/dispatcher.mjs';
import { parseSubmission } from '../netlify/functions/lib/leadtable-forwarder.mjs';

const base = {
  id: '0123456789abcdef01234567',
  form_name: 'erstgespraech',
  created_at: '2026-10-21T10:00:00.000Z',
  data: {
    'form-name': 'erstgespraech', 'bot-field': '', vorname: 'Max', nachname: 'Mustermann',
    email: 'max@example.com', telefon: '0123456789', anliegen: 'Keramikimplantate',
    ziel: 'Feste Zähne', dringlichkeit: '1-4 Wochen', rueckruf: 'Vormittags', consent: 'on',
  },
};
const campaigns = { erstgespraech: 'k-erst', kontakt: 'k-kontakt', bewerbung: 'k-bew' };
const okResponse = () => new Response(JSON.stringify({ id: 'hub-1' }), { status: 200 });

test('maps a Netlify submission into the hub payload', () => {
  const payload = buildHubPayload(parseSubmission(JSON.stringify(base)), 'k-erst');
  assert.equal(payload.kampagne, 'k-erst');
  assert.equal(payload.name, 'Max Mustermann');
  assert.equal(payload.email, 'max@example.com');
  assert.equal(payload.telefon, '0123456789');
  assert.equal(payload.felder.anliegen, 'Keramikimplantate');
  assert.equal(payload.felder.dringlichkeit, '1-4 Wochen');
  assert.equal(payload.felder.rueckruf, 'Vormittags');
  assert.equal(payload.felder.formular, 'Erstgespräch');
  assert.match(payload.felder.quelle, /hellriegel-zahnmedizin\.de/);
  for (const k of ['form-name', 'bot-field', 'consent', 'vorname', 'email']) assert.equal(payload.felder[k], undefined);
});

test('sends to the hub with the portal key and the campaign of the form', async () => {
  const calls = [];
  const forward = buildHubForwarder({ portalKey: 'secret', campaigns, fetchImpl: async (url, o) => { calls.push({ url, o }); return okResponse(); } });
  for (const form_name of ['erstgespraech', 'kontakt', 'bewerbung']) {
    const r = await forward(parseSubmission(JSON.stringify({ ...base, form_name })));
    assert.deepEqual(r, { ok: true, hubLeadId: 'hub-1' });
  }
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, HUB_DEFAULT_ENDPOINT);
  assert.equal(calls[0].o.headers['x-portal-key'], 'secret');
  assert.deepEqual(calls.map((c) => JSON.parse(c.o.body).kampagne), ['k-erst', 'k-kontakt', 'k-bew']);
});

test('adds application file links to the hub lead', async () => {
  let body;
  const forward = buildHubForwarder({ portalKey: 'secret', campaigns, fetchImpl: async (u, o) => { body = JSON.parse(o.body); return okResponse(); } });
  await forward(parseSubmission(JSON.stringify({ ...base, form_name: 'bewerbung' })), [{ filename: 'cv.pdf', url: 'https://api.netlify.com/x/cv.pdf' }]);
  assert.equal(body.felder.anhaenge, 'cv.pdf: https://api.netlify.com/x/cv.pdf');
  assert.equal(body.felder.formular, 'Bewerbung');
});

test('skips silently while the hub is not configured', async () => {
  let fetched = false;
  const f = async () => { fetched = true; return okResponse(); };
  assert.deepEqual(await buildHubForwarder({ campaigns, fetchImpl: f })(parseSubmission(JSON.stringify(base))), { ok: true, skipped: true });
  assert.deepEqual(await buildHubForwarder({ portalKey: 'x', campaigns: {}, fetchImpl: f })(parseSubmission(JSON.stringify(base))), { ok: true, skipped: true });
  assert.equal(fetched, false);
});

test('refuses endpoints outside the hub and hides upstream errors', async () => {
  const bad = buildHubForwarder({ portalKey: 'x', campaigns, endpoint: 'https://example.com/hook' });
  assert.equal((await bad(parseSubmission(JSON.stringify(base)))).ok, false);
  const failing = buildHubForwarder({ portalKey: 'x', campaigns, fetchImpl: async () => new Response('secret max@example.com', { status: 500 }) });
  const r = await failing(parseSubmission(JSON.stringify(base)));
  assert.equal(r.ok, false);
  assert.doesNotMatch(JSON.stringify(r), /secret|max@example/);
});

function dispatcher({ leadTable = true, hub = true, leadTableStatus = 200, hubOk = true } = {}) {
  const calls = { leadTable: 0, hub: 0 };
  const handler = buildDispatcher({
    leadTableEndpoints: leadTable ? { patient: 'https://api-v2.lead-table.com/p', application: 'https://api-v2.lead-table.com/a' } : {},
    leadTableHandler: async () => { calls.leadTable++; return { statusCode: leadTableStatus, body: JSON.stringify({ ok: leadTableStatus < 300 }) }; },
    hubForward: async () => { calls.hub++; if (!hub) return { ok: true, skipped: true }; return hubOk ? { ok: true, hubLeadId: 'h' } : { ok: false, error: 'Hub forwarding failed' }; },
  });
  return { handler, calls };
}

test('sends to LeadTable and hub in parallel', async () => {
  const { handler, calls } = dispatcher();
  const r = await handler({ body: JSON.stringify(base) });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(calls, { leadTable: 1, hub: 1 });
});

test('keeps working with only LeadTable or only the hub', async () => {
  const onlyLt = dispatcher({ hub: false });
  assert.equal((await onlyLt.handler({ body: JSON.stringify(base) })).statusCode, 200);
  const onlyHub = dispatcher({ leadTable: false });
  const r = await onlyHub.handler({ body: JSON.stringify(base) });
  assert.equal(r.statusCode, 200);
  assert.equal(onlyHub.calls.leadTable, 0);
});

test('reports a failure of either target', async () => {
  assert.equal((await dispatcher({ hubOk: false }).handler({ body: JSON.stringify(base) })).statusCode, 502);
  assert.equal((await dispatcher({ leadTableStatus: 502 }).handler({ body: JSON.stringify(base) })).statusCode, 502);
});

test('fails visibly when nothing is configured and ignores other forms', async () => {
  assert.equal((await dispatcher({ leadTable: false, hub: false }).handler({ body: JSON.stringify(base) })).statusCode, 500);
  const { handler, calls } = dispatcher();
  const r = await handler({ body: JSON.stringify({ ...base, form_name: 'newsletter' }) });
  assert.equal(JSON.parse(r.body).ignored, true);
  assert.deepEqual(calls, { leadTable: 0, hub: 0 });
});
