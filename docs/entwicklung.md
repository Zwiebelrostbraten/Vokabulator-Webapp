# Entwicklung, Konfiguration und Betrieb

[Zur Übersicht](../README.md) · [Formatdetails](formate.md) · [Datenfluss](daten-und-grenzen.md)

## Architektur und Zuständigkeiten für Maintainer

```text
GitHub Pages ── HTML / JS / CSS ──> Browser
                                    │ vollständigen Text lokal zerlegen
Browser <── Sicherheitsprüfung ──> Cloudflare Turnstile
Browser ── POST /session {token} ──> Cloudflare Worker
                                      │ Siteverify: Token + Secret + Client-IP
                                      └──> Cloudflare ── Prüfergebnis ──> Worker
Browser <── signiertes Ticket ───── Worker
Browser ── GET /lookup?q=Wortform + Bearer-Ticket ──> Worker
Browser <── aufbereiteter Treffer ── Worker <── Wörterbuchdaten ── Navigium
                                      └── einzelne Wortform ─────> Navigium
Browser ── Gruppierung und Export ──> Excel / ODS / CSV / PDF / Brainyoo und Anki
```

| Bereich | Quelle / Konfiguration |
| --- | --- |
| Oberfläche, lokale Verarbeitung, Exporte | `index.html`, `assets/`; Vite bündelt Browser-Abhängigkeiten mit relativer Basis `./` nach `dist/` |
| Öffentliche Laufzeitkonfiguration | `assets/config.mjs`: aktuelle Worker-Basis `https://vokabulator-navigium.ben-vokabulator.workers.dev` und öffentlicher Turnstile-Site-Key |
| Sicherheitsprüfung und Navigium-Proxy | `worker/index.mjs`; feste Siteverify- und Navigium-Endpunkte |
| Worker-Bindings und Limits | `worker/wrangler.toml`; getrennt vom Pages-Build und -Release |
| Geheimnisse | ausschließlich Worker-Secrets `TURNSTILE_SECRET`, `TICKET_HMAC_KEY`; lokal ignorierte `worker/.dev.vars` |
| Prüfungen / Pages-Release | `tests/`, `scripts/check.mjs`, `.github/workflows/pages.yml` |

Die Tabelle beschreibt den Repository-Stand; Dashboard-Einstellungen und produktive Secret-Werte sind damit nicht überprüft. Der Pages-Build veröffentlicht nur `dist/`, einschließlich der gebündelten öffentlichen Frontend-Konfiguration. Worker-Code und Secrets gehören nicht ins Pages-Artefakt.

### Export-Abhängigkeiten und Paketstruktur

- **`@e965/xlsx`** schreibt XLSX und ODS; **`fflate`** bündelt Brainyoo und Anki als ZIP.
- **`sql.js` 1.14.2** erzeugt die Anki-SQLite-Datenbank im Browser. Vite erkennt die statische `new URL(..., import.meta.url)` und legt `sql-wasm.wasm` mit Hash in `dist/assets/` ab. Keine CDN-Laufzeit und kein Backend erforderlich. Die Node-Tests verwenden den Paketresolver von sql.js.
- **`pdfmake` 0.3.11** erzeugt PDFs im Browser; `build/vfs_fonts.js` liefert die eingebetteten Roboto-Schriften als gebündelten JS-Chunk. **`pdfjs-dist` 6.4.299** ist ausschließlich eine Test-Abhängigkeit zum Lesen der erzeugten PDFs.
- Anki: klassisches ZIP-Paket mit **`collection.anki2`** und **`media` = `{}`**. SQLite-Schema v11 enthält `col`, `notes`, `cards`, `revlog`, `graves` und die Standardindizes. `col` enthält Notiztyp, Stapel und Lernkonfiguration als JSON; Notizfelder sind mit U+001F getrennt. Kartenvorlage und Feldreihenfolge stimmen überein, neue Karten haben `type=queue=0`. Die Prüfsumme ist der erste 32-Bit-Wert des SHA-1 über die HTML-bereinigte Vorderseite. SQL nutzt gebundene Parameter. Siehe [genankis Paketstruktur und Schema](https://github.com/kerrickstaley/genanki/tree/main/genanki); das Schema samt Standardkonfiguration in `assets/anki-schema.mjs` basiert darauf (MIT).

Die Exporttests prüfen ODS-Manifest/MIME und Werte beim Wiedereinlesen, exakte CSV-Bytes und Zellwerte, exakte PDF-Tabellen im Excel-Layout, wiederholte Köpfe, Seitenzahl, extrahierten Unicode-Text und Textgrenzen sowie die Anki-Datenbank einschließlich `integrity_check`, Beziehungen, Feldanzahl, Vorlagen und Prüfsumme. Der Buildtest verlangt WASM und Schrift-Chunks im Artefakt. Chromium lädt alle Formate tatsächlich herunter und prüft den Betrieb unter einem Projektpfad, mobile Darstellung und axe. Eine vollständige manuelle Prüfung aller Anki-/Brainyoo-Desktop- und Mobilversionen ist damit nicht abgedeckt.

### Sicherheitskontrollen

`POST /session` validiert Turnstile einmal pro Lauf: Erfolg, passender Hostname und Action `vocabulary` sind erforderlich. Die folgenden Lookups verwenden dasselbe HMAC-SHA-256-signierte Ticket (zehn Minuten, IP-/Origin-Bindung), keine erneute Tokenprüfung je Wort. Es gibt keine serverseitige Sessiondatenbank. Tickets sind signiert, nicht verschlüsselt; eine HMAC-Key-Rotation macht bestehende Tickets ungültig. Siehe [Cloudflares serverseitige Turnstile-Validierung](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

CORS erlaubt exakt `https://zwiebelrostbraten.github.io` sowie HTTP/HTTPS auf `localhost`, `127.0.0.1` und `[::1]` mit optionalem Port. CORS ist keine Authentifizierung. Native Rate-Bindings begrenzen Sessions auf **3**, Lookups auf **128 je IP und 60 Sekunden**, auch Lookups mit ungültigem Ticket. [Cloudflares Rate-Limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) sind standortbezogen und keine exakte globale Quote. Fehlende Secrets, ein HMAC-Key unter 32 Zeichen, fehlende Client-IP oder unbrauchbare Bindings sperren Anfragen mit 503; es gibt keinen Produktions-Bypass.

Wortvalidierung, begrenzte Eingabe-/Antwortgrößen, feste Upstream-Ziele und Zeitlimits begrenzen die Proxy-Nutzung. Weiterleitungen werden nicht verfolgt; Worker-Antworten tragen `Cache-Control: no-store`. Bei 401/429/503 stoppt der Browser weitere wartende Lookups. Der Worker enthält keine Vokabeldatenbank oder bewusst geschriebenen Inhaltslogs; die eingecheckte Konfiguration deaktiviert Observability. Das ersetzt keine Prüfung der Infrastrukturregeln der Anbieter.

### Eine neue Installation konfigurieren

Die folgenden Schritte sind eine Anleitung für eine spätere Einrichtung, kein Bericht über ein durchgeführtes Deployment:

1. Ein Cloudflare-Turnstile-Widget für den eigenen Pages-Hostname erstellen (Hostname ohne Protokoll oder Pfad; keine pauschale Hostfreigabe). Öffentlichen Site-Key in `assets/config.mjs` setzen. Das Secret bleibt ausschließlich beim Worker.
2. In einer eigenen Worker-Konfiguration Name/Account und zwei verschiedene, im Account nicht anderweitig verwendete numerische Rate-Limit-Namespace-IDs wählen. `1001`/`1002` sind im Repository als zu ersetzende Einrichtungswerte markiert. Die Binding-Namen müssen zum Code passen; diese Bindings sind keine KV-Datenbanken.
3. Worker bereitstellen und Secrets setzen, etwa interaktiv mit den folgenden Befehlen. `TICKET_HMAC_KEY` unabhängig zufällig erzeugen (z. B. 32 zufällige Bytes als 64 Hex-Zeichen). Bis zur vollständigen Konfiguration antwortet der Dienst mit 503.

   ```sh
   npx wrangler login
   npx wrangler deploy --config worker/wrangler.toml
   npx wrangler secret put TURNSTILE_SECRET --config worker/wrangler.toml
   npx wrangler secret put TICKET_HMAC_KEY --config worker/wrangler.toml
   ```

4. Die eigene Worker-URL in `assets/config.mjs` setzen. Bei anderem Hosting-Origin die Allowlist im Worker bewusst anpassen; ein Projektpfad gehört nicht zum Origin. Turnstile-Hostname muss dazu passen. Keine Secrets in Git, HTML, Frontend-Konfiguration oder Build-Variablen übernehmen.
5. GitHub Pages auf **GitHub Actions** einstellen und nach den untenstehenden Prüfungen den Pages-Release auslösen. Worker-Releases sind separat; der Pages-Workflow deployt keinen Worker.

### Lokal entwickeln

Node gemäß `package.json`: `^22.22.2 || ^24.15.0 || >=26.0.0`.

```sh
npm ci
npm run dev
# Produktionsbuild lokal ansehen:
npm run build
npm run preview
```

Die Serveradresse steht im Terminal. Mit unveränderter Frontend-Konfiguration werden der produktive Worker und das produktive Widget angesprochen; für isolierte Arbeit öffentliche Dev-Konfiguration verwenden. Für einen lokalen Worker die Frontend-Basis auf `http://localhost:8787` setzen, ein passendes Dev-Widget wählen und dessen Secret sowie einen lokalen HMAC-Key in `worker/.dev.vars` halten. Start: `npx wrangler dev --config worker/wrangler.toml --local`. Lokale Konfigurationsänderungen vor einem Release prüfen und zurücksetzen.

Wrangler simuliert die Rate-Bindings lokal. Fehlt `CF-Connecting-IP`, bleibt auch lokal der Zugriff gesperrt (503). [Offizielle Turnstile-Test-Keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) können eine andere Action als `vocabulary` liefern und dann an der strikten Prüfung scheitern. Für einen manuellen vollständigen Ablauf ein separates echtes Dev-Widget mit passendem Hostname verwenden. Automatisierte Tests simulieren externe Dienste und Secrets; der workerd-Test setzt die IP in einem temporären Test-Adapter. Sicherheitsprüfungen im Produktionscode dafür nicht lockern.

### Tests, CI und Release

```sh
npm test
npm run test:browser
npm run lint
npm run check
npm run build
git diff --check
```

Vor dem ersten Browsertest: `npx playwright install --with-deps chromium`; alternativ `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absoluter/pfad/chromium npm run test:browser`. `npm test` prüft Verarbeitung, Exporte, DOM, Worker-Sicherheit, Produktionsbuild und lokale workerd-Runtime; der explizite Chromium-Test wird dabei übersprungen. `npm run test:browser` prüft den Build unter einem Projektpfad, manuelle Downloads, mobile Darstellung, axe-Barrierefreiheit und Token-/Ticket-Austausch mit simulierten Diensten. Er baut mit öffentlicher Testkonfiguration in ein temporäres Verzeichnis und verlangt einen verfügbaren Browser. Lint prüft ESLint-Regeln, `check` die JavaScript-Syntax.

**Exakter CI-Pfad:** Push auf `main` → Checkout → Node 22 → `npm ci` → Chromium samt Systemabhängigkeiten installieren → `npm test` → `npm run test:browser` → `npm run lint` → `npm run check` → `npm run build` → `dist/` als Pages-Artefakt hochladen → separater abhängiger Job mit `actions/deploy-pages`. `git diff --check` ist eine zusätzliche lokale Prüfung. Es gibt keinen manuellen Workflow-Trigger in der aktuellen Datei; ein Push auf `main` veröffentlicht nach erfolgreichen Prüfungen automatisch.

### Produktionsprüfung und Fehlersuche

Nach einem separat autorisierten Release auf dem echten Pages-Origin prüfen:

- Oberfläche und Assets laden unter dem Projektpfad; öffentliche Worker-URL und Site-Key stimmen.
- Kleiner Mehrwortlauf: Turnstile erst nach Start, ein erfolgreicher `/session`-Austausch, anschließend einzelne `/lookup`-Anfragen mit demselben Ticket. Kein Request enthält den vollständigen Text.
- Keine Datei wird automatisch heruntergeladen; Alle Formatbuttons funktionieren, Brainyoo-/Anki-Buttons sind bei gültigem Namen verfügbar. Dateien öffnen und Kartenimporte separat prüfen.
- Fehlendes Ticket und fremder Origin werden abgelehnt; Bindings, Secrets, Widget-Hostname und Observability im Betreiberkonto kontrollieren. Keine Live-Massenabfragen zum Testen von Limits auslösen.

| Symptom | Prüfung / Abhilfe |
| --- | --- |
| Fehlende API-/Widget-Konfiguration | `assets/config.mjs` und tatsächlich ausgelieferten Build prüfen; lokale Änderungen allein ändern Pages nicht. |
| 403 bei `/session` | Origin-Allowlist, Widget-Hostname, Site-Key/Secret-Zuordnung und Action `vocabulary` prüfen. |
| 401 bei `/lookup` | Ticket, Ablauf oder IP-Wechsel; neuen Lauf starten. |
| 429 | Eine Minute warten, große Texte aufteilen; gemeinsame IP und beide Rate-Bindings berücksichtigen. |
| 503 | Secrets, Mindestlänge des HMAC-Keys, beide Rate-Bindings und `CF-Connecting-IP` prüfen; auch Siteverify-Ausfälle sind möglich. |
| 400 / 404 / 405 | Einzelne gültige Wortform, Basis-URL ohne zusätzlichen Pfad und richtige Methode prüfen: `POST /session`, `GET /lookup`. |
| 502 / einzelne unbekannte Wörter | Navigium-Verfügbarkeit, Antwortformat und Zeitlimit prüfen; Protokoll auswerten. |
| Browsertest startet nicht | Chromium installieren oder ausführbaren Pfad setzen; externe Dienste werden hier simuliert. |

Projektlizenz: [MIT](../LICENSE). Historischer Ausgangspunkt: [Vokabulator in Python](https://github.com/Zwiebelrostbraten/Vokabulator).
