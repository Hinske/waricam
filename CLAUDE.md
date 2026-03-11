# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Letzte Aktualisierung:** 2026-03-11
> **Version:** V5.5.1
> **Build:** 20260311-print

---

## Schnell-Befehle

```bash
# Development-Server starten (Port 3000)
npm run dev
# oder: npx serve . -p 3000

# Produktions-Server (Port 5000)
npm run serve
# oder: npx serve .

# Testing
open test-parser.html        # DXF-Parser Tests im Browser
open dxf-test.html           # DXF Multi-File Test Tool
node test-dxf-parser.js      # Parser Unit-Tests (Node.js)
```

**Hinweis:** Vanilla JS/HTML5 Canvas — kein Build-Tool, kein Framework, keine Linting/Minification.

---

## Pfade

| Beschreibung | Pfad |
|--------------|------|
| Lokal (Windows) | `G:\Meine Ablage\Cerasell\Projekte\CAM Software\waterjet_v2\` |
| Server (Linux) | `/home/CNC/waterjet_v2/` |
| Sync-Methode | Syncthing (automatisch, bidirektional) |

---

## Projekt

| Feld | Wert |
|------|------|
| Name | WARICAM / CeraCAM |
| Version | **V5.5.1** |
| Typ | Wasserstrahl-CAM Software |
| Zweck | DXF → Sinumerik 840D CNC-Code für Wasserstrahlschneiden |
| Firma | Cerasell GmbH |

---

## Module & Versionen (Stand 2026-03-11)

| Modul | Datei | Version | Verantwortung |
|-------|-------|---------|---------------|
| **App** | `app.js` | **V5.5.1** | Wizard, Kontextmenu, Export-Modal, Undo, ToolManager, Click-Routing, Window-Selection, DynamicInput, Print, FSAPI-Save |
| **Geometry** | `geometry.js` | V2.9 | Vektoren, SplineUtils (De Boor), MicroHealing (5-Stage), Shoelace |
| **GeometryOps** | `geometry-ops.js` | V2.2 | Intersection, Segment-Modell, Arabeske, circumscribedCircle |
| **DXF-Parser** | `dxf-parser.js` | **V3.7** | DXF → Entities, SPLINE-Tessellation, Deque-Chaining, Layer-aware, TEXT/MTEXT/HATCH, Center/Radius-Passthrough |
| **CAMContour** | `cam-contour.js` | **V4.8** | Lead-In/Out, Overcut, Multi-Contour-Collision, Lead-Routing (Rotation+Dog-Leg), Slit, Kerf-Flip, Arc-Metadaten, clone() |
| **CeraJet Engine** | `cerajet-engine.js` | — | Technologie-Engine (Piercing, Speed-Ramping) |
| **Renderer** | `canvas-renderer.js` | **V3.13** | Canvas-Rendering, Hit-Testing, Arc-Leads, DPR-Fix, Grip-Editing, Window-Selection-Rect, Lead-Differenzierung |
| **Postprozessor** | `sinumerik-postprocessor.js` | **V1.3** | Sinumerik 840D MPF, 3-in-1, G41/G42, Piercing-Types, Multi-Head, Machine-Profile |
| **UndoManager** | `undo-manager.js` | **V1.1** | Command Pattern, Undo/Redo, Clipboard, WizardStepUndo |
| **Arc-Fitting** | `arc-fitting.js` | V3.0 | Polylinie → G02/G03 Bogen (fur PP-Ausgabe) |
| **Pipeline** | `waricam-pipeline.js` | V3.1 | Topologie (disc/hole/reference/slit), Kerf-Offset |
| **Drawing Tools** | `drawing-tools.js` | **V2.3** | Tier 1+2 CAD-Tools, AutoCAD-Aliases, Continuous Mode, Previous Selection |
| **Drawing Tools Ext** | `drawing-tools-ext.js` | — | Tier 3: Explode, Join, Break |
| **Advanced Tools** | `advanced-tools.js` | **V1.3** | Fillet, Trim, Extend, Offset (Ghost-Preview), Chamfer, Arabeske, Aufteilen |
| **CAM Tools** | `cam-tools.js` | — | CAM-spezifische Werkzeuge |
| **Tool Manager** | `tool-manager.js` | V2.2 | Tool-Routing, Always-Active, Shortcut-Dispatch, Tier 4 |
| **Command Line** | `command-line.js` | V1.0 | AutoCAD-style Prompt, Koordinaten-Parser, History |
| **Dynamic Input** | `dynamic-input.js` | **V1.0** | Koordinaten/Distanz/Winkel HUD am Cursor |
| **Snap Manager** | `snap-manager.js` | V1.2 | 9 Snap-Typen + Ortho (F8), Snap-Indikatoren |
| **Layer Manager** | `layer-manager.js` | V1.0 | AutoCAD-Style Layers, ACI-Farben, Sichtbarkeit, Lock |
| **DXF Writer** | `dxf-writer.js` | **V1.1** | DXF R12 (AC1009) Export, UTF-8 Encoding, Kreis-Validierung |
| **SVG Parser** | `svg-parser.js` | — | SVG-Import |
| **CNC Reader** | `cnc-reader.js` | — | CNC-Datei Import |
| **Properties Panel** | `properties-panel.js` | V1.1 | Kontur-Eigenschaften, Piercing, Lead-In, Area-Class |
| **Text Tool** | `text-tool.js` | — | Text-Entities (opentype.js) |
| **Image Underlay** | `image-underlay.js` | — | Hintergrund-Bilder |
| **Dimension Tool** | `dimension-tool.js` | — | Bemassung |
| **Measure Tool** | `measure-tool.js` | — | Messmodus |
| **Debug Monitor** | `debug-monitor.js` | V1.0 | Error-Catcher, Fallen-Erkennung, Strg+Shift+D Overlay |
| **Nesting** | `nesting.js` | **V1.0** | BLF-Algorithmus, Multi-Rotation, Multi-Sheet |
| **Toolpath Simulator** | `toolpath-simulator.js` | **V1.0** | Pfad-Verifikation, Animation, Kollisionsmatrix |
| **Cost Calculator** | `cost-calculator.js` | **V1.0** | Kosten-/Zeitkalkulation mit CeraJet-Integration |
| **Machine Profiles** | `machine-profiles.js` | **V1.0** | Maschinenpark-Verwaltung, PP-Profile, localStorage |
| **Bridge Cutting** | `bridge-cutting.js` | **V1.0** | Haltestege zwischen Teilen (auto/manuell) |
| **Quality Zones** | `quality-zones.js` | **V1.0** | Auto-Erkennung Ecken/Radien, Speed-Reduktion |
| **Build-Info** | `build-info.js` | **V5.5.1** | Versions-Banner, Modul-Versionen, Changelog |
| **Konstanten** | `constants.js` | V2.7 | Toleranzen, Farben, Defaults |

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
waterjet_v2/
├── index.html                         ← UI (Wizard, Export-Modal, Ribbon, Command-Line)
├── styles.css                         ← Dark Theme (WARICAM Blue)
├── properties-panel-styles.css        ← Properties Panel Styles
├── js/
│   ├── build-info.js                  ← Versions-Banner V5.5.1
│   ├── constants.js                   ← Toleranzen, Farben, Defaults (V2.7)
│   ├── app.js                         ← Hauptanwendung V5.5.1 (Print, FSAPI-Save)
│   ├── dxf-parser.js                  ← DXF Parser V3.7 (Deque-Chaining, Adaptive Grid)
│   ├── geometry.js                    ← Geometrie-Kernel V2.9
│   ├── geometry-ops.js                ← GeometryOps V2.2 (Intersection, Arabeske)
│   ├── waricam-pipeline.js            ← Pipeline V3.1
│   ├── cam-contour.js                 ← Kontur-Klasse V4.8 (Lead-Routing)
│   ├── cerajet-engine.js              ← Technologie-Engine
│   ├── canvas-renderer.js             ← Canvas Rendering V3.13 (Lead-Differenzierung)
│   ├── arc-fitting.js                 ← Arc Fitting V3.0
│   ├── undo-manager.js               ← Undo/Redo + Clipboard V1.1 (WizardStepUndo)
│   ├── sinumerik-postprocessor.js     ← Sinumerik PP V1.3 (Multi-Head)
│   ├── command-line.js                ← Command-Line UI V1.0
│   ├── dynamic-input.js              ← Dynamic Input HUD V1.0
│   ├── snap-manager.js               ← Snap-System V1.2
│   ├── drawing-tools.js              ← CAD-Tools V2.3 (AutoCAD-Aliases, Continuous)
│   ├── drawing-tools-ext.js           ← Tier 3 (Explode, Join, Break)
│   ├── advanced-tools.js              ← Tier 5 Tools V1.3 (Fillet/Trim/Extend/Offset/Chamfer)
│   ├── cam-tools.js                   ← CAM-Werkzeuge
│   ├── tool-manager.js               ← Tool-Routing V2.2
│   ├── layer-manager.js              ← Layer-System V1.0
│   ├── dxf-writer.js                 ← DXF R12 Export V1.1 (UTF-8, Kreis-Validierung)
│   ├── svg-parser.js                  ← SVG-Import
│   ├── cnc-reader.js                  ← CNC-Import
│   ├── properties-panel.js            ← Eigenschaften-Panel V1.1
│   ├── text-tool.js                   ← Text-Entities (opentype.js)
│   ├── image-underlay.js             ← Hintergrund-Bilder
│   ├── dimension-tool.js             ← Bemassung
│   ├── measure-tool.js               ← Messmodus
│   ├── debug-monitor.js              ← Debug-Overlay (Strg+Shift+D)
│   ├── nesting.js                    ← Nesting Engine V1.0
│   ├── toolpath-simulator.js         ← Toolpath Simulator V1.0
│   ├── cost-calculator.js            ← Kalkulation V1.0
│   ├── machine-profiles.js           ← Maschinenpark V1.0
│   ├── bridge-cutting.js             ← Haltestege V1.0
│   ├── quality-zones.js              ← Qualitaetszonen V1.0
│   ├── opentype.min.js               ← Font-Rendering Library
│   └── package.json                   ← Node.js Metadaten
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
console.log('[DXF Parser V3.5] Starting parse...');
console.log('[Pipeline V3.1] Topology: 5 discs, 2 holes');
console.log('[PP V1.3] Generiert: KERNKREIS.CNC — 12 Konturen');
console.log('[UndoManager V1.1] Ausgefuehrt: "Quality → 3"');
console.log('[DrawingTools V2.3] MoveTool: 3 contours moved');
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

**Noch offen:** M03/M05 Pumpe, Z-Achse, Abrasiv-Steuerung

---

## Konventionen

**Versions-Pflege bei jeder Code-Aenderung:**
1. `build-info.js` → Modul-Version + Build-Timestamp (YYYYMMDD-HHMM MEZ)
2. Datei-Header → Version, Last Modified, Build
3. `index.html` → `?v=` Cache-Busting hochzaehlen
4. Console-Logs → Versions-Prefix aktualisieren
5. `CLAUDE.md` → Modul-Tabelle aktualisieren bei Versions-Bumps
6. System-Anweisungen liegen in `.claude/` (nicht in Git)

**Code-Stil:** Deutsch (Kommentare, Doku), Optional Chaining, kategorisierte Logs

**Implementierung:** Phase 0 (Besprechen) → Phase 1 (Design) → Phase 2 (Code) → Phase 3 (Verifikation)

**Bekannte Fallen:**

| Falle | Symptom | Loesung |
|-------|---------|---------|
| Browser-Cache | Code geaendert, Verhalten gleich | Cache-Busting `?v=` hochzaehlen |
| PropertyChange ohne Render | Wert korrekt, UI zeigt alten Stand | `_refreshAfterUndoRedo()` nach undo/redo |
| Slider ohne Snapshot | Undo springt auf falschen Wert | `_captureSnapshot()` beim ersten `input`-Event |
| Import auf Undo-Stack | STRG+Z loescht alles | Import = Snapshot, NICHT Command |
| forEach ohne Group | Jede Kontur einzeln undo-bar | `beginGroup()` / `endGroup()` |
| FunctionCommand auf Stack.push | Execute wird nicht aufgerufen | Nur wenn Aktion BEREITS ausgefuehrt |

---

## Bekannte Einschraenkungen

| Bereich | Status | Problem |
|---------|--------|---------|
| DXF-Parser | 🟢 | TEXT/MTEXT/HATCH (V3.5), Center/Radius (V3.6), Deque-Chaining O(n) (V3.7) |
| DXF-Writer | 🟢 | UTF-8 Encoding, Kreis-Validierung mit _fitCircle (V1.1) |
| Collision | 🟢 | Multi-Kontur Collision Detection (V4.8) |
| Lead-Routing | 🟢 | V4.8: Startpunkt-Rotation (5°) + Dog-Leg Routing |
| Postprozessor | 🟡 | M03/M05, Z-Achse, Abrasiv fehlen |
| Modification Tools | 🟢 | Tier 3/5 komplett: Trim, Extend, Fillet, Chamfer, Offset (V1.3) |
| Koordinatensystem | 🟡 | 90-Grad-Drehung Software vs. Maschine (offen) |

---

## Naechste Prioritaeten

1. **PP Praxistest** — CNC-Datei auf echter Sinumerik 840D validieren
2. **PP vervollstaendigen** — M03/M05, Z-Achse, Abrasiv
3. ~~**Tier 3 CAD-Tools erweitern**~~ — erledigt (V1.3: Trim, Fillet, Chamfer, Extend, Offset mit Ghost-Preview)
4. **Nesting Praxistest** — BLF-Algorithmus mit realen Teilen validieren
5. **Kalkulation Praxistest** — Kostenmodell mit realen CeraJet-Daten abgleichen

---

## Sync-Pruefung

Console-Ausgabe beim Laden:
```
WARICAM/CeraCAM V5.5.1 - Build 20260311-tier3
[BUILD] Modules:
  dxf-parser: V3.7 (20260311-deque)
  dxf-writer: V1.1 (20260311-utf8circle)
  cam-contour: V4.8 (20260311-leadroute)
  canvas-renderer: V3.13 (20260311-leaddiff)
  undo-manager: V1.1 (20260309-wizard)
  sinumerik-pp: V1.3 (20260309-multihead)
  drawing-tools: V2.3 (20260309-autocad)
  dynamic-input: V1.0 (20260309-dynhud)
  nesting: V1.0 (20260309)
  toolpath-simulator: V1.0 (20260309)
  cost-calculator: V1.0 (20260309)
  machine-profiles: V1.0 (20260309)
  bridge-cutting: V1.0 (20260309)
  quality-zones: V1.0 (20260309)
  advanced-tools: V1.3 (20260311-offset)
  ...
```

**Fehlt diese Ausgabe?** → Syncthing hat nicht synchronisiert!

---

## Kontext

- **Entwickler:** Markus (Cerasell GmbH)
- **System-Anweisung:** `.claude/system-anweisung-v15.md` (verbindlich, nicht in Git)
- **Sprache:** Deutsch bevorzugt
