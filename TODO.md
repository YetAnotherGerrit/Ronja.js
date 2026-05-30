# TODO: Richtung Best Practice (Code + ESLint + Prettier)

## Quick Wins (1-2 Sessions)

- [ ] **Warnings aufraeumen (unused vars/imports)**
  - Entferne ungenutzte Imports/Variablen in den Modulen (`SetLanguage`, `Ronja`, `Zocken`, `index`).
  - Ziel: `yarn dev:lint` ohne Warnings.

- [ ] **Keine stillen Fehler in `catch`-Bloecken**
  - Entweder `console.error(error)` loggen oder begruendet mit `_error` kennzeichnen.
  - Verhindert, dass echte Laufzeitfehler unbemerkt bleiben.

- [ ] **Regel fuer Vergleich statt Assignment in Bedingungen absichern**
  - Optional zusaetzlich: `no-cond-assign` auf `error` stellen (falls nicht bereits implizit aktiv).
  - Schuetzt vor Bugs wie `if (a = b)`.

- [ ] **Formatting in CI sichern**
  - `yarn dev:format:check` in CI/Pipeline laufen lassen.
  - Optional mit Pre-Commit Hook (z. B. Husky + lint-staged).

## ESLint haerter machen (schrittweise)

- [ ] **`no-unused-vars` wieder auf `error` setzen**
  - Erst nach Aufraeumen des Bestands.
  - Optional erlaubte Namenskonvention fuer absichtlich ungenutzte Variablen: `_foo`.

- [ ] **Migration-Override reduzieren**
  - Aktuell ist `no-unused-vars` in `migrations/**/*.js` komplett aus.
  - Ziel: Nur wirklich noetige Ausnahmen behalten (z. B. per arg pattern), nicht pauschal `off`.

- [ ] **`ronja_modules/Example.js` sauber klassifizieren**
  - Entweder als echtes Beispiel beibehalten und aus Lint komplett exkludieren,
  - oder als produktionsnahe Vorlage bereinigen und Sonderregeln entfernen.

- [ ] **Zusatzregeln fuer Robustheit aktivieren**
  - `eqeqeq: error`
  - `curly: error`
  - `no-implicit-coercion: warn|error`
  - `no-shadow: warn`
  - Schrittweise aktivieren, jeweils mit kleinem Fix-PR.

## Architektur und Code-Qualitaet

- [ ] **Asynchrone Dateizugriffe vereinheitlichen**
  - In `Ronja` werden Dateien teils callback-basiert gelesen/geschrieben.
  - Mittelfristig auf `fs/promises` + `async/await` umstellen fuer bessere Fehlerbehandlung.

- [ ] **Typische Utility-Logik zentralisieren**
  - Wiederkehrende Helferfunktionen (z. B. Konfig-/Sprache-Zugriff, String-Helfer) in eigene Utility-Module.
  - Reduziert Duplikate und vereinfacht Tests.

- [ ] **Explizite Fehlerpfade in Discord-Interaktionen**
  - Bei DB/Discord-API Fehlern immer saubere User-Response + Logging.
  - Optional zentrale `handleInteractionError`-Funktion.

- [ ] **Magic Strings/Konstanten zentralisieren**
  - Command IDs, Custom IDs, Setting-Keys als Konstanten in einem zentralen Modul.
  - Verbessert Wartbarkeit und reduziert Tippfehler.

## Tests und Qualitaets-Gates

- [ ] **Basis-Testsetup einfuehren**
  - Vorschlag: Vitest oder Jest.
  - Erste Tests fuer pure Funktionen/Parser/Helper.

- [ ] **Smoke-Tests fuer kritische Module**
  - Minimaltests fuer Event-Hooks und Command-Builder.
  - Ziel: fruehes Erkennen von Regressions bei Refactors.

- [ ] **CI Quality Gate definieren**
  - Reihenfolge: `yarn dev:lint` -> `yarn dev:format:check` -> Tests.
  - Bei Erfolg erst mergen.

## Prettier-Konventionen stabilisieren

- [ ] **Konventionen im README dokumentieren**
  - Kurz erklaeren: Quotes, Semikolons, Print Width, Tab Width, wie formatiert wird.

- [ ] **Editor-Einstellungen im Team angleichen**
  - Optional `.editorconfig` + VS Code Workspace Settings.
  - Ziel: weniger Diff-Rauschen und konsistente Commits.

## Optional spaeter (wenn Codebasis ruhiger ist)

- [ ] **TypeScript-Migrationspfad evaluieren**
  - Nicht sofort umstellen, aber bei neuen Modulen TS optional pruefen.
  - Schon kleine Typen fuer Konfig/Settings reduzieren Laufzeitfehler deutlich.

- [ ] **Striktere Lint-Profile fuer neue Dateien**
  - Bestandscode tolerant halten, neue Dateien strenger linten.
  - Gute Bruecke zwischen Legacy und Best Practice.
