# Vokabulator im Browser

Statische deutsche Web-App nach dem Python-Original in `upstream/main` (README, `vokabel_gui.py`, `navigium_mit_Textbelgen.py` und `export_to_Brainyoo.py`). Sie erzeugt aus lateinischen Texten nach Wortarten gegliederte Vokabellisten mit Navigium-Daten. Eine Anmeldung ist nicht nötig.

## Benutzung

1. Lateinischen Text einfügen.
2. Parallele Navigium-Anfragen einstellen: **1–128, Standard 64**. Bei Verbindungsproblemen eine kleinere Zahl wählen.
3. Wortarten auswählen oder „Alle auswählen“ verwenden: Nomen, Verben, Adjektive, Pronomen, Präpositionen, Adverbien, Konjunktionen, Subjunktionen, Unbekannt. Wie in der ursprünglichen GUI sind Nomen, Verben und Adjektive zunächst aktiviert.
4. **1–3 Bedeutungen** auswählen (Standard 1). Optional Brainyoo aktivieren und einen Lektionsnamen eingeben.
5. „Vokabeln generieren“ starten und gegebenenfalls die Turnstile-Sicherheitsprüfung abschließen. Fortschritt, Status und aufklappbares Protokoll zeigen Treffer, fehlende Wörter und Fehler. Abbrechen erhält die vorherigen Ergebnisse. Ein erfolgreich abgeschlossener neuer Lauf ersetzt die Liste.
6. Ergebnisse im Textzusammenhang prüfen, alle Grammatik-, Bedeutungs- und Textbelegfelder bei Bedarf bearbeiten oder Vokabeln entfernen.
7. **Excel (.xlsx)** und optional **Brainyoo (.by2)** herunterladen. Die Exporte verwenden die bearbeiteten Werte und sortieren je Wortart.

## Nähe zum Original und Browser-Anpassungen

Pro verschiedener, kleingeschriebener Wortform wird einmal je Lauf der erste brauchbare Navigium-Eintrag nachgeschlagen. Innerhalb einer Wortart werden gleiche Lemmata zusammengeführt; unterschiedliche Textformen bleiben als eindeutige Textbelege erhalten. Ausgabe und Exporte sind nach dem ersten Grammatikfeld alphabetisch sortiert. Unicode-Buchstaben, Makrons und kombinierende Zeichen bleiben erhalten; Satzzeichen und Zahlen trennen Wörter. Das vermeidet das Zusammenkleben benachbarter Wörter durch die ursprüngliche Python-Satzzeichenentfernung.

Die Flexionen liefern, soweit vorhanden:

- **Nomen:** Nominativ, Genitiv, Genus und Deklinationsklasse; Pluralformen als Rückfall, i-/gemischte/kons. dritte Deklination.
- **Verben:** Infinitiv, erste Person Präsens und Perfekt, PPP und Konjugation; Deponentien verwenden DEP-Formen und werden als solche gekennzeichnet. Die Spaltenbezeichnungen entsprechen dem Original, auch dessen „Akt.“-Bezeichnung bei Deponentien.
- **Adjektive:** Nominativ und Genitiv für m./f./n., Klasse, Rückfall auf Plural, Komparativ oder Superlativ.
- **Pronomen:** entsprechende Geschlechtsformen oder substantivische Nominativ-/Genitivformen.
- **Präpositionen:** Form und Begleitkasus aus Bedeutungsangaben; einfache Wortarten: Form und Bedeutungen.

Fehlende Angaben werden mit `-` angezeigt; nicht gefundene Wörter und fehlgeschlagene Abfragen bleiben unter „Unbekannt“ prüfbar, wenn diese Wortart gewählt ist. Grammatik ist eine regelbasierte Ableitung, keine vollständige Satzanalyse. Mehrdeutige Wörter, unregelmäßige Formen und Klassenlabels können eine manuelle Korrektur brauchen. Es gibt keine automatische Bedeutungswahl anhand des Satzes.

Excel enthält pro **nichtleerer** Wortart ein Blatt mit den ursprünglichen Grammatikspalten, einer bis drei Bedeutungsspalten und Textbelegen. Spaltenbreiten, Filter und ein zusammengeführter Navigium-Hinweis sind enthalten. Texte werden als Zeichenketten geschrieben, nicht als Tabellenformeln. Die ursprüngliche aufwendige Zellgestaltung wird nicht vollständig nachgebildet.

Brainyoo enthält einen ZIP-Container mit `by_content.xml`, der ursprünglichen BYXML-Schemareferenz, der benannten Hauptlektion, Unterlektionen je nichtleerer Wortart und Vokabelkarten. Für flektierte Wortarten zeigt die Frage die erste Grammatikform und Textbelege; die Antwort enthält Grammatik und alle ausgewählten Bedeutungen. Für einfache Wortarten entspricht die Kartenrichtung dem Original: deutsche Bedeutung → lateinische Form. Der Navigium-Hinweis wird nicht als Lernkarte exportiert. ZIP/XML-Struktur und Inhalte werden getestet; ein Import in der Brainyoo-Anwendung selbst wurde nicht durchgeführt.

## Speicherung und Datenfluss

Eingaben, Protokoll und Ergebnisse bleiben ausschließlich im Arbeitsspeicher des Tabs. App und Worker verwenden keine Datenbank, localStorage, IndexedDB, Cache API oder Service Worker und keine persistente App-Speicherung. Beim Neuladen oder Schließen gehen die Eingaben verloren. Downloads sind bewusst vom Nutzer gespeicherte Exportdateien.

Nur einzelne Wortformen gehen über den Worker an Navigium, nicht der gesamte Text. Browser und Worker fragen ohne Client-Zugangsdaten oder Referrer ab und folgen keinen Weiterleitungen. Browser-Fetch verwendet `cache: 'no-store'`, der Worker zusätzlich `Cache-Control: no-cache, no-store` für Navigium und `Cache-Control: no-store` für **alle** eigenen Antworten. Der Worker hat ausschließlich native Rate-Limiting-Bindings, keine Datenbank-, KV-, D1- oder sonstigen App-Speicherbindungen und keine aktivierte Observability. Er schreibt keine Logs. Tickets und Turnstile-Token bleiben nur im Arbeitsspeicher des Tabs. Wenn konfiguriert, lädt der Browser das Turnstile-Skript von Cloudflare und sendet das Challenge-Token zur serverseitigen Prüfung; Cloudflare erhält dabei die Client-IP. Hostinganbieter können eigene Infrastrukturprotokolle führen.

## Worker

`assets/config.mjs` enthält nur öffentliche Platzhalter: `API_BASE_URL = "__WORKER_URL__"` und `TURNSTILE_SITE_KEY = "__TURNSTILE_SITE_KEY__"`. Vor Benutzung beide ersetzen; fehlende Konfiguration verhindert einen Lauf. Keine Secrets ins Frontend schreiben. Das Widget wird erst beim Start eines gültigen Laufs und nur mit konfiguriertem Site-Key geladen und explizit gerendert. Jeder Lauf bekommt einen frischen Token; Abbruch entfernt das Widget.

`POST /session` mit `Content-Type: application/json` und `{ "token": "…" }` prüft den Token **einmal** über den festen Cloudflare-Siteverify-Endpunkt (10 Sekunden Timeout, kein Redirect, keine Client-Credentials/Referrer). Der Worker prüft `success`, den zum erlaubten Origin passenden `hostname` und `action = vocabulary`. Eingabe: höchstens 4 KiB JSON, Token maximal 2.048 Zeichen; Siteverify-Antwort maximal 16 KiB. Bei Erfolg liefert er `{ticket, expiresAt}`.

Das Ticket ist HMAC-SHA-256-signiert, besitzt Version, Ablaufzeit (zehn Minuten), Origin, Client-IP und zufällige Nonce. Es wird ohne serverseitige Sessionliste, Datenbank oder KV ausgestellt und geprüft. Jeder Lookup im Browser-Batch verwendet **dasselbe Ticket** als `Authorization: Bearer …`; der Turnstile-Token wird niemals pro Wort erneut validiert. Das Ticket ist innerhalb seiner Laufzeit wiederverwendbar, nicht verschlüsselt und nur für dieselbe IP und denselben Origin gültig. Bei Ablauf, Manipulation oder IP-Wechsel: 401, neuer Lauf mit neuer Challenge. HMAC-Key-Rotation widerruft bestehende Tickets. Langsame Läufe mit Parallelität 1 können die Laufzeit überschreiten; dann neu starten oder Parallelität erhöhen.

`LOOKUP_RATE_LIMITER` zählt auch fehlende/ungültige Tickets vor der HMAC-Prüfung: **128 Lookup-Anfragen pro IP / 60 Sekunden**, ausreichend für die Standardparallelität 64; größere Läufe können das Limit erreichen. `SESSION_RATE_LIMITER` begrenzt Anfragen zur Ticketausgabe auf **3 pro IP / 60 Sekunden**. Die Schlüssel stammen ausschließlich aus `CF-Connecting-IP`, nicht aus Browser-Parametern oder `X-Forwarded-For`. Überschreitung: 429 und `Retry-After: 60`, keine Upstream-Abfrage. Native Limits sind pro Cloudflare-Standort und eventual consistent, keine exakte globale Quote; gemeinsame NAT-IP teilt das Limit. [Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Fehlender/zu kurzer HMAC-Key (mindestens 32 Zeichen), fehlendes Turnstile-Secret, fehlende Client-IP oder fehlende/defekte Rate-Bindings führen zu **503**, auch lokal. Es gibt keinen Sicherheits-Bypass über einen Request-Header, Origin oder eine Produktionsvariable. Die Tests injizieren explizite Test-Secrets und simulierte Bindings; der Runtime-Test verwendet diese ausschließlich in einem temporären lokalen Test-Worker. Frontend-Läufe stoppen bei 401/429/503 weitere Warteschlangen-Anfragen und erhalten die vorherigen Ergebnisse.

`GET /lookup?q=amo` akzeptiert genau einen NFC-normalisierten Begriff mit 1–100 Unicode-Zeichen: Buchstaben und nachfolgende kombinierende Zeichen. Ungültige Eingaben liefern 400, unbekannte Pfade 404, andere Methoden 405, Upstream-Fehler 502. Navigium-Anfragen verwenden ausschließlich den festen Suchendpunkt und ein Zeitlimit von 15 Sekunden; der Browser begrenzt jede Anfrage auf 20 Sekunden. Der Text ist auf 100.000 Zeichen und 3.000 verschiedene Wortformen begrenzt.

Die Antwort enthält ausschließlich `{query, found, lemma, meanings, wordType, classLabel, deponens, flexion}`. Bedeutungen bevorzugen die ursprünglichen `bedeutungJoined`-Gruppen. Maximal 20 Bedeutungen mit je 500 Zeichen, maximal 100 relevante Flexionen mit je acht Formen zu 150 Zeichen und begrenzte Lemma-/Klassenfelder werden ausgegeben. Der Worker liest höchstens 1 MiB Upstream-JSON. Flexionsfelder sind ausschließlich `form` und `wort`; es werden nur die benötigten Paradigmen normalisiert.

**Strikte CORS-Allowlist:** exakt `https://zwiebelrostbraten.github.io`, dazu ausschließlich HTTP/HTTPS-Origins mit `localhost`, `127.0.0.1` oder `[::1]` und optionalem Port für Entwicklung. Keine Subdomains, anderen IPs, Pfade, `null` oder fehlenden Origins. Andere Origins erhalten 403 ohne Allow-Origin; erlaubte Origins werden exakt gespiegelt, alle Antworten haben `Vary: Origin` und `Cache-Control: no-store`. Preflight erlaubt `/lookup`: `GET, OPTIONS`, `/session`: `POST, OPTIONS`, nur `Content-Type, Authorization`, keine Credentials. CORS ersetzt keine Authentifizierung; nicht-browserbasierte Clients können einen Origin behaupten und brauchen trotzdem gültige Tickets und unterliegen dem IP-Limit. [Turnstile-Validierung und Einmalverwendung](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Einrichtung in Cloudflare und spätere Bereitstellung

Diese Schritte muss der Betreiber selbst ausführen. Diese Änderung deployt nichts, erstellt keinen echten Schlüssel und ändert keine echte Cloudflare-Konfiguration.

1. **Cloudflare-Dashboard → Turnstile → Add widget:** Managed Widget, Name z. B. Vokabulator; Hostname `zwiebelrostbraten.github.io` (ohne Protokoll, Pfad oder Port). Für lokale Entwicklung ein separates Test-Widget bzw. die offiziellen Test-Keys verwenden; bei einem echten Dev-Widget nur `localhost` und `127.0.0.1` ergänzen. Das lokale IPv6-Origin ist in CORS erlaubt, Turnstile muss zusätzlich einen passenden Hostname bestätigen; bei Problemen localhost verwenden. Keine „Any hostname“-Freigabe. Site-Key in `TURNSTILE_SITE_KEY`, Secret ausschließlich im Worker. Widget-Pre-clearance wird nicht benötigt.
2. **Worker-Config:** Name/account passend wählen; in `worker/wrangler.toml` die ausdrücklich als Platzhalter markierten Namespace-IDs `1001` und `1002` durch zwei verschiedene positive numerische Strings ersetzen, die nicht mit anderen Rate-Bindings des Accounts kollidieren. Die Namespaces werden durch Wrangler-Bindings eingerichtet, nicht als KV und nicht als Dashboard-WAF-Regel. Native Rate-Bindings sind laut Cloudflare derzeit nicht im Dashboard sichtbar; die Namen und Limits bleiben wie oben.
3. **Cloudflare-Dashboard → Workers & Pages → Vokabulator-Worker → Settings → Variables and Secrets:** `TURNSTILE_SECRET` als **Secret** vom Widget hinterlegen; `TICKET_HMAC_KEY` als **Secret**, unabhängig zufällig generiert (empfohlen 32 zufällige Bytes, z. B. 64 Hex-Zeichen), niemals in Git/Pages oder einer normalen Klartext-Variable. Alternativ interaktiv die untenstehenden `wrangler secret put`-Befehle nutzen. Für einen noch nicht existierenden Worker zuerst den Code deployen; bis beide Secrets vorhanden sind, bleibt er geschlossen (503).
4. **Worker → Observability/Logs:** Logs deaktiviert lassen, keine Tail-/Logpush-Verknüpfung hinzufügen; die Config setzt `observability.enabled = false`. Keine KV/D1/Datenbank hinzufügen. Worker-URL nach Bereitstellung in `API_BASE_URL` eintragen. GitHub-Repository → Settings → Pages → Source **GitHub Actions**.

Spätere Betreiberbefehle (hier nicht ausgeführt):

```sh
npx wrangler login
npx wrangler deploy --config worker/wrangler.toml
npx wrangler secret put TURNSTILE_SECRET --config worker/wrangler.toml
npx wrangler secret put TICKET_HMAC_KEY --config worker/wrangler.toml
npm test
npm run lint
npm run check
npm run build
# Erst nach Konfiguration und Review: Änderungen nach main pushen;
# der Pages-Workflow veröffentlicht dist/ automatisch.
```

Vor Freigabe auf dem echten Pages-Origin einen kleinen Mehrwortlauf prüfen (ein `/session`, viele `/lookup` mit gleichem Ticket), fremdes Origin/fehlendes Ticket ablehnen lassen und die Bindings kontrollieren. Reales Turnstile/Edge-Rate-Limiting und Brainyoo-Import sind separat nach Einrichtung zu prüfen; die Tests simulieren externe Dienste und führen keine Live-Flut durch.

Lokal: `API_BASE_URL` auf `http://localhost:8787` setzen, öffentlichen Turnstile-Test-Site-Key verwenden und in der ignorierten Datei **`worker/.dev.vars`** nur die offiziellen Test-Secrets und einen lokalen HMAC-Test-Key (mindestens 32 Zeichen) eintragen. Die nativen Rate-Bindings werden durch Wrangler lokal simuliert. Falls die lokale Runtime keinen `CF-Connecting-IP` liefert, bleibt sie absichtlich bei 503; im Runtime-Test wird die IP explizit durch den temporären Test-Adapter gesetzt. Keine realen Secrets für die automatisierten Tests nötig. Offizielle Dummy-Siteverify-Antworten können `action: test` statt `vocabulary` liefern; dann liefert dieser strikt prüfende Worker absichtlich 403. Für den vollständigen manuellen lokalen Ablauf ein separates echtes Dev-Widget mit passendem Hostname/Action verwenden, oder den ausschließlich lokalen Test-Adapter wie im Runtime-Test einsetzen; die Produktionsprüfung niemals lockern. [Offizielle Turnstile-Test-Keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

```sh
npx wrangler dev --config worker/wrangler.toml --local
npm run dev
```

## Entwicklung und Tests

Node.js **22.22.2+, 24.15+ oder 26+** (gemäß den Entwicklungsabhängigkeiten):

```sh
npm ci
npm run dev
```

Die Dev-URL wird im Terminal ausgegeben. Der statische Produktionsbuild enthält gebündelte Browser-Abhängigkeiten, benötigt außer dem optional konfigurierten Turnstile-Skript keine Laufzeit-CDNs und funktioniert auch unter einem GitHub-Pages-Projektpfad:

```sh
npm test
npm run lint
npm run check
npm run build
npm run preview
```

`npm test` führt Core, Worker-CORS/Tickets/Turnstile/Rate-Limits, echten lokalen workerd-Runtime-Test, parallele Generierung, Grammatik, Export-Roundtrips, DOM/Widget-Bedienung und Produktionsbuild aus. Der externe Chromium-Test wird standardmäßig übersprungen, sodass fehlendes Chromium die normale Suite nicht scheitern lässt.

Expliziter **Produktionsbuild-Browsertest** (Downloads, mobile Abmessungen, axe-WCAG, ein Token-/Ticket-Austausch je Batch):

```sh
npx playwright install --with-deps chromium
npm run test:browser
# Alternativ vorhandenes Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium npm run test:browser
```

Dieser Befehl verlangt Chromium und scheitert bei fehlendem Browser absichtlich. Pages-CI installiert Chromium und führt ihn zusätzlich zu `npm test` aus. Navigium und Turnstile sind simuliert; es werden keine realen Secrets oder Live-Batchabfragen verwendet. Der Browser-Test baut mit öffentlicher Test-Konfiguration in ein temporäres Verzeichnis und verändert weder `assets/config.mjs` noch den normalen `dist/`-Build.

Die Umsetzung wurde in fokussierten RED/GREEN-Schritten geprüft. `assets/vocabulary.mjs` enthält Gruppierung und Grammatik, `assets/generate.mjs` den begrenzten Anfragepool, `assets/export.mjs` die Exporte und `assets/app.mjs` die Oberfläche. Die bisherigen Core-/Lookup-Hilfsfunktionen bleiben separat getestet; die neue Oberfläche verwendet die parallele Generierung.

Für XLSX wird [@e965/xlsx (SheetJS-Paketierung)](https://github.com/e965/sheetjs-npm-publisher), für ZIP [fflate](https://github.com/101arrowz/fflate) verwendet. [Vite](https://vite.dev/guide/build.html) bündelt mit relativer Basis `./`; der Lockfile fixiert die Abhängigkeiten. ESLint und Node-Syntaxprüfung sind die Prüfungen für diesen JavaScript-Code; es gibt keinen TypeScript-Build.

## GitHub Pages

`.github/workflows/pages.yml` installiert die Abhängigkeiten, führt vollständige Tests, Lint und Syntaxprüfung aus, baut die App und übergibt ausschließlich `dist/` als Pages-Artefakt. Worker, Tests, Quellkonfiguration und Zugangsdaten werden nicht veröffentlicht. In den Repository-Einstellungen muss Pages auf GitHub Actions eingestellt sein. Der vorhandene Workflow veröffentlicht erst bei einem Push auf `main`; diese Überarbeitung wurde weder committed noch gepusht oder bereitgestellt.

Datenquelle: [Navigium](https://www.navigium.de). Projektlizenz: [MIT](LICENSE).
