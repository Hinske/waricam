/**
 * WARICAM Cost Calculator V1.0
 * Kosten- und Zeitberechnung für Wasserstrahlschneiden
 *
 * Berechnet Schnittzeit, Maschinenkosten, Materialkosten,
 * Abrasiv-/Wasser-/Stromverbrauch und Materialausnutzung.
 *
 * Integration: CeraJetEngine (optional), CamContour
 *
 * Build: 20260309
 * Last Modified: 2026-03-09
 */

const CostCalculator = (() => {
    'use strict';

    const VERSION = '1.0';
    const LOG_PREFIX = '[CostCalc V1.0]';

    // ════════════════════════════════════════════════════════════════
    // STANDARD-EINSTELLUNGEN
    // ════════════════════════════════════════════════════════════════

    const DEFAULT_SETTINGS = {
        // Material & Platte
        materialPrice: 50.0,        // €/m²
        sheetWidth: 1000,           // mm
        sheetHeight: 1000,          // mm
        thickness: 10,              // mm

        // Maschine
        machineRate: 120.0,         // €/h
        setupTime: 300,             // Sekunden (Rüstzeit)
        setupCost: 25.0,            // € (Pauschale)
        rapidSpeed: 20000,          // mm/min (Eilgang)

        // Abrasiv
        abrasiveRate: 0.35,         // €/kg
        abrasiveConsumption: 0.25,  // kg/min

        // Wasser
        waterRate: 4.50,            // €/m³
        waterConsumption: 3.5,      // l/min

        // Strom
        powerRate: 0.30,            // €/kWh
        machinePower: 37,           // kW

        // Piercing
        piercingCost: 0.10,         // € pro Anschuss

        // CeraJet-Konfiguration (für automatische Speed-Ermittlung)
        materialId: 1,              // Stahl
        nozzleId: 3,                // 0.25/0.80
        pressure: 2900,             // bar
        optMode: 'kostenProduktion',
    };

    // ════════════════════════════════════════════════════════════════
    // HILFSFUNKTIONEN
    // ════════════════════════════════════════════════════════════════

    /**
     * Pfadlänge einer Kontur berechnen (Polylinien-Umfang)
     */
    function _getPathLength(contour) {
        const pts = contour?.points;
        if (!pts || pts.length < 2) return 0;
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        }
        return len;
    }

    /**
     * Bounding-Box-Fläche einer Kontur (mm²)
     */
    function _getBoundingArea(contour) {
        const pts = contour?.points;
        if (!pts || pts.length < 2) return 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return (maxX - minX) * (maxY - minY);
    }

    /**
     * Kontur-Fläche (Shoelace) — nutzt CamContour.getArea() falls vorhanden
     */
    function _getContourArea(contour) {
        if (typeof contour?.getArea === 'function') return contour.getArea();
        const pts = contour?.points;
        if (!pts || pts.length < 3) return 0;
        let area = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
        }
        return Math.abs(area / 2);
    }

    /**
     * Centroid einer Kontur
     */
    function _getCentroid(contour) {
        if (typeof contour?.getCentroid === 'function') return contour.getCentroid();
        const pts = contour?.points;
        if (!pts || pts.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0;
        for (const p of pts) { sx += p.x; sy += p.y; }
        return { x: sx / pts.length, y: sy / pts.length };
    }

    /**
     * Distanz zwischen zwei Punkten
     */
    function _dist(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    /**
     * Schnittgeschwindigkeit für eine Kontur ermitteln (mm/min)
     * Nutzt CeraJetEngine falls verfügbar, sonst Fallback
     */
    function _getCuttingSpeed(contour, settings) {
        const quality = contour?.quality ?? 2;

        // CeraJetEngine Integration (optional)
        if (typeof CeraJetEngine !== 'undefined') {
            const tech = CeraJetEngine?.calculate?.({
                materialId: settings.materialId ?? 1,
                nozzleId: settings.nozzleId ?? 3,
                thickness: settings.thickness ?? 10,
                pressure: settings.pressure ?? 2900,
                optMode: settings.optMode ?? 'kostenProduktion',
            });
            if (tech?.feeds?.[quality] !== undefined) {
                return tech.feeds[quality];
            }
        }

        // Fallback: Konservative Schätzwerte (mm/min) für 10mm Stahl
        const fallbackFeeds = [29.5, 38.5, 53.8, 85.4, 119.6];
        return fallbackFeeds[quality] ?? fallbackFeeds[3];
    }

    /**
     * Anschusszeit für eine Kontur (Sekunden)
     */
    function _getPierceTime(contour, settings) {
        if (typeof CeraJetEngine !== 'undefined') {
            const tech = CeraJetEngine?.calculate?.({
                materialId: settings.materialId ?? 1,
                nozzleId: settings.nozzleId ?? 3,
                thickness: settings.thickness ?? 10,
                pressure: settings.pressure ?? 2900,
                optMode: settings.optMode ?? 'kostenProduktion',
            });
            if (tech?.pierceTime !== undefined) {
                return tech.pierceTime;
            }
        }
        // Fallback: 2s Basis, skaliert mit Dicke
        return Math.max(0.3, 2.0 * Math.pow((settings.thickness ?? 10) / 10, 1.6));
    }

    // ════════════════════════════════════════════════════════════════
    // FORMAT-HELFER
    // ════════════════════════════════════════════════════════════════

    /**
     * Währungsbetrag formatieren (EUR)
     * @param {number} value - Betrag in EUR
     * @returns {string} z.B. "12,50 €"
     */
    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) return '0,00 €';
        return value.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) + ' €';
    }

    /**
     * Zeitdauer formatieren
     * @param {number} seconds - Dauer in Sekunden
     * @returns {string} z.B. "1h 23min 45s" oder "3min 12s"
     */
    function formatTime(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return '0s';
        seconds = Math.round(seconds);
        if (seconds < 0) return '0s';

        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) return `${h}h ${m}min ${s}s`;
        if (m > 0) return `${m}min ${s}s`;
        return `${s}s`;
    }

    // ════════════════════════════════════════════════════════════════
    // KONTUR-ZEITBERECHNUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Schnittzeit für eine einzelne Kontur (Sekunden)
     */
    function calcContourCuttingTime(contour, settings) {
        const pathLen = _getPathLength(contour);    // mm
        const speed = _getCuttingSpeed(contour, settings);  // mm/min
        if (speed <= 0) return 0;
        return (pathLen / speed) * 60;  // Sekunden
    }

    /**
     * Detaillierte Zeitberechnung für eine Kontur
     */
    function calcContourTime(contour, settings) {
        const pathLength = _getPathLength(contour);
        const cuttingSpeed = _getCuttingSpeed(contour, settings);
        const cuttingTime = cuttingSpeed > 0 ? (pathLength / cuttingSpeed) * 60 : 0;
        const pierceTime = _getPierceTime(contour, settings);

        return {
            pathLength,         // mm
            cuttingSpeed,       // mm/min
            cuttingTime,        // s
            pierceTime,         // s
            totalTime: cuttingTime + pierceTime,  // s
        };
    }

    // ════════════════════════════════════════════════════════════════
    // EILGANG (RAPID) BERECHNUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Gesamte Eilgangzeit zwischen Konturen berechnen (Sekunden)
     * @param {CamContour[]} contours - Konturen in Schnitt-Reihenfolge
     * @param {Object} settings
     * @returns {number} Eilgangzeit in Sekunden
     */
    function _calcRapidTime(contours, settings) {
        const rapidSpeed = settings.rapidSpeed ?? 20000; // mm/min
        if (rapidSpeed <= 0 || contours.length < 2) return 0;

        let totalDist = 0;
        for (let i = 1; i < contours.length; i++) {
            const prevEnd = _getContourEndPoint(contours[i - 1]);
            const nextStart = _getContourStartPoint(contours[i]);
            if (prevEnd && nextStart) {
                totalDist += _dist(prevEnd, nextStart);
            }
        }
        return (totalDist / rapidSpeed) * 60;
    }

    function _getContourStartPoint(contour) {
        const pts = contour?.points;
        if (!pts || pts.length === 0) return null;
        const idx = contour.startPointIndex ?? 0;
        return pts[Math.min(idx, pts.length - 1)];
    }

    function _getContourEndPoint(contour) {
        const pts = contour?.points;
        if (!pts || pts.length === 0) return null;
        // Bei geschlossener Kontur endet der Schnitt am Startpunkt
        if (contour.isClosed) {
            const idx = contour.startPointIndex ?? 0;
            return pts[Math.min(idx, pts.length - 1)];
        }
        return pts[pts.length - 1];
    }

    // ════════════════════════════════════════════════════════════════
    // HAUPTBERECHNUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Vollständige Kosten- und Zeitberechnung
     *
     * @param {CamContour[]} contours - Alle Schneidkonturen
     * @param {number[]} cutOrder - Schnitt-Reihenfolge (Indizes in contours[])
     * @param {Object} settings - Einstellungen (merged mit DEFAULT_SETTINGS)
     * @returns {Object} Vollständige Kalkulation
     */
    function calculate(contours, cutOrder, settings = {}) {
        console.time(`${LOG_PREFIX} calculate`);
        const cfg = { ...DEFAULT_SETTINGS, ...settings };

        // Konturen filtern: nur Schneide-Konturen (kein Referenzrahmen)
        const cuttingContours = (contours || []).filter(c =>
            c && !c.isReference && c.cuttingMode
        );

        // Schnitt-Reihenfolge anwenden
        let orderedContours;
        if (cutOrder && cutOrder.length > 0) {
            orderedContours = cutOrder
                .map(idx => contours?.[idx])
                .filter(c => c && !c.isReference && c.cuttingMode);
        } else {
            orderedContours = cuttingContours;
        }

        const contourCount = orderedContours.length;
        console.log(`${LOG_PREFIX} Berechnung für ${contourCount} Konturen, ${cfg.thickness}mm, Platte ${cfg.sheetWidth}×${cfg.sheetHeight}mm`);

        // ── Pro-Kontur-Berechnung ──
        const contourDetails = orderedContours.map((c, idx) => {
            const timing = calcContourTime(c, cfg);
            const area = _getContourArea(c);
            return {
                index: idx,
                name: c.name || `Kontur ${idx + 1}`,
                type: c.cuttingMode,
                quality: c.quality,
                pathLength: timing.pathLength,
                cuttingSpeed: timing.cuttingSpeed,
                cuttingTime: timing.cuttingTime,
                pierceTime: timing.pierceTime,
                totalTime: timing.totalTime,
                area,
            };
        });

        // ── Zeiten aggregieren ──
        const totalCuttingTime = contourDetails.reduce((s, d) => s + d.cuttingTime, 0);
        const totalPierceTime = contourDetails.reduce((s, d) => s + d.pierceTime, 0);
        const rapidTime = _calcRapidTime(orderedContours, cfg);
        const setupTime = cfg.setupTime;
        const totalJobTime = totalCuttingTime + totalPierceTime + rapidTime + setupTime;
        const totalPathLength = contourDetails.reduce((s, d) => s + d.pathLength, 0);

        // ── Plattendaten ──
        const sheetArea = (cfg.sheetWidth * cfg.sheetHeight) / 1e6;   // m²
        const sheetAreaMm2 = cfg.sheetWidth * cfg.sheetHeight;         // mm²

        // ── Materialausnutzung ──
        // Disc-Konturen = Nutzfläche, Holes = Abfall innerhalb Discs
        const discArea = contourDetails
            .filter(d => orderedContours[d.index]?.cuttingMode === 'disc')
            .reduce((s, d) => s + d.area, 0);
        const holeArea = contourDetails
            .filter(d => orderedContours[d.index]?.cuttingMode === 'hole')
            .reduce((s, d) => s + d.area, 0);
        const usedArea = discArea - holeArea;       // mm² Netto-Nutzfläche
        const wasteArea = sheetAreaMm2 - usedArea;  // mm² Abfall
        const utilization = sheetAreaMm2 > 0 ? (usedArea / sheetAreaMm2) * 100 : 0;

        // ── Kosten ──
        const activeMinutes = (totalCuttingTime + totalPierceTime) / 60;  // Schneid-Minuten
        const totalMinutes = totalJobTime / 60;                           // Gesamt-Minuten inkl. Rüsten

        // Maschinenkosten (basierend auf Gesamtzeit)
        const machineCost = (totalMinutes / 60) * cfg.machineRate;

        // Abrasivkosten (nur während Schneiden + Piercing)
        const abrasiveCost = activeMinutes * cfg.abrasiveConsumption * cfg.abrasiveRate;

        // Wasserkosten (nur während Schneiden + Piercing)
        const waterVolume = activeMinutes * cfg.waterConsumption / 1000;  // m³
        const waterCost = waterVolume * cfg.waterRate;

        // Stromkosten (Gesamtzeit)
        const powerConsumption = (totalMinutes / 60) * cfg.machinePower;  // kWh
        const powerCost = powerConsumption * cfg.powerRate;

        // Materialkosten
        const materialCost = sheetArea * cfg.materialPrice;

        // Rüstkosten (Pauschale)
        const setupCost = cfg.setupCost;

        // Piercing-Kosten (pro Anschuss)
        const piercingCost = contourCount * cfg.piercingCost;

        // Gesamtkosten
        const totalCost = machineCost + abrasiveCost + waterCost + powerCost +
                          materialCost + setupCost + piercingCost;

        // ── Pro-Teil-Kosten (bei Nesting) ──
        const partCount = contourDetails.filter(d =>
            orderedContours[d.index]?.cuttingMode === 'disc'
        ).length || 1;
        const costPerPart = totalCost / partCount;

        // ── Ergebnis ──
        const result = {
            // Zusammenfassung
            summary: {
                contourCount,
                partCount,
                totalPathLength: Math.round(totalPathLength * 100) / 100,  // mm
                totalJobTime: Math.round(totalJobTime * 10) / 10,          // s
                totalCost: Math.round(totalCost * 100) / 100,              // €
                costPerPart: Math.round(costPerPart * 100) / 100,          // €
                utilization: Math.round(utilization * 10) / 10,            // %
            },

            // Zeitaufschlüsselung
            time: {
                cutting: Math.round(totalCuttingTime * 10) / 10,     // s
                piercing: Math.round(totalPierceTime * 10) / 10,     // s
                rapid: Math.round(rapidTime * 10) / 10,              // s
                setup: setupTime,                                     // s
                total: Math.round(totalJobTime * 10) / 10,           // s
                formatted: formatTime(Math.round(totalJobTime)),
            },

            // Kostenaufschlüsselung
            costs: {
                machine: Math.round(machineCost * 100) / 100,
                abrasive: Math.round(abrasiveCost * 100) / 100,
                water: Math.round(waterCost * 100) / 100,
                power: Math.round(powerCost * 100) / 100,
                material: Math.round(materialCost * 100) / 100,
                setup: Math.round(setupCost * 100) / 100,
                piercing: Math.round(piercingCost * 100) / 100,
                total: Math.round(totalCost * 100) / 100,
            },

            // Verbrauch
            consumption: {
                abrasive: Math.round(activeMinutes * cfg.abrasiveConsumption * 1000) / 1000,  // kg
                water: Math.round(waterVolume * 1000) / 1000,                                  // m³
                power: Math.round(powerConsumption * 100) / 100,                               // kWh
            },

            // Material
            material: {
                sheetArea: Math.round(sheetArea * 10000) / 10000,    // m²
                usedArea: Math.round(usedArea * 100) / 100,          // mm²
                wasteArea: Math.round(wasteArea * 100) / 100,        // mm²
                utilization: Math.round(utilization * 10) / 10,      // %
                wastePercent: Math.round((100 - utilization) * 10) / 10,
            },

            // Pro-Kontur-Details
            contours: contourDetails,

            // Einstellungen (für Nachvollziehbarkeit)
            settings: cfg,
        };

        console.log(`${LOG_PREFIX} Ergebnis: ${formatTime(Math.round(totalJobTime))}, ${formatCurrency(totalCost)}, ${result.material.utilization}% Ausnutzung`);
        console.log(`${LOG_PREFIX} Kosten: Maschine=${formatCurrency(machineCost)}, Abrasiv=${formatCurrency(abrasiveCost)}, Wasser=${formatCurrency(waterCost)}, Strom=${formatCurrency(powerCost)}, Material=${formatCurrency(materialCost)}`);
        console.log(`${LOG_PREFIX} Pro Teil: ${formatCurrency(costPerPart)} (${partCount} Teile)`);
        console.timeEnd(`${LOG_PREFIX} calculate`);

        return result;
    }

    // ════════════════════════════════════════════════════════════════
    // SCHNELLBERECHNUNG (ohne Reihenfolge)
    // ════════════════════════════════════════════════════════════════

    /**
     * Schnelle Schätzung ohne Eilgangberechnung
     * @param {CamContour[]} contours
     * @param {Object} settings
     * @returns {Object} Vereinfachtes Ergebnis
     */
    function quickEstimate(contours, settings = {}) {
        const cfg = { ...DEFAULT_SETTINGS, ...settings };
        const cutting = (contours || []).filter(c => c && !c.isReference && c.cuttingMode);

        let totalTime = 0;
        let totalLength = 0;
        for (const c of cutting) {
            const t = calcContourTime(c, cfg);
            totalTime += t.totalTime;
            totalLength += t.pathLength;
        }
        totalTime += cfg.setupTime;

        const totalMinutes = totalTime / 60;
        const activeMinutes = (totalTime - cfg.setupTime) / 60;
        const totalCost = (totalMinutes / 60) * cfg.machineRate +
                          activeMinutes * cfg.abrasiveConsumption * cfg.abrasiveRate +
                          (activeMinutes * cfg.waterConsumption / 1000) * cfg.waterRate +
                          (totalMinutes / 60) * cfg.machinePower * cfg.powerRate +
                          cfg.setupCost +
                          cutting.length * cfg.piercingCost;

        return {
            contourCount: cutting.length,
            totalPathLength: Math.round(totalLength * 100) / 100,
            totalTime: Math.round(totalTime * 10) / 10,
            totalTimeFormatted: formatTime(Math.round(totalTime)),
            estimatedCost: Math.round(totalCost * 100) / 100,
            estimatedCostFormatted: formatCurrency(totalCost),
        };
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════════════════════════

    console.log(`${LOG_PREFIX} Modul geladen`);

    return {
        VERSION,
        DEFAULT_SETTINGS,
        calculate,
        quickEstimate,
        calcContourTime,
        calcContourCuttingTime,
        formatCurrency,
        formatTime,
    };

})();
