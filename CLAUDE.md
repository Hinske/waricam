# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Letzte Aktualisierung:** 2026-03-16
> **Version:** V6.9
> **Build:** 20260316-gapdetect

---

## ⚠️ PFLICHT-REGELN — Bei JEDER Code-Aenderung einhalten!

Diese Regeln sind NICHT optional. Sie MUESSEN bei jeder Aenderung vollstaendig abgearbeitet werden.

### Checkliste: Nach JEDER Code-Aenderung

- [ ] **1. `build-info.js`** — Modul-Version hochzaehlen + Build-Timestamp aktualisieren (YYYYMMDD-tag)
- [ ] **2. Datei-Header** — Version, Last Modified, Build im geaenderten Modul aktualisieren
- [ ] **3. `index.html`** — `?v=` Cache-Busting-Parameter hochzaehlen fuer geaenderte Script-Tags
- [ ] **4. Console-Logs** — Versions-Prefix in Debug-Logs aktualisieren (z.B. `[Pipeline V3.3]`)
- [ ] **5. `CLAUDE.md`** — Modul-Tabelle + Sync-Pruefung aktualisieren bei Versions-Bumps
- [ ] **6. git commit** — Kurze, deutsche Commit-Message (das "Warum")
- [ ] **7. git push** — Sofort, ohne Rueckfrage

### Checkliste: Bei neuem Tool / geaendertem Shortcut

- [ ] **1. `constants.js`** — Eintrag in `TOOL_TOOLTIPS` (label, tip, shortcut, group)
- [ ] **2. Allgemeine Shortcuts** → `GENERAL_SHORTCUTS` in `constants.js`
- [ ] **3. Maus/Trackpad** → `MOUSE_SHORTCUTS` in `constants.js`
- [ ] Das genuegt — Tooltip und F1-Dialog werden automatisch generiert

### Checkliste: Bei User-Korrektur

- [ ] **1. `tasks/lessons.md`** — Fehler, Root Cause, Regel dokumentieren
- [ ] **2. Alle obigen Punkte** ebenfalls abarbeiten

### Bekannte Fallen — VOR dem Coden lesen!

| Falle | Symptom | Loesung |
|-------|---------|---------|
| Browser-Cache | Code geaendert, Verhalten gleich | Cache-Busting `?v=` hochzaehlen |
| PropertyChange ohne Render | Wert korrekt, UI zeigt alten Stand | `_refreshAfterUndoRedo()` nach undo/redo |
| Slider ohne Snapshot | Undo springt auf falschen Wert | `_captureSnapshot()` beim ersten `input`-Event |
| Import auf Undo-Stack | STRG+Z loescht alles | Import = Snapshot, NICHT Command |
| forEach ohne Group | Jede Kontur einzeln undo-bar | `beginGroup()` / `endGroup()` |
| FunctionCommand auf Stack.push | Execute wird nicht aufgerufen | Nur wenn Aktion BEREITS ausgefuehrt |
| Neues Tool ohne Tooltip | Button hat keinen Hilfetext, fehlt im F1-Dialog | Eintrag in `TOOL_TOOLTIPS` (constants.js) |

### Implementierungs-Phasen — IMMER einhalten

**Phase 0** (Besprechen) → **Phase 1** (Design) → **Phase 2** (Code) → **Phase 3** (Verifikation)

Nie direkt zu Phase 2 springen. Bei nicht-trivialen Aufgaben (3+ Schritte) Plan Mode verwenden.

---

## Strategische Roadmap & Architektur-Ziele

Dieser Abschnitt dient als Orientierung für zukünftige Entwicklungen und Refactorings. Bei Architektur-Entscheidungen sollen diese langfristigen Ziele berücksichtigt werden.

### 1. Code-Hygiene & Stabilitaet
* **Runtime-Guards im Geometrie-Kernel:** `assertFinite()`-Helper in `geometry.js` und
  `geometry-ops.js` an kritischen Rechenpfaden (Normalisierung, Division, Arc-Berechnung).
  Faengt NaN-Bugs dort ab wo sie entstehen — ohne TypeScript-Migration.
* **Modul-Ladereihenfolge dokumentieren:** Die 35+ Script-Tags in `index.html` haben implizite
  Abhaengigkeiten. Kommentarblock in der Script-Sektion soll die Abhaengigkeitskette explizit
  machen. Bundler-Migration bei Bedarf evaluieren.
* **DXF-Parser Stress-Tests:** Grosse Praxis-DXFs (>5000 Entities) als Test-Suite in `Examples/`
  sammeln. Parser-Performance ist seit V3.7 (Deque) gut, aber Regressionen sollen auffallen.

### 2. Offene Kernaufgaben (Kurzfristige Prio 1)
* **Praxis-Validierung:**
  * Generierten MPF/SPF-Code auf der echten Maschine testen (Kollisionspruefung).
  * `cost-calculator.js` mit realen CeraJet-Maschinendaten kalibrieren.
  * BLF-Nesting mit realen Praxis-Szenarien verproben.
* **Koordinatensystem:** Konflikt der 90-Grad-Drehung (Darstellung im Browser vs. reales
  Maschinen-Koordinatensystem) aufloesen.

### 3. Zukünftige Feature-Roadmap (Enterprise-Niveau)
* **Material- & Technologie-Datenbank:** Ausbau der `cerajet-engine.js`. Statt starrer Prozentwerte soll die Software Vorschubgeschwindigkeiten, Ramping, Abrasivfluss und Pumpendruck dynamisch anhand der Parameter "Materialart" und "Materialdicke" berechnen.
* **True-Shape Nesting:** Erweiterung des aktuellen BLF-Algorithmus (Bounding-Box) zu formtreuem Verschachteln, sodass kleine Bauteile in die Restgitter-Ausschnitte (Holes) großer Bauteile platziert werden können.
* **Tip-Up Avoidance (Kollisionsvermeidung):** Erweiterung des `toolpath-simulator.js` und der Lead-Routings. Der Schneidkopf soll im Eilgang (G00) intelligent um bereits geschnittene Teile herumgeführt werden, um Kollisionen mit aufgestellten Bauteilen im Wasserbecken zu vermeiden.
* **PDF-Rüstblatt (Setup Sheet):** Generierung eines Export-Dokuments für den Maschinenbediener mit allen relevanten Job-Daten (Nullpunkt-Position, Brutto-Plattengröße, geschätzte Laufzeit, Anzahl der Piercings).

---

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.


---

## Schnell-Befehle

```bash
# Development-Server starten (Port 3000)
npm run dev
# oder: PORT=3000 node server.js

# Produktions-Server (Port 5000, HTTPS mit Auto-TLS)
npm run serve
# oder: node server.js
# HTTPS-Zertifikat wird beim ersten Start automatisch generiert (certs/)
# Ohne HTTPS: NO_HTTPS=1 node server.js

# Versions-Sync: build-info.js → CLAUDE.md
node scripts/sync-versions.js          # Aktualisieren
node scripts/sync-versions.js --check  # Nur prüfen (CI-tauglich)

```

**Hinweis:** Vanilla JS/HTML5 Canvas — kein Build-Tool, kein Framework, keine Linting/Minification.

---

## Pfade

| Beschreibung | Pfad |
|--------------|------|
| Server (Linux) | `/home/ceraCUT/` |

---

## Projekt

| Feld | Wert |
|------|------|
| Name | CeraCUT / CeraCUT |
| Version | **V6.8** — Build 20260316-quietlogs (2026-03-16, 22:00 MEZ) |
| Typ | Wasserstrahl-CAM Software |
| Zweck | DXF → Sinumerik 840D CNC-Code für Wasserstrahlschneiden |
| Firma | Cerasell GmbH |

---

## Module & Versionen (Stand 2026-03-16)

| Modul | Datei | Version | Verantwortung |
|-------|-------|---------|---------------|
| **App** | `app.js` | **V6.9** | Wizard, Kontextmenu, Export-Modal, Undo (Granular per Kontur), ToolManager, Click-Routing, Window-Selection, DynamicInput, Print, FSAPI-Save, ProjectManager, CAM-Kontextmenu, Lead-Profiles, Intarsien V2.0, Layer-Visibility→Pipeline, Validation Engine, Multi-Material Export, Hatch-Entity, Undo/Redo-Button-Click |
| **Geometry** | `geometry.js` | **V2.11** | Vektoren, SplineUtils (De Boor), MicroHealing (5-Stage), Shoelace, interiorPoint |
| **GeometryOps** | `geometry-ops.js` | **V2.4** | Intersection, Segment-Modell, Arabeske, circumscribedCircle, splitAndOverlap |
| **DXF-Parser** | `dxf-parser.js` | **V3.10** | DXF → Entities, SPLINE-Tessellation, Deque-Chaining, Layer-aware, TEXT/MTEXT, TEXT-Glyphs, Center/Radius-Passthrough, R12-Layer-Table, HATCH-Skip |
| **CAMContour** | `cam-contour.js` | **V5.7** | Lead-In/Out, Overcut, Multi-Contour-Collision, Lead-Routing (Corner-Penalty, Flat-Segment-Bonus, Dog-Leg), Slit, Kerf-Flip, Arc-Metadaten, clone(), leadManualOverride, Flat-Preferred autoPlace, Hatch-Entity (cuttingMode='none', isHatchContour), materialGroup, intarsiaRole |
| **Lead Profiles** | `lead-profiles.js` | **V1.1** | 8 Built-in Profile (inkl. Intarsien), Benutzerdefiniert (localStorage), Batch-Engine (disc/hole/smallHole/slit) |
| **CeraJet Engine** | `cerajet-engine.js` | — | Technologie-Engine (Piercing, Speed-Ramping) |
| **Renderer** | `canvas-renderer.js` | **V3.30** | Canvas-Rendering, Hit-Testing (Kante+Fläche), Arc-Leads, DPR-Fix, Grip-Editing, Window-Selection-Rect, Lead-Differenzierung, Trackpad-Navigation, Disc-Füllung (nur CAM-Modi), Intarsien-Overlay (Multi-Material), Entry-Pfeil, Hatch-Entity-Rendering, Hatch-Live-Preview |
| **Postprozessor** | `sinumerik-postprocessor.js` | **V1.6** | Sinumerik 840D MPF, 3-in-1, G41/G42, Piercing-Types, Multi-Head, Machine-Profile, Safety-Guards, Hatch-Filter |
| **UndoManager** | `undo-manager.js` | **V1.1** | Command Pattern, Undo/Redo, Clipboard, WizardStepUndo |
| **Arc-Fitting** | `arc-fitting.js` | **V3.1** | Polylinie → G02/G03 Bogen (fur PP-Ausgabe) |
| **Pipeline** | `ceracut-pipeline.js` | **V3.7** | Topologie (disc/hole/reference/slit/none), Kerf-Offset, interiorPoint-basierte Nesting-Erkennung, Validation Engine (Pre-Export), Hatch-Konturen ausgeschlossen |
| **Drawing Tools** | `drawing-tools.js` | **V2.7** | Tier 1+2 CAD-Tools, AutoCAD-Aliases, Continuous Mode, BreakTool, Enter/Rechtsklick=Beenden (AutoCAD), Layerfarbe, Auto-Apply pending Entities |
| **Drawing Tools Ext** | `drawing-tools-ext.js` | **V1.6** | Ellipse, Spline, Donut, XLine, Overlap Break (OB), Hatch (H, eigenständige CamContour, Live-Preview, Farbpalette) |
| **Advanced Tools** | `advanced-tools.js` | **V1.5** | Fillet, Trim, Extend, Offset (Ghost-Preview), Chamfer, Arabeske, Aufteilen, Overkill |
| **CAM Tools** | `cam-tools.js` | **V1.1** | CAM-spezifische Werkzeuge, Hit-Test Zoom-Scaling |
| **Tool Manager** | `tool-manager.js` | **V2.2** | Tool-Routing, Always-Active, Shortcut-Dispatch, Tier 4 |
| **Command Line** | `command-line.js` | **V1.2** | AutoCAD-style Prompt, Koordinaten-Parser, History |
| **Dynamic Input** | `dynamic-input.js` | **V1.0** | Koordinaten/Distanz/Winkel HUD am Cursor |
| **Snap Manager** | `snap-manager.js` | **V1.3** | 9 Snap-Typen + Ortho (F8), Snap-Indikatoren |
| **Layer Manager** | `layer-manager.js` | **V1.0** | AutoCAD-Style Layers, ACI-Farben, Sichtbarkeit, Lock |
| **DXF Writer** | `dxf-writer.js` | **V1.2** | DXF R12 (AC1009) Export, ANSI_1252 Encoding, Kreis-Validierung |
| **SVG Parser** | `svg-parser.js` | — | SVG-Import |
| **CNC Reader** | `cnc-reader.js` | — | CNC-Datei Import |
| **Properties Panel** | `properties-panel.js` | **V1.5** | Kontur-Eigenschaften im Kontextmenu, Piercing, Lead-In, Area-Class, Batch-Editing, Hatch-Schraffur (Panel-Refresh-Fix), Live Preview, Material-Dropdown |
| **Text Tool** | `text-tool.js` | **V1.2** | Text-Entities, Glyph-Import via opentype.js |
| **Image Underlay** | `image-underlay.js` | — | Hintergrund-Bilder |
| **Dimension Tool** | `dimension-tool.js` | — | Bemassung |
| **Measure Tool** | `measure-tool.js` | — | Messmodus |
| **Debug Monitor** | `debug-monitor.js` | **V1.0** | Error-Catcher, Fallen-Erkennung, Strg+Shift+D Overlay |
| **Nesting** | `nesting.js` | **V1.1** | BLF-Algorithmus, Multi-Rotation, Multi-Sheet |
| **Toolpath Simulator** | `toolpath-simulator.js` | **V1.0** | Pfad-Verifikation, Animation, Kollisionsmatrix |
| **Cost Calculator** | `cost-calculator.js` | **V1.1** | Kosten-/Zeitkalkulation mit CeraJet-Integration |
| **Machine Profiles** | `machine-profiles.js` | **V1.0** | Maschinenpark-Verwaltung, PP-Profile, localStorage |
| **Bridge Cutting** | `bridge-cutting.js` | **V1.0** | Haltestege zwischen Teilen (auto/manuell) |
| **Quality Zones** | `quality-zones.js` | **V1.1** | Auto-Erkennung Ecken/Radien, Speed-Reduktion |
| **ProjectManager** | `project-manager.js` | **V1.0** | Workspace-Verwaltung, FSAPI Directory, Auto-Save, CNC-Unterordner, IndexedDB |
| **DXF Browser** | `dxf-browser.js` | **V1.1** | Server-DXF-Browse Modal, Breadcrumb-Navigation, Pfad-Persistenz (localStorage) |
| **Server** | `server.js` | **V1.2** | Node.js HTTPS-Server, Auto-TLS (Self-Signed), DXF-Browse-API, Dual-Protocol (HTTP+HTTPS auf einem Port) |
| **Build-Info** | `build-info.js` | **V6.9** | Versions-Banner, Modul-Versionen, Changelog |
| **Konstanten** | `constants.js` | V2.8 | Toleranzen, Farben, Defaults, INTARSIA_MATERIALS |

---

## High-Level Architektur

### Daten-Pipeline (6-Step Wizard)

```
1. Datei       → DXFParser.parse() → Entities → chainContours() → CamContour[]
                 ODER: Zeichnen → DrawingTools → addEntity() → applyEntities() → Pipeline
2. Referenz    → Pipeline._detectReference() → groesste rechteckige Kontur
3. Nullpunkt   → Benutzer setzt Nullpunkt (Material-Ecke)
4. Schneiden   → Lead-In/Out, Kerf-Offset, Overcut, Slit-Modus, MicroJoints
5. Reihenfolge → TSP (Hinten-Rechts → Vorne-Links), Inside-Out, Drag&Drop
6. Export      → SinumerikPostprocessor.generate() → MPF-Datei
```

### Dateistruktur

```
ceraCUT/
├── server.js                          ← Node.js HTTP-Server + DXF-Browse-API V1.0
├── index.html                         ← UI (Wizard, Export-Modal, Ribbon, Command-Line)
├── styles.css                         ← Dark Theme (CeraCUT Blue)
├── properties-panel-styles.css        ← Properties Panel Styles
├── js/
│   ├── build-info.js                  ← Versions-Banner V6.9
│   ├── constants.js                   ← Toleranzen, Farben, Defaults, Intarsia-Materialien (V2.8)
│   ├── app.js                         ← Hauptanwendung V6.9 (Lead-Profiles, Intarsien V2.0)
│   ├── dxf-parser.js                  ← DXF Parser V3.10 (Deque-Chaining, TEXT-Glyphs)
│   ├── geometry.js                    ← Geometrie-Kernel V2.11
│   ├── geometry-ops.js                ← GeometryOps V2.4 (Intersection, Arabeske, splitAndOverlap)
│   ├── ceracut-pipeline.js            ← Pipeline V3.7
│   ├── cam-contour.js                 ← Kontur-Klasse V5.7 (Flat-Preferred autoPlace)
│   ├── lead-profiles.js               ← Lead-Profile V1.1 (8 Built-in inkl. Intarsien, Batch-Engine)
│   ├── cerajet-engine.js              ← Technologie-Engine
│   ├── canvas-renderer.js             ← Canvas Rendering V3.30 (Flächen-Hit, Disc-Fill Fix)
│   ├── arc-fitting.js                 ← Arc Fitting V3.1
│   ├── undo-manager.js               ← Undo/Redo + Clipboard V1.1 (WizardStepUndo)
│   ├── sinumerik-postprocessor.js     ← Sinumerik PP V1.6 (Safety-Guards, Hatch-Filter)
│   ├── command-line.js                ← Command-Line UI V1.2
│   ├── dynamic-input.js              ← Dynamic Input HUD V1.0
│   ├── snap-manager.js               ← Snap-System V1.3
│   ├── drawing-tools.js              ← CAD-Tools V2.7 (Auto-Apply pending Entities)
│   ├── drawing-tools-ext.js           ← Ellipse, Spline, Donut, XLine, OB, Hatch V1.6
│   ├── advanced-tools.js              ← Tier 5 Tools V1.5 (Fillet/Trim/Extend/Offset/Chamfer/Overkill)
│   ├── cam-tools.js                   ← CAM-Werkzeuge
│   ├── tool-manager.js               ← Tool-Routing V2.2
│   ├── layer-manager.js              ← Layer-System V1.0
│   ├── dxf-writer.js                 ← DXF R12 Export V1.2 (UTF-8, Kreis-Validierung)
│   ├── svg-parser.js                  ← SVG-Import
│   ├── cnc-reader.js                  ← CNC-Import
│   ├── properties-panel.js            ← Eigenschaften-Panel V1.5 (Kontextmenu-Modus)
│   ├── text-tool.js                   ← Text-Entities (opentype.js)
│   ├── image-underlay.js             ← Hintergrund-Bilder
│   ├── dimension-tool.js             ← Bemassung
│   ├── measure-tool.js               ← Messmodus
│   ├── debug-monitor.js              ← Debug-Overlay (Strg+Shift+D)
│   ├── nesting.js                    ← Nesting Engine V1.1
│   ├── toolpath-simulator.js         ← Toolpath Simulator V1.0
│   ├── cost-calculator.js            ← Kalkulation V1.1
│   ├── machine-profiles.js           ← Maschinenpark V1.0
│   ├── bridge-cutting.js             ← Haltestege V1.0
│   ├── quality-zones.js              ← Qualitaetszonen V1.1
│   ├── project-manager.js            ← Workspace-Verwaltung V1.0 (FSAPI, Auto-Save)
│   ├── dxf-browser.js                ← Server-DXF-Browse Modal V1.0
│   └── opentype.min.js               ← Font-Rendering Library
├── package.json                       ← Node.js Metadaten
├── certs/                             ← TLS-Zertifikate (auto-generiert, nicht in Git)
├── fonts/                             ← Font-Dateien (nicht in Git)
├── Examples/                          ← Test-DXF-Dateien
├── CLAUDE.md                          ← Diese Datei
└── README.md                          ← Projekt-Uebersicht
```

---

## Design-Patterns

### Command Pattern (Undo/Redo)
```javascript
// Jede Datenmutation ueber UndoManager:
app.undoManager.execute(new PropertyChangeCommand(contour, 'quality', newValue, () => {
    app.renderer?.render();
    app.updateContourPanel();
}));

// Batch-Operationen:
app.undoManager.beginGroup('Batch-Aenderung');
// ... mehrere Commands ...
app.undoManager.endGroup();

// Slider: Snapshot bei input, Commit bei change
app._captureSnapshot();   // beim ersten input-Event
app._commitChanges();     // beim change-Event
```

### Modification-Tool Undo-Pattern
```javascript
// Move/Rotate/Mirror/Scale: FunctionCommand mit Deep-Copy Snapshots
const snapshots = contours.map(c => ({ contour: c, oldPoints: deepCopy(c.points) }));
// ... Transformation ausfuehren ...
const newSnapshots = contours.map((c, i) => ({ ...snapshots[i], newPoints: deepCopy(c.points) }));

const cmd = new FunctionCommand(
    beschreibung,
    () => { /* Redo: newPoints setzen + ModificationTool.invalidateCache() */ },
    () => { /* Undo: oldPoints setzen + ModificationTool.invalidateCache() */ }
);
app.undoManager.undoStack.push(cmd);  // Direkt pushen, Aktion bereits ausgefuehrt
```

### Cache-Invalidation
```javascript
// CamContour — manuelle Cache-Loeschung nach Punkt-Aenderungen:
ModificationTool.invalidateCache(contour);
// Loescht: _cachedKerfPolyline, _cacheKey, _cachedLeadInPath, _cachedLeadOutPath, _cachedOvercutPath
```

### Click-Routing
```
Canvas-Click →
  1. ToolManager hat aktives Tool?     → tool.onClick(worldPos)
  2. Startpunkt-Modus?                 → handleStartpointClick()
  3. Messmodus?                        → handleMeasureClick()
  4. Kontextmenu offen?                → schliessen
  5. Kontur unter Cursor (Hit-Test)?   → toggleSelection()
  6. Leere Flaeche?                    → deselectAll()
```

### Keyboard-Shortcuts
| Shortcut | Aktion |
|----------|--------|
| L | LineTool |
| C | CircleTool |
| N / REC | RectangleTool |
| A | ArcTool |
| P / PL | PolylineTool |
| M | MoveTool |
| CO | CopyTool |
| R / RO | RotateTool |
| MI | MirrorTool |
| S / SC | ScaleTool |
| E | EraseTool |
| DEL | EraseTool (direkt) |
| O | OffsetTool (Platzhalter) |
| X | ExplodeTool |
| J | JoinTool |
| B | BreakTool |
| OBREAK | OverlapBreakTool (Split + tangentiale Überlappung) |
| OK | OverkillTool (Duplikate + Überlappungen entfernen) |
| H | HatchTool (Schraffur) |
| PAN | PanTool (Verschiebe-Hand) |
| F8 | Ortho Toggle |
| F3 | Messmodus |
| ESC | Escape-Kaskade: Tool → Measure → Startpoint → Selection |
| STRG+Z | Undo |
| STRG+Y / STRG+Shift+Z | Redo |
| STRG+C/X/V | Copy/Cut/Paste (Clipboard) |
| STRG+A | Alle selektieren |
| STRG+S | DXF Speichern |
| STRG+Shift+S | DXF Speichern unter |
| STRG+P | Drucken (A4L, schwarz auf weiß) |
| STRG+Shift+D | Debug Monitor |
| Rechtsklick | Enter/Bestaetigen (aktives Tool) oder Kontextmenu |

### AutoCAD-Compliance (V2.3)
- **Continuous Mode:** Modification Tools starten nach Abschluss automatisch neu (ESC = Abbrechen)
- **Previous Selection:** `P` in Selektionsphase → letzte Auswahl wiederherstellen
- **Dynamic Input HUD:** Koordinaten/Distanz/Winkel am Cursor
- **Command Aliases:** Alle Standard-AutoCAD-Kuerzel (CO, RO, MI, SC, E, REC, PL, etc.)
- **Noun-Verb:** Selektieren → Tool-Shortcut → Tool arbeitet mit Selektion
- **Verb-Noun:** Tool-Shortcut → Selektieren → Enter/Space → Tool startet
- **Window-Selection:** L→R = nur innerhalb, R→L = beruehrt oder innerhalb
- **Ghost-Preview:** halbtransparente Vorschau bei Transformationen
- **Rechtsklick = Enter:** Bei aktivem Tool = Bestaetigen

### Debug-Logs mit Prefix
```javascript
console.log('[DXF Parser V3.10] Starting parse...');
console.log('[Pipeline V3.6] Topology: 5 discs, 2 holes');
console.log('[PP V1.6] Generiert: KERNKREIS.CNC — 12 Konturen');
console.log('[UndoManager V1.1] Ausgefuehrt: "Quality → 3"');
console.log('[DrawingTools V2.6] MoveTool: 3 contours moved');
```

### Weitere Patterns
- **Optional Chaining:** `this.renderer?.render()`
- **Wizard-Step:** Jeder Step hat UI-Element, Handler, Validation, render()
- **Corner-Lead:** `_isAtCorner()` → Linear statt Arc, Overcut=0
- **Collision Detection:** Multi-Kontur: `CamContour.checkAllCollisions(contours, margin)`

---

## Postprozessor (Sinumerik 840D)

Seit V1.0 (2026-02-13) funktional, V1.3 mit Multi-Head:

```
%_N_{PLANNAME}_MPF       — Hauptprogramm (Header, Plattendaten)
%_N_PARAMETER_SPF        — Technologie (R-Parameter R500–R915)
%_N_PART1_SPF            — Geometrie (Konturen mit G41/G42, G02/G03)
```

- Kerf: Controller-seitig (Koordinaten = Teile-Geometrie, nicht offset)
- Arc-Fitting: Polylinie → echte G02/G03 Boegen
- Speed-Ramping: Small Holes 20%, Normal 69%
- Slit: G91 G40 (inkrementell, ohne Kerf)
- Multi-Head: Konturen-Verteilung auf N Schneidkoepfe (V1.3)
- Machine Profiles: Maschinenpark-Integration (V1.3)

**Status:** Funktional komplett fuer aktuelle Anforderungen

---

## Konventionen

**Code-Stil:** Deutsch (Kommentare, Doku), Optional Chaining, kategorisierte Logs

**System-Anweisungen:** liegen in `.claude/` (nicht in Git)

> **Hinweis:** Versions-Pflege, Tooltip-Pflege, Fallen und Implementierungs-Phasen
> stehen oben im Abschnitt "PFLICHT-REGELN".

---

## Bekannte Einschraenkungen

| Bereich | Status | Problem |
|---------|--------|---------|
| DXF-Parser | 🟢 | TEXT/MTEXT (V3.5), HATCH-Skip (V3.10), Center/Radius (V3.6), Deque-Chaining O(n) (V3.7), R12-Layer-Table (V3.9) |
| DXF-Writer | 🟢 | UTF-8 Encoding, Kreis-Validierung mit _fitCircle (V1.1) |
| Collision | 🟢 | Multi-Kontur Collision Detection (V4.8) |
| Lead-Routing | 🟢 | V4.8: Startpunkt-Rotation (5°) + Dog-Leg Routing |
| Postprozessor | 🟢 | Funktional komplett (V1.3) |
| Modification Tools | 🟢 | Tier 3/5 komplett: Trim, Extend, Fillet, Chamfer, Offset (V1.3) |
| Overlap Break | 🟢 | Sonderfunktion: Split + tangentiale Überlappung für WJ-Einläufe (OB, V1.1) |
| Koordinatensystem | 🟡 | 90-Grad-Drehung Software vs. Maschine (offen) |

---

## Naechste Prioritaeten

1. **PP Praxistest** — CNC-Datei auf echter Sinumerik 840D validieren
2. ~~**Tier 3 CAD-Tools erweitern**~~ — erledigt (V1.3: Trim, Fillet, Chamfer, Extend, Offset mit Ghost-Preview)
3. **Nesting Praxistest** — BLF-Algorithmus mit realen Teilen validieren
4. **Kalkulation Praxistest** — Kostenmodell mit realen CeraJet-Daten abgleichen

---

## Sync-Pruefung

Console-Ausgabe beim Laden (V6.8: nur 1 Zeile + collapsed Gruppe):
```
CeraCUT V6.8 — Build 20260316-quietlogs (2026-03-16) — 31 Module
▶ [BUILD] Module-Versionen    ← aufklappbar per Klick
```

Module-Details (in collapsed Gruppe, per Klick sichtbar):
```
  dxf-parser: V3.10 (20260316-hatchskip)
  geometry: V2.11 (20260316-gapdetect)
  pipeline: V3.7 (20260316-gapdetect)
  cam-contour: V5.7 (20260316-gapdetect)
  canvas-renderer: V3.30 (20260316-gapdetect)
  undo-manager: V1.1 (20260309-wizard)
  sinumerik-pp: V1.6 (20260316-hatchentity)
  command-line: V1.2 (20260315-ux)
  snap-manager: V1.3 (20260315-bugfix35)
  geometry-ops: V2.4 (20260315-bugfix35)
  drawing-tools: V2.7 (20260316-autoapply)
  drawing-tools-ext: V1.6 (20260316-hatchpalette)
  dynamic-input: V1.0 (20260309-dynhud)
  tool-manager: V2.2 (20260216-0015)
  layer-manager: V1.0 (20260215-2200)
  text-tool: V1.2 (20260312-textimport)
  dxf-writer: V1.2 (20260315-bugfix35)
  lead-profiles: V1.1 (20260315-intarsia20)
  app: V6.9 (20260316-undoclick)
  project-manager: V1.0 (20260313-workspace)
  properties-panel: V1.5 (20260316-hatchentity)
  debug-monitor: V1.0 (20260219-dm10)
  nesting: V1.1 (20260315-bugfix35)
  toolpath-simulator: V1.0 (20260309)
  cost-calculator: V1.1 (20260315-bugfix35)
  machine-profiles: V1.0 (20260309)
  bridge-cutting: V1.0 (20260309)
  quality-zones: V1.1 (20260315-bugfix35)
  cam-tools: V1.1 (20260316-hittest)
  advanced-tools: V1.5 (20260316-overkill)
  arc-fitting: V3.1 (20260315-bugfix35)
```

**Keine Ausgabe?** → Alte Version im Cache! `?v=` Parameter pruefen.
**Init-Logs unsichtbar?** → Sind jetzt `console.debug` — im DevTools-Filter "Verbose" aktivieren.

---

## Kontext

- **Entwickler:** Markus (Cerasell GmbH)
- **System-Anweisung:** `.claude/system-anweisung-v15.md` (verbindlich, nicht in Git)
- **Sprache:** Deutsch bevorzugt

---


