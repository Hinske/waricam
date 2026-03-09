/**
 * WARICAM Build Info
 * Zeigt Versionsinformationen in der Console
 */

const WARICAM_BUILD = {
    version: '5.4.2',
    build: '20260220-arabeske',
    date: '2026-02-20',
    time: '15:00 MEZ',
    
    modules: {
        'dxf-parser':      { version: '3.3', build: '20260215-2330' },
        'geometry':        { version: '2.9', build: '20260128-0645' },
        'pipeline':        { version: '3.1', build: '20260212-1400' },
        'cam-contour':     { version: '4.6', build: '20260220-arcmeta' },
        'canvas-renderer': { version: '3.7', build: '20260220-arclead' },
        'undo-manager':    { version: '1.0', build: '20260212-2000' },
        'sinumerik-pp':    { version: '1.2', build: '20260219-phaseB' },
        'command-line':    { version: '1.0', build: '20260213-1200' },
        'snap-manager':    { version: '1.0', build: '20260213-1200' },
        'geometry-ops':    { version: '2.2', build: '20260220-arabeske' },
        'drawing-tools':   { version: '2.1', build: '20260214-1600' },
        'tool-manager':    { version: '2.1', build: '20260215-1500' },
        'layer-manager':   { version: '1.0', build: '20260215-2200' },
        'dxf-writer':      { version: '1.0', build: '20260215-2200' },
        'app':             { version: '5.4.1', build: '20260220-ctx1' },
        'cam-contour-int': { version: '5.3', build: '20260219-phaseB' },
        'properties-panel':{ version: '1.1', build: '20260219-phaseB' },
        'debug-monitor':   { version: '1.0', build: '20260219-dm10' }
    },
    
    changes: [
        'V3.5: Tier 2 Modification Tools — Move (M), Copy (Shift+C), Rotate (R), Mirror (Shift+M), Scale (S), Erase (DEL)',
        'V3.5: Always-Active ToolManager — Zeichnen + Modifikation ohne F2-Toggle',
        'V3.5: Noun-Verb + Verb-Noun Selektion (AutoCAD-Stil)',
        'V3.5: Window-Selection (Drag-Rechteck): Links→Rechts = Window, Rechts→Links = Crossing',
        'V3.5: Ghost-Preview (halbtransparent) für Move/Copy/Rotate/Mirror/Scale',
        'V3.5: Selektion in allen Steps (nicht nur 4/5) für Noun-Verb Workflow',
        'V3.5: Klick auf leere Fläche → Selektion aufheben',
        'V3.5: Escape-Kaskade: Tool → Messmodus → Startpunkt → Selektion',
        'V3.5: DEL-Taste startet EraseTool (mit Undo) statt hartem Löschen',
        'V3.5: Offset-Tool vorbereitet (Platzhalter für V2.1)',
        'V3.5-fix: Auto-Apply gezeichnete Entities bei Mod-Tool-Start',
        'V3.5-fix: CamContour Klassenname korrigiert (war CAMContour)',
        'V3.5-fix: LineTool S/C = Linienzug schließen (AutoCAD-Stil)',
        'V3.5-fix: Rechtsklick = Bestätigen bei aktivem Tool (AutoCAD-Stil)',
        'V3.5-fix: fileLoaded bei Drawing-Only (Step-Navigation ohne DXF)',
        'V3.7: Tier 4 Aufteilen — CL2D (Halbieren), CLND (N-Teilen), CLDCL (Divided Calculation Dialog)',
        'V3.7: Ribbon-Gruppe "Aufteilen" im Start-Tab mit 3 Werkzeugen',
        'V3.7: CLDCL 5 Modi: Fest-einseitig, Fest-beidseitig, Fest-Mitte, Gleich-Anzahl, Gleich-MaxLänge',
        'V3.7: Joint/Fugen-Berechnung bei Aufteilung',
        'V3.7: Senkrechte Teilungslinien als echte LINE-Entities (direkt nutzbar)',
        'V3.8: Layer-System — AutoCAD-Style Ribbon + Status-Bar Dropdowns',
        'V3.8: Layer-Manager Dialog (Layer CRUD, Farbe, Sichtbarkeit, Lock, Linientyp)',
        'V3.8: DXF-Writer R12 (AC1009) — Speichern + Speichern unter (Strg+S/Strg+Shift+S)',
        'V3.8: Layer-Import aus DXF, Entity-Counts, ACI-Farbkonvertierung',
        'V3.6: Tier 3 Phase A — GeometryOps Engine V1.0 (Intersection, Segment-Modell)',
        'V3.6: Explode (X) — Konturen in Einzelsegmente zerlegen',
        'V3.6: Join (J) — Konturen zu Polylinie verbinden',
        'V3.6: Break (B) — Kontur an Punkt teilen (offen/geschlossen)',
        'V3.6: LineTool S/C = Linienzug schließen',
        'V3.6: Rechtsklick = Bestätigen bei aktivem Tool (AutoCAD-Stil)',
        'V3.6: Toolbar-Buttons für Tier 3 Tools',
        'V3.4: CAD Drawing Tools — Line (L), Circle (C), Rectangle (N), Arc (A), Polyline (P)',
        'V3.4: AutoCAD-style Command-Line UI mit Koordinateneingabe (absolut + relativ)',
        'V3.4: SnapManager V1.0 — Endpoint, Midpoint, Center, Intersection, Nearest',
        'V3.4: Ortho-Modus (F8) für 0°/90° Constraint',
        'Sinumerik 840D Postprozessor V1.0: Echte CNC-Ausgabe im MPF-Format',
        'UndoManager V1.0: Command Pattern (Undo/Redo), Clipboard (Copy/Cut/Paste)',
        'DXF-Parser V3.0: SPLINE Flags Fix (Bit 8=planar, nicht periodic)',
        'DXF-Parser V3.3: CRITICAL FIX — LWPOLYLINE 1000-Zeilen-Limit entfernt (abgeschnittene Konturen)',
        'DXF-Parser V3.3: Layer-aware Chaining — Segmente verschiedener Layer nicht mehr gemischt',
        'DXF-Parser V3.3: Erweiterte Diagnostik (Entity-Typ-Breakdown, Kontur-Details, Vertex-Validierung)',
        'V3.8-fix: tool-manager.js Section 4 Duplikate entfernt (LineTool already declared)',
        'V5.2: Intarsien-Modus — Dual-Export NEG/POS mit invertierter Kerf-Kompensation',
        'V5.2: CuttingMode-Alternation nach Nesting-Level (A/O/B Sonderfälle)',
        'V5.2: CAM-Tab Intarsien-Gruppe (Toggle, Fugenbreite, NEG/POS-Preview)',
        'V5.2: clone() überträgt nestingLevel für Intarsien-Kontur-Klone',
        'V5.3 Phase B: Piercing Types (6 IGEMS: auto/blind/linear/stationary/circular/drilling/air_start)',
        'V5.3 Phase B: R923 dynamisch im Postprozessor (nicht mehr hardcoded 9)',
        'V5.3 Phase B: R924 (Standzeit), R925 (Kreisradius), R926 (Kreiszeit) bei speziellen Typen',
        'V5.3 Phase B: Dynamic Lead (B.2) — Binary-Search Kollisionsvermeidung',
        'V5.3 Phase B: Flächenklassen (B.3) — 6 IGEMS-Standard-Klassen für Löcher',
        'V5.3 Phase B: Properties Panel — Piercing/Lead-In/Area-Class Controls',
        'V5.3 Phase B: clone() für alle B.1/B.2 Properties erweitert',
        'V5.3 Phase B: properties-panel-styles.css verlinkt (war bisher missing)',
        'Debug Monitor V1.0: Globaler Error-Catcher (onerror+unhandledrejection+console.error)',
        'Debug Monitor V1.0: 13 bekannte WARICAM-Fallen automatisch erkannt und erklärt',
        'Debug Monitor V1.0: Session-Log (200 Fehler), Action-Tracker (50 Aktionen)',
        'Debug Monitor V1.0: Performance-Monitor Frame-Drop-Erkennung (>50ms)',
        'Debug Monitor V1.0: Overlay Strg+Shift+D — 4 Tabs (Fehler/Aktionen/Perf/Fallen)',
        'Debug Monitor V1.0: JSON-Export für Claude Code Analyse',
        'V5.4 Phase B UI: Piercing-Typ Dropdown (5 Typen) + R924/R925/R926 konditionale Felder',
        'V5.4 Phase B UI: Dynamic Lead Checkbox + Min/Max-Eingabefelder',
        'V5.4 Phase B UI: Flächenklassen-Checkbox + Editor-Popup (6 IGEMS-Klassen, editierbar)',
        'V5.4 Phase B UI: Single-Mode Button (manuelle Fahnenplatzierung per Klick + Undo)',
        'V5.4 Phase B UI: Lead-Favoriten (Speichern/Laden/Löschen, localStorage-Persistenz)',
        'V5.4 Phase B UI: Alle B.1-B.6 UI-Handler im Shim verdrahtet + Live-Preview',
        'V5.4.1 Fix: Gelbe Messlinien bleiben nach Messmodus-Ende nicht mehr stehen',
        'V5.4.1 Fix: ACI 7 Layer-Farben invertieren bei Theme-Wechsel (weiß↔schwarz)',
        'V5.4.1: Kontur-Kontextmenü — Nullpunkt → Endpunkt / Nullpunkt → Mittelpunkt',
        'V5.4.1: Echte ctx.arc() Darstellung für Arc-Leads (statt 12-Segment Polyline)',
        'V5.4.1: Arc-Metadaten (arcStartAngle, arcEndAngle, arcSweepCCW) in cam-contour',
        'V5.4.2: Arabeske-Tool (AB) — Parametrische Laternenfliese (8 Kreisbögen) in advanced-tools.js V1.2',
        'V5.4.2: GeometryOps V2.2 — _circumscribedCircle, _arcThrough3Points, createArabeske',
        'V5.4.2: Fugen-Offset für tessellierbare Fliesenverlegung (2mm Standard)',
        'V5.4.2: Ribbon-Button "Arabeske" im CAD-Tab Zeichnen-Gruppe'
    ],
    
    print() {
        console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #00aa00; font-weight: bold');
        console.log('%c║  WARICAM/CeraCAM V' + this.version + ' - Build ' + this.build + '            ║', 'color: #00aa00; font-weight: bold');
        console.log('%c║  Last Modified: ' + this.date + ' ' + this.time + '                   ║', 'color: #00aa00');
        console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #00aa00; font-weight: bold');
        
        console.log('%c[BUILD] Modules:', 'color: #888');
        for (const [name, info] of Object.entries(this.modules)) {
            console.log(`  ${name}: V${info.version} (${info.build})`);
        }
        
        console.log('%c[BUILD] Recent Changes:', 'color: #888');
        this.changes.forEach(c => console.log('  • ' + c));
    }
};

// Auto-Print beim Laden
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        WARICAM_BUILD.print();
    });
}

// Export für Node.js Tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WARICAM_BUILD;
}
