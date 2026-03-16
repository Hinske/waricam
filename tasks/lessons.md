# Lessons Learned

> Dieses Dokument wird nach jeder Korrektur/jedem Bug aktualisiert.
> Ziel: Gleiche Fehler nie wiederholen. Bei Session-Start reviewen.

---

## Format

```
### [YYYY-MM-DD] Kurzbeschreibung
- **Fehler:** Was ist passiert?
- **Root Cause:** Warum?
- **Regel:** Was muss in Zukunft anders gemacht werden?
- **Betroffene Module:** Welche Dateien/Bereiche?
```

---

## Eintraege

### [2026-03-16] tasks/lessons.md wurde nie angelegt
- **Fehler:** CLAUDE.md schreibt vor, nach jeder Korrektur `tasks/lessons.md` zu aktualisieren. Die Datei existierte nicht.
- **Root Cause:** Kein initialer Startpunkt, keine Durchsetzung zwischen Sessions.
- **Regel:** Bei Session-Start pruefen ob `tasks/lessons.md` existiert und relevante Eintraege reviewen. Nach jeder User-Korrektur sofort neuen Eintrag schreiben.
- **Betroffene Module:** Workflow

### [2026-03-16] DXF-Parser: Nicht auf Subclass-Marker verlassen
- **Fehler:** `_parseLayerTable` suchte nach `AcDbLayerTableRecord` als Startpunkt für Layer-Records. In R12-DXFs fehlt dieser Marker komplett → 0 Layer gefunden, keine ACI-Farben.
- **Root Cause:** `AcDbLayerTableRecord` ist ein DXF 2000+ Subclass-Marker (Code 100). R12/R14-Dateien haben diesen nicht. Der eigentliche Record-Start ist immer `0/LAYER`.
- **Regel:** DXF-Parsing immer ab den Group-Code-Paaren (`0/ENTITY_TYPE`) aufbauen, nie ab optionalen Subclass-Markern (`100/AcDb...`). Subclass-Marker als zusätzliche Info nutzen, nicht als Anker.
- **Betroffene Module:** `dxf-parser.js` — gilt für alle `_parse*`-Methoden die TABLES-Daten lesen

### [2026-03-16] Layer-UI: Alle definierten Layer anzeigen, nicht nur belegte
- **Fehler:** `_updateLayerUI` filterte Layer ohne Konturen aus dem Dropdown. DXF-Layer mit nur unsupported Entity-Types (DIMENSION, POINT) waren unsichtbar.
- **Root Cause:** Layer-Sichtbarkeit war nur an `contours[].layer` gekoppelt, nicht an die TABLES-Layer-Definition.
- **Regel:** Importierte DXF-Layer (`dxfResult.layers`) immer im Dropdown anzeigen — wie AutoCAD. "Leer" heißt nicht "unwichtig" (Layer kann Entities haben die nicht als Konturen importiert werden).
- **Betroffene Module:** `app.js` (`_updateLayerUI`)
