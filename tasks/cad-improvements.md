# CAD-Verbesserungen — Roadmap zum AutoCAD-Clone

> **Datum:** 2026-03-17
> **Status:** Phase 1 Quick Wins umgesetzt (V6.10)
> **Kontext:** Umfassende Analyse aller CAD-Module vs. AutoCAD-Features

---

## Zusammenfassung

CeraCUT hat 45+ Tools mit AutoCAD-konformem Workflow (Noun-Verb/Verb-Noun, Continuous Mode, 9 Snap-Typen, Dynamic Input). Es gibt aber klare Lücken in UI-Discoverability, Interaktion und Power-User-Features.

---

## Phase 1: Quick Wins (je 1–2 Tage)

### 1.1 Crossing-Selection fixen ✅ (bereits implementiert)
- [x] R→L Window-Selection: `_contourTouchesRect()` prüft "berührt ODER enthält" — war bereits korrekt
- **Datei:** `drawing-tools.js` (Window-Selection-Logik)
- **AutoCAD:** L→R = Window (nur innerhalb), R→L = Crossing (berührt + enthält)

### 1.2 Command-Line History Navigation ✅ (V6.10)
- [x] ArrowUp/ArrowDown → durch letzte Befehle blättern
- [x] Input-Feld mit historischem Befehl befüllen
- **Datei:** `command-line.js` V1.3
- **Implementierung:** `commandHistory[]` + `_navigateHistory()` + `_pushCommandHistory()`

### 1.3 Locked-Layer Selection blockieren ✅ (V6.10)
- [x] `findContourAtPoint()` → Konturen auf gelockten Layern überspringen
- [x] `_hitTestStartTriangle()` → Layer-Check hinzugefügt
- [x] `endWindowSelection()` → gesperrte Layer ausgeschlossen
- **Dateien:** `canvas-renderer.js` V3.31, `drawing-tools.js` V2.8

### 1.4 Status-Bar aufwerten ✅ (V6.10)
- [x] Snap-Modi-Anzeige (END MID CEN QUA INT PER TAN NEA — aktive gelb)
- [x] Ortho-Indikator (F8 aktiv/inaktiv) — war bereits vorhanden
- [x] Grid-Status-Anzeige — war bereits vorhanden
- **Dateien:** `index.html`, `styles.css`, `app.js` V6.10

### 1.5 Input-Validation-Feedback ✅ (V6.10)
- [x] Ungültige Eingaben → rote Fehlermeldung in Command-Line History
- [x] Format: `"Ungültige Eingabe: "xyz" — Erwartet: Koordinaten (100,50), relativ (@25,10) oder Distanz (25)"`
- **Datei:** `command-line.js` V1.3

---

## Phase 2: Core UI (je 3–5 Tage)

### 2.1 OSNAP-Toggle-Dialog (F3)
- [ ] Modal/Panel mit Checkbox pro Snap-Typ (Endpoint, Midpoint, Center, etc.)
- [ ] Schnell-Toggle: Alle an / Alle aus
- [ ] Status in localStorage persistieren
- **Dateien:** `index.html`, `snap-manager.js`, `app.js`

### 2.2 Layer-Manager-Dialog ✅ (bereits implementiert, V1.1 mit Drag-Reorder)
- [x] Modal mit Spalten: Name | Sichtbarkeit 👁 | Lock 🔒 | Farbe | Linientyp | Entities
- [x] Layer umbenennen, umsortieren, Farbe ändern
- [x] Layer "0" geschützt (nicht löschbar, nicht verschiebbar)
- [x] Drag-to-Reorder mit ≡ Handle (Layer "0" bleibt oben)
- **Dateien:** `layer-manager.js` V1.1, `app.js`, `styles.css`

### 2.3 Dockbares Properties-Panel
- [ ] Rechte Sidebar, dauerhaft sichtbar (Toggle F11 oder Button)
- [ ] Tabs: CAM | Geometrie | Darstellung
- [ ] Computed Info: Fläche (mm²), Umfang (mm), Konturen-Anzahl
- [ ] Batch-Editing für alle Eigenschaften (nicht nur Quality/Kerf)
- **Dateien:** `properties-panel.js`, `index.html`, `styles.css`

### 2.4 Undo-History-Dropdown
- [ ] Button neben Undo → Dropdown mit letzten 20 Aktionen
- [ ] Klick auf Eintrag → springt zu diesem Punkt (undo/redo N Schritte)
- [ ] Visueller Separator zwischen Geometrie- vs. Property-Änderungen
- **Dateien:** `index.html`, `undo-manager.js`, `app.js`

### 2.5 Grid-Customization
- [ ] Input-Feld für Grid-Größe (mm) im Ansicht-Tab
- [ ] Presets: 1, 5, 10, 25, 50 mm
- [ ] Grid-Toggle Shortcut sichtbar machen (G-Taste)
- **Dateien:** `canvas-renderer.js`, `index.html`

---

## Phase 3: Power Features (je 1–2 Wochen)

### 3.1 Dynamic Input editierbar
- [ ] HUD-Felder fokussierbar + editierbar machen
- [ ] Tab/Shift+Tab wechselt zwischen X → Y → Distanz → Winkel
- [ ] Wert eingeben + Enter = Punkt setzen
- [ ] Polar-Koordinaten anzeigen: `dist<angle`
- [ ] Ortho-Indikator im HUD wenn F8 aktiv
- **Datei:** `dynamic-input.js`

### 3.2 Match Properties Tool (MA)
- [ ] Quell-Kontur klicken → Eigenschaften übernehmen (Quality, Kerf, Lead, Material)
- [ ] Auf Ziel-Konturen klicken → Properties anwenden
- [ ] Continuous Mode bis ESC
- **Dateien:** `advanced-tools.js` oder neues Tool, `constants.js` (TOOL_TOOLTIPS)

### 3.3 Quick-Select Filter (QS)
- [ ] Dialog: Filter nach Fläche, Quality, Layer, Typ (Disc/Hole/Slit)
- [ ] Ergebnis → Konturen selektieren
- [ ] Batch-Operationen auf Ergebnis anwenden
- **Dateien:** `app.js`, `index.html`

### 3.4 Snap-Tracking-Linien
- [ ] Gestrichelte Referenzlinien wenn Cursor mit Snap-Punkten fluchtet
- [ ] Horizontal + Vertikal + aus letztem Punkt
- [ ] Visuell dezent (hellgrau, gestrichelt)
- **Dateien:** `snap-manager.js`, `canvas-renderer.js`

### 3.5 Property-Presets
- [ ] Eigenschafts-Sets speichern: "Standard-Disc", "Fein-Loch", "Gravur"
- [ ] Per Klick auf Kontur(en) anwenden
- [ ] localStorage-Persistenz
- **Dateien:** `properties-panel.js`, `constants.js`

### 3.6 Cycle-Selection bei Überlappung
- [ ] Shift+Klick auf gleiche Stelle → nächste darunter liegende Kontur selektieren
- [ ] Durchklick-Liste mit Index-Tracking
- **Datei:** `canvas-renderer.js`

### 3.7 Vollbild-Fadenkreuz (optional)
- [ ] Cursor-Crosshair über gesamten Canvas (AutoCAD-Style)
- [ ] Toggle im Ansicht-Tab oder Shortcut
- **Datei:** `canvas-renderer.js`

---

## Phase 4: Fehlende AutoCAD-Tools

### 4.1 Tan-Tan-Tan Kreis fertigstellen
- [ ] 3 Tangenten → Kreis berechnen (Apollonius-Problem)
- [ ] Stub in `drawing-tools.js` bereits vorhanden
- **Datei:** `drawing-tools.js`, `geometry.js`

### 4.2 Spline-Vertex-Editing
- [ ] Nach Erstellung: Kontrollpunkte verschiebbar
- [ ] Grips auf Kontrollpunkten anzeigen
- **Dateien:** `drawing-tools-ext.js`, `canvas-renderer.js`

### 4.3 Erweiterte Linientypen
- [ ] Phantom, Divide, Border, Center, Hidden etc.
- [ ] Linientyp-Preview im Layer-Dialog
- [ ] Custom-Pattern-Editor (optional)
- **Datei:** `layer-manager.js`, `canvas-renderer.js`

### 4.4 Block/Symbol-Bibliothek
- [ ] Konturen als Block speichern (Name + Geometrie)
- [ ] Block einfügen mit Skalierung + Rotation
- [ ] Explode zum Auflösen
- **Neue Datei:** `block-manager.js`

### 4.5 Command-Line Auto-Complete
- [ ] Tab vervollständigt Befehle (REC → RECTANGLE)
- [ ] Prefix-Matching: R → zeigt ROTATE, RECTANGLE, REC
- [ ] Option-Brackets: `[R]adius / D[urchmesser]`
- **Datei:** `command-line.js`

---

## Phase 5: KI-Integration

### 5.1 Smart Defaults (regelbasiert, kein Backend)
- [ ] Kerf/Quality/Lead basierend auf Kontur-Geometrie vorschlagen
- [ ] Fläche + Umfang + Form → Lookup-Table
- [ ] Snap-Typ-Priorisierung lernen (Statistik in localStorage)
- **Dateien:** `cam-contour.js`, `snap-manager.js`

### 5.2 Natural Language Commands (Claude API)
- [ ] Textfeld oder Chat-Eingabe: "Zeichne Rechteck 100x50 mit 5mm Fillet"
- [ ] Claude API Tool-Use → Tool-Sequenz ausführen
- [ ] Kontext: aktive Layer, aktuelle Selektion, Canvas-Zustand
- **Neue Datei:** `ai-assistant.js`
- **Technologie:** Claude API + Tool-Use

### 5.3 DXF-Cleanup-Assistent
- [ ] Importierte DXFs analysieren: doppelte Linien, Micro-Gaps, offene Konturen
- [ ] Automatische Reparatur-Vorschläge mit Preview
- [ ] "Fix All" oder einzeln bestätigen
- **Dateien:** `dxf-parser.js`, neuer Cleanup-Dialog

### 5.4 Proaktive Fehler-Erkennung
- [ ] Zu spitze Winkel für Wasserstrahl erkennen
- [ ] Zu kleine Innenradien warnen
- [ ] Selbstüberschneidungen markieren
- [ ] Warnung bei nicht-schneidbaren Features
- **Dateien:** `ceracut-pipeline.js`, `canvas-renderer.js`

### 5.5 Automatische Lead-Platzierung (KI-gestützt)
- [ ] Scoring-Funktion: Materialfluss, Kollisionsvermeidung, Qualität
- [ ] Gewichtete Kriterien pro Kontur-Typ
- [ ] Vorschlag mit Confidence-Score anzeigen
- **Dateien:** `cam-contour.js`, `ceracut-pipeline.js`

### 5.6 Sketch-to-CAD (langfristig)
- [ ] Foto/Handskizze → saubere Geometrie
- [ ] Edge-Detection + Vectorization
- [ ] Interaktive Korrektur
- **Technologie:** Vision API + Geometrie-Fitting

### 5.7 Similar Part Search (langfristig)
- [ ] Konturen als Feature-Vektor kodieren (Fläche, Umfang, Ecken, Rundungen)
- [ ] "Finde ähnliche Teile" in DXF-Bibliothek
- [ ] Vektor-Ähnlichkeitssuche
- **Technologie:** Embedding + Cosine-Similarity

---

## Phase 6: Workflow-Verbesserungen

### 6.1 Auto-Topology-Preview im CAD-Tab
- [ ] Schon beim Zeichnen zeigen: Disc (blau) / Hole (rot) / offen (gelb)
- [ ] Dezente Hintergrund-Färbung, kein vollständiger Pipeline-Lauf
- **Dateien:** `canvas-renderer.js`, `ceracut-pipeline.js`

### 6.2 Validation beim Zeichnen
- [ ] Warnung bei offenen Konturen (Tooltip)
- [ ] Warnung bei Selbstüberschneidungen
- [ ] Warnung bei zu kleinen Radien (< Kerf/2)
- **Dateien:** `drawing-tools.js`, `canvas-renderer.js`

### 6.3 Recent Files Liste
- [ ] Letzte 10 geöffnete Dateien im Datei-Tab
- [ ] localStorage-Persistenz
- **Dateien:** `index.html`, `app.js`

### 6.4 DXF-Templates
- [ ] Leere Vorlage mit vorkonfigurierten Layers/Einstellungen
- [ ] "Neu aus Template" im Datei-Tab
- **Dateien:** `app.js`, `index.html`

### 6.5 Preferences-Dialog
- [ ] Zentrales Settings-Modal für alle Einstellungen:
  - Snap-Toleranz, Grid-Größe, Zoom-Empfindlichkeit
  - Default-Kerf, Default-Quality
  - HUD an/aus, Crosshair an/aus
  - Max Undo-History (50–500)
- [ ] localStorage-Persistenz
- **Neue Datei:** `preferences.js` oder in `app.js`

---

## Bewertungs-Matrix

| Phase | Impact | Aufwand | ROI |
|-------|--------|---------|-----|
| 1 Quick Wins | ⭐⭐⭐⭐⭐ | Klein | Höchster ROI |
| 2 Core UI | ⭐⭐⭐⭐ | Mittel | Hoher ROI |
| 3 Power Features | ⭐⭐⭐ | Mittel-Groß | Guter ROI |
| 4 Fehlende Tools | ⭐⭐ | Mittel | Situativ |
| 5 KI-Integration | ⭐⭐⭐⭐ | Groß | Differenzierung |
| 6 Workflow | ⭐⭐⭐ | Klein-Mittel | Guter ROI |

---

## Aktueller UX-Score (vs. AutoCAD)

| Bereich | Score | Hauptlücke |
|---------|-------|------------|
| Snap System | 8/10 | Kein OSNAP-Dialog |
| Drawing Tools | 9/10 | TTT-Stub, Spline-Edit |
| Modification Tools | 9/10 | Match Properties fehlt |
| Dynamic Input | 6/10 | Read-Only, kein Tab-Wechsel |
| Command-Line | 7/10 | History ✅, kein Auto-Complete |
| Layer System | 7/10 | Kein Manager-Dialog, Locked-Layer-Guard ✅ |
| Selection | 8/10 | Crossing ✅, kein Cycle |
| Properties Panel | 5/10 | Nur im Kontextmenü |
| Grid & Display | 8/10 | Nicht konfigurierbar |
| Undo/Redo | 8/10 | Keine History-UI |
| **Gesamt** | **7.6/10** | **UI-Tiefe & Discoverability** |
