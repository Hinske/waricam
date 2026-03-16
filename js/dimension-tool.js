/**
 * CeraCUT Dimension Tool V2.3
 * AutoCAD-style dimensioning: Linear, Aligned, Angular, Radius, Diameter
 * 
 * V2.3: Fix Diameter-Linie, Angular komplett neu (arc ohne scale-Hack),
 *       _findLineAtPoint robuste Toleranz, Angular Live-Preview
 * V2.2: DIMSCALE global scaling
 * V2.1: Fix 0.00-Bug (auto-flip axis), AutoCAD visual style, grip editing
 * V2.0: Select Object mode, debug logging
 * 
 * Build: 20260217-dim23
 */

class DimensionManager {

    static LAYER_NAME = 'Bemaßung';
    static LAYER_COLOR = '#00ffff';

    // AutoCAD DIMSTYLE Variablen (alle in mm Weltkoordinaten)
    static STYLE = {
        DIMASZ: 2.5,          // Pfeilgröße
        DIMTXT: 3.5,          // Texthöhe
        DIMGAP: 1.0,          // Lücke zwischen Maßlinie und Text
        DIMEXO: 0.625,        // Hilfslinie Offset vom Ursprung
        DIMEXE: 1.25,         // Hilfslinie Überstand über Maßlinie
        lineColor: '#00ffff',
        textColor: '#00ffff', // AutoCAD: Text = Dim-Farbe
        precision: 2,
        minTextScreenPx: 10,
        maxTextScreenPx: 20,
        font: "'Arial Narrow', 'Segoe UI', sans-serif"
    };

    constructor(app) {
        this.app = app;
        this.dimensions = [];
        this.activeTool = null;
        this.phase = 0;
        this.p1 = null;
        this.p2 = null;
        this.previewPos = null;
        this.targetContour = null;
        this.selectObjectMode = false;
        // Grip editing
        this.selectedDim = null;
        this.dragGrip = null;
        this._nextId = 1;

        // DIMSCALE: Globaler Skalierungsfaktor (wie AutoCAD)
        // Multipliziert DIMTXT, DIMASZ, DIMEXO, DIMEXE, DIMGAP
        this.dimScale = 1.0;

        this._ensureLayer();
        console.debug('[DimensionManager V2.3] ✅ Initialisiert (DIMSCALE=' + this.dimScale + ')');
    }

    /** Skalierte DIMSTYLE-Werte (alle mm-Werte × dimScale) */
    _S() {
        const base = DimensionManager.STYLE;
        const ds = this.dimScale;
        return {
            DIMASZ:  base.DIMASZ * ds,
            DIMTXT:  base.DIMTXT * ds,
            DIMGAP:  base.DIMGAP * ds,
            DIMEXO:  base.DIMEXO * ds,
            DIMEXE:  base.DIMEXE * ds,
            lineColor: base.lineColor,
            textColor: base.textColor,
            precision: base.precision,
            minTextScreenPx: base.minTextScreenPx,
            maxTextScreenPx: base.maxTextScreenPx * ds,  // Screen-Clamp auch skalieren
            font: base.font
        };
    }

    /** DIMSCALE setzen (wie AutoCAD DIMSCALE Variable) */
    setDimScale(val) {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) {
            this.app.commandLine?.log('DIMSCALE muss > 0 sein', 'warning');
            return;
        }
        this.dimScale = num;
        this.app.commandLine?.log('DIMSCALE = ' + num.toFixed(2), 'success');
        console.log('[DIM] DIMSCALE gesetzt: ' + num);
        this.app.renderer?.render();
    }

    _ensureLayer() {
        const lm = this.app?.layerManager;
        if (lm && !lm.getLayer(DimensionManager.LAYER_NAME)) {
            lm.addLayer(DimensionManager.LAYER_NAME, {
                color: DimensionManager.LAYER_COLOR,
                visible: true, locked: false, lineType: 'Continuous'
            });
            console.debug(`[DimensionManager] Layer "${DimensionManager.LAYER_NAME}" angelegt (Cyan)`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TOOL START / CANCEL
    // ═══════════════════════════════════════════════════════════════

    startTool(type) {
        this._ensureLayer();
        this.activeTool = type;
        this.phase = 0;
        this.p1 = null;
        this.p2 = null;
        this.previewPos = null;
        this.targetContour = null;
        this.selectObjectMode = false;
        const prompts = {
            'linear':   'DIMLINEAR — Ersten Ursprungspunkt angeben oder <Objekt wählen>:',
            'aligned':  'DIMALIGNED — Ersten Ursprungspunkt angeben oder <Objekt wählen>:',
            'angular':  'DIMANGULAR — Erste Linie auswählen:',
            'radius':   'DIMRADIUS — Bogen/Kreis auswählen:',
            'diameter': 'DIMDIAMETER — Bogen/Kreis auswählen:'
        };
        this.app.commandLine?.setPrompt(prompts[type] || 'Bemaßung:');
        this.app.commandLine?.log('📐 ' + type.charAt(0).toUpperCase() + type.slice(1) + '-Bemaßung', 'info');
        console.log(`[DimensionManager] startTool: ${type}`);
        if (this.app.renderer) this.app.renderer.canvas.style.cursor = 'crosshair';
    }

    cancelTool() {
        this.activeTool = null;
        this.phase = 0;
        this.p1 = null;
        this.p2 = null;
        this.previewPos = null;
        this.targetContour = null;
        this.selectObjectMode = false;
        if (this.app.renderer) this.app.renderer.canvas.style.cursor = 'default';
        this.app.commandLine?.setPrompt('Befehl:');
        this.app.renderer?.render();
        console.log('[DimensionManager] Tool abgebrochen');
    }

    isActive() { return !!this.activeTool; }

    // ═══════════════════════════════════════════════════════════════
    // CLICK HANDLER
    // ═══════════════════════════════════════════════════════════════

    handleClick(worldPos) {
        if (!this.activeTool) return false;
        const pt = this.app.currentSnapPoint || worldPos;
        console.log(`[DIM] handleClick phase=${this.phase}, pt=(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}), snap=${!!this.app.currentSnapPoint}`);

        switch (this.activeTool) {
            case 'linear':
            case 'aligned':
                return this._handleLinearClick(pt);
            case 'radius':
            case 'diameter':
                return this._handleRadiusClick(pt);
            case 'angular':
                return this._handleAngularClick(pt);
        }
        return false;
    }

    handleEnter() {
        if (!this.activeTool) return false;
        if ((this.activeTool === 'linear' || this.activeTool === 'aligned') && this.phase === 0) {
            this.selectObjectMode = true;
            this.app.commandLine?.setPrompt('Objekt zum Bemaßen auswählen:');
            this.app.commandLine?.log('Liniensegment anklicken', 'info');
            return true;
        }
        return false;
    }

    _handleLinearClick(pt) {
        if (this.selectObjectMode) {
            const line = this._findLineAtPoint(pt);
            if (!line) { this.app.commandLine?.log('Kein Liniensegment gefunden', 'warning'); return true; }
            this.p1 = line.start;
            this.p2 = line.end;
            this.phase = 2;
            this.selectObjectMode = false;
            console.log(`[DIM] SelectObject: p1=(${this.p1.x.toFixed(2)}, ${this.p1.y.toFixed(2)}), p2=(${this.p2.x.toFixed(2)}, ${this.p2.y.toFixed(2)}), dist=${Math.hypot(this.p2.x-this.p1.x, this.p2.y-this.p1.y).toFixed(3)}`);
            this.app.commandLine?.setPrompt('Maßlinien-Position angeben:');
            return true;
        }

        if (this.phase === 0) {
            this.p1 = { x: pt.x, y: pt.y };
            this.phase = 1;
            console.log(`[DIM] p1 set: (${this.p1.x.toFixed(2)}, ${this.p1.y.toFixed(2)})`);
            this.app.commandLine?.setPrompt('Zweiten Ursprungspunkt angeben:');
            return true;
        }
        if (this.phase === 1) {
            this.p2 = { x: pt.x, y: pt.y };
            const dist = Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
            console.log(`[DIM] p2 set: (${this.p2.x.toFixed(2)}, ${this.p2.y.toFixed(2)}), dist=${dist.toFixed(3)}`);
            if (dist < 0.001) {
                this.app.commandLine?.log('⚠ Punkte identisch! Anderen Endpunkt wählen.', 'warning');
                this.p2 = null;
                return true;
            }
            this.phase = 2;
            this.app.commandLine?.setPrompt('Maßlinien-Position angeben:');
            return true;
        }
        if (this.phase === 2) {
            this._createLinearDimension(this.p1, this.p2, pt, this.activeTool);
            this.phase = 0;
            this.p1 = null;
            this.p2 = null;
            this.selectObjectMode = false;
            this.app.commandLine?.setPrompt('Ersten Ursprungspunkt angeben oder <Objekt wählen>:');
            return true;
        }
        return false;
    }

    _handleRadiusClick(pt) {
        if (this.phase === 0) {
            const circle = this._findCircleAtPoint(pt);
            if (!circle) { this.app.commandLine?.log('Kein Kreis/Bogen gefunden', 'warning'); return true; }
            this.targetContour = circle;
            this.phase = 1;
            this.app.commandLine?.setPrompt('Maßlinien-Position:');
            return true;
        }
        if (this.phase === 1) {
            this._createRadiusDimension(this.targetContour, pt, this.activeTool);
            this.phase = 0;
            this.targetContour = null;
            this.app.commandLine?.setPrompt('Bogen/Kreis auswählen (ESC=Ende):');
            return true;
        }
        return false;
    }

    _handleAngularClick(pt) {
        if (this.phase === 0) {
            const line = this._findLineAtPoint(pt);
            if (!line) { this.app.commandLine?.log('Linie auswählen', 'warning'); return true; }
            this.p1 = line;
            this.phase = 1;
            this.app.commandLine?.setPrompt('Zweite Linie auswählen:');
            return true;
        }
        if (this.phase === 1) {
            const line = this._findLineAtPoint(pt);
            if (!line) { this.app.commandLine?.log('Zweite Linie auswählen', 'warning'); return true; }
            this.p2 = line;
            this.phase = 2;
            this.app.commandLine?.setPrompt('Bogen-Position angeben:');
            return true;
        }
        if (this.phase === 2) {
            this._createAngularDimension(this.p1, this.p2, pt);
            this.phase = 0;
            this.p1 = null;
            this.p2 = null;
            this.app.commandLine?.setPrompt('Erste Linie auswählen (ESC=Ende):');
            return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════════
    // DIMENSION CREATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * V2.1 FIX: Achsen-Auto-Korrektur
     * Problem: Punkte vertikal übereinander → dy > dx → "horizontal messen" → 0.00
     * Lösung: Wenn Ergebnis ≈ 0 aber echte Distanz > 0 → Achse flippen
     */
    _createLinearDimension(p1, p2, dimPos, type) {
        let value, dimAngle;

        if (type === 'linear') {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const dx = Math.abs(dimPos.x - midX);
            const dy = Math.abs(dimPos.y - midY);

            if (dy >= dx) {
                // Maus ist oben/unten von der Mitte → horizontale Bemaßung
                value = Math.abs(p2.x - p1.x);
                dimAngle = 0;
            } else {
                // Maus ist links/rechts → vertikale Bemaßung
                value = Math.abs(p2.y - p1.y);
                dimAngle = 90;
            }

            // V2.1: Auto-Korrektur wenn Wert ≈ 0 aber Punkte nicht identisch
            const realDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (value < 0.001 && realDist > 0.001) {
                console.log(`[DIM] Auto-Achsen-Flip: ${dimAngle}° → ${dimAngle === 0 ? 90 : 0}° (Wert war 0)`);
                if (dimAngle === 0) {
                    value = Math.abs(p2.y - p1.y);
                    dimAngle = 90;
                } else {
                    value = Math.abs(p2.x - p1.x);
                    dimAngle = 0;
                }
            }
        } else {
            // Aligned: immer echte Distanz
            value = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            dimAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        }

        const dim = {
            id: 'dim_' + (this._nextId++),
            type: type,
            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            dimLinePos: { x: dimPos.x, y: dimPos.y },
            dimAngle: dimAngle,
            value: value,
            textOverride: null,
            layer: DimensionManager.LAYER_NAME
        };

        this._addDimension(dim);
        console.log(`[DimensionManager] ${type}: ${value.toFixed(2)} mm (angle=${dimAngle}°)`);
    }

    _createRadiusDimension(circleInfo, dimPos, type) {
        const { center, radius } = circleInfo;
        const value = (type === 'diameter') ? radius * 2 : radius;
        const prefix = (type === 'diameter') ? 'Ø' : 'R';
        const dim = {
            id: 'dim_' + (this._nextId++),
            type: type,
            center: { x: center.x, y: center.y },
            radius: radius,
            dimLinePos: { x: dimPos.x, y: dimPos.y },
            value: value,
            prefix: prefix,
            textOverride: null,
            layer: DimensionManager.LAYER_NAME
        };
        this._addDimension(dim);
        console.log(`[DimensionManager] ${type}: ${prefix}${value.toFixed(2)} mm`);
    }

    _createAngularDimension(line1, line2, dimPos) {
        const inter = this._lineLineIntersection(line1.start, line1.end, line2.start, line2.end);
        if (!inter) { this.app.showToast('Linien sind parallel', 'warning'); return; }
        console.log(`[DIM-ANG] Schnittpunkt: (${inter.x.toFixed(2)}, ${inter.y.toFixed(2)})`);

        // V2.3: Winkelrichtung von Schnittpunkt ZU den Linienendpunkten
        // Wähle den Endpunkt jeder Linie, der WEITER vom Schnittpunkt entfernt ist
        const d1s = Math.hypot(line1.start.x - inter.x, line1.start.y - inter.y);
        const d1e = Math.hypot(line1.end.x - inter.x, line1.end.y - inter.y);
        const far1 = d1e >= d1s ? line1.end : line1.start;
        const d2s = Math.hypot(line2.start.x - inter.x, line2.start.y - inter.y);
        const d2e = Math.hypot(line2.end.x - inter.x, line2.end.y - inter.y);
        const far2 = d2e >= d2s ? line2.end : line2.start;

        // Strahlen-Winkel vom Schnittpunkt
        let a1 = Math.atan2(far1.y - inter.y, far1.x - inter.x);
        let a2 = Math.atan2(far2.y - inter.y, far2.x - inter.x);
        // Klick-Winkel bestimmt welcher der 4 Sektoren gemeint ist
        const clickAngle = Math.atan2(dimPos.y - inter.y, dimPos.x - inter.x);

        console.log(`[DIM-ANG] a1=${(a1*180/Math.PI).toFixed(1)}°, a2=${(a2*180/Math.PI).toFixed(1)}°, click=${(clickAngle*180/Math.PI).toFixed(1)}°`);

        // Normalisiere alle Winkel zu [0, 2π)
        const TWO_PI = Math.PI * 2;
        a1 = ((a1 % TWO_PI) + TWO_PI) % TWO_PI;
        a2 = ((a2 % TWO_PI) + TWO_PI) % TWO_PI;
        const ca = ((clickAngle % TWO_PI) + TWO_PI) % TWO_PI;

        // Bestimme ob der Klick im Bogen von a1→a2 (CCW) oder a2→a1 (CCW) liegt
        let sa, ea, sweep;
        // Test: liegt clickAngle im CCW-Bogen von a1 nach a2?
        let sweep12 = ((a2 - a1) % TWO_PI + TWO_PI) % TWO_PI;
        let clickInSweep12 = ((ca - a1) % TWO_PI + TWO_PI) % TWO_PI;
        if (clickInSweep12 <= sweep12) {
            sa = a1; ea = a2; sweep = sweep12;
        } else {
            sa = a2; ea = a1; sweep = TWO_PI - sweep12;
        }

        // Wenn Sweep > 180°, prüfe ob die Gegenrichtung der Strahlen besser passt
        if (sweep > Math.PI) {
            // Verwende die entgegengesetzten Strahlen
            const oa1 = (a1 + Math.PI) % TWO_PI;
            const oa2 = (a2 + Math.PI) % TWO_PI;
            // Alle 4 Kombinationen prüfen, nehme die mit kleinstem Sweep die den Klick enthält
            const candidates = [
                [a1, a2], [a1, oa2], [oa1, a2], [oa1, oa2]
            ];
            let bestSweep = sweep;
            for (const [ca1, ca2] of candidates) {
                let sw = ((ca2 - ca1) % TWO_PI + TWO_PI) % TWO_PI;
                let ci = ((ca - ca1) % TWO_PI + TWO_PI) % TWO_PI;
                if (ci <= sw && sw < bestSweep) {
                    sa = ca1; ea = ca2; bestSweep = sw;
                }
                // Auch umgekehrt
                sw = ((ca1 - ca2) % TWO_PI + TWO_PI) % TWO_PI;
                ci = ((ca - ca2) % TWO_PI + TWO_PI) % TWO_PI;
                if (ci <= sw && sw < bestSweep) {
                    sa = ca2; ea = ca1; bestSweep = sw;
                }
            }
            sweep = bestSweep;
        }

        const angleDeg = sweep * 180 / Math.PI;
        console.log(`[DIM-ANG] Ergebnis: sa=${(sa*180/Math.PI).toFixed(1)}°, ea=${(ea*180/Math.PI).toFixed(1)}°, sweep=${angleDeg.toFixed(1)}°`);

        const dim = {
            id: 'dim_' + (this._nextId++),
            type: 'angular',
            center: { x: inter.x, y: inter.y },
            startAngle: sa, endAngle: ea,
            dimLinePos: { x: dimPos.x, y: dimPos.y },
            value: angleDeg,
            textOverride: null,
            layer: DimensionManager.LAYER_NAME
        };
        this._addDimension(dim);
        console.log(`[DimensionManager] angular: ${angleDeg.toFixed(1)}°`);
    }

    _addDimension(dim) {
        const mgr = this;
        const cmd = new FunctionCommand(
            `Bemaßung: ${dim.type} ${dim.value.toFixed(2)}`,
            () => { mgr.dimensions.push(dim); mgr.app.renderer?.render(); },
            () => { const i = mgr.dimensions.indexOf(dim); if (i >= 0) mgr.dimensions.splice(i, 1); mgr.app.renderer?.render(); }
        );
        this.app.undoManager?.execute(cmd);
    }

    // ═══════════════════════════════════════════════════════════════
    // GEOMETRY HELPERS
    // ═══════════════════════════════════════════════════════════════

    _findCircleAtPoint(pt) {
        const tol = 10 / (this.app.renderer?.scale || 1);
        for (const c of this.app.contours) {
            if (!c.points || c.points.length < 3) continue;
            if (c.isCircle || (c.isClosed && c.points.length >= 8)) {
                let cx = 0, cy = 0;
                const pts = c.points.slice(0, -1);
                for (const p of pts) { cx += p.x; cy += p.y; }
                cx /= pts.length; cy /= pts.length;
                let rSum = 0;
                for (const p of pts) rSum += Math.hypot(p.x - cx, p.y - cy);
                const r = rSum / pts.length;
                if (Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - r) < tol)
                    return { center: { x: cx, y: cy }, radius: r, contour: c };
            }
            for (let i = 0; i < c.points.length - 1; i++) {
                const seg = c.points[i];
                if (seg.bulge && Math.abs(seg.bulge) > 0.01) {
                    const next = c.points[i + 1];
                    const arc = this._bulgeToArc(seg, next, seg.bulge);
                    if (arc && Math.abs(Math.hypot(pt.x - arc.cx, pt.y - arc.cy) - arc.r) < tol)
                        return { center: { x: arc.cx, y: arc.cy }, radius: arc.r, contour: c };
                }
            }
        }
        return null;
    }

    _findLineAtPoint(pt) {
        // V2.3: Robustere Toleranz — Minimum 5 Pixel, skaliert mit Zoom
        const scale = this.app.renderer?.scale || 1;
        const tol = Math.max(5, 12) / scale;  // mind. 5px, Standard 12px
        let bestDist = Infinity, bestLine = null;
        console.log(`[DIM] _findLineAtPoint pt=(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}), tol=${tol.toFixed(2)}, scale=${scale.toFixed(3)}`);
        for (const c of this.app.contours) {
            if (!c.points) continue;
            for (let i = 0; i < c.points.length - 1; i++) {
                const a = c.points[i], b = c.points[i + 1];
                // Bogensegmente überspringen
                if (a.bulge && Math.abs(a.bulge) > 0.01) continue;
                // Zu kurze Segmente überspringen (< 0.1mm)
                const segLen = Math.hypot(b.x - a.x, b.y - a.y);
                if (segLen < 0.1) continue;
                const d = this._ptSegDist(pt, a, b);
                if (d < tol && d < bestDist) {
                    bestDist = d;
                    bestLine = { start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y } };
                }
            }
        }
        if (bestLine) {
            console.log(`[DIM] Linie gefunden: (${bestLine.start.x.toFixed(1)},${bestLine.start.y.toFixed(1)})→(${bestLine.end.x.toFixed(1)},${bestLine.end.y.toFixed(1)}), dist=${bestDist.toFixed(2)}`);
        } else {
            console.log('[DIM] Keine Linie gefunden bei Toleranz=' + tol.toFixed(2));
        }
        return bestLine;
    }

    _ptSegDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y);
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    _lineLineIntersection(a1, a2, b1, b2) {
        const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
        const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
        const cross = d1x * d2y - d1y * d2x;
        if (Math.abs(cross) < 1e-10) return null;
        const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
        return { x: a1.x + t * d1x, y: a1.y + t * d1y };
    }

    _bulgeToArc(p1, p2, bulge) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y, d = Math.hypot(dx, dy);
        if (d < 1e-10) return null;
        const s = d / 2, h = s * bulge, r = (s * s + h * h) / (2 * Math.abs(h));
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const nx = -dy / d, ny = dx / d;
        const dist = r - Math.abs(h), sign = bulge > 0 ? 1 : -1;
        return { cx: mx + nx * dist * sign, cy: my + ny * dist * sign, r };
    }

    // ═══════════════════════════════════════════════════════════════
    // MOUSE MOVE
    // ═══════════════════════════════════════════════════════════════

    handleMouseMove(worldPos) {
        if (!this.activeTool) return;
        this.previewPos = worldPos;
        this.app.renderer?.render();
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDERING — AutoCAD Style V2.1
    // ═══════════════════════════════════════════════════════════════

    drawAll(ctx, scale) {
        const lm = this.app?.layerManager;
        if (lm && !lm.isVisible(DimensionManager.LAYER_NAME)) return;
        const S = this._S();  // V2.2: skalierte Werte

        for (const dim of this.dimensions) {
            switch (dim.type) {
                case 'linear': case 'aligned':
                    this._renderLinear(ctx, dim, scale, S); break;
                case 'radius': case 'diameter':
                    this._renderRadius(ctx, dim, scale, S); break;
                case 'angular':
                    this._renderAngular(ctx, dim, scale, S); break;
            }
        }

        // Live-Preview (halbtransparent)
        if (this.activeTool && this.previewPos) {
            ctx.globalAlpha = 0.5;
            this._drawPreview(ctx, scale, S);
            ctx.globalAlpha = 1.0;
        }
    }

    // ── Berechne Maßlinien-Geometrie ──────────────────────────────

    _calcLinearGeometry(dim) {
        const { p1, p2, dimLinePos, dimAngle, type } = dim;
        let dl1, dl2;

        if (type === 'linear') {
            if (Math.abs(dimAngle) < 1) {
                // Horizontal
                dl1 = { x: p1.x, y: dimLinePos.y };
                dl2 = { x: p2.x, y: dimLinePos.y };
            } else {
                // Vertikal
                dl1 = { x: dimLinePos.x, y: p1.y };
                dl2 = { x: dimLinePos.x, y: p2.y };
            }
        } else {
            // Aligned
            const angleRad = dimAngle * Math.PI / 180;
            const perpRad = angleRad + Math.PI / 2;
            const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
            const nx = Math.cos(perpRad), ny = Math.sin(perpRad);
            const dot = (dimLinePos.x - midX) * nx + (dimLinePos.y - midY) * ny;
            dl1 = { x: p1.x + nx * dot, y: p1.y + ny * dot };
            dl2 = { x: p2.x + nx * dot, y: p2.y + ny * dot };
        }
        return { dl1, dl2 };
    }

    // ── LINEAR / ALIGNED Rendering ────────────────────────────────

    _renderLinear(ctx, dim, scale, S) {
        const { p1, p2, value } = dim;
        const { dl1, dl2 } = this._calcLinearGeometry(dim);
        const dimLen = Math.hypot(dl2.x - dl1.x, dl2.y - dl1.y);
        const textStr = (dim.textOverride != null) ? dim.textOverride : value.toFixed(S.precision);
        const lw = 1.0 / scale;
        const textH = this._textHeight(scale, S);
        const angleRad = Math.atan2(dl2.y - dl1.y, dl2.x - dl1.x);
        const dirX = Math.cos(angleRad), dirY = Math.sin(angleRad);
        const mid = { x: (dl1.x + dl2.x) / 2, y: (dl1.y + dl2.y) / 2 };

        // ── 1. Hilfslinien (Extension Lines) ──
        ctx.strokeStyle = S.lineColor;
        ctx.lineWidth = lw * 0.5;
        ctx.beginPath();
        this._extLine(ctx, p1, dl1, S);
        this._extLine(ctx, p2, dl2, S);
        ctx.stroke();

        // ── 2. Maßlinie MIT Textlücke ──
        ctx.lineWidth = lw * 0.6;
        ctx.strokeStyle = S.lineColor;

        // Textbreite in Weltkoordinaten messen
        ctx.save();
        ctx.font = `${textH}px ${S.font}`;
        const textW = ctx.measureText(textStr).width;
        ctx.restore();
        const gapHalf = (textW / 2) + S.DIMGAP;

        ctx.beginPath();
        if (dimLen > gapHalf * 2 + S.DIMASZ * 2) {
            // Normale Darstellung: Maßlinie mit Lücke für Text
            ctx.moveTo(dl1.x, dl1.y);
            ctx.lineTo(mid.x - dirX * gapHalf, mid.y - dirY * gapHalf);
            ctx.moveTo(mid.x + dirX * gapHalf, mid.y + dirY * gapHalf);
            ctx.lineTo(dl2.x, dl2.y);
        } else {
            // Zu eng: durchgehende Linie
            ctx.moveTo(dl1.x, dl1.y);
            ctx.lineTo(dl2.x, dl2.y);
        }
        ctx.stroke();

        // ── 3. Pfeilspitzen (gefüllt, geschlossen) ──
        this._arrow(ctx, dl1, dl2, S.DIMASZ, S.lineColor);
        this._arrow(ctx, dl2, dl1, S.DIMASZ, S.lineColor);

        // ── 4. Text (über der Maßlinie, kein Hintergrund) ──
        // Text-Position: leicht über der Maßlinie
        const offsetDist = textH * 0.15;
        const perpX = -dirY, perpY = dirX;  // Senkrecht zur Maßlinie
        const textPos = {
            x: mid.x + perpX * offsetDist,
            y: mid.y + perpY * offsetDist
        };
        this._dimText(ctx, textStr, textPos, dim.dimAngle || 0, scale, S);
    }

    _extLine(ctx, origin, dimPt, S) {
        const dx = dimPt.x - origin.x, dy = dimPt.y - origin.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) return;
        const nx = dx / len, ny = dy / len;
        ctx.moveTo(origin.x + nx * S.DIMEXO, origin.y + ny * S.DIMEXO);
        ctx.lineTo(dimPt.x + nx * S.DIMEXE, dimPt.y + ny * S.DIMEXE);
    }

    // ── RADIUS / DIAMETER Rendering ───────────────────────────────

    _renderRadius(ctx, dim, scale, S) {
        const { center, radius, dimLinePos, value, prefix, type } = dim;
        const dx = dimLinePos.x - center.x, dy = dimLinePos.y - center.y;
        const dist = Math.hypot(dx, dy);
        const nx = dist > 0.001 ? dx / dist : 1, ny = dist > 0.001 ? dy / dist : 0;
        const edgePt = { x: center.x + nx * radius, y: center.y + ny * radius };
        const angle = Math.atan2(ny, nx) * 180 / Math.PI;
        const textStr = (dim.textOverride != null) ? dim.textOverride : `${prefix}${value.toFixed(S.precision)}`;
        const lw = 1.0 / scale;

        ctx.strokeStyle = S.lineColor;
        ctx.lineWidth = lw * 0.6;

        // V2.2-fix: Linie ERST zeichnen, DANN Pfeile (weil _arrow beginPath aufruft)
        if (type === 'diameter') {
            const startPt = { x: center.x - nx * radius, y: center.y - ny * radius };
            // Diameter-Linie zeichnen
            ctx.beginPath();
            ctx.moveTo(startPt.x, startPt.y);
            ctx.lineTo(edgePt.x, edgePt.y);
            if (dist > radius + 0.1) ctx.lineTo(dimLinePos.x, dimLinePos.y);
            ctx.stroke();
            // Pfeile an beiden Enden
            this._arrow(ctx, startPt, center, S.DIMASZ, S.lineColor);
            this._arrow(ctx, edgePt, center, S.DIMASZ, S.lineColor);
        } else {
            // Radius: Linie von Mitte zum Rand
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(edgePt.x, edgePt.y);
            if (dist > radius + 0.1) ctx.lineTo(dimLinePos.x, dimLinePos.y);
            ctx.stroke();
            this._arrow(ctx, edgePt, center, S.DIMASZ, S.lineColor);
        }

        // Center mark
        const cm = 1.5;
        ctx.lineWidth = lw * 0.5;
        ctx.beginPath();
        ctx.moveTo(center.x - cm, center.y); ctx.lineTo(center.x + cm, center.y);
        ctx.moveTo(center.x, center.y - cm); ctx.lineTo(center.x, center.y + cm);
        ctx.stroke();

        const textPos = dist > radius ? dimLinePos : { x: (center.x + edgePt.x) / 2, y: (center.y + edgePt.y) / 2 };
        this._dimText(ctx, textStr, textPos, angle, scale, S);
    }

    // ── ANGULAR Rendering ─────────────────────────────────────────

    _renderAngular(ctx, dim, scale, S) {
        const { center, startAngle, endAngle, dimLinePos, value } = dim;
        const arcR = Math.hypot(dimLinePos.x - center.x, dimLinePos.y - center.y);
        const lw = 1.0 / scale;
        const sa = startAngle, ea = endAngle;

        // V2.3-fix: Canvas hat scale(s,-s) → Y gespiegelt
        // Welt-Winkel θ → Canvas-Winkel -θ, CCW in Welt → CW in Canvas
        // Daher: arc(-sa, -ea, counterclockwise=false) — native CW wird visuell CCW durch Y-Flip
        ctx.strokeStyle = S.lineColor;
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        ctx.arc(center.x, center.y, arcR, -sa, -ea, false);
        ctx.stroke();

        // Hilfslinien (Extension Lines): vom Zentrum zum Bogen-Endpunkt + DIMEXE Überhang
        ctx.lineWidth = lw * 0.5;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(center.x + Math.cos(sa) * (arcR + S.DIMEXE), center.y + Math.sin(sa) * (arcR + S.DIMEXE));
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(center.x + Math.cos(ea) * (arcR + S.DIMEXE), center.y + Math.sin(ea) * (arcR + S.DIMEXE));
        ctx.stroke();

        // Pfeile an den Bogen-Endpunkten (tangential zum Bogen)
        const ap1 = { x: center.x + Math.cos(sa) * arcR, y: center.y + Math.sin(sa) * arcR };
        const ap2 = { x: center.x + Math.cos(ea) * arcR, y: center.y + Math.sin(ea) * arcR };
        // Tangente bei sa zeigt in CCW-Richtung: (-sin(sa), cos(sa))
        // Pfeil 1: Spitze bei ap1, zeigt in CW-Richtung (entgegen Sweep) = (sin(sa), -cos(sa))
        const fromDir1 = { x: ap1.x + Math.sin(sa) * S.DIMASZ, y: ap1.y - Math.cos(sa) * S.DIMASZ };
        // Pfeil 2: Spitze bei ap2, zeigt in CCW-Richtung = (-sin(ea), cos(ea))
        const fromDir2 = { x: ap2.x - Math.sin(ea) * S.DIMASZ, y: ap2.y + Math.cos(ea) * S.DIMASZ };
        this._arrow(ctx, ap1, fromDir1, S.DIMASZ, S.lineColor);
        this._arrow(ctx, ap2, fromDir2, S.DIMASZ, S.lineColor);

        // Text am Bogen-Mittelpunkt
        // CCW-Mitte berechnen
        const TWO_PI = Math.PI * 2;
        let sweep = ((ea - sa) % TWO_PI + TWO_PI) % TWO_PI;
        const midAngle = sa + sweep / 2;
        const textPos = { x: center.x + Math.cos(midAngle) * arcR, y: center.y + Math.sin(midAngle) * arcR };
        const textStr = (dim.textOverride != null) ? dim.textOverride : `${value.toFixed(1)}°`;
        this._dimText(ctx, textStr, textPos, midAngle * 180 / Math.PI, scale, S);
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAWING PRIMITIVES
    // ═══════════════════════════════════════════════════════════════

    /** Gefüllter Pfeil — AutoCAD Closed-Filled */
    _arrow(ctx, tip, from, size, color) {
        const dx = tip.x - from.x, dy = tip.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-10) return;
        const nx = dx / len, ny = dy / len;
        const hw = size * 0.22;  // AutoCAD: Breite ≈ 1:4.5
        const bx = tip.x - nx * size, by = tip.y - ny * size;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(bx + ny * hw, by - nx * hw);
        ctx.lineTo(bx - ny * hw, by + nx * hw);
        ctx.closePath();
        ctx.fill();
    }

    /** Texthöhe mit Screen-Clamping */
    _textHeight(scale, S) {
        let screenH = S.DIMTXT * scale;
        screenH = Math.max(S.minTextScreenPx, Math.min(S.maxTextScreenPx, screenH));
        return screenH / scale;
    }

    /** Bemaßungstext — AutoCAD-Stil: kein Hintergrund, Cyan, über der Linie */
    _dimText(ctx, text, pos, angle, scale, S) {
        const textH = this._textHeight(scale, S);

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.scale(1, -1);  // Text aufrecht

        let textAngle = -(angle || 0) * Math.PI / 180;
        // Lesbar halten (nicht auf dem Kopf)
        while (textAngle > Math.PI / 2) textAngle -= Math.PI;
        while (textAngle < -Math.PI / 2) textAngle += Math.PI;
        ctx.rotate(textAngle);

        ctx.font = `${textH}px ${S.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Kein Background-Rect — stattdessen dünn-transparenter Schatten für Lesbarkeit
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.fillStyle = S.textColor;
        ctx.fillText(text, 0, 0);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // LIVE PREVIEW
    // ═══════════════════════════════════════════════════════════════

    _drawPreview(ctx, scale, S) {
        if (!this.previewPos) return;
        const pp = this.previewPos;

        if ((this.activeTool === 'linear' || this.activeTool === 'aligned')) {
            if (this.phase === 1 && this.p1) {
                // Rubber band
                ctx.strokeStyle = S.lineColor;
                ctx.lineWidth = 0.5 / scale;
                ctx.setLineDash([3 / scale, 3 / scale]);
                ctx.beginPath();
                ctx.moveTo(this.p1.x, this.p1.y);
                ctx.lineTo(pp.x, pp.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (this.phase === 2 && this.p1 && this.p2) {
                // Live-Vorschau der kompletten Bemaßung
                const midX = (this.p1.x + this.p2.x) / 2;
                const midY = (this.p1.y + this.p2.y) / 2;
                let previewValue, previewAngle;

                if (this.activeTool === 'linear') {
                    const dx = Math.abs(pp.x - midX);
                    const dy = Math.abs(pp.y - midY);
                    if (dy >= dx) {
                        previewValue = Math.abs(this.p2.x - this.p1.x);
                        previewAngle = 0;
                    } else {
                        previewValue = Math.abs(this.p2.y - this.p1.y);
                        previewAngle = 90;
                    }
                    // Auto-Fix für Preview
                    const realDist = Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
                    if (previewValue < 0.001 && realDist > 0.001) {
                        previewValue = previewAngle === 0 ? Math.abs(this.p2.y - this.p1.y) : Math.abs(this.p2.x - this.p1.x);
                        previewAngle = previewAngle === 0 ? 90 : 0;
                    }
                } else {
                    previewValue = Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
                    previewAngle = Math.atan2(this.p2.y - this.p1.y, this.p2.x - this.p1.x) * 180 / Math.PI;
                }

                this._renderLinear(ctx, {
                    type: this.activeTool,
                    p1: this.p1, p2: this.p2,
                    dimLinePos: pp,
                    dimAngle: previewAngle,
                    value: previewValue,
                    textOverride: null
                }, scale, S);
            }
        }

        if ((this.activeTool === 'radius' || this.activeTool === 'diameter') && this.phase === 1 && this.targetContour) {
            const c = this.targetContour;
            this._renderRadius(ctx, {
                type: this.activeTool,
                center: c.center, radius: c.radius,
                dimLinePos: pp,
                value: this.activeTool === 'diameter' ? c.radius * 2 : c.radius,
                prefix: this.activeTool === 'diameter' ? 'Ø' : 'R',
                textOverride: null
            }, scale, S);
        }

        // V2.3: Angular Live-Preview
        if (this.activeTool === 'angular' && this.phase === 2 && this.p1 && this.p2) {
            const inter = this._lineLineIntersection(this.p1.start, this.p1.end, this.p2.start, this.p2.end);
            if (inter) {
                // Gleiche Logik wie _createAngularDimension (kompakt)
                const d1s = Math.hypot(this.p1.start.x - inter.x, this.p1.start.y - inter.y);
                const d1e = Math.hypot(this.p1.end.x - inter.x, this.p1.end.y - inter.y);
                const far1 = d1e >= d1s ? this.p1.end : this.p1.start;
                const d2s = Math.hypot(this.p2.start.x - inter.x, this.p2.start.y - inter.y);
                const d2e = Math.hypot(this.p2.end.x - inter.x, this.p2.end.y - inter.y);
                const far2 = d2e >= d2s ? this.p2.end : this.p2.start;
                const TWO_PI = Math.PI * 2;
                let a1 = ((Math.atan2(far1.y - inter.y, far1.x - inter.x) % TWO_PI) + TWO_PI) % TWO_PI;
                let a2 = ((Math.atan2(far2.y - inter.y, far2.x - inter.x) % TWO_PI) + TWO_PI) % TWO_PI;
                const ca = ((Math.atan2(pp.y - inter.y, pp.x - inter.x) % TWO_PI) + TWO_PI) % TWO_PI;
                let sweep12 = ((a2 - a1) % TWO_PI + TWO_PI) % TWO_PI;
                let ci12 = ((ca - a1) % TWO_PI + TWO_PI) % TWO_PI;
                let sa, ea, sweep;
                if (ci12 <= sweep12) { sa = a1; ea = a2; sweep = sweep12; }
                else { sa = a2; ea = a1; sweep = TWO_PI - sweep12; }
                if (sweep > Math.PI) {
                    const oa1 = (a1 + Math.PI) % TWO_PI, oa2 = (a2 + Math.PI) % TWO_PI;
                    const cands = [[a1,a2],[a1,oa2],[oa1,a2],[oa1,oa2]];
                    let best = sweep;
                    for (const [c1,c2] of cands) {
                        for (const [s,e] of [[c1,c2],[c2,c1]]) {
                            let sw = ((e-s)%TWO_PI+TWO_PI)%TWO_PI;
                            let ci = ((ca-s)%TWO_PI+TWO_PI)%TWO_PI;
                            if (ci <= sw && sw < best) { sa=s; ea=e; best=sw; }
                        }
                    }
                    sweep = best;
                }
                this._renderAngular(ctx, {
                    type: 'angular', center: inter, startAngle: sa, endAngle: ea,
                    dimLinePos: pp, value: sweep * 180 / Math.PI, textOverride: null
                }, scale, S);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // GRIP EDITING — Bemaßung verschieben
    // ═══════════════════════════════════════════════════════════════

    /** Findet Bemaßung an Klickposition (für Selektion/Grip-Edit) */
    findDimAtPoint(pt) {
        const tol = 8 / (this.app.renderer?.scale || 1);
        for (let i = this.dimensions.length - 1; i >= 0; i--) {
            const dim = this.dimensions[i];
            if (dim.type === 'linear' || dim.type === 'aligned') {
                const { dl1, dl2 } = this._calcLinearGeometry(dim);
                if (this._ptSegDist(pt, dl1, dl2) < tol) return dim;
                if (this._ptSegDist(pt, dim.p1, dl1) < tol) return dim;
                if (this._ptSegDist(pt, dim.p2, dl2) < tol) return dim;
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    clearAll() { this.dimensions = []; this.app.renderer?.render(); }

    deleteDimension(id) {
        const idx = this.dimensions.findIndex(d => d.id === id);
        if (idx >= 0) { this.dimensions.splice(idx, 1); this.app.renderer?.render(); }
    }
}
