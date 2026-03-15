/**
 * CeraCUT Toolpath Simulator V1.0
 * Simulation und Verifikation des Schneidpfads vor dem Export.
 *
 * Erkennt: Rapid-Moves durch Material, Lead-In/Out-Kollisionen,
 * Selbstüberschneidungen, Out-of-Bounds, Inside-Out-Reihenfolge,
 * zu dünne Wandstärken nach Kerf-Offset.
 *
 * Animation-API: Schritt-für-Schritt-Visualisierung mit virtuellem Schneidkopf.
 *
 * Last Modified: 2026-03-09
 * Build: 20260309
 * Version: V1.0
 */

const ToolpathSimulator = {

    VERSION: '1.0',
    BUILD: '20260309',
    PREFIX: '[ToolpathSim V1.0]',

    // ════════════════════════════════════════════════════════════════
    // KONFIGURATION
    // ════════════════════════════════════════════════════════════════

    /** Standard-Eilgang-Geschwindigkeit in mm/min (Sinumerik 840D G0) */
    DEFAULT_RAPID_SPEED: 30000,

    /** Minimale Wandstärke nach Kerf-Offset in mm */
    MIN_WALL_THICKNESS: 0.3,

    /** Toleranz für Punkt-Vergleiche in mm */
    TOLERANCE: 0.01,

    /** Minimaler Abstand Lead zu Nachbar-Kontur in mm */
    MIN_LEAD_CLEARANCE: 0.2,

    // ════════════════════════════════════════════════════════════════
    // HAUPTANALYSE
    // ════════════════════════════════════════════════════════════════

    /**
     * Vollständige Toolpath-Verifikation.
     *
     * @param {CamContour[]} contours - Alle Konturen
     * @param {number[]} cutOrder - Schnittfolge (Indizes in contours[])
     * @param {Object} options
     * @param {Object} [options.sheetBounds] - { minX, minY, maxX, maxY } Plattengrenzen
     * @param {Object} [options.nullPoint] - { x, y } Nullpunkt
     * @param {Object} [options.technology] - CeraJetEngine.calculate() Ergebnis
     * @param {number} [options.rapidSpeed] - Eilgang mm/min (Default: 30000)
     * @param {number} [options.minWallThickness] - Min. Wandstärke mm
     * @returns {{ valid: boolean, warnings: string[], errors: string[], stats: Object }}
     */
    verify(contours, cutOrder, options = {}) {
        console.log(`${this.PREFIX} Verifikation startet — ${contours?.length || 0} Konturen`);
        console.time(`${this.PREFIX} verify`);

        const result = {
            valid: true,
            warnings: [],
            errors: [],
            stats: {
                totalLength: 0,
                cuttingLength: 0,
                rapidLength: 0,
                estimatedTime: 0,
                pierceCount: 0,
                contourCount: 0,
                contourStats: []
            }
        };

        if (!contours || contours.length === 0) {
            result.errors.push('Keine Konturen vorhanden');
            result.valid = false;
            console.timeEnd(`${this.PREFIX} verify`);
            return result;
        }

        // Schneidbare Konturen ermitteln (ohne Referenz)
        const cuttable = this._getCuttableContours(contours, cutOrder);
        result.stats.contourCount = cuttable.length;

        if (cuttable.length === 0) {
            result.warnings.push('Keine schneidbaren Konturen gefunden (nur Referenz oder leer)');
            console.timeEnd(`${this.PREFIX} verify`);
            return result;
        }

        // 1. Schnittfolge prüfen (Inside-Out)
        this._verifyCutOrder(cuttable, contours, result);

        // 2. Boundary-Check
        if (options.sheetBounds) {
            this._verifyBounds(cuttable, options.sheetBounds, result);
        }

        // 3. Lead-In/Out Kollisionen (Matrix gegen ALLE Konturen)
        this._verifyLeadCollisions(cuttable, contours, result);

        // 4. Selbstüberschneidungen pro Kontur
        this._verifySelfIntersections(cuttable, result);

        // 5. Rapid-Moves durch Material
        this._verifyRapidMoves(cuttable, contours, result);

        // 6. Kerf-Wandstärken
        const minWall = options.minWallThickness || this.MIN_WALL_THICKNESS;
        this._verifyKerfThickness(cuttable, contours, minWall, result);

        // 7. Statistiken berechnen
        this._calculateStats(cuttable, contours, options, result);

        result.valid = result.errors.length === 0;

        console.log(`${this.PREFIX} Ergebnis: ${result.valid ? 'GUELTIG' : 'FEHLER'} — ${result.errors.length} Fehler, ${result.warnings.length} Warnungen`);
        console.log(`${this.PREFIX} Statistik: ${result.stats.cuttingLength.toFixed(1)}mm Schnitt, ${result.stats.rapidLength.toFixed(1)}mm Eilgang, ~${result.stats.estimatedTime.toFixed(1)}s`);
        console.timeEnd(`${this.PREFIX} verify`);

        return result;
    },

    // ════════════════════════════════════════════════════════════════
    // SCHNEIDBARE KONTUREN
    // ════════════════════════════════════════════════════════════════

    /**
     * Filtert und ordnet Konturen nach cutOrder.
     * @returns {CamContour[]} Geordnete schneidbare Konturen
     */
    _getCuttableContours(contours, cutOrder) {
        const ordered = [];

        if (cutOrder && cutOrder.length > 0) {
            for (const idx of cutOrder) {
                const c = contours[idx];
                if (c && !c.isReference && c.cuttingMode) {
                    ordered.push(c);
                }
            }
        } else {
            // Fallback: Alle nicht-Referenz mit cuttingMode
            for (const c of contours) {
                if (!c.isReference && c.cuttingMode) {
                    ordered.push(c);
                }
            }
        }

        return ordered;
    },

    // ════════════════════════════════════════════════════════════════
    // 1. INSIDE-OUT REIHENFOLGE
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft ob Löcher (holes) vor ihren umgebenden Scheiben (discs) geschnitten werden.
     */
    _verifyCutOrder(cuttable, allContours, result) {
        const discs = allContours.filter(c => c.cuttingMode === 'disc' && !c.isReference);

        for (let i = 0; i < cuttable.length; i++) {
            const c = cuttable[i];
            if (c.cuttingMode !== 'hole') continue;

            // Finde die umgebende Scheibe
            const parentDisc = this._findParentDisc(c, discs);
            if (!parentDisc) continue;

            const discIndex = cuttable.indexOf(parentDisc);
            if (discIndex === -1) continue;

            if (discIndex < i) {
                result.errors.push(
                    `Schnittfolge-Fehler: Loch "${c.name}" (Position ${i + 1}) wird NACH ` +
                    `Scheibe "${parentDisc.name}" (Position ${discIndex + 1}) geschnitten — Inside-Out verletzt`
                );
            }
        }
    },

    /**
     * Findet die Scheibe, die ein Loch umgibt (Containment per Centroid).
     */
    _findParentDisc(hole, discs) {
        if (!hole.points || hole.points.length < 3) return null;
        const centroid = typeof Geometry !== 'undefined'
            ? Geometry.centroid(hole.points)
            : this._simpleCentroid(hole.points);

        let bestDisc = null;
        let bestArea = Infinity;

        for (const disc of discs) {
            if (!disc.points || disc.points.length < 3) continue;
            if (!this._pointInPolygon(centroid, disc.points)) continue;

            const area = Math.abs(this._signedArea(disc.points));
            if (area < bestArea) {
                bestArea = area;
                bestDisc = disc;
            }
        }

        return bestDisc;
    },

    // ════════════════════════════════════════════════════════════════
    // 2. BOUNDARY CHECK
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft ob alle Pfade innerhalb der Plattengrenzen liegen.
     */
    _verifyBounds(cuttable, bounds, result) {
        for (const c of cuttable) {
            // Konturpunkte prüfen
            const pts = c.points;
            if (!pts) continue;

            const oob = this._findOutOfBoundsPoints(pts, bounds);
            if (oob.length > 0) {
                result.warnings.push(
                    `Kontur "${c.name}" hat ${oob.length} Punkt(e) außerhalb der Platte ` +
                    `(max. Abweichung: ${oob[0].distance.toFixed(2)}mm)`
                );
            }

            // Lead-In prüfen
            const leadIn = c.getLeadInPath?.();
            if (leadIn?.points) {
                const oobLead = this._findOutOfBoundsPoints(leadIn.points, bounds);
                if (oobLead.length > 0) {
                    result.errors.push(
                        `Lead-In von "${c.name}" liegt außerhalb der Platte ` +
                        `(Abweichung: ${oobLead[0].distance.toFixed(2)}mm)`
                    );
                }
            }

            // Lead-Out prüfen
            const leadOut = c.getLeadOutPath?.();
            if (leadOut?.points) {
                const oobLead = this._findOutOfBoundsPoints(leadOut.points, bounds);
                if (oobLead.length > 0) {
                    result.warnings.push(
                        `Lead-Out von "${c.name}" liegt außerhalb der Platte ` +
                        `(Abweichung: ${oobLead[0].distance.toFixed(2)}mm)`
                    );
                }
            }
        }
    },

    /**
     * Findet Punkte außerhalb der Grenzen, sortiert nach Abweichung (absteigend).
     */
    _findOutOfBoundsPoints(points, bounds) {
        const oob = [];
        for (const p of points) {
            let dist = 0;
            if (p.x < bounds.minX) dist = Math.max(dist, bounds.minX - p.x);
            if (p.x > bounds.maxX) dist = Math.max(dist, p.x - bounds.maxX);
            if (p.y < bounds.minY) dist = Math.max(dist, bounds.minY - p.y);
            if (p.y > bounds.maxY) dist = Math.max(dist, p.y - bounds.maxY);
            if (dist > this.TOLERANCE) {
                oob.push({ point: p, distance: dist });
            }
        }
        oob.sort((a, b) => b.distance - a.distance);
        return oob;
    },

    // ════════════════════════════════════════════════════════════════
    // 3. LEAD-IN/OUT KOLLISIONSMATRIX
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft Lead-In/Out jeder Kontur gegen ALLE anderen Konturen.
     * Erkennt Durchkreuzung von Nachbar-Konturen (nicht nur eigene).
     */
    _verifyLeadCollisions(cuttable, allContours, result) {
        const collisionCount = { leadIn: 0, leadOut: 0 };

        for (let i = 0; i < cuttable.length; i++) {
            const c = cuttable[i];
            const leadIn = c.getLeadInPath?.();
            const leadOut = c.getLeadOutPath?.();

            for (let j = 0; j < allContours.length; j++) {
                const other = allContours[j];
                if (other === c || other.isReference) continue;
                if (!other.points || other.points.length < 3 || !other.isClosed) continue;

                // Lead-In gegen andere Kontur
                if (leadIn?.points && leadIn.points.length >= 2) {
                    if (this._pathCrossesContour(leadIn.points, other.points)) {
                        collisionCount.leadIn++;
                        result.errors.push(
                            `Lead-In von "${c.name}" kreuzt Kontur "${other.name}"`
                        );
                    }
                }

                // Lead-Out gegen andere Kontur
                if (leadOut?.points && leadOut.points.length >= 2) {
                    if (this._pathCrossesContour(leadOut.points, other.points)) {
                        collisionCount.leadOut++;
                        result.warnings.push(
                            `Lead-Out von "${c.name}" kreuzt Kontur "${other.name}"`
                        );
                    }
                }
            }

            // Lead-In Piercing-Punkt: prüfen ob innerhalb einer fremden Kontur
            if (leadIn?.piercingPoint) {
                for (const other of allContours) {
                    if (other === c || other.isReference) continue;
                    if (!other.points || other.points.length < 3 || !other.isClosed) continue;

                    if (this._pointInPolygon(leadIn.piercingPoint, other.points)) {
                        result.errors.push(
                            `Piercing-Punkt von "${c.name}" liegt innerhalb von "${other.name}"`
                        );
                    }
                }
            }
        }

        if (collisionCount.leadIn > 0 || collisionCount.leadOut > 0) {
            console.log(`${this.PREFIX} Kollisionen: ${collisionCount.leadIn} Lead-In, ${collisionCount.leadOut} Lead-Out`);
        }
    },

    /**
     * Prüft ob ein Pfad (Polyline) eine geschlossene Kontur kreuzt.
     */
    _pathCrossesContour(pathPoints, contourPoints) {
        const n = contourPoints.length;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            const a1 = pathPoints[i];
            const a2 = pathPoints[i + 1];

            for (let j = 0; j < n - 1; j++) {
                const b1 = contourPoints[j];
                const b2 = contourPoints[j + 1];

                if (this._segmentsIntersect(a1, a2, b1, b2)) {
                    return true;
                }
            }
        }
        return false;
    },

    // ════════════════════════════════════════════════════════════════
    // 4. SELBSTUEBERSCHNEIDUNGEN
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft auf Selbstüberschneidungen (nicht-adjazente Segmente kreuzen).
     */
    _verifySelfIntersections(cuttable, result) {
        for (const c of cuttable) {
            if (!c.points || c.points.length < 4) continue;

            const pts = c.points;
            const n = pts.length;
            let intersectionCount = 0;

            // O(n^2) Segment-vs-Segment — nur nicht-adjazente Paare
            for (let i = 0; i < n - 1; i++) {
                for (let j = i + 2; j < n - 1; j++) {
                    // Adjazente Segmente überspringen
                    if (i === 0 && j === n - 2 && c.isClosed) continue;

                    if (this._segmentsIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) {
                        intersectionCount++;
                        if (intersectionCount === 1) {
                            result.warnings.push(
                                `Kontur "${c.name}" hat Selbstüberschneidung(en)`
                            );
                        }
                    }
                }
            }

            // Frühzeitiger Abbruch nach erster Meldung pro Kontur
            // (nur 1 Warnung pro Kontur, nicht pro Kreuzungspunkt)
        }
    },

    // ════════════════════════════════════════════════════════════════
    // 5. RAPID-MOVES DURCH MATERIAL
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft ob Eilgang-Verbindungen (zwischen Konturen) durch bereits
     * geschnittene oder noch ungeschnittene Teile fahren.
     */
    _verifyRapidMoves(cuttable, allContours, result) {
        if (cuttable.length < 2) return;

        // Sammle alle geschlossenen Konturen als potenzielle Hindernisse
        const obstacles = allContours.filter(c =>
            !c.isReference && c.isClosed && c.points?.length >= 3
        );

        for (let i = 0; i < cuttable.length - 1; i++) {
            const current = cuttable[i];
            const next = cuttable[i + 1];

            // Endpunkt der aktuellen Kontur (Lead-Out-Ende oder letzter Konturpunkt)
            const exitPt = this._getExitPoint(current);
            // Startpunkt der nächsten Kontur (Pierce-Punkt vom Lead-In)
            const entryPt = this._getEntryPoint(next);

            if (!exitPt || !entryPt) continue;

            // Prüfe ob der Rapid-Move durch ein Teil fährt
            for (const obs of obstacles) {
                if (obs === current || obs === next) continue;

                if (this._segmentCrossesPolygon(exitPt, entryPt, obs.points)) {
                    result.warnings.push(
                        `Rapid-Move von "${current.name}" zu "${next.name}" kreuzt ` +
                        `Kontur "${obs.name}" (mögliche Kollision)`
                    );
                    break; // Eine Warnung pro Rapid-Move reicht
                }
            }
        }
    },

    /**
     * Bestimmt den Exit-Punkt einer Kontur (nach Lead-Out/Overcut).
     */
    _getExitPoint(contour) {
        const leadOut = contour.getLeadOutPath?.();
        if (leadOut?.endPoint) return leadOut.endPoint;
        if (leadOut?.points?.length > 0) return leadOut.points[leadOut.points.length - 1];

        const overcut = contour.getOvercutPath?.();
        if (overcut?.endPoint) return overcut.endPoint;

        const pts = contour.points;
        if (pts?.length > 0) return pts[pts.length - 1];

        return null;
    },

    /**
     * Bestimmt den Entry-Punkt einer Kontur (Pierce-Punkt vom Lead-In).
     */
    _getEntryPoint(contour) {
        const leadIn = contour.getLeadInPath?.();
        if (leadIn?.piercingPoint) return leadIn.piercingPoint;
        if (leadIn?.points?.length > 0) return leadIn.points[0];

        const pts = contour.points;
        if (pts?.length > 0) return pts[0];

        return null;
    },

    /**
     * Prüft ob ein Segment ein geschlossenes Polygon kreuzt.
     */
    _segmentCrossesPolygon(p1, p2, polygon) {
        const n = polygon.length;
        for (let i = 0; i < n - 1; i++) {
            if (this._segmentsIntersect(p1, p2, polygon[i], polygon[i + 1])) {
                return true;
            }
        }
        return false;
    },

    // ════════════════════════════════════════════════════════════════
    // 6. KERF-WANDSTAERKE
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft ob Teile nach Kerf-Offset zu dünn werden.
     * Vergleicht minimalen Abstand zwischen benachbarten Konturen.
     */
    _verifyKerfThickness(cuttable, allContours, minWall, result) {
        const closedContours = cuttable.filter(c => c.isClosed && c.points?.length >= 3);

        for (let i = 0; i < closedContours.length; i++) {
            const c1 = closedContours[i];
            const kerf1 = c1.kerfWidth || 0;

            for (let j = i + 1; j < closedContours.length; j++) {
                const c2 = closedContours[j];
                const kerf2 = c2.kerfWidth || 0;

                const minDist = this._minContourDistance(c1.points, c2.points);
                if (minDist === null) continue;

                // Effektive Wandstärke = Abstand - halbe Kerf beider Seiten
                const effectiveWall = minDist - (kerf1 / 2) - (kerf2 / 2);

                if (effectiveWall < minWall && effectiveWall >= 0) {
                    result.warnings.push(
                        `Dünne Wandstärke: "${c1.name}" ↔ "${c2.name}" — ` +
                        `${effectiveWall.toFixed(2)}mm (Minimum: ${minWall}mm)`
                    );
                } else if (effectiveWall < 0) {
                    result.errors.push(
                        `Kerf-Ueberlappung: "${c1.name}" ↔ "${c2.name}" — ` +
                        `Konturen überlappen sich nach Kerf-Offset um ${Math.abs(effectiveWall).toFixed(2)}mm`
                    );
                }
            }

            // Prüfe auch Loch-in-Scheibe Abstand
            if (c1.cuttingMode === 'disc') {
                const holes = closedContours.filter(h =>
                    h.cuttingMode === 'hole' && this._pointInPolygon(
                        this._simpleCentroid(h.points), c1.points
                    )
                );

                for (const hole of holes) {
                    const minDist = this._minContourDistance(c1.points, hole.points);
                    if (minDist === null) continue;

                    const effectiveWall = minDist - (c1.kerfWidth / 2) - (hole.kerfWidth / 2);
                    if (effectiveWall < minWall && effectiveWall >= 0) {
                        result.warnings.push(
                            `Dünne Wandstärke Loch→Rand: "${hole.name}" in "${c1.name}" — ` +
                            `${effectiveWall.toFixed(2)}mm`
                        );
                    }
                }
            }
        }
    },

    /**
     * Berechnet minimalen Abstand zwischen zwei Konturen (Sampling-basiert).
     * Nutzt nicht jeden Punkt — nur eine Stichprobe für Performance.
     */
    _minContourDistance(pts1, pts2) {
        if (!pts1?.length || !pts2?.length) return null;

        let minDist = Infinity;

        // Adaptive Sampling: maximal 50 Punkte pro Kontur
        const step1 = Math.max(1, Math.floor(pts1.length / 50));
        const step2 = Math.max(1, Math.floor(pts2.length / 50));

        for (let i = 0; i < pts1.length; i += step1) {
            for (let j = 0; j < pts2.length; j += step2) {
                const dx = pts1[i].x - pts2[j].x;
                const dy = pts1[i].y - pts2[j].y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) minDist = d;
            }
        }

        // Verfeinern: bei kleinen Abständen genauer prüfen
        if (minDist < 10) {
            for (let i = 0; i < pts1.length; i++) {
                for (let j = 0; j < pts2.length - 1; j++) {
                    const d = this._pointToSegmentDistance(pts1[i], pts2[j], pts2[j + 1]);
                    if (d < minDist) minDist = d;
                }
            }
        }

        return minDist;
    },

    // ════════════════════════════════════════════════════════════════
    // 7. STATISTIKEN
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet Gesamtlängen, Schnittzeit, Pierce-Anzahl.
     */
    _calculateStats(cuttable, allContours, options, result) {
        const rapidSpeed = options.rapidSpeed || this.DEFAULT_RAPID_SPEED;
        const technology = options.technology || null;

        let totalCutting = 0;
        let totalRapid = 0;
        let totalTime = 0;
        let pierceCount = 0;
        const contourStats = [];

        let lastExitPt = options.nullPoint || { x: 0, y: 0 };

        for (let i = 0; i < cuttable.length; i++) {
            const c = cuttable[i];
            pierceCount++;

            // Konturlänge (Schneidpfad)
            const contourLen = this._polylineLength(c.points);

            // Lead-In Länge
            const leadIn = c.getLeadInPath?.();
            const leadInLen = leadIn?.points ? this._polylineLength(leadIn.points) : 0;

            // Overcut Länge
            const overcut = c.getOvercutPath?.();
            const overcutLen = overcut?.points ? this._polylineLength(overcut.points) : 0;

            // Lead-Out Länge
            const leadOut = c.getLeadOutPath?.();
            const leadOutLen = leadOut?.points ? this._polylineLength(leadOut.points) : 0;

            // Gesamte Schnittlänge dieser Kontur
            const cutLen = leadInLen + contourLen + overcutLen + leadOutLen;
            totalCutting += cutLen;

            // Rapid-Move von letzter Exit-Position zum Pierce-Punkt
            const entryPt = this._getEntryPoint(c);
            const rapidLen = entryPt ? this._dist(lastExitPt, entryPt) : 0;
            totalRapid += rapidLen;

            // Exit-Punkt aktualisieren
            const exitPt = this._getExitPoint(c);
            if (exitPt) lastExitPt = exitPt;

            // Schnittzeit berechnen
            const feedRate = this._getFeedRate(c, technology);
            const cutTime = feedRate > 0 ? (cutLen / feedRate) * 60 : 0; // Sekunden
            const rapidTime = rapidSpeed > 0 ? (rapidLen / rapidSpeed) * 60 : 0;

            // Pierce-Zeit
            const pierceTime = this._getPierceTime(c, technology);

            const contourTime = cutTime + rapidTime + pierceTime;
            totalTime += contourTime;

            contourStats.push({
                name: c.name,
                cuttingMode: c.cuttingMode,
                contourLength: contourLen,
                leadInLength: leadInLen,
                leadOutLength: leadOutLen,
                overcutLength: overcutLen,
                totalCutLength: cutLen,
                rapidLength: rapidLen,
                feedRate: feedRate,
                estimatedTime: contourTime,
                pierceTime: pierceTime
            });
        }

        // Rapid vom letzten Teil zurück zum Nullpunkt
        const returnPt = options.nullPoint || { x: 0, y: 0 };
        const returnDist = this._dist(lastExitPt, returnPt);
        totalRapid += returnDist;
        totalTime += rapidSpeed > 0 ? (returnDist / rapidSpeed) * 60 : 0;

        result.stats.cuttingLength = totalCutting;
        result.stats.rapidLength = totalRapid;
        result.stats.totalLength = totalCutting + totalRapid;
        result.stats.estimatedTime = totalTime;
        result.stats.pierceCount = pierceCount;
        result.stats.contourStats = contourStats;
    },

    /**
     * Ermittelt den Vorschub für eine Kontur (mm/min).
     * Nutzt CeraJetEngine wenn verfügbar.
     */
    _getFeedRate(contour, technology) {
        if (technology?.feeds) {
            const qi = (contour.quality ?? 2);
            const idx = Math.max(0, Math.min(4, qi));
            return technology.feeds[idx] || technology.feeds[3] || 100;
        }

        // Fallback: CeraJetEngine direkt abfragen
        if (typeof CeraJetEngine !== 'undefined' && CeraJetEngine?.Q_FACTORS) {
            // Ohne Technologie-Config kein sinnvoller Fallback
            return 100; // Platzhalter: 100 mm/min
        }

        return 100; // Konservative Schätzung
    },

    /**
     * Ermittelt die Pierce-Zeit in Sekunden.
     */
    _getPierceTime(contour, technology) {
        if (technology?.pierceTime) {
            return technology.pierceTime;
        }

        // Fallback: CeraJetEngine direkt
        if (typeof CeraJetEngine !== 'undefined' && CeraJetEngine?.calcPierceTime) {
            // Ohne Material-Info: Standard 2s
            return 2.0;
        }

        return 2.0; // Default Pierce-Zeit
    },

    // ════════════════════════════════════════════════════════════════
    // ANIMATION API
    // ════════════════════════════════════════════════════════════════

    /** Laufende Animation (Singleton) */
    _animation: null,

    /**
     * Startet die Toolpath-Animation auf einem Canvas.
     *
     * @param {HTMLCanvasElement} canvas - Ziel-Canvas
     * @param {CamContour[]} contours - Konturen
     * @param {number[]} cutOrder - Schnittfolge
     * @param {Object} options
     * @param {number} [options.speed=1] - Geschwindigkeitsfaktor (1=Echtzeit, 10=10x)
     * @param {Function} [options.onStep] - Callback pro Frame: ({ phase, contourIndex, progress, headPos, contourName })
     * @param {Function} [options.onComplete] - Callback bei Fertigstellung: ({ totalTime })
     * @param {Function} [options.renderBase] - Funktion zum Zeichnen des Hintergrunds (canvas, ctx)
     * @param {Object} [options.transform] - { offsetX, offsetY, scale } für Welt→Canvas Mapping
     * @param {Object} [options.colors] - { rapid, cutting, leadIn, leadOut, head, trail }
     * @returns {{ stop: Function, pause: Function, resume: Function, setSpeed: Function }}
     */
    startAnimation(canvas, contours, cutOrder, options = {}) {
        // Vorherige Animation stoppen
        this.stopAnimation();

        const ctx = canvas.getContext('2d');
        const speed = options.speed || 1;
        const onStep = options.onStep || null;
        const onComplete = options.onComplete || null;

        const colors = Object.assign({
            rapid:    '#888888',
            cutting:  '#00aaff',
            leadIn:   '#00ff00',
            leadOut:  '#ff00ff',
            overcut:  '#00ffff',
            head:     '#ff0000',
            trail:    'rgba(255, 255, 255, 0.6)'
        }, options.colors || {});

        const transform = Object.assign({
            offsetX: 0,
            offsetY: 0,
            scale: 1
        }, options.transform || {});

        // Toolpath als sequentielle Segmentliste aufbauen
        const segments = this._buildAnimationSegments(contours, cutOrder, options.nullPoint);

        if (segments.length === 0) {
            console.log(`${this.PREFIX} Animation: keine Segmente`);
            onComplete?.({ totalTime: 0 });
            return { stop() {}, pause() {}, resume() {}, setSpeed() {} };
        }

        console.log(`${this.PREFIX} Animation startet: ${segments.length} Segmente`);

        const anim = {
            running: true,
            paused: false,
            speed: speed,
            segmentIndex: 0,
            segmentProgress: 0,
            startTime: performance.now(),
            trail: [], // Gezeichnete Punkte + Farben
            rafId: null
        };

        this._animation = anim;

        const worldToCanvas = (p) => ({
            x: (p.x + transform.offsetX) * transform.scale,
            y: canvas.height - (p.y + transform.offsetY) * transform.scale
        });

        const drawFrame = (timestamp) => {
            if (!anim.running) return;
            if (anim.paused) {
                anim.rafId = requestAnimationFrame(drawFrame);
                return;
            }

            const dt = (1000 / 60) * anim.speed; // ms pro Frame bei 60fps * speed
            const seg = segments[anim.segmentIndex];
            if (!seg) {
                anim.running = false;
                onComplete?.({ totalTime: (performance.now() - anim.startTime) / 1000 });
                return;
            }

            // Fortschritt innerhalb des Segments
            const segLength = seg.length || 1;
            const stepMM = (dt / 1000) * (seg.speed / 60); // mm pro Frame
            anim.segmentProgress += stepMM / segLength;

            if (anim.segmentProgress >= 1) {
                // Segment abgeschlossen — Trail vervollständigen
                for (let t = 0; t <= 1; t += 0.02) {
                    const p = this._interpolateSegment(seg, t);
                    anim.trail.push({ p, color: colors[seg.phase] || colors.cutting });
                }
                anim.segmentIndex++;
                anim.segmentProgress = 0;
            } else {
                // Aktuellen Punkt zum Trail hinzufügen
                const p = this._interpolateSegment(seg, anim.segmentProgress);
                anim.trail.push({ p, color: colors[seg.phase] || colors.cutting });
            }

            // Zeichnen
            if (options.renderBase) {
                options.renderBase(canvas, ctx);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            // Trail zeichnen
            for (let i = 1; i < anim.trail.length; i++) {
                const prev = worldToCanvas(anim.trail[i - 1].p);
                const curr = worldToCanvas(anim.trail[i].p);
                ctx.beginPath();
                ctx.strokeStyle = anim.trail[i].color;
                ctx.lineWidth = seg.phase === 'rapid' ? 0.5 : 1.5;
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }

            // Schneidkopf zeichnen
            const headPt = anim.trail.length > 0
                ? anim.trail[anim.trail.length - 1].p
                : (segments[0]?.points?.[0] || { x: 0, y: 0 });
            const headCanvas = worldToCanvas(headPt);

            ctx.beginPath();
            ctx.arc(headCanvas.x, headCanvas.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = colors.head;
            ctx.fill();

            // Crosshair
            ctx.beginPath();
            ctx.strokeStyle = colors.head;
            ctx.lineWidth = 1;
            ctx.moveTo(headCanvas.x - 10, headCanvas.y);
            ctx.lineTo(headCanvas.x + 10, headCanvas.y);
            ctx.moveTo(headCanvas.x, headCanvas.y - 10);
            ctx.lineTo(headCanvas.x, headCanvas.y + 10);
            ctx.stroke();

            // Callback
            const currentSeg = segments[anim.segmentIndex];
            onStep?.({
                phase: currentSeg?.phase || 'complete',
                contourIndex: currentSeg?.contourIndex ?? -1,
                contourName: currentSeg?.contourName || '',
                progress: anim.segmentIndex / segments.length,
                headPos: headPt
            });

            anim.rafId = requestAnimationFrame(drawFrame);
        };

        anim.rafId = requestAnimationFrame(drawFrame);

        return {
            stop: () => this.stopAnimation(),
            pause: () => { anim.paused = true; },
            resume: () => { anim.paused = false; },
            setSpeed: (s) => { anim.speed = Math.max(0.1, s); }
        };
    },

    /**
     * Stoppt die laufende Animation.
     */
    stopAnimation() {
        if (this._animation) {
            this._animation.running = false;
            if (this._animation.rafId) {
                cancelAnimationFrame(this._animation.rafId);
            }
            this._animation = null;
        }
    },

    /**
     * Baut die Animation-Segmentliste auf.
     * Jedes Segment: { points, phase, speed, length, contourIndex, contourName }
     */
    _buildAnimationSegments(contours, cutOrder, nullPoint) {
        const segments = [];
        const cuttable = this._getCuttableContours(contours, cutOrder);
        const rapidSpeed = this.DEFAULT_RAPID_SPEED;
        let lastPos = nullPoint || { x: 0, y: 0 };

        for (let i = 0; i < cuttable.length; i++) {
            const c = cuttable[i];
            const feedRate = 100; // Default — wird von Animation-Speed skaliert

            // Rapid zum Pierce-Punkt
            const entryPt = this._getEntryPoint(c);
            if (entryPt && this._dist(lastPos, entryPt) > this.TOLERANCE) {
                segments.push({
                    points: [lastPos, entryPt],
                    phase: 'rapid',
                    speed: rapidSpeed,
                    length: this._dist(lastPos, entryPt),
                    contourIndex: i,
                    contourName: c.name
                });
            }

            // Lead-In
            const leadIn = c.getLeadInPath?.();
            if (leadIn?.points?.length >= 2) {
                segments.push({
                    points: leadIn.points,
                    phase: 'leadIn',
                    speed: feedRate,
                    length: this._polylineLength(leadIn.points),
                    contourIndex: i,
                    contourName: c.name
                });
            }

            // Kontur schneiden
            if (c.points?.length >= 2) {
                segments.push({
                    points: c.points,
                    phase: 'cutting',
                    speed: feedRate,
                    length: this._polylineLength(c.points),
                    contourIndex: i,
                    contourName: c.name
                });
            }

            // Overcut
            const overcut = c.getOvercutPath?.();
            if (overcut?.points?.length >= 2) {
                segments.push({
                    points: overcut.points,
                    phase: 'overcut',
                    speed: feedRate,
                    length: this._polylineLength(overcut.points),
                    contourIndex: i,
                    contourName: c.name
                });
            }

            // Lead-Out
            const leadOut = c.getLeadOutPath?.();
            if (leadOut?.points?.length >= 2) {
                segments.push({
                    points: leadOut.points,
                    phase: 'leadOut',
                    speed: feedRate,
                    length: this._polylineLength(leadOut.points),
                    contourIndex: i,
                    contourName: c.name
                });
            }

            // Exit-Punkt merken
            const exitPt = this._getExitPoint(c);
            if (exitPt) lastPos = exitPt;
        }

        // Rapid zurück zum Nullpunkt
        const returnPt = nullPoint || { x: 0, y: 0 };
        if (this._dist(lastPos, returnPt) > this.TOLERANCE) {
            segments.push({
                points: [lastPos, returnPt],
                phase: 'rapid',
                speed: rapidSpeed,
                length: this._dist(lastPos, returnPt),
                contourIndex: -1,
                contourName: 'Return'
            });
        }

        return segments;
    },

    /**
     * Interpoliert eine Position auf einem Segment (0..1).
     */
    _interpolateSegment(segment, t) {
        const pts = segment.points;
        if (!pts || pts.length === 0) return { x: 0, y: 0 };
        if (pts.length === 1 || t <= 0) return { x: pts[0].x, y: pts[0].y };
        if (t >= 1) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };

        const totalLen = segment.length || this._polylineLength(pts);
        const targetLen = t * totalLen;
        let accumulated = 0;

        for (let i = 0; i < pts.length - 1; i++) {
            const segLen = this._dist(pts[i], pts[i + 1]);
            if (accumulated + segLen >= targetLen) {
                const localT = segLen > 0 ? (targetLen - accumulated) / segLen : 0;
                return {
                    x: pts[i].x + localT * (pts[i + 1].x - pts[i].x),
                    y: pts[i].y + localT * (pts[i + 1].y - pts[i].y)
                };
            }
            accumulated += segLen;
        }

        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
    },

    // ════════════════════════════════════════════════════════════════
    // KOLLISIONSMATRIX (öffentliche API)
    // ════════════════════════════════════════════════════════════════

    /**
     * Erstellt eine vollständige Kollisionsmatrix aller Lead-In/Outs gegen alle Konturen.
     *
     * @param {CamContour[]} contours - Alle Konturen
     * @returns {Object[]} Array von { source, target, type, severity }
     */
    buildCollisionMatrix(contours) {
        console.log(`${this.PREFIX} Kollisionsmatrix für ${contours?.length || 0} Konturen`);
        const collisions = [];

        if (!contours || contours.length < 2) return collisions;

        const cuttable = contours.filter(c => !c.isReference && c.cuttingMode);

        for (const source of cuttable) {
            const leadIn = source.getLeadInPath?.();
            const leadOut = source.getLeadOutPath?.();

            for (const target of contours) {
                if (target === source || target.isReference) continue;
                if (!target.points || target.points.length < 3 || !target.isClosed) continue;

                // Lead-In gegen Target
                if (leadIn?.points?.length >= 2) {
                    if (this._pathCrossesContour(leadIn.points, target.points)) {
                        collisions.push({
                            source: source.name,
                            target: target.name,
                            type: 'lead-in',
                            severity: 'error'
                        });
                    }
                }

                // Lead-Out gegen Target
                if (leadOut?.points?.length >= 2) {
                    if (this._pathCrossesContour(leadOut.points, target.points)) {
                        collisions.push({
                            source: source.name,
                            target: target.name,
                            type: 'lead-out',
                            severity: 'warning'
                        });
                    }
                }

                // Pierce-Punkt innerhalb Target
                if (leadIn?.piercingPoint) {
                    if (this._pointInPolygon(leadIn.piercingPoint, target.points)) {
                        collisions.push({
                            source: source.name,
                            target: target.name,
                            type: 'pierce-inside',
                            severity: 'error'
                        });
                    }
                }
            }
        }

        console.log(`${this.PREFIX} Kollisionsmatrix: ${collisions.length} Treffer`);
        return collisions;
    },

    // ════════════════════════════════════════════════════════════════
    // PFAD-LAENGEN (öffentliche API)
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet detaillierte Pfadlängen pro Kontur.
     *
     * @param {CamContour[]} contours
     * @returns {Object[]} Array von { name, contourLength, leadInLength, leadOutLength, overcutLength, totalLength }
     */
    getContourLengths(contours) {
        if (!contours) return [];

        return contours
            .filter(c => !c.isReference && c.cuttingMode)
            .map(c => {
                const contourLen = this._polylineLength(c.points);
                const leadIn = c.getLeadInPath?.();
                const leadOut = c.getLeadOutPath?.();
                const overcut = c.getOvercutPath?.();

                const leadInLen = leadIn?.points ? this._polylineLength(leadIn.points) : 0;
                const leadOutLen = leadOut?.points ? this._polylineLength(leadOut.points) : 0;
                const overcutLen = overcut?.points ? this._polylineLength(overcut.points) : 0;

                return {
                    name: c.name,
                    cuttingMode: c.cuttingMode,
                    contourLength: Math.round(contourLen * 100) / 100,
                    leadInLength: Math.round(leadInLen * 100) / 100,
                    leadOutLength: Math.round(leadOutLen * 100) / 100,
                    overcutLength: Math.round(overcutLen * 100) / 100,
                    totalLength: Math.round((contourLen + leadInLen + leadOutLen + overcutLen) * 100) / 100
                };
            });
    },

    // ════════════════════════════════════════════════════════════════
    // GEOMETRIE-HILFSFUNKTIONEN
    // ════════════════════════════════════════════════════════════════

    /** Euklidischer Abstand zweier Punkte */
    _dist(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /** Polylinien-Gesamtlänge */
    _polylineLength(pts) {
        if (!pts || pts.length < 2) return 0;
        let len = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            len += this._dist(pts[i], pts[i + 1]);
        }
        return len;
    },

    /** Segment-Intersection Test (exakt wie Geometry._segmentsIntersect) */
    _segmentsIntersect(a1, a2, b1, b2) {
        // Nutze Geometry wenn verfügbar
        if (typeof Geometry !== 'undefined' && Geometry._segmentsIntersect) {
            return Geometry._segmentsIntersect(a1, a2, b1, b2);
        }

        // Fallback: eigene Cross-Product Implementierung
        const d1 = this._cross(b2.x - b1.x, b2.y - b1.y, a1.x - b1.x, a1.y - b1.y);
        const d2 = this._cross(b2.x - b1.x, b2.y - b1.y, a2.x - b1.x, a2.y - b1.y);
        const d3 = this._cross(a2.x - a1.x, a2.y - a1.y, b1.x - a1.x, b1.y - a1.y);
        const d4 = this._cross(a2.x - a1.x, a2.y - a1.y, b2.x - a1.x, b2.y - a1.y);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        return false;
    },

    /** Cross Product */
    _cross(ax, ay, bx, by) {
        return ax * by - ay * bx;
    },

    /** Punkt-in-Polygon (Ray-Casting) */
    _pointInPolygon(point, polygon) {
        // Nutze GeometryOps wenn verfügbar
        if (typeof GeometryOps !== 'undefined' && GeometryOps.pointInPolygon) {
            return GeometryOps.pointInPolygon(point, polygon);
        }

        let inside = false;
        const n = polygon.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if ((yi > point.y) !== (yj > point.y) &&
                point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    },

    /** Signierte Fläche (Shoelace) */
    _signedArea(points) {
        if (typeof Geometry !== 'undefined' && Geometry.getSignedArea) {
            return Geometry.getSignedArea(points);
        }

        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    },

    /** Einfacher Schwerpunkt (Durchschnitt) */
    _simpleCentroid(points) {
        if (typeof Geometry !== 'undefined' && Geometry.centroid) {
            return Geometry.centroid(points);
        }

        let sx = 0, sy = 0;
        for (const p of points) {
            sx += p.x;
            sy += p.y;
        }
        return { x: sx / points.length, y: sy / points.length };
    },

    /** Punkt-zu-Segment Abstand */
    _pointToSegmentDistance(point, seg1, seg2) {
        const dx = seg2.x - seg1.x;
        const dy = seg2.y - seg1.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return this._dist(point, seg1);

        let t = ((point.x - seg1.x) * dx + (point.y - seg1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const proj = {
            x: seg1.x + t * dx,
            y: seg1.y + t * dy
        };

        return this._dist(point, proj);
    },

    // ════════════════════════════════════════════════════════════════
    // FORMATIERUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Formatiert das Verifikationsergebnis als lesbaren String.
     *
     * @param {{ valid, warnings, errors, stats }} result - verify() Ergebnis
     * @returns {string}
     */
    formatReport(result) {
        const lines = [];
        lines.push('═══════════════════════════════════════════════');
        lines.push(`  CeraCUT Toolpath Simulator V${this.VERSION}`);
        lines.push('═══════════════════════════════════════════════');
        lines.push('');

        lines.push(`Status: ${result.valid ? 'GUELTIG' : 'FEHLER GEFUNDEN'}`);
        lines.push(`Konturen: ${result.stats.contourCount}`);
        lines.push('');

        if (result.errors.length > 0) {
            lines.push(`FEHLER (${result.errors.length}):`);
            for (const e of result.errors) {
                lines.push(`  [!] ${e}`);
            }
            lines.push('');
        }

        if (result.warnings.length > 0) {
            lines.push(`WARNUNGEN (${result.warnings.length}):`);
            for (const w of result.warnings) {
                lines.push(`  [~] ${w}`);
            }
            lines.push('');
        }

        const s = result.stats;
        lines.push('STATISTIK:');
        lines.push(`  Schnittlänge:   ${s.cuttingLength.toFixed(1)} mm`);
        lines.push(`  Eilganglänge:   ${s.rapidLength.toFixed(1)} mm`);
        lines.push(`  Gesamtlänge:    ${s.totalLength.toFixed(1)} mm`);
        lines.push(`  Anschüsse:      ${s.pierceCount}`);
        lines.push(`  Geschätzte Zeit: ${this._formatTime(s.estimatedTime)}`);
        lines.push('');

        if (s.contourStats?.length > 0) {
            lines.push('KONTUR-DETAILS:');
            for (const cs of s.contourStats) {
                lines.push(`  ${cs.name} (${cs.cuttingMode}): ${cs.totalCutLength.toFixed(1)}mm, ~${cs.estimatedTime.toFixed(1)}s`);
            }
        }

        lines.push('═══════════════════════════════════════════════');
        return lines.join('\n');
    },

    /**
     * Formatiert Sekunden als mm:ss oder hh:mm:ss.
     */
    _formatTime(seconds) {
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        if (mins < 60) return `${mins}m ${secs}s`;
        const hrs = Math.floor(mins / 60);
        const rmins = mins % 60;
        return `${hrs}h ${rmins}m ${secs}s`;
    }
};

// Modul-Registrierung
console.log('[ToolpathSim V1.0] Loaded — Build 20260309');
