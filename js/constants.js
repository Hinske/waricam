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
