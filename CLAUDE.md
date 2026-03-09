# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Letzte Aktualisierung:** 2026-03-09
> **Version:** V5.4.2
> **Build:** 20260220-arabeske

---

## 🚀 Schnell-Befehle

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

## 📁 Pfade

| Beschreibung | Pfad |
|--------------|------|
| Lokal (Windows) | `G:\Meine Ablage\Cerasell\Projekte\CAM Software\waterjet_v2\` |
| Server (Linux) | `/home/CNC/waterjet_v2/` |
| Sync-Methode | Syncthing (automatisch, bidirektional) |

---

## 🎯 Projekt

| Feld | Wert |
|------|------|
| Name | WARICAM / CeraCAM |
| Version | **V5.4.2** |
| Typ | Wasserstrahl-CAM Software |
| Zweck | DXF → Sinumerik 840D CNC-Code für Wasserstrahlschneiden |
| Firma | Cerasell GmbH |

---

## 🛠️ Module & Versionen (Stand 2026-03-09)

| Modul | Datei | Version | Verantwortung |
|-------|-------|---------|---------------|
| **App** | `app.js` | **V5.4.1** | Wizard, Kontextmenü, Export-Modal, Undo, ToolManager, Click-Routing, Window-Selection |
| **Geometry** | `geometry.js` | V2.9 | Vektoren, SplineUtils (De Boor), MicroHealing (5-Stage), Shoelace |
| **GeometryOps** | `geometry-ops.js` | V2.2 | Intersection, Segment-Modell, Arabeske, circumscribedCircle |
| **DXF-Parser** | `dxf-parser.js` | V3.3 | DXF → Entities, SPLINE-Tessellation, Grid-Chaining, Layer-aware |
| **CAMContour** | `cam-contour.js` | V4.6 | Lead-In/Out, Overcut, Collision, Slit, Kerf-Flip, Arc-Metadaten |
| **CeraJet Engine** | `cerajet-engine.js` | — | Technologie-Engine (Piercing, Speed-Ramping) |
| **Renderer** | `canvas-renderer.js` | V3.7 | Canvas-Rendering, Hit-Testing, Arc-Leads, DPR-Fix, Window-Selection-Rect |
| **Postprozessor** | `sinumerik-postprocessor.js` | V1.2 | Sinumerik 840D MPF, 3-in-1 Dateistruktur, G41/G42, Piercing-Types |
| **UndoManager** | `undo-manager.js` | V1.0 | Command Pattern, Undo/Redo, Clipboard (Copy/Cut/Paste) |
| **Arc-Fitting** | `arc-fitting.js` | V3.0 | Polylinie → G02/G03 Bögen (für PP-Ausgabe) |
| **Pipeline** | `waricam-pipeline.js` | V3.1 | Topologie (disc/hole/reference/slit), Kerf-Offset |
| **Drawing Tools** | `drawing-tools.js` | V2.1 | Tier 1: CAD-Tools (L/C/N/A/P) + Tier 2: Modification-Tools |
| **Drawing Tools Ext** | `drawing-tools-ext.js` | — | Tier 3: Explode, Join, Break |
| **Advanced Tools** | `advanced-tools.js` | V1.2 | Arabeske-Tool, Aufteilen (CL2D/CLND/CLDCL) |
| **CAM Tools** | `cam-tools.js` | — | CAM-spezifische Werkzeuge |
| **Tool Manager** | `tool-manager.js` | V2.1 | Tool-Routing, Always-Active, Shortcut-Dispatch |
| **Command Line** | `command-line.js` | V1.0 | AutoCAD-style Prompt, Koordinaten-Parser, History |
| **Snap Manager** | `snap-manager.js` | V1.0 | 5 Snap-Typen + Ortho (F8), Snap-Indikatoren |
| **Layer Manager** | `layer-manager.js` | V1.0 | AutoCAD-Style Layers, ACI-Farben, Sichtbarkeit, Lock |
| **DXF Writer** | `dxf-writer.js` | V1.0 | DXF R12 (AC1009) Export |
| **SVG Parser** | `svg-parser.js` | — | SVG-Import |
| **CNC Reader** | `cnc-reader.js` | — | CNC-Datei Import |
| **Properties Panel** | `properties-panel.js` | V1.1 | Kontur-Eigenschaften, Piercing, Lead-In, Area-Class |
| **Text Tool** | `text-tool.js` | — | Text-Entities (opentype.js) |
| **Image Underlay** | `image-underlay.js` | — | Hintergrund-Bilder |
| **Dimension Tool** | `dimension-tool.js` | — | Bemaßung |
| **Measure Tool** | `measure-tool.js` | — | Messmodus |
| **Debug Monitor** | `debug-monitor.js` | V1.0 | Error-Catcher, Fallen-Erkennung, Strg+Shift+D Overlay |
| **Build-Info** | `build-info.js` | **V5.4.2** | Versions-Banner, Modul-Versionen, Changelog |
| **Konstanten** | `constants.js` | V2.7 ⚠️ | Toleranzen, Farben, Defaults (veraltet) |

---

## 🏗️ High-Level Architektur

### Daten-Pipeline (6-Step Wizard)

```
1. Datei       → DXFParser.parse() → Entities → chainContours() → CamContour[]
                 ODER: Zeichnen → DrawingTools → addEntity() → applyEntities() → Pipeline
2. Referenz    → Pipeline._detectReference() → größte rechteckige Kontur
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
│   ├── build-info.js                  ← Versions-Banner V5.4.2
│   ├── constants.js                   ← Toleranzen, Farben, Defaults (⚠️ V2.7)
│   ├── app.js                         ← Hauptanwendung V5.4.1
│   ├── dxf-parser.js                  ← DXF Parser V3.3
│   ├── geometry.js                    ← Geometrie-Kernel V2.9
│   ├── geometry-ops.js                ← GeometryOps V2.2 (Intersection, Arabeske)
│   ├── waricam-pipeline.js            ← Pipeline V3.1
│   ├── cam-contour.js                 ← Kontur-Klasse V4.6
│   ├── cerajet-engine.js              ← Technologie-Engine
│   ├── canvas-renderer.js             ← Canvas Rendering V3.7
│   ├── arc-fitting.js                 ← Arc Fitting V3.0
│   ├── undo-manager.js               ← Undo/Redo + Clipboard V1.0
│   ├── sinumerik-postprocessor.js     ← Sinumerik PP V1.2
│   ├── command-line.js                ← Command-Line UI V1.0
│   ├── snap-manager.js               ← Snap-System V1.0
│   ├── drawing-tools.js              ← CAD-Tools V2.1 (Tier 1 + Tier 2)
│   ├── drawing-tools-ext.js           ← Tier 3 (Explode, Join, Break)
│   ├── advanced-tools.js              ← Arabeske, Aufteilen
│   ├── cam-tools.js                   ← CAM-Werkzeuge
│   ├── tool-manager.js               ← Tool-Routing V2.1
│   ├── layer-manager.js              ← Layer-System V1.0
│   ├── dxf-writer.js                 ← DXF R12 Export V1.0
│   ├── svg-parser.js                  ← SVG-Import
│   ├── cnc-reader.js                  ← CNC-Import
│   ├── properties-panel.js            ← Eigenschaften-Panel V1.1
│   ├── text-tool.js                   ← Text-Entities (opentype.js)
│   ├── image-underlay.js             ← Hintergrund-Bilder
│   ├── dimension-tool.js             ← Bemaßung
│   ├── measure-tool.js               ← Messmodus
│   ├── debug-monitor.js              ← Debug-Overlay (Strg+Shift+D)
│   ├── opentype.min.js               ← Font-Rendering Library
│   └── package.json                   ← Node.js Metadaten
├── fonts/                             ← Font-Dateien (nicht in Git)
├── Examples/                          ← Test-DXF-Dateien
├── CHECKLIST.md                       ← Implementierungs-Checkliste
├── CLAUDE.md                          ← Diese Datei
└── README.md                          ← Projekt-Übersicht
```

---

## 🔥 Design-Patterns

### Command Pattern (Undo/Redo)
```javascript
// Jede Datenmutation über UndoManager:
app.undoManager.execute(new PropertyChangeCommand(contour, 'quality', newValue, () => {
    app.renderer?.render();
    app.updateContourPanel();
}));

// Batch-Operationen:
app.undoManager.beginGroup('Batch-Änderung');
// ... mehrere Commands ...
app.undoManager.endGroup();

// Slider: Snapshot bei input, Commit bei change
app._captureSnapshot();   // beim ersten input-Event
app._commitChanges();     // beim change-Event
```

### Modification-Tool Undo-Pattern (NEU V3.5)
```javascript
// Move/Rotate/Mirror/Scale: FunctionCommand mit Deep-Copy Snapshots
const snapshots = contours.map(c => ({ contour: c, oldPoints: deepCopy(c.points) }));
// ... Transformation ausführen ...
const newSnapshots = contours.map((c, i) => ({ ...snapshots[i], newPoints: deepCopy(c.points) }));

const cmd = new FunctionCommand(
    beschreibung,
    () => { /* Redo: newPoints setzen + ModificationTool.invalidateCache() */ },
    () => { /* Undo: oldPoints setzen + ModificationTool.invalidateCache() */ }
);
app.undoManager.undoStack.push(cmd);  // Direkt pushen, Aktion bereits ausgeführt

// CopyTool → AddContoursCommand
// EraseTool → DeleteContoursCommand
```

### Cache-Invalidation (NEU V3.5)
```javascript
// CamContour hat KEINE invalidate()-Methode — manuelle Cache-Löschung:
ModificationTool.invalidateCache(contour);
// Löscht: _cachedKerfPolyline, _cacheKey, _cachedLeadInPath, _cachedLeadOutPath, _cachedOvercutPath
```

### Click-Routing (NEU V3.5)
```
Canvas-Click → 
  1. ToolManager hat aktives Tool?     → tool.onClick(worldPos)
  2. Startpunkt-Modus?                 → handleStartpointClick()
  3. Messmodus?                        → handleMeasureClick()
  4. Kontextmenü offen?                → schließen
  5. Kontur unter Cursor (Hit-Test)?   → toggleSelection()
  6. Leere Fläche?                     → deselectAll()
```

### Keyboard-Shortcuts (V3.5)
| Shortcut | Aktion |
|----------|--------|
| L/C/N/A/P | Drawing Tools (Line/Circle/Rectangle/Arc/Polyline) |
| M | MoveTool (oder Messmodus wenn kein Tool-Kontext) |
| R | RotateTool |
| S | ScaleTool |
| Shift+C | CopyTool |
| Shift+M | MirrorTool |
| DEL | EraseTool |
| O | OffsetTool (Platzhalter) |
| F8 | Ortho Toggle |
| ESC | Escape-Kaskade: Tool → Measure → Startpoint → Selection |
| STRG+Z | Undo |
| STRG+Y / STRG+Shift+Z | Redo |
| STRG+C/X/V | Copy/Cut/Paste (Clipboard) |
| STRG+A | Alle selektieren |

### Debug-Logs mit Prefix
```javascript
console.log('[DXF Parser V3.2] Starting parse...');
console.log('[Pipeline V3.1] Topology: 5 discs, 2 holes');
console.log('[PP V1.0] Generiert: KERNKREIS.CNC — 12 Konturen');
console.log('[UndoManager V1.0] Ausgeführt: "Quality → 3"');
console.log('[DrawingTools V2.0] MoveTool: 3 contours moved');
```

### Weitere Patterns
- **Optional Chaining:** `this.renderer?.render()`
- **Wizard-Step:** Jeder Step hat UI-Element, Handler, Validation, render()
- **Corner-Lead:** `_isAtCorner()` → Linear statt Arc, Overcut=0
- **Collision Detection:** `_shortenLeadIfCollision()` → Lead am Schnittpunkt kürzen
- **Noun-Verb:** Selektieren → Tool-Shortcut → Tool arbeitet mit Selektion
- **Verb-Noun:** Tool-Shortcut → Selektieren → Enter/Space → Tool startet
- **Window-Selection:** L→R = nur innerhalb, R→L = berührt oder innerhalb
- **Ghost-Preview:** `toolManager.drawOverlay(ctx)` — halbtransparente Vorschau

---

## 🔧 Postprozessor (Sinumerik 840D)

Seit V1.0 (2026-02-13) funktional:

```
%_N_{PLANNAME}_MPF       — Hauptprogramm (Header, Plattendaten)
%_N_PARAMETER_SPF        — Technologie (R-Parameter R500–R915)
%_N_PART1_SPF            — Geometrie (Konturen mit G41/G42, G02/G03)
```

- Kerf: Controller-seitig (Koordinaten = Teile-Geometrie, nicht offset)
- Arc-Fitting: Polylinie → echte G02/G03 Bögen
- Speed-Ramping: Small Holes 20%, Normal 69%
- Slit: G91 G40 (inkrementell, ohne Kerf)

**Noch offen:** M03/M05 Pumpe, Z-Achse, Abrasiv-Steuerung

---

## 📋 Konventionen

**Versions-Pflege bei jeder Code-Änderung:**
1. `build-info.js` → Modul-Version + Build-Timestamp (YYYYMMDD-HHMM MEZ)
2. Datei-Header → Version, Last Modified, Build
3. `index.html` → `?v=` Cache-Busting hochzählen
4. Console-Logs → Versions-Prefix aktualisieren
5. `CLAUDE.md` → Modul-Tabelle aktualisieren bei Versions-Bumps
6. System-Anweisungen liegen in `.claude/` (nicht in Git)

**Code-Stil:** Deutsch (Kommentare, Doku), Optional Chaining, kategorisierte Logs

**Implementierung:** Phase 0 (Besprechen) → Phase 1 (Design) → Phase 2 (Code) → Phase 3 (Verifikation). Details: `CHECKLIST.md`

---

## ⚠️ Bekannte Einschränkungen

| Bereich | Status | Problem |
|---------|--------|---------|
| DXF-Parser | 🔴 | TEXT/DTEXT/HATCH nicht unterstützt |
| DXF-Parser | 🔴 | O(n³) Chaining bei >5000 Entities |
| Collision | 🟡 | Nur eigene Kontur, nicht Nachbar-Konturen |
| Lead-Routing | 🟡 | Kein Routing um Hindernisse |
| Postprozessor | 🟡 | M03/M05, Z-Achse, Abrasiv fehlen |
| Modification Tools | 🟡 | Offset nur Platzhalter (V2.1 geplant) |
| Modification Tools | 🟡 | CamContour hat keine clone()-Methode |
| Koordinatensystem | 🟡 | 90°-Drehung Software vs. Maschine (offen) |
| constants.js | 🟢 | Zeigt V2.7, App ist V3.5 |

---

## 📝 Nächste Prioritäten

1. **PP Praxistest** — CNC-Datei auf echter Sinumerik 840D validieren
2. **Tier 3 CAD-Tools** — Trim, Fillet, Chamfer, Extend, Break, Join, Explode, Offset
3. **PP vervollständigen** — M03/M05, Z-Achse, Abrasiv
4. **WARICAM 16-Varianten Sortierung** — 4 Ecken × 4 Formen
5. **Multi-Kontur Collision** — Lead vs. ALLE Konturen

---

## 🔄 Sync-Prüfung

Console-Ausgabe beim Laden:
```
╔══════════════════════════════════════════════════════════╗
║  WARICAM/CeraCAM V5.4.2 - Build 20260220-arabeske      ║
║  Last Modified: 2026-02-20 15:00 MEZ                    ║
╚══════════════════════════════════════════════════════════╝
[BUILD] Modules:
  dxf-parser: V3.3 (20260215-2330)
  geometry: V2.9 (20260128-0645)
  pipeline: V3.1 (20260212-1400)
  cam-contour: V4.6 (20260220-arcmeta)
  canvas-renderer: V3.7 (20260220-arclead)
  undo-manager: V1.0 (20260212-2000)
  sinumerik-pp: V1.2 (20260219-phaseB)
  command-line: V1.0 (20260213-1200)
  snap-manager: V1.0 (20260213-1200)
  geometry-ops: V2.2 (20260220-arabeske)
  drawing-tools: V2.1 (20260214-1600)
  tool-manager: V2.1 (20260215-1500)
  layer-manager: V1.0 (20260215-2200)
  dxf-writer: V1.0 (20260215-2200)
  app: V5.4.1 (20260220-ctx1)
  properties-panel: V1.1 (20260219-phaseB)
  debug-monitor: V1.0 (20260219-dm10)
```

**Fehlt diese Ausgabe?** → Syncthing hat nicht synchronisiert!

---

## 👤 Kontext

- **Entwickler:** Markus (Cerasell GmbH)
- **System-Anweisung:** `.claude/system-anweisung-v15.md` (verbindlich, nicht in Git)
- **Sprache:** Deutsch bevorzugt
