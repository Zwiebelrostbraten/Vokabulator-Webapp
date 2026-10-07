# Vokabulator

Eigenständige, statische Web-App zum Erstellen eigener Vokabellisten. Deutsche Oberfläche, responsive Darstellung, Tastaturbedienung und Druckansicht. Kein Build-Schritt, keine Installation und kein Laufzeitdienst.

## Benutzen

1. Listentitel und Sprachbezeichnungen festlegen.
2. Lateinischen Text einfügen und „Wörter übernehmen“ wählen oder Wörter manuell hinzufügen.
3. Wortformen, eigene Übersetzungen und optionale Grammatiknotizen bearbeiten. Mit den Pfeilen die Reihenfolge ändern; mit × Zeilen löschen.
4. CSV herunterladen oder über „Drucken / PDF“ die Liste ausgeben.

Der Editor hat keine Wörterbuchsuche und erzeugt keine Übersetzungen. Eingaben bleiben ausschließlich im Arbeitsspeicher des Tabs. Es gibt keine Datenbank, Browserpersistenz, externen Bibliotheken, Schriftarten, Analyseprogramme oder API-Aufrufe. Beim Neuladen/Schließen gehen Eingaben verloren: vorher exportieren. Der Browser lädt beim Öffnen lediglich die statischen App-Dateien.

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

Im Browser `http://127.0.0.1:8080` öffnen. Kein `npm install`. `assets/core.mjs` enthält die unabhängig testbaren Kernfunktionen; `assets/app.mjs` bindet sie an die Oberfläche.

## GitHub Pages

Unter Repository-Einstellungen → Pages als Quelle **GitHub Actions** wählen. `.github/workflows/pages.yml` führt bei einem Push auf `main` die Tests aus und veröffentlicht ausschließlich `index.html` und `assets/`. Relative Pfade unterstützen auch Projektseiten unter einem Unterverzeichnis. Keine Deployment-Secrets erforderlich. Ein lokaler Checkout oder ein anderer Branch veröffentlicht nichts.

Lizenz: siehe [LICENSE](LICENSE).
