/**
 * CeraCUT Lead Profiles V1.0
 *
 * Profil-basierte Lead-Verwaltung für Wasserstrahl-CAM.
 * Built-in Profile für typische Material/Dicke-Kombinationen.
 * Batch-Engine wendet Profile regelbasiert auf Konturen an.
 *
 * Persistenz via localStorage.
 *
 * Last Modified: 2026-03-15
 * Build: 20260315-leadprofiles
 */

const LeadProfiles = (() => {
    'use strict';

    const VERSION = '1.0';
    const STORAGE_KEY = 'ceracut_lead_profiles';
    const ACTIVE_KEY = 'ceracut_active_lead_profile';
    const PREFIX = `[LeadProfiles V${VERSION}]`;

    // ════════════════════════════════════════════════════════════════
    // INTERNER STATE
    // ════════════════════════════════════════════════════════════════

    let _profiles = [];
    let _activeProfileId = null;

    // ════════════════════════════════════════════════════════════════
    // BUILT-IN PROFILE (7 Stück)
    // ════════════════════════════════════════════════════════════════

    function _createBuiltinProfiles() {
        return [
            {
                id: 'builtin-stahl-duenn',
                name: 'Stahl dünn (1-3mm)',
                isBuiltin: true,
                ext: {
                    leadInType: 'arc', leadInLength: 3.0, leadInRadius: 1.5, leadInAngle: 90,
                    leadOutLength: 2.0, overcutLength: 0.5,
                    piercingType: 'auto', piercingStationaryTime: 1.5,
                    piercingCircularRadius: 2.0, piercingCircularTime: 2.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 10.0
                },
                int: {
                    leadInType: 'arc', leadInLength: 2.0, leadInRadius: 1.0, leadInAngle: 90,
                    leadOutLength: 1.5, overcutLength: 0.3,
                    piercingType: 'auto', piercingStationaryTime: 1.5,
                    piercingCircularRadius: 2.0, piercingCircularTime: 2.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 8.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 2.0, altLeadInAngle: 5,
                    altLeadOutLength: 1.5, altOvercutLength: 0.5
                },
                smallHole: { thresholdDiameter: 8.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-stahl-mittel',
                name: 'Stahl mittel (4-12mm)',
                isBuiltin: true,
                ext: {
                    leadInType: 'arc', leadInLength: 5.0, leadInRadius: 2.5, leadInAngle: 90,
                    leadOutLength: 4.0, overcutLength: 1.0,
                    piercingType: 'auto', piercingStationaryTime: 1.5,
                    piercingCircularRadius: 2.0, piercingCircularTime: 2.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 15.0
                },
                int: {
                    leadInType: 'arc', leadInLength: 3.0, leadInRadius: 1.5, leadInAngle: 90,
                    leadOutLength: 3.0, overcutLength: 0.5,
                    piercingType: 'auto', piercingStationaryTime: 1.5,
                    piercingCircularRadius: 2.0, piercingCircularTime: 2.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 10.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 3.0, altLeadInAngle: 5,
                    altLeadOutLength: 2.0, altOvercutLength: 1.0
                },
                smallHole: { thresholdDiameter: 8.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-stahl-dick',
                name: 'Stahl dick (13-30mm)',
                isBuiltin: true,
                ext: {
                    leadInType: 'linear', leadInLength: 8.0, leadInRadius: 3.0, leadInAngle: 60,
                    leadOutLength: 6.0, overcutLength: 1.5,
                    piercingType: 'stationary', piercingStationaryTime: 2.5,
                    piercingCircularRadius: 3.0, piercingCircularTime: 3.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 2.0, leadInLengthMax: 20.0
                },
                int: {
                    leadInType: 'linear', leadInLength: 5.0, leadInRadius: 2.0, leadInAngle: 60,
                    leadOutLength: 4.0, overcutLength: 1.0,
                    piercingType: 'stationary', piercingStationaryTime: 2.5,
                    piercingCircularRadius: 3.0, piercingCircularTime: 3.0,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 2.0, leadInLengthMax: 15.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 5.0, altLeadInAngle: 5,
                    altLeadOutLength: 3.0, altOvercutLength: 1.5
                },
                smallHole: { thresholdDiameter: 10.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-aluminium',
                name: 'Aluminium',
                isBuiltin: true,
                ext: {
                    leadInType: 'arc', leadInLength: 4.0, leadInRadius: 2.0, leadInAngle: 90,
                    leadOutLength: 3.0, overcutLength: 0.5,
                    piercingType: 'auto', piercingStationaryTime: 1.0,
                    piercingCircularRadius: 2.0, piercingCircularTime: 1.5,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 12.0
                },
                int: {
                    leadInType: 'arc', leadInLength: 2.5, leadInRadius: 1.5, leadInAngle: 90,
                    leadOutLength: 2.0, overcutLength: 0.3,
                    piercingType: 'auto', piercingStationaryTime: 1.0,
                    piercingCircularRadius: 2.0, piercingCircularTime: 1.5,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 8.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 2.5, altLeadInAngle: 5,
                    altLeadOutLength: 2.0, altOvercutLength: 0.5
                },
                smallHole: { thresholdDiameter: 8.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-glas-keramik',
                name: 'Glas / Keramik',
                isBuiltin: true,
                ext: {
                    leadInType: 'linear', leadInLength: 2.0, leadInRadius: 1.0, leadInAngle: 45,
                    leadOutLength: 1.5, overcutLength: 0.3,
                    piercingType: 'blind', piercingStationaryTime: 2.0,
                    piercingCircularRadius: 1.5, piercingCircularTime: 2.0,
                    preferCorners: false, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 5.0
                },
                int: {
                    leadInType: 'linear', leadInLength: 1.5, leadInRadius: 1.0, leadInAngle: 45,
                    leadOutLength: 1.0, overcutLength: 0.2,
                    piercingType: 'blind', piercingStationaryTime: 2.0,
                    piercingCircularRadius: 1.5, piercingCircularTime: 2.0,
                    preferCorners: false, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 4.0
                },
                alt: {
                    altLeadEnabled: false, altLeadType: 'linear',
                    altLeadInLength: 1.5, altLeadInAngle: 5,
                    altLeadOutLength: 1.0, altOvercutLength: 0.3
                },
                smallHole: { thresholdDiameter: 6.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-schnell',
                name: 'Schnell (Trenn)',
                isBuiltin: true,
                ext: {
                    leadInType: 'linear', leadInLength: 1.5, leadInRadius: 1.0, leadInAngle: 45,
                    leadOutLength: 1.0, overcutLength: 0,
                    piercingType: 'auto', piercingStationaryTime: 1.0,
                    piercingCircularRadius: 2.0, piercingCircularTime: 1.5,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 5.0
                },
                int: {
                    leadInType: 'linear', leadInLength: 1.0, leadInRadius: 1.0, leadInAngle: 45,
                    leadOutLength: 0.5, overcutLength: 0,
                    piercingType: 'auto', piercingStationaryTime: 1.0,
                    piercingCircularRadius: 2.0, piercingCircularTime: 1.5,
                    preferCorners: true, leadInDynamic: false,
                    leadInLengthMin: 1.0, leadInLengthMax: 4.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 1.0, altLeadInAngle: 5,
                    altLeadOutLength: 0.5, altOvercutLength: 0
                },
                smallHole: { thresholdDiameter: 6.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            },
            {
                id: 'builtin-qualitaet',
                name: 'Qualität (Fein)',
                isBuiltin: true,
                ext: {
                    leadInType: 'arc', leadInLength: 8.0, leadInRadius: 4.0, leadInAngle: 90,
                    leadOutLength: 6.0, overcutLength: 2.0,
                    piercingType: 'stationary', piercingStationaryTime: 2.0,
                    piercingCircularRadius: 3.0, piercingCircularTime: 2.5,
                    preferCorners: true, leadInDynamic: true,
                    leadInLengthMin: 2.0, leadInLengthMax: 20.0
                },
                int: {
                    leadInType: 'arc', leadInLength: 5.0, leadInRadius: 2.5, leadInAngle: 90,
                    leadOutLength: 4.0, overcutLength: 1.5,
                    piercingType: 'stationary', piercingStationaryTime: 2.0,
                    piercingCircularRadius: 3.0, piercingCircularTime: 2.5,
                    preferCorners: true, leadInDynamic: true,
                    leadInLengthMin: 2.0, leadInLengthMax: 15.0
                },
                alt: {
                    altLeadEnabled: true, altLeadType: 'linear',
                    altLeadInLength: 5.0, altLeadInAngle: 5,
                    altLeadOutLength: 3.0, altOvercutLength: 2.0
                },
                smallHole: { thresholdDiameter: 10.0, strategy: 'center_pierce' },
                slit: { leadInType: 'on_geometry', overcutLength: 0 }
            }
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // INIT / LADEN / SPEICHERN
    // ════════════════════════════════════════════════════════════════

    function init() {
        _profiles = _createBuiltinProfiles();

        // Custom-Profile aus localStorage laden
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const custom = JSON.parse(stored);
                if (Array.isArray(custom)) {
                    custom.forEach(p => {
                        p.isBuiltin = false;
                        _profiles.push(p);
                    });
                    console.log(`${PREFIX} ${custom.length} Benutzerprofile geladen`);
                }
            }
        } catch (e) {
            console.warn(`${PREFIX} Fehler beim Laden der Benutzerprofile:`, e);
        }

        // Aktives Profil laden
        _activeProfileId = localStorage.getItem(ACTIVE_KEY) || 'builtin-stahl-mittel';
        console.log(`${PREFIX} Initialisiert — ${_profiles.length} Profile, aktiv: ${_activeProfileId}`);
    }

    function _saveCustomToStorage() {
        const custom = _profiles.filter(p => !p.isBuiltin);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
        } catch (e) {
            console.warn(`${PREFIX} Fehler beim Speichern:`, e);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════════════════════════

    function getAll() {
        return _profiles;
    }

    function getById(id) {
        return _profiles.find(p => p.id === id) || null;
    }

    function getActive() {
        return getById(_activeProfileId) || _profiles[0];
    }

    function setActive(id) {
        _activeProfileId = id;
        try {
            localStorage.setItem(ACTIVE_KEY, id);
        } catch (e) { /* silent */ }
        console.log(`${PREFIX} Aktives Profil: ${id}`);
    }

    function saveCustom(name, data) {
        const id = 'custom-' + Date.now();
        const profile = {
            id,
            name,
            isBuiltin: false,
            ext: { ...data.ext },
            int: { ...data.int },
            alt: { ...data.alt },
            smallHole: { ...data.smallHole },
            slit: { ...data.slit }
        };
        _profiles.push(profile);
        _saveCustomToStorage();
        console.log(`${PREFIX} Benutzerprofil gespeichert: "${name}" (${id})`);
        return profile;
    }

    function deleteCustom(id) {
        const idx = _profiles.findIndex(p => p.id === id);
        if (idx === -1) return false;
        if (_profiles[idx].isBuiltin) {
            console.warn(`${PREFIX} Built-in Profile können nicht gelöscht werden`);
            return false;
        }
        _profiles.splice(idx, 1);
        _saveCustomToStorage();
        if (_activeProfileId === id) {
            _activeProfileId = 'builtin-stahl-mittel';
            localStorage.setItem(ACTIVE_KEY, _activeProfileId);
        }
        console.log(`${PREFIX} Benutzerprofil gelöscht: ${id}`);
        return true;
    }

    /**
     * Prüft ob aktuelle UI-Werte vom Profil abweichen
     */
    function isModified(profile, extVals, intVals, altVals) {
        if (!profile) return false;
        const extKeys = ['leadInType', 'leadInLength', 'leadInRadius', 'leadInAngle',
                         'leadOutLength', 'overcutLength', 'piercingType', 'preferCorners',
                         'leadInDynamic'];
        const altKeys = ['altLeadEnabled', 'altLeadType', 'altLeadInLength', 'altLeadInAngle',
                         'altLeadOutLength', 'altOvercutLength'];

        for (const key of extKeys) {
            if (extVals[key] !== undefined && profile.ext[key] !== undefined) {
                if (String(extVals[key]) !== String(profile.ext[key])) return true;
            }
        }
        for (const key of extKeys) {
            if (intVals[key] !== undefined && profile.int[key] !== undefined) {
                if (String(intVals[key]) !== String(profile.int[key])) return true;
            }
        }
        if (altVals) {
            for (const key of altKeys) {
                if (altVals[key] !== undefined && profile.alt[key] !== undefined) {
                    if (String(altVals[key]) !== String(profile.alt[key])) return true;
                }
            }
        }
        return false;
    }

    // ════════════════════════════════════════════════════════════════
    // BATCH ENGINE
    // ════════════════════════════════════════════════════════════════

    /**
     * Wendet Profil-Regeln auf alle Konturen an.
     *
     * Logik pro Kontur:
     *   reference → skip
     *   leadManualOverride → skip
     *   slit → profile.slit (on_geometry, kein Overcut)
     *   hole + Ø < smallHole.thresholdDiameter → center_pierce, kurze Linear
     *   hole → profile.int
     *   disc → profile.ext
     *
     * @param {CamContour[]} contours
     * @param {object} profile
     * @returns {{ applied: number, skipped: number, details: string[] }}
     */
    function applyBatchRules(contours, profile) {
        if (!profile || !contours) return { applied: 0, skipped: 0, details: [] };

        const details = [];
        let applied = 0;
        let skipped = 0;

        contours.forEach(c => {
            // Skip: Referenz
            if (c.isReference) {
                skipped++;
                return;
            }

            // Skip: Manuell überschrieben
            if (c.leadManualOverride) {
                details.push(`${c.name}: übersprungen (manuell)`);
                skipped++;
                return;
            }

            // Skip: nicht schneidbar
            if (!c.isClosed && c.cuttingMode !== 'slit') {
                skipped++;
                return;
            }

            // Slit-Konturen
            if (c.cuttingMode === 'slit') {
                c.leadInType = profile.slit.leadInType || 'on_geometry';
                c.overcutLength = profile.slit.overcutLength ?? 0;
                c.leadOutLength = 0;
                c._cachedLeadInPath = null;
                c._cachedLeadOutPath = null;
                c._cachedOvercutPath = null;
                details.push(`${c.name}: Slit-Regel`);
                applied++;
                return;
            }

            // Small Hole Check
            if (c.cuttingMode === 'hole' && profile.smallHole) {
                const diameter = _estimateDiameter(c);
                if (diameter > 0 && diameter < profile.smallHole.thresholdDiameter) {
                    // Center-Pierce: kurze Linear-Leads
                    c.leadInType = 'linear';
                    c.leadInLength = Math.min(diameter * 0.3, 2.0);
                    c.leadInRadius = 0;
                    c.leadInAngle = 45;
                    c.leadOutLength = Math.min(diameter * 0.2, 1.5);
                    c.overcutLength = 0.3;
                    c.piercingType = 'auto';
                    c.preferCorners = false;
                    c.leadInDynamic = false;
                    c._cachedLeadInPath = null;
                    c._cachedLeadOutPath = null;
                    c._cachedOvercutPath = null;
                    if (c.preferCorners && c._rotationCount === 0) {
                        c.autoPlaceStartPoint?.(contours);
                    }
                    details.push(`${c.name}: Small-Hole (Ø${diameter.toFixed(1)}mm < ${profile.smallHole.thresholdDiameter}mm)`);
                    applied++;
                    return;
                }
            }

            // Hole → int-Profil
            if (c.cuttingMode === 'hole') {
                _applyProfileSection(c, profile.int, profile.alt, contours);
                details.push(`${c.name}: Innen-Profil`);
                applied++;
                return;
            }

            // Disc → ext-Profil
            _applyProfileSection(c, profile.ext, profile.alt, contours);
            details.push(`${c.name}: Außen-Profil`);
            applied++;
        });

        console.log(`${PREFIX} Batch-Apply: ${applied} angewendet, ${skipped} übersprungen`);
        return { applied, skipped, details };
    }

    /**
     * Profil-Sektion auf eine Kontur anwenden
     */
    function _applyProfileSection(c, section, alt, allContours) {
        if (!section) return;
        c.leadInType = section.leadInType;
        c.leadInLength = section.leadInLength;
        c.leadInRadius = section.leadInRadius;
        c.leadInAngle = section.leadInAngle;
        c.leadOutType = section.leadInType;
        c.leadOutLength = section.leadOutLength;
        c.leadOutRadius = section.leadInRadius;
        c.leadOutAngle = section.leadInAngle;
        c.overcutLength = section.overcutLength;
        c.piercingType = section.piercingType;
        c.preferCorners = section.preferCorners;
        c.leadInDynamic = section.leadInDynamic;
        c.leadInLengthMin = section.leadInLengthMin;
        c.leadInLengthMax = section.leadInLengthMax;
        if (section.piercingStationaryTime !== undefined) c.piercingStationaryTime = section.piercingStationaryTime;
        if (section.piercingCircularRadius !== undefined) c.piercingCircularRadius = section.piercingCircularRadius;
        if (section.piercingCircularTime !== undefined)   c.piercingCircularTime   = section.piercingCircularTime;

        // Alt-Lead
        if (alt) {
            c.altLeadEnabled   = alt.altLeadEnabled;
            c.altLeadType      = alt.altLeadType;
            c.altLeadInLength  = alt.altLeadInLength;
            c.altLeadInAngle   = alt.altLeadInAngle;
            c.altLeadOutLength = alt.altLeadOutLength;
            c.altOvercutLength = alt.altOvercutLength;
        }

        // Cache invalidieren
        c._cachedLeadInPath = null;
        c._cachedLeadOutPath = null;
        c._cachedOvercutPath = null;
        if (c.preferCorners && c._rotationCount === 0) {
            c.autoPlaceStartPoint?.(allContours);
        }
    }

    /**
     * Durchmesser einer Kontur schätzen (für Small-Hole-Erkennung)
     */
    function _estimateDiameter(c) {
        if (!c.points || c.points.length < 3) return 0;
        // BBox-basiert: Durchschnitt aus Breite und Höhe
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of c.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return ((maxX - minX) + (maxY - minY)) / 2;
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC INTERFACE
    // ════════════════════════════════════════════════════════════════

    return {
        VERSION,
        init,
        getAll,
        getById,
        getActive,
        setActive,
        saveCustom,
        deleteCustom,
        isModified,
        applyBatchRules
    };
})();
