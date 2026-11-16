// Sortiert Bewerbungen aus, die erkennbar aus dem Ausland oder von einem Programm kommen.
//
// Aussortiert heißt: Die Einsendung wird NICHT an LeadTable und den Kunden-Hub
// weitergeleitet. In Netlify bleibt sie unter Forms → bewerbung erhalten,
// es geht also nichts verloren. Im Funktionsprotokoll stehen Kennung und Grund.
//
// Regeln (jede reicht für sich):
//   auslandsnummer  Telefonnummer mit ausländischer Ländervorwahl (+374 …, 0090 …)
//   ohne-browser    kein Zeichen des Formular-Skripts UND nicht von unserer Seite aus
//                   abgeschickt, oder ein Programm als Absender (curl, python …)
//   zu-schnell      in unter 3 Sekunden ausgefüllt
//   honeypot        das unsichtbare Feld ist ausgefüllt
//
// Bewusst NICHT gefiltert wird nach Namen, E-Mail-Adresse oder dem Text der Bewerbung.
// Ausschalten ohne neue Veröffentlichung: in Netlify die Umgebungsvariable
// BEWERBUNG_FILTER=aus setzen.

const EIGENE_SEITE = /^https?:\/\/([a-z0-9-]+\.)*(hellriegel-zahnmedizin\.de|netlify\.app)(\/|$)/i;
const PROGRAMM = /(python|curl|wget|libwww|httpclient|go-http|okhttp|java\/|node-fetch|axios|postman|scrapy|headless|phantomjs|spider|crawler)/i;
export const MIN_SEKUNDEN = 3;

const text = (v) => (v === undefined || v === null ? '' : String(v).trim());

// true = eindeutig ausländische Vorwahl. Nummern ohne Ländervorwahl (0201 …, 0151 …)
// und leere Felder gelten nicht als Ausland. Dieselbe Funktion steht in karriere.html;
// ein Test hält beide gleich.
export function telefonAusland(wert) {
  const t = text(wert).replace(/[\s\-\/().]/g, '');
  if (t.indexOf('+') === 0) return t.indexOf('+49') !== 0;
  if (t.indexOf('00') === 0) return t.indexOf('0049') !== 0;
  return false;
}

export function pruefeBewerbung(data = {}) {
  const gruende = [];
  if (text(data['bot-field'])) gruende.push('honeypot');
  if (telefonAusland(data.telefon)) gruende.push('auslandsnummer');

  if (text(data.hh_js) === '1') {
    const roh = text(data.hh_zeit);
    if (roh !== '' && Number.isFinite(Number(roh)) && Number(roh) < MIN_SEKUNDEN) gruende.push('zu-schnell');
  } else {
    // Ohne Skript-Zeichen: Das kann ein Browser ohne JavaScript sein (dann kommt die
    // Einsendung trotzdem von unserer Seite) oder ein Programm, das die Formularadresse
    // direkt aufruft. Liefert Netlify gar keine Herkunft mit, wird nicht geurteilt.
    const herkunftBekannt = Object.hasOwn(data, 'referrer');
    const vonUnsererSeite = EIGENE_SEITE.test(text(data.referrer));
    if (PROGRAMM.test(text(data.user_agent)) || (herkunftBekannt && !vonUnsererSeite)) gruende.push('ohne-browser');
  }
  return { gefiltert: gruende.length > 0, gruende };
}
