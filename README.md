# Vokabulator

**Lateinische Texte in übersichtliche Vokabellisten und Lernkarten verwandeln – mit Grundformen, Grammatik und Bedeutungen aus Navigium.**

### [→ Webapp öffnen](https://zwiebelrostbraten.github.io/Vokabulator-Webapp/)

Ohne Anmeldung. Internet für Cloudflare-Sicherheitsprüfung und Wörterbuchabfragen erforderlich.

## In drei Schritten weiterlernen

1. **Text:** Lateinischen Text einfügen und Wortarten wählen. Nomen, Verben und Adjektive sind voreingestellt. Mit dem Regler eine bis drei Bedeutungen wählen.
2. **Erstellung:** „Vokabeln generieren“ starten und gegebenenfalls die Sicherheitsprüfung abschließen. Fortschritt und aufklappbares Protokoll zeigen den Verlauf. Die Parallelität steht unter „Erweiterte Einstellungen“ (1–128, Standard 64).
3. **Download:** Unter „3 · Dateien herunterladen“ selbst das gewünschte Format anklicken. Für Brainyoo und Anki unter „Lernkarten“ einen Lektions-/Stapelnamen mit 1–160 Zeichen eingeben. Es gibt keinen automatischen Download.

Ein neuer Lauf sperrt Downloads vorübergehend. Bei Abbruch, Fehler oder leerem Ergebnis bleiben die zuletzt erstellten Dateien und der Kartenname erhalten. Beim Neuladen oder Schließen gehen Eingaben und Ergebnisse im Tab verloren.

## Dein passendes Format

| Datei | Wofür? |
| --- | --- |
| **Excel · .xlsx** | Bearbeiten in Excel, ein Blatt je nichtleerer Wortart. |
| **ODS · .ods** | Dieselbe Tabellenstruktur für LibreOffice Calc. |
| **CSV · .csv** | Eine gemeinsame Tabelle, UTF-8 mit BOM und Semikolon. |
| **PDF · .pdf** | Ausdrucken auf A4 quer, Tabellen nach Wortarten. |
| **Brainyoo · .by2** | Benannte Lektion mit Unterlektionen nach Wortarten. |
| **Anki · .apkg** | Benannter Stapel, eine Karte je Vokabel und Tag `Latein`. |

Alle gewählten Bedeutungen bleiben in den Tabellen erhalten. Lernkarten nutzen die ursprünglichen Fragen je Wortart; es werden keine automatisch umgekehrten Karten ergänzt. [Genaue Inhalte, Kartenregeln und Formatdetails →](docs/formate.md)

## Was passiert mit deinem Text?

Der vollständige Text wird **im Browser zerlegt**. Nach Cloudflare Turnstile sendet der Browser **einzelne Wortformen über den Worker an Navigium**. Zusammenführung und Exporte entstehen im Browser. App und Worker legen Inhalte nicht bewusst dauerhaft ab; GitHub Pages, Cloudflare und Navigium können Anfragen verarbeiten und eigene Infrastrukturprotokolle führen. Die App ist daher nicht vollständig lokal oder offline nutzbar.

[Mehr zu Datenfluss, Datenschutz und Fehlern →](docs/daten-und-grenzen.md)

## Gut zu wissen

- Bis zu **100.000 Zeichen und 3.000 verschiedene Wortformen** pro Lauf; einzelne Formen höchstens 100 Unicode-Zeichen. Satzzeichen und Zahlen trennen Wörter, gleiche Grundformen werden je Wortart zusammengeführt.
- Der erste brauchbare Treffer entscheidet, ohne Satzanalyse. Bedeutungen und Grammatik immer im Textzusammenhang prüfen; fehlende Angaben erscheinen als `-`.
- Bei 429 mindestens eine Minute warten und große Texte aufteilen. Geringere Parallelität kann helfen; Personen mit derselben öffentlichen IP teilen sich das Limit.
- Große Exporte benötigen Arbeitsspeicher. Wiederholte Anki-Importe neu erzeugter Pakete können Duplikate anlegen. Brainyoo-Importe sind nicht in der Anwendung selbst getestet.

## Für Mitwirkende

[Lokale Entwicklung, Tests, Architektur, Sicherheitskontrollen und Deployment →](docs/entwicklung.md)

Projekt: [Webapp-Repository](https://github.com/Zwiebelrostbraten/Vokabulator-Webapp) · [MIT-Lizenz](LICENSE)
