/**
 * WARICAM Machine Profiles V1.0
 *
 * Maschinenpark-Verwaltung fuer Wasserstrahl-CAM Software.
 * Verwaltet CNC-Maschinenprofile mit Arbeitsbereich, Druckparametern,
 * Postprozessor-Einstellungen, Achskonfiguration und M-Code-Mappings.
 *
 * Persistenz via LocalStorage, Export/Import als JSON.
 *
 * Last Modified: 2026-03-09
 * Build: 20260309
 */

const MachineProfiles = (() => {
    'use strict';

    const VERSION = '1.0';
    const STORAGE_KEY = 'waricam_machine_profiles';
    const ACTIVE_KEY = 'waricam_active_profile';
    const PREFIX = `[MachineProfiles V${VERSION}]`;

    // ════════════════════════════════════════════════════════════════
    // REQUIRED FIELDS fuer Validierung
    // ════════════════════════════════════════════════════════════════

    const REQUIRED_FIELDS = [
        'id', 'name', 'manufacturer', 'controllerType',
        'workArea', 'maxPressureBar', 'maxFeedrateMMMin',
        'cuttingHeads', 'postprocessor', 'axes', 'mCodes'
    ];

    const REQUIRED_WORK_AREA = ['maxX', 'maxY'];

    const REQUIRED_POSTPROCESSOR = [
        'coordDecimals', 'feedDecimals',
        'speedFactorNormal', 'speedFactorSmallHole'
    ];

    const VALID_CONTROLLER_TYPES = [
        'sinumerik_840d', 'fanuc', 'haas', 'heidenhain',
        'mazak', 'mitsubishi', 'generic'
    ];

    const VALID_PIERCING_TYPES = [
        'auto', 'blind', 'stationary', 'circular', 'moving', 'edge', 'none'
    ];

    // ════════════════════════════════════════════════════════════════
    // INTERNER STATE
    // ════════════════════════════════════════════════════════════════

    let _profiles = new Map();
    let _activeProfileId = null;

    // ════════════════════════════════════════════════════════════════
    // DEFAULT PROFILES
    // ════════════════════════════════════════════════════════════════

    function _createDefaultProfiles() {
        return [
            {
                id: 'cerasell-wj-3020',
                name: 'Cerasell WJ-3020',
                manufacturer: 'Cerasell GmbH',
                controllerType: 'sinumerik_840d',
                description: 'Hauptmaschine 3x2m Arbeitsbereich, Sinumerik 840D',

                workArea: {
                    maxX: 3000,
                    maxY: 2000
                },

                maxPressureBar: 4000,
                maxFeedrateMMMin: 15000,
                cuttingHeads: 1,

                supportedGCodes: [
                    'G00', 'G01', 'G02', 'G03',
                    'G40', 'G41', 'G42',
                    'G54', 'G55', 'G56', 'G57',
                    'G90', 'G91',
                    'G17'
                ],

                postprocessor: {
                    coordDecimals: 3,
                    feedDecimals: 0,
                    speedFactorNormal: 0.69,
                    speedFactorSmallHole: 0.20,
                    smallHoleThreshold: 15,
                    useArcFitting: true,
                    arcTolerance: 0.01,
                    lineNumbering: 'N10',       // N10, N20, N30...
                    lineNumberIncrement: 10,
                    programExtension: '.MPF',
                    subprogramExtension: '.SPF',
                    fileEncoding: 'utf-8'
                },

                supportedPiercingTypes: [
                    'auto', 'blind', 'stationary', 'circular', 'moving', 'edge'
                ],

                axes: {
                    X: { enabled: true, min: 0, max: 3000, home: 0 },
                    Y: { enabled: true, min: 0, max: 2000, home: 0 },
                    Z: { enabled: true, min: -50, max: 100, home: 100 },
                    A: { enabled: false, min: 0, max: 360, home: 0 },
                    B: { enabled: false, min: 0, max: 360, home: 0 },
                    C: { enabled: false, min: 0, max: 360, home: 0 }
                },

                zHeights: {
                    safeZ: 50,
                    pierceZ: 10,
                    cutZ: 3
                },

                mCodes: {
                    pumpOn: 'M03',
                    pumpOff: 'M05',
                    abrasiveOn: 'M08',
                    abrasiveOff: 'M09',
                    headUp: 'M21',
                    headDown: 'M22',
                    programEnd: 'M30',
                    programStop: 'M00',
                    optionalStop: 'M01'
                },

                templates: {
                    header: [
                        '; Erzeugt von WARICAM/CeraCAM',
                        '; Maschine: Cerasell WJ-3020',
                        '; Steuerung: Sinumerik 840D',
                        'G17 G90 G40',
                        'G54'
                    ].join('\n'),
                    footer: [
                        'G40',
                        'G00 Z={safeZ}',
                        '{pumpOff}',
                        '{programEnd}'
                    ].join('\n')
                },

                isDefault: true,
                createdAt: '2026-03-09T00:00:00Z',
                modifiedAt: '2026-03-09T00:00:00Z'
            },
            {
                id: 'cerasell-wj-2015',
                name: 'Cerasell WJ-2015',
                manufacturer: 'Cerasell GmbH',
                controllerType: 'sinumerik_840d',
                description: 'Kompaktmaschine 2x1.5m Arbeitsbereich, Sinumerik 840D',

                workArea: {
                    maxX: 2000,
                    maxY: 1500
                },

                maxPressureBar: 4000,
                maxFeedrateMMMin: 12000,
                cuttingHeads: 1,

                supportedGCodes: [
                    'G00', 'G01', 'G02', 'G03',
                    'G40', 'G41', 'G42',
                    'G54', 'G55', 'G56', 'G57',
                    'G90', 'G91',
                    'G17'
                ],

                postprocessor: {
                    coordDecimals: 3,
                    feedDecimals: 0,
                    speedFactorNormal: 0.69,
                    speedFactorSmallHole: 0.20,
                    smallHoleThreshold: 15,
                    useArcFitting: true,
                    arcTolerance: 0.01,
                    lineNumbering: 'N10',
                    lineNumberIncrement: 10,
                    programExtension: '.MPF',
                    subprogramExtension: '.SPF',
                    fileEncoding: 'utf-8'
                },

                supportedPiercingTypes: [
                    'auto', 'blind', 'stationary', 'circular', 'moving', 'edge'
                ],

                axes: {
                    X: { enabled: true, min: 0, max: 2000, home: 0 },
                    Y: { enabled: true, min: 0, max: 1500, home: 0 },
                    Z: { enabled: true, min: -50, max: 100, home: 100 },
                    A: { enabled: false, min: 0, max: 360, home: 0 },
                    B: { enabled: false, min: 0, max: 360, home: 0 },
                    C: { enabled: false, min: 0, max: 360, home: 0 }
                },

                zHeights: {
                    safeZ: 50,
                    pierceZ: 10,
                    cutZ: 3
                },

                mCodes: {
                    pumpOn: 'M03',
                    pumpOff: 'M05',
                    abrasiveOn: 'M08',
                    abrasiveOff: 'M09',
                    headUp: 'M21',
                    headDown: 'M22',
                    programEnd: 'M30',
                    programStop: 'M00',
                    optionalStop: 'M01'
                },

                templates: {
                    header: [
                        '; Erzeugt von WARICAM/CeraCAM',
                        '; Maschine: Cerasell WJ-2015',
                        '; Steuerung: Sinumerik 840D',
                        'G17 G90 G40',
                        'G54'
                    ].join('\n'),
                    footer: [
                        'G40',
                        'G00 Z={safeZ}',
                        '{pumpOff}',
                        '{programEnd}'
                    ].join('\n')
                },

                isDefault: true,
                createdAt: '2026-03-09T00:00:00Z',
                modifiedAt: '2026-03-09T00:00:00Z'
            },
            {
                id: 'generic-waterjet',
                name: 'Generic Waterjet',
                manufacturer: 'Generic',
                controllerType: 'generic',
                description: 'Generisches Wasserstrahl-Profil fuer unbekannte Steuerungen',

                workArea: {
                    maxX: 2000,
                    maxY: 1000
                },

                maxPressureBar: 3800,
                maxFeedrateMMMin: 10000,
                cuttingHeads: 1,

                supportedGCodes: [
                    'G00', 'G01', 'G02', 'G03',
                    'G40', 'G41', 'G42',
                    'G90', 'G91',
                    'G17'
                ],

                postprocessor: {
                    coordDecimals: 3,
                    feedDecimals: 0,
                    speedFactorNormal: 0.65,
                    speedFactorSmallHole: 0.20,
                    smallHoleThreshold: 15,
                    useArcFitting: true,
                    arcTolerance: 0.02,
                    lineNumbering: 'none',
                    lineNumberIncrement: 1,
                    programExtension: '.nc',
                    subprogramExtension: '.nc',
                    fileEncoding: 'utf-8'
                },

                supportedPiercingTypes: [
                    'auto', 'blind', 'stationary', 'moving'
                ],

                axes: {
                    X: { enabled: true, min: 0, max: 2000, home: 0 },
                    Y: { enabled: true, min: 0, max: 1000, home: 0 },
                    Z: { enabled: true, min: -50, max: 100, home: 100 },
                    A: { enabled: false, min: 0, max: 360, home: 0 },
                    B: { enabled: false, min: 0, max: 360, home: 0 },
                    C: { enabled: false, min: 0, max: 360, home: 0 }
                },

                zHeights: {
                    safeZ: 50,
                    pierceZ: 10,
                    cutZ: 5
                },

                mCodes: {
                    pumpOn: 'M03',
                    pumpOff: 'M05',
                    abrasiveOn: 'M08',
                    abrasiveOff: 'M09',
                    headUp: 'M21',
                    headDown: 'M22',
                    programEnd: 'M30',
                    programStop: 'M00',
                    optionalStop: 'M01'
                },

                templates: {
                    header: [
                        '; Erzeugt von WARICAM/CeraCAM',
                        '; Maschine: Generic Waterjet',
                        'G17 G90 G40'
                    ].join('\n'),
                    footer: [
                        'G40',
                        '{pumpOff}',
                        '{programEnd}'
                    ].join('\n')
                },

                isDefault: true,
                createdAt: '2026-03-09T00:00:00Z',
                modifiedAt: '2026-03-09T00:00:00Z'
            }
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // VALIDATION
    // ════════════════════════════════════════════════════════════════

    /**
     * Validiert ein Maschinenprofil.
     * @param {Object} profile - Das zu validierende Profil
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function validateProfile(profile) {
        const errors = [];

        if (!profile || typeof profile !== 'object') {
            return { valid: false, errors: ['Profil ist kein gueltiges Objekt'] };
        }

        // Pflichtfelder auf Top-Level
        for (const field of REQUIRED_FIELDS) {
            if (profile[field] === undefined || profile[field] === null) {
                errors.push(`Pflichtfeld fehlt: ${field}`);
            }
        }

        // Name
        if (typeof profile.name !== 'string' || profile.name.trim().length === 0) {
            errors.push('Name darf nicht leer sein');
        }

        // Controller-Typ
        if (profile.controllerType && !VALID_CONTROLLER_TYPES.includes(profile.controllerType)) {
            errors.push(`Ungueltiger Controller-Typ: "${profile.controllerType}". Erlaubt: ${VALID_CONTROLLER_TYPES.join(', ')}`);
        }

        // Arbeitsbereich
        if (profile.workArea) {
            for (const dim of REQUIRED_WORK_AREA) {
                if (typeof profile.workArea[dim] !== 'number' || profile.workArea[dim] <= 0) {
                    errors.push(`workArea.${dim} muss eine positive Zahl sein`);
                }
            }
        }

        // Druck, Vorschub, Koepfe
        if (typeof profile.maxPressureBar !== 'number' || profile.maxPressureBar <= 0) {
            errors.push('maxPressureBar muss eine positive Zahl sein');
        }
        if (typeof profile.maxFeedrateMMMin !== 'number' || profile.maxFeedrateMMMin <= 0) {
            errors.push('maxFeedrateMMMin muss eine positive Zahl sein');
        }
        if (typeof profile.cuttingHeads !== 'number' || profile.cuttingHeads < 1 || !Number.isInteger(profile.cuttingHeads)) {
            errors.push('cuttingHeads muss eine positive Ganzzahl sein');
        }

        // Postprozessor-Einstellungen
        if (profile.postprocessor) {
            for (const field of REQUIRED_POSTPROCESSOR) {
                if (typeof profile.postprocessor[field] !== 'number') {
                    errors.push(`postprocessor.${field} muss eine Zahl sein`);
                }
            }
            if (profile.postprocessor.coordDecimals < 0 || profile.postprocessor.coordDecimals > 6) {
                errors.push('postprocessor.coordDecimals muss zwischen 0 und 6 liegen');
            }
            if (profile.postprocessor.feedDecimals < 0 || profile.postprocessor.feedDecimals > 4) {
                errors.push('postprocessor.feedDecimals muss zwischen 0 und 4 liegen');
            }
            if (profile.postprocessor.speedFactorNormal < 0 || profile.postprocessor.speedFactorNormal > 1) {
                errors.push('postprocessor.speedFactorNormal muss zwischen 0 und 1 liegen');
            }
            if (profile.postprocessor.speedFactorSmallHole < 0 || profile.postprocessor.speedFactorSmallHole > 1) {
                errors.push('postprocessor.speedFactorSmallHole muss zwischen 0 und 1 liegen');
            }
        }

        // Piercing-Typen
        if (Array.isArray(profile.supportedPiercingTypes)) {
            for (const pt of profile.supportedPiercingTypes) {
                if (!VALID_PIERCING_TYPES.includes(pt)) {
                    errors.push(`Ungueltiger Piercing-Typ: "${pt}"`);
                }
            }
        }

        // Achsen
        if (profile.axes) {
            const validAxes = ['X', 'Y', 'Z', 'A', 'B', 'C'];
            for (const axis of Object.keys(profile.axes)) {
                if (!validAxes.includes(axis)) {
                    errors.push(`Ungueltige Achse: "${axis}"`);
                }
                const a = profile.axes[axis];
                if (a && typeof a.enabled !== 'boolean') {
                    errors.push(`axes.${axis}.enabled muss ein Boolean sein`);
                }
            }
            // Mindestens X und Y muessen aktiv sein
            if (!profile.axes.X?.enabled || !profile.axes.Y?.enabled) {
                errors.push('Achsen X und Y muessen aktiviert sein');
            }
        }

        // M-Codes
        if (profile.mCodes) {
            const requiredMCodes = ['pumpOn', 'pumpOff', 'programEnd'];
            for (const mc of requiredMCodes) {
                if (typeof profile.mCodes[mc] !== 'string' || profile.mCodes[mc].trim().length === 0) {
                    errors.push(`mCodes.${mc} darf nicht leer sein`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // ════════════════════════════════════════════════════════════════
    // PERSISTENCE
    // ════════════════════════════════════════════════════════════════

    function _saveToStorage() {
        try {
            const data = [];
            for (const [id, profile] of _profiles) {
                data.push(profile);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            localStorage.setItem(ACTIVE_KEY, _activeProfileId || '');
            console.log(`${PREFIX} Gespeichert: ${data.length} Profile`);
        } catch (e) {
            console.error(`${PREFIX} Fehler beim Speichern:`, e);
        }
    }

    function _loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;

            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return false;

            _profiles.clear();
            let loaded = 0;
            for (const profile of data) {
                if (profile && profile.id) {
                    _profiles.set(profile.id, profile);
                    loaded++;
                }
            }

            _activeProfileId = localStorage.getItem(ACTIVE_KEY) || null;

            // Aktives Profil validieren
            if (_activeProfileId && !_profiles.has(_activeProfileId)) {
                _activeProfileId = null;
            }

            console.log(`${PREFIX} Geladen: ${loaded} Profile aus LocalStorage`);
            return loaded > 0;
        } catch (e) {
            console.error(`${PREFIX} Fehler beim Laden:`, e);
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // HELPER
    // ════════════════════════════════════════════════════════════════

    function _generateId(name) {
        const base = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        let id = base;
        let counter = 1;
        while (_profiles.has(id)) {
            id = `${base}-${counter++}`;
        }
        return id;
    }

    function _deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API: CRUD
    // ════════════════════════════════════════════════════════════════

    /**
     * Fuegt ein neues Maschinenprofil hinzu.
     * @param {Object} profile - Das Profil (id wird automatisch generiert falls fehlend)
     * @returns {{ success: boolean, id?: string, errors?: string[] }}
     */
    function addProfile(profile) {
        if (!profile) {
            return { success: false, errors: ['Kein Profil angegeben'] };
        }

        const p = _deepClone(profile);
        if (!p.id) {
            p.id = _generateId(p.name || 'profil');
        }

        if (_profiles.has(p.id)) {
            return { success: false, errors: [`Profil-ID "${p.id}" existiert bereits`] };
        }

        const now = new Date().toISOString();
        p.createdAt = p.createdAt || now;
        p.modifiedAt = now;
        p.isDefault = false;

        const validation = validateProfile(p);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }

        _profiles.set(p.id, p);
        _saveToStorage();
        console.log(`${PREFIX} Profil hinzugefuegt: "${p.name}" (${p.id})`);
        return { success: true, id: p.id };
    }

    /**
     * Aktualisiert ein bestehendes Profil.
     * @param {string} id - Die Profil-ID
     * @param {Object} updates - Die zu aendernden Felder (merge)
     * @returns {{ success: boolean, errors?: string[] }}
     */
    function updateProfile(id, updates) {
        const existing = _profiles.get(id);
        if (!existing) {
            return { success: false, errors: [`Profil "${id}" nicht gefunden`] };
        }

        // Deep merge
        const merged = _deepClone(existing);
        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id') continue; // ID nicht aenderbar
            if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof merged[key] === 'object') {
                merged[key] = { ...merged[key], ...value };
            } else {
                merged[key] = value;
            }
        }
        merged.modifiedAt = new Date().toISOString();

        const validation = validateProfile(merged);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }

        _profiles.set(id, merged);
        _saveToStorage();
        console.log(`${PREFIX} Profil aktualisiert: "${merged.name}" (${id})`);
        return { success: true };
    }

    /**
     * Loescht ein Profil.
     * @param {string} id - Die Profil-ID
     * @returns {{ success: boolean, errors?: string[] }}
     */
    function deleteProfile(id) {
        const profile = _profiles.get(id);
        if (!profile) {
            return { success: false, errors: [`Profil "${id}" nicht gefunden`] };
        }

        if (profile.isDefault) {
            return { success: false, errors: [`Default-Profil "${profile.name}" kann nicht geloescht werden`] };
        }

        _profiles.delete(id);

        if (_activeProfileId === id) {
            _activeProfileId = null;
            console.log(`${PREFIX} Aktives Profil war "${id}" — zurueckgesetzt`);
        }

        _saveToStorage();
        console.log(`${PREFIX} Profil geloescht: "${profile.name}" (${id})`);
        return { success: true };
    }

    /**
     * Gibt ein Profil zurueck (Deep Copy).
     * @param {string} id - Die Profil-ID
     * @returns {Object|null}
     */
    function getProfile(id) {
        const profile = _profiles.get(id);
        return profile ? _deepClone(profile) : null;
    }

    /**
     * Gibt alle Profile als Array zurueck (Deep Copies).
     * @returns {Object[]}
     */
    function listProfiles() {
        const list = [];
        for (const [id, profile] of _profiles) {
            list.push(_deepClone(profile));
        }
        return list;
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API: ACTIVE PROFILE
    // ════════════════════════════════════════════════════════════════

    /**
     * Setzt das aktive Maschinenprofil.
     * @param {string} id - Die Profil-ID
     * @returns {{ success: boolean, errors?: string[] }}
     */
    function setActiveProfile(id) {
        if (!_profiles.has(id)) {
            return { success: false, errors: [`Profil "${id}" nicht gefunden`] };
        }
        _activeProfileId = id;
        _saveToStorage();
        const name = _profiles.get(id).name;
        console.log(`${PREFIX} Aktives Profil: "${name}" (${id})`);
        return { success: true };
    }

    /**
     * Gibt das aktive Profil zurueck (Deep Copy).
     * @returns {Object|null}
     */
    function getActiveProfile() {
        if (!_activeProfileId) return null;
        return getProfile(_activeProfileId);
    }

    /**
     * Gibt die ID des aktiven Profils zurueck.
     * @returns {string|null}
     */
    function getActiveProfileId() {
        return _activeProfileId;
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API: POSTPROCESSOR INTEGRATION
    // ════════════════════════════════════════════════════════════════

    /**
     * Gibt ein Config-Objekt zurueck, das direkt an den
     * SinumerikPostprocessor-Konstruktor uebergeben werden kann.
     *
     * @param {string} [id] - Profil-ID (default: aktives Profil)
     * @returns {Object|null} - Kompatibles Options-Objekt oder null
     */
    function getPostprocessorConfig(id) {
        const profileId = id || _activeProfileId;
        if (!profileId) {
            console.warn(`${PREFIX} Kein Profil ausgewaehlt fuer Postprozessor-Config`);
            return null;
        }

        const profile = _profiles.get(profileId);
        if (!profile) {
            console.warn(`${PREFIX} Profil "${profileId}" nicht gefunden`);
            return null;
        }

        const pp = profile.postprocessor;
        return {
            coordDecimals: pp.coordDecimals,
            feedDecimals: pp.feedDecimals,
            speedFactorNormal: pp.speedFactorNormal,
            speedFactorSmallHole: pp.speedFactorSmallHole,
            smallHoleThreshold: pp.smallHoleThreshold ?? 15,
            useArcFitting: pp.useArcFitting ?? true,
            arcTolerance: pp.arcTolerance ?? 0.01,

            // Erweiterte Felder aus Maschinenprofil
            machineName: profile.name,
            controllerType: profile.controllerType,
            workArea: _deepClone(profile.workArea),
            maxPressureBar: profile.maxPressureBar,
            maxFeedrateMMMin: profile.maxFeedrateMMMin,
            cuttingHeads: profile.cuttingHeads,
            zHeights: profile.zHeights ? _deepClone(profile.zHeights) : null,
            mCodes: profile.mCodes ? _deepClone(profile.mCodes) : null,
            templates: profile.templates ? _deepClone(profile.templates) : null,
            lineNumbering: pp.lineNumbering,
            lineNumberIncrement: pp.lineNumberIncrement,
            programExtension: pp.programExtension,
            subprogramExtension: pp.subprogramExtension
        };
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API: EXPORT / IMPORT
    // ════════════════════════════════════════════════════════════════

    /**
     * Exportiert alle Profile (oder ein einzelnes) als JSON-String.
     * @param {string} [id] - Einzelnes Profil exportieren, oder alle wenn leer
     * @returns {string} JSON-String
     */
    function exportProfiles(id) {
        const exportData = {
            format: 'waricam-machine-profiles',
            version: VERSION,
            exportedAt: new Date().toISOString(),
            profiles: []
        };

        if (id) {
            const profile = _profiles.get(id);
            if (profile) {
                exportData.profiles.push(_deepClone(profile));
            }
        } else {
            for (const [, profile] of _profiles) {
                exportData.profiles.push(_deepClone(profile));
            }
        }

        const json = JSON.stringify(exportData, null, 2);
        console.log(`${PREFIX} Export: ${exportData.profiles.length} Profile (${json.length} Bytes)`);
        return json;
    }

    /**
     * Importiert Profile aus einem JSON-String.
     * Bestehende Profile mit gleicher ID werden uebersprungen (kein Ueberschreiben).
     *
     * @param {string} jsonString - Der JSON-String
     * @param {Object} [options] - Optionen
     * @param {boolean} [options.overwrite=false] - Bestehende Profile ueberschreiben
     * @returns {{ success: boolean, imported: number, skipped: number, errors: string[] }}
     */
    function importProfiles(jsonString, options = {}) {
        const result = { success: false, imported: 0, skipped: 0, errors: [] };

        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (e) {
            result.errors.push(`JSON Parse-Fehler: ${e.message}`);
            return result;
        }

        if (!data || data.format !== 'waricam-machine-profiles') {
            result.errors.push('Ungueltiges Dateiformat (erwartet: waricam-machine-profiles)');
            return result;
        }

        if (!Array.isArray(data.profiles)) {
            result.errors.push('Keine Profile im Import gefunden');
            return result;
        }

        for (const profile of data.profiles) {
            if (!profile || !profile.id) {
                result.errors.push('Profil ohne ID uebersprungen');
                result.skipped++;
                continue;
            }

            const validation = validateProfile(profile);
            if (!validation.valid) {
                result.errors.push(`Profil "${profile.name || profile.id}": ${validation.errors.join(', ')}`);
                result.skipped++;
                continue;
            }

            if (_profiles.has(profile.id) && !options.overwrite) {
                console.log(`${PREFIX} Import: Profil "${profile.id}" existiert bereits — uebersprungen`);
                result.skipped++;
                continue;
            }

            const p = _deepClone(profile);
            p.modifiedAt = new Date().toISOString();
            p.isDefault = false;
            _profiles.set(p.id, p);
            result.imported++;
        }

        if (result.imported > 0) {
            _saveToStorage();
        }

        result.success = result.errors.length === 0 || result.imported > 0;
        console.log(`${PREFIX} Import: ${result.imported} importiert, ${result.skipped} uebersprungen`);
        return result;
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API: UTILITY
    // ════════════════════════════════════════════════════════════════

    /**
     * Setzt auf Werkseinstellungen zurueck (loescht alle benutzerdefinierten Profile).
     */
    function resetToDefaults() {
        _profiles.clear();
        const defaults = _createDefaultProfiles();
        for (const profile of defaults) {
            _profiles.set(profile.id, profile);
        }
        _activeProfileId = defaults[0].id;
        _saveToStorage();
        console.log(`${PREFIX} Zurueckgesetzt auf ${defaults.length} Default-Profile`);
    }

    /**
     * Dupliziert ein bestehendes Profil.
     * @param {string} id - Quell-Profil-ID
     * @param {string} [newName] - Neuer Name (optional)
     * @returns {{ success: boolean, id?: string, errors?: string[] }}
     */
    function duplicateProfile(id, newName) {
        const source = _profiles.get(id);
        if (!source) {
            return { success: false, errors: [`Profil "${id}" nicht gefunden`] };
        }

        const clone = _deepClone(source);
        clone.name = newName || `${source.name} (Kopie)`;
        clone.id = _generateId(clone.name);
        clone.isDefault = false;
        clone.createdAt = new Date().toISOString();
        clone.modifiedAt = clone.createdAt;

        _profiles.set(clone.id, clone);
        _saveToStorage();
        console.log(`${PREFIX} Profil dupliziert: "${source.name}" → "${clone.name}" (${clone.id})`);
        return { success: true, id: clone.id };
    }

    /**
     * Gibt die Liste der unterstuetzten Controller-Typen zurueck.
     * @returns {string[]}
     */
    function getControllerTypes() {
        return [...VALID_CONTROLLER_TYPES];
    }

    /**
     * Gibt die Liste der unterstuetzten Piercing-Typen zurueck.
     * @returns {string[]}
     */
    function getPiercingTypes() {
        return [...VALID_PIERCING_TYPES];
    }

    // ════════════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════════════

    function init() {
        const loaded = _loadFromStorage();
        if (!loaded) {
            resetToDefaults();
            console.log(`${PREFIX} Initialisiert mit Default-Profilen`);
        } else {
            // Default-Profile sicherstellen (falls Benutzer sie geloescht hat)
            const defaults = _createDefaultProfiles();
            let added = 0;
            for (const dp of defaults) {
                if (!_profiles.has(dp.id)) {
                    _profiles.set(dp.id, dp);
                    added++;
                }
            }
            if (added > 0) {
                _saveToStorage();
                console.log(`${PREFIX} ${added} fehlende Default-Profile wiederhergestellt`);
            }
        }

        // Falls kein aktives Profil gesetzt, erstes Default waehlen
        if (!_activeProfileId) {
            _activeProfileId = 'cerasell-wj-3020';
            _saveToStorage();
        }

        const active = _profiles.get(_activeProfileId);
        console.log(`${PREFIX} Bereit — ${_profiles.size} Profile, aktiv: "${active?.name || 'keins'}"`);
    }

    // ════════════════════════════════════════════════════════════════
    // AUTO-INIT
    // ════════════════════════════════════════════════════════════════

    init();

    // ════════════════════════════════════════════════════════════════
    // PUBLIC INTERFACE
    // ════════════════════════════════════════════════════════════════

    return {
        VERSION,

        // CRUD
        addProfile,
        updateProfile,
        deleteProfile,
        getProfile,
        listProfiles,

        // Active Profile
        setActiveProfile,
        getActiveProfile,
        getActiveProfileId,

        // Postprocessor Integration
        getPostprocessorConfig,

        // Export / Import
        exportProfiles,
        importProfiles,

        // Utility
        validateProfile,
        resetToDefaults,
        duplicateProfile,
        getControllerTypes,
        getPiercingTypes
    };
})();
