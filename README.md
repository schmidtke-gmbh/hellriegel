# Hauke Hellriegel · Biologische Zahnmedizin Essen

Statische Webseite für die Zahnarztpraxis Hauke Hellriegel in Essen-Werden — spezialisiert auf Keramikimplantate, metallfreien Zahnersatz und ganzheitliche Zahnmedizin.

## Stack

- **Reines HTML, CSS und Vanilla JavaScript** — kein Build-Step, kein Framework
- **Google Fonts** (Montserrat) per `<link>` eingebunden
- **SVG-Brand-Mark** inline, SVG-Karte als externe Datei
- Komplett **statisch** — direkt auf GitHub Pages, Netlify, Vercel etc. deploybar

## Struktur

```
/
├── index.html                       Startseite
├── ueber-uns.html                   Über uns / Über Hauke Hellriegel
├── karriere.html                    Karriere mit Bewerbungsformular
├── philosophie.html                 Unsere Philosophie
├── sofortimplantation.html          Sofortimplantation
├── knochenaufbau.html               Knochenaufbau
├── sinuslift.html                   Sinuslift
├── all-in-one.html                  All-in-One Konzept
├── kosten-finanzierung.html         Kosten & BFS-Ratenzahlung
├── zirkonoxid-sds.html              Zirkonoxid & Swiss Dental Solutions
├── faq-implantate.html              FAQ Keramikimplantate (SEO-Seite)
├── metallfreier-zahnersatz.html     Vollkeramik & PEEK
├── ganzheitliche-zahnmedizin.html   Biologische Zahnmedizin
│
├── images/                          Alle Praxis-Fotos und Brand-Visuals
│   ├── logoquer.png                 Hauptlogo (Querformat, transparent)
│   ├── hauke-*.jpg                  Praxis-Fotos
│   ├── praxis-*.png                 Behandlungsräume
│   ├── mega-*.png                   Mega-Menü-Bilder (Higgsfield-generiert)
│   ├── keramik*                     Keramikimplantat-Produktbilder
│   └── yt-thumb-*.jpg               YouTube-Thumbnails
│
└── maps/
    └── essen-bezirke-final.svg      Bezirks-Karte (in CI gestylt, Werden highlighted)
```

## Lokal testen

Einfach `index.html` im Browser öffnen — alle Pfade sind relativ. Für ein realistischeres lokales Setup:

```bash
# Python 3
python3 -m http.server 8000
# Dann: http://localhost:8000

# Oder mit Node
npx serve .
```

## Deployment

### Option 1: GitHub Pages

1. Repository auf GitHub anlegen und Inhalt pushen
2. In `Settings → Pages` als Source `main` Branch, Folder `/` (root) wählen
3. Custom Domain (z.B. `hellriegel-zahnmedizin.de`) in der `CNAME`-Datei eintragen

### Option 2: Netlify / Vercel

- Repository verknüpfen, kein Build-Command nötig, Publish-Directory `/` (root)
- HTTPS, CDN, automatisches Deployment bei jedem Push

### Option 3: Klassisches Webhosting

- Den kompletten Inhalt per FTP / SFTP in das Webroot hochladen

## SEO-Hinweise

Jede Seite hat:
- Title-Tag mit Standort („Essen" / „Essen-Werden")
- Meta-Description (max. 160 Zeichen)
- Open Graph & Twitter Cards
- `link rel="canonical"`
- Schema.org JSON-LD (Dentist, LocalBusiness, FAQPage)

Domain in den SEO-Tags ist als `https://hellriegel-zahnmedizin.de/` voreingestellt — bei abweichendem Hosting in allen HTMLs anpassen.

## Brand & CI

- **Gold**: `#C5A64A` (Akzentfarbe)
- **Anthrazit**: `#1B1F2A` (Primärtext, dunkle Sektionen)
- **Stein**: `#E5E7EB` (heller Hintergrund)
- **Salbei**: `#A8B88A` (Wasser / Bio-Akzent)
- **Schrift**: Montserrat (400 / 500 / 600 / 700 / 800)

## Externe Dienste

- **Google Fonts** — Montserrat
- **Google Maps Link** in der Standort-Sektion (Heckstraße 31D, 45239 Essen)
- **YouTube-Embeds** zu `@biologischerzahnarzt`
- **BFS health finance** als optionaler Finanzierungspartner (auf `kosten-finanzierung.html` erwähnt)

## Bilder & Lizenzen

- **Praxis-Fotos** (`hauke-*.jpg`, `praxis-*.png`): © Hauke Hellriegel, alle Rechte vorbehalten
- **Logo** (`logoquer.png`): © Hauke Hellriegel
- **Mega-Menü-Bilder** (`mega-*.png`, `keramik*.png`): Higgsfield-generiert (Marketing-Studio-Modell)
- **Karte** (`essen-bezirke-final.svg`): basiert auf Wikimedia Commons („Essen subdivisions districts grey.svg", Lizenz: CC-BY-SA), modifiziert mit CI-Override-Styles

## Credits

**Webseite & Marketing**: [Schmidtke GmbH](https://www.schmidtke-gmbh.de)
