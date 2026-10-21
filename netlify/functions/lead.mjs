// Nimmt das Telefon-Formular entgegen und legt den Lead im Kunden-Hub
// (hub.schmidtke-gmbh.de) an. Der geheime Schlüssel bleibt hier auf dem
// Server und taucht nie im Browser auf.
//
// Benötigte Umgebungsvariablen in Netlify (Site configuration → Environment variables):
//   HUB_PORTAL_KEY   x-portal-key aus dem Hub (Kunde Hellriegel → Einstellungen → Lead-Eingang)
//   HUB_KAMPAGNE_ID  ID der Kampagne im Hub (Reiter „Kampagnen“)
// Optional:
//   HUB_ENDPOINT     überschreibt die Adresse des Lead-Eingangs

const STANDARD_ENDPOINT =
  "https://wjxtqadtknafadfexjas.supabase.co/functions/v1/lead-eingang";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

function terminLesbar(wert) {
  // "2026-10-28T14:30" → "28.10.2026, 14:30 Uhr"
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(wert);
  if (!m) return wert;
  const datum = `${m[3]}.${m[2]}.${m[1]}`;
  return m[4] ? `${datum}, ${m[4]}:${m[5]} Uhr` : datum;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Nur POST erlaubt" });

  const key = process.env.HUB_PORTAL_KEY;
  const kampagne = process.env.HUB_KAMPAGNE_ID;
  if (!key || !kampagne) {
    return json(500, { error: "Hub-Verbindung ist noch nicht eingerichtet" });
  }

  let d;
  try {
    d = await req.json();
  } catch {
    return json(400, { error: "Ungültige Daten" });
  }

  // Honeypot: Bots füllen das versteckte Feld aus. Still verwerfen.
  if (text(d.firma)) return json(200, { ok: true });

  const vorname = text(d.vorname, 100);
  const nachname = text(d.nachname, 100);
  const telefon = text(d.telefon, 40);
  const email = text(d.email, 200);
  const interesse = text(d.interesse);
  const aufmerksam = text(d.aufmerksam, 100);
  const termin = text(d.termindatum, 20);

  if (!vorname || !nachname || !interesse || !aufmerksam) {
    return json(400, { error: "Pflichtfelder fehlen" });
  }
  if (telefon.replace(/\D/g, "").length < 6) {
    return json(400, { error: "Telefonnummer ist unvollständig" });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json(400, { error: "E-Mail-Adresse ist ungültig" });
  }

  const payload = {
    kampagne,
    name: `${vorname} ${nachname}`,
    email,
    telefon,
    felder: {
      interesse_an: interesse,
      termindatum: termin ? terminLesbar(termin) : "",
      aufmerksam_geworden: aufmerksam,
      quelle: "Telefon-Formular (hellriegel-zahnmedizin.de)",
    },
  };

  let antwort;
  try {
    antwort = await fetch(process.env.HUB_ENDPOINT || STANDARD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-portal-key": key },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Hub nicht erreichbar", e);
    return json(502, { error: "Kunden-Hub ist nicht erreichbar" });
  }

  const ergebnis = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    console.error("Hub-Fehler", antwort.status, ergebnis);
    return json(502, {
      error: `Kunden-Hub meldet Fehler ${antwort.status}${ergebnis.error ? ": " + ergebnis.error : ""}`,
    });
  }

  return json(200, { ok: true, id: ergebnis.id ?? null });
};

export const config = { path: "/api/lead" };
