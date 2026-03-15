/**
 * CeraCUT V2.9 - Geometry Kernel
 * Last Modified: 2026-01-28 06:45 UTC
 * Build: 20260128-0645
 * 
 * Mathematics over Guesswork
 */

const Geometry = {
  /**
   * Berechnet die vorzeichenbehaftete Fläche eines Polygons (Shoelace Formula)
   * @param {Array<{x: number, y: number}>} points - Polygon-Punkte
   * @returns {number} Signed Area (> 0 = CW, < 0 = CCW)
   */
  getSignedArea(points) {
    if (!points || points.length < 3) {
      return 0;
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

  /**
   * Prüft ob Polygon im Uhrzeigersinn ist
   */
  isClockwise(points) {
    return this.getSignedArea(points) > 0;
  },

  /**
   * Erzeugt ein Offset-Polygon durch parallele Segmente und deren Intersektionen
   */
  offsetPolygon(points, distance, isClosed) {
    if (!points || points.length < 2) {
      return [];
    }

    const segments = [];
    const n = isClosed ? points.length : points.length - 1;

    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < 1e-10) continue;

      const nx = dy / length;
      const ny = -dx / length;

      segments.push({
        p1: { x: p1.x + nx * distance, y: p1.y + ny * distance },
        p2: { x: p2.x + nx * distance, y: p2.y + ny * distance }
      });
    }

    if (segments.length === 0) {
      return [];
    }

    const offsetPoints = [];

    if (isClosed) {
      const lastSeg = segments[segments.length - 1];
      const firstSeg = segments[0];

      const startEndPoint = this._lineIntersection(
        lastSeg.p1, lastSeg.p2,
        firstSeg.p1, firstSeg.p2
      );

      const closurePoint = startEndPoint || { x: firstSeg.p1.x, y: firstSeg.p1.y };

      offsetPoints.push({ x: closurePoint.x, y: closurePoint.y });

      for (let i = 0; i < segments.length - 1; i++) {
        const seg1 = segments[i];
        const seg2 = segments[i + 1];

        const intersection = this._lineIntersection(
          seg1.p1, seg1.p2,
          seg2.p1, seg2.p2
        );

        if (intersection && (isNaN(intersection.x) || isNaN(intersection.y))) intersection = null;
        if (intersection) {
          offsetPoints.push(intersection);
        } else {
          offsetPoints.push(seg1.p2);
        }
      }

      offsetPoints.push({ x: closurePoint.x, y: closurePoint.y });

    } else {
      offsetPoints.push(segments[0].p1);

      for (let i = 0; i < segments.length - 1; i++) {
        const seg1 = segments[i];
        const seg2 = segments[i + 1];

        const intersection = this._lineIntersection(
          seg1.p1, seg1.p2,
          seg2.p1, seg2.p2
        );

        if (intersection && (isNaN(intersection.x) || isNaN(intersection.y))) intersection = null;
        if (intersection) {
          offsetPoints.push(intersection);
        } else {
          offsetPoints.push(seg1.p2);
        }
      }

      offsetPoints.push(segments[segments.length - 1].p2);
    }

    return offsetPoints;
  },

  _lineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 1e-10) {
      return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  },

  _segmentsIntersect(a1, a2, b1, b2) {
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

  _cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  },

  distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  centroid(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    
    let sumX = 0, sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    
    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  },

  boundingBox(points) {
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
  },

  closestPointOnPolyline(point, polyline) {
    if (!polyline || polyline.length < 2) return null;

    let minDist = Infinity;
    let closest = null;

    for (let i = 0; i < polyline.length - 1; i++) {
      const p1 = polyline[i];
      const p2 = polyline[i + 1];
      
      const result = this._closestPointOnSegment(point, p1, p2);
      
      if (result.distance < minDist) {
        minDist = result.distance;
        closest = { point: result.point, distance: result.distance, t: result.t, segmentIndex: i };
      }
    }

    return closest;
  },

  _closestPointOnSegment(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      return {
        point: { x: p1.x, y: p1.y },
        distance: this.distance(point, p1),
        t: 0
      };
    }

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const closest = {
      x: p1.x + t * dx,
      y: p1.y + t * dy
    };

    return {
      point: closest,
      distance: this.distance(point, closest),
      t: t
    };
  },

  reversePoints(points) {
    return [...points].reverse();
  },

  /**
   * Findet alle Ecken einer Polyline (Punkte wo der Winkelknick > threshold).
   * @param {Array<{x,y}>} points - Polyline-Punkte
   * @param {number} thresholdDeg - Ab welchem Knickwinkel gilt es als Ecke (Grad)
   * @returns {Array<{index, angle, point}>} Ecken mit Index, Knickwinkel und Punkt
   */
  findCorners(points, thresholdDeg = 30) {
    if (!points || points.length < 3) return [];
    const corners = [];
    const threshold = thresholdDeg * Math.PI / 180;
    const n = points.length;
    const isClosed = this.distance(points[0], points[n - 1]) < 0.01;

    for (let i = 0; i < n; i++) {
      const iPrev = i === 0 ? (isClosed ? n - 2 : 0) : i - 1;
      const iNext = i === n - 1 ? (isClosed ? 1 : n - 1) : i + 1;
      if (iPrev === i || iNext === i) continue;

      const dx1 = points[i].x - points[iPrev].x;
      const dy1 = points[i].y - points[iPrev].y;
      const dx2 = points[iNext].x - points[i].x;
      const dy2 = points[iNext].y - points[i].y;

      const len1 = Math.hypot(dx1, dy1);
      const len2 = Math.hypot(dx2, dy2);
      if (len1 < 0.001 || len2 < 0.001) continue;

      const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

      if (Math.PI - angle > threshold) {
        corners.push({
          index: i,
          angle: (Math.PI - angle) * 180 / Math.PI,
          point: { x: points[i].x, y: points[i].y }
        });
      }
    }
    return corners;
  }
};

/**
 * CeraCUT V2.8 - Spline Utilities
 * B-Spline/NURBS Interpolation via De Boor Algorithm
 */
const SplineUtils = {
  
  /**
   * TOLERANCES für Spline-Tessellation (IGEMS-Standard)
   */
  TOLERANCES: {
    SNAP: 0.001,           // 0.001mm Präzision
    DEVIATION: 0.01,       // Max Abweichung von Kurve
    MIN_SEGMENT: 0.1       // Minimale Segmentlänge
  },

  /**
   * Standard Segmentierung basierend auf Kurvengrad
   */
  SEGMENTS_PER_SPAN: 16,   // Punkte pro Spline-Span
  MAX_RECURSION_DEPTH: 8,  // Tiefe für adaptive Subdivision
  
  /**
   * Abstand von Punkt p zur Strecke (a, b)
   */
  _pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-20) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },

  /**
   * Finde Knotenspanne für Parameter t
   * Robuste Implementierung mit expliziter Randbehandlung
   */
  _findKnotSpan(t, degree, n, knots) {
    // n = Anzahl Kontrollpunkte
    // Letzter gültiger Span
    if (t >= knots[n]) return n - 1;
    // Erster gültiger Span
    if (t <= knots[degree]) return degree;
    // Lineare Suche (robust bei Knoten-Multiplizität)
    for (let i = degree; i < n; i++) {
      if (t < knots[i + 1]) return i;
    }
    return n - 1;
  },

  /**
   * Validiert und repariert Knotenvektor aus DXF-Datei
   */
  _validateKnots(knots, n, degree) {
    const expected = n + degree + 1;

    // Monotonie prüfen und reparieren
    let repaired = [...knots];
    for (let i = 1; i < repaired.length; i++) {
      if (repaired[i] < repaired[i - 1]) {
        repaired[i] = repaired[i - 1];
      }
    }

    // Anzahl prüfen
    if (repaired.length === expected) {
      return repaired;
    }

    const diff = repaired.length - expected;
    if (diff > 0 && diff <= 2) {
      // Zu viele Knoten: trimmen (symmetrisch)
      repaired = repaired.slice(0, expected);
    } else if (diff < 0 && diff >= -2) {
      // Zu wenige Knoten: padding am Ende mit letztem Wert
      while (repaired.length < expected) {
        repaired.push(repaired[repaired.length - 1]);
      }
    } else {
      // Zu große Abweichung: komplett neu generieren
      return null; // Aufrufer verwendet generateUniformKnots()
    }

    return repaired;
  },

  /**
   * Adaptive Unterteilung basierend auf Chordal Error
   * Stoppt auch wenn Segmentlänge unter MIN_SEGMENT fällt
   */
  _adaptiveSubdivide(evalFunc, tStart, tEnd, pStart, pEnd, depth, maxDeviation, points) {
    // Guard: Nicht weiter unterteilen wenn Segment bereits sehr kurz
    const segLen = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
    if (segLen < this.TOLERANCES.MIN_SEGMENT) return;

    const tMid = (tStart + tEnd) / 2;
    const pMid = evalFunc(tMid);
    const error = this._pointToSegmentDist(pMid, pStart, pEnd);

    if (error > maxDeviation && depth < this.MAX_RECURSION_DEPTH) {
      this._adaptiveSubdivide(evalFunc, tStart, tMid, pStart, pMid, depth + 1, maxDeviation, points);
      points.push(pMid);
      this._adaptiveSubdivide(evalFunc, tMid, tEnd, pMid, pEnd, depth + 1, maxDeviation, points);
    } else if (error > maxDeviation) {
      // Max Tiefe erreicht, Mittelpunkt trotzdem einfügen
      points.push(pMid);
    }
  },

  /**
   * De Boor Algorithmus - Berechnet Punkt auf B-Spline Kurve
   * @param {number} t - Parameter [0,1]
   * @param {number} degree - Grad der Kurve (typisch 3)
   * @param {Array<{x,y}>} controlPoints - Kontrollpunkte
   * @param {Array<number>} knots - Knotenvektor
   * @param {Array<number>} weights - Gewichte (optional, für NURBS)
   * @returns {{x: number, y: number}} Punkt auf der Kurve
   */
  deBoor(t, degree, controlPoints, knots, weights = null) {
    const n = controlPoints.length;

    // Finde Knotenspanne mit robuster Methode
    const k = this._findKnotSpan(t, degree, n, knots);

    // Initialisiere d-Punkte
    const d = [];
    for (let j = 0; j <= degree; j++) {
      const idx = Math.max(0, Math.min(k - degree + j, n - 1));
      const cp = controlPoints[idx];
      const w = weights ? weights[idx] : 1;
      d.push({ x: cp.x * w, y: cp.y * w, w: w });
    }

    // De Boor Rekursion
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j;
        const knotLeft = knots[Math.max(0, i)];
        const knotRight = knots[Math.min(i + degree + 1 - r, knots.length - 1)];

        const denom = knotRight - knotLeft;
        const alpha = denom > 1e-10 ? (t - knotLeft) / denom : 0;

        d[j] = {
          x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
          y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
          w: (1 - alpha) * d[j - 1].w + alpha * d[j].w
        };
      }
    }

    // NURBS: Durch Gewicht teilen
    const result = d[degree];
    const w = result.w > 1e-10 ? result.w : 1;

    return {
      x: result.x / w,
      y: result.y / w
    };
  },
  
  /**
   * Generiert uniformen Knotenvektor wenn keiner vorhanden
   * @param {number} n - Anzahl Kontrollpunkte
   * @param {number} degree - Grad
   * @param {boolean} isClosed - Geschlossene Kurve
   * @returns {Array<number>} Knotenvektor
   */
  generateUniformKnots(n, degree, isClosed = false) {
    const knotCount = n + degree + 1;
    const knots = [];
    
    if (isClosed) {
      // Periodischer Knotenvektor
      for (let i = 0; i < knotCount; i++) {
        knots.push(i / (knotCount - 1));
      }
    } else {
      // Clamped (offener) Knotenvektor
      for (let i = 0; i < knotCount; i++) {
        if (i <= degree) {
          knots.push(0);
        } else if (i >= n) {
          knots.push(1);
        } else {
          knots.push((i - degree) / (n - degree));
        }
      }
    }
    
    return knots;
  },
  
  /**
   * Tesselliert B-Spline zu Polyline
   * @param {Array<{x,y}>} controlPoints - Kontrollpunkte
   * @param {number} degree - Grad (default 3 = kubisch)
   * @param {Array<number>} knots - Knotenvektor (optional)
   * @param {Array<number>} weights - NURBS-Gewichte (optional)
   * @param {boolean} isClosed - Geschlossene Kurve
   * @param {Object} options - Zusätzliche Optionen
   * @returns {Array<{x,y}>} Tessellierte Punkte
   */
  tessellate(controlPoints, degree = 3, knots = null, weights = null, isClosed = false, options = {}) {
    if (!controlPoints || controlPoints.length < 2) {
      console.warn('[SPLINE] Nicht genug Kontrollpunkte');
      return controlPoints || [];
    }

    // Mindestens degree+1 Kontrollpunkte für gültigen Spline
    if (controlPoints.length <= degree) {
      console.warn(`[SPLINE] Zu wenig Kontrollpunkte (${controlPoints.length}) für Grad ${degree}, Fallback auf Polyline`);
      return [...controlPoints];
    }

    const n = controlPoints.length;

    // Knotenvektor validieren/generieren
    let knotVector = null;
    if (knots && knots.length > 0) {
      const normalized = this._normalizeKnots(knots);
      knotVector = this._validateKnots(normalized, n, degree);
    }
    if (!knotVector) {
      knotVector = this.generateUniformKnots(n, degree, isClosed);
    }

    // Parameterbereich bestimmen
    const tMin = knotVector[degree];
    const tMax = knotVector[n];

    if (tMax <= tMin) {
      console.warn('[SPLINE] Ungültiger Parameterbereich');
      return [...controlPoints];
    }

    // Evaluierungsfunktion
    const evalFunc = (t) => this.deBoor(t, degree, controlPoints, knotVector, weights);
    const maxDeviation = this.TOLERANCES.DEVIATION;

    // Pass 1: Grobe Abtastung an Knotenwerten + Zwischenpunkte
    const coarseParams = [tMin];
    // Einzigartige innere Knotenwerte sammeln
    for (let i = degree + 1; i < n; i++) {
      const kv = knotVector[i];
      if (kv > tMin && kv < tMax && kv !== coarseParams[coarseParams.length - 1]) {
        coarseParams.push(kv);
      }
    }
    coarseParams.push(tMax);

    // Zwischenpunkte pro Knotenspanne einfügen (4 pro Span)
    const withIntermediate = [coarseParams[0]];
    for (let i = 0; i < coarseParams.length - 1; i++) {
      const a = coarseParams[i];
      const b = coarseParams[i + 1];
      for (let j = 1; j <= 4; j++) {
        withIntermediate.push(a + (j / 5) * (b - a));
      }
      withIntermediate.push(b);
    }

    // Grobe Punkte evaluieren
    const coarsePoints = [];
    for (let i = 0; i < withIntermediate.length; i++) {
      try {
        const p = evalFunc(withIntermediate[i]);
        coarsePoints.push({ x: p.x, y: p.y, t: withIntermediate[i] });
      } catch (e) {
        // Punkt überspringen
      }
    }

    if (coarsePoints.length < 2) {
      return [...controlPoints];
    }

    // Pass 2: Adaptive Verfeinerung
    const points = [{ x: this._snap(coarsePoints[0].x), y: this._snap(coarsePoints[0].y) }];

    for (let i = 0; i < coarsePoints.length - 1; i++) {
      const cp0 = coarsePoints[i];
      const cp1 = coarsePoints[i + 1];
      const refined = [];
      this._adaptiveSubdivide(
        evalFunc, cp0.t, cp1.t,
        cp0, cp1,
        0, maxDeviation, refined
      );
      for (const rp of refined) {
        points.push({ x: this._snap(rp.x), y: this._snap(rp.y) });
      }
      points.push({ x: this._snap(cp1.x), y: this._snap(cp1.y) });
    }

    // Geschlossene Kurve: Schließen
    if (isClosed && points.length > 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const dist = Math.hypot(last.x - first.x, last.y - first.y);

      if (dist > this.TOLERANCES.SNAP) {
        points.push({ x: first.x, y: first.y });
      } else {
        points[points.length - 1] = { x: first.x, y: first.y };
      }
    }

    // Duplikate entfernen
    return this._removeDuplicates(points);
  },
  
  /**
   * Normalisiert Knotenvektor auf [0,1]
   */
  _normalizeKnots(knots) {
    if (!knots || knots.length === 0) return [];
    
    const min = knots[0];
    const max = knots[knots.length - 1];
    const range = max - min;
    
    if (range < 1e-10) {
      return knots.map(() => 0);
    }
    
    return knots.map(k => (k - min) / range);
  },
  
  /**
   * Snapping auf 0.001mm Präzision
   */
  _snap(value) {
    return Math.round(value / this.TOLERANCES.SNAP) * this.TOLERANCES.SNAP;
  },
  
  /**
   * Entfernt aufeinanderfolgende Duplikate
   */
  _removeDuplicates(points) {
    if (!points || points.length < 2) return points;
    
    const result = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      
      if (dist > this.TOLERANCES.SNAP) {
        result.push(curr);
      }
    }
    
    return result;
  },
  
  /**
   * Interpolierende Spline (geht durch alle Punkte)
   * Natürliche kubische Spline-Interpolation (C2-stetig)
   * Fallback auf Catmull-Rom bei ≤3 Punkten
   */
  interpolate(fitPoints, degree = 3) {
    if (!fitPoints || fitPoints.length < 2) return fitPoints || [];
    if (fitPoints.length === 2) return [...fitPoints];
    if (fitPoints.length === 3) return this._catmullRomChain(fitPoints);

    const pts = fitPoints;
    const m = pts.length;

    // 1. Parametrisierung: Kumulierte Sehnenlänge, normalisiert auf [0,1]
    const t = new Array(m);
    t[0] = 0;
    for (let i = 1; i < m; i++) {
      t[i] = t[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const totalLen = t[m - 1];
    if (totalLen < 1e-10) return [...fitPoints];
    for (let i = 1; i < m; i++) t[i] /= totalLen;

    // 2. Intervall-Längen
    const h = new Array(m - 1);
    for (let i = 0; i < m - 1; i++) {
      h[i] = t[i + 1] - t[i];
    }

    // 3. Tridiagonales System lösen (Thomas-Algorithmus)
    // Für X und Y getrennt
    const n = m - 1; // Anzahl Intervalle
    const solveTridiag = (coords) => {
      // Zweite Ableitungen M[0..m-1], natürliche Randbedingung: M[0]=M[n]=0
      const M = new Array(m).fill(0);
      if (n < 2) return M;

      // Innere Gleichungen: h[i-1]*M[i-1] + 2*(h[i-1]+h[i])*M[i] + h[i]*M[i+1] = 6*delta
      const size = n - 1; // Anzahl innerer Unbekannter (M[1]..M[n-1])
      const a = new Array(size); // sub-diagonal
      const b = new Array(size); // diagonal
      const c = new Array(size); // super-diagonal
      const d = new Array(size); // rechte Seite

      for (let i = 0; i < size; i++) {
        const idx = i + 1; // M-Index
        a[i] = h[idx - 1];
        b[i] = 2 * (h[idx - 1] + h[idx]);
        c[i] = h[idx];
        const dLeft = (coords[idx] - coords[idx - 1]) / h[idx - 1];
        const dRight = (coords[idx + 1] - coords[idx]) / h[idx];
        d[i] = 6 * (dRight - dLeft);
      }

      // Forward elimination
      for (let i = 1; i < size; i++) {
        const w = a[i] / b[i - 1];
        b[i] -= w * c[i - 1];
        d[i] -= w * d[i - 1];
      }

      // Back substitution
      const sol = new Array(size);
      sol[size - 1] = d[size - 1] / b[size - 1];
      for (let i = size - 2; i >= 0; i--) {
        sol[i] = (d[i] - c[i] * sol[i + 1]) / b[i];
      }

      for (let i = 0; i < size; i++) {
        M[i + 1] = sol[i];
      }
      return M;
    };

    const xCoords = pts.map(p => p.x);
    const yCoords = pts.map(p => p.y);
    const Mx = solveTridiag(xCoords);
    const My = solveTridiag(yCoords);

    // 4. Evaluierungsfunktion: Kubisches Polynom pro Intervall
    const evalSpline = (u) => {
      // Finde Intervall
      let seg = 0;
      for (let i = 0; i < n - 1; i++) {
        if (u >= t[i + 1]) seg = i + 1;
        else break;
      }
      seg = Math.min(seg, n - 1);

      const hi = h[seg];
      const dt1 = t[seg + 1] - u;
      const dt2 = u - t[seg];

      const x = Mx[seg] * dt1 * dt1 * dt1 / (6 * hi)
              + Mx[seg + 1] * dt2 * dt2 * dt2 / (6 * hi)
              + (xCoords[seg] / hi - Mx[seg] * hi / 6) * dt1
              + (xCoords[seg + 1] / hi - Mx[seg + 1] * hi / 6) * dt2;

      const y = My[seg] * dt1 * dt1 * dt1 / (6 * hi)
              + My[seg + 1] * dt2 * dt2 * dt2 / (6 * hi)
              + (yCoords[seg] / hi - My[seg] * hi / 6) * dt1
              + (yCoords[seg + 1] / hi - My[seg + 1] * hi / 6) * dt2;

      return { x, y };
    };

    // 5. Adaptive Tessellierung
    const maxDeviation = this.TOLERANCES.DEVIATION;
    const pStart = evalSpline(0);
    const pEnd = evalSpline(1);
    const points = [{ x: this._snap(pStart.x), y: this._snap(pStart.y) }];

    // Stützstellen an den Datenpunkten + Zwischenpunkte
    const coarseParams = [];
    for (let i = 0; i < m; i++) coarseParams.push(t[i]);

    const coarsePoints = coarseParams.map(u => {
      const p = evalSpline(u);
      return { x: p.x, y: p.y, t: u };
    });

    for (let i = 0; i < coarsePoints.length - 1; i++) {
      const cp0 = coarsePoints[i];
      const cp1 = coarsePoints[i + 1];
      const refined = [];
      this._adaptiveSubdivide(evalSpline, cp0.t, cp1.t, cp0, cp1, 0, maxDeviation, refined);
      for (const rp of refined) {
        points.push({ x: this._snap(rp.x), y: this._snap(rp.y) });
      }
      points.push({ x: this._snap(cp1.x), y: this._snap(cp1.y) });
    }

    return this._removeDuplicates(points);
  },

  /**
   * Catmull-Rom Spline - Fallback für ≤3 Punkte
   */
  _catmullRomChain(points, tension = 0.5) {
    if (points.length < 2) return points;
    if (points.length === 2) return [...points];

    const result = [];
    const segments = this.SEGMENTS_PER_SPAN;

    const extended = [
      points[0],
      ...points,
      points[points.length - 1]
    ];

    for (let i = 1; i < extended.length - 2; i++) {
      const p0 = extended[i - 1];
      const p1 = extended[i];
      const p2 = extended[i + 1];
      const p3 = extended[i + 2];

      for (let j = 0; j < segments; j++) {
        const t = j / segments;
        const point = this._catmullRomPoint(p0, p1, p2, p3, t, tension);
        result.push({
          x: this._snap(point.x),
          y: this._snap(point.y)
        });
      }
    }

    result.push({
      x: this._snap(points[points.length - 1].x),
      y: this._snap(points[points.length - 1].y)
    });

    return this._removeDuplicates(result);
  },

  /**
   * Einzelner Catmull-Rom Punkt
   */
  _catmullRomPoint(p0, p1, p2, p3, t, tension) {
    const t2 = t * t;
    const t3 = t2 * t;

    const s = (1 - tension) / 2;

    const c1 = -s * t3 + 2 * s * t2 - s * t;
    const c2 = (2 - s) * t3 + (s - 3) * t2 + 1;
    const c3 = (s - 2) * t3 + (3 - 2 * s) * t2 + s * t;
    const c4 = s * t3 - s * t2;

    return {
      x: c1 * p0.x + c2 * p1.x + c3 * p2.x + c4 * p3.x,
      y: c1 * p0.y + c2 * p1.y + c3 * p2.y + c4 * p3.y
    };
  }
};

/**
 * CeraCUT V2.8 - Micro-Healing
 * Geometrie-Bereinigung nach IGEMS-Standard
 */
const MicroHealing = {
  
  /**
   * Toleranzen (IGEMS-Standard)
   */
  TOLERANCES: {
    SNAP: 0.001,           // Punkt-Präzision
    MICRO_SEGMENT: 0.1,    // Minimale Segmentlänge
    AUTO_CLOSE: 0.5,       // Automatisches Schließen
    MIN_OPEN_PATH: 1.0,    // Dreck-Schwelle für offene Pfade
    MIN_CLOSED_AREA: 0.01  // Minimale Fläche für geschlossene Konturen
  },
  
  /**
   * Vollständiges Healing einer Kontur-Liste
   * @param {Array} contours - Liste von Konturen
   * @param {Object} options - Optionen
   * @returns {Object} { healed: Array, stats: Object }
   */
  heal(contours, options = {}) {
    if (!contours || contours.length === 0) {
      return { healed: [], stats: { input: 0, output: 0, removed: 0 } };
    }
    
    const tolerances = { ...this.TOLERANCES, ...options.tolerances };
    const stats = {
      input: contours.length,
      pointsRemoved: 0,
      segmentsCollapsed: 0,
      overlapsFixed: 0,        // V3.0 NEU
      autoClosed: 0,
      dirtRemoved: 0,
      tinyAreasRemoved: 0,
      duplicatesRemoved: 0     // V3.0 NEU
    };
    
    console.log(`[MICRO-HEALING] Input: ${contours.length} contours`);
    
    const healed = [];
    
    for (const contour of contours) {
      let points = contour.points || contour;
      if (!points || points.length < 2) continue;
      
      const originalLength = points.length;
      
      // 1. Punkt-Deduplizierung
      points = this.deduplicatePoints(points, tolerances.SNAP);
      stats.pointsRemoved += originalLength - points.length;
      
      if (points.length < 2) continue;
      
      // 2. Micro-Segment Collapse
      const beforeCollapse = points.length;
      points = this.collapseMicroSegments(points, tolerances.MICRO_SEGMENT);
      stats.segmentsCollapsed += beforeCollapse - points.length;

      if (points.length < 2) continue;

      // 2.5 V3.0: Überlappungserkennung
      const overlapResult = this.detectAndFixOverlaps(points, tolerances.SNAP * 10);
      points = overlapResult.points;
      stats.overlapsFixed += overlapResult.overlapsFixed;

      if (points.length < 2) continue;

      // 3. Auto-Close Check
      const wasOpen = !contour.isClosed;
      const closeResult = this.autoClose(points, tolerances.AUTO_CLOSE);
      points = closeResult.points;
      const nowClosed = closeResult.closed;
      
      if (wasOpen && nowClosed) {
        stats.autoClosed++;
        console.log(`[MICRO-HEALING] Auto-closed contour (gap: ${closeResult.gap.toFixed(3)}mm)`);
      }
      
      // 4. Dreck-Filter (offene Pfade)
      if (!nowClosed && !contour.isClosed) {
        const pathLength = this._calculatePathLength(points);
        if (pathLength < tolerances.MIN_OPEN_PATH) {
          stats.dirtRemoved++;
          console.log(`[MICRO-HEALING] Removed dirt: ${pathLength.toFixed(3)}mm open path`);
          continue;
        }
      }
      
      // 5. Area-Filter (geschlossene Konturen)
      if (nowClosed || contour.isClosed) {
        const area = Math.abs(this._calculateArea(points));
        if (area < tolerances.MIN_CLOSED_AREA) {
          stats.tinyAreasRemoved++;
          console.log(`[MICRO-HEALING] Removed tiny area: ${area.toFixed(6)}mm²`);
          continue;
        }
      }
      
      // Kontur behalten
      if (contour.points) {
        contour.points = points;
        contour.isClosed = nowClosed || contour.isClosed;
        healed.push(contour);
      } else {
        healed.push({
          points: points,
          isClosed: nowClosed,
          layer: contour.layer || '0'
        });
      }
    }
    
    // V3.0: Doppelte Konturen entfernen (auf Kontur-Ebene)
    const duplicateResult = this.removeDuplicateContours(healed, tolerances.SNAP * 10);
    const finalHealed = duplicateResult.unique;
    stats.duplicatesRemoved = duplicateResult.removedCount;

    stats.output = finalHealed.length;
    stats.removed = stats.input - stats.output;

    console.log(`[MICRO-HEALING] Result: ${finalHealed.length} contours (removed ${stats.removed})`);
    console.log('[MICRO-HEALING] Stats:', {
      pointsRemoved: stats.pointsRemoved,
      segmentsCollapsed: stats.segmentsCollapsed,
      overlapsFixed: stats.overlapsFixed,
      autoClosed: stats.autoClosed,
      dirtRemoved: stats.dirtRemoved,
      tinyAreasRemoved: stats.tinyAreasRemoved,
      duplicatesRemoved: stats.duplicatesRemoved
    });

    return { healed: finalHealed, stats };
  },
  
  /**
   * Entfernt aufeinanderfolgende doppelte Punkte
   * @param {Array} points - Punktliste
   * @param {number} tolerance - Toleranz (default: 0.001mm)
   * @returns {Array} Bereinigte Punktliste
   */
  deduplicatePoints(points, tolerance = 0.001) {
    if (!points || points.length < 2) return points || [];
    
    const result = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      
      if (dist > tolerance) {
        result.push(curr);
      }
    }
    
    return result;
  },
  
  /**
   * Kollabiert sehr kurze Segmente
   * @param {Array} points - Punktliste
   * @param {number} minLength - Minimale Segmentlänge (default: 0.1mm)
   * @returns {Array} Bereinigte Punktliste
   */
  collapseMicroSegments(points, minLength = 0.1) {
    if (!points || points.length < 3) return points || [];

    const result = [points[0]];
    let accumX = 0, accumY = 0, accumCount = 0;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      const distToPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const distToNext = Math.hypot(next.x - curr.x, next.y - curr.y);

      // Wenn beide Segmente kurz sind, prüfe ob Punkt kollinear ist
      if (distToPrev < minLength && distToNext < minLength) {
        // Abstand des Punktes zur Sehne prev→next (Krümmungs-Check)
        const deviation = this._pointToLineDistance(curr, prev, next);
        // Nur kollabieren wenn fast kollinear (kein Kurvendetail)
        if (deviation < this.TOLERANCES.SNAP) {
          accumX += curr.x;
          accumY += curr.y;
          accumCount++;
        } else {
          // Punkt trägt Krümmungsinformation — behalten
          if (accumCount > 0) {
            result.push({
              x: (accumX + curr.x) / (accumCount + 1),
              y: (accumY + curr.y) / (accumCount + 1)
            });
            accumX = 0;
            accumY = 0;
            accumCount = 0;
          } else {
            result.push(curr);
          }
        }
      } else {
        // Füge akkumulierten Durchschnitt hinzu wenn vorhanden
        if (accumCount > 0) {
          result.push({
            x: (accumX + curr.x) / (accumCount + 1),
            y: (accumY + curr.y) / (accumCount + 1)
          });
          accumX = 0;
          accumY = 0;
          accumCount = 0;
        } else {
          result.push(curr);
        }
      }
    }

    // Letzten Punkt immer behalten
    result.push(points[points.length - 1]);

    return result;
  },

  /**
   * V3.0: Berechnet Abstand eines Punktes zu einer Linie
   * @param {Object} p - Punkt {x, y}
   * @param {Object} lineStart - Linienanfang {x, y}
   * @param {Object} lineEnd - Linienende {x, y}
   * @returns {number} Abstand in mm
   */
  _pointToLineDistance(p, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.0001) {
      return Math.hypot(p.x - lineStart.x, p.y - lineStart.y);
    }

    return Math.abs((p.x - lineStart.x) * dy - (p.y - lineStart.y) * dx) / len;
  },

  /**
   * V3.0: Prüft ob zwei Segmente überlappen (kollinear und teilweise deckungsgleich)
   * @param {Object} p1 - Segment 1 Start
   * @param {Object} p2 - Segment 1 Ende
   * @param {Object} p3 - Segment 2 Start
   * @param {Object} p4 - Segment 2 Ende
   * @param {number} tolerance - Toleranz (default: 0.01mm)
   * @returns {boolean} true wenn überlappend
   */
  _segmentsOverlap(p1, p2, p3, p4, tolerance = 0.01) {
    // Richtungsvektoren
    const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
    const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;

    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < tolerance || len2 < tolerance) return false;

    // Normierte Richtungen
    const nx1 = dx1 / len1, ny1 = dy1 / len1;
    const nx2 = dx2 / len2, ny2 = dy2 / len2;

    // Parallel-Check (Kreuzprodukt)
    const cross = Math.abs(nx1 * ny2 - ny1 * nx2);
    if (cross > 0.01) return false; // Nicht parallel

    // Abstand p3 zur Linie (p1, p2)
    const dist = this._pointToLineDistance(p3, p1, p2);
    if (dist > tolerance) return false; // Nicht kollinear

    // Prüfe ob Segmente sich überlappen (nicht nur berühren)
    // Projiziere p3 und p4 auf Linie (p1, p2)
    const t3 = ((p3.x - p1.x) * dx1 + (p3.y - p1.y) * dy1) / (len1 * len1);
    const t4 = ((p4.x - p1.x) * dx1 + (p4.y - p1.y) * dy1) / (len1 * len1);

    // Überlappung wenn Projektionen im Bereich [0, 1] liegen
    const minT = Math.min(t3, t4);
    const maxT = Math.max(t3, t4);

    return (minT < 1 - tolerance/len1 && maxT > tolerance/len1);
  },

  /**
   * V3.0: Erkennt und repariert überlappende Kurven-Segmente
   * @param {Array} points - Punktliste
   * @param {number} tolerance - Toleranz (default: 0.01mm)
   * @returns {Object} { points: Array, overlapsFixed: number }
   */
  detectAndFixOverlaps(points, tolerance = 0.01) {
    if (!points || points.length < 4) {
      return { points: points || [], overlapsFixed: 0 };
    }

    console.log('[MICRO-HEALING] Checking overlaps...');

    const result = [];
    let overlapsFixed = 0;
    let i = 0;

    while (i < points.length - 1) {
      const p1 = points[i];
      const p2 = points[i + 1];

      result.push(p1);

      // Prüfe ob nachfolgende Segmente zurück-überlappen
      let foundOverlap = false;

      for (let j = i + 2; j < points.length - 1 && j < i + 20; j++) {
        const p3 = points[j];
        const p4 = points[j + 1];

        if (this._segmentsOverlap(p1, p2, p3, p4, tolerance)) {
          console.log(`[MICRO-HEALING] Found overlap: segment ${i}-${i+1} with ${j}-${j+1}`);
          // Überspringe die überlappenden Punkte
          i = j;
          overlapsFixed++;
          foundOverlap = true;
          break;
        }
      }

      if (!foundOverlap) {
        i++;
      }
    }

    // Letzten Punkt hinzufügen
    if (points.length > 0 && (result.length === 0 ||
        result[result.length - 1] !== points[points.length - 1])) {
      result.push(points[points.length - 1]);
    }

    if (overlapsFixed > 0) {
      console.log(`[MICRO-HEALING] Fixed ${overlapsFixed} overlapping segments`);
    }

    return { points: result, overlapsFixed };
  },

  /**
   * Schließt fast-geschlossene Konturen automatisch
   * @param {Array} points - Punktliste
   * @param {number} tolerance - Max Gap zum Schließen (default: 0.5mm)
   * @returns {Object} { points: Array, closed: boolean, gap: number }
   */
  autoClose(points, tolerance = 0.5) {
    if (!points || points.length < 3) {
      return { points: points || [], closed: false, gap: Infinity };
    }
    
    const first = points[0];
    const last = points[points.length - 1];
    const gap = Math.hypot(last.x - first.x, last.y - first.y);
    
    // Bereits geschlossen?
    if (gap < 0.001) {
      return { points, closed: true, gap };
    }
    
    // Gap innerhalb Toleranz?
    if (gap <= tolerance) {
      // Schließe durch Verschieben des letzten Punktes zum ersten
      const closedPoints = [...points];
      closedPoints[closedPoints.length - 1] = { x: first.x, y: first.y };
      return { points: closedPoints, closed: true, gap };
    }
    
    return { points, closed: false, gap };
  },

  /**
   * V3.0: Quick Bounding-Box Berechnung
   */
  _quickBoundingBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  },

  /**
   * V3.0: Vergleicht zwei Punktsequenzen
   */
  _pointSequenceMatches(pointsA, pointsB, tolerance) {
    const minLen = Math.min(pointsA.length, pointsB.length);
    if (Math.abs(pointsA.length - pointsB.length) > 1) return false;

    for (let i = 0; i < minLen; i++) {
      const dist = Math.hypot(pointsA[i].x - pointsB[i].x, pointsA[i].y - pointsB[i].y);
      if (dist > tolerance) return false;
    }

    return true;
  },

  /**
   * V3.0: Prüft ob zwei Konturen identisch sind
   * (auch in umgekehrter Richtung oder rotiert)
   */
  _contoursMatch(contourA, contourB, tolerance) {
    const pointsA = contourA.points || contourA;
    const pointsB = contourB.points || contourB;

    // Schneller Ausschluss: unterschiedliche Punktanzahl
    if (Math.abs(pointsA.length - pointsB.length) > 1) return false;

    // Bounding-Box-Vergleich als Schnell-Filter
    const bbA = this._quickBoundingBox(pointsA);
    const bbB = this._quickBoundingBox(pointsB);

    if (Math.abs(bbA.minX - bbB.minX) > tolerance ||
        Math.abs(bbA.maxX - bbB.maxX) > tolerance ||
        Math.abs(bbA.minY - bbB.minY) > tolerance ||
        Math.abs(bbA.maxY - bbB.maxY) > tolerance) {
      return false;
    }

    // Detaillierter Vergleich - normale Richtung
    if (this._pointSequenceMatches(pointsA, pointsB, tolerance)) {
      return { match: true, reversed: false, offset: 0 };
    }

    // Prüfe umgekehrte Richtung
    const reversedB = [...pointsB].reverse();
    if (this._pointSequenceMatches(pointsA, reversedB, tolerance)) {
      return { match: true, reversed: true, offset: 0 };
    }

    // Prüfe rotierte Versionen (für geschlossene Konturen)
    const isClosed = (contourA.isClosed !== undefined ? contourA.isClosed : true) &&
                     (contourB.isClosed !== undefined ? contourB.isClosed : true);

    if (isClosed && pointsB.length > 2) {
      for (let offset = 1; offset < Math.min(pointsB.length, 10); offset++) {
        const rotated = [...pointsB.slice(offset), ...pointsB.slice(0, offset)];
        if (this._pointSequenceMatches(pointsA, rotated, tolerance)) {
          return { match: true, reversed: false, offset };
        }

        // Auch rotiert + reversed
        const rotatedReversed = [...rotated].reverse();
        if (this._pointSequenceMatches(pointsA, rotatedReversed, tolerance)) {
          return { match: true, reversed: true, offset };
        }
      }
    }

    return false;
  },

  /**
   * V3.0: Entfernt komplett identische/doppelte Konturen
   * @param {Array} contours - Liste von Konturen
   * @param {number} tolerance - Toleranz (default: 0.01mm)
   * @returns {Object} { unique: Array, removedCount: number, removedIndices: Array }
   */
  removeDuplicateContours(contours, tolerance = 0.01) {
    if (!contours || contours.length < 2) {
      return { unique: contours || [], removedCount: 0, removedIndices: [] };
    }

    console.log('[MICRO-HEALING] Checking duplicate contours...');

    const unique = [];
    const removedIndices = [];

    for (let i = 0; i < contours.length; i++) {
      const contourA = contours[i];
      let isDuplicate = false;

      for (let j = 0; j < unique.length; j++) {
        const contourB = unique[j];
        const matchResult = this._contoursMatch(contourA, contourB, tolerance);

        if (matchResult && matchResult.match) {
          isDuplicate = true;
          removedIndices.push(i);
          console.log(`[MICRO-HEALING] Duplicate found: contour ${i} matches ${j} (reversed: ${matchResult.reversed})`);
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(contourA);
      }
    }

    if (removedIndices.length > 0) {
      console.log(`[MICRO-HEALING] Removed ${removedIndices.length} duplicate contours`);
    }

    return { unique, removedCount: removedIndices.length, removedIndices };
  },

  /**
   * Berechnet Pfadlänge
   */
  _calculatePathLength(points) {
    if (!points || points.length < 2) return 0;
    
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += Math.hypot(
        points[i + 1].x - points[i].x,
        points[i + 1].y - points[i].y
      );
    }
    return length;
  },
  
  /**
   * Berechnet vorzeichenbehaftete Fläche (Shoelace)
   */
  _calculateArea(points) {
    if (!points || points.length < 3) return 0;
    
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return area / 2;
  },
  
  /**
   * Quick-Check: Ist Kontur "Dreck"?
   */
  isDirt(contour, tolerances = null) {
    const tol = tolerances || this.TOLERANCES;
    const points = contour.points || contour;
    
    if (!points || points.length < 2) return true;
    
    if (!contour.isClosed) {
      const length = this._calculatePathLength(points);
      return length < tol.MIN_OPEN_PATH;
    } else {
      const area = Math.abs(this._calculateArea(points));
      return area < tol.MIN_CLOSED_AREA;
    }
  },
  
  /**
   * V2.9: Prüft ob eine Kontur ein Rechteck ist
   * Kriterien:
   * - Geschlossen
   * - Genau 4 Ecken (oder 5 wenn letzter = erster Punkt)
   * - Alle Winkel ~90°
   * - Gegenüberliegende Seiten gleich lang
   * 
   * @param {Object|Array} contour - Kontur oder Punkt-Array
   * @param {number} angleTolerance - Winkel-Toleranz in Grad (default: 2°)
   * @returns {boolean} true wenn Rechteck
   */
  isRectangle(contour, angleTolerance = 2) {
    const points = contour.points || contour;
    
    if (!points || points.length < 4) return false;
    
    // Geschlossen prüfen
    const isClosed = contour.isClosed !== undefined ? contour.isClosed : 
      (this.distance(points[0], points[points.length - 1]) < 0.01);
    
    if (!isClosed) return false;
    
    // Eindeutige Eckpunkte extrahieren (ohne doppelten Schlusspunkt)
    let corners = [...points];
    if (corners.length > 4 && this.distance(corners[0], corners[corners.length - 1]) < 0.01) {
      corners = corners.slice(0, -1);
    }
    
    // Muss genau 4 Ecken haben
    if (corners.length !== 4) return false;
    
    // Alle 4 Winkel prüfen (müssen ~90° sein)
    const toleranceRad = angleTolerance * Math.PI / 180;
    
    for (let i = 0; i < 4; i++) {
      const p1 = corners[(i + 3) % 4];  // Vorgänger
      const p2 = corners[i];             // Aktueller Punkt
      const p3 = corners[(i + 1) % 4];  // Nachfolger
      
      // Vektoren
      const v1x = p1.x - p2.x;
      const v1y = p1.y - p2.y;
      const v2x = p3.x - p2.x;
      const v2y = p3.y - p2.y;
      
      // Längen
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      
      if (len1 < 0.001 || len2 < 0.001) return false;
      
      // Winkel über Skalarprodukt: cos(90°) = 0
      const dot = v1x * v2x + v1y * v2y;
      const cosAngle = dot / (len1 * len2);
      
      // |cosAngle| muss < sin(toleranz) sein für ~90°
      if (Math.abs(cosAngle) > Math.sin(toleranceRad)) {
        return false;
      }
    }
    
    // Gegenüberliegende Seiten gleich lang
    const side1 = this.distance(corners[0], corners[1]);
    const side2 = this.distance(corners[1], corners[2]);
    const side3 = this.distance(corners[2], corners[3]);
    const side4 = this.distance(corners[3], corners[0]);
    
    const lengthTolerance = Math.max(side1, side2, side3, side4) * 0.01;
    
    if (Math.abs(side1 - side3) > lengthTolerance) return false;
    if (Math.abs(side2 - side4) > lengthTolerance) return false;
    
    return true;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// CamPreProcessor V1.0 — Physikalische Vorverarbeitung für Wasserstrahlschneiden
// ══════════════════════════════════════════════════════════════════════════════

const CamPreProcessor = {
  VERSION: 'V1.0',

  TOLERANCES: {
    RDP_EPSILON: 0.1,           // Ramer-Douglas-Peucker Toleranz (mm)
    SPIKE_ANGLE: 150,           // Spike-Erkennung: Winkel unter dem Spikes entfernt werden (Grad)
    SPIKE_MAX_DIST: 0.5,        // Max. Punkt-zu-Sehne-Abstand für Spike (mm)
    MAX_SEGMENT_GAP: 2.0,       // Max. Segment-Länge nach RDP (mm)
    MIN_FEATURE_SIZE: 0.8,      // Strahldurchmesser (mm) — BB-Diag Filter
    MIN_POINTS_FOR_RDP: 6       // Min. Punkte bevor RDP angewandt wird
  },

  /**
   * Hauptfunktion: Physikalische Vorverarbeitung aller Konturen
   * @param {Array} contours - CamContour-Array
   * @param {Object} options - Optionale Toleranz-Overrides
   * @returns {Object} { contours, stats }
   */
  process(contours, options = {}) {
    // undefined/null-Werte filtern damit sie Defaults nicht überschreiben
    const cleanOpts = {};
    for (const key of Object.keys(options)) {
      if (options[key] != null) cleanOpts[key] = options[key];
    }
    const tol = Object.assign({}, this.TOLERANCES, cleanOpts);
    const stats = { spikeCount: 0, pointsBefore: 0, pointsAfter: 0, removedContours: 0 };

    console.log(`[CamPreProcessor ${this.VERSION}] Processing ${contours.length} contours...`);

    // 1-3: Spike-Entfernung, RDP, Lücken-Kontrolle pro Kontur
    for (const contour of contours) {
      const pts = contour.points;
      if (!pts || pts.length < 3) continue;

      stats.pointsBefore += pts.length;

      // 1. Spike-Entfernung
      let cleaned = this._removeSpikes(pts, tol.SPIKE_ANGLE, tol.SPIKE_MAX_DIST);
      stats.spikeCount += pts.length - cleaned.length;

      // 2. RDP-Vereinfachung
      if (cleaned.length >= tol.MIN_POINTS_FOR_RDP) {
        cleaned = contour.isClosed
          ? this._rdpClosed(cleaned, tol.RDP_EPSILON)
          : this._rdp(cleaned, tol.RDP_EPSILON);
      }

      // 3. Lücken-Kontrolle (nur für komplexe Konturen, nicht für einfache Rechtecke)
      if (cleaned.length > 5) {
        cleaned = this._ensureMaxGap(cleaned, tol.MAX_SEGMENT_GAP);
      }

      contour.points = cleaned;
      stats.pointsAfter += cleaned.length;
    }

    // 4. Kleinst-Element-Filter
    const filtered = this._filterSmallFeatures(contours, tol.MIN_FEATURE_SIZE);
    stats.removedContours = contours.length - filtered.length;

    const reduction = stats.pointsBefore > 0
      ? ((1 - stats.pointsAfter / stats.pointsBefore) * 100).toFixed(1)
      : '0';
    console.log(`[CamPreProcessor ${this.VERSION}] Punkte: ${stats.pointsBefore} → ${stats.pointsAfter} (−${reduction}%), ` +
      `Spikes: ${stats.spikeCount}, Konturen entfernt: ${stats.removedContours}`);

    return { contours: filtered, stats };
  },

  /**
   * Spike-Entfernung: Entfernt scharfe Spitzen die durch Spline-Artefakte entstehen.
   * Ein Spike hat einen kleinen Winkel UND kleinen Abstand zur Sehne.
   */
  _removeSpikes(points, maxAngleDeg, maxDist) {
    if (points.length < 3) return points;
    const cosThreshold = Math.cos((180 - maxAngleDeg) * Math.PI / 180);
    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
      const v2x = next.x - curr.x, v2y = next.y - curr.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);

      if (len1 < 1e-10 || len2 < 1e-10) continue;

      // Winkel zwischen den Vektoren (cos des Winkels am Punkt)
      const dot = v1x * v2x + v1y * v2y;
      const cosAngle = dot / (len1 * len2);

      // Spike: Kleiner Winkel (cosAngle nahe -1 = Umkehr) UND kleiner Abstand
      if (cosAngle < cosThreshold) {
        const dist = SplineUtils._pointToSegmentDist(curr, prev, next);
        if (dist < maxDist) {
          // Spike → überspringen
          continue;
        }
      }
      result.push(curr);
    }
    result.push(points[points.length - 1]);
    return result;
  },

  /**
   * Ramer-Douglas-Peucker Algorithmus für offene Polylines
   */
  _rdp(points, epsilon) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = SplineUtils._pointToSegmentDist(points[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this._rdp(points.slice(0, maxIdx + 1), epsilon);
      const right = this._rdp(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  },

  /**
   * RDP für geschlossene Konturen: Startpunkt bei maximalem Abstand wählen,
   * damit der Split nicht willkürlich am Startpunkt liegt.
   */
  _rdpClosed(points, epsilon) {
    if (points.length <= 4) return points;

    // Duplikat am Ende entfernen falls vorhanden
    let pts = points;
    const firstLast = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    if (firstLast < 0.001 && pts.length > 3) {
      pts = pts.slice(0, -1);
    }

    // Punkt mit maximalem Abstand zum gegenüberliegenden Punkt finden
    const n = pts.length;
    const halfN = Math.floor(n / 2);
    let maxDist = 0;
    let bestIdx = 0;
    for (let i = 0; i < n; i++) {
      const oppIdx = (i + halfN) % n;
      const d = Math.hypot(pts[i].x - pts[oppIdx].x, pts[i].y - pts[oppIdx].y);
      if (d > maxDist) {
        maxDist = d;
        bestIdx = i;
      }
    }

    // Rotiere Punkte so dass bestIdx der Startpunkt ist
    const rotated = pts.slice(bestIdx).concat(pts.slice(0, bestIdx));
    // Schließe die Kontur für RDP
    rotated.push({ x: rotated[0].x, y: rotated[0].y });

    const simplified = this._rdp(rotated, epsilon);

    // Letztes Duplikat wieder anfügen (geschlossene Kontur)
    if (simplified.length > 1) {
      simplified[simplified.length - 1] = { x: simplified[0].x, y: simplified[0].y };
    }
    return simplified;
  },

  /**
   * Lücken-Kontrolle: Zu lange Segmente nach RDP aufteilen.
   * CNC braucht regelmäßige Stützpunkte für gleichmäßige Bewegung.
   */
  _ensureMaxGap(points, maxGap) {
    if (points.length < 2) return points;
    const result = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);

      if (dist > maxGap) {
        const segments = Math.ceil(dist / maxGap);
        for (let j = 1; j < segments; j++) {
          const t = j / segments;
          result.push({
            x: prev.x + t * (curr.x - prev.x),
            y: prev.y + t * (curr.y - prev.y)
          });
        }
      }
      result.push(curr);
    }
    return result;
  },

  /**
   * Kleinst-Element-Filter: Konturen deren Bounding-Box-Diagonale < minSize
   * werden entfernt (physikalisch nicht schneidbar).
   */
  _filterSmallFeatures(contours, minSize) {
    return contours.filter(contour => {
      // Offene Konturen behalten (werden später vom MicroHealing gefiltert)
      if (!contour.isClosed) return true;
      const pts = contour.points;
      if (!pts || pts.length < 3) return false;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const diag = Math.hypot(maxX - minX, maxY - minY);
      return diag >= minSize;
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Geometry, SplineUtils, MicroHealing, CamPreProcessor };
}
