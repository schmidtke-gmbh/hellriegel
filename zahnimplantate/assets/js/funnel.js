/* Hauke Hellriegel – Formular „Erstgespräch anfragen“ (termin.html), Fassung 2
   Zwei Schritte: 1. Wie dringend? 2. Kontaktdaten. Versand über Netlify Forms,
   danach Bestätigung auf derselben Seite.
   Optional: Kalenderschritt als Pflicht nach dem Versand (siehe KALENDER_URL). */
(function () {
  'use strict';

  /* ---------- Einstellungen (nur hier ändern) ---------- */
  // Kalender für den Telefontermin, z. B. 'https://calendly.com/<konto>/15min'.
  // Leer lassen = kein Kalender. Dann ruft das Team innerhalb von 24–48 Stunden zurück,
  // so wie es die Praxis heute macht.
  var KALENDER_URL = '';
  // Optional: Seite, auf die nach dem Abschluss weitergeleitet wird (wenn Conversions
  // über einen Seitenaufruf gezählt werden sollen). Leer = Bestätigung auf dieser Seite.
  var DANKE_URL = '';
  var DANKE_VERZOEGERUNG = 2500;
  var FUNNEL = 'keramikimplantate';
  var KALENDER_HERKUNFT = 'https://calendly.com';

  var form = document.getElementById('wizForm');
  if (!form) return;

  var panels = form.querySelectorAll('.wiz-panel');
  var bar = document.getElementById('wizBar');
  var schrittText = document.getElementById('wizSchritt');
  var btnBack = document.getElementById('wizBack');
  var btnNext = document.getElementById('wizNext');
  var btnSubmit = document.getElementById('wizSubmit');
  var errEl = document.getElementById('wizError');
  var success = document.getElementById('wizSuccess');
  var kalender = document.getElementById('kalender');
  var total = panels.length;
  var idx = 0;
  var laeuft = false;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NAMEN = ['zeitraum', 'kontakt'];

  function melden(name, daten) {
    window.dataLayer = window.dataLayer || [];
    var eintrag = { event: name, funnel: FUNNEL };
    for (var k in daten) { if (Object.prototype.hasOwnProperty.call(daten, k)) eintrag[k] = daten[k]; }
    window.dataLayer.push(eintrag);
  }

  /* ---------- Kampagnen-Parameter aus der Adresse in die versteckten Felder ---------- */
  (function () {
    var q = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      var feld = form.elements[k];
      var v = q.get(k);
      if (feld && v) feld.value = v.slice(0, 200);
    });
  })();

  /* ---------- Mit Kalender heißt der letzte Knopf anders ---------- */
  if (KALENDER_URL) {
    btnSubmit.textContent = 'Absenden & Termin wählen';
    var danach = document.getElementById('danachInfo');
    if (danach) danach.innerHTML = '<li>Nach dem Absenden <b>wählen Sie direkt Ihren Telefontermin</b> im Kalender.</li><li>Jemand aus unserem Team ruft Sie zur gewählten Zeit an (kostenfrei, ca.&nbsp;15&nbsp;Minuten).</li><li><b>Beratung bei Hauke Hellriegel</b> in der Praxis (ca.&nbsp;60&nbsp;Minuten, Privatleistung).</li>';
  }

  /* ---------- Schritt anzeigen ---------- */
  function nachOben() {
    // An den Anfang der Formularkarte (oder dessen, was sie ersetzt hat) rollen,
    // aber nur, wenn dieser Anfang gerade nicht im Bild ist.
    var ziel = form.style.display === 'none' ? (kalender && kalender.classList.contains('show') ? kalender : success) : form;
    var kopf = document.querySelector('.header');
    var haftet = kopf && window.getComputedStyle(kopf).position === 'sticky';
    var versatz = (haftet ? kopf.getBoundingClientRect().height : 0) + 12;
    var oben = ziel.getBoundingClientRect().top;
    if (oben >= versatz && oben < window.innerHeight * 0.4) return;
    window.scrollTo({ top: Math.max(0, oben + window.scrollY - versatz), behavior: reduce ? 'auto' : 'smooth' });
  }

  function show(i, vonNutzer) {
    idx = i;
    panels.forEach(function (p, pi) { p.classList.toggle('active', pi === i); });
    bar.style.width = ((i + 1) / total * 100) + '%';
    if (schrittText) schrittText.textContent = 'Schritt ' + (i + 1) + ' von ' + total;
    btnBack.disabled = (i === 0);
    var letzter = (i === total - 1);
    btnNext.style.display = letzter ? 'none' : '';
    btnSubmit.style.display = letzter ? '' : 'none';
    errEl.classList.remove('show');
    if (vonNutzer) {
      nachOben();
      var h = panels[i].querySelector('h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    melden('funnel_step', { schritt: i + 1, schritt_name: NAMEN[i] || '' });
  }

  /* ---------- Prüfen ---------- */
  function fehler(el, an) { if (el) el.classList.toggle('has-error', !!an); }

  function pruefen(i) {
    var panel = panels[i];
    var ok = true;
    var erstes = null;

    var pflicht = panel.getAttribute('data-pflicht');
    if (pflicht) {
      var gewaehlt = form.querySelector('input[name="' + pflicht + '"]:checked');
      fehler(panel, !gewaehlt);
      if (!gewaehlt) { ok = false; erstes = panel.querySelector('input[type="radio"]'); }
    }

    panel.querySelectorAll('.wiz-field input[required]').forEach(function (f) {
      var v = f.value.trim();
      var gut = v.length > 0;
      if (gut && f.type === 'email') gut = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      if (gut && f.type === 'tel') gut = v.replace(/\D/g, '').length >= 6;
      fehler(f.closest('.wiz-field'), !gut);
      if (!gut) { ok = false; if (!erstes) erstes = f; }
    });

    var consent = panel.querySelector('input[name="consent"]');
    if (consent) {
      fehler(consent.closest('.wiz-consent-wrap'), !consent.checked);
      if (!consent.checked) { ok = false; if (!erstes) erstes = consent; }
    }

    if (!ok && erstes) {
      erstes.focus({ preventScroll: true });
      var r = (erstes.closest('.wiz-field, .wiz-consent-wrap, .wiz-panel') || erstes).getBoundingClientRect();
      if (r.top < 20 || r.bottom > window.innerHeight - 20) {
        window.scrollTo({ top: Math.max(0, r.top + window.scrollY - 90), behavior: reduce ? 'auto' : 'smooth' });
      }
    }
    return ok;
  }

  /* Fehlermarkierung sofort zurücknehmen, sobald jemand korrigiert.
     Ohne das bleibt ein Feld rot, obwohl es längst stimmt. */
  function entwarnen(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var feld = t.closest('.wiz-field');
    if (feld) feld.classList.remove('has-error');
    var cw = t.closest('.wiz-consent-wrap');
    if (cw && t.checked) cw.classList.remove('has-error');
    if (t.type === 'radio') { var p = t.closest('.wiz-panel'); if (p) p.classList.remove('has-error'); }
    errEl.classList.remove('show');
  }
  form.addEventListener('input', entwarnen);
  form.addEventListener('change', entwarnen);

  /* ---------- Vor und zurück ---------- */
  function weiter() {
    if (idx >= total - 1) return;
    if (!pruefen(idx)) return;
    show(idx + 1, true);
  }
  btnNext.addEventListener('click', weiter);
  btnBack.addEventListener('click', function () { if (idx > 0) show(idx - 1, true); });

  /* Die Auswahlfrage geht nach dem Antippen von selbst weiter, damit niemand den Knopf
     „Weiter“ suchen muss. Nur bei Maus oder Finger: Der Klick landet dann auf der
     Beschriftung. Wer mit den Pfeiltasten wählt, löst den Klick direkt am (unsichtbaren)
     Auswahlfeld aus und soll nicht weggeschoben werden. Zurück geht es immer über „Zurück“. */
  var autoTimer = null;
  form.querySelectorAll('.wiz-panel[data-pflicht] .wiz-radio').forEach(function (label) {
    var r = label.querySelector('input[type="radio"]');
    label.addEventListener('click', function (e) {
      if (e.target === r) return;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () {
        if (r.checked && panels[idx].contains(r)) weiter();
      }, 450);
    });
  });

  /* ---------- Absenden ---------- */
  function istTestumgebung() {
    var h = window.location.hostname;
    return window.location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '::1' || /\.local$/.test(h);
  }

  function wert(name) {
    var feld = form.elements[name];
    return feld && typeof feld.value === 'string' ? feld.value : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (idx < total - 1) { weiter(); return; }   // Eingabetaste in einem früheren Schritt
    if (!pruefen(idx)) return;
    if (laeuft) return;
    laeuft = true;
    errEl.classList.remove('show');
    var beschriftung = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Wird gesendet …';

    var daten = new URLSearchParams(new FormData(form)).toString();
    var senden;
    if (istTestumgebung()) {
      // Netlify Forms gibt es nur auf der veröffentlichten Seite.
      console.info('[Funnel] Testumgebung erkannt – Übermittlung übersprungen. Auf der veröffentlichten Seite geht die Anfrage an Netlify.');
      senden = new Promise(function (ok) { setTimeout(ok, 350); });
    } else {
      senden = fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: daten })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); });
    }

    senden.then(function () {
      melden('lead_submitted', { anliegen: wert('anliegen'), dringlichkeit: wert('dringlichkeit') });
      if (window.fbq) window.fbq('track', 'Lead');
      if (window.gtag) window.gtag('event', 'generate_lead', { funnel: FUNNEL });
      abgeschickt();
    }).catch(function (err) {
      // Die Anfrage bleibt stehen, damit nichts verloren geht. Der Grund steht in der Konsole.
      console.error('[Funnel] Übermittlung fehlgeschlagen:', err && err.message ? err.message : err);
      melden('lead_submit_failed', { grund: String(err && err.message ? err.message : err).slice(0, 80) });
      laeuft = false;
      btnSubmit.disabled = false;
      btnSubmit.textContent = beschriftung;
      errEl.classList.add('show');
    });
  });

  function abgeschickt() {
    form.style.display = 'none';
    var k = document.getElementById('funnelKopf'); if (k) k.style.display = 'none';
    var u = document.getElementById('unterForm');
    if (KALENDER_URL && kalender) {
      if (u) u.style.display = 'none';   // nichts soll vom Kalender ablenken
      kalenderZeigen();
    } else {
      // Die drei Schritte „So geht es danach weiter“ bleiben unter der Bestätigung stehen.
      var zl = document.getElementById('zurueckLink'); if (zl) zl.style.display = 'none';
      success.classList.add('show');
      weiterleiten();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    var titel = document.getElementById(KALENDER_URL ? 'kalSatz' : 'successTitel');
    if (titel) { titel.setAttribute('tabindex', '-1'); titel.focus({ preventScroll: true }); }
  }

  function weiterleiten() {
    if (!DANKE_URL) return;
    setTimeout(function () { window.location.href = DANKE_URL; }, DANKE_VERZOEGERUNG);
  }

  /* ---------- Kalenderschritt (nur mit KALENDER_URL) ---------- */
  function kalenderZeigen() {
    var vor = form.elements.vorname.value.trim();
    var nach = form.elements.nachname.value.trim();
    var mail = form.elements.email.value.trim();
    var tel = form.elements.telefon.value.trim();
    var satz = document.getElementById('kalSatz');
    var telEl = document.getElementById('kalTel');
    // Persönlich ansprechen und die Nummer zurückspiegeln. Kein „Anfrage gesendet“:
    // jede Bestätigung an dieser Stelle liest sich wie ein Abschluss und kostet Buchungen.
    if (satz) satz.textContent = (vor ? vor + ', bitte' : 'Bitte') + ' wählen Sie jetzt Ihren Telefontermin.';
    if (telEl) telEl.textContent = tel ? ' unter ' + tel : '';
    kalender.classList.add('show');
    melden('funnel_step', { schritt: total + 1, schritt_name: 'kalender' });

    var wrap = document.getElementById('kalenderWrap');
    var ausweich = function () {
      wrap.innerHTML = '<div class="kalender-fallback">Der Kalender konnte nicht geladen werden.<br><a class="btn" href="' + KALENDER_URL + '" target="_blank" rel="noopener">Kalender in neuem Fenster öffnen</a><br>Oder schreiben Sie uns: <a href="mailto:info@hellriegel-zahnmedizin.de"><strong>info@hellriegel-zahnmedizin.de</strong></a></div>';
    };
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://assets.calendly.com/assets/external/widget.css';
    document.head.appendChild(css);
    var s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    s.onerror = ausweich;
    s.onload = function () {
      if (!window.Calendly) { ausweich(); return; }
      var q = new URLSearchParams(window.location.search);
      window.Calendly.initInlineWidget({
        url: KALENDER_URL + (KALENDER_URL.indexOf('?') > -1 ? '&' : '?') + 'hide_gdpr_banner=1&primary_color=9a7e30',
        parentElement: wrap,
        // Die Telefonnummer geht als a1 in die ERSTE Zusatzfrage des Kalendereintrags.
        // Gibt es diese Frage im Kalender-Konto nicht, verfällt der Wert stillschweigend.
        prefill: { name: (vor + ' ' + nach).trim(), email: mail, customAnswers: { a1: tel } },
        utm: { utmSource: q.get('utm_source') || '', utmMedium: q.get('utm_medium') || '', utmCampaign: q.get('utm_campaign') || '', utmContent: q.get('utm_content') || '' }
      });
    };
    document.head.appendChild(s);
  }

  window.addEventListener('message', function (e) {
    if (!KALENDER_URL || e.origin !== KALENDER_HERKUNFT) return;
    if (!e.data || e.data.event !== 'calendly.event_scheduled') return;
    if (kalender.classList.contains('is-booked')) return;
    kalender.classList.add('is-booked');
    var t = document.getElementById('successTitel');
    var x = document.getElementById('successText');
    if (t) t.textContent = 'Ihr Telefontermin ist gebucht.';
    if (x) x.innerHTML = 'Vielen Dank. Jemand aus unserem Team ruft Sie zur gewählten Zeit an. Die Bestätigung kommt per E-Mail. Danach bekommen Sie per Link unseren Gesundheitsfragebogen. Bitte füllen Sie ihn vollständig aus und unterschreiben Sie an den drei markierten Stellen.';
    var u2 = document.getElementById('unterForm'); if (u2) u2.style.display = 'none';
    success.classList.add('show');
    melden('call_booked', {});
    if (window.fbq) window.fbq('track', 'Schedule');
    if (window.gtag) window.gtag('event', 'call_booked', { funnel: FUNNEL });
    window.scrollTo({ top: 0, behavior: 'auto' });
    weiterleiten();
  });

  show(0, false);
})();
