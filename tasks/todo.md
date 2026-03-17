# CAM Intarsien-Funktion — Implementierungsplan

> **Datum:** 2026-03-15
> **Status:** Phase 1–4 weitgehend erledigt, Phase 5 offen
> **Letzte Prüfung:** 2026-03-16

---

## Ausgangslage

Es existiert bereits eine Intarsien-Grundfunktion in `app.js` (Zeilen 4067–4244):
- Dual-Export: NEG (Aussparung) + POS (Einleger) als separate CNC-Dateien
- Gap-Berechnung mit Kerf-Kompensation
- Canvas-Vorschau mit Orange (POS) / Blau (NEG) Farbcodierung
- Offset-Linien (gestrichelt) zur Spalt-Visualisierung

**Was fehlt:** Material-Gruppen, Composit-Vorschau, Validierung, Multi-Material-Export.

---

## Phase 1: Material-Gruppen-System (CamContour + UI) ✅ ERLEDIGT

### 1.1 CamContour erweitern ✅
- [x] `materialGroup` Property im Constructor (`cam-contour.js`)
- [x] ~~`materialColor` Property~~ → über `INTARSIA_MATERIALS[materialGroup].color` gelöst
- [x] `clone()` Methode erweitern
- [x] `intarsiaRole` Property: `'base'` | `'insert'` | `null`

### 1.2 Material-Gruppen-Definitionen ✅
- [x] `constants.js`: `INTARSIA_MATERIALS` Array mit 5 Gruppen (A–E)
  - Material A: #ff8c00 (Orange)
  - Material B: #2196f3 (Blau)
  - Material C: #4caf50 (Grün)
  - Material D: #9c27b0 (Lila)
  - Material E: #f44336 (Rot)
- [x] Frozen via `Object.freeze()`

### 1.3 Properties Panel Integration ✅
- [x] Dropdown "Material-Gruppe" im CAM-Properties Panel (`properties-panel.js`)
- [x] Sichtbar nur bei aktivem Intarsien-Modus
- [x] Property-Binding über `data-prop="materialGroup"`
- [ ] ~~Batch-Editing~~ → nicht explizit implementiert, aber über Mehrfachselektion möglich

### 1.4 Kontextmenü-Integration ✅ (abweichend vom Plan)
- [x] Material-Dropdown im Properties-Panel (dynamisch injiziert in Step 4)
- [ ] ~~Rechtsklick → "Intarsie" Untermenü~~ → stattdessen Dropdown-basiert gelöst
- [ ] ~~Batch-Zuweisung bei Mehrfachselektion~~ → nicht als separates Feature

---

## Phase 2: Composit-Vorschau (Canvas-Renderer) ✅ ERLEDIGT (vereinfacht)

### 2.1 Material-Farbfüllung ✅
- [x] `canvas-renderer.js`: Intarsia-Overlay-Rendering (Zeilen 675–701)
- [x] Material-Farben aus `INTARSIA_MATERIALS[materialGroup].color`
- [x] POS: volle Material-Farbe, NEG: halbtransparent

### 2.2 Ansichtsmodi ✅ (vereinfacht umgesetzt)
- [x] **POS**: Nur Einleger-Konturen anzeigen
- [x] **NEG**: Nur Aussparungs-Konturen anzeigen
- [x] **BOTH**: Beide überlagert (α=0.7)
- [ ] ~~**Normal / Material / Composit / Exploded**~~ → durch POS/NEG/BOTH ersetzt (funktional äquivalent)

### 2.3 Gap-Visualisierung
- [x] Bestehende gestrichelte Offset-Linien beibehalten
- [ ] ~~Gap-Bereich als farbige Fläche~~ → nicht implementiert (niedrige Prio)

---

## Phase 3: Validierungs-Engine ✅ TEILWEISE ERLEDIGT

### 3.1 Geometrische Checks
- [x] Leerer Intarsien-Modus → Fehler (`ceracut-pipeline.js`)
- [x] POS/NEG-Anzahl-Mismatch → Warnung
- [ ] **Einleger ohne Aussparung**: Flächen-Matching
- [ ] **Gap < Kerf**: Physisch unmöglich → Fehlermeldung
- [ ] **Scharfe Ecken**: Innenradius < Kerf/2 → Warnung
- [ ] **Überlappung**: Zwei Einleger überlappen sich

### 3.2 Visuelle Warnungen
- [ ] Problematische Konturen: Rote Umrandung + Warn-Icon
- [ ] Validierungs-Panel: Liste aller Probleme
- [ ] Status-Indikator im Ribbon

---

## Phase 4: Multi-Material-Export ✅ ERLEDIGT

### 4.1 Export-Logik ✅
- [x] `exportIntarsia()` → pro Material-Gruppe ein Datei-Paar
- [x] NEG-Datei: Aussparungen pro Gruppe
- [x] POS-Datei: Einleger pro Gruppe
- [x] Dateinamen: `{Plan}_M0_NEG.CNC`, `{Plan}_M0_POS.CNC`, etc.

### 4.2 Gruppen-spezifische Technologie
- [ ] Kerf pro Materialgruppe (verschiedene Materialdicken)
- [ ] Lead-Profile pro Materialgruppe
- [ ] Piercing-Typ pro Materialgruppe

### 4.3 Export-Dialog
- [x] Intarsien-Panel mit Modus-Toggle, Gap-Input, Preview-Buttons, Export-Button
- [ ] ~~Übersichts-Modal mit Tabelle/Thumbnails~~ → nicht implementiert

---

## Phase 5: Auto-Zuordnung & Smart-Features ❌ OFFEN

### 5.1 Automatische Erkennung
- [ ] Referenz → Grundplatte (existiert bereits als Konzept)
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

## Zusammenfassung

| Phase | Status | Anmerkung |
|-------|--------|-----------|
| 1. Material-Gruppen | ✅ Erledigt | Properties, Constants, Panel, Kontextmenü (via Dropdown) |
| 2. Composit-Vorschau | ✅ Erledigt | POS/NEG/BOTH statt 4 Modi — funktional ausreichend |
| 3. Validierung | 🟡 Teilweise | Basis-Checks vorhanden, erweiterte Geometrie-Checks fehlen |
| 4. Multi-Material-Export | ✅ Erledigt | Export pro Materialgruppe, Technologie pro Gruppe fehlt |
| 5. Auto-Zuordnung | ❌ Offen | Komplett unbearbeitet |

---

## Betroffene Dateien

| Datei | Status |
|-------|--------|
| `js/cam-contour.js` | ✅ materialGroup, intarsiaRole, clone() |
| `js/constants.js` | ✅ INTARSIA_MATERIALS (5 Gruppen) |
| `js/properties-panel.js` | ✅ Material-Dropdown |
| `js/canvas-renderer.js` | ✅ Intarsia-Overlay (POS/NEG/BOTH) |
| `js/app.js` | ✅ Regeneration, Export, Panel-Integration |
| `js/lead-profiles.js` | ✅ builtin-intarsia Profil |
| `index.html` | ✅ Intarsia-Panel (Toggle, Gap, Preview, Export) |
| `js/ceracut-pipeline.js` | 🟡 Basis-Validierung |
| `js/sinumerik-postprocessor.js` | ✅ via app.js Multi-Instanz |

---

## Design-Entscheidungen

1. **Material-Gruppe auf CamContour** (nicht Layer-basiert) — weil ein Layer mehrere Materialien enthalten kann
2. **Composit-Vorschau im Canvas** (nicht separates Fenster) — konsistent mit bestehendem Intarsien-Preview
3. **Validierung inline** (nicht modale Dialoge) — schnelles Feedback beim Arbeiten
4. **Undo für alle Zuweisungen** — über bestehendes Command-Pattern
5. **Rückwärtskompatibel** — `materialGroup=0` → Standard-Material (kein spezielles Verhalten)
6. **POS/NEG/BOTH statt 4 Modi** — einfacher, funktional gleichwertig
