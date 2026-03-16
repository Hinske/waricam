/**
 * CeraCUT Nesting Engine V1.1
 * Automatische Teile-Verschachtelung für Wasserstrahlschneiden
 *
 * Algorithmen:
 *   - Bottom-Left Fill (BLF) mit konfigurierbarer Schwerkraftrichtung
 *   - No-Fit Polygon (NFP) für präzise Kollisionsvermeidung
 *   - Multi-Sheet Overflow
 *   - Rotationsoptimierung (0°, 90°, 180°, 270° oder benutzerdefiniert)
 *
 * Last Modified: 2026-03-09
 * Build: 20260309
 *
 * (c) Cerasell GmbH
 */

const NestingEngine = (() => {
    'use strict';

    const VERSION = 'V1.0';
    const LOG_PREFIX = `[Nesting ${VERSION}]`;
    const EPSILON = 1e-8;

    // ═══════════════════════════════════════════════════════════════════
    // Standardkonfiguration
    // ═══════════════════════════════════════════════════════════════════

    const DEFAULT_CONFIG = {
        sheetWidth: 1000,       // mm
        sheetHeight: 500,       // mm
        sheetMargin: 5,         // mm Rand an jeder Seite
        spacing: 2,             // mm Abstand zwischen Teilen
        rotationSteps: [0, 90, 180, 270],  // Grad
        gravity: 'bottom-left', // 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
        maxSheets: 100,         // Maximale Anzahl Bleche
        mergeToleranceNFP: 0.1  // Toleranz für NFP-Vereinfachung
    };

    // ═══════════════════════════════════════════════════════════════════
    // Geometrie-Hilfsfunktionen (fallback wenn Geometry nicht verfügbar)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Bounding-Box eines Punkt-Arrays berechnen
     */
    function _boundingBox(points) {
        if (typeof Geometry !== 'undefined' && Geometry?.boundingBox) {
            return Geometry.boundingBox(points);
        }
        if (!points || points.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    }

    /**
     * Vorzeichenbehaftete Fläche (Shoelace)
     */
    function _signedArea(points) {
        if (typeof Geometry !== 'undefined' && Geometry?.getSignedArea) {
            return Geometry.getSignedArea(points);
        }
        if (!points || points.length < 3) return 0;
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }

    /**
     * Punkte um einen Winkel (Grad) um ein Zentrum rotieren
     */
    function _rotatePoints(points, angleDeg, cx, cy) {
        if (!points || points.length === 0) return [];
        const rad = angleDeg * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return points.map(p => ({
            x: cos * (p.x - cx) - sin * (p.y - cy) + cx,
            y: sin * (p.x - cx) + cos * (p.y - cy) + cy
        }));
    }

    /**
     * Punkte translieren
     */
    function _translatePoints(points, dx, dy) {
        return points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    }

    /**
     * Konvexe Hülle (Andrew's Monotone Chain)
     */
    function _convexHull(points) {
        if (!points || points.length < 3) return points ? [...points] : [];

        const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
        const n = sorted.length;

        if (n < 3) return sorted;

        const cross = (o, a, b) =>
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        // Untere Hülle
        const lower = [];
        for (const p of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        // Obere Hülle
        const upper = [];
        for (let i = n - 1; i >= 0; i--) {
            const p = sorted[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        // Letzten Punkt jeder Hälfte entfernen (Duplikat)
        lower.pop();
        upper.pop();

        return lower.concat(upper);
    }

    /**
     * Punkt-in-Polygon Test (Ray-Casting)
     */
    function _pointInPolygon(point, polygon) {
        if (typeof GeometryOps !== 'undefined' && GeometryOps?.pointInPolygon) {
            return GeometryOps.pointInPolygon(point, polygon);
        }
        let inside = false;
        const n = polygon.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Polygon-Fläche (absolut)
     */
    function _polygonArea(points) {
        return Math.abs(_signedArea(points));
    }

    // ═══════════════════════════════════════════════════════════════════
    // No-Fit Polygon (NFP) Berechnung
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Minkowski-Differenz zur NFP-Berechnung.
     * Berechnet das NFP von stationärem Polygon A und orbitierendem Polygon B.
     * Der Referenzpunkt von B ist dessen Bounding-Box-Minimum.
     *
     * Vereinfachte Variante: Verwendet konvexe Hüllen für robuste Ergebnisse.
     * Für nicht-konvexe Formen wird die konvexe Hülle als konservative Annäherung genutzt.
     *
     * @param {Array<{x,y}>} polyA - Stationäres Polygon (CCW)
     * @param {Array<{x,y}>} polyB - Orbitierendes Polygon (CCW)
     * @returns {Array<{x,y}>} NFP-Polygon
     */
    function _computeNFP(polyA, polyB) {
        // Konvexe Hüllen für robuste Berechnung
        const hullA = _convexHull(polyA);
        const hullB = _convexHull(polyB);

        if (hullA.length < 3 || hullB.length < 3) {
            // Fallback: Bounding-Box-basiertes NFP
            return _computeBBoxNFP(polyA, polyB);
        }

        // B spiegeln am Ursprung (für Minkowski-Differenz)
        const negB = hullB.map(p => ({
            x: -p.x,
            y: -p.y
        }));

        // Minkowski-Summe von A und (-B)
        return _minkowskiSum(hullA, negB);
    }

    /**
     * Minkowski-Summe zweier konvexer Polygone
     * Beide müssen CCW sein.
     */
    function _minkowskiSum(polyA, polyB) {
        // CCW sicherstellen
        const a = _ensureCCW(polyA);
        const b = _ensureCCW(polyB);

        const na = a.length;
        const nb = b.length;

        // Startpunkte: jeweils niedrigster Punkt
        let ia = 0, ib = 0;
        for (let i = 1; i < na; i++) {
            if (a[i].y < a[ia].y || (a[i].y === a[ia].y && a[i].x < a[ia].x)) ia = i;
        }
        for (let i = 1; i < nb; i++) {
            if (b[i].y < b[ib].y || (b[i].y === b[ib].y && b[i].x < b[ib].x)) ib = i;
        }

        const result = [];
        let ca = 0, cb = 0;

        while (ca < na || cb < nb) {
            const idxA = (ia + ca) % na;
            const idxB = (ib + cb) % nb;

            result.push({
                x: a[idxA].x + b[idxB].x,
                y: a[idxA].y + b[idxB].y
            });

            if (ca >= na) { cb++; continue; }
            if (cb >= nb) { ca++; continue; }

            const nextA = (ia + ca + 1) % na;
            const nextB = (ib + cb + 1) % nb;

            const edgeA = { x: a[nextA].x - a[idxA].x, y: a[nextA].y - a[idxA].y };
            const edgeB = { x: b[nextB].x - b[idxB].x, y: b[nextB].y - b[idxB].y };

            const cross = edgeA.x * edgeB.y - edgeA.y * edgeB.x;

            if (cross > EPSILON) {
                ca++;
            } else if (cross < -EPSILON) {
                cb++;
            } else {
                ca++;
                cb++;
            }

            // Sicherheit: Endlos-Schleifen-Schutz
            if (result.length > na + nb + 2) break;
        }

        return result;
    }

    /**
     * Bounding-Box-basiertes NFP (Fallback für degenerierte Polygone)
     */
    function _computeBBoxNFP(polyA, polyB) {
        const bbA = _boundingBox(polyA);
        const bbB = _boundingBox(polyB);
        const wB = bbB.maxX - bbB.minX;
        const hB = bbB.maxY - bbB.minY;

        return [
            { x: bbA.minX - wB, y: bbA.minY - hB },
            { x: bbA.maxX,      y: bbA.minY - hB },
            { x: bbA.maxX,      y: bbA.maxY },
            { x: bbA.minX - wB, y: bbA.maxY }
        ];
    }

    /**
     * Polygon in CCW-Reihenfolge bringen
     */
    function _ensureCCW(polygon) {
        if (_signedArea(polygon) < 0) {
            return [...polygon].reverse();
        }
        return polygon;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Inner-Fit Polygon (IFP) — Teil innerhalb des Blechs
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Berechnet den Bereich auf dem Blech, in dem der Referenzpunkt eines Teils
     * platziert werden darf, sodass das Teil vollständig innerhalb liegt.
     *
     * @param {Object} sheet - { width, height, margin }
     * @param {Object} partBBox - Bounding-Box des Teils (normalisiert auf Referenzpunkt 0,0)
     * @returns {{ minX, minY, maxX, maxY }} Erlaubter Bereich für Referenzpunkt
     */
    function _innerFitRect(sheet, partBBox) {
        const m = sheet.margin || 0;
        const usableW = sheet.width - 2 * m;
        const usableH = sheet.height - 2 * m;

        const partW = partBBox.maxX - partBBox.minX;
        const partH = partBBox.maxY - partBBox.minY;

        return {
            minX: m - partBBox.minX,
            minY: m - partBBox.minY,
            maxX: m + usableW - partW,
            maxY: m + usableH - partH
        };
    }

    /**
     * Vereinfachte IFP: Maximaler Platzierungsbereich für ein Teil
     */
    function _placementBounds(sheet, partBBox) {
        const m = sheet.margin || 0;
        return {
            minX: m - partBBox.minX,
            minY: m - partBBox.minY,
            maxX: sheet.width - m - partBBox.maxX,
            maxY: sheet.height - m - partBBox.maxY
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // Teile-Vorbereitung
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Teil normalisieren: Punkte so verschieben, dass der BBox-Ursprung bei (0,0) liegt.
     * Gibt normalisierte Punkte und Offset zurück.
     */
    function _normalizePart(points) {
        const bb = _boundingBox(points);
        const normalized = points.map(p => ({
            x: p.x - bb.minX,
            y: p.y - bb.minY
        }));
        return {
            points: normalized,
            offsetX: bb.minX,
            offsetY: bb.minY,
            width: bb.maxX - bb.minX,
            height: bb.maxY - bb.minY
        };
    }

    /**
     * Teil mit Abstand (spacing) aufblasen — vergrößert die effektive BBox
     */
    function _inflatePartBBox(bbox, spacing) {
        return {
            minX: bbox.minX - spacing / 2,
            minY: bbox.minY - spacing / 2,
            maxX: bbox.maxX + spacing / 2,
            maxY: bbox.maxY + spacing / 2
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // BLF (Bottom-Left Fill) Platzierung
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Ermittelt die beste Position für ein Teil auf einem Blech
     * unter Berücksichtigung bereits platzierter Teile.
     *
     * @param {Array<{x,y}>} partPoints - Normalisierte Teil-Punkte (mit Spacing)
     * @param {Object} sheet - Blech-Konfiguration
     * @param {Array} placedParts - Bereits platzierte Teile [{points, position, bbox}]
     * @param {string} gravity - Schwerkraftrichtung
     * @param {number} spacing - Abstand zwischen Teilen
     * @returns {{x, y}|null} Beste Position oder null wenn kein Platz
     */
    function _findBLFPosition(partPoints, sheet, placedParts, gravity, spacing) {
        const partBBox = _boundingBox(partPoints);
        const bounds = _placementBounds(sheet, partBBox);

        // Prüfe ob das Teil überhaupt auf das Blech passt
        if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
            return null;
        }

        // Raster-Auflösung für Kandidatenpositionen
        const partW = partBBox.maxX - partBBox.minX;
        const partH = partBBox.maxY - partBBox.minY;
        const stepX = Math.max(0.5, Math.min(partW / 4, 5));
        const stepY = Math.max(0.5, Math.min(partH / 4, 5));

        // Kandidatenpositionen generieren
        const candidates = _generateCandidatePositions(
            bounds, placedParts, partBBox, stepX, stepY, gravity, spacing
        );

        // Gravitations-Sortierung
        _sortByGravity(candidates, gravity);

        // Beste kollisionsfreie Position finden
        for (const candidate of candidates) {
            const testBBox = {
                minX: partBBox.minX + candidate.x,
                minY: partBBox.minY + candidate.y,
                maxX: partBBox.maxX + candidate.x,
                maxY: partBBox.maxY + candidate.y
            };

            // Blech-Grenzen prüfen
            if (testBBox.minX < sheet.margin - EPSILON ||
                testBBox.minY < sheet.margin - EPSILON ||
                testBBox.maxX > sheet.width - sheet.margin + EPSILON ||
                testBBox.maxY > sheet.height - sheet.margin + EPSILON) {
                continue;
            }

            // Kollision mit platzierten Teilen prüfen
            if (!_collidesWithPlaced(testBBox, partPoints, candidate, placedParts, spacing)) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * Kandidatenpositionen für BLF generieren.
     * Enthält Raster-Positionen und NFP-basierte Eckpositionen an platzierten Teilen.
     */
    function _generateCandidatePositions(bounds, placedParts, partBBox, stepX, stepY, gravity, spacing) {
        const candidates = [];
        const partW = partBBox.maxX - partBBox.minX;
        const partH = partBBox.maxY - partBBox.minY;

        // 1) Raster-Positionen
        for (let y = bounds.minY; y <= bounds.maxY + EPSILON; y += stepY) {
            for (let x = bounds.minX; x <= bounds.maxX + EPSILON; x += stepX) {
                candidates.push({ x, y });
            }
        }

        // 2) Kritische Positionen: direkt neben platzierten Teilen
        for (const placed of placedParts) {
            const pb = placed.bbox;
            const gap = spacing;

            // Rechts neben dem platzierten Teil
            candidates.push({ x: pb.maxX + gap - partBBox.minX, y: pb.minY - partBBox.minY });
            candidates.push({ x: pb.maxX + gap - partBBox.minX, y: pb.maxY - partBBox.maxY });

            // Links neben dem platzierten Teil
            candidates.push({ x: pb.minX - gap - partBBox.maxX, y: pb.minY - partBBox.minY });
            candidates.push({ x: pb.minX - gap - partBBox.maxX, y: pb.maxY - partBBox.maxY });

            // Über dem platzierten Teil
            candidates.push({ x: pb.minX - partBBox.minX, y: pb.maxY + gap - partBBox.minY });
            candidates.push({ x: pb.maxX - partBBox.maxX, y: pb.maxY + gap - partBBox.minY });

            // Unter dem platzierten Teil
            candidates.push({ x: pb.minX - partBBox.minX, y: pb.minY - gap - partBBox.maxY });
            candidates.push({ x: pb.maxX - partBBox.maxX, y: pb.minY - gap - partBBox.maxY });
        }

        // 3) Ecke des Blechs als Startposition
        candidates.push({ x: bounds.minX, y: bounds.minY });

        // Duplikate entfernen (auf stepX/2 Genauigkeit)
        return _deduplicateCandidates(candidates, Math.min(stepX, stepY) / 4);
    }

    /**
     * Duplikate aus Kandidatenliste entfernen
     */
    function _deduplicateCandidates(candidates, tolerance) {
        const result = [];
        const seen = new Set();
        for (const c of candidates) {
            const key = `${Math.round(c.x / tolerance)},${Math.round(c.y / tolerance)}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(c);
            }
        }
        return result;
    }

    /**
     * Kandidatenpositionen nach Schwerkraftrichtung sortieren
     */
    function _sortByGravity(candidates, gravity) {
        switch (gravity) {
            case 'bottom-left':
                candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));
                break;
            case 'bottom-right':
                candidates.sort((a, b) => (a.y - b.y) || (b.x - a.x));
                break;
            case 'top-left':
                candidates.sort((a, b) => (b.y - a.y) || (a.x - b.x));
                break;
            case 'top-right':
                candidates.sort((a, b) => (b.y - a.y) || (b.x - a.x));
                break;
            default:
                candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));
        }
    }

    /**
     * Prüft Kollision eines Teils (an Kandidatenposition) mit allen platzierten Teilen.
     * Verwendet erst BBox-Check (schnell), dann Polygon-Check (genau).
     */
    function _collidesWithPlaced(testBBox, partPoints, position, placedParts, spacing) {
        for (const placed of placedParts) {
            // Schneller BBox-Check mit Spacing
            if (_bboxOverlap(testBBox, placed.bbox, spacing)) {
                // Genauerer Check: Polygon-Überlappung
                if (_polygonsOverlap(partPoints, position, placed.points, placed.position)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * BBox-Überlappungsprüfung (mit optionalem Mindestabstand)
     */
    function _bboxOverlap(bboxA, bboxB, gap) {
        const g = gap || 0;
        return !(bboxA.maxX + g <= bboxB.minX ||
                 bboxB.maxX + g <= bboxA.minX ||
                 bboxA.maxY + g <= bboxB.minY ||
                 bboxB.maxY + g <= bboxA.minY);
    }

    /**
     * Polygon-Überlappungsprüfung (SAT-basiert für konvexe Approximation)
     * Prüft ob ein Eckpunkt von A in B liegt oder umgekehrt.
     */
    function _polygonsOverlap(pointsA, posA, pointsB, posB) {
        // Punkte an Position verschieben
        const translatedA = pointsA.map(p => ({ x: p.x + posA.x, y: p.y + posA.y }));
        const translatedB = pointsB.map(p => ({ x: p.x + posB.x, y: p.y + posB.y }));

        // Vertex-in-Polygon Test (schnell, fängt die meisten Fälle)
        for (const p of translatedA) {
            if (_pointInPolygon(p, translatedB)) return true;
        }
        for (const p of translatedB) {
            if (_pointInPolygon(p, translatedA)) return true;
        }

        // Segment-Schnitt-Test für Randfälle
        return _edgesIntersect(translatedA, translatedB);
    }

    /**
     * Prüft ob Kanten zweier Polygone sich schneiden
     */
    function _edgesIntersect(polyA, polyB) {
        const nA = polyA.length;
        const nB = polyB.length;

        for (let i = 0; i < nA; i++) {
            const a1 = polyA[i];
            const a2 = polyA[(i + 1) % nA];

            for (let j = 0; j < nB; j++) {
                const b1 = polyB[j];
                const b2 = polyB[(j + 1) % nB];

                if (_segmentsIntersect(a1, a2, b1, b2)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Segment-Schnitt-Test (exklusive Endpunkte)
     */
    function _segmentsIntersect(p1, p2, p3, p4) {
        const d1 = _cross2D(p3, p4, p1);
        const d2 = _cross2D(p3, p4, p2);
        const d3 = _cross2D(p1, p2, p3);
        const d4 = _cross2D(p1, p2, p4);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }

        // Kollineare Fälle
        if (Math.abs(d1) < EPSILON && _onSegment(p3, p4, p1)) return true;
        if (Math.abs(d2) < EPSILON && _onSegment(p3, p4, p2)) return true;
        if (Math.abs(d3) < EPSILON && _onSegment(p1, p2, p3)) return true;
        if (Math.abs(d4) < EPSILON && _onSegment(p1, p2, p4)) return true;

        return false;
    }

    function _cross2D(a, b, c) {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }

    function _onSegment(p, q, r) {
        return r.x <= Math.max(p.x, q.x) + EPSILON &&
               r.x >= Math.min(p.x, q.x) - EPSILON &&
               r.y <= Math.max(p.y, q.y) + EPSILON &&
               r.y >= Math.min(p.y, q.y) - EPSILON;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Teile-Sortierung (Optimierung der Platzierungsreihenfolge)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Teile nach Fläche (absteigend) sortieren — größte Teile zuerst
     * platzieren führt typischerweise zu besserer Auslastung.
     */
    function _sortPartsByArea(parts) {
        return [...parts].sort((a, b) => {
            const areaA = a.width * a.height;
            const areaB = b.width * b.height;
            return areaB - areaA;
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // Haupt-Nesting-Algorithmus
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Hauptfunktion: Verschachtelt Konturen auf Blech(e).
     *
     * @param {Array<CamContour>} contours - Array von CamContour-Objekten
     * @param {Object} [config] - Konfiguration (wird mit DEFAULT_CONFIG gemergt)
     * @returns {{
     *   placements: Array<{contourIndex, sheetIndex, position: {x,y}, rotation, bbox}>,
     *   sheets: Array<{index, utilization, partCount}>,
     *   unplaced: Array<number>,
     *   totalUtilization: number
     * }}
     */
    function nest(contours, config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        const startTime = performance.now();

        console.log(`${LOG_PREFIX} Starte Nesting: ${contours.length} Konturen auf ${cfg.sheetWidth}×${cfg.sheetHeight}mm Blech`);
        console.log(`${LOG_PREFIX} Spacing: ${cfg.spacing}mm, Margin: ${cfg.sheetMargin}mm, Rotationen: [${cfg.rotationSteps.join('°, ')}°]`);

        // Validierung
        if (!contours || contours.length === 0) {
            console.warn(`${LOG_PREFIX} Keine Konturen zum Verschachteln`);
            return { placements: [], sheets: [], unplaced: [], totalUtilization: 0 };
        }

        if (cfg.sheetWidth <= 2 * cfg.sheetMargin || cfg.sheetHeight <= 2 * cfg.sheetMargin) {
            console.error(`${LOG_PREFIX} Blech zu klein für den konfigurierten Rand`);
            return { placements: [], sheets: [], unplaced: contours.map((_, i) => i), totalUtilization: 0 };
        }

        const sheetConfig = {
            width: cfg.sheetWidth,
            height: cfg.sheetHeight,
            margin: cfg.sheetMargin
        };

        // Teile vorbereiten: normalisieren und Rotationsvarianten erzeugen
        const preparedParts = _prepareParts(contours, cfg);

        // Nach Fläche sortieren (größte zuerst)
        const sortedIndices = preparedParts
            .map((p, i) => ({ index: i, area: p.width * p.height }))
            .sort((a, b) => b.area - a.area)
            .map(item => item.index);

        // Platzierung
        const placements = [];
        const unplaced = [];
        const sheets = [{ index: 0, placedParts: [], usedArea: 0 }];

        for (const partIdx of sortedIndices) {
            const part = preparedParts[partIdx];
            let placed = false;

            // Rotationsvarianten durchprobieren
            const rotationVariants = _getRotationVariants(part, cfg.rotationSteps);

            // Auf existierenden Blechen versuchen
            for (let si = 0; si < sheets.length && !placed; si++) {
                for (const variant of rotationVariants) {
                    const position = _findBLFPosition(
                        variant.points,
                        sheetConfig,
                        sheets[si].placedParts,
                        cfg.gravity,
                        cfg.spacing
                    );

                    if (position) {
                        const bbox = _boundingBox(variant.points);
                        const placedBBox = {
                            minX: bbox.minX + position.x,
                            minY: bbox.minY + position.y,
                            maxX: bbox.maxX + position.x,
                            maxY: bbox.maxY + position.y
                        };

                        const placement = {
                            contourIndex: part.originalIndex,
                            sheetIndex: si,
                            position: { x: position.x, y: position.y },
                            rotation: variant.rotation,
                            bbox: placedBBox
                        };

                        placements.push(placement);
                        sheets[si].placedParts.push({
                            points: variant.points,
                            position: position,
                            bbox: placedBBox
                        });
                        sheets[si].usedArea += _polygonArea(variant.points);

                        placed = true;
                        break;
                    }
                }
            }

            // Neues Blech versuchen
            if (!placed && sheets.length < cfg.maxSheets) {
                const newSheetIdx = sheets.length;
                sheets.push({ index: newSheetIdx, placedParts: [], usedArea: 0 });

                for (const variant of rotationVariants) {
                    const position = _findBLFPosition(
                        variant.points,
                        sheetConfig,
                        [],
                        cfg.gravity,
                        cfg.spacing
                    );

                    if (position) {
                        const bbox = _boundingBox(variant.points);
                        const placedBBox = {
                            minX: bbox.minX + position.x,
                            minY: bbox.minY + position.y,
                            maxX: bbox.maxX + position.x,
                            maxY: bbox.maxY + position.y
                        };

                        const placement = {
                            contourIndex: part.originalIndex,
                            sheetIndex: newSheetIdx,
                            position: { x: position.x, y: position.y },
                            rotation: variant.rotation,
                            bbox: placedBBox
                        };

                        placements.push(placement);
                        sheets[newSheetIdx].placedParts.push({
                            points: variant.points,
                            position: position,
                            bbox: placedBBox
                        });
                        sheets[newSheetIdx].usedArea += _polygonArea(variant.points);

                        placed = true;
                        break;
                    }
                }
            }

            if (!placed) {
                console.warn(`${LOG_PREFIX} Kontur ${part.originalIndex} (${part.name}) konnte nicht platziert werden`);
                unplaced.push(part.originalIndex);
            }
        }

        // Leere Bleche am Ende entfernen
        const usedSheets = sheets.filter(s => s.placedParts.length > 0);

        // Statistiken berechnen
        const sheetArea = cfg.sheetWidth * cfg.sheetHeight;
        const sheetStats = usedSheets.map(s => ({
            index: s.index,
            utilization: sheetArea > 0 ? Math.round((s.usedArea / sheetArea) * 10000) / 100 : 0,
            partCount: s.placedParts.length
        }));

        const totalUsedArea = usedSheets.reduce((sum, s) => sum + s.usedArea, 0);
        const totalSheetArea = usedSheets.length * sheetArea;
        const totalUtilization = totalSheetArea > 0
            ? Math.round((totalUsedArea / totalSheetArea) * 10000) / 100
            : 0;

        const elapsed = Math.round(performance.now() - startTime);

        console.log(`${LOG_PREFIX} Ergebnis: ${placements.length}/${contours.length} Teile auf ${usedSheets.length} Blech(en) platziert`);
        console.log(`${LOG_PREFIX} Auslastung: ${totalUtilization}% gesamt`);
        for (const ss of sheetStats) {
            console.log(`${LOG_PREFIX}   Blech ${ss.index + 1}: ${ss.partCount} Teile, ${ss.utilization}%`);
        }
        if (unplaced.length > 0) {
            console.warn(`${LOG_PREFIX} ${unplaced.length} Teile konnten nicht platziert werden`);
        }
        console.log(`${LOG_PREFIX} Laufzeit: ${elapsed}ms`);

        return {
            placements,
            sheets: sheetStats,
            unplaced,
            totalUtilization
        };
    }

    /**
     * Konturen für die Platzierung vorbereiten
     */
    function _prepareParts(contours, cfg) {
        return contours.map((contour, index) => {
            const points = contour?.points || [];
            if (points.length === 0) {
                console.warn(`${LOG_PREFIX} Kontur ${index} hat keine Punkte`);
                return {
                    originalIndex: index,
                    points: [],
                    width: 0,
                    height: 0,
                    area: 0,
                    name: contour?.name || `Contour_${index}`
                };
            }

            const norm = _normalizePart(points);

            return {
                originalIndex: index,
                points: norm.points,
                originalOffset: { x: norm.offsetX, y: norm.offsetY },
                width: norm.width,
                height: norm.height,
                area: _polygonArea(norm.points),
                isClosed: contour?.isClosed ?? true,
                name: contour?.name || `Contour_${index}`
            };
        });
    }

    /**
     * Rotationsvarianten eines Teils erzeugen
     */
    function _getRotationVariants(part, rotationSteps) {
        if (!part.points || part.points.length === 0) return [];

        const variants = [];
        const bb = _boundingBox(part.points);
        const cx = (bb.minX + bb.maxX) / 2;
        const cy = (bb.minY + bb.maxY) / 2;

        for (const angle of rotationSteps) {
            let rotatedPoints;
            if (angle === 0) {
                rotatedPoints = part.points.map(p => ({ x: p.x, y: p.y }));
            } else {
                rotatedPoints = _rotatePoints(part.points, angle, cx, cy);
            }

            // Erneut normalisieren (Rotation verschiebt BBox)
            const norm = _normalizePart(rotatedPoints);

            variants.push({
                points: norm.points,
                rotation: angle,
                width: norm.width,
                height: norm.height
            });
        }

        // Nach Flächen-Effizienz sortieren (kompakteste Variante zuerst)
        // Bevorzuge Varianten mit kleinerem BBox-Aspektverhältnis
        variants.sort((a, b) => {
            const areaA = a.width * a.height;
            const areaB = b.width * b.height;
            return areaA - areaB;
        });

        return variants;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Platzierungen anwenden
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Platzierungen auf CamContour-Objekte anwenden (in-place Modifikation).
     * Transformiert die Konturen gemäß den Nesting-Ergebnissen.
     *
     * ACHTUNG: Modifiziert die Punkte der Konturen direkt.
     * Für Undo-Support vorher Snapshots erstellen.
     *
     * @param {Array<CamContour>} contours - Originale Konturen
     * @param {Array} placements - Platzierungs-Ergebnis aus nest()
     * @param {Object} [options] - Optionen
     * @param {number} [options.sheetIndex=0] - Nur Platzierungen dieses Blechs anwenden
     * @returns {Array<CamContour>} Die modifizierten Konturen (gleiche Referenzen)
     */
    function applyPlacements(contours, placements, options = {}) {
        const targetSheet = options.sheetIndex;
        const filteredPlacements = (targetSheet !== undefined && targetSheet !== null)
            ? placements.filter(p => p.sheetIndex === targetSheet)
            : placements;

        console.log(`${LOG_PREFIX} Wende ${filteredPlacements.length} Platzierungen an`);

        for (const placement of filteredPlacements) {
            const contour = contours[placement.contourIndex];
            if (!contour || !contour.points || contour.points.length === 0) {
                console.warn(`${LOG_PREFIX} Kontur ${placement.contourIndex} nicht gefunden oder leer`);
                continue;
            }

            const points = contour.points;

            // 1) Normalisieren (auf Ursprung verschieben)
            const bb = _boundingBox(points);
            const cx = (bb.minX + bb.maxX) / 2;
            const cy = (bb.minY + bb.maxY) / 2;

            // Zum Zentrum verschieben
            for (const p of points) {
                p.x -= cx;
                p.y -= cy;
            }

            // 2) Rotation anwenden
            if (placement.rotation !== 0) {
                const rad = placement.rotation * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                for (const p of points) {
                    const nx = cos * p.x - sin * p.y;
                    const ny = sin * p.x + cos * p.y;
                    p.x = nx;
                    p.y = ny;
                }
            }

            // 3) Auf BBox-Ursprung normalisieren
            const rotBB = _boundingBox(points);
            for (const p of points) {
                p.x -= rotBB.minX;
                p.y -= rotBB.minY;
            }

            // 4) An Zielposition verschieben
            for (const p of points) {
                p.x += placement.position.x;
                p.y += placement.position.y;
            }

            // Cache invalidieren (CeraCUT-Pattern)
            if (typeof ModificationTool !== 'undefined' && ModificationTool?.invalidateCache) {
                ModificationTool.invalidateCache(contour);
            } else {
                // Manuelle Cache-Invalidierung
                contour._cachedKerfPolyline = null;
                contour._cacheKey = null;
                contour._cachedLeadInPath = null;
                contour._cachedLeadOutPath = null;
                contour._cachedOvercutPath = null;
            }
        }

        return contours;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Utility-Funktionen
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Blech-Auslastung für eine gegebene Platzierung berechnen
     */
    function getSheetUtilization(contours, placements, sheetConfig, sheetIndex) {
        const sheetArea = (sheetConfig.sheetWidth || sheetConfig.width) *
                          (sheetConfig.sheetHeight || sheetConfig.height);
        if (sheetArea <= 0) return 0;

        const sheetPlacements = placements.filter(p => p.sheetIndex === (sheetIndex || 0));
        let usedArea = 0;

        for (const p of sheetPlacements) {
            const contour = contours[p.contourIndex];
            if (contour?.points) {
                usedArea += _polygonArea(contour.points);
            }
        }

        return Math.round((usedArea / sheetArea) * 10000) / 100;
    }

    /**
     * Prüft ob ein Teil (BBox) auf ein Blech passt
     */
    function partFitsSheet(partPoints, sheetConfig) {
        const bb = _boundingBox(partPoints);
        const w = bb.maxX - bb.minX;
        const h = bb.maxY - bb.minY;
        const cfg = {
            width: sheetConfig.sheetWidth || sheetConfig.width || 0,
            height: sheetConfig.sheetHeight || sheetConfig.height || 0,
            margin: sheetConfig.sheetMargin || sheetConfig.margin || 0
        };
        const usableW = cfg.width - 2 * cfg.margin;
        const usableH = cfg.height - 2 * cfg.margin;

        // Prüfe auch rotiert (90°)
        return (w <= usableW && h <= usableH) ||
               (h <= usableW && w <= usableH);
    }

    /**
     * Erzeugt eine Vorschau der Platzierung als Punkt-Arrays
     * (nützlich für Rendering ohne die Konturen zu modifizieren)
     */
    function getPlacementPreview(contours, placements) {
        const preview = [];

        for (const placement of placements) {
            const contour = contours[placement.contourIndex];
            if (!contour?.points || contour.points.length === 0) continue;

            const points = contour.points;
            const bb = _boundingBox(points);
            const cx = (bb.minX + bb.maxX) / 2;
            const cy = (bb.minY + bb.maxY) / 2;

            // Kopie erstellen, transformieren
            let transformed = points.map(p => ({ x: p.x - cx, y: p.y - cy }));

            if (placement.rotation !== 0) {
                transformed = _rotatePoints(transformed, placement.rotation, 0, 0);
            }

            // Normalisieren
            const rotBB = _boundingBox(transformed);
            transformed = transformed.map(p => ({
                x: p.x - rotBB.minX + placement.position.x,
                y: p.y - rotBB.minY + placement.position.y
            }));

            preview.push({
                contourIndex: placement.contourIndex,
                sheetIndex: placement.sheetIndex,
                points: transformed,
                rotation: placement.rotation,
                bbox: placement.bbox,
                name: contour.name || `Contour_${placement.contourIndex}`
            });
        }

        return preview;
    }

    /**
     * Berechnet das NFP zweier Konturen (öffentliche API)
     */
    function computeNFP(contourA, contourB) {
        const pointsA = contourA?.points || contourA;
        const pointsB = contourB?.points || contourB;
        if (!pointsA || !pointsB || pointsA.length < 3 || pointsB.length < 3) {
            return null;
        }
        return _computeNFP(pointsA, pointsB);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Öffentliche API
    // ═══════════════════════════════════════════════════════════════════

    console.debug(`${LOG_PREFIX} Modul geladen`);

    return {
        // Haupt-API
        nest,
        applyPlacements,

        // Utility
        getSheetUtilization,
        partFitsSheet,
        getPlacementPreview,
        computeNFP,

        // Konfiguration
        DEFAULT_CONFIG: { ...DEFAULT_CONFIG },

        // Version
        VERSION
    };
})();
