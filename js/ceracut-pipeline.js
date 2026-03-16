/**
 * CeraCUT V3.7 - Processing Pipeline
 * Last Modified: 2026-03-16 MEZ
 * Build: 20260316-gapdetect
 *
 * V3.7: Gap Detection — Klassifizierung (healed/healable/open), Gap-Marker-Daten auf CamContour
 * V3.6: Hatch-Konturen (cuttingMode='none') von Topologie/Slit/Offset ausgeschlossen
 * V3.5: Validation Engine — Pre-Export-Prüfung (Gap, Ecken, Waisen, Kollisionen, Offene Konturen)
 * V3.4: interiorPoint() für robuste Topologie-Erkennung (konkave Formen)
 * V3.1: Physikalisch motivierte Geometry-Pipeline (CamPreProcessor, robuste Referenz)
 * V2.9: Referenz NUR bei Rechteck-Konturen
 */

const CeraCutPipeline = {
    kerfWidth: 1.0,
    healingStats: null,

    // V3.7: Gap-Klassifizierungs-Schwellwerte
    GAP_HEALABLE_MAX: 5.0,       // mm — darüber = nicht automatisch heilbar
    GAP_PERIMETER_RATIO: 0.05,   // 5% der Umfanglänge

    autoProcess(contours, config = {}) {
        console.log('[Pipeline V3.7] autoProcess starting...');
        this.kerfWidth = config.kerfWidth ?? 0.8;
        this.healingStats = null;
        this.preProcessStats = null;

        if (!contours || contours.length === 0) {
            return { success: false, contours: [], error: 'No contours' };
        }

        console.log(`[Pipeline V3.7] Input: ${contours.length} contours`);

        const camContours = contours.map(c => {
            if (typeof CamContour !== 'undefined' && c instanceof CamContour) {
                c.kerfWidth = this.kerfWidth;
                return c;
            }
            if (typeof CamContour !== 'undefined') {
                const cam = new CamContour(c.points || c, {
                    isClosed: c.isClosed,
                    layer: c.layer,
                    name: c.name,
                    kerfWidth: this.kerfWidth
                });
                if (c.sourceType) cam.sourceType = c.sourceType;
                if (c._splineData) cam._splineData = c._splineData;
                return cam;
            }
            c.kerfWidth = this.kerfWidth;
            return c;
        });

        const healed = this._microHeal(camContours, config);
        console.log(`[Pipeline V3.7] After micro-healing: ${healed.length} contours`);

        // V3.7: Gap-Klassifizierung
        this._classifyGaps(healed);

        // V3.0: Optional Arc-Fitting
        if (config.enableArcFitting) {
            this._convertToArcs(healed, config);
        }

        this._analyzeTopology(healed, { skipReference: config.skipReference });

        // SLIT: Offene Pfade als schneidbare Slits markieren (IGEMS Quick→Slit)
        // V3.6: Hatch-Konturen ausschließen
        const openPaths = healed.filter(c => !c.isClosed && !c.isHatchContour && c.cuttingMode !== 'none');
        openPaths.forEach(c => { c.cuttingMode = 'slit'; });
        if (openPaths.length > 0) {
            console.log(`[Pipeline V3.7] Slit: ${openPaths.length} open paths`);
        }

        this._computeOffsets(healed);

        const closedContours = healed.filter(c => c.isClosed);
        const outerContours = closedContours.filter(c => c.cuttingMode === 'disc').length;
        const innerContours = closedContours.filter(c => c.cuttingMode === 'hole').length;
        const refContours = closedContours.filter(c => c.isReference).length;
        const hatchContours = healed.filter(c => c.isHatchContour || c.cuttingMode === 'none').length;

        const slitContours = openPaths.length;
        console.log(`[Pipeline V3.7] Result: ${outerContours} disc, ${innerContours} hole, ${refContours} reference, ${slitContours} slit, ${hatchContours} hatch`);

        return {
            success: true,
            contours: healed,
            totalEntities: healed.length,
            outerContours,
            innerContours,
            referenceContours: refContours,
            healingStats: this.healingStats,
            preProcessStats: this.preProcessStats
        };
    },

    async process(dxfData, config = {}) {
        console.log('[Pipeline V3.7] process starting...');
        this.kerfWidth = config.kerfWidth ?? 0.8;

        let contours = [];
        if (dxfData.contours) contours = dxfData.contours;
        else if (dxfData.entities) contours = DXFParser.chainContours(dxfData.entities, 0.1);
        else if (Array.isArray(dxfData)) contours = dxfData;

        return this.autoProcess(contours, config).contours;
    },

    /**
     * V3.1: Physikalische Vorverarbeitung (Spike-Entfernung, RDP, Lücken, Kleinst-Filter)
     */
    _camPreProcess(contours, config = {}) {
        if (config.camPreProcess === false || typeof CamPreProcessor === 'undefined') {
            if (typeof CamPreProcessor === 'undefined') {
                console.warn('[Pipeline V3.7] CamPreProcessor not available');
            }
            return contours;
        }

        const opts = { MIN_FEATURE_SIZE: config.minFeatureSize || this.kerfWidth };
        if (config.rdpEpsilon != null) opts.RDP_EPSILON = config.rdpEpsilon;
        if (config.spikeAngle != null) opts.SPIKE_ANGLE = config.spikeAngle;
        if (config.maxSegmentGap != null) opts.MAX_SEGMENT_GAP = config.maxSegmentGap;

        const result = CamPreProcessor.process(contours, opts);

        this.preProcessStats = result.stats;
        return result.contours;
    },

    _microHeal(contours, config = {}) {
        if (typeof MicroHealing !== 'undefined') {
            const result = MicroHealing.heal(contours, {
                tolerances: {
                    SNAP: config.snapTolerance || 0.001,
                    MICRO_SEGMENT: config.microSegmentTolerance || 0.2,
                    AUTO_CLOSE: config.autoCloseTolerance || 0.8,
                    MIN_OPEN_PATH: config.minOpenPath || 1.6,
                    MIN_CLOSED_AREA: config.minClosedArea || 0.5
                }
            });
            this.healingStats = result.stats;
            return result.healed;
        }
        console.warn('[Pipeline V3.7] MicroHealing not available');
        return this._healGeometryLegacy(contours);
    },

    /**
     * V3.0: Konvertiert Polylines zu Bögen und Linien (Arc-Fitting)
     */
    _convertToArcs(contours, config = {}) {
        if (typeof ArcFitting === 'undefined') {
            console.warn('[Pipeline V3.0] ArcFitting not available');
            return;
        }

        const tolerance = config.arcFittingTolerance || 0.01;
        console.log(`[Pipeline V3.0] Arc-Fitting with tolerance ${tolerance}mm`);

        let convertedCount = 0;
        let totalArcs = 0;
        let totalLines = 0;

        for (const contour of contours) {
            if (!contour.points || contour.points.length < 3) continue;
            if (contour.isReference) continue;

            // Arc-Fitting durchführen
            const arcSegments = ArcFitting.recursiveBiarcFit(
                contour.points,
                tolerance
            );

            if (arcSegments && arcSegments.length > 0) {
                // Speichere Original-Punkte
                contour._originalPoints = contour.points;

                // Speichere Arc-Segmente für G-Code-Export
                contour._arcSegments = arcSegments;

                // Konvertiere zurück zu Punkten für Rendering
                contour.points = ArcFittingUtils.toPolyline(arcSegments);

                // Statistik
                const arcs = arcSegments.filter(s => s.type === 'arc').length;
                const lines = arcSegments.filter(s => s.type === 'line').length;
                totalArcs += arcs;
                totalLines += lines;

                convertedCount++;
            }
        }

        this.arcFittingStats = {
            contoursProcessed: convertedCount,
            totalArcs,
            totalLines,
            tolerance
        };

        if (convertedCount > 0) {
            console.log(`[Pipeline V3.0] Converted ${convertedCount} contours: ${totalArcs} arcs + ${totalLines} lines`);
        }
    },

    _healGeometryLegacy(contours) {
        return contours.filter(contour => {
            const pts = contour.points;
            if (!pts || pts.length < 2) return false;
            if (!contour.isClosed) {
                contour.cuttingMode = 'slit';
                let length = 0;
                for (let i = 0; i < pts.length - 1; i++) {
                    length += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
                }
                return length >= 1.0;
            }
            const area = typeof contour.getArea === 'function' ? 
                Math.abs(contour.getArea()) : Math.abs(this._computeArea(pts));
            return area >= 0.01;
        });
    },

    _computeArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y - points[j].x * points[i].y;
        }
        return area / 2;
    },

    _analyzeTopology(contours, options = {}) {
        // V3.6: Hatch-Konturen (cuttingMode='none') von Topologie ausschließen
        const closed = contours.filter(c => c.isClosed && c.cuttingMode !== 'none' && !c.isHatchContour);
        const sorted = closed.sort((a, b) => {
            const areaA = typeof a.getArea === 'function' ? Math.abs(a.getArea()) : Math.abs(this._computeArea(a.points));
            const areaB = typeof b.getArea === 'function' ? Math.abs(b.getArea()) : Math.abs(this._computeArea(b.points));
            return areaB - areaA;
        });

        let discCount = 0, holeCount = 0;

        for (let i = 0; i < sorted.length; i++) {
            const contour = sorted[i];
            let nestingLevel = 0;
            const testPoint = Geometry.interiorPoint(contour.points);

            for (let j = 0; j < i; j++) {
                if (this._pointInPolygon(testPoint, sorted[j].points)) {
                    nestingLevel++;
                }
            }

            contour.nestingLevel = nestingLevel;
            contour.type = nestingLevel % 2 === 0 ? 'OUTER' : 'INNER';
            contour.cuttingMode = nestingLevel % 2 === 0 ? 'disc' : 'hole';

            if (contour.cuttingMode === 'disc') discCount++; else holeCount++;
        }

        // V2.9: Referenz-Erkennung - NUR bei Rechteck!
        // V3.8: Referenz-Erkennung optional deaktivierbar
        if (!options.skipReference) {
            this._detectReference(sorted);
        } else {
            console.log('[Pipeline V3.7] Referenz-Erkennung übersprungen (skipReference)');
        }
        
        console.log(`[Pipeline V3.7] Topology: ${discCount} discs, ${holeCount} holes`);
    },

    /**
     * V3.1: Robuste Referenz-Erkennung
     * Kriterien:
     * 1. Mindestens 2 geschlossene Konturen
     * 2. Größte Kontur = Referenz-Kandidat
     * 3. Rechteck → sofort als Referenz akzeptiert
     * 4. Kein Rechteck, aber Fläche ≥ 1.5× zweitgrößte → trotzdem Referenz
     *
     * Nach Referenz-Erkennung: Nesting-Level aller inneren Konturen korrigieren,
     * da die Referenz als "transparent" gilt (Plattenbegrenzung, kein Schnittobjekt).
     */
    _detectReference(sortedContours) {
        // Reset
        for (const c of sortedContours) {
            c.isReference = false;
        }

        // Regel 1: Mindestens 2 Konturen
        if (sortedContours.length <= 1) {
            console.log('[Pipeline V3.7] Keine Referenz: nur ' + sortedContours.length + ' Kontur(en)');
            return;
        }

        const largest = sortedContours[0];
        const areaLargest = typeof largest.getArea === 'function'
            ? Math.abs(largest.getArea()) : Math.abs(this._computeArea(largest.points));

        let detected = false;

        // Regel 2: Rechteck → sofort Referenz
        const isRect = this._isRectangle(largest);
        if (isRect) {
            detected = true;
            console.log('[Pipeline V3.7] ✓ Referenz erkannt: Rechteck-Kontur');
        } else {
            // Regel 3: Kein Rechteck — prüfe ob Fläche signifikant größer als zweitgrößte
            const second = sortedContours[1];
            const areaSecond = typeof second.getArea === 'function'
                ? Math.abs(second.getArea()) : Math.abs(this._computeArea(second.points));

            if (areaSecond > 0 && areaLargest / areaSecond >= 1.5) {
                detected = true;
                console.log(`[Pipeline V3.7] ✓ Referenz erkannt: Kein Rechteck, aber Fläche ${(areaLargest / areaSecond).toFixed(1)}× größer als nächste Kontur`);
            } else {
                console.log(`[Pipeline V3.7] Keine Referenz: Größte Kontur ist kein Rechteck und Flächen-Verhältnis ${areaSecond > 0 ? (areaLargest / areaSecond).toFixed(1) : '∞'}× zu gering (< 1.5×)`);
            }
        }

        if (!detected) return;

        // Referenz markieren
        largest.isReference = true;
        largest.cuttingMode = 'reference';

        // Nesting-Level korrigieren: Referenz ist "transparent" für Topologie.
        // Konturen die nur wegen der Referenz als INNER galten, werden zu OUTER.
        for (let i = 1; i < sortedContours.length; i++) {
            const c = sortedContours[i];
            const tp = Geometry.interiorPoint(c.points);
            if (c.nestingLevel > 0 && this._pointInPolygon(tp, largest.points)) {
                c.nestingLevel--;
                c.type = c.nestingLevel % 2 === 0 ? 'OUTER' : 'INNER';
                c.cuttingMode = c.nestingLevel % 2 === 0 ? 'disc' : 'hole';
            }
        }
    },

    /**
     * Prüft ob Kontur ein Rechteck ist
     * - Genau 4 oder 5 Punkte (5 wenn geschlossen mit Duplikat)
     * - Alle Winkel ~90°
     * - Gegenüberliegende Seiten gleich lang
     */
    _isRectangle(contour, angleTolerance = 3) {
        const points = contour.points || contour;
        if (!points || points.length < 4) return false;
        
        // Geschlossen?
        const isClosed = contour.isClosed !== undefined ? contour.isClosed : 
            (this._distance(points[0], points[points.length - 1]) < 0.01);
        if (!isClosed) return false;
        
        // Eckpunkte extrahieren (ohne Duplikat am Ende)
        let corners = [...points];
        if (corners.length > 4 && this._distance(corners[0], corners[corners.length - 1]) < 0.01) {
            corners = corners.slice(0, -1);
        }
        
        // MUSS genau 4 Ecken haben
        if (corners.length !== 4) {
            return false;
        }
        
        // Alle 4 Winkel prüfen (müssen ~90° sein)
        const tolRad = angleTolerance * Math.PI / 180;
        
        for (let i = 0; i < 4; i++) {
            const p1 = corners[(i + 3) % 4];
            const p2 = corners[i];
            const p3 = corners[(i + 1) % 4];
            
            const v1x = p1.x - p2.x, v1y = p1.y - p2.y;
            const v2x = p3.x - p2.x, v2y = p3.y - p2.y;
            
            const len1 = Math.hypot(v1x, v1y);
            const len2 = Math.hypot(v2x, v2y);
            
            if (len1 < 0.001 || len2 < 0.001) return false;
            
            // cos(90°) = 0
            const dot = v1x * v2x + v1y * v2y;
            const cosAngle = dot / (len1 * len2);
            
            // Muss nahe 0 sein für 90°
            if (Math.abs(cosAngle) > Math.sin(tolRad)) {
                return false;
            }
        }
        
        // Gegenüberliegende Seiten gleich lang
        const s1 = this._distance(corners[0], corners[1]);
        const s2 = this._distance(corners[1], corners[2]);
        const s3 = this._distance(corners[2], corners[3]);
        const s4 = this._distance(corners[3], corners[0]);
        
        const tol = Math.max(s1, s2, s3, s4) * 0.02; // 2% Toleranz
        
        if (Math.abs(s1 - s3) > tol || Math.abs(s2 - s4) > tol) {
            return false;
        }
        
        return true;
    },

    _distance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    },

    _pointInPolygon(point, polygon) {
        let inside = false;
        const x = point.x, y = point.y;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const dyij = yj - yi;
            if (((yi > y) !== (yj > y)) && Math.abs(dyij) > 1e-12 && (x < (xj - xi) * (y - yi) / dyij + xi)) {
                inside = !inside;
            }
        }
        return inside;
    },

    // ═══════════════════════════════════════════════════════════════
    // V3.5: Validation Engine — Pre-Export-Prüfung
    // ═══════════════════════════════════════════════════════════════

    validate(contours, settings = {}) {
        console.log('[Pipeline V3.7] validate() gestartet...');
        const errors = [];
        const warnings = [];
        const kerfWidth = settings.kerfWidth || 0.8;

        const cuttable = (contours || []).filter(c => !c.isReference);

        // ── Check 1: Gap < Kerf (Loch zu nah an Außenkante) ──
        const holes = cuttable.filter(c => c.cuttingMode === 'hole');
        const discs = cuttable.filter(c => c.cuttingMode === 'disc');

        for (const hole of holes) {
            const holeTP = typeof Geometry !== 'undefined'
                ? Geometry.interiorPoint(hole.points) : hole.points[0];

            // Parent-Disc finden: Kleinste Disc die den Hole-Testpunkt enthält
            let parentDisc = null;
            let parentArea = Infinity;
            for (const disc of discs) {
                if (this._pointInPolygon(holeTP, disc.points)) {
                    const area = Math.abs(typeof disc.getArea === 'function'
                        ? disc.getArea() : this._computeArea(disc.points));
                    if (area < parentArea) {
                        parentArea = area;
                        parentDisc = disc;
                    }
                }
            }

            if (!parentDisc) continue;

            // Min-Abstand zwischen Hole und Parent-Disc berechnen
            let minDist = Infinity;
            for (const hp of hole.points) {
                if (typeof Geometry !== 'undefined' && Geometry.closestPointOnPolyline) {
                    const cp = Geometry.closestPointOnPolyline(hp, parentDisc.points);
                    if (cp) {
                        const d = Math.hypot(hp.x - cp.x, hp.y - cp.y);
                        if (d < minDist) minDist = d;
                    }
                } else {
                    // Fallback: Punkt-zu-Segment
                    const dpts = parentDisc.points;
                    for (let s = 0; s < dpts.length - 1; s++) {
                        const d = this._pointToSegDist(hp, dpts[s], dpts[s + 1]);
                        if (d < minDist) minDist = d;
                    }
                }
            }

            if (minDist < kerfWidth) {
                errors.push({
                    severity: 'critical',
                    code: 'GAP_TOO_SMALL',
                    message: `Abstand ${minDist.toFixed(2)}mm < Kerf ${kerfWidth.toFixed(2)}mm — Teil wird zerstoert`,
                    contourName: hole.name || 'Unbenannt'
                });
            }
        }

        // ── Check 2: Scharfe Ecken (<30° Innenwinkel) ──
        for (const c of cuttable) {
            if (!c.isClosed || !c.points || c.points.length < 3) continue;
            if (typeof Geometry !== 'undefined' && Geometry.findCorners) {
                const corners = Geometry.findCorners(c.points, 10);
                const sharpCorners = corners.filter(corner => {
                    // Deflektionswinkel > 150° = Innenwinkel < 30°
                    return corner.deflection > 150;
                });
                if (sharpCorners.length > 0) {
                    warnings.push({
                        severity: 'warning',
                        code: 'SHARP_CORNER',
                        message: `${sharpCorners.length} scharfe Ecke(n) (<30° Innenwinkel) — Bruchgefahr`,
                        contourName: c.name || 'Unbenannt'
                    });
                }
            }
        }

        // ── Check 3: Intarsien-Waisen (POS/NEG Mismatch) ──
        if (settings.intarsiaMode) {
            const posCount = (settings.intarsiaPosContours || []).length;
            const negCount = (settings.intarsiaNegContours || []).length;
            if (posCount === 0 && negCount === 0) {
                errors.push({
                    severity: 'critical',
                    code: 'INTARSIA_EMPTY',
                    message: 'Intarsien-Modus aktiv, aber keine POS/NEG-Konturen erzeugt',
                    contourName: '—'
                });
            } else if (posCount !== negCount) {
                warnings.push({
                    severity: 'warning',
                    code: 'INTARSIA_MISMATCH',
                    message: `POS/NEG Anzahl unterschiedlich: ${posCount} POS vs. ${negCount} NEG`,
                    contourName: '—'
                });
            }
        }

        // ── Check 4: Lead-Kollisionen (stark verkürzte Leads) ──
        for (const c of cuttable) {
            if (!c.isClosed || c.cuttingMode === 'slit') continue;
            if (typeof c.getLeadInPath === 'function') {
                const leadPath = c.getLeadInPath();
                if (leadPath && leadPath.shortened && c.leadInLength > 0) {
                    const ratio = (leadPath.effectiveLength || 0) / c.leadInLength;
                    if (ratio < 0.3) {
                        warnings.push({
                            severity: 'warning',
                            code: 'LEAD_COLLISION',
                            message: `Lead-In auf ${(ratio * 100).toFixed(0)}% verkuerzt (Kollision)`,
                            contourName: c.name || 'Unbenannt'
                        });
                    }
                }
            }
        }

        // ── Check 5: Offene Konturen ohne Slit-Modus + Gap-Details ──
        for (const c of cuttable) {
            if (!c.isClosed && c.cuttingMode !== 'slit') {
                const gapCount = c.gaps?.length || 0;
                const maxGap = gapCount > 0 ? Math.max(...c.gaps.map(g => g.distance)) : 0;
                const detail = gapCount > 0 ? ` (${gapCount} Gaps, groesster: ${maxGap.toFixed(1)}mm)` : '';
                warnings.push({
                    severity: 'warning',
                    code: 'OPEN_CONTOUR',
                    message: `Offene Kontur ohne Slit-Modus${detail} — wird beim Export uebersprungen`,
                    contourName: c.name || 'Unbenannt'
                });
            }
            // V3.7: Heilbare Gaps als eigene Warnung
            if (c.gaps?.length > 0) {
                const healable = c.gaps.filter(g => g.type === 'healable');
                if (healable.length > 0) {
                    warnings.push({
                        severity: 'warning',
                        code: 'OPEN_CONTOUR_HEALABLE',
                        message: `${healable.length} heilbare Luecke(n) erkannt (max. ${Math.max(...healable.map(g => g.distance)).toFixed(1)}mm)`,
                        contourName: c.name || 'Unbenannt'
                    });
                }
            }
        }

        console.log(`[Pipeline V3.7] Validation: ${errors.length} errors, ${warnings.length} warnings`);
        return { errors, warnings };
    },

    _pointToSegDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    },

    /**
     * V3.7: Gap-Klassifizierung — befüllt gaps[] und healedGaps[] auf jeder CamContour
     */
    _classifyGaps(contours) {
        if (typeof MicroHealing === 'undefined') return;

        const gapReports = this.healingStats?.gapReports || [];
        let healedCount = 0, healableCount = 0, openCount = 0;

        // 1. Geheilte Gaps aus MicroHealing-Reports auf Konturen übertragen
        for (const report of gapReports) {
            if (report.type === 'healed' && report.contourIndex < contours.length) {
                const c = contours[report.contourIndex];
                if (c && typeof c.healedGaps !== 'undefined') {
                    c.healedGaps.push({
                        x1: report.x1, y1: report.y1,
                        x2: report.x2, y2: report.y2,
                        originalDistance: report.distance
                    });
                    healedCount++;
                }
            }
        }

        // 2. Offene Konturen analysieren — Start/End-Gap + interne Gaps
        for (const c of contours) {
            if (c.isHatchContour || c.cuttingMode === 'none') continue;
            if (typeof c.gaps === 'undefined') continue;

            // Start/End-Gap bei offenen Konturen
            if (!c.isClosed && c.points.length >= 2) {
                const first = c.points[0];
                const last = c.points[c.points.length - 1];
                const gap = Math.hypot(last.x - first.x, last.y - first.y);
                if (gap > 0.01) {  // Nicht quasi-geschlossen
                    const perimeter = this._calculatePerimeter(c.points);
                    const isHealable = gap <= this.GAP_HEALABLE_MAX &&
                                       gap < perimeter * this.GAP_PERIMETER_RATIO;
                    c.gaps.push({
                        x1: last.x, y1: last.y, x2: first.x, y2: first.y,
                        distance: gap, type: isHealable ? 'healable' : 'open'
                    });
                    if (isHealable) healableCount++;
                    else openCount++;
                }
            }

            // Interne Gaps (Sprünge innerhalb der Punktliste)
            const internalGaps = MicroHealing.findInternalGaps(c.points);
            for (const ig of internalGaps) {
                const perimeter = this._calculatePerimeter(c.points);
                const isHealable = ig.distance <= this.GAP_HEALABLE_MAX &&
                                   ig.distance < perimeter * this.GAP_PERIMETER_RATIO;
                c.gaps.push({
                    x1: ig.x1, y1: ig.y1, x2: ig.x2, y2: ig.y2,
                    distance: ig.distance, type: isHealable ? 'healable' : 'open'
                });
                if (isHealable) healableCount++;
                else openCount++;
            }
        }

        if (healedCount > 0 || healableCount > 0 || openCount > 0) {
            console.log(`[Pipeline V3.7] Gaps: ${healedCount} healed, ${healableCount} healable, ${openCount} open`);
        }
    },

    /**
     * V3.7: Berechnet die Gesamtlänge einer Punktliste
     */
    _calculatePerimeter(points) {
        let len = 0;
        for (let i = 0; i < points.length - 1; i++) {
            len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        }
        return len;
    },

    _computeOffsets(contours) {
        for (const contour of contours) {
            if (!contour.isClosed) continue;
            if (contour.isHatchContour || contour.cuttingMode === 'none') continue;  // V3.6: Hatch überspringen
            if (typeof contour.getKerfOffsetPolyline === 'function') {
                contour.getKerfOffsetPolyline();
            }
        }
    }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = CeraCutPipeline; }
