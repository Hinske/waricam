# CAM Intarsien-Funktion — Implementierungsplan

> **Datum:** 2026-03-15
> **Branch:** `claude/cam-inlay-function-design-RSDBY`
> **Status:** Design-Phase

---

## Ausgangslage

Es existiert bereits eine Intarsien-Grundfunktion in `app.js` (Zeilen 4067–4244):
- Dual-Export: NEG (Aussparung) + POS (Einleger) als separate CNC-Dateien
- Gap-Berechnung mit Kerf-Kompensation
- Canvas-Vorschau mit Orange (POS) / Blau (NEG) Farbcodierung
- Offset-Linien (gestrichelt) zur Spalt-Visualisierung

**Was fehlt:** Material-Gruppen, Composit-Vorschau, Validierung, Multi-Material-Export.

---

## Phase 1: Material-Gruppen-System (CamContour + UI)

### 1.1 CamContour erweitern
- [ ] `materialGroup` Property im Constructor (`cam-contour.js`)
- [ ] `materialColor` Property (optionale Überschreibung)
- [ ] `clone()` Methode erweitern
- [ ] `intarsiaRole` Property: `'base'` | `'inlay'` | `null` (auto-detect vs. manuell)

### 1.2 Material-Gruppen-Definitionen
- [ ] `constants.js`: `INTARSIA_MATERIALS` Map mit Default-Gruppen
  - Gruppe A (Standard): Farbe #2196F3 (Blau)
  - Gruppe B: Farbe #FF8C00 (Orange)
  - Gruppe C: Farbe #4CAF50 (Grün)
  - Gruppe D: Farbe #E91E63 (Pink)
  - "Grundplatte": Farbe #78909C (Grau)
- [ ] Jede Gruppe speichert: `id`, `name`, `color`, `kerfWidth`, `gap`

### 1.3 Properties Panel Integration
- [ ] Dropdown "Material-Gruppe" im CAM-Properties Panel
- [ ] Batch-Editing: Mehrere Konturen → gleiche Gruppe zuweisen
- [ ] Undo/Redo Support via `PropertyChangeCommand`

### 1.4 Kontextmenü-Integration
- [ ] Rechtsklick → "Intarsie" Untermenü:
  - "Als Grundplatte"
  - "Material A / B / C / D"
  - "Nicht zugeordnet"
- [ ] Batch-Zuweisung bei Mehrfachselektion

---

## Phase 2: Composit-Vorschau (Canvas-Renderer)

### 2.1 Material-Farbfüllung
- [ ] `canvas-renderer.js`: Neue Methode `_drawIntarsiaFill(ctx, contour)`
- [ ] Halbtransparente Füllung in Material-Farbe (alpha 0.25)
- [ ] Even-Odd-Rule für Löcher beibehalten
- [ ] Grundplatte: Grau gefüllt mit Aussparungs-Löchern

### 2.2 Ansichtsmodi (Toggle-Buttons im Ribbon)
- [ ] **Normal**: Keine Intarsien-Färbung (wie bisher)
- [ ] **Material**: Jede Gruppe in eigener Farbe gefüllt (Einzelteile)
- [ ] **Composit**: Einleger IN den Aussparungen angezeigt (Endprodukt)
- [ ] **Exploded**: Materialgruppen nebeneinander (mit Zuordnungspfeilen)

### 2.3 Gap-Visualisierung
- [ ] Bestehende gestrichelte Offset-Linien beibehalten
- [ ] Zusätzlich: Gap-Bereich als dünne farbige Fläche zwischen POS und NEG

---

## Phase 3: Validierungs-Engine

### 3.1 Geometrische Checks
- [ ] **Einleger ohne Aussparung**: Flächen-Matching per Hausdorff-Distanz oder Area-Vergleich
- [ ] **Aussparung ohne Einleger**: Löcher in Grundplatte ohne zugewiesene Gruppe
- [ ] **Gap < Kerf**: Physisch unmöglich → Fehlermeldung
- [ ] **Scharfe Ecken**: Innenradius < Kerf/2 → Warnung (Strahlablenkung)
- [ ] **Überlappung**: Zwei Einleger-Konturen überlappen sich

### 3.2 Visuelle Warnungen
- [ ] Problematische Konturen: Rote gestrichelte Umrandung + Warn-Icon
- [ ] Validierungs-Panel: Liste aller Probleme mit "Zur Kontur springen"
- [ ] Status-Indikator im Ribbon: Grün (OK) / Gelb (Warnungen) / Rot (Fehler)

---

## Phase 4: Multi-Material-Export

### 4.1 Export-Logik erweitern
- [ ] `exportIntarsia()` → pro Material-Gruppe eine CNC-Datei
- [ ] NEG-Datei: Grundplatte mit ALLEN Aussparungen
- [ ] POS-Dateien: Je eine pro Materialgruppe
- [ ] Dateinamen: `{Plan}_NEG.MPF`, `{Plan}_POS_A.MPF`, `{Plan}_POS_B.MPF`

### 4.2 Gruppen-spezifische Technologie
- [ ] Kerf pro Materialgruppe (verschiedene Materialdicken)
- [ ] Lead-Profile pro Materialgruppe (Stahl vs. Glas vs. Aluminium)
- [ ] Piercing-Typ pro Materialgruppe

### 4.3 Export-Dialog
- [ ] Übersichts-Modal vor Export:
  - Tabelle: Gruppe | Konturen | Material | Kerf | Dateiname
  - Vorschau-Thumbnail pro Gruppe
  - "Alle exportieren" / "Einzeln exportieren"

---

## Phase 5: Auto-Zuordnung & Smart-Features

### 5.1 Automatische Erkennung
- [ ] Referenz → Grundplatte (existiert bereits)
- [ ] Holes in Grundplatte → Automatisch als Aussparung markieren
- [ ] Freie Discs → "Potenzielle Einleger" vorschlagen
- [ ] Shape-Matching: Disc-Form ≈ Hole-Form → Zuordnungs-Vorschlag

### 5.2 Externer Einleger-Import
- [ ] Separates DXF als Einleger importieren
- [ ] Positionierung auf Grundplatte (Drag & Drop)
- [ ] Auto-Erzeugung der passenden Aussparung (Einleger + Gap → Hole)

### 5.3 Nesting pro Materialgruppe
- [ ] Bestehende Nesting-Engine wiederverwenden
- [ ] Pro Materialgruppe: Separate Tafel-Definition
- [ ] Verschachtelung der Einleger auf ihrer jeweiligen Material-Tafel

---

## Implementierungsreihenfolge

| Prio | Phase | Aufwand | Dateien |
|------|-------|---------|---------|
| 1 | 1.1–1.2 | Klein | `cam-contour.js`, `constants.js` |
| 2 | 1.3–1.4 | Mittel | `properties-panel.js`, `app.js` |
| 3 | 2.1 | Mittel | `canvas-renderer.js` |
| 4 | 2.2 | Klein | `index.html`, `canvas-renderer.js` |
| 5 | 3.1–3.2 | Mittel | Neue Datei oder in `app.js` |
| 6 | 4.1–4.3 | Groß | `app.js`, `sinumerik-postprocessor.js` |
| 7 | 5.1–5.3 | Groß | `ceracut-pipeline.js`, `nesting.js` |

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `js/cam-contour.js` | +2 Properties, clone() erweitern |
| `js/constants.js` | +`INTARSIA_MATERIALS` Map |
| `js/properties-panel.js` | +Material-Dropdown, Batch-Edit |
| `js/canvas-renderer.js` | +Material-Farbfüllung, Composit-Modus |
| `js/app.js` | Kontextmenü, Export-Erweiterung, Validierung |
| `index.html` | Ansichtsmodi-Buttons, Export-Dialog |
| `js/sinumerik-postprocessor.js` | Multi-Datei-Export |
| `js/ceracut-pipeline.js` | Auto-Zuordnung (Phase 5) |

---

## Design-Entscheidungen

1. **Material-Gruppe auf CamContour** (nicht Layer-basiert) — weil ein Layer mehrere Materialien enthalten kann
2. **Composit-Vorschau im Canvas** (nicht separates Fenster) — konsistent mit bestehendem Intarsien-Preview
3. **Validierung inline** (nicht modale Dialoge) — schnelles Feedback beim Arbeiten
4. **Undo für alle Zuweisungen** — über bestehendes Command-Pattern
5. **Rückwärtskompatibel** — `materialGroup=null` → kein Intarsien-Verhalten (wie bisher)
