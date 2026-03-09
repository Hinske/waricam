# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Letzte Aktualisierung:** 2026-02-14
> **Version:** V3.5
> **Build:** 20260214-1400 MEZ

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
| Version | **V3.5** |
| Typ | Wasserstrahl-CAM Software |
| Zweck | DXF → Sinumerik 840D CNC-Code für Wasserstrahlschneiden |
| Firma | Cerasell GmbH |

---

## 🛠️ Module & Versionen (Stand 2026-02-14)

| Modul | Datei | Version | Verantwortung |
|-------|-------|---------|---------------|
| **App** | `app.js` | **V3.5** | 6-Step Wizard, Kontextmenü, Export-Modal, Undo-Integration, Always-Active ToolManager, Click-Routing, Window-Selection |
| **Geometry** | `geometry.js` | V2.9 | Vektoren, SplineUtils (De Boor), MicroHealing (5-Stage), Shoelace |
| **DXF-Parser** | `dxf-parser.js` | V3.2 | DXF → Entities, SPLINE-Tessellation, Grid-Chaining |
| **CAMContour** | `cam-contour.js` | V4.4 | Lead-In/Out, Overcut, Collision, Slit, Kerf-Flip |
| **Renderer** | `canvas-renderer.js` | **V3.5** | Canvas-Rendering, Hit-Testing, Startpunkt-Drag, DPR-Fix, Drawing-Overlay, Snap-Crosshair, Window-Selection-Rect |
| **Postprozessor** | `sinumerik-postprocessor.js` | V1.0 | Sinumerik 840D MPF, 3-in-1 Dateistruktur, G41/G42, Arc-Fitting |
| **UndoManager** | `undo-manager.js` | V1.0 | Command Pattern, Undo/Redo, Clipboard (Copy/Cut/Paste) |
| **Arc-Fitting** | `arc-fitting.js` | V3.0 | Polylinie → G02/G03 Bögen (für PP-Ausgabe) |
| **Pipeline** | `waricam-pipeline.js` | V3.1 | Topologie (disc/hole/reference/slit), Kerf-Offset |
| **Drawing Tools** | `drawing-tools.js` | **V2.0** | Tier 1: 5 CAD-Tools (L/C/N/A/P) + Tier 2: 6 Modification-Tools (Move/Copy/Rotate/Mirror/Scale/Erase), Ghost-Preview, Cache-Invalidation |
| **Command Line** | `command-line.js` | V1.0 | AutoCAD-style Prompt, Koordinaten-Parser, History |
| **Snap Manager** | `snap-manager.js` | V1.0 | 5 Snap-Typen + Ortho (F8), Snap-Indikatoren |
| **Build-Info** | `build-info.js` | **V3.5** | Versions-Banner in Console, Modul-Versionen, Changelog |
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
├── index.html                         ← UI (6-Step Wizard, Export-Modal, Draw-Toolbar, Command-Line)
├── styles.css                         ← Dark Theme (WARICAM Blue)
├── js/
│   ├── build-info.js                  ← Versions-Banner V3.5
│   ├── constants.js                   ← Toleranzen, Farben, Defaults (⚠️ V2.7)
│   ├── app.js                         ← Hauptanwendung V3.5
│   ├── dxf-parser.js                  ← DXF Parser V3.2
│   ├── geometry.js                    ← Geometrie-Kernel V2.9
│   ├── waricam-pipeline.js            ← Pipeline V3.1
│   ├── cam-contour.js                 ← Kontur-Klasse V4.4
│   ├── canvas-renderer.js             ← Canvas Rendering V3.5
│   ├── arc-fitting.js                 ← Arc Fitting V3.0
│   ├── undo-manager.js               ← Undo/Redo + Clipboard V1.0
│   ├── sinumerik-postprocessor.js     ← Sinumerik PP V1.0
│   ├── command-line.js                ← Command-Line UI V1.0
│   ├── snap-manager.js               ← Snap-System V1.0
│   ├── drawing-tools.js              ← CAD-Tools V2.0 (Tier 1 + Tier 2)
│   └── package.json                   ← Node.js Metadaten
├── Examples/                          ← Test-DXF-Dateien
├── changes/                           ← Änderungs-Dokumentation
├── system-anweisung-v7.md             ← System-Anweisung V7.0 (verbindlich)
├── CHECKLIST.md                       ← Implementierungs-Checkliste
├── CLAUDE.md                          ← Diese Datei
├── TODO.md                            ← Feature-Backlog (⚠️ teilweise veraltet)
├── ROADMAP.md                         ← Roadmap (⚠️ teilweise veraltet)
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
6. `system-anweisung-v7.md` → bei signifikanten Feature-Änderungen

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
║  WARICAM/CeraCAM V3.5 - Build 20260214-1400            ║
║  Last Modified: 2026-02-14 14:00 MEZ                    ║
╚══════════════════════════════════════════════════════════╝
[BUILD] Modules:
  dxf-parser: V3.2 (20260212-1400)
  geometry: V2.9 (20260128-0645)
  pipeline: V3.1 (20260212-1400)
  cam-contour: V4.4 (20260211-1800)
  canvas-renderer: V3.5 (20260214-1400)
  undo-manager: V1.0 (20260212-2000)
  sinumerik-pp: V1.0 (20260213-1000)
  command-line: V1.0 (20260213-1200)
  snap-manager: V1.0 (20260213-1200)
  drawing-tools: V2.0 (20260214-1400)
  app: V3.5 (20260214-1400)
```

**Fehlt diese Ausgabe?** → Syncthing hat nicht synchronisiert!

---

## 👤 Kontext

- **Entwickler:** Markus (Cerasell GmbH)
- **System-Anweisung:** `system-anweisung-v7.md` (verbindlich)
- **Sprache:** Deutsch bevorzugt
