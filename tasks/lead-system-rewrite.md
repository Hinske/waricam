# Lead-System Verbesserung — Industriestandard CAM UX

> **Erstellt:** 2026-03-15
> **Ziel:** Lead-Verwaltung und -Darstellung auf Industriestandard bringen (ProNest, SigmaNEST, IGEMS Niveau)
> **Betroffene Module:** cam-contour.js, canvas-renderer.js, properties-panel.js, app.js, constants.js, index.html

---

## Massnahme 1: Lead-Presets / Technologie-Profile (Prio 1)

**Ziel:** Ein Dropdown statt 12 Einzelfelder. Material+Dicke bestimmt alle Lead-Parameter automatisch.

- [ ] **1.1** Datenstruktur fuer Lead-Profile definieren
  - Name, Material, Dicke, Aussen-Leads (Typ/Laenge/Radius/Winkel/Overcut), Innen-Leads, Kleine-Loecher-Schwelle, Piercing-Typ+Params
- [ ] **1.2** Vordefinierte Profile anlegen (5-8 Stueck)
  - Stahl duenn (1-5mm): Arc R2 L3, Stationaer 1s
  - Stahl mittel (5-15mm): Arc R3 L5, Stationaer 2s
  - Stahl dick (15-50mm): Linear L8 W45, Zirkulaer 3s
  - Alu duenn, Alu dick
  - Glas/Keramik: Low-Pressure Pierce, kurze Leads
  - Schnell/Grob: Minimal-Leads
  - Qualitaet/Fein: Lange Leads, grosser Overcut
- [ ] **1.3** UI: Dropdown im Wizard Step 3 (oben, prominent)
  - Profilwahl setzt alle Felder automatisch
  - Felder bleiben editierbar (Override)
  - Anzeige "[Profil] + manuell angepasst" wenn abweichend
- [ ] **1.4** Benutzerdefinierte Profile speichern/laden (localStorage)
  - [+] Neues Profil aus aktuellen Werten
  - [-] Profil loeschen
  - Umbenennen
- [ ] **1.5** Profil-Anwendung: Beim Wechsel alle Konturen updaten (mit Undo-Group)

---

## Massnahme 2: Smarte Batch-Regeln (Prio 1)

**Ziel:** Automatische Lead-Zuweisung nach Konturtyp statt manuelle Einzelbearbeitung.

- [ ] **2.1** Regel-Engine: Konturen nach Topologie klassifizieren
  - Aussenkonturen (disc) → Profil-Aussen-Leads
  - Innenkonturen (hole) → Profil-Innen-Leads
  - Kleine Loecher (hole + Durchmesser < Schwelle) → Center-Pierce
  - Slits (open) → On-Geometry, kein Overcut
  - Referenzkontur → keine Leads
- [ ] **2.2** UI: Regel-Sektion im Wizard Step 3 oder als Modal
  - Checkboxen pro Regel (an/aus)
  - Schwellwerte editierbar (z.B. "Klein = < 15mm")
  - [Auf alle anwenden] / [Nur Selektion]
- [ ] **2.3** Integration mit Profilen: Profil liefert die Regel-Defaults
- [ ] **2.4** Batch-Apply mit Undo-Group

---

## Massnahme 3: Live-Preview bei Parameteraenderung (Prio 2)

**Ziel:** Sofortiges visuelles Feedback ohne "Apply"-Button.

- [ ] **3.1** Input/Slider-Events direkt an Kontur-Update + Render koppeln
  - `input`-Event → temporaere Aenderung + Render
  - `change`-Event → Commit via Undo-Snapshot
  - Pattern bereits vorhanden (Slider Snapshot in app.js)
- [ ] **3.2** Ghost-Preview: Halbtransparenter neuer Lead neben aktuellem
  - Nur waehrend Editing sichtbar
  - Verschwindet bei Commit
- [ ] **3.3** Dropdown-Wechsel (Typ arc→linear) → sofortige Vorschau

---

## Massnahme 4: Klarere Visualisierung (Prio 2)

**Ziel:** Leads auf einen Blick verstehen, auch fuer Maschinenbediener ohne CAM-Erfahrung.

- [ ] **4.1** Pierce-Symbole vergroessern und nach Typ differenzieren
  - Stationaer: gefuellter Kreis
  - Zirkulaer: Kreis mit Pfeil
  - Dynamisch: Blitz-Symbol
  - Center-Pierce: Fadenkreuz
- [ ] **4.2** Lead-Farben vereinfachen
  - Gruen = Lead OK (Standard)
  - Gelb = Alternativ-Lead aktiv
  - Rot = Verkuerzt/Kollision (Achtung!)
  - Cyan = Lead-Out
- [ ] **4.3** Tooltip on Hover ueber Lead-Pfade
  - "Arc Lead-In, R=3mm, L=5mm, 90deg [Auto]"
  - "Linear Lead-Out, L=2mm [Verkuerzt von 4mm]"
- [ ] **4.4** Toggle-Buttons in Toolbar
  - Leads ein/aus
  - Pierce-Symbole ein/aus
  - Richtungspfeile ein/aus
- [ ] **4.5** Legende / Mini-Info im Canvas-Bereich

---

## Massnahme 5: Interaktives Startpunkt-Dragging (Prio 3)

**Ziel:** Startpunkt per Drag&Drop verschieben, Lead dreht live mit.

- [ ] **5.1** Hit-Test auf Startpunkt-Marker (Grip-Editing Pattern vorhanden)
- [ ] **5.2** Drag entlang Kontur: naechster Punkt auf Kontur berechnen
  - Snap an Ecken (bevorzugt)
  - Snap an Segment-Mitten
- [ ] **5.3** Live-Render waehrend Drag (Lead dreht sich mit)
- [ ] **5.4** Undo-Support (Startpunkt-Position als Command)
- [ ] **5.5** Rechtsklick auf Lead → Kontextmenu
  - Typ wechseln (Arc/Linear/Tangent)
  - Parameter editieren (Inline)
  - Reset auf Profil-Default

---

## Architektur-Notizen

### Neues Modul: `lead-profiles.js`
- Profilklasse mit Validierung
- Default-Profile (hardcoded)
- Benutzer-Profile (localStorage)
- Export/Import (JSON)

### Aenderungen an bestehenden Modulen
- **cam-contour.js**: `applyProfile(profile, contourType)` Methode
- **app.js**: Profil-Dropdown Handler, Batch-Apply Logik
- **canvas-renderer.js**: Erweiterte Symbole, Tooltips, Toggle-States
- **properties-panel.js**: Profil-Anzeige, Override-Indikator
- **constants.js**: Default-Profile, neue Farb-Konstanten
- **index.html**: Profil-Dropdown, Regel-UI, Toggle-Buttons

### Abhaengigkeiten zwischen Massnahmen
```
Massnahme 1 (Profile) ─┬─→ Massnahme 2 (Regeln) nutzt Profile als Defaults
                        └─→ Massnahme 5 (Dragging) nutzt Profil-Reset
Massnahme 3 (Preview) ───→ unabhaengig, kann parallel
Massnahme 4 (Visualisierung) → unabhaengig, kann parallel
```

---

## Abnahmekriterien

- [ ] Maschinenbediener kann mit 2 Klicks (Material + Dicke) alle Leads korrekt setzen
- [ ] Einzelne Leads koennen nachtraeglich ueberschrieben werden
- [ ] Aenderungen sind sofort sichtbar (kein Reload/Apply noetig)
- [ ] Alle Aenderungen sind undo-bar
- [ ] Bestehende DXF-Projekte bleiben kompatibel (keine Breaking Changes)
- [ ] Postprozessor-Ausgabe bleibt identisch (Leads aendern sich nur in Position/Typ, nicht im PP-Format)
