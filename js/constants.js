/**
 * CeraCUT V2.7 Constants
 * Blaues Farbschema
 */

const CeraCUT = {
    VERSION: '2.7.0',
    BUILD: '2026-01-27',
    NAME: 'CeraCUT Wasserstrahl-CAM',

    // Toleranzen (in mm)
    TOLERANCES: {
        SNAP: 0.001,
        CHAIN: 0.1,
        CLOSE: 0.01,
        MIN_SEGMENT: 1.0,
        AUTO_CLOSE: 0.5,
        MEASURE_SNAP: 5.0
    },

    // Farben - CeraCUT Blau
    COLORS: {
        // Hintergrund
        BG_PRIMARY: '#0f0f1a',
        BG_SECONDARY: '#16213e',
        BG_CARD: '#1f2940',
        BG_HOVER: '#2a3a5c',
        
        // Akzent
        ACCENT: '#00aaff',
        ACCENT_HOVER: '#0095e6',
        ACCENT_GLOW: 'rgba(0, 170, 255, 0.5)',
        
        // Status
        SUCCESS: '#22c55e',
        WARNING: '#f59e0b',
        DANGER: '#ef4444',
        
        // Borders
        BORDER: '#2d3748',
        BORDER_ACTIVE: '#00aaff',

        // Geometrie
        ORIGINAL: '#FFFFFF',
        KERF: '#FF3333',
        LEAD_IN: '#CC00FF',
        LEAD_OUT: '#CC00FF',
        REFERENCE: '#888888',
        SELECTED: '#00aaff',

        // Messwerkzeug
        MEASUREMENT: '#00FFFF',
        MEASUREMENT_TEXT: '#FFFFFF',
        SNAP: '#FFFF00',
        NULL_POINT: '#00ff88',

        // Text
        TEXT_PRIMARY: '#FFFFFF',
        TEXT_SECONDARY: '#94a3b8',
        TEXT_MUTED: '#64748b',
        
        // Qualität
        Q1: '#22c55e',
        Q2: '#3b82f6',
        Q3: '#f59e0b',
        Q4: '#ef4444',
        Q5: '#a855f7'
    },

    // Rendering
    RENDER: {
        CIRCLE_SEGMENTS: 32,
        ARC_SEGMENTS: 16,
        LINE_JOIN: 'round',
        LINE_CAP: 'round'
    },

    // Defaults
    DEFAULTS: {
        KERF_WIDTH: 0.8,
        LEAD_IN_LENGTH: 3.0,
        LEAD_OUT_LENGTH: 2.0,
        LEAD_ANGLE: 45,
        LEAD_RADIUS: 2.0,
        OVERCUT: 1.0,
        QUALITY: 2
    },

    // Limits
    LIMITS: {
        NORMALIZATION_THRESHOLD: 1000000,
        MIN_AREA: 0.01,
        MAX_ZOOM: 1000,
        MIN_ZOOM: 0.01
    }
};

// ═══════════════════════════════════════════════════════════════
// TOOL TOOLTIPS — Zentrale Registry fuer data-tip + Shortcut-Dialog
// Pflege: Neue Tools hier eintragen, Rest passiert automatisch.
// Format: { label, tip, shortcut, group }
// ═══════════════════════════════════════════════════════════════

const TOOL_TOOLTIPS = {
    // ── Zeichnen ──
    'L':     { label: 'Linie',      tip: 'Linie zeichnen',                          shortcut: 'L',     group: 'draw' },
    'C':     { label: 'Kreis',      tip: 'Kreis zeichnen (Mittelpunkt + Radius)',    shortcut: 'C',     group: 'draw' },
    'A':     { label: 'Bogen',      tip: 'Kreisbogen zeichnen (3 Punkte)',           shortcut: 'A',     group: 'draw' },
    'N':     { label: 'Rechteck',   tip: 'Rechteck zeichnen (2 Eckpunkte)',          shortcut: 'N',     group: 'draw' },
    'P':     { label: 'Polylinie',  tip: 'Polylinie (Linienzug)',                    shortcut: 'P',     group: 'draw' },
    'NG':    { label: 'N-Eck',      tip: 'Regelmaessiges Vieleck',                   shortcut: 'NG',    group: 'draw' },
    'OB':    { label: 'Langloch',   tip: 'Langloch / Overlap Break',                 shortcut: 'OB',    group: 'draw' },
    'AB':    { label: 'Arabeske',   tip: 'Arabeske (Laternenfliese)',                shortcut: 'AB',    group: 'draw' },
    'EL':    { label: 'Ellipse',    tip: 'Ellipse zeichnen',                         shortcut: 'EL',    group: 'draw' },
    'SP':    { label: 'Spline',     tip: 'Freiform-Kurve (Spline)',                  shortcut: 'SP',    group: 'draw' },
    'DO':    { label: 'Donut',      tip: 'Ring / Donut',                             shortcut: 'DO',    group: 'draw' },
    'TX':    { label: 'Text',       tip: 'Text als schneidbare Konturen',            shortcut: 'TX',    group: 'draw' },
    'H':     { label: 'Schraffur',  tip: 'Flaeche fuellen / schraffieren (Solid, Linien, Kreuz, Punkte)', shortcut: 'H', group: 'draw' },

    // ── Bearbeiten ──
    'M':     { label: 'Verschieben', tip: 'Objekte verschieben',                     shortcut: 'M',     group: 'edit' },
    'CO':    { label: 'Kopieren',    tip: 'Objekte kopieren',                        shortcut: 'CO',    group: 'edit' },
    'RO':    { label: 'Drehen',      tip: 'Objekte drehen',                          shortcut: 'RO',    group: 'edit' },
    'MI':    { label: 'Spiegeln',    tip: 'Objekte spiegeln',                        shortcut: 'MI',    group: 'edit' },
    'SC':    { label: 'Skalieren',   tip: 'Objekte vergroessern/verkleinern',        shortcut: 'SC',    group: 'edit' },
    'AR':    { label: 'Reihe',       tip: 'Objekte in Reihe/Raster kopieren',        shortcut: 'AR',    group: 'edit' },
    'O':     { label: 'Versetzen',   tip: 'Parallele Kopie mit Abstand',             shortcut: 'O',     group: 'edit' },
    'E':     { label: 'Loeschen',    tip: 'Selektierte Objekte loeschen',            shortcut: 'E / Entf', group: 'edit' },
    'F':     { label: 'Abrunden',    tip: 'Ecke zweier Linien verrunden',            shortcut: 'F',     group: 'edit' },
    'CH':    { label: 'Fase',        tip: 'Ecke abschraegen',                        shortcut: 'CH',    group: 'edit' },
    'T':     { label: 'Stutzen',     tip: 'Linie an Schnittpunkt abschneiden',       shortcut: 'T',     group: 'edit' },
    'EX':    { label: 'Dehnen',      tip: 'Linie bis zur naechsten Kante dehnen',    shortcut: 'EX',    group: 'edit' },
    'X':     { label: 'Explode',     tip: 'Konturen in Einzelteile zerlegen',        shortcut: 'X',     group: 'edit' },
    'J':     { label: 'Join',        tip: 'Linien zu einer Kontur verbinden',        shortcut: 'J',     group: 'edit' },
    'B':     { label: 'Brechen',     tip: 'Kontur an einem Punkt teilen',            shortcut: 'B',     group: 'edit' },
    'BO':    { label: 'Boolesch',    tip: 'Formen verschmelzen/subtrahieren',        shortcut: 'BO',    group: 'edit' },
    'BP':    { label: 'Boundary',    tip: 'Umrandung erkennen',                      shortcut: 'BP',    group: 'edit' },
    'CLDCL': { label: 'Aufteilen',   tip: 'Kontur gleichmaessig aufteilen',          shortcut: 'CLDCL', group: 'edit' },

    // ── CAM / Analyse ──
    'AN':    { label: 'Analyze',     tip: 'Geometrie auf Fehler pruefen',            shortcut: 'AN',    group: 'cam' },
};

// Nicht-Tool-Shortcuts (fuer Shortcut-Dialog, nicht fuer data-tip)
const GENERAL_SHORTCUTS = [
    { shortcut: 'Strg+Z',       label: 'Rueckgaengig' },
    { shortcut: 'Strg+Y',       label: 'Wiederholen' },
    { shortcut: 'Strg+A',       label: 'Alles waehlen' },
    { shortcut: 'Strg+S',       label: 'Speichern' },
    { shortcut: 'Strg+P',       label: 'Drucken' },
    { shortcut: 'F1',           label: 'Hilfe / Tastenkuerzel' },
    { shortcut: 'F3',           label: 'Messen' },
    { shortcut: 'F8',           label: 'Ortho-Modus' },
    { shortcut: 'ESC',          label: 'Abbrechen' },
    { shortcut: 'Home',         label: 'Alles zeigen' },
];

const MOUSE_SHORTCUTS = [
    'Scrollrad: Zoom',
    'Mittelklick-Drag: Verschieben',
    'Leertaste+Drag: Verschieben',
    'Pinch: Zoom (Trackpad)',
    'Rechtsklick: Bestaetigen / Menu',
];

// Freeze
Object.freeze(CeraCUT);
Object.freeze(CeraCUT.TOLERANCES);
Object.freeze(CeraCUT.COLORS);
Object.freeze(CeraCUT.RENDER);
Object.freeze(CeraCUT.DEFAULTS);
Object.freeze(CeraCUT.LIMITS);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CeraCUT;
}
