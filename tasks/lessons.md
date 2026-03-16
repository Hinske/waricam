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

### [2026-03-16] Falsche disc/hole-Topologie bei konkaven Polygonen (Löwenkopf)
- **Fehler:** Bei komplexen konkaven Formen (z.B. Löwenmähne mit Zacken) wurden Konturen falsch als disc/hole klassifiziert. Disc-Fill erschien auf Holes und umgekehrt.
- **Root Cause:** `Geometry.centroid()` war ein simpler arithmetischer Mittelwert aller Punkte. Bei stark konkaven Formen (Sterne, Zacken, Halbmonde) fällt dieser Punkt **außerhalb** des Polygons. `_pointInPolygon(centroid, parent)` lieferte dann falsche Ergebnisse → falsches Nesting-Level → falsche disc/hole-Zuweisung.
- **Lösung:** `centroid()` durch flächengewichteten Centroid (Shoelace-basiert) ersetzt. Neue Methode `interiorPoint()` mit Horizontal-Scan-Fallback — garantiert einen Punkt innerhalb des Polygons, auch bei extrem konkaven Formen.
- **Regel:** Für Point-in-Polygon-Tests an konkaven Formen NIE den arithmetischen Mittelwert als Testpunkt verwenden. Immer `Geometry.interiorPoint()` nutzen, das einen garantiert-inneren Punkt liefert.
- **Betroffene Module:** `geometry.js` (centroid, interiorPoint), `ceracut-pipeline.js` (_analyzeTopology), `canvas-renderer.js` (Disc-Fill, Hatch Hole-Cutout)
