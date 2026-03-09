/**
 * WARICAM V3.0 - Arc Fitting Module
 * Konvertiert Splines/Polylines zu Bögen und Linien
 *
 * Algorithmen:
 * 1. Biarc-Fitting - Approximation durch zwei tangentielle Kreisbögen
 * 2. Arc-Detection - Erkennung bestehender Bögen in Polylines
 * 3. Toleranz-basierte Segmentierung
 *
 * Last Modified: 2026-01-29
 */

const ArcFitting = {

  VERSION: 'V3.0',

  /**
   * Logging-Level: 'silent' | 'info' | 'verbose' | 'debug'
   */
  LOG_LEVEL: 'info',

  /**
   * Toleranzen für Arc-Fitting
   */
  TOLERANCES: {
    DEFAULT_CHORD: 0.01,     // Max. Abweichung Sehne zu Bogen (mm)
    MIN_ARC_RADIUS: 0.5,     // Min. Radius für Bogen (mm)
    MAX_ARC_RADIUS: 10000,   // Max. Radius (sonst Linie)
    MIN_ARC_ANGLE: 0.1,      // Min. Winkel in Grad
    COLLINEAR: 0.001,        // Toleranz für Kollinearität
    TANGENT_MATCH: 0.05      // Radiant für Tangenten-Match
  },

  /**
   * Logging-Hilfsfunktion
   */
  _log(level, ...args) {
    const levels = { silent: 0, info: 1, verbose: 2, debug: 3 };
    if (levels[level] <= levels[this.LOG_LEVEL]) {
      console.log('[ARC-FITTING]', ...args);
    }
  },

  /**
   * Konvertiert Polyline zu Bögen und Linien
   *
   * @param {Array<{x, y}>} points - Eingabe-Polyline
   * @param {Object} options - Optionen
   * @param {number} options.chordTolerance - Max. Abweichung (default: 0.01)
   * @param {number} options.minArcRadius - Min. Bogen-Radius
   * @param {boolean} options.preferArcs - Bögen bevorzugen
   * @returns {Array} Liste von {type: 'line'|'arc', ...}
   */
  fitPolyline(points, options = {}) {
    if (!points || points.length < 2) return [];

    const tolerance = options.chordTolerance || this.TOLERANCES.DEFAULT_CHORD;
    const minRadius = options.minArcRadius || this.TOLERANCES.MIN_ARC_RADIUS;

    this._log('info', `Starting with tolerance ${tolerance}mm`);
    this._log('verbose', `Processing ${points.length} points`);

    const result = [];
    let i = 0;

    while (i < points.length - 1) {
      // Versuche Bogen zu fitten
      const arcResult = this._tryFitArc(points, i, tolerance, minRadius);

      if (arcResult && arcResult.endIndex > i + 1) {
        // Bogen gefunden
        result.push({
          type: 'arc',
          start: { x: points[i].x, y: points[i].y },
          end: { x: points[arcResult.endIndex].x, y: points[arcResult.endIndex].y },
          center: arcResult.center,
          radius: arcResult.radius,
          startAngle: arcResult.startAngle,
          endAngle: arcResult.endAngle,
          clockwise: arcResult.clockwise
        });

        this._log('debug', `Arc: i=${i} to ${arcResult.endIndex}, R=${arcResult.radius.toFixed(2)}`);
        i = arcResult.endIndex;
      } else {
        // Linie
        result.push({
          type: 'line',
          start: { x: points[i].x, y: points[i].y },
          end: { x: points[i + 1].x, y: points[i + 1].y }
        });
        i++;
      }
    }

    const arcs = result.filter(s => s.type === 'arc').length;
    const lines = result.filter(s => s.type === 'line').length;
    this._log('info', `Result: ${arcs} arcs + ${lines} lines (from ${points.length} points)`);

    return result;
  },

  /**
   * Rekursives Biarc-Fitting mit Toleranz-Kontrolle
   *
   * @param {Array<{x, y}>} points - Punkte
   * @param {number} tolerance - Max. Abweichung
   * @param {number} maxDepth - Max. Rekursionstiefe
   * @returns {Array} Liste von Bögen/Linien
   */
  recursiveBiarcFit(points, tolerance = 0.01, maxDepth = 10) {
    if (!points || points.length < 2) return [];
    if (points.length === 2) {
      return [{ type: 'line', start: points[0], end: points[1] }];
    }

    this._log('info', `V3.0 Starting recursive fit with tolerance ${tolerance}mm`);

    // Tangenten berechnen wenn nicht vorhanden
    const withTangents = this._computeTangents(points);

    const result = this._recursiveFitSegment(
      withTangents,
      0,
      withTangents.length - 1,
      tolerance,
      maxDepth,
      0
    );

    const arcs = result.filter(s => s.type === 'arc').length;
    const lines = result.filter(s => s.type === 'line').length;
    const ratio = (points.length / result.length).toFixed(1);

    this._log('info', `V3.0 Result: ${arcs} arcs + ${lines} lines, compression ${ratio}x`);

    return result;
  },

  /**
   * Rekursive Segment-Fitting Funktion
   */
  _recursiveFitSegment(points, startIdx, endIdx, tolerance, maxDepth, depth) {
    if (depth > maxDepth || endIdx - startIdx < 1) {
      // Max. Tiefe oder zu kurz: Linien
      const result = [];
      for (let i = startIdx; i < endIdx; i++) {
        result.push({
          type: 'line',
          start: { x: points[i].x, y: points[i].y },
          end: { x: points[i + 1].x, y: points[i + 1].y }
        });
      }
      return result;
    }

    const p0 = points[startIdx];
    const p1 = points[endIdx];

    // Versuche Biarc
    const biarc = this._biarcFit(p0, p1, tolerance);

    if (biarc && biarc.length > 0) {
      // Prüfe ob alle Zwischenpunkte innerhalb Toleranz liegen
      let allWithinTolerance = true;

      for (let i = startIdx + 1; i < endIdx; i++) {
        const pt = points[i];
        const minDist = this._minDistanceToArcs(pt, biarc);

        if (minDist > tolerance) {
          allWithinTolerance = false;
          break;
        }
      }

      if (allWithinTolerance) {
        return biarc.map(arc => ({
          type: arc.type || 'arc',
          start: arc.start,
          end: arc.end,
          center: arc.center,
          radius: arc.radius,
          startAngle: arc.startAngle,
          endAngle: arc.endAngle,
          clockwise: arc.clockwise
        }));
      }
    }

    // Teile in der Mitte
    const midIdx = Math.floor((startIdx + endIdx) / 2);

    const left = this._recursiveFitSegment(points, startIdx, midIdx, tolerance, maxDepth, depth + 1);
    const right = this._recursiveFitSegment(points, midIdx, endIdx, tolerance, maxDepth, depth + 1);

    return [...left, ...right];
  },

  /**
   * Biarc-Fitting: Approximiert Kurve durch zwei tangentielle Bögen
   *
   * @param {Object} p0 - Startpunkt mit Tangente {x, y, tx, ty}
   * @param {Object} p1 - Endpunkt mit Tangente {x, y, tx, ty}
   * @param {number} tolerance - Max. Abweichung
   * @returns {Array} Zwei Bögen oder null
   */
  _biarcFit(p0, p1, tolerance = 0.01) {
    // Verbindungsvektor
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const d = Math.hypot(dx, dy);

    if (d < this.TOLERANCES.COLLINEAR) return null;

    // Tangenten normieren (oder Fallback)
    const t0 = this._normalize({ x: p0.tx || dx, y: p0.ty || dy });
    const t1 = this._normalize({ x: p1.tx || dx, y: p1.ty || dy });

    // Prüfe ob Tangenten annähernd parallel sind -> Einzelbogen oder Linie
    const tangentDot = t0.x * t1.x + t0.y * t1.y;

    if (Math.abs(tangentDot) > 0.999) {
      // Nahezu parallel: prüfe ob Linie ausreicht
      return this._singleArcOrLine(p0, p1, t0, tolerance);
    }

    // Biarc-Berechnung
    const v = { x: dx / d, y: dy / d }; // Normierte Verbindung

    // Winkel zwischen Tangente und Verbindung
    const alpha0 = Math.acos(Math.max(-1, Math.min(1, t0.x * v.x + t0.y * v.y)));
    const alpha1 = Math.acos(Math.max(-1, Math.min(1, -(t1.x * v.x + t1.y * v.y))));

    // Berechne Parameter r (Verhältnis der Bogenlängen)
    const r = this._computeBiarcRatio(alpha0, alpha1);

    if (r <= 0.05 || r >= 0.95) {
      // Kein gültiger Biarc möglich
      return this._singleArcOrLine(p0, p1, t0, tolerance);
    }

    // Verbindungspunkt J
    const jx = p0.x + r * dx;
    const jy = p0.y + r * dy;
    const j = { x: jx, y: jy };

    // Berechne beide Bögen
    const arc1 = this._computeArc(p0, j, t0);
    const arc2 = this._computeArc(j, p1, this._computeTangentAtJoint(arc1, j));

    if (!arc1 || !arc2) {
      return this._singleArcOrLine(p0, p1, t0, tolerance);
    }

    return [arc1, arc2];
  },

  /**
   * Versucht einen einzelnen Bogen durch 3+ Punkte zu fitten
   */
  _tryFitArc(points, startIdx, tolerance, minRadius) {
    if (startIdx + 2 >= points.length) return null;

    // Mindestens 3 Punkte für Bogen
    const p0 = points[startIdx];
    const p1 = points[startIdx + 1];
    const p2 = points[startIdx + 2];

    // Kreismittelpunkt durch 3 Punkte
    const center = this._circumcenter(p0, p1, p2);
    if (!center) return null;

    const radius = Math.hypot(p0.x - center.x, p0.y - center.y);

    if (radius < minRadius || radius > this.TOLERANCES.MAX_ARC_RADIUS) {
      return null;
    }

    // Erweitere Bogen solange Punkte innerhalb Toleranz
    let endIdx = startIdx + 2;

    while (endIdx + 1 < points.length) {
      const nextPt = points[endIdx + 1];
      const distToCenter = Math.hypot(nextPt.x - center.x, nextPt.y - center.y);

      if (Math.abs(distToCenter - radius) > tolerance) {
        break;
      }

      endIdx++;
    }

    // Berechne Winkel
    const startAngle = Math.atan2(p0.y - center.y, p0.x - center.x);
    const endAngle = Math.atan2(points[endIdx].y - center.y, points[endIdx].x - center.x);

    // Richtung bestimmen
    const clockwise = this._isClockwise(points, startIdx, endIdx, center);

    return {
      center,
      radius,
      startAngle,
      endAngle,
      clockwise,
      endIndex: endIdx
    };
  },

  /**
   * Berechnet Kreismittelpunkt durch 3 Punkte (Umkreis)
   */
  _circumcenter(p1, p2, p3) {
    const ax = p1.x, ay = p1.y;
    const bx = p2.x, by = p2.y;
    const cx = p3.x, cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

    if (Math.abs(d) < 0.0001) return null; // Kollinear

    const ux = ((ax * ax + ay * ay) * (by - cy) +
                (bx * bx + by * by) * (cy - ay) +
                (cx * cx + cy * cy) * (ay - by)) / d;

    const uy = ((ax * ax + ay * ay) * (cx - bx) +
                (bx * bx + by * by) * (ax - cx) +
                (cx * cx + cy * cy) * (bx - ax)) / d;

    return { x: ux, y: uy };
  },

  /**
   * Normiert einen Vektor
   */
  _normalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (len < 0.0001) return { x: 1, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  /**
   * Prüft Drehrichtung
   */
  _isClockwise(points, startIdx, endIdx, center) {
    let sum = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      sum += (p2.x - center.x) * (p1.y - center.y) - (p1.x - center.x) * (p2.y - center.y);
    }
    return sum > 0;
  },

  /**
   * Berechnet Tangenten für eine Polyline
   */
  _computeTangents(points) {
    const result = [];

    for (let i = 0; i < points.length; i++) {
      let tx, ty;

      if (i === 0) {
        // Erste Tangente: Richtung zum nächsten Punkt
        tx = points[1].x - points[0].x;
        ty = points[1].y - points[0].y;
      } else if (i === points.length - 1) {
        // Letzte Tangente: Richtung vom vorherigen Punkt
        tx = points[i].x - points[i - 1].x;
        ty = points[i].y - points[i - 1].y;
      } else {
        // Mittlere Tangente: Durchschnitt
        tx = (points[i + 1].x - points[i - 1].x) / 2;
        ty = (points[i + 1].y - points[i - 1].y) / 2;
      }

      const len = Math.hypot(tx, ty);
      if (len > 0.0001) {
        tx /= len;
        ty /= len;
      }

      result.push({
        x: points[i].x,
        y: points[i].y,
        tx: tx,
        ty: ty
      });
    }

    return result;
  },

  /**
   * Berechnet optimales Biarc-Verhältnis
   */
  _computeBiarcRatio(alpha0, alpha1) {
    const sin0 = Math.sin(alpha0);
    const sin1 = Math.sin(alpha1);

    if (Math.abs(sin0) < 0.001 || Math.abs(sin1) < 0.001) {
      return 0.5; // Fallback
    }

    // Verhältnis basierend auf Winkeln
    const r = sin1 / (sin0 + sin1);

    return Math.max(0.1, Math.min(0.9, r));
  },

  /**
   * Berechnet einen Bogen von start zu end mit gegebener Start-Tangente
   */
  _computeArc(start, end, tangent) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const d = Math.hypot(dx, dy);

    if (d < this.TOLERANCES.COLLINEAR) return null;

    // Senkrechte zur Tangente durch Startpunkt
    const perpStart = { x: -tangent.y, y: tangent.x };

    // Mittelsenkrechte der Verbindung
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const perpMid = { x: -dy, y: dx };

    // Schnittpunkt = Kreismittelpunkt
    const center = this._lineIntersection(
      start, { x: start.x + perpStart.x, y: start.y + perpStart.y },
      { x: midX, y: midY }, { x: midX + perpMid.x, y: midY + perpMid.y }
    );

    if (!center) return null;

    const radius = Math.hypot(start.x - center.x, start.y - center.y);

    if (radius < this.TOLERANCES.MIN_ARC_RADIUS ||
        radius > this.TOLERANCES.MAX_ARC_RADIUS) {
      return null;
    }

    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

    // Richtung aus Tangente bestimmen
    const cross = tangent.x * (end.y - start.y) - tangent.y * (end.x - start.x);
    const clockwise = cross < 0;

    return {
      type: 'arc',
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      center,
      radius,
      startAngle,
      endAngle,
      clockwise
    };
  },

  /**
   * Linien-Schnittpunkt
   */
  _lineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  },

  /**
   * Tangente am Verbindungspunkt berechnen
   */
  _computeTangentAtJoint(arc, joint) {
    if (!arc || !arc.center) {
      return { x: 1, y: 0 };
    }

    const dx = joint.x - arc.center.x;
    const dy = joint.y - arc.center.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.0001) return { x: 1, y: 0 };

    // Senkrecht zum Radius
    if (arc.clockwise) {
      return { x: dy / len, y: -dx / len };
    } else {
      return { x: -dy / len, y: dx / len };
    }
  },

  /**
   * Einzelbogen oder Linie wenn Biarc nicht möglich
   */
  _singleArcOrLine(p0, p1, tangent, tolerance) {
    const arc = this._computeArc(p0, p1, tangent);

    if (arc && arc.radius > this.TOLERANCES.MIN_ARC_RADIUS) {
      return [arc];
    }

    // Fallback: Linie
    return [{
      type: 'line',
      start: { x: p0.x, y: p0.y },
      end: { x: p1.x, y: p1.y }
    }];
  },

  /**
   * Minimale Distanz eines Punktes zu einer Liste von Bögen/Linien
   */
  _minDistanceToArcs(point, segments) {
    let minDist = Infinity;

    for (const seg of segments) {
      let dist;
      if (seg.type === 'line') {
        dist = this._pointToSegmentDistance(point, seg.start, seg.end);
      } else {
        dist = this._pointToArcDistance(point, seg);
      }
      if (dist < minDist) minDist = dist;
    }

    return minDist;
  },

  /**
   * Punkt-zu-Segment Distanz
   */
  _pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },

  /**
   * Punkt-zu-Bogen Distanz
   */
  _pointToArcDistance(point, arc) {
    if (!arc.center) return Infinity;

    const dist = Math.hypot(point.x - arc.center.x, point.y - arc.center.y);
    const radialDist = Math.abs(dist - arc.radius);

    // Prüfe ob Punkt im Winkelbereich des Bogens liegt
    const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);

    if (this._angleInRange(angle, arc.startAngle, arc.endAngle, arc.clockwise)) {
      return radialDist;
    } else {
      // Abstand zum nächsten Endpunkt
      const d1 = Math.hypot(point.x - arc.start.x, point.y - arc.start.y);
      const d2 = Math.hypot(point.x - arc.end.x, point.y - arc.end.y);
      return Math.min(d1, d2);
    }
  },

  /**
   * Prüft ob Winkel im Bogen-Bereich liegt
   */
  _angleInRange(angle, start, end, clockwise) {
    const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    const a = norm(angle);
    let s = norm(start);
    let e = norm(end);

    if (clockwise) {
      [s, e] = [e, s];
    }

    if (s <= e) {
      return a >= s && a <= e;
    } else {
      return a >= s || a <= e;
    }
  }
};

// ============================================================
// ArcFittingUtils - Hilfsfunktionen für Konvertierung
// ============================================================

const ArcFittingUtils = {

  /**
   * Konvertiert Arc-Fitting-Ergebnis zurück zu Punkten (für Rendering)
   */
  toPolyline(arcSegments, pointsPerArc = 16) {
    if (!arcSegments || arcSegments.length === 0) return [];

    const points = [];

    for (const seg of arcSegments) {
      if (seg.type === 'line') {
        if (points.length === 0) {
          points.push({ x: seg.start.x, y: seg.start.y });
        }
        points.push({ x: seg.end.x, y: seg.end.y });
      } else {
        // Bogen zu Punkten
        const arcPoints = this._arcToPoints(seg, pointsPerArc);

        if (points.length === 0) {
          points.push(...arcPoints);
        } else {
          points.push(...arcPoints.slice(1)); // Ersten Punkt überspringen
        }
      }
    }

    return points;
  },

  /**
   * Konvertiert einen Bogen zu Punkten
   */
  _arcToPoints(arc, numPoints) {
    if (!arc.center) return [arc.start, arc.end];

    const points = [];
    let startAngle = arc.startAngle;
    let endAngle = arc.endAngle;

    // Winkelspanne berechnen
    let span;
    if (arc.clockwise) {
      span = startAngle - endAngle;
      if (span < 0) span += 2 * Math.PI;
    } else {
      span = endAngle - startAngle;
      if (span < 0) span += 2 * Math.PI;
    }

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      let angle;

      if (arc.clockwise) {
        angle = startAngle - t * span;
      } else {
        angle = startAngle + t * span;
      }

      points.push({
        x: arc.center.x + arc.radius * Math.cos(angle),
        y: arc.center.y + arc.radius * Math.sin(angle)
      });
    }

    return points;
  },

  /**
   * Konvertiert zu G-Code-Segmenten
   */
  toGCodeSegments(arcSegments) {
    if (!arcSegments) return [];

    return arcSegments.map(seg => {
      if (seg.type === 'line') {
        return {
          command: 'G01',
          x: seg.end.x,
          y: seg.end.y
        };
      } else {
        return {
          command: seg.clockwise ? 'G02' : 'G03',
          x: seg.end.x,
          y: seg.end.y,
          i: seg.center.x - seg.start.x,
          j: seg.center.y - seg.start.y,
          r: seg.radius
        };
      }
    });
  },

  /**
   * Berechnet Statistiken für Arc-Fitting Ergebnis
   */
  getStats(arcSegments, originalPoints) {
    if (!arcSegments || arcSegments.length === 0) {
      return { arcs: 0, lines: 0, compressionRatio: 1, totalLength: 0 };
    }

    const arcs = arcSegments.filter(s => s.type === 'arc').length;
    const lines = arcSegments.filter(s => s.type === 'line').length;
    const compressionRatio = originalPoints ? (originalPoints / arcSegments.length) : 1;

    let totalLength = 0;
    for (const seg of arcSegments) {
      if (seg.type === 'line') {
        totalLength += Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
      } else if (seg.radius) {
        // Bogenlänge approximieren
        let span = Math.abs(seg.endAngle - seg.startAngle);
        if (span > Math.PI) span = 2 * Math.PI - span;
        totalLength += span * seg.radius;
      }
    }

    return {
      arcs,
      lines,
      total: arcs + lines,
      compressionRatio: compressionRatio.toFixed(1) + 'x',
      totalLength: totalLength.toFixed(2)
    };
  }
};

// Export für Node.js (falls verwendet)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ArcFitting, ArcFittingUtils };
}

console.log('[ARC-FITTING V3.0] Module loaded');
