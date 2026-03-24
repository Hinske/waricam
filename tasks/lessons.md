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

### [2026-03-16] Disc-Füllung: worldToScreen nicht in world-transformiertem ctx verwenden
- **Fehler:** Disc-Fill war unsichtbar/falsch positioniert. Die Füllung nutzte `worldToScreen()` obwohl der Canvas-Kontext bereits `translate()+scale()` hatte → Doppel-Transformation.
- **Root Cause:** `drawContour()` wird innerhalb eines world-transformierten `ctx` aufgerufen (translate+scale in render()). `drawPath()` nutzt korrekt World-Koordinaten direkt, aber der Disc-Fill-Code nutzte `worldToScreen()` → Screen-Koordinaten durch World-Transform = komplett falsche Position.
- **Regel:** Innerhalb von `ctx.save()/translate()/scale()` Blöcken NIE `worldToScreen()` verwenden. Direkte World-Koordinaten nutzen — wie `drawPath()` es tut. `worldToScreen()` ist nur für Code der AUSSERHALB des Transforms zeichnet (z.B. UI-Overlays, Order-Numbers).
- **Betroffene Module:** `canvas-renderer.js` — gilt für jeden neuen Fill/Path-Code in `drawContour()`

### [2026-03-16] Hit-Test Erweiterungen können Click-Routing brechen
- **Fehler:** Click-Selektion von Konturen funktionierte nicht mehr, nachdem `_hitTestStartTriangle` um Pierce-Punkt-Check erweitert wurde.
- **Root Cause:** Erweiterter Hit-Test fing zu viele Klicks ab → `isDraggingStartPoint=true` auf mousedown → obwohl mouseup es zurücksetzt, wurde bei jedem Micro-Move `setStartPoint()` aufgerufen statt Selection. Pierce-Punkte können weit von der Kontur entfernt liegen und fremde Klicks abfangen.
- **Regel:** Hit-Test-Bereiche konservativ halten. Erweiterungen immer gegen Click-Routing testen (Selektion, Kontextmenu, Window-Selection). Neue Hit-Targets nur für Cursor-Feedback (mousemove), nicht für Drag-Initiation (mousedown), es sei denn das Verhalten ist eindeutig gewünscht.
- **Betroffene Module:** `canvas-renderer.js` (`_hitTestStartTriangle`, mousedown-Handler)

### [2026-03-16] Waste-Side-Normal: Centroid-Methode versagt bei nicht-konvexen Konturen
- **Fehler:** Lead zeigte bei Disc nach innen statt nach außen (Waste-Seite).
- **Root Cause:** `_getWasteSideNormal` nutzte Centroid-Richtung zur Bestimmung der Normalenseite. Bei nicht-konvexen Polygonen kann der Centroid außerhalb liegen oder die Richtung zum Centroid an bestimmten Punkten falsch sein.
- **Regel:** Für Innen/Außen-Bestimmung die Shoelace-Formel (Vorzeichen der Fläche = Windungsrichtung) verwenden statt Centroid. `Geometry.getSignedArea() > 0` = CW, Links-Normale zeigt einwärts. Robust für alle Polygon-Formen.
- **Betroffene Module:** `cam-contour.js` (`_getWasteSideNormal`)

### [2026-03-16] Topology/Fill: points[0] als Test-Punkt für pointInPolygon ist unzuverlässig
- **Fehler:** Manche geschlossene Konturen wurden nicht als Loch erkannt. Disc-Fill Even-Odd-Cutout schlug fehl → Fill änderte sich nicht bei Modus-Wechsel.
- **Root Cause:** `_analyzeTopology()` und Disc-Fill-Renderer nutzten `contour.points[0]` als Testpunkt für pointInPolygon. Bei Spline-/Arc-Konturen kann der erste Punkt auf oder nahe der Grenze der Eltern-Kontur liegen → Ray-Casting liefert falsches Ergebnis.
- **Regel:** Für Containment-Tests immer `Geometry.centroid(points)` statt `points[0]` verwenden. Der Schwerpunkt liegt zuverlässig im Inneren der Kontur und nicht auf der Grenze.
- **Betroffene Module:** `ceracut-pipeline.js` (`_analyzeTopology`), `canvas-renderer.js` (Disc-Fill Hole-Cutout)

### [2026-03-16] Layer-Visibility ohne Pipeline-Rebuild — unsichtbare Layer kontaminieren Topology
- **Fehler:** Bemaßungs-Layer (HATCH-Konturen) ausgeschaltet, aber Topology-Klassifikation blieb falsch. Schnitt-Konturen hatten falsche disc/hole-Zuordnung.
- **Root Cause:** Zwei getrennte Layer-Systeme: Import-Checkboxen filtern Pipeline-Input, LayerManager-Visibility steuert nur Renderer-Anzeige. `toggleVisibility()` löste KEINE Pipeline-Neuberechnung aus → `this.contours` und Topology blieben unverändert.
- **Regel:** Layer-Sichtbarkeitsänderungen MÜSSEN die Pipeline neu auslösen (`applyLayerSelection({ visibilityChange: true })`). LayerManager-Visibility muss als zusätzlicher Filter in `applyLayerSelection()` berücksichtigt werden. Zwei Filter-Systeme dürfen nie unabhängig agieren.
- **Betroffene Module:** `app.js` (`applyLayerSelection`, `_runPipelineKeepUndo`), `index.html` (Visibility-Toggle Handler)

### [2026-03-16] Disc-Fill nur in CAM-Modi → Füllung fehlt beim Zurücknavigieren
- **Fehler:** Disc-Füllung war im CAD-Bereich (Step 1-3) unsichtbar, erschien erst bei Wechsel zu CAM (Step 4-5).
- **Root Cause:** `isCamMode`-Gate im Disc-Fill Code: `contour.cuttingMode === 'disc' && isCamMode`. Sobald Pipeline gelaufen ist und `cuttingMode` gesetzt hat, sollte die Füllung in allen Steps sichtbar sein — nicht nur in Steps 4/5.
- **Regel:** Visuelle Eigenschaften die an Contour-Properties gebunden sind (cuttingMode, hatch) sollten NICHT zusätzlich an den Wizard-Step gekoppelt werden. Nur interaktive CAM-Elemente (Leads, Kerf, Overcut, Microjoints) gehören hinter `isCamMode`-Gates.
- **Betroffene Module:** `canvas-renderer.js` (Disc-Fill Condition)

### [2026-03-16] DXF HATCH-Entities: Multi-Boundary-Loops dürfen nicht in ein Array
- **Fehler:** Importierte DXF-Dateien mit HATCH-Entities zeigten wirre Verbindungslinien quer durch die Zeichnung.
- **Root Cause:** `_parseHatch()` las alle `10/20`-Koordinatenpaare aus ALLEN Boundary-Loops in ein einziges `boundaryPoints[]`-Array. HATCH-Entities können mehrere getrennte Pfade haben (äußere Grenze + innere Löcher) — die Punkte verschiedener Pfade wurden zu einer einzigen Polylinie verbunden.
- **Regel:** DXF HATCH-Entities sind reine Visualisierung (Schraffur/Füllung), keine Schneidgeometrie. Im CAM-Kontext sollten sie beim Import übersprungen werden (`return null`). Falls sie in Zukunft doch benötigt werden: Boundary-Loops anhand Code 92 (Boundary-Typ) trennen und als separate Konturen zurückgeben — nie alles in ein Array.
- **Betroffene Module:** `dxf-parser.js` (`_parseHatch`)

### [2026-03-16] Hatch-Rendering: ctx.clip()+fillRect() statt ctx.fill() für Solid-Pattern
- **Fehler:** Hatch-Schraffur (Solid-Pattern) war nach Klick auf Kontur visuell nicht sichtbar — weder über HatchTool (H) noch über Properties Panel "Schraffur hinzufügen".
- **Root Cause:** `_drawHatch()` nutzte `ctx.clip('evenodd') + ctx.fillRect()` für das Solid-Pattern. Der funktionierende Disc-Fill direkt darüber nutzt `ctx.fill('evenodd')` direkt. Die Clip+FillRect-Kombination kann bei komplexen/selbstüberschneidenden Pfaden fehlschlagen. Zusätzlich fehlte ein Try-Catch — bei Fehler wurde die gesamte Kontur-Zeichnung abgebrochen. Außerdem kein Toast-Feedback und kein Panel-Refresh nach Hatch-Änderung.
- **Regel:** Für flächendeckende Fills (Solid) immer `ctx.fill('evenodd')` direkt auf den Pfad verwenden — wie beim Disc-Fill. `ctx.clip()` nur für Pattern (Lines/Cross/Dots) verwenden, wo Einzelstriche geclippt werden müssen. Neue Render-Funktionen immer mit Try-Catch umgeben. UI-Feedback (Toast, Panel-Refresh) nach jeder sichtbaren Datenänderung.
- **Betroffene Module:** `canvas-renderer.js` (`_drawHatch`), `drawing-tools-ext.js` (HatchTool), `properties-panel.js` (`_setHatchProperty`)

### [2026-03-16] Falsche disc/hole-Topologie bei konkaven Polygonen (Löwenkopf)
- **Fehler:** Bei komplexen konkaven Formen (z.B. Löwenmähne mit Zacken) wurden Konturen falsch als disc/hole klassifiziert. Disc-Fill erschien auf Holes und umgekehrt.
- **Root Cause:** `Geometry.centroid()` war ein simpler arithmetischer Mittelwert aller Punkte. Bei stark konkaven Formen (Sterne, Zacken, Halbmonde) fällt dieser Punkt **außerhalb** des Polygons. `_pointInPolygon(centroid, parent)` lieferte dann falsche Ergebnisse → falsches Nesting-Level → falsche disc/hole-Zuweisung.
- **Lösung:** `centroid()` durch flächengewichteten Centroid (Shoelace-basiert) ersetzt. Neue Methode `interiorPoint()` mit Horizontal-Scan-Fallback — garantiert einen Punkt innerhalb des Polygons, auch bei extrem konkaven Formen.
- **Regel:** Für Point-in-Polygon-Tests an konkaven Formen NIE den arithmetischen Mittelwert als Testpunkt verwenden. Immer `Geometry.interiorPoint()` nutzen, das einen garantiert-inneren Punkt liefert.
- **Betroffene Module:** `geometry.js` (centroid, interiorPoint), `ceracut-pipeline.js` (_analyzeTopology), `canvas-renderer.js` (Disc-Fill, Hatch Hole-Cutout)

### [2026-03-16] Undo-Granularität: Batch-Import darf nicht als eine einzige Gruppe auf dem Stack landen
- **Fehler:** Undo nach DXF-Import oder Zeichnen entfernte ALLE Konturen auf einmal statt einzeln.
- **Root Cause:** Mehrere Konturen wurden in einer einzigen Undo-Gruppe (`beginGroup/endGroup`) oder als ein Snapshot auf den Stack gelegt. STRG+Z machte die gesamte Gruppe rückgängig.
- **Regel:** Jede Kontur = ein eigener Undo-Eintrag, es sei denn die Aktion ist semantisch unteilbar (z.B. Explode einer Gruppe). Import-Operationen als Snapshot behandeln, aber mit Einzel-Undo pro Kontur. Bei Batch-Operationen prüfen: Will der User wirklich alles auf einmal rückgängig machen?
- **Betroffene Module:** `app.js` (Import/applyEntities), `undo-manager.js`

### [2026-03-16] Flächen-Hit-Test: Nur Kanten-Distanz reicht nicht für geschlossene Konturen
- **Fehler:** Klick innerhalb einer geschlossenen Kontur (z.B. Kreis) wurde nicht erkannt — nur Klicks nahe der Kante funktionierten.
- **Root Cause:** Hit-Test basierte ausschließlich auf Distanz zur nächsten Kante (`distanceToSegment`). Bei großen geschlossenen Konturen ist die Mitte weit von jeder Kante entfernt → kein Hit.
- **Regel:** Geschlossene Konturen brauchen zusätzlich Point-in-Polygon-Test. Erst Kanten-Distanz prüfen, dann für geschlossene Konturen `_pointInPolygon()` als Fallback. Das entspricht AutoCAD-Verhalten (Klick in Fläche = Selektion).
- **Betroffene Module:** `canvas-renderer.js` (`_hitTest`)

### [2026-03-16] Lead-Platzierung: Ecken sind schlechte Startpunkte für Wasserstrahl
- **Fehler:** Leads wurden an scharfen Ecken platziert statt auf geraden Segmenten. Führte zu schlechter Schnittqualität am Einstichpunkt.
- **Root Cause:** `autoPlace()` wählte den Startpunkt ohne Bewertung der lokalen Geometrie. Ecken (hoher Winkel zwischen Segmenten) sind beim Wasserstrahlschneiden problematisch weil der Strahl dort die Richtung wechselt.
- **Regel:** Lead-Platzierung muss Segmentlänge und Geradheit bevorzugen (Flat-Segment-Bonus). Scharfe Ecken bekommen Corner-Penalty. Mindest-Segmentlänge für Lead-Platzierung einhalten. Das ist die `_findBestLeadPosition()`-Logik mit Corner-Penalty und Flat-Segment-Bonus.
- **Betroffene Module:** `cam-contour.js` (`autoPlace`, `_findBestLeadPosition`)

### [2026-03-16] CSS overflow-Kaskade: Dropdown in overflow:hidden Parent braucht position:fixed
- **Fehler:** Layer-Dropdown im Ribbon war abgeschnitten — untere Einträge nicht sichtbar. 3 Fixversuche nötig.
- **Root Cause:** Ribbon-Container hatte `overflow-y: hidden` (oder `auto`). Dropdown als Child erbt diesen Clipping-Kontext. `position: absolute` reicht nicht — das Element bleibt im overflow-Kontext des nächsten positioned Parent.
- **Regel:** Dropdowns/Popups die über ihren Container hinausragen MÜSSEN `position: fixed` verwenden und Koordinaten via `getBoundingClientRect()` berechnen. `position: absolute` funktioniert nur wenn KEIN Vorfahre `overflow: hidden/auto/scroll` hat. Bei CSS-Bugs: Erst den Overflow-Kontext der gesamten Parent-Kette prüfen.
- **Betroffene Module:** `index.html` / `styles.css` (Ribbon-Dropdowns)

### [2026-03-16] Drawing Tools: Hardcoded Farbe statt Layer-Farbe für neue Entities
- **Fehler:** Neu gezeichnete Entities (Linien, Kreise, Rechtecke) erschienen in Weiß statt in der Farbe des aktiven Layers.
- **Root Cause:** Drawing Tools nutzten eine hardcoded Farbe (`'#FFFFFF'` oder Default) statt die Farbe des aktuell gewählten Layers abzufragen.
- **Regel:** Neue Entities und Rubber-Band-Vorschauen MÜSSEN die Farbe des aktiven Layers verwenden (`layerManager.getActiveLayer().color`). Hardcoded Farben nur für UI-Elemente (Grips, Selection-Highlights), nie für Geometrie.
- **Betroffene Module:** `drawing-tools.js` (alle Tools die Entities erstellen)

### [2026-03-24] CLAUDE.md Projekt-Version wird nicht aktualisiert
- **Fehler:** Bei Version-Bumps wurde der CLAUDE.md-Header (Zeile 5-7) per `sync-versions.js` aktualisiert, aber die Projekt-Tabelle (Version/Build-Zeile ~Zeile 183) blieb auf der alten Version stehen.
- **Root Cause:** Das `sync-versions.js` Script aktualisiert nur Header, Modul-Tabelle, Dateibaum und Sync-Pruefung — NICHT die Projekt-Tabelle. Die Checkliste erwähnte nur "Modul-Tabelle + Sync-Pruefung", nicht die Projekt-Version.
- **Regel:** Nach `node scripts/sync-versions.js` immer auch die Projekt-Tabelle (`| Version | **VX.Y** — Build ...`) manuell prüfen und aktualisieren. Checkliste-Punkt 5 wurde entsprechend erweitert.
- **Betroffene Module:** `CLAUDE.md`, Workflow

### [2026-03-24] API-Methoden vor Aufruf verifizieren
- **Fehler:** `layerManager.setActiveLayer(name)` aufgerufen — Methode existiert nicht. Heißt `setActive(name)`.
- **Root Cause:** Methodenname geraten statt im Quellcode nachgeschaut. Kein Grep/Read vor dem Aufruf.
- **Regel:** VOR dem Einfügen eines Methodenaufrufs IMMER per Grep verifizieren, dass die Methode mit exakt diesem Namen existiert. Nie Methodennamen raten.
- **Betroffene Module:** `index.html`, `layer-manager.js`

### [2026-03-24] Renderer-Patch: Property-Namen muessen mit der aktuellen Klasse uebereinstimmen
- **Fehler:** `cam-tools.js` Analyze-Marker Renderer-Patch nutzte `this.zoom`, `this.panX`, `this.panY`, `this.dpr` — CanvasRenderer hat aber `this.scale`, `this.offsetX`, `this.offsetY`, `this._dpr`. Marker waren unsichtbar.
- **Root Cause:** Renderer-Patch wurde gegen eine andere/aeltere API geschrieben und nie gegen die aktuelle Klasse verifiziert.
- **Regel:** Bei Monkey-Patching einer Klasse IMMER die aktuellen Property-Namen per Grep verifizieren. Die gleiche Transformation wie die Originalklasse verwenden (copy-paste aus `render()` statt ausdenken).
- **Betroffene Module:** `cam-tools.js`, `canvas-renderer.js`

### [2026-03-24] Direktes undoStack.push() ueberspringt redoStack-Clearing
- **Fehler:** CAM-Tools pushten Commands direkt auf `undoMgr.undoStack` statt `undoMgr.execute()`. Dadurch wurde der `redoStack` nicht geleert → inkonsistenter Undo/Redo-Zustand.
- **Root Cause:** Bei Commands die bereits ausgefuehrt sind (execute() schon gelaufen) wird `undoStack.push()` statt `undoMgr.execute()` genutzt, um doppelte Ausfuehrung zu vermeiden. Aber dabei wird vergessen, den redoStack zu leeren.
- **Regel:** Wenn `undoStack.push(cmd)` direkt genutzt wird (weil Aktion bereits ausgefuehrt), IMMER auch `undoMgr.redoStack.length = 0` ausfuehren.
- **Betroffene Module:** `cam-tools.js`, alle Module mit direktem undoStack-Zugriff

### [2026-03-24] Direktes undoStack.push() ohne _notifyStateChange() — Undo-Buttons bleiben stale
- **Fehler:** Nach CAM-Tool-Aktionen (Edgefix, Replace, Analyze, BoundaryTrim, PolyJoint, Vectorize, ConvexHull) und Grip-Editing blieben die Undo/Redo-Buttons im Header disabled, obwohl Aktionen auf dem Stack lagen. Strg+Z funktionierte, aber die Buttons zeigten falschen Zustand.
- **Root Cause:** `undoStack.push(cmd)` wurde korrekt aufgerufen, aber `undoMgr._notifyStateChange()` fehlte. Der `onStateChange`-Callback (der die Buttons enabled/disabled) wird nur von `execute()`, `undo()`, `redo()` und `endGroup()` automatisch aufgerufen — NICHT bei direktem `push()`.
- **Regel:** Bei direktem `undoStack.push(cmd)` IMMER die Dreier-Sequenz einhalten: (1) `undoStack.push(cmd)`, (2) `redoStack.length = 0`, (3) `_notifyStateChange()`. Keinen der drei Schritte weglassen. Besser: Prüfen ob `undoMgr.execute(cmd)` verwendbar ist (wenn Aktion noch nicht ausgeführt).
- **Betroffene Module:** `cam-tools.js` (8 Stellen), `canvas-renderer.js` (Grip-Edit)

### [2026-03-24] Layer-Operationen ohne Undo-Tracking — Visibility/Lock/Color nicht rückgängig machbar
- **Fehler:** Layer-Sichtbarkeit togglen, Layer sperren/entsperren und Farbänderungen waren nicht per Strg+Z rückgängig machbar. User-Erwartung: Jede UI-Aktion sollte undo-fähig sein.
- **Root Cause:** `LayerManager` hatte keine Referenz auf den `UndoManager`. Alle Mutationen (`toggleVisibility`, `toggleLock`, `setColor`) änderten den State direkt ohne FunctionCommand auf den Undo-Stack zu legen.
- **Regel:** Jede benutzersichtbare Datenänderung MUSS über den UndoManager laufen. Neue Module die State mutieren brauchen eine `undoManager`-Referenz. Bei bestehenden Modulen prüfen: Welche Mutationen sind NICHT undo-fähig?
- **Betroffene Module:** `layer-manager.js`, `app.js` (Verknüpfung)
