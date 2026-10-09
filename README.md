# Vokabulator

Eigenständige, statische Web-App zum Erstellen eigener Vokabellisten. Deutsche Oberfläche, responsive Darstellung, Tastaturbedienung und Druckansicht. Kein Frontend-Build-Schritt. Ein kleiner Cloudflare Worker vermittelt die Navigium-Wörterbuchsuche, weil Navigium direkte Browserabfragen durch CORS blockiert.

## Benutzen

1. Listentitel und Sprachbezeichnungen festlegen.
2. Lateinischen Text einfügen und „Wörter übernehmen“ wählen oder Wörter manuell hinzufügen.
3. Automatische API-Abfragen abwarten; pro verschiedener Wortform wird der erste brauchbare Navigium-Treffer übernommen. Übersetzung und Grammatiknotiz bleiben editierbar. Manuelle Zeilen mit „API-Abfrage“ nachschlagen, mit „Alle Wörter erneut bei Navigium abfragen“ die gesamte Liste erneut abfragen. Wortformen, eigene Übersetzungen und optionale Grammatiknotizen bearbeiten. Mit den Pfeilen die Reihenfolge ändern; mit × Zeilen löschen.
4. CSV herunterladen oder über „Drucken / PDF“ die Liste ausgeben.

Eingaben und Ergebnisse bleiben ausschließlich im Arbeitsspeicher des Tabs. App und Worker verwenden keine lokale Datenbank, SQLite, IndexedDB, localStorage, Cache API oder andere persistente Speicherung. Einzelne Wortformen werden über Cloudflare an Navigium gesendet; der gesamte eingefügte Text wird nicht übertragen. Die beteiligten Hostinganbieter können eigene Infrastrukturprotokolle führen. Der Worker schreibt keine Protokolle und hat keine Speicherbindungen; Workers Observability ist deaktiviert. Beim Neuladen/Schließen gehen Eingaben verloren: vorher exportieren.

API-Anfragen erfolgen nacheinander mit mindestens 1,2 Sekunden Pause zwischen abgeschlossenen Anfragen und der nächsten Anfrage, auch zwischen Abfrageläufen. Groß-/Kleinschreibungsvarianten teilen nur innerhalb des aktuellen Laufs ein Ergebnis; es gibt keinen Ergebnis-Cache. Browser-Fetch verwendet `cache: 'no-store'`, Worker-Antworten `Cache-Control: no-store`, Navigium-Fetch zusätzlich Cloudflare-Cache-TTL 0. Die erste Bedeutung füllt nur ein leeres, während der Anfrage unverändertes Übersetzungsfeld; Lemma, Wortart und Klassenlabel füllen entsprechend die Notiz. Vorhandene eigene Eingaben, fehlende Treffer und Fehler überschreiben keine Felder. Änderungen der Wortform während einer Anfrage verwerfen deren Ergebnis; während der Wartezeit geänderte Wortformen werden nicht mehr in ihrer alten Schreibweise gesendet. CSV und Druck bleiben auch bei nicht konfigurierter oder ausgefallener API verfügbar.

## Worker konfigurieren (separat von GitHub Pages)

`assets/config.mjs` exportiert exakt `API_BASE_URL = "__WORKER_URL__"`. Solange dieser Platzhalter vorhanden ist, zeigt die App „API nicht konfiguriert“ und führt keine Anfragen aus. Nach eigener temporärer Bereitstellung durch die vollständige Worker-Basis-URL ohne `/lookup` ersetzen, beispielsweise `https://vokabulator-navigium.<account>.workers.dev`. Keine Zugangsdaten im Frontend hinterlegen.

Der Worker in `worker/index.mjs` ist ein ES-Modul ohne Abhängigkeiten oder Datenbank. `worker/wrangler.toml` enthält keine KV-, D1-, R2- oder Durable-Object-Bindings. Mit installiertem Cloudflare Wrangler kann er lokal mit `wrangler dev --config worker/wrangler.toml` betrieben werden. Für diesen lokalen Betrieb die Basis-URL auf `http://localhost:8787` setzen. Eine spätere, ausdrücklich gewünschte Bereitstellung erfolgt mit `wrangler deploy --config worker/wrangler.toml`; diese Änderung wurde nicht bereitgestellt.

`GET /lookup?q=amo` akzeptiert genau einen nicht leeren, NFC-normalisierten Unicode-Buchstabenbegriff (kombinierende Zeichen nach Buchstaben sind erlaubt) mit maximal 100 Zeichen. Mehrere q-Parameter, Leerzeichen, Zahlen oder Satzzeichen werden mit JSON-Fehler 400 abgewiesen. Die Antwort enthält ausschließlich `{query, found, lemma, meanings, wordType, classLabel}` (maximal 20 Bedeutungen und 500 Zeichen pro Feld). Kein Treffer liefert `found: false`; kaputte oder nicht erreichbare Navigium-Antworten liefern JSON-Fehler 502. Der Worker fragt ausschließlich `https://www.navigium.de/suchfunktion/_search?q=...` ab, mit 15 Sekunden Zeitlimit. Browser und Worker lassen bei API-Abfragen Zugangsdaten und Referrer weg und weisen Weiterleitungen ab.

CORS erlaubt ausschließlich `https://zwiebelrostbraten.github.io` sowie HTTP/HTTPS auf `localhost`, `127.0.0.1` oder `[::1]` mit optionalem Entwicklungsport. Fremde Origins werden mit 403 abgewiesen. OPTIONS unterstützt GET-Preflight ohne zusätzliche Request-Header. Anfragen ohne Origin (z. B. Kommandozeilenclients) sind zulässig; CORS ist keine Authentifizierung. Alle Antworten einschließlich Fehler und Preflight sind `no-store`.

## Tokenisierung und Häufigkeiten

Unicode-Buchstaben einschließlich lateinischer Makrons, Ligaturen und kombinierender Zeichen werden erkannt. Satzzeichen, Bindestriche, Apostrophe und Zahlen trennen Wörter. Schreibweisen werden Unicode-normalisiert; Akzente werden nicht entfernt. Mit aktivierter Zusammenfassung werden Groß-/Kleinschreibungsvarianten innerhalb eines übernommenen Textes zusammengeführt. Die erste Schreibweise und deren Position bleiben erhalten; die Häufigkeit zählt alle Vorkommen. Ohne Zusammenfassung erhält jedes Vorkommen eine eigene Zeile. Neue Übernahmen werden angehängt; bestehende Zeilen und ihre Übersetzungen werden nicht zusammengeführt. Manuelle Zeilen starten mit Häufigkeit 1. Bearbeiten einer Wortform löst keine automatische Zusammenfassung aus.

## CSV für Excel und Anki

Exportiert werden die aktuelle Zeilenreihenfolge und die Spalten Ausgangssprache, Zielsprache, Notiz und Häufigkeit. Leere Übersetzungen/Notizen sind erlaubt; leere Wortformen müssen ergänzt oder gelöscht werden. UTF-8 mit BOM, Semikolon als Trennzeichen, CRLF-Zeilenenden und vollständig quotierte Felder erhalten Umlaute, Semikolons, Anführungszeichen und mehrzeilige Notizen. Potenzielle Tabellenformeln werden durch ein vorangestelltes Apostroph neutralisiert.

In Excel bei Bedarf über **Daten → Aus Text/CSV** mit UTF-8 und Semikolon importieren. In Anki Semikolon auswählen, die erste Zeile (Spaltenüberschriften) überspringen und die Spalten den gewünschten Notizfeldern zuordnen. Titel wird als Dateiname verwendet; Sprachlabels bilden die Spaltenüberschriften. CSV ist eine Exportdatei, kein wieder importierbares Projektformat. Ein XLSX-Export ist bewusst nicht implementiert; CSV ist der unterstützte Tabellenexport.

## Lokal starten und testen

Voraussetzungen zur Entwicklung: Node.js 22 oder neuer und ein beliebiger statischer HTTP-Server. Python ist nur eine optionale Möglichkeit, lokal Dateien auszuliefern.

```sh
node --test tests/*.test.mjs
python3 -m http.server 8080 --bind 127.0.0.1
```

Im Browser `http://127.0.0.1:8080` öffnen. Kein `npm install` für Frontend oder Tests. `assets/core.mjs` enthält die Editorfunktionen, `assets/lookup.mjs` die testbare API-Abfragelogik, `worker/index.mjs` reine Validierungs-/Parsingfunktionen und den Request-Handler. Die Node-Tests verwenden ausschließlich Mock-Fetch, keine Live-Batchabfragen.

```sh
for file in assets/*.mjs worker/*.mjs; do node --check "$file"; done
```

## GitHub Pages

Unter Repository-Einstellungen → Pages als Quelle **GitHub Actions** wählen. `.github/workflows/pages.yml` führt bei einem Push auf `main` die Tests aus und veröffentlicht ausschließlich `index.html` und die explizit aufgeführten Frontend-Dateien `assets/app.mjs`, `assets/core.mjs`, `assets/lookup.mjs`, `assets/config.mjs` und `assets/style.css`. Der Worker wird separat betrieben und nicht als Pages-Asset veröffentlicht. Relative Pfade unterstützen auch Projektseiten unter einem Unterverzeichnis. Keine Deployment-Secrets erforderlich. Ein lokaler Checkout oder ein anderer Branch veröffentlicht nichts.

Lizenz: siehe [LICENSE](LICENSE).
