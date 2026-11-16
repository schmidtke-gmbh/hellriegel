/* Hauke Hellriegel – Landingpage Zahnimplantate (Fassung 3)
   - Bewegung: Einblenden beim Scrollen, Zähler, Erklärbild, weich aufklappende Fragen
   - Praxisvideo lädt erst nach dem Antippen, direkt im Bild (kein Fenster zum Schließen)
   - Leiste unten am Handy erscheint, sobald der Knopf oben aus dem Bild ist
   - Kampagnen-Parameter aus der Adresse an die Links zum Formular hängen
   - Cookie-Hinweis: Meta-Pixel und GA4 erst nach Zustimmung
   Jeder Block prüft, ob sein Element da ist. */
(function () {
  'use strict';

  /* ---------- Einstellungen ---------- */
  var MESSUNG = {
    pixel: '1688834435833525',   // Meta-Pixel der Praxis (derselbe wie auf hellriegel-zahnmedizin.de)
    ga4: 'G-MNT17TNKHM',         // Google Analytics 4 der Praxis
    schluessel: 'hh-einwilligung',
    datenschutz: 'https://hellriegel-zahnmedizin.de/datenschutz.html'
  };
  var FORMULAR = 'termin.html';
  // Erkennt Verweise zum Formular auch dann, wenn der Server sie umschreibt ("termin", "/ordner/termin").
  var ZUM_FORMULAR = /(^|\/)termin(\.html)?([?#]|$)/;

  /* ---------- Ereignisse melden (dataLayer; Pixel und GA4 nur, wenn geladen) ---------- */
  function melden(name, daten) {
    window.dataLayer = window.dataLayer || [];
    var eintrag = { event: name, seite: 'landingpage-keramikimplantate' };
    for (var k in daten) { if (Object.prototype.hasOwnProperty.call(daten, k)) eintrag[k] = daten[k]; }
    window.dataLayer.push(eintrag);
    if (name === 'telefon_klick' && window.fbq) window.fbq('track', 'Contact');
    if (window.gtag && (name === 'cta_click' || name === 'telefon_klick' || name === 'video_start')) window.gtag('event', name, daten);
  }
  window.hhMelden = melden;

  /* ---------- Bewegung ----------
     Die Klasse „anim“ am <html> setzt das kleine Skript im Kopf der Seite, und nur
     dann, wenn der Besucher Bewegung nicht abgestellt hat. Hier wird gemeldet, dass
     das Hauptskript läuft. Bleibt die Meldung aus, nimmt das Kopfskript die Klasse
     nach 3,5 Sekunden wieder weg und alles steht ohne Bewegung da. */
  var wurzel = document.documentElement;
  var bewegt = wurzel.classList.contains('anim') && 'IntersectionObserver' in window;
  window.hhAnimBereit = true;
  if (!bewegt) wurzel.classList.remove('anim');

  /* Zahlen zählen einmal hoch, wenn ihre Kachel eingeblendet wird. Am Ende steht
     wieder genau der Text aus dem HTML. */
  function zaehlen(el, verzug) {
    var ziel = parseFloat(el.getAttribute('data-zahl'));
    var stellen = parseInt(el.getAttribute('data-stellen') || '0', 10);
    var nach = el.getAttribute('data-nach') || '';
    var fertig = el.textContent;
    if (!isFinite(ziel) || !window.requestAnimationFrame) return;
    var dauer = 1100, zuEnde = false;
    var schreiben = function (w) {
      el.textContent = w.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }) + nach;
    };
    var schluss = function () { zuEnde = true; el.textContent = fertig; };
    schreiben(0);
    setTimeout(function () {
      var t0 = null;
      var schritt = function (jetzt) {
        if (zuEnde) return;
        if (t0 === null) t0 = jetzt;
        var p = Math.min((jetzt - t0) / dauer, 1);
        if (p >= 1) { schluss(); return; }
        schreiben(ziel * (1 - Math.pow(1 - p, 3)));
        requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    }, verzug);
    // Sicherung, falls der Browser das Zählen anhält (Seite im Hintergrund)
    setTimeout(schluss, verzug + dauer + 700);
  }

  if (bewegt) {
    var io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (e) {
        var el = e.target;
        // Was schon oberhalb des Bildschirms liegt (Sprung in die Seite, Zurück-Taste),
        // steht sofort da, ohne Bewegung.
        var oberhalb = !e.isIntersecting && e.boundingClientRect.bottom < 0;
        if (!e.isIntersecting && !oberhalb) return;
        io.unobserve(el);
        // Was gleichzeitig ins Bild kommt, erscheint kurz nacheinander.
        var verzug = oberhalb ? 0 : Math.min(n++, 5) * 90;
        if (oberhalb) el.classList.add('ohne');
        el.style.setProperty('--v', verzug + 'ms');
        el.classList.add('ist-da');
        if (!oberhalb) el.querySelectorAll('[data-zahl]').forEach(function (z) { zaehlen(z, verzug + 150); });
        // Danach gehört das Element wieder den normalen Regeln (Überfahren mit der Maus usw.).
        setTimeout(function () {
          el.removeAttribute('data-ein');
          el.classList.remove('ohne');
          el.style.removeProperty('--v');
        }, verzug + 1150);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
    document.querySelectorAll('[data-ein]').forEach(function (el) { io.observe(el); });
  }

  /* ---------- Aufklappen: Fragen und das Nachrichtenfeld öffnen und schließen weich.
     Ohne Bewegung (oder ohne diese Technik im Browser) klappt es wie gewohnt sofort. ---------- */
  if (bewegt) {
    document.querySelectorAll('details.faq-item, details.mehr').forEach(function (d) {
      var kopf = d.querySelector('summary');
      var inhalt = kopf ? kopf.nextElementSibling : null;
      if (!kopf || !inhalt || !inhalt.animate) return;
      var lauf = null;
      var masse = function () {
        var s = window.getComputedStyle(inhalt);
        return { height: inhalt.offsetHeight + 'px', paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, opacity: 1 };
      };
      var zu = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };
      var aufraeumen = function () { inhalt.style.overflow = ''; lauf = null; };
      kopf.addEventListener('click', function (e) {
        e.preventDefault();
        if (lauf) { lauf.onfinish = null; lauf.cancel(); aufraeumen(); }
        if (!d.open) {
          d.open = true;
          inhalt.style.overflow = 'hidden';
          lauf = inhalt.animate([zu, masse()], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
          lauf.onfinish = aufraeumen;
        } else {
          inhalt.style.overflow = 'hidden';
          lauf = inhalt.animate([masse(), zu], { duration: 240, easing: 'ease' });
          lauf.onfinish = function () { d.open = false; aufraeumen(); };
        }
      });
    });
  }

  /* ---------- Praxisvideo: Der Player wird erst beim Antippen geladen und
     spielt dann an Ort und Stelle. Vorher geht keine Anfrage an den Videodienst. ---------- */
  (function () {
    var karte = document.querySelector('[data-video-lib][data-video-id]');
    if (!karte) return;
    function start() {
      if (karte.querySelector('iframe')) return;
      var frame = document.createElement('iframe');
      frame.src = 'https://iframe.mediadelivery.net/embed/' + karte.getAttribute('data-video-lib') + '/' + karte.getAttribute('data-video-id') + '?autoplay=true&loop=false&muted=false&preload=true&responsive=true';
      frame.setAttribute('allow', 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen;');
      frame.setAttribute('allowfullscreen', 'true');
      frame.setAttribute('title', 'Praxisvideo Hauke Hellriegel');
      karte.innerHTML = '';
      karte.appendChild(frame);
      karte.classList.add('laeuft');
      karte.removeAttribute('role');
      karte.removeAttribute('tabindex');
      karte.removeAttribute('aria-label');
      melden('video_start', { video: 'praxisvideo' });
    }
    karte.addEventListener('click', start);
    karte.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
  })();

  /* ---------- Letztes Wort nicht allein in der Zeile lassen ---------- */
  document.querySelectorAll('h1, h2, h3, p, .liste li > div, .faq-item .a').forEach(function (el) {
    if (el.closest('.ck-box, .footer, .funnel-foot, .wiz-consent, .btn')) return;
    if (el.textContent.length > 420) return;
    if (el.clientWidth && el.clientWidth < 210) return; // in schmalen Karten nicht binden
    var last = el.lastChild;
    if (!last || last.nodeType !== 3) return;
    var m = last.nodeValue.match(/^([\s\S]*\S)\s+(\S+)\s*$/);
    if (!m) return;
    if (!/\s/.test(m[1].trim())) return; // nur zwei Wörter insgesamt: Binden bringt nichts
    var prevWord = (m[1].match(/(\S+)$/) || [''])[0];
    // Nur ein kurzes letztes Wort binden. Bei langen Wörtern bricht die Zeile davor sonst zu früh.
    if (m[2].length > 8 || prevWord.length > 11) return;
    last.nodeValue = m[1].replace(/(\S+)$/, '$1 ' + m[2]);
  });

  /* ---------- Leiste unten (Handy): sichtbar, sobald der Knopf im Einstieg
     nach oben aus dem Bild gescrollt ist ---------- */
  var sticky = document.getElementById('stickyCta');
  var anker = document.querySelector('.hero__knopf .btn');
  if (sticky && anker && 'IntersectionObserver' in window) {
    var obenWeg = false, imBild = 0;
    var schalten = function () { sticky.classList.toggle('is-visible', obenWeg && imBild === 0); };
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      obenWeg = !e.isIntersecting && e.boundingClientRect.top < 0;
      schalten();
    }, { threshold: 0 }).observe(anker);
    // Steht weiter unten derselbe Knopf gerade im Bild (Ablauf, Abschluss), braucht es
    // die Leiste nicht doppelt.
    var weitere = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var war = e.target.hhImBild === true;
        if (e.isIntersecting && !war) imBild++;
        if (!e.isIntersecting && war) imBild--;
        e.target.hhImBild = e.isIntersecting;
      });
      schalten();
    }, { threshold: 0.6 });
    document.querySelectorAll('main a.btn').forEach(function (b) { if (b !== anker && ZUM_FORMULAR.test(b.getAttribute('href') || '')) weitere.observe(b); });
  }

  /* ---------- Kampagnen-Parameter (utm_…, fbclid, gclid) an die Formular-Links hängen.
     So weiß das Formular, über welche Anzeige jemand kam, ohne dass etwas
     im Browser gespeichert wird. ---------- */
  (function () {
    var erlaubt = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    var hier = new URLSearchParams(window.location.search);
    var mit = new URLSearchParams();
    erlaubt.forEach(function (k) { var v = hier.get(k); if (v) mit.set(k, v.slice(0, 200)); });
    var anhang = mit.toString();
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || !ZUM_FORMULAR.test(href)) return;
      if (anhang) a.setAttribute('href', href.split(/[?#]/)[0] + '?' + anhang + (href.indexOf('#') > -1 ? href.slice(href.indexOf('#')) : ''));
      a.addEventListener('click', function () {
        var ort = a.closest('section, header, footer, .sticky-cta') || {};
        melden('cta_click', { cta_text: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), cta_ort: ort.id || ort.className || '' });
      });
    });
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      a.addEventListener('click', function () { melden('telefon_klick', {}); });
    });
  })();

  /* ---------- Cookie-Einwilligung, Meta-Pixel und GA4.
     Beides wird erst geladen, wenn jemand zugestimmt hat. Ohne Zustimmung
     geht keine Anfrage an Facebook oder Google raus. ---------- */
  (function () {
    function gespeichert() { try { return localStorage.getItem(MESSUNG.schluessel); } catch (e) { return null; } }
    function speichern(wert) { try { localStorage.setItem(MESSUNG.schluessel, wert); } catch (e) {} }

    function ga4Laden() {
      if (window.gtag || !MESSUNG.ga4) return;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MESSUNG.ga4;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', MESSUNG.ga4, { anonymize_ip: true });
    }
    function pixelLaden() {
      if (window.fbq || !MESSUNG.pixel) return;
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', MESSUNG.pixel);
      window.fbq('track', 'PageView');
    }
    function messungLaden() {
      pixelLaden();
      ga4Laden();
      document.dispatchEvent(new CustomEvent('hh:messung-bereit'));
    }

    var box;
    function bauen() {
      box = document.createElement('div');
      box.className = 'ck-box';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Hinweis zu Cookies');
      box.innerHTML =
        '<div class="ck-titel">Wir verwenden Cookies</div>' +
        // Zwei Fassungen: am Rechner der Text der Praxis-Webseite, am Handy eine kurze,
        // damit der Hinweis den Knopf im Einstieg nicht verdeckt.
        '<p class="ck-text"><span class="ck-lang">Technisch notwendige Cookies brauchen wir, damit die Seite funktioniert. ' +
        'Zusätzlich möchten wir messen, wie unsere Anzeigen wirken. Das passiert nur mit Ihrer Zustimmung. ' +
        'Sie können diese jederzeit über den Punkt „Cookies“ im Fußbereich ändern. Mehr dazu in der </span>' +
        '<span class="ck-kurz">Nur mit Ihrer Zustimmung messen wir, wie unsere Anzeigen wirken. Jederzeit änderbar unter „Cookies“ am Seitenende. Mehr in der </span>' +
        '<a href="' + MESSUNG.datenschutz + '" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
        '<div class="ck-knoepfe">' +
          '<button type="button" class="ck-btn ck-btn-linie" data-wahl="notwendig">Nur notwendige</button>' +
          '<button type="button" class="ck-btn ck-btn-gold" data-wahl="alle">Alle akzeptieren</button>' +
        '</div>';
      document.body.appendChild(box);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-wahl]');
        if (!b) return;
        var wahl = b.getAttribute('data-wahl');
        speichern(wahl);
        zu();
        if (wahl === 'alle') messungLaden();
      });
    }
    function auf() {
      if (!box) bauen();
      requestAnimationFrame(function () { box.classList.add('sichtbar'); });
    }
    function zu() { if (box) box.classList.remove('sichtbar'); }

    var wahl = gespeichert();
    if (wahl === 'alle') {
      messungLaden();
    } else if (wahl !== 'notwendig') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auf);
      else auf();
    }
    /* Über den Fußbereich wieder aufrufbar, damit die Einwilligung widerrufbar bleibt */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-cookie-einstellungen]');
      if (!a) return;
      e.preventDefault();
      auf();
    });
  })();
})();
