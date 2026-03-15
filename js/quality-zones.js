/**
 * CeraCUT Quality Zones V1.1
 * Automatische Erkennung von Geschwindigkeitszonen fuer Wasserstrahlschneiden
 * Ecken, enge Radien, Anfahrt/Abfahrt → Geschwindigkeitsanpassung
 * Last Modified: 2026-03-09
 * Build: 20260309
 */

const QualityZones = {

    VERSION: '1.0',
    BUILD: '20260309',

    // ════════════════════════════════════════════════════════════════
    // KONFIGURATION
    // ════════════════════════════════════════════════════════════════

    config: {
        // Ecken-Erkennung: Winkel unter diesem Schwellwert gilt als "scharf"
        cornerAngle: 120,           // Grad (Innenwinkel < 120° → CORNER)
        cornerSpeed: 0.33,          // 33% Geschwindigkeit in Ecken

        // Enge Radien
        smallRadius: 5,             // mm — Krümmungsradius unter diesem Wert → SMALL_RADIUS
        smallRadiusSpeed: 0.5,      // 50% Geschwindigkeit

        // Anfahrt nach Piercing
        rampDistance: 3,             // mm — Rampe nach Einstich
        rampStartSpeed: 0.20,       // 20% am Anfang der Rampe
        rampEndSpeed: 1.0,          // 100% am Ende der Rampe

        // Abfahrt vor Lead-Out
        rampDownDistance: 2,         // mm — Bremsrampe vor Ausfahrt
        rampDownEndSpeed: 0.5,      // 50% am Ende

        // Vorausschau-Distanz fuer Ecken (Bremsweg vor/nach Ecke)
        cornerApproachDistance: 1.5, // mm vor der Ecke abbremsen
        cornerExitDistance: 1.0,     // mm nach der Ecke beschleunigen

        // Mindestsegmentlaenge fuer Analyse
        minSegmentLength: 0.01      // mm — kuerzere Segmente werden uebersprungen
    },

    // ════════════════════════════════════════════════════════════════
    // ZONE TYPES
    // ════════════════════════════════════════════════════════════════

    ZONE_NORMAL:       'NORMAL',
    ZONE_CORNER:       'CORNER',
    ZONE_SMALL_RADIUS: 'SMALL_RADIUS',
    ZONE_START:        'START',
    ZONE_END:          'END',

    // ════════════════════════════════════════════════════════════════
    // HILFSFUNKTIONEN
    // ════════════════════════════════════════════════════════════════

    /**
     * Distanz zwischen zwei Punkten
     */
    _dist(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Berechnet den Winkel zwischen drei Punkten (Winkel bei p2)
     * Gibt den Innenwinkel in Grad zurueck (0-180)
     */
    _angleBetween(p1, p2, p3) {
        const v1x = p1.x - p2.x;
        const v1y = p1.y - p2.y;
        const v2x = p3.x - p2.x;
        const v2y = p3.y - p2.y;

        const dot = v1x * v2x + v1y * v2y;
        const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

        if (len1 < 1e-10 || len2 < 1e-10) return 180;

        const cosAngle = Math.max(-1, Math.min(1, dot / (len1 * len2)));
        return Math.acos(cosAngle) * (180 / Math.PI);
    },

    /**
     * Berechnet den lokalen Kruemmungsradius an einem Punkt (3-Punkt-Methode)
     * Gibt Infinity fuer kollineare Punkte zurueck
     */
    _curvatureRadius(p1, p2, p3) {
        const ax = p1.x, ay = p1.y;
        const bx = p2.x, by = p2.y;
        const cx = p3.x, cy = p3.y;

        // Flaeche des Dreiecks (2x)
        const area2 = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
        if (area2 < 1e-12) return Infinity;

        const a = this._dist(p2, p3);
        const b = this._dist(p1, p3);
        const c = this._dist(p1, p2);

        // Umkreisradius R = abc / (4 * Flaeche)
        return (a * b * c) / (2 * area2);
    },

    /**
     * Berechnet kumulative Distanzen entlang der Polyline
     * @returns {number[]} Kumulative Distanz fuer jeden Punkt
     */
    _cumulativeDistances(points) {
        const dists = [0];
        for (let i = 1; i < points.length; i++) {
            dists.push(dists[i - 1] + this._dist(points[i - 1], points[i]));
        }
        return dists;
    },

    /**
     * Gesamtlaenge der Polyline
     */
    _totalLength(points) {
        let len = 0;
        for (let i = 1; i < points.length; i++) {
            len += this._dist(points[i - 1], points[i]);
        }
        return len;
    },

    // ════════════════════════════════════════════════════════════════
    // HAUPTANALYSE
    // ════════════════════════════════════════════════════════════════

    /**
     * Analysiert eine Kontur und gibt Geschwindigkeitszonen zurueck
     * @param {CamContour|{points: Array<{x,y}>}} contour - Kontur mit points-Array
     * @returns {Array<{startParam: number, endParam: number, type: string, speedFactor: number, angle: number|null}>}
     */
    analyze(contour) {
        const points = contour?.points;
        if (!points || points.length < 2) {
            console.warn('[QualityZones V1.0] Kontur hat zu wenige Punkte');
            return [];
        }

        const cfg = this.config;
        const cumDist = this._cumulativeDistances(points);
        const totalLen = cumDist[cumDist.length - 1];

        if (totalLen < cfg.minSegmentLength) {
            console.warn('[QualityZones V1.0] Kontur zu kurz:', totalLen.toFixed(3), 'mm');
            return [];
        }

        const zones = [];

        // --- 1. Ecken erkennen ---
        const corners = this._detectCorners(points, cumDist);

        // --- 2. Enge Radien erkennen ---
        const smallRadii = this._detectSmallRadii(points, cumDist);

        // --- 3. Start-Rampe (nach Pierce) ---
        const rampUpEnd = Math.min(cfg.rampDistance, totalLen * 0.25);
        if (rampUpEnd > cfg.minSegmentLength) {
            zones.push({
                startParam: 0,
                endParam: rampUpEnd,
                type: this.ZONE_START,
                speedFactor: cfg.rampStartSpeed,
                angle: null
            });
        }

        // --- 4. End-Rampe (vor Lead-Out) ---
        const rampDownStart = Math.max(totalLen - cfg.rampDownDistance, totalLen * 0.75);
        if (totalLen - rampDownStart > cfg.minSegmentLength) {
            zones.push({
                startParam: rampDownStart,
                endParam: totalLen,
                type: this.ZONE_END,
                speedFactor: cfg.rampDownEndSpeed,
                angle: null
            });
        }

        // --- 5. Ecken-Zonen mit Brems-/Beschleunigungsdistanz ---
        for (const corner of corners) {
            const approachStart = Math.max(0, corner.distance - cfg.cornerApproachDistance);
            const exitEnd = Math.min(totalLen, corner.distance + cfg.cornerExitDistance);
            zones.push({
                startParam: approachStart,
                endParam: exitEnd,
                type: this.ZONE_CORNER,
                speedFactor: cfg.cornerSpeed,
                angle: corner.angle
            });
        }

        // --- 6. Kleine Radien ---
        for (const sr of smallRadii) {
            zones.push({
                startParam: sr.startParam,
                endParam: sr.endParam,
                type: this.ZONE_SMALL_RADIUS,
                speedFactor: cfg.smallRadiusSpeed,
                angle: null
            });
        }

        // Sortieren nach startParam
        zones.sort((a, b) => a.startParam - b.startParam);

        console.log(`[QualityZones V1.0] Analyse: ${zones.length} Zonen (${corners.length} Ecken, ${smallRadii.length} enge Radien), Laenge: ${totalLen.toFixed(1)} mm`);
        return zones;
    },

    /**
     * Erkennt scharfe Ecken in der Polyline
     * @returns {Array<{index: number, distance: number, angle: number}>}
     */
    _detectCorners(points, cumDist) {
        const cfg = this.config;
        const corners = [];

        for (let i = 1; i < points.length - 1; i++) {
            const segLen1 = this._dist(points[i - 1], points[i]);
            const segLen2 = this._dist(points[i], points[i + 1]);

            if (segLen1 < cfg.minSegmentLength || segLen2 < cfg.minSegmentLength) continue;

            const angle = this._angleBetween(points[i - 1], points[i], points[i + 1]);

            if (angle < cfg.cornerAngle) {
                corners.push({
                    index: i,
                    distance: cumDist[i],
                    angle: angle
                });
            }
        }

        return corners;
    },

    /**
     * Erkennt Bereiche mit engem Kruemmungsradius
     * @returns {Array<{startParam: number, endParam: number, radius: number}>}
     */
    _detectSmallRadii(points, cumDist) {
        const cfg = this.config;
        const regions = [];
        let regionStart = null;
        let minRadius = Infinity;

        for (let i = 1; i < points.length - 1; i++) {
            const segLen1 = this._dist(points[i - 1], points[i]);
            const segLen2 = this._dist(points[i], points[i + 1]);

            if (segLen1 < cfg.minSegmentLength || segLen2 < cfg.minSegmentLength) continue;

            const radius = this._curvatureRadius(points[i - 1], points[i], points[i + 1]);

            if (radius < cfg.smallRadius && radius >= cfg.minSegmentLength) {
                if (regionStart === null) {
                    regionStart = i - 1;
                    minRadius = radius;
                } else {
                    minRadius = Math.min(minRadius, radius);
                }
            } else {
                if (regionStart !== null) {
                    regions.push({
                        startParam: cumDist[regionStart],
                        endParam: cumDist[i],
                        radius: minRadius
                    });
                    regionStart = null;
                    minRadius = Infinity;
                }
            }
        }

        // Offene Region am Ende schliessen
        if (regionStart !== null) {
            regions.push({
                startParam: cumDist[regionStart],
                endParam: cumDist[points.length - 1],
                radius: minRadius
            });
        }

        return regions;
    },

    // ════════════════════════════════════════════════════════════════
    // SPEED PROFILE
    // ════════════════════════════════════════════════════════════════

    /**
     * Erzeugt ein Geschwindigkeitsprofil ueber die gesamte Kontur
     * @param {CamContour|{points: Array<{x,y}>}} contour
     * @param {number} baseSpeed - Basisgeschwindigkeit in mm/min
     * @returns {Array<{distance: number, speed: number}>}
     */
    getSpeedProfile(contour, baseSpeed) {
        const points = contour?.points;
        if (!points || points.length < 2) return [];

        const zones = this.analyze(contour);
        const cumDist = this._cumulativeDistances(points);
        const totalLen = cumDist[cumDist.length - 1];
        const cfg = this.config;

        // Sammle alle relevanten Distanz-Stellen
        const samplePoints = new Set();
        samplePoints.add(0);
        samplePoints.add(totalLen);

        // Punkte an jedem Polyline-Vertex
        for (const d of cumDist) {
            samplePoints.add(d);
        }

        // Zonengrenzen
        for (const zone of zones) {
            samplePoints.add(zone.startParam);
            samplePoints.add(zone.endParam);
            // Mittelpunkt fuer glattere Profile
            samplePoints.add((zone.startParam + zone.endParam) / 2);
        }

        // Sortieren
        const distances = Array.from(samplePoints).sort((a, b) => a - b);

        // Geschwindigkeit fuer jeden Sample-Punkt berechnen
        const profile = [];
        for (const d of distances) {
            let speedFactor = 1.0;

            for (const zone of zones) {
                if (d >= zone.startParam && d <= zone.endParam) {
                    let zoneFactor;

                    if (zone.type === this.ZONE_START) {
                        // Lineare Rampe von rampStartSpeed nach rampEndSpeed
                        const zoneLen = zone.endParam - zone.startParam;
                        const t = zoneLen > 1e-10 ? (d - zone.startParam) / zoneLen : 1.0;
                        zoneFactor = cfg.rampStartSpeed + t * (cfg.rampEndSpeed - cfg.rampStartSpeed);
                    } else if (zone.type === this.ZONE_END) {
                        // Lineare Rampe von 1.0 nach rampDownEndSpeed
                        const zoneLen = zone.endParam - zone.startParam;
                        const t = zoneLen > 1e-10 ? (d - zone.startParam) / zoneLen : 1.0;
                        zoneFactor = 1.0 - t * (1.0 - cfg.rampDownEndSpeed);
                    } else {
                        zoneFactor = zone.speedFactor;
                    }

                    // Niedrigster Faktor gewinnt (mehrere Zonen koennen ueberlappen)
                    speedFactor = Math.min(speedFactor, zoneFactor);
                }
            }

            profile.push({
                distance: d,
                speed: baseSpeed * speedFactor
            });
        }

        console.log(`[QualityZones V1.0] Speed-Profil: ${profile.length} Stuetzstellen, ${baseSpeed} mm/min Basis`);
        return profile;
    },

    // ════════════════════════════════════════════════════════════════
    // KONTUR-ZUWEISUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Analysiert die Kontur und speichert die Zonen im Kontur-Objekt
     * @param {CamContour} contour
     * @returns {Array} Die gesetzten qualityZones
     */
    applyToContour(contour) {
        if (!contour) {
            console.warn('[QualityZones V1.0] applyToContour: keine Kontur uebergeben');
            return [];
        }

        const zones = this.analyze(contour);
        contour.qualityZones = zones;

        console.log(`[QualityZones V1.0] ${contour.name || 'Kontur'}: ${zones.length} Zonen zugewiesen`);
        return zones;
    },

    // ════════════════════════════════════════════════════════════════
    // VISUALISIERUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Erzeugt farbige Segmente fuer die Rendering-Anzeige
     * Gruen = schnell (NORMAL), Gelb = mittel (SMALL_RADIUS), Rot = langsam (CORNER/START/END)
     * @param {CamContour|{points: Array<{x,y}>}} contour
     * @returns {Array<{points: Array<{x,y}>, color: string, speedFactor: number, type: string}>}
     */
    getVisualization(contour) {
        const points = contour?.points;
        if (!points || points.length < 2) return [];

        const zones = contour.qualityZones || this.analyze(contour);
        const cumDist = this._cumulativeDistances(points);
        const totalLen = cumDist[cumDist.length - 1];
        const cfg = this.config;

        const segments = [];

        for (let i = 0; i < points.length - 1; i++) {
            const segStart = cumDist[i];
            const segEnd = cumDist[i + 1];
            const segMid = (segStart + segEnd) / 2;

            // Niedrigsten Speed-Faktor fuer dieses Segment ermitteln
            let speedFactor = 1.0;
            let dominantType = this.ZONE_NORMAL;

            for (const zone of zones) {
                // Pruefe ob Segment-Mittelpunkt in Zone liegt
                if (segMid >= zone.startParam && segMid <= zone.endParam) {
                    let zoneFactor;

                    if (zone.type === this.ZONE_START) {
                        const zoneLen = zone.endParam - zone.startParam;
                        const t = zoneLen > 1e-10 ? (segMid - zone.startParam) / zoneLen : 1.0;
                        zoneFactor = cfg.rampStartSpeed + t * (cfg.rampEndSpeed - cfg.rampStartSpeed);
                    } else if (zone.type === this.ZONE_END) {
                        const zoneLen = zone.endParam - zone.startParam;
                        const t = zoneLen > 1e-10 ? (segMid - zone.startParam) / zoneLen : 1.0;
                        zoneFactor = 1.0 + t * (cfg.rampDownEndSpeed - 1.0);
                    } else {
                        zoneFactor = zone.speedFactor;
                    }

                    if (zoneFactor < speedFactor) {
                        speedFactor = zoneFactor;
                        dominantType = zone.type;
                    }
                }
            }

            const color = this._speedToColor(speedFactor);

            segments.push({
                points: [points[i], points[i + 1]],
                color: color,
                speedFactor: speedFactor,
                type: dominantType
            });
        }

        console.log(`[QualityZones V1.0] Visualisierung: ${segments.length} Segmente`);
        return segments;
    },

    /**
     * Mappt einen Geschwindigkeitsfaktor auf eine Farbe
     * 1.0 = gruen (#00ff00), 0.5 = gelb (#ffff00), 0.0 = rot (#ff0000)
     */
    _speedToColor(factor) {
        const f = Math.max(0, Math.min(1, factor));

        let r, g;
        if (f >= 0.5) {
            // Gruen nach Gelb (0.5 → 1.0)
            const t = (f - 0.5) * 2;
            r = Math.round(255 * (1 - t));
            g = 255;
        } else {
            // Gelb nach Rot (0.0 → 0.5)
            const t = f * 2;
            r = 255;
            g = Math.round(255 * t);
        }

        const rHex = r.toString(16).padStart(2, '0');
        const gHex = g.toString(16).padStart(2, '0');
        return `#${rHex}${gHex}00`;
    },

    // ════════════════════════════════════════════════════════════════
    // UTILITIES
    // ════════════════════════════════════════════════════════════════

    /**
     * Gibt eine textuelle Zusammenfassung der Zonen aus
     * @param {Array} zones - Ergebnis von analyze()
     * @returns {string}
     */
    summary(zones) {
        if (!zones || zones.length === 0) return 'Keine Zonen';

        const counts = {};
        for (const z of zones) {
            counts[z.type] = (counts[z.type] || 0) + 1;
        }

        const parts = [];
        for (const [type, count] of Object.entries(counts)) {
            parts.push(`${count}x ${type}`);
        }
        return parts.join(', ');
    },

    /**
     * Setzt die Konfiguration (partiell)
     * @param {Object} overrides
     */
    setConfig(overrides) {
        if (!overrides || typeof overrides !== 'object') return;
        for (const key of Object.keys(overrides)) {
            if (this.config.hasOwnProperty(key)) {
                this.config[key] = overrides[key];
                console.log(`[QualityZones V1.0] Config: ${key} = ${overrides[key]}`);
            } else {
                console.warn(`[QualityZones V1.0] Unbekannter Config-Key: ${key}`);
            }
        }
    },

    /**
     * Setzt Konfiguration auf Standardwerte zurueck
     */
    resetConfig() {
        this.config.cornerAngle = 120;
        this.config.cornerSpeed = 0.33;
        this.config.smallRadius = 5;
        this.config.smallRadiusSpeed = 0.5;
        this.config.rampDistance = 3;
        this.config.rampStartSpeed = 0.20;
        this.config.rampEndSpeed = 1.0;
        this.config.rampDownDistance = 2;
        this.config.rampDownEndSpeed = 0.5;
        this.config.cornerApproachDistance = 1.5;
        this.config.cornerExitDistance = 1.0;
        this.config.minSegmentLength = 0.01;
        console.log('[QualityZones V1.0] Config zurueckgesetzt');
    }
};

console.log('[QualityZones V1.0] Modul geladen — Build 20260309');
