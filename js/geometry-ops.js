/**
 * CeraCUT GeometryOps V2.2 — Geometry Operations Engine
 * Foundation für Tier 3+5 CAD Tools
 * 
 * V2.2: Arabeske (Laternenfliese) — 8 Kreisbögen, _arcThrough3Points, _circumscribedCircle
 * V2.1: Stabiler _trimClosedBetween (Index-basiert), trimContourPreview für Hover
 * V2.0: Fillet, Chamfer, Trim, Extend, Offset, Boolean, N-gon, Obround Algorithmen
 * V1.0: Segment-Modell, Intersection, Split, Explode, Join
 * 
 * Last Modified: 2026-02-20 MEZ
 * Build: 20260220a
 */

const GeometryOps = {

    // ════════════════════════════════════════════════════════════════
    // SEGMENT EXTRACTION — Points-Array → Segment-Array
    // ════════════════════════════════════════════════════════════════

    /**
     * Extrahiert Liniensegmente aus einem Points-Array.
     * Jedes Segment: { p1: {x,y}, p2: {x,y}, index: originalIndex }
     */
    contourToSegments(points) {
        if (!points || points.length < 2) return [];
        const segments = [];
        for (let i = 0; i < points.length - 1; i++) {
            segments.push({
                p1: { x: points[i].x, y: points[i].y },
                p2: { x: points[i + 1].x, y: points[i + 1].y },
                index: i
            });
        }
        return segments;
    },

    /**
     * Baut Points-Array aus Segmenten zurück.
     */
    segmentsToPoints(segments) {
        if (!segments || segments.length === 0) return [];
        const points = [{ x: segments[0].p1.x, y: segments[0].p1.y }];
        for (const seg of segments) {
            points.push({ x: seg.p2.x, y: seg.p2.y });
        }
        return points;
    },

    // ════════════════════════════════════════════════════════════════
    // PUNKT-AUF-SEGMENT — Hit-Testing für einzelne Segmente
    // ════════════════════════════════════════════════════════════════

    pointToSegmentDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    },

    nearestPointOnSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            return { point: { x: x1, y: y1 }, t: 0, distance: Math.hypot(px - x1, py - y1) };
        }
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return { point: { x: projX, y: projY }, t, distance: Math.hypot(px - projX, py - projY) };
    },

    findNearestSegment(points, worldX, worldY, tolerance = Infinity) {
        if (!points || points.length < 2) return null;
        let best = null;
        for (let i = 0; i < points.length - 1; i++) {
            const result = this.nearestPointOnSegment(
                worldX, worldY, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y
            );
            if (result.distance < tolerance && (!best || result.distance < best.distance)) {
                best = { segmentIndex: i, t: result.t, point: result.point, distance: result.distance };
            }
        }
        return best;
    },

    // ════════════════════════════════════════════════════════════════
    // INTERSECTION ENGINE
    // ════════════════════════════════════════════════════════════════

    /** Unbounded Linie-Linie Schnitt (Geraden, nicht Segmente) */
    lineLineIntersection(a1, a2, b1, b2) {
        const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
        const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-10) return null;
        const tA = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
        const tB = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
        return {
            point: { x: a1.x + tA * dx1, y: a1.y + tA * dy1 },
            tA, tB
        };
    },

    /** Bounded Segment-Segment Schnitt (tA, tB ∈ [0,1]) */
    segmentSegmentIntersection(a1, a2, b1, b2, eps = 1e-8) {
        const result = this.lineLineIntersection(a1, a2, b1, b2);
        if (!result) return null;
        if (result.tA < -eps || result.tA > 1 + eps) return null;
        if (result.tB < -eps || result.tB > 1 + eps) return null;
        return result;
    },

    /** Findet alle Schnittpunkte eines Segments mit einer Kontur */
    findIntersectionsWithContour(segA1, segA2, contourPoints, skipIndex = -1) {
        const results = [];
        if (!contourPoints || contourPoints.length < 2) return results;
        for (let i = 0; i < contourPoints.length - 1; i++) {
            if (i === skipIndex) continue;
            const hit = this.segmentSegmentIntersection(segA1, segA2, contourPoints[i], contourPoints[i + 1]);
            if (hit) {
                results.push({ point: hit.point, tA: hit.tA, tB: hit.tB, segmentIndex: i });
            }
        }
        results.sort((a, b) => a.tA - b.tA);
        return results;
    },

    /**
     * V2.0: Findet ALLE Schnittpunkte zwischen zwei Konturen.
     * @returns {Array<{ point, segIdxA, tA, segIdxB, tB }>}
     */
    findContourContourIntersections(pointsA, pointsB) {
        const results = [];
        for (let i = 0; i < pointsA.length - 1; i++) {
            for (let j = 0; j < pointsB.length - 1; j++) {
                const hit = this.segmentSegmentIntersection(
                    pointsA[i], pointsA[i + 1], pointsB[j], pointsB[j + 1]
                );
                if (hit) {
                    results.push({
                        point: hit.point,
                        segIdxA: i, tA: hit.tA,
                        segIdxB: j, tB: hit.tB
                    });
                }
            }
        }
        return results;
    },

    /**
     * V2.0: Findet Schnittpunkte eines Segments mit ALLEN Konturen.
     * @param {Object} seg1, seg2 — Segment-Endpunkte
     * @param {Array<CamContour>} contours — Alle Konturen
     * @param {CamContour} [skipContour] — Eigene Kontur überspringen
     * @returns {Array<{ point, t, contourIdx, segIdx }>} sortiert nach t
     */
    findIntersectionsWithAllContours(seg1, seg2, contours, skipContour = null) {
        const results = [];
        for (let ci = 0; ci < contours.length; ci++) {
            const c = contours[ci];
            if (c === skipContour) continue;
            const pts = c.points;
            if (!pts || pts.length < 2) continue;
            for (let si = 0; si < pts.length - 1; si++) {
                const hit = this.segmentSegmentIntersection(seg1, seg2, pts[si], pts[si + 1]);
                if (hit) {
                    results.push({
                        point: hit.point, t: hit.tA,
                        contourIdx: ci, segIdx: si
                    });
                }
            }
        }
        results.sort((a, b) => a.t - b.t);
        return results;
    },

    // ════════════════════════════════════════════════════════════════
    // CONTOUR SPLITTING — Für Break-Tool
    // ════════════════════════════════════════════════════════════════

    splitContourAtPoint(points, isClosed, segmentIndex, splitPoint) {
        if (!points || points.length < 2) return [points];
        if (segmentIndex < 0 || segmentIndex >= points.length - 1) return [points];
        if (isClosed) {
            return this._splitClosedContour(points, segmentIndex, splitPoint);
        } else {
            return this._splitOpenContour(points, segmentIndex, splitPoint);
        }
    },

    _splitOpenContour(points, segIdx, splitPt) {
        const sp = { x: splitPt.x, y: splitPt.y };
        const partA = [];
        for (let i = 0; i <= segIdx; i++) partA.push({ x: points[i].x, y: points[i].y });
        // Nur hinzufügen wenn splitPt nicht identisch mit letztem Punkt (Vertex-Split)
        const lastA = partA[partA.length - 1];
        if (!lastA || Math.abs(lastA.x - sp.x) > 1e-6 || Math.abs(lastA.y - sp.y) > 1e-6) {
            partA.push(sp);
        }
        const partB = [{ x: sp.x, y: sp.y }];
        for (let i = segIdx + 1; i < points.length; i++) {
            const pt = { x: points[i].x, y: points[i].y };
            // Erstes Element überspringen wenn identisch mit splitPt (Vertex-Split)
            if (partB.length === 1 && Math.abs(partB[0].x - pt.x) < 1e-6 && Math.abs(partB[0].y - pt.y) < 1e-6) continue;
            partB.push(pt);
        }
        const result = [];
        if (partA.length >= 2) result.push(partA);
        if (partB.length >= 2) result.push(partB);
        return result.length > 0 ? result : [points];
    },

    _splitClosedContour(points, segIdx, splitPt) {
        const result = [{ x: splitPt.x, y: splitPt.y }];
        for (let i = segIdx + 1; i < points.length; i++) result.push({ x: points[i].x, y: points[i].y });
        for (let i = 1; i <= segIdx; i++) result.push({ x: points[i].x, y: points[i].y });
        result.push({ x: splitPt.x, y: splitPt.y });
        return [result];
    },

    // ════════════════════════════════════════════════════════════════
    // EXPLODE & JOIN (V1.0)
    // ════════════════════════════════════════════════════════════════

    explodeToSegments(points) {
        if (!points || points.length < 2) return [];
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
            result.push([
                { x: points[i].x, y: points[i].y },
                { x: points[i + 1].x, y: points[i + 1].y }
            ]);
        }
        return result;
    },

    joinContours(contours, tolerance = 0.5) {
        if (!contours || contours.length === 0) return null;
        if (contours.length === 1) {
            return { points: contours[0].points.map(p => ({ x: p.x, y: p.y })), isClosed: contours[0].isClosed };
        }
        const chains = contours.map(c => ({ points: c.points.map(p => ({ x: p.x, y: p.y })), used: false }));
        chains[0].used = true;
        let result = [...chains[0].points];
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < chains.length; i++) {
                if (chains[i].used) continue;
                const pts = chains[i].points;
                if (pts.length < 2) continue;
                const re = result[result.length - 1], rs = result[0];
                const cs = pts[0], ce = pts[pts.length - 1];
                const d = [
                    this.dist(re, cs), this.dist(re, ce),
                    this.dist(rs, cs), this.dist(rs, ce)
                ];
                const min = Math.min(...d);
                if (min > tolerance) continue;
                chains[i].used = true;
                changed = true;
                const idx = d.indexOf(min);
                if (idx === 0) result.push(...pts.slice(1));
                else if (idx === 1) result.push(...[...pts].reverse().slice(1));
                else if (idx === 3) result = [...pts.slice(0, -1), ...result];
                else result = [...[...pts].reverse().slice(0, -1), ...result];
            }
        }
        const first = result[0], last = result[result.length - 1];
        const isClosed = result.length >= 3 && this.dist(first, last) < tolerance;
        return { points: result, isClosed, unusedCount: chains.filter(c => !c.used).length };
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: FILLET — Tangentialer Bogen zwischen zwei Segmenten
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet Fillet-Daten für eine Ecke (Vertex) in einer Polyline.
     * @param {Object} pPrev — Vorheriger Punkt
     * @param {Object} pCorner — Ecke
     * @param {Object} pNext — Nächster Punkt
     * @param {number} radius — Fillet-Radius
     * @returns {{ tangent1, tangent2, center, startAngle, endAngle, arcPoints } | null}
     */
    computeFillet(pPrev, pCorner, pNext, radius) {
        if (radius <= 0) return null;
        // Richtungsvektoren
        const d1x = pPrev.x - pCorner.x, d1y = pPrev.y - pCorner.y;
        const d2x = pNext.x - pCorner.x, d2y = pNext.y - pCorner.y;
        const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y);
        if (len1 < 1e-10 || len2 < 1e-10) return null;

        // Einheitsvektoren
        const u1x = d1x / len1, u1y = d1y / len1;
        const u2x = d2x / len2, u2y = d2y / len2;

        // Halber Winkel zwischen den Segmenten
        const dot = u1x * u2x + u1y * u2y;
        const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
        if (halfAngle < 1e-4 || Math.abs(halfAngle - Math.PI / 2) < 1e-6 && radius > 1e6) return null;

        // Abstand vom Corner zum Tangentenpunkt
        const sinHalf = Math.sin(halfAngle);
        if (sinHalf < 1e-8) return null; // Schutz gegen Division by Zero bei sin(halfAngle)
        const tanDist = radius / Math.tan(halfAngle);
        if (tanDist > len1 - 0.01 || tanDist > len2 - 0.01) return null; // Radius zu groß

        // Tangentenpunkte
        const t1 = { x: pCorner.x + u1x * tanDist, y: pCorner.y + u1y * tanDist };
        const t2 = { x: pCorner.x + u2x * tanDist, y: pCorner.y + u2y * tanDist };

        // Kreismittelpunkt: Auf der Winkelhalbierenden, Abstand radius/sin(halfAngle)
        const bx = u1x + u2x, by = u1y + u2y;
        const bLen = Math.hypot(bx, by);
        if (bLen < 1e-10) return null;
        const centerDist = radius / sinHalf;
        const center = {
            x: pCorner.x + (bx / bLen) * centerDist,
            y: pCorner.y + (by / bLen) * centerDist
        };

        // Bogen-Punkte generieren (adaptive Segmentzahl)
        const arcAngle = Math.PI - 2 * halfAngle;
        const numSegs = Math.max(4, Math.ceil(arcAngle * radius / 0.5)); // Max 0.5mm Abweichung
        const startAngle = Math.atan2(t1.y - center.y, t1.x - center.x);
        const endAngle = Math.atan2(t2.y - center.y, t2.x - center.x);

        // Richtung bestimmen (CCW oder CW)
        const cross = (pCorner.x - t1.x) * (t2.y - t1.y) - (pCorner.y - t1.y) * (t2.x - t1.x);
        const ccw = cross > 0;

        const arcPoints = [{ x: t1.x, y: t1.y }];
        for (let i = 1; i < numSegs; i++) {
            const frac = i / numSegs;
            let angle;
            if (ccw) {
                let da = endAngle - startAngle;
                if (da < 0) da += Math.PI * 2;
                angle = startAngle + frac * da;
            } else {
                let da = startAngle - endAngle;
                if (da < 0) da += Math.PI * 2;
                angle = startAngle - frac * da;
            }
            arcPoints.push({
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle)
            });
        }
        arcPoints.push({ x: t2.x, y: t2.y });

        return { tangent1: t1, tangent2: t2, center, arcPoints, tanDist };
    },

    /**
     * Wendet Fillet auf eine gesamte Polyline an (alle Ecken).
     * @param {Array} points — Polyline-Punkte
     * @param {boolean} isClosed — Geschlossen?
     * @param {number} radius — Fillet-Radius
     * @returns {Array} Neue Punkte mit abgerundeten Ecken
     */
    filletPolyline(points, isClosed, radius) {
        if (!points || points.length < 3 || radius <= 0) return points;
        const newPoints = [];
        const n = points.length;
        const startIdx = isClosed ? 0 : 1;
        const endIdx = isClosed ? n - 1 : n - 2;

        // Erster Punkt (bei offener Kontur: unverändert)
        if (!isClosed) {
            newPoints.push({ x: points[0].x, y: points[0].y });
        }

        for (let i = startIdx; i <= endIdx; i++) {
            const prevIdx = isClosed ? (i - 1 + n - 1) % (n - 1) : i - 1;
            const nextIdx = isClosed ? (i + 1) % (n - 1) : i + 1;
            const pPrev = points[prevIdx];
            const pCorner = points[i];
            const pNext = points[nextIdx];

            const fillet = this.computeFillet(pPrev, pCorner, pNext, radius);
            if (fillet) {
                newPoints.push(...fillet.arcPoints);
            } else {
                newPoints.push({ x: pCorner.x, y: pCorner.y });
            }
        }

        // Letzter Punkt (bei offener Kontur: unverändert)
        if (!isClosed) {
            newPoints.push({ x: points[n - 1].x, y: points[n - 1].y });
        }

        // Geschlossen: Schließpunkt setzen
        if (isClosed && newPoints.length > 2) {
            newPoints.push({ x: newPoints[0].x, y: newPoints[0].y });
        }

        return newPoints;
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: CHAMFER — Gerade Fase zwischen zwei Segmenten
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet Chamfer-Daten für eine Ecke.
     * @param {Object} pPrev, pCorner, pNext — 3 aufeinanderfolgende Punkte
     * @param {number} dist1 — Chamfer-Abstand auf Segment 1
     * @param {number} dist2 — Chamfer-Abstand auf Segment 2
     * @returns {{ cut1, cut2 } | null}
     */
    computeChamfer(pPrev, pCorner, pNext, dist1, dist2) {
        const d1x = pPrev.x - pCorner.x, d1y = pPrev.y - pCorner.y;
        const d2x = pNext.x - pCorner.x, d2y = pNext.y - pCorner.y;
        const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y);
        if (dist1 >= len1 || dist2 >= len2 || len1 < 1e-10 || len2 < 1e-10) return null;
        const cut1 = {
            x: pCorner.x + (d1x / len1) * dist1,
            y: pCorner.y + (d1y / len1) * dist1
        };
        const cut2 = {
            x: pCorner.x + (d2x / len2) * dist2,
            y: pCorner.y + (d2y / len2) * dist2
        };
        return { cut1, cut2 };
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: TRIM — Segment an Schnittpunkten abschneiden
    // ════════════════════════════════════════════════════════════════

    /**
     * Trimmt eine Kontur basierend auf Schnittpunkten mit Boundary-Konturen.
     * Entfernt den Teil der Kontur, der dem Klickpunkt am nächsten liegt.
     * @param {Array} points — Kontur-Punkte
     * @param {boolean} isClosed — Geschlossen?
     * @param {Object} clickPoint — Wo geklickt wurde {x,y}
     * @param {Array<CamContour>} boundaries — Boundary-Konturen
     * @returns {Array<Array>} Verbleibende Kontur-Teile (1 oder 2 Teile)
     */
    trimContour(points, isClosed, clickPoint, boundaries) {
        if (!points || points.length < 2) return [points];

        // Alle Schnittpunkte mit allen Boundaries sammeln
        const allHits = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i], p2 = points[i + 1];
            for (const boundary of boundaries) {
                const bPts = boundary.points;
                if (!bPts || bPts.length < 2) continue;
                for (let j = 0; j < bPts.length - 1; j++) {
                    const hit = this.segmentSegmentIntersection(p1, p2, bPts[j], bPts[j + 1]);
                    if (hit) {
                        // Globaler Parameter: segIdx + tA
                        allHits.push({
                            point: hit.point,
                            globalT: i + hit.tA,
                            segIdx: i
                        });
                    }
                }
            }
        }

        if (allHits.length === 0) return [points]; // Kein Schnitt

        // Sortieren nach globalT
        allHits.sort((a, b) => a.globalT - b.globalT);

        // Globalen T-Wert des Klickpunkts bestimmen
        const clickHit = this.findNearestSegment(points, clickPoint.x, clickPoint.y);
        if (!clickHit) return [points];
        const clickT = clickHit.segmentIndex + clickHit.t;

        // Nächste Schnittpunkte links und rechts des Klickpunkts finden
        let leftHit = null, rightHit = null;
        for (const h of allHits) {
            if (h.globalT <= clickT + 1e-6) leftHit = h;
        }
        for (const h of allHits) {
            if (h.globalT >= clickT - 1e-6) { rightHit = h; break; }
        }

        // Kontur teilen
        if (isClosed) {
            // Bei geschlossener Kontur: zwischen den beiden Schnittpunkten ausschneiden
            if (!leftHit || !rightHit || leftHit === rightHit) return [points];
            // Teil behalten der NICHT den Klickpunkt enthält
            return this._trimClosedBetween(points, leftHit, rightHit);
        } else {
            // Bei offener Kontur: Teile behalten die NICHT den Klickpunkt enthalten
            const parts = [];
            if (leftHit) {
                const part = this._extractPointsRange(points, 0, leftHit.segIdx, leftHit.point);
                if (part.length >= 2) parts.push(part);
            }
            if (rightHit) {
                const part = this._extractPointsFrom(points, rightHit.segIdx, rightHit.point);
                if (part.length >= 2) parts.push(part);
            }
            return parts.length > 0 ? parts : [points];
        }
    },

    _extractPointsRange(points, startIdx, endSegIdx, endPoint) {
        const result = [];
        for (let i = startIdx; i <= endSegIdx; i++) {
            result.push({ x: points[i].x, y: points[i].y });
        }
        result.push({ x: endPoint.x, y: endPoint.y });
        return result;
    },

    _extractPointsFrom(points, startSegIdx, startPoint) {
        const result = [{ x: startPoint.x, y: startPoint.y }];
        for (let i = startSegIdx + 1; i < points.length; i++) {
            result.push({ x: points[i].x, y: points[i].y });
        }
        return result;
    },

    _trimClosedBetween(points, hitA, hitB) {
        // V2.1: Stabiler Index-basierter Algorithmus
        // Erhalte den Teil der NICHT zwischen hitA und hitB liegt
        // = den "langen Weg" von hitB → um die Kontur → hitA
        const n = points.length - 1; // Segmente (letzter Punkt = erster bei geschlossen)
        if (n < 2) return [points];

        const part = [];
        // Start: Schnittpunkt B
        part.push({ x: hitB.point.x, y: hitB.point.y });

        // Von hitB.segIdx+1 vorwärts bis hitA.segIdx (den "langen Weg")
        let idx = (hitB.segIdx + 1) % n;
        let safety = 0;
        while (safety < n + 1) {
            part.push({ x: points[idx].x, y: points[idx].y });
            // Sind wir beim Segment von hitA angekommen?
            if (idx === hitA.segIdx) {
                // Endpunkt: Schnittpunkt A
                part.push({ x: hitA.point.x, y: hitA.point.y });
                break;
            }
            idx = (idx + 1) % n;
            safety++;
        }

        return part.length >= 2 ? [part] : [points];
    },

    /**
     * V2.1: Berechnet die ENTFERNTEN Punkte eines Trim-Vorgangs (für Preview).
     * Gibt den Teil zurück, der bei einem Klick an clickPoint entfernt würde.
     * @returns {Array|null} Punkte des entfernten Teils, oder null wenn kein Trim möglich
     */
    trimContourPreview(points, isClosed, clickPoint, boundaries) {
        if (!points || points.length < 2) return null;

        // Schnittpunkte sammeln (gleiche Logik wie trimContour)
        const allHits = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i], p2 = points[i + 1];
            for (const boundary of boundaries) {
                const bPts = boundary.points;
                if (!bPts || bPts.length < 2) continue;
                for (let j = 0; j < bPts.length - 1; j++) {
                    const hit = this.segmentSegmentIntersection(p1, p2, bPts[j], bPts[j + 1]);
                    if (hit) {
                        allHits.push({
                            point: hit.point,
                            globalT: i + hit.tA,
                            segIdx: i
                        });
                    }
                }
            }
        }
        if (allHits.length === 0) return null;
        allHits.sort((a, b) => a.globalT - b.globalT);

        const clickHit = this.findNearestSegment(points, clickPoint.x, clickPoint.y);
        if (!clickHit) return null;
        const clickT = clickHit.segmentIndex + clickHit.t;

        let leftHit = null, rightHit = null;
        for (const h of allHits) {
            if (h.globalT <= clickT + 1e-6) leftHit = h;
        }
        for (const h of allHits) {
            if (h.globalT >= clickT - 1e-6) { rightHit = h; break; }
        }

        if (isClosed) {
            if (!leftHit || !rightHit || leftHit === rightHit) return null;
            // Bei geschlossener Kontur: Teil ZWISCHEN leftHit und rightHit (= der entfernte Teil)
            return this._extractRemovedClosed(points, leftHit, rightHit);
        } else {
            // Bei offener Kontur: Teil zwischen leftHit und rightHit
            return this._extractRemovedOpen(points, leftHit, rightHit);
        }
    },

    _extractRemovedOpen(points, leftHit, rightHit) {
        const part = [];
        // Wenn kein linker Hit → vom Anfang bis rightHit
        if (!leftHit && rightHit) {
            for (let i = 0; i <= rightHit.segIdx; i++) part.push({ x: points[i].x, y: points[i].y });
            part.push({ x: rightHit.point.x, y: rightHit.point.y });
            return part.length >= 2 ? part : null;
        }
        // Wenn kein rechter Hit → von leftHit bis Ende
        if (leftHit && !rightHit) {
            part.push({ x: leftHit.point.x, y: leftHit.point.y });
            for (let i = leftHit.segIdx + 1; i < points.length; i++) part.push({ x: points[i].x, y: points[i].y });
            return part.length >= 2 ? part : null;
        }
        if (!leftHit || !rightHit) return null;
        // Zwischen leftHit und rightHit
        part.push({ x: leftHit.point.x, y: leftHit.point.y });
        for (let i = leftHit.segIdx + 1; i <= rightHit.segIdx; i++) part.push({ x: points[i].x, y: points[i].y });
        part.push({ x: rightHit.point.x, y: rightHit.point.y });
        return part.length >= 2 ? part : null;
    },

    _extractRemovedClosed(points, leftHit, rightHit) {
        // Der entfernte Teil: von leftHit → vorwärts → rightHit (der "kurze Weg" um den Klickpunkt)
        const part = [];
        part.push({ x: leftHit.point.x, y: leftHit.point.y });
        for (let i = leftHit.segIdx + 1; i <= rightHit.segIdx; i++) {
            part.push({ x: points[i].x, y: points[i].y });
        }
        part.push({ x: rightHit.point.x, y: rightHit.point.y });
        return part.length >= 2 ? part : null;
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: EXTEND — Segment bis zum nächsten Schnittpunkt verlängern
    // ════════════════════════════════════════════════════════════════

    /**
     * Verlängert ein Kontur-Ende bis zum Schnittpunkt mit der nächsten Boundary.
     * @param {Array} points — Kontur-Punkte (offene Kontur)
     * @param {'start'|'end'} whichEnd — Welches Ende verlängern
     * @param {Array<CamContour>} boundaries — Ziel-Konturen
     * @returns {Array} Neue Punkte (oder Original wenn kein Treffer)
     */
    extendContour(points, whichEnd, boundaries, selfContour = null) {
        if (!points || points.length < 2) return points;
        let seg1, seg2, dir;
        if (whichEnd === 'end') {
            seg1 = points[points.length - 2];
            seg2 = points[points.length - 1];
        } else {
            seg1 = points[1];
            seg2 = points[0];
        }
        // Verlängerungsstrahl: von seg1 durch seg2 weiter (großer Faktor)
        const dx = seg2.x - seg1.x, dy = seg2.y - seg1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-10) return points;
        const farPoint = { x: seg2.x + (dx / len) * 100000, y: seg2.y + (dy / len) * 100000 };

        // Schnittpunkt mit Boundaries suchen
        let bestHit = null, bestDist = Infinity;
        for (const boundary of boundaries) {
            if (boundary === selfContour) continue;
            const bPts = boundary.points;
            if (!bPts || bPts.length < 2) continue;
            for (let j = 0; j < bPts.length - 1; j++) {
                const hit = this.segmentSegmentIntersection(seg2, farPoint, bPts[j], bPts[j + 1]);
                if (hit && hit.tA > 1e-6) {
                    const d = this.dist(seg2, hit.point);
                    if (d < bestDist) { bestDist = d; bestHit = hit.point; }
                }
            }
        }

        if (!bestHit) return points;

        const newPoints = points.map(p => ({ x: p.x, y: p.y }));
        if (whichEnd === 'end') {
            newPoints[newPoints.length - 1] = { x: bestHit.x, y: bestHit.y };
        } else {
            newPoints[0] = { x: bestHit.x, y: bestHit.y };
        }
        return newPoints;
    },

    // ════════════════════════════════════════════════════════════════
    // V2.2: SPLIT AND OVERLAP — Kontur trennen + tangential verlängern
    // ════════════════════════════════════════════════════════════════

    /**
     * Splittet eine Kontur und verlängert ein Ende tangential um overlapLength.
     * @param {Array} points — Kontur-Punkte
     * @param {boolean} isClosed — Geschlossene Kontur?
     * @param {number} segmentIndex — Segment-Index des Split-Punktes
     * @param {Object} splitPoint — {x, y} Punkt auf dem Segment
     * @param {number} overlapLength — Verlängerung in mm (Standard: 5)
     * @param {boolean} extendA — true=Teil A verlängern, false=Teil B
     * @returns {Array} Array von Punkt-Arrays (1 oder 2 Teile, eines mit Überlappung)
     */
    splitAndOverlap(points, isClosed, segmentIndex, splitPoint, overlapLength = 5.0, extendA = true) {
        if (!points || points.length < 2) return [points];

        const parts = this.splitContourAtPoint(points, isClosed, segmentIndex, splitPoint);
        if (!parts || parts.length === 0) return [points];

        if (isClosed) {
            // Geschlossene Kontur → 1 offenes Teil; Ende tangential verlängern
            const openPart = parts[0];
            if (!openPart || openPart.length < 2) return parts;
            return [this._extendEndTangential(openPart, extendA ? 'end' : 'start', overlapLength)];
        }

        // Offene Kontur → 2 Teile
        if (parts.length < 2) return parts;
        const result = parts.map(p => p.slice());
        if (extendA) {
            // Teil A am Ende (= Split-Punkt) verlängern
            result[0] = this._extendEndTangential(result[0], 'end', overlapLength);
        } else {
            // Teil B am Anfang (= Split-Punkt) verlängern
            result[1] = this._extendEndTangential(result[1], 'start', overlapLength);
        }
        return result;
    },

    /**
     * Verlängert eine Kontur tangential an einem Ende um eine feste Distanz.
     * Keine Boundary-Prüfung — reine geometrische Verlängerung (C1-stetig).
     */
    _extendEndTangential(points, whichEnd, distance) {
        if (!points || points.length < 2 || distance <= 0) return points;
        const result = points.map(p => ({ x: p.x, y: p.y }));
        let seg1, seg2;
        if (whichEnd === 'end') {
            seg1 = result[result.length - 2];
            seg2 = result[result.length - 1];
        } else {
            seg1 = result[1];
            seg2 = result[0];
        }
        const dx = seg2.x - seg1.x, dy = seg2.y - seg1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-10) return result;
        const extPt = { x: seg2.x + (dx / len) * distance, y: seg2.y + (dy / len) * distance };
        if (whichEnd === 'end') {
            result.push(extPt);
        } else {
            result.unshift(extPt);
        }
        return result;
    },

    /**
     * Berechnet die Vorschau-Linie für die Überlappung (Ghost-Preview).
     * @returns {Object} { from: {x,y}, to: {x,y} } — Verlängerungslinie
     */
    getOverlapPreview(points, isClosed, segmentIndex, splitPoint, overlapLength, extendA) {
        if (!points || points.length < 2) return null;
        const parts = this.splitContourAtPoint(points, isClosed, segmentIndex, splitPoint);
        if (!parts || parts.length === 0) return null;

        let sourcePart, whichEnd;
        if (isClosed) {
            sourcePart = parts[0];
            whichEnd = extendA ? 'end' : 'start';
        } else if (parts.length >= 2) {
            if (extendA) {
                sourcePart = parts[0];
                whichEnd = 'end';
            } else {
                sourcePart = parts[1];
                whichEnd = 'start';
            }
        } else {
            return null;
        }
        if (!sourcePart || sourcePart.length < 2) return null;

        let seg1, seg2;
        if (whichEnd === 'end') {
            seg1 = sourcePart[sourcePart.length - 2];
            seg2 = sourcePart[sourcePart.length - 1];
        } else {
            seg1 = sourcePart[1];
            seg2 = sourcePart[0];
        }
        const dx = seg2.x - seg1.x, dy = seg2.y - seg1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-10) return null;
        const extPt = { x: seg2.x + (dx / len) * overlapLength, y: seg2.y + (dy / len) * overlapLength };
        return { from: { x: seg2.x, y: seg2.y }, to: extPt };
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: OFFSET — Parallelkontur mit Abstand
    // ════════════════════════════════════════════════════════════════

    /**
     * Erstellt eine Offset-Kontur.
     * @param {Array} points — Original-Punkte
     * @param {number} distance — Offset-Abstand (positiv = links, negativ = rechts)
     * @param {boolean} isClosed — Geschlossen?
     * @returns {Array} Offset-Punkte
     */
    offsetContour(points, distance, isClosed) {
        if (!points || points.length < 2 || Math.abs(distance) < 1e-10) return points;
        const n = points.length;

        // Offset-Linien für jedes Segment berechnen
        const offsetSegs = [];
        const segCount = n - 1;
        for (let i = 0; i < segCount; i++) {
            const p1 = points[i], p2 = points[(i + 1) % n];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 1e-10) continue;
            // Normale (links von Fahrtrichtung)
            const nx = -dy / len * distance;
            const ny = dx / len * distance;
            offsetSegs.push({
                p1: { x: p1.x + nx, y: p1.y + ny },
                p2: { x: p2.x + nx, y: p2.y + ny }
            });
        }

        if (offsetSegs.length === 0) return points;

        // Ecken verbinden: Schnittpunkt aufeinanderfolgender Offset-Segmente
        const result = [];
        for (let i = 0; i < offsetSegs.length; i++) {
            const curr = offsetSegs[i];
            const nextIdx = (i + 1) % offsetSegs.length;

            if (i === 0 && !isClosed) {
                result.push({ x: curr.p1.x, y: curr.p1.y });
            }

            if ((isClosed || i < offsetSegs.length - 1) && offsetSegs.length > 1) {
                const next = offsetSegs[nextIdx];
                const isect = this.lineLineIntersection(curr.p1, curr.p2, next.p1, next.p2);
                if (isect) {
                    // Prüfe ob der Schnittpunkt "vernünftig" ist (nicht zu weit weg)
                    const d1 = this.dist(curr.p2, isect.point);
                    const d2 = this.dist(next.p1, isect.point);
                    if (d1 < Math.abs(distance) * 20 && d2 < Math.abs(distance) * 20) {
                        result.push({ x: isect.point.x, y: isect.point.y });
                    } else {
                        // Bogen einfügen bei Außenecken
                        result.push({ x: curr.p2.x, y: curr.p2.y });
                        result.push({ x: next.p1.x, y: next.p1.y });
                    }
                } else {
                    // Parallele Segmente: einfach verbinden
                    result.push({ x: curr.p2.x, y: curr.p2.y });
                }
            }

            if (i === offsetSegs.length - 1 && !isClosed) {
                result.push({ x: curr.p2.x, y: curr.p2.y });
            }
        }

        // Geschlossen: Schließpunkt
        if (isClosed && result.length > 2) {
            result.push({ x: result[0].x, y: result[0].y });
        }

        return result;
    },

    // ════════════════════════════════════════════════════════════════
    // V2.0: BOOLEAN — Union/Intersect/Subtract
    // ════════════════════════════════════════════════════════════════

    /**
     * Führt Boolean-Operation auf zwei geschlossene Konturen aus.
     * Vereinfachte Implementierung basierend auf Schnittpunkt-Analyse.
     * @param {Array} pointsA, pointsB — Beide Konturen (geschlossen)
     * @param {'union'|'intersect'|'subtract'} mode
     * @returns {Array<Array>} Ergebnis-Konturen
     */
    booleanOp(pointsA, pointsB, mode) {
        const intersections = this.findContourContourIntersections(pointsA, pointsB);

        if (intersections.length < 2) {
            // Keine oder nur 1 Schnittpunkt → Sonderfälle
            const aContainsB = this.pointInPolygon(pointsB[0], pointsA);
            const bContainsA = this.pointInPolygon(pointsA[0], pointsB);

            if (mode === 'union') {
                if (aContainsB) return [pointsA.map(p => ({x: p.x, y: p.y}))];
                if (bContainsA) return [pointsB.map(p => ({x: p.x, y: p.y}))];
                return [pointsA.map(p => ({x: p.x, y: p.y})), pointsB.map(p => ({x: p.x, y: p.y}))]; // Getrennt
            }
            if (mode === 'intersect') {
                if (aContainsB) return [pointsB.map(p => ({x: p.x, y: p.y}))];
                if (bContainsA) return [pointsA.map(p => ({x: p.x, y: p.y}))];
                return []; // Kein Overlap
            }
            if (mode === 'subtract') {
                if (aContainsB) return [pointsA.map(p => ({x: p.x, y: p.y}))]; // Loch wäre nötig, vereinfacht: A zurück
                if (bContainsA) return []; // B enthält A komplett → nichts übrig
                return [pointsA.map(p => ({x: p.x, y: p.y}))]; // Getrennt → A unverändert
            }
        }

        // Sortiere Schnittpunkte nach Position auf A
        intersections.sort((a, b) => a.segIdxA + a.tA - b.segIdxA - b.tA);

        // Weiler-Atherton vereinfacht: Kontur-Tracing zwischen Schnittpunkten
        return this._booleanTrace(pointsA, pointsB, intersections, mode);
    },

    /**
     * Vereinfachtes Boolean-Tracing — funktioniert für konvexe und einfache konkave Fälle.
     */
    _booleanTrace(pointsA, pointsB, intersections, mode) {
        if (intersections.length < 2) return [pointsA];

        // Schnittpunkte in A und B einfügen und tracen
        const result = [];
        const ip0 = intersections[0];
        const ip1 = intersections[1];

        // Teile von A und B zwischen den Schnittpunkten extrahieren
        const partA1 = this._extractBetween(pointsA, ip0.segIdxA, ip0.tA, ip1.segIdxA, ip1.tA);
        const partA2 = this._extractBetween(pointsA, ip1.segIdxA, ip1.tA, ip0.segIdxA + pointsA.length - 1, ip0.tA);
        const partB1 = this._extractBetween(pointsB, ip0.segIdxB, ip0.tB, ip1.segIdxB, ip1.tB);
        const partB2 = this._extractBetween(pointsB, ip1.segIdxB, ip1.tB, ip0.segIdxB + pointsB.length - 1, ip0.tB);

        // Welche Teile von A sind innerhalb/außerhalb von B?
        const midA1 = partA1[Math.floor(partA1.length / 2)];
        const a1Inside = this.pointInPolygon(midA1, pointsB);

        if (mode === 'union') {
            // Außenteile von A + Außenteile von B
            const outer = a1Inside ? [...partA2, ...partB1] : [...partA1, ...partB2];
            outer.push({ x: outer[0].x, y: outer[0].y });
            result.push(outer);
        } else if (mode === 'intersect') {
            // Innenteile von A + Innenteile von B
            const inner = a1Inside ? [...partA1, ...partB2] : [...partA2, ...partB1];
            inner.push({ x: inner[0].x, y: inner[0].y });
            result.push(inner);
        } else if (mode === 'subtract') {
            // A ohne B: Außenteil von A + Innenteil von B (umgedreht)
            const sub = a1Inside ? [...partA2, ...[...partB1].reverse()] : [...partA1, ...[...partB1].reverse()];
            sub.push({ x: sub[0].x, y: sub[0].y });
            result.push(sub);
        }

        return result;
    },

    _extractBetween(points, segStart, tStart, segEnd, tEnd) {
        const n = points.length - 1; // Anzahl Segmente (geschlossen: letzter = erster)
        const result = [];

        // Startpunkt auf dem Segment interpolieren
        const si = segStart % n;
        const startPt = {
            x: points[si].x + tStart * (points[si + 1].x - points[si].x),
            y: points[si].y + tStart * (points[si + 1].y - points[si].y)
        };
        result.push(startPt);

        // Punkte zwischen Start und Ende sammeln
        let idx = (si + 1) % n;
        const endSeg = segEnd % n;
        let safety = 0;
        while (idx !== (endSeg + 1) % n && safety < n + 2) {
            result.push({ x: points[idx].x, y: points[idx].y });
            idx = (idx + 1) % n;
            safety++;
        }

        // Endpunkt interpolieren
        const ei = endSeg;
        const endPt = {
            x: points[ei].x + tEnd * (points[ei + 1].x - points[ei].x),
            y: points[ei].y + tEnd * (points[ei + 1].y - points[ei].y)
        };
        result.push(endPt);

        return result;
    },

    /** Punkt-in-Polygon Test (Ray-Casting) */
    pointInPolygon(point, polygon) {
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

    // ════════════════════════════════════════════════════════════════
    // V2.0: FORMEN-GENERATOREN
    // ════════════════════════════════════════════════════════════════

    /** N-Gon (regelmäßiges Polygon) — N Seiten, Zentrum, Radius */
    createNgon(center, radius, sides, inscribed = true) {
        if (sides < 3 || radius <= 0) return [];
        const r = inscribed ? radius : radius / Math.cos(Math.PI / sides);
        const points = [];
        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2; // Start oben
            points.push({
                x: center.x + r * Math.cos(angle),
                y: center.y + r * Math.sin(angle)
            });
        }
        return points;
    },

    /** Obround (Langloch) — Zentrum, Breite, Höhe */
    createObround(center, width, height) {
        if (width <= 0 || height <= 0) return [];
        const points = [];
        const n = 16; // Punkte pro Halbbogen

        if (width >= height) {
            // Horizontal: Halbkreise links/rechts
            const r = height / 2;
            const straight = (width - height) / 2;
            // Rechter Halbbogen (von oben nach unten)
            for (let i = 0; i <= n; i++) {
                const a = -Math.PI / 2 + (i / n) * Math.PI;
                points.push({ x: center.x + straight + r * Math.cos(a), y: center.y + r * Math.sin(a) });
            }
            // Linker Halbbogen (von unten nach oben)
            for (let i = 0; i <= n; i++) {
                const a = Math.PI / 2 + (i / n) * Math.PI;
                points.push({ x: center.x - straight + r * Math.cos(a), y: center.y + r * Math.sin(a) });
            }
        } else {
            // Vertikal: Halbkreise oben/unten
            const r = width / 2;
            const straight = (height - width) / 2;
            for (let i = 0; i <= n; i++) {
                const a = (i / n) * Math.PI;
                points.push({ x: center.x + r * Math.cos(a), y: center.y + straight + r * Math.sin(a) });
            }
            for (let i = 0; i <= n; i++) {
                const a = Math.PI + (i / n) * Math.PI;
                points.push({ x: center.x + r * Math.cos(a), y: center.y - straight + r * Math.sin(a) });
            }
        }
        // Schließen
        points.push({ x: points[0].x, y: points[0].y });
        return points;
    },

    // ════════════════════════════════════════════════════════════════
    // ARABESKE (Laternenfliese) — 8 kubische Bézier-Kurven, tessellierbar
    // ════════════════════════════════════════════════════════════════
    //
    //  B(t) = (1-t)³ P₀ + 3(1-t)²t P₁ + 3(1-t)t² P₂ + t³ P₃,  t ∈ [0,1]
    //
    //  8 Schlüsselpunkte: 4 Spitzen (Kardinal) + 4 Taillen (Diagonal)
    //  Tangenten: Spitzen → senkrecht zur Achse (→ nahtlose Tessellation)
    //            Taillen → senkrecht zur Diagonale
    //
    //  Symmetrie-Beweis (Kontrollpunkt-Ebene):
    //    X-Achse: reflect_X(seg[i]) = reverse(seg[3-i])   ∀ i∈0..3
    //    Y-Achse: reflect_Y(seg[i]) = reverse(seg[7-i])   ∀ i∈0..7
    //  C1-Stetigkeit: cross(B'end_i, B'start_{i+1}) = 0   ∀ i∈0..7

    /** Kubischer Bézier-Punkt bei Parameter t */
    _bezierPoint(p0, p1, p2, p3, t) {
        const m = 1 - t;
        return {
            x: m*m*m * p0.x + 3*m*m*t * p1.x + 3*m*t*t * p2.x + t*t*t * p3.x,
            y: m*m*m * p0.y + 3*m*m*t * p1.y + 3*m*t*t * p2.y + t*t*t * p3.y
        };
    },

    /**
     * Arabeske (Laternenfliese) — Parametrische Form aus 8 kubischen Bézier-Kurven.
     * 4 konvexe Spitzen (Kardinalrichtungen) + 4 konkave Einbuchtungen (Diagonalen).
     * Tessellierbar auf quadratischem Raster mit Pitch = width/height.
     *
     * @param {Object} center       {x, y} Zentrum
     * @param {number} width        Breite Spitze-zu-Spitze (mm)
     * @param {number} height       Höhe Spitze-zu-Spitze (mm)
     * @param {number} neckRatio    Taillen-Position auf Diagonale 0.15–0.85 (Standard: 0.25)
     * @param {number} fugeOffset   Halbe Fugenbreite in mm (Standard: 0)
     * @param {number} [bulge]      Konvexe Ausbauchung 0.1–2.0 (Standard: 0.75)
     * @param {number} [neckTension] Konkave Einschnürung 0.1–2.0 (Standard: 0.55)
     * @returns {Array} Geschlossenes Points-Array [{x,y}, ...]
     */
    createArabeske(center, width, height, neckRatio, fugeOffset, bulge, neckTension) {
        console.time('[GeometryOps] createArabeske');
        if (!neckRatio && neckRatio !== 0) neckRatio = 0.25;
        if (!fugeOffset) fugeOffset = 0;
        if (!bulge) bulge = 0.75;
        if (!neckTension) neckTension = 0.55;
        neckRatio = Math.max(0.15, Math.min(0.85, neckRatio));
        bulge = Math.max(0.10, Math.min(2.00, bulge));
        neckTension = Math.max(0.10, Math.min(2.00, neckTension));

        // Halbmaße minus Fugen-Offset (radiale Schrumpfung)
        const hw = (width / 2) - fugeOffset;
        const hh = (height / 2) - fugeOffset;
        if (hw <= 0 || hh <= 0) { console.timeEnd('[GeometryOps] createArabeske'); return []; }

        // Taille: Abstand vom Zentrum auf der Diagonale
        const nd = neckRatio * (Math.min(width, height) / 2) - fugeOffset;
        if (nd <= 0) { console.timeEnd('[GeometryOps] createArabeske'); return []; }
        const nf = nd / Math.SQRT2; // x = y Komponente bei 45°

        // Tangenten-Längen
        const tipTan  = Math.min(hw, hh) * bulge * 0.5;      // an Spitzen
        const neckTan = nd * neckTension * 0.5;               // an Taillen
        const S2 = 1 / Math.SQRT2;

        // 8 Schlüsselpunkte (relativ zum Zentrum)
        const T  = { x:  0,   y:  hh };      // ↑ oben
        const NE = { x:  nf,  y:  nf };      // ↗ nordost
        const R  = { x:  hw,  y:  0  };      // → rechts
        const SE = { x:  nf,  y: -nf };      // ↘ südost
        const B  = { x:  0,   y: -hh };      // ↓ unten
        const SW = { x: -nf,  y: -nf };      // ↙ südwest
        const L  = { x: -hw,  y:  0  };      // ← links
        const NW = { x: -nf,  y:  nf };      // ↖ nordwest

        // Tangenten-Richtungen (CW-Umlauf):
        //   Spitzen: senkrecht zur Achse  → Tessellations-Constraint
        //     T → ( 1, 0)  R → ( 0,-1)  B → (-1, 0)  L → ( 0, 1)
        //   Taillen: senkrecht zur Diagonale
        //     NE → ( 1,-1)/√2  SE → (-1,-1)/√2  SW → (-1, 1)/√2  NW → ( 1, 1)/√2
        //
        // Kontrollpunkte: P1 = P0 + tangent × tension, P2 = P3 - tangent × tension

        const segments = [
            // Konvex: T → NE
            { p0: T,  p1: { x: tipTan,            y: hh                 },
                      p2: { x: nf - neckTan * S2, y: nf + neckTan * S2  }, p3: NE },
            // Konkav: NE → R
            { p0: NE, p1: { x: nf + neckTan * S2, y: nf - neckTan * S2  },
                      p2: { x: hw,                y: tipTan             }, p3: R  },
            // Konvex: R → SE
            { p0: R,  p1: { x: hw,                y: -tipTan            },
                      p2: { x: nf + neckTan * S2, y: -nf + neckTan * S2 }, p3: SE },
            // Konkav: SE → B
            { p0: SE, p1: { x: nf - neckTan * S2, y: -nf - neckTan * S2 },
                      p2: { x: tipTan,            y: -hh                }, p3: B  },
            // Konvex: B → SW
            { p0: B,  p1: { x: -tipTan,           y: -hh                },
                      p2: { x: -nf + neckTan * S2,y: -nf - neckTan * S2 }, p3: SW },
            // Konkav: SW → L
            { p0: SW, p1: { x: -nf - neckTan * S2,y: -nf + neckTan * S2 },
                      p2: { x: -hw,               y: -tipTan            }, p3: L  },
            // Konvex: L → NW
            { p0: L,  p1: { x: -hw,               y: tipTan             },
                      p2: { x: -nf - neckTan * S2,y: nf - neckTan * S2  }, p3: NW },
            // Konkav: NW → T
            { p0: NW, p1: { x: -nf + neckTan * S2,y: nf + neckTan * S2  },
                      p2: { x: -tipTan,           y: hh                 }, p3: T  }
        ];

        // Bézier → Polyline tessellieren
        const N = 16;
        const allPoints = [];
        for (const seg of segments) {
            for (let i = 0; i < N; i++) {
                const p = this._bezierPoint(seg.p0, seg.p1, seg.p2, seg.p3, i / N);
                allPoints.push({ x: center.x + p.x, y: center.y + p.y });
            }
        }

        // Schließen
        allPoints.push({ x: allPoints[0].x, y: allPoints[0].y });

        console.timeEnd('[GeometryOps] createArabeske');
        console.log('[GeometryOps] Arabeske V2.0: ' + (allPoints.length - 1) + ' Punkte, ' +
            width + '×' + height + 'mm, neck=' + (neckRatio * 100).toFixed(0) +
            '%, bulge=' + (bulge * 100).toFixed(0) +
            '%, fuge=' + (fugeOffset * 2).toFixed(1) + 'mm');

        return allPoints;
    },

    // ════════════════════════════════════════════════════════════════
    // DISTANZ-HELFER
    // ════════════════════════════════════════════════════════════════

    dist(p1, p2) {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    },

    isNearEndpoint(point, contourPoints, tolerance = 0.5) {
        if (!contourPoints || contourPoints.length < 2) return null;
        const first = contourPoints[0];
        const last = contourPoints[contourPoints.length - 1];
        if (this.dist(point, first) < tolerance) return 'start';
        if (this.dist(point, last) < tolerance) return 'end';
        return null;
    },

    /** Vektor-Winkel (rad) */
    angle(p1, p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    },

    /** Punkt auf Linie bei Parameter t */
    lerp(p1, p2, t) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
};

// Export für Browser
if (typeof window !== 'undefined') {
    window.GeometryOps = GeometryOps;
}
