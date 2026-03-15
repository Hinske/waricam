# CeraCUT V5.9 — Wasserstrahl-CAM Software

**DXF → Sinumerik 840D CNC-Code** für CNC-Wasserstrahlschneiden.

Entwickelt von **Cerasell GmbH** | Build `20260315-bugfix36`

---

## Features

### Import & Zeichnen
- **DXF-Import** — LINE, LWPOLYLINE, CIRCLE, ARC, SPLINE, ELLIPSE, INSERT/BLOCK, TEXT/MTEXT, HATCH
- **SVG-Import** und **CNC-Import**
- **CAD-Tools** — Line, Circle, Rectangle, Arc, Polyline, Ellipse, Spline, Donut, Text
- **Modifikation** — Move, Copy, Rotate, Mirror, Scale, Erase, Fillet, Trim, Extend, Offset, Chamfer, Break, Explode, Join
- **AutoCAD-Workflow** — Noun-Verb/Verb-Noun, Command-Line, Shortcuts, Continuous Mode, Window-Selection

### CAM-Pipeline (6-Step Wizard)
1. **Datei** — DXF laden oder direkt zeichnen
2. **Referenz** — Automatische Plattenerkennung (groesste rechteckige Kontur)
3. **Nullpunkt** — Material-Ecke setzen
4. **Schneiden** — Lead-In/Out, Kerf-Offset, Overcut, Slit, MicroJoints, Flaechen-Klassen
5. **Reihenfolge** — TSP-Sortierung (Inside-Out), Drag&Drop
6. **Export** — Sinumerik 840D MPF/SPF-Dateien

### CNC-Ausgabe (Sinumerik 840D)
- 3-in-1 MPF (Hauptprogramm + Parameter + Geometrie)
- G41/G42 Kerf-Kompensation (Controller-seitig)
- Arc-Fitting (Polylinie → echte G02/G03 Boegen)
- Multi-Head Unterstuetzung
- Speed-Ramping, Quality Zones, Piercing-Types
- Machine-Profile Verwaltung

### Weitere Funktionen
- **Nesting** — BLF-Algorithmus, Multi-Rotation, Multi-Sheet
- **Toolpath-Simulation** — Pfad-Verifikation mit Kollisionsmatrix
- **Kostenkalkulation** — Zeit-/Materialkosten mit CeraJet-Integration
- **Bridge Cutting** — Haltestege (automatisch/manuell)
- **Quality Zones** — Automatische Ecken-/Radien-Erkennung mit Speed-Reduktion
- **Snap-System** — 9 Snap-Typen + Ortho (F8)
- **Layer-System** — AutoCAD-Style mit ACI-Farben
- **Undo/Redo** — Command Pattern mit Clipboard
- **DXF-Export** — R12 (AC1009) Format
- **Workspace** — Projekt-Verwaltung mit Auto-Save (IndexedDB + FSAPI)
- **Debug Monitor** — Error-Catcher, Strg+Shift+D Overlay

---

## Quick Start

### Development (Port 3000)
```bash
npm run dev
```

### Produktion (Port 5000, HTTPS)
```bash
npm run serve
```
HTTPS-Zertifikat wird beim ersten Start automatisch generiert (`certs/`).
Ohne HTTPS: `NO_HTTPS=1 node server.js`

### Ohne Server
```bash
# Einfach im Browser oeffnen
open index.html
```

---

## Tastenkuerzel

### Zeichnen
| Taste | Funktion |
|-------|----------|
| `L` | Linie |
| `C` | Kreis |
| `N` / `REC` | Rechteck |
| `A` | Bogen |
| `P` / `PL` | Polylinie |

### Modifikation
| Taste | Funktion |
|-------|----------|
| `M` | Verschieben |
| `CO` | Kopieren |
| `R` / `RO` | Drehen |
| `MI` | Spiegeln |
| `S` / `SC` | Skalieren |
| `E` / `DEL` | Loeschen |
| `X` | Explodieren |
| `J` | Verbinden |
| `B` | Brechen |
| `O` | Offset |
| `OBREAK` | Overlap Break |

### System
| Taste | Funktion |
|-------|----------|
| `F3` | Messmodus |
| `F8` | Ortho Toggle |
| `H` / `PAN` | Verschiebe-Hand |
| `ESC` | Abbrechen (Kaskade: Tool → Measure → Startpoint → Selection) |
| `Strg+Z` | Undo |
| `Strg+Y` | Redo |
| `Strg+C/X/V` | Copy/Cut/Paste |
| `Strg+A` | Alles selektieren |
| `Strg+S` | DXF Speichern |
| `Strg+Shift+S` | DXF Speichern unter |
| `Strg+P` | Drucken |
| `Strg+Shift+D` | Debug Monitor |
| `Rechtsklick` | Bestaetigen / Kontextmenu |

---

## Projektstruktur

```
ceraCUT/
├── server.js                    # Node.js HTTPS-Server + DXF-Browse-API
├── index.html                   # UI (Wizard, Ribbon, Command-Line)
├── styles.css                   # Dark Theme
├── js/
│   ├── app.js                   # Hauptanwendung (V5.9)
│   ├── dxf-parser.js            # DXF-Parser (V3.8)
│   ├── geometry.js              # Geometrie-Kernel (V2.9)
│   ├── geometry-ops.js          # GeometryOps (V2.4)
│   ├── cam-contour.js           # Kontur-Klasse (V4.9)
│   ├── ceracut-pipeline.js      # CAM-Pipeline (V3.2)
│   ├── canvas-renderer.js       # Canvas-Rendering (V3.15)
│   ├── sinumerik-postprocessor.js # Sinumerik 840D PP (V1.4)
│   ├── arc-fitting.js           # Arc-Fitting (V3.1)
│   ├── drawing-tools.js         # CAD-Tools (V2.5)
│   ├── advanced-tools.js        # Fillet/Trim/Offset (V1.4)
│   ├── nesting.js               # Nesting-Engine (V1.1)
│   ├── undo-manager.js          # Undo/Redo (V1.1)
│   ├── snap-manager.js          # Snap-System (V1.3)
│   ├── tool-manager.js          # Tool-Routing (V2.2)
│   ├── dxf-writer.js            # DXF-Export (V1.2)
│   ├── cost-calculator.js       # Kalkulation (V1.1)
│   └── ...                      # 20+ weitere Module
├── Examples/                    # Test-DXF-Dateien
├── certs/                       # TLS-Zertifikate (auto-generiert)
├── fonts/                       # Font-Dateien
└── CLAUDE.md                    # Entwickler-Dokumentation
```

---

## Technologie

- **Frontend:** Vanilla JavaScript, HTML5 Canvas — kein Framework, kein Build-Tool
- **Server:** Node.js (HTTP/HTTPS Dual-Protocol, Auto-TLS)
- **Sync:** Syncthing (bidirektional zwischen Entwicklung und CNC-Rechner)
- **Postprozessor:** Sinumerik 840D (MPF/SPF)

---

## Version

**V5.9** — Build 20260315-bugfix36

35+ Module | 4500+ Zeilen Geometrie-Kernel | Sinumerik 840D Postprozessor

---

## Lizenz

Proprietary — Cerasell GmbH
