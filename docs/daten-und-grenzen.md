# Datenfluss und praktische Grenzen

[Zur Übersicht](../README.md)

## Was wird wohin gesendet?

GitHub Pages liefert HTML, JavaScript und Styles aus. Der vollständige eingefügte Text wird **im Browser zerlegt und nicht als ganzer Text übertragen**. Nach dem Start lädt der Browser Cloudflare Turnstile und sendet dessen Token an den Cloudflare Worker. Dieser prüft den Token bei Cloudflare, einschließlich Client-IP, und gibt ein kurzlebiges Ticket zurück. Danach sendet der Browser einzelne lateinische Wortformen mit dem Ticket an den Worker; dieser fragt sie bei Navigium ab. Zusammenführung, Grammatikaufbereitung und Erstellung der Exportdateien erfolgen im Browser.

App und Worker legen Vokabelinhalte nicht bewusst dauerhaft ab. Eingaben, Ergebnisse und Tickets werden im Arbeitsspeicher des Tabs gehalten; heruntergeladene Dateien speicherst du selbst. Das ist keine Zusage, dass außerhalb des Tabs keinerlei Daten verarbeitet oder protokolliert werden: **GitHub Pages, Cloudflare und Navigium** verarbeiten die jeweiligen Anfragen und können eigene Infrastrukturprotokolle und Datenschutzregeln haben. Einzelne Wortformen verlassen den Browser. Siehe [GitHubs Datenschutzhinweise](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Cloudflares Datenschutzhinweise](https://www.cloudflare.com/privacypolicy/) und die Anbieterinformationen auf [Navigium](https://www.navigium.de).

## Grenzen und häufige Probleme

- Maximal **100.000 Zeichen und 3.000 verschiedene Wortformen** pro Lauf; einzelne Abfrageformen dürfen höchstens 100 Unicode-Zeichen enthalten. Satzzeichen und Zahlen trennen Wörter, gleiche Grundformen werden je Wortart zusammengeführt.
- Der erste brauchbare Wörterbuchtreffer entscheidet. Die App führt keine Satzanalyse oder kontextabhängige Bedeutungswahl durch; Grammatik und mehrdeutige Formen benötigen Kontrolle. Fehlende Angaben erscheinen als `-`. Fehlende Treffer und einzelne fehlgeschlagene Abfragen sind mit ausgewählter Wortart „Unbekannt“ prüfbar.
- **Keine Vokabeln:** Text, Wortartauswahl und Protokoll prüfen. **Turnstile lädt nicht:** Internetverbindung und Blockierung von `challenges.cloudflare.com` prüfen, danach erneut starten.
- **Zu viele Abfragen (429):** mindestens eine Minute warten; große Texte aufteilen. Geringere Parallelität kann helfen, garantiert aber nicht die Einhaltung des Minutenlimits. Mehrere Personen mit derselben öffentlichen IP teilen sich das Limit.
- **Sicherheitsprüfung fehlt/abgelaufen (401):** neu starten. Tickets gelten zehn Minuten und sind an IP und Origin gebunden; sehr langsame Läufe oder ein Netzwechsel können sie ungültig machen. **Dienst nicht erreichbar (503) / Navigium-Fehler (502):** später erneut versuchen; bei anhaltenden Problemen Betreiber informieren.

