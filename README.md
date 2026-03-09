# CeraCAM - Waterjet CAM Software

CAM-Software für CNC-Wasserstrahlschneiden. Basiert auf dem WARICAM-Format.

## Features

- DXF Import (LINE, LWPOLYLINE, CIRCLE, ARC, SPLINE, ELLIPSE, INSERT/BLOCK)
- Auto-Normalisierung georeferenzierter Koordinaten
- Kerf-Kompensation mit Area-Proof Validierung
- Topologie-Analyse (Disc/Hole Detection)
- Lead-In/Lead-Out Berechnung
- Messwerkzeug mit Snap (Endpoint, Midpoint, Center)

## Quick Start

```bash
# Projekt öffnen
open index.html
```

Oder mit lokalem Server:
```bash
npx serve .
```

## Tastenkürzel

| Taste | Funktion |
|-------|----------|
| `M` | Messmodus |
| `ESC` | Abbrechen |
| `Space` | Zoom Fit |
| `Shift+Drag` | Pan |
| `Scroll` | Zoom |

## Projektstruktur

```
├── index.html          # Entry Point
├── styles.css          # Styling
├── constants.js        # Zentrale Konstanten
├── app.js              # Application Core
├── canvas-renderer.js  # Rendering Engine
├── geometry.js         # Geometrie-Kernel
├── dxf-parser.js       # DXF Import
├── cam-contour.js      # Konturen-Datenmodell
├── waricam-pipeline.js # Processing Pipeline
├── ROADMAP.md          # Feature Roadmap
└── Examples/           # Test-DXF-Dateien
```

## Version

V2.7 - 2026-01-26

## Lizenz

Proprietary - Cerasell GmbH
