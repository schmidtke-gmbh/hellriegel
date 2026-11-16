import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pruefeBewerbung, telefonAusland, MIN_SEKUNDEN } from '../netlify/functions/lib/bewerbung-filter.mjs';
import { buildDispatcher } from '../netlify/functions/lib/dispatcher.mjs';
import { buildHubPayload } from '../netlify/functions/lib/hub-forwarder.mjs';
import { buildLeadTablePayload, parseSubmission } from '../netlify/functions/lib/leadtable-forwarder.mjs';

// So sieht eine normale Bewerbung aus dem Browser aus (Formular auf karriere.html).
const normal = {
  'form-name': 'bewerbung', 'bot-field': '', vorname: 'Lena', nachname: 'Beispiel',
  email: 'lena@example.com', telefon: '0151 23456789', stelle: 'Ausbildung ZFA',
  start: '01.08.2027', arbeitsmodell: 'Ausbildung', nachricht: 'Ich wohne in Essen.', consent: 'on',
  hh_js: '1', hh_zeit: '48',
  ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', referrer: 'https://hellriegel-zahnmedizin.de/karriere',
};
const einsendung = (data, form_name = 'bewerbung') => ({ id: '0123456789abcdef01234567', form_name, created_at: '2026-11-16T09:00:00.000Z', data });

const DEUTSCH = ['', '   ', '0201 493126', '0201/49 31 26', '(0201) 493126', '0151-23456789', '+49 201 493126', '+49(0)151 23456789', '+ 49 151 2345', '0049 201 493126', '0049-151-234', '49 201 493126', '201493126'];
const AUSLAND = ['+374 44 819 235', '+374 96 635 908', '+90 522 897 8622', '+374 93 390166', '0090 522 897 8622', '00374 44 819235', '+43 660 1234567', '+31 6 12345678', '+1 212 555 0100', '(+90) 522 8978622', '+420 601 123456'];

test('erkennt ausländische Ländervorwahlen und lässt deutsche Schreibweisen durch', () => {
  for (const n of DEUTSCH) assert.equal(telefonAusland(n), false, `deutsch erwartet: "${n}"`);
  for (const n of AUSLAND) assert.equal(telefonAusland(n), true, `Ausland erwartet: "${n}"`);
  assert.equal(telefonAusland(undefined), false);
  assert.equal(telefonAusland(null), false);
});

test('lässt eine normale Bewerbung aus dem Browser durch', () => {
  assert.deepEqual(pruefeBewerbung(normal), { gefiltert: false, gruende: [] });
  // ohne Telefonnummer (das Feld ist freiwillig)
  assert.equal(pruefeBewerbung({ ...normal, telefon: '' }).gefiltert, false);
  // wohnt hier und schreibt die Nummer international
  assert.equal(pruefeBewerbung({ ...normal, telefon: '+49 151 23456789' }).gefiltert, false);
});

test('sortiert die vier Einsendungen vom 16.11.2026 aus (Auslandsvorwahl)', () => {
  for (const telefon of ['+374 44 819 235', '+374 96 635 908', '+90 522 897 8622', '+374 93 390166']) {
    const r = pruefeBewerbung({ ...normal, telefon, start: 'Berlin', arbeitsmodell: 'Vollzeit' });
    assert.equal(r.gefiltert, true);
    assert.deepEqual(r.gruende, ['auslandsnummer']);
  }
});

test('sortiert direkte Aufrufe der Formularadresse aus', () => {
  const ohneSkript = { ...normal }; delete ohneSkript.hh_js; delete ohneSkript.hh_zeit;
  // Programm ruft die Formularadresse auf: keine Herkunft, kein Skript
  assert.deepEqual(pruefeBewerbung({ ...ohneSkript, referrer: '' }).gruende, ['ohne-browser']);
  assert.deepEqual(pruefeBewerbung({ ...ohneSkript, referrer: 'https://example.org/sammelbewerbung' }).gruende, ['ohne-browser']);
  // … oder gibt sich als Programm zu erkennen
  assert.deepEqual(pruefeBewerbung({ ...ohneSkript, user_agent: 'python-requests/2.32' }).gruende, ['ohne-browser']);
});

test('lässt Browser ohne JavaScript und alte Seitenfassungen durch', () => {
  const ohneSkript = { ...normal }; delete ohneSkript.hh_js; delete ohneSkript.hh_zeit;
  // von unserer Seite abgeschickt, nur ohne Skript (JavaScript aus oder Seite noch im Zwischenspeicher)
  assert.equal(pruefeBewerbung(ohneSkript).gefiltert, false);
  assert.equal(pruefeBewerbung({ ...ohneSkript, referrer: 'https://www.hellriegel-zahnmedizin.de/karriere.html' }).gefiltert, false);
  assert.equal(pruefeBewerbung({ ...ohneSkript, referrer: 'https://deploy-preview-7--hellriegel.netlify.app/karriere' }).gefiltert, false);
  // Netlify liefert gar keine Herkunft mit: dann wird nicht geurteilt
  const ohneHerkunft = { ...ohneSkript }; delete ohneHerkunft.referrer;
  assert.equal(pruefeBewerbung(ohneHerkunft).gefiltert, false);
});

test('sortiert zu schnell ausgefüllte Formulare und das unsichtbare Feld aus', () => {
  assert.deepEqual(pruefeBewerbung({ ...normal, hh_zeit: '0' }).gruende, ['zu-schnell']);
  assert.deepEqual(pruefeBewerbung({ ...normal, hh_zeit: String(MIN_SEKUNDEN - 1) }).gruende, ['zu-schnell']);
  assert.equal(pruefeBewerbung({ ...normal, hh_zeit: String(MIN_SEKUNDEN) }).gefiltert, false);
  assert.equal(pruefeBewerbung({ ...normal, hh_zeit: '' }).gefiltert, false);
  assert.equal(pruefeBewerbung({ ...normal, hh_zeit: 'abc' }).gefiltert, false);
  assert.deepEqual(pruefeBewerbung({ ...normal, 'bot-field': 'x' }).gruende, ['honeypot']);
});

test('urteilt nie nach Name, E-Mail oder Text', () => {
  const r = pruefeBewerbung({ ...normal, vorname: 'Fatemeh', nachname: 'Niazi', email: 'niiaziefatemeh@gmail.com', nachricht: 'I live in Essen and would like to apply.' });
  assert.equal(r.gefiltert, false);
});

function verteiler(filter) {
  const calls = { leadTable: 0, hub: 0 };
  const handler = buildDispatcher({
    leadTableEndpoints: { patient: 'https://api-v2.lead-table.com/p', application: 'https://api-v2.lead-table.com/a' },
    leadTableHandler: async () => { calls.leadTable++; return { statusCode: 200, body: JSON.stringify({ ok: true }) }; },
    hubForward: async () => { calls.hub++; return { ok: true, hubLeadId: 'h' }; },
    bewerbungFilter: filter,
  });
  return { handler, calls };
}

test('aussortierte Bewerbungen gehen weder an LeadTable noch an den Hub', async () => {
  const { handler, calls } = verteiler(pruefeBewerbung);
  const meldungen = []; const warn = console.warn; console.warn = (...a) => meldungen.push(a.join(' '));
  let r;
  try { r = await handler({ body: JSON.stringify(einsendung({ ...normal, telefon: '+374 44 819 235' })) }); }
  finally { console.warn = warn; }
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true, filtered: true, gruende: ['auslandsnummer'] });
  assert.deepEqual(calls, { leadTable: 0, hub: 0 });
  // Im Protokoll stehen Kennung und Grund, aber keine Personendaten
  assert.equal(meldungen.length, 1);
  assert.match(meldungen[0], /0123456789abcdef01234567/);
  assert.match(meldungen[0], /auslandsnummer/);
  assert.doesNotMatch(meldungen[0], /Lena|Beispiel|example\.com|374/);
});

test('normale Bewerbungen und andere Formulare laufen weiter wie bisher', async () => {
  const { handler, calls } = verteiler(pruefeBewerbung);
  assert.equal((await handler({ body: JSON.stringify(einsendung(normal)) })).statusCode, 200);
  assert.deepEqual(calls, { leadTable: 1, hub: 1 });
  // Patienten-Formulare werden nie gefiltert, auch nicht mit Auslandsnummer
  const patient = { 'form-name': 'erstgespraech', vorname: 'Max', nachname: 'Mustermann', email: 'max@example.com', telefon: '+31 6 12345678', anliegen: 'Keramikimplantate' };
  const r = await handler({ body: JSON.stringify(einsendung(patient, 'erstgespraech')) });
  assert.equal(JSON.parse(r.body).filtered, undefined);
  assert.deepEqual(calls, { leadTable: 2, hub: 2 });
});

test('ohne Filter (Notschalter) wird alles weitergeleitet', async () => {
  const { handler, calls } = verteiler(null);
  await handler({ body: JSON.stringify(einsendung({ ...normal, telefon: '+374 44 819 235' })) });
  assert.deepEqual(calls, { leadTable: 1, hub: 1 });
});

test('die technischen Felder landen nicht im Hub und nicht im LeadTable', () => {
  const s = parseSubmission(JSON.stringify(einsendung(normal)));
  const hub = buildHubPayload(s, 'k-bew');
  const lt = buildLeadTablePayload(s);
  for (const k of ['hh_js', 'hh_zeit']) {
    assert.equal(hub.felder[k], undefined);
    assert.equal(lt.fields[k], undefined);
  }
  assert.equal(hub.felder.stelle, 'Ausbildung ZFA');
});

test('karriere.html: Formular trägt die Filterfelder und dieselbe Telefonregel wie der Server', () => {
  const html = fs.readFileSync(new URL('../karriere.html', import.meta.url), 'utf8');
  const form = html.split('<form class="k-form" name="bewerbung"')[1].split('</form>')[0];
  // Netlify übernimmt nur Felder, die fest im Markup stehen
  assert.match(form, /<input type="hidden" name="hh_js" value="">/);
  assert.match(form, /<input type="hidden" name="hh_zeit" value="">/);
  assert.match(form, /name="bot-field"/);
  assert.doesNotMatch(html.split('<form class="k-form" name="bewerbung"')[1].split('>')[0], /novalidate/);
  const teile = html.split('/* FILTER:telefonAusland */');
  assert.equal(teile.length, 2, 'Marke FILTER:telefonAusland genau einmal erwartet');
  const quelle = teile[1].split('/* /FILTER */')[0];
  const imBrowser = new Function(quelle + '\nreturn telefonAusland;')();
  for (const n of [...DEUTSCH, ...AUSLAND, undefined, null]) {
    assert.equal(imBrowser(n), telefonAusland(n), `Browser und Server uneins bei "${n}"`);
  }
});
