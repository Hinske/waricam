/**
 * WARICAM Drawing Tools Extension V1.0
 * Zusätzliche Zeichentools: Ellipse, Spline, Donut, XLine
 * Lazy-Patch Registration (wie advanced-tools.js)
 * Created: 2026-02-16 MEZ
 * Build: 20260216-1700 MEZ
 *
 * Abhängigkeiten:
 *   - drawing-tools.js (BaseTool, DrawingToolManager)
 *   - geometry.js (SplineUtils)
 *
 * Laden: NACH advanced-tools.js, VOR app.js
 */


// ════════════════════════════════════════════════════════════════════════════
//  ELLIPSE TOOL (EL) — Center → Achse 1 → Achse 2
//  AutoCAD: Mittelpunkt → Endpunkt Hauptachse → Halblänge Nebenachse
// ════════════════════════════════════════════════════════════════════════════

class EllipseTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.center = null;
        this.axisEnd = null;
        this.majorRadius = 0;
        this.majorAngle = 0;
        this.state = 'center';
    }

    start() {
        this.cmd?.setPrompt('ELLIPSE — Mittelpunkt angeben:');
        this.cmd?.log('⬮ Ellipse: Mittelpunkt → Achse 1 Endpunkt → Halblänge Achse 2', 'info');
        console.log('[EllipseTool V1.0] gestartet');
    }

    handleClick(point) {
        if (this.state === 'center') {
            this.center = { x: point.x, y: point.y };
            this.state = 'axis1';
            this.cmd?.setPrompt('ELLIPSE — Endpunkt der Hauptachse:');
            console.log(`[EllipseTool V1.0] Center: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
        } else if (this.state === 'axis1') {
            this.axisEnd = { x: point.x, y: point.y };
            this.majorRadius = Math.hypot(point.x - this.center.x, point.y - this.center.y);
            this.majorAngle = Math.atan2(point.y - this.center.y, point.x - this.center.x);
            if (this.majorRadius < 0.01) {
                this.cmd?.log('Hauptachse zu kurz!', 'error');
                return;
            }
            this.state = 'axis2';
            this.cmd?.setPrompt(`ELLIPSE — Halblänge Nebenachse [a=${this.majorRadius.toFixed(2)}]:`);
        } else if (this.state === 'axis2') {
            const minorRadius = this._distToMajorAxis(point);
            this._createEllipse(minorRadius);
        }
    }

    handleMouseMove(point) {
        if (this.state === 'axis1' && this.center) {
            this.manager.rubberBand = { type: 'line', data: { start: this.center, end: point } };
        } else if (this.state === 'axis2' && this.center) {
            const minorRadius = this._distToMajorAxis(point);
            const pts = this._tessellateEllipse(this.center, this.majorRadius, minorRadius, this.majorAngle);
            this.manager.rubberBand = { type: 'ellipse', data: { center: this.center, points: pts } };
        }
        this.manager.renderer?.render();
    }

    handleDistance(value) {
        if (this.state === 'axis1' && this.center) {
            this.majorRadius = Math.abs(value);
            this.majorAngle = 0;
            this.axisEnd = { x: this.center.x + this.majorRadius, y: this.center.y };
            this.state = 'axis2';
            this.cmd?.setPrompt(`ELLIPSE — Halblänge Nebenachse [a=${this.majorRadius.toFixed(2)}]:`);
        } else if (this.state === 'axis2') {
            this._createEllipse(Math.abs(value));
        }
    }

    _distToMajorAxis(point) {
        const dx = point.x - this.center.x;
        const dy = point.y - this.center.y;
        const cos = Math.cos(-this.majorAngle);
        const sin = Math.sin(-this.majorAngle);
        const localY = dx * sin + dy * cos;
        return Math.abs(localY);
    }

    _createEllipse(minorRadius) {
        if (minorRadius < 0.01) {
            this.cmd?.log('Nebenachse zu kurz!', 'error');
            return;
        }
        let major = this.majorRadius;
        let minor = minorRadius;
        let angle = this.majorAngle;
        if (minor > major) {
            [major, minor] = [minor, major];
            angle += Math.PI / 2;
        }

        const pts = this._tessellateEllipse(this.center, major, minor, angle);

        this.manager.addEntity({
            type: 'ELLIPSE',
            center: { ...this.center },
            majorRadius: major,
            minorRadius: minor,
            rotation: angle,
            points: pts,
            closed: true
        });

        console.log(`[EllipseTool V1.0] ✔ Ellipse a=${major.toFixed(2)} b=${minor.toFixed(2)} rot=${(angle * 180 / Math.PI).toFixed(1)}°`);
        this.cmd?.log(`✔ Ellipse ${major.toFixed(2)} × ${minor.toFixed(2)} mm`, 'success');

        this.center = null;
        this.axisEnd = null;
        this.state = 'center';
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('ELLIPSE — Mittelpunkt angeben (Enter=Fertig):');
    }

    _tessellateEllipse(center, a, b, rotation, segments = 64) {
        const pts = [];
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            const lx = a * Math.cos(t);
            const ly = b * Math.sin(t);
            pts.push({
                x: center.x + lx * cos - ly * sin,
                y: center.y + lx * sin + ly * cos
            });
        }
        return pts;
    }

    finish() {
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return this.axisEnd || this.center; }
}


// ════════════════════════════════════════════════════════════════════════════
//  SPLINE TOOL (SP) — Fit-Punkte → kubische Spline-Interpolation
//  AutoCAD: Fit-Punkte klicken, Enter = fertig, S = Schließen
// ════════════════════════════════════════════════════════════════════════════

class SplineTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.fitPoints = [];
        this.closed = false;
        this.createdEntities = [];
    }

    start() {
        this.cmd?.setPrompt('SPLINE — Ersten Fit-Punkt angeben:');
        this.cmd?.log('〰️ Spline: Fit-Punkte klicken → Enter=Fertig / S=Schließen / U=Undo', 'info');
        console.log('[SplineTool V1.0] gestartet');
    }

    handleClick(point) {
        this.fitPoints.push({ x: point.x, y: point.y });
        const n = this.fitPoints.length;
        console.log(`[SplineTool V1.0] Fit-Punkt ${n}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);

        if (n >= 2) {
            this.cmd?.setPrompt(`SPLINE — Nächster Punkt (${n} Pkt) [U=Undo / S=Schließen / Enter=Fertig]:`);
        } else {
            this.cmd?.setPrompt('SPLINE — Nächsten Fit-Punkt angeben:');
        }
    }

    handleMouseMove(point) {
        if (this.fitPoints.length >= 1) {
            const previewPts = [...this.fitPoints, { x: point.x, y: point.y }];
            const tessellated = this._tessellate(previewPts, false);
            this.manager.rubberBand = {
                type: 'polyline',
                data: { points: tessellated }
            };
            this.manager.renderer?.render();
        }
    }

    acceptsOption(opt) { return opt === 'S' || opt === 'U'; }

    handleOption(option) {
        if (option === 'S') {
            if (this.fitPoints.length >= 3) {
                this.closed = true;
                this._createSpline();
            } else {
                this.cmd?.log('Mindestens 3 Punkte zum Schließen!', 'error');
            }
        } else if (option === 'U') {
            if (this.fitPoints.length > 0) {
                this.fitPoints.pop();
                this.cmd?.log(`↩ Punkt entfernt (${this.fitPoints.length} übrig)`, 'info');
                this.manager.renderer?.render();
            }
        }
    }

    handleUndo() {
        if (this.fitPoints.length > 0) {
            this.fitPoints.pop();
            this.cmd?.log(`↩ Punkt entfernt (${this.fitPoints.length} übrig)`, 'info');
            this.manager.renderer?.render();
        }
    }

    finish() {
        if (this.fitPoints.length >= 2) {
            this._createSpline();
        } else if (this.fitPoints.length === 0) {
            this.manager.rubberBand = null;
            this.manager._setDefaultPrompt();
            this.manager.activeTool = null;
            this.manager.renderer?.render();
        } else {
            this.cmd?.log('Spline: Mindestens 2 Punkte benötigt', 'error');
        }
    }

    _createSpline() {
        console.time('[SplineTool V1.0] Tessellierung');
        const pts = this._tessellate(this.fitPoints, this.closed);
        console.timeEnd('[SplineTool V1.0] Tessellierung');

        if (pts.length < 2) {
            this.cmd?.log('Spline: Zu wenig Punkte erzeugt', 'error');
            return;
        }

        this.manager.addEntity({
            type: 'SPLINE',
            fitPoints: this.fitPoints.map(p => ({ ...p })),
            points: pts,
            closed: this.closed
        });

        console.log(`[SplineTool V1.0] ✔ Spline ${this.fitPoints.length} Fit-Punkte → ${pts.length} Segmente, closed=${this.closed}`);
        this.cmd?.log(`✔ Spline ${this.fitPoints.length} Punkte${this.closed ? ' (geschlossen)' : ''}`, 'success');

        this.fitPoints = [];
        this.closed = false;
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('SPLINE — Ersten Fit-Punkt angeben (Enter=Beenden):');
    }

    _tessellate(fitPoints, closed) {
        if (fitPoints.length < 2) return [...fitPoints];

        let pts = fitPoints;
        if (closed && fitPoints.length >= 3) {
            pts = [...fitPoints, fitPoints[0], fitPoints[1]];
        }

        if (typeof SplineUtils !== 'undefined' && SplineUtils.interpolate) {
            const result = SplineUtils.interpolate(pts);
            if (closed && result.length > 2) {
                const first = result[0];
                for (let i = result.length - 1; i > result.length / 2; i--) {
                    if (Math.hypot(result[i].x - first.x, result[i].y - first.y) < 0.1) {
                        return result.slice(0, i + 1);
                    }
                }
            }
            return result;
        }

        console.warn('[SplineTool V1.0] SplineUtils nicht verfügbar — Fallback auf linear');
        return [...fitPoints];
    }

    cancel() {
        this.fitPoints = [];
        super.cancel();
    }

    getLastPoint() {
        return this.fitPoints.length > 0 ? this.fitPoints[this.fitPoints.length - 1] : null;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  DONUT TOOL (DO) — 2 konzentrische Kreise
//  AutoCAD: Innenradius → Außenradius → Mittelpunkt(e)
// ════════════════════════════════════════════════════════════════════════════

class DonutTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.innerRadius = 2.0;
        this.outerRadius = 5.0;
        this.state = 'inner';
    }

    start() {
        this.cmd?.setPrompt(`DONUT — Innenradius <${this.innerRadius.toFixed(2)}>:`);
        this.cmd?.log('🍩 Donut: Innenradius → Außenradius → Mittelpunkt(e)', 'info');
        console.log('[DonutTool V1.0] gestartet');
    }

    handleClick(point) {
        if (this.state === 'place') {
            this._createDonut(point);
        }
    }

    handleMouseMove(point) {
        if (this.state === 'place') {
            const inner = this._tessellateCircle(point, this.innerRadius);
            const outer = this._tessellateCircle(point, this.outerRadius);
            this.manager.rubberBand = {
                type: 'donut',
                data: { center: point, innerPoints: inner, outerPoints: outer }
            };
            this.manager.renderer?.render();
        }
    }

    handleRawInput(value) {
        const num = parseFloat(value.trim());
        if (isNaN(num) || num < 0) return false;

        if (this.state === 'inner') {
            this.innerRadius = num;
            this.state = 'outer';
            this.cmd?.setPrompt(`DONUT — Außenradius <${this.outerRadius.toFixed(2)}>:`);
            console.log(`[DonutTool V1.0] Innenradius: ${num.toFixed(2)}`);
            return true;
        }
        if (this.state === 'outer') {
            if (num <= this.innerRadius) {
                this.cmd?.log('Außenradius muss größer als Innenradius sein!', 'error');
                return true;
            }
            this.outerRadius = num;
            this.state = 'place';
            this.cmd?.setPrompt('DONUT — Mittelpunkt angeben (Enter=Fertig):');
            console.log(`[DonutTool V1.0] Außenradius: ${num.toFixed(2)}`);
            return true;
        }
        return false;
    }

    handleDistance(value) {
        return this.handleRawInput(String(value));
    }

    _createDonut(center) {
        console.log(`[DonutTool V1.0] Erstelle Donut bei (${center.x.toFixed(2)}, ${center.y.toFixed(2)})`);

        this.manager.addEntity({
            type: 'CIRCLE',
            center: { x: center.x, y: center.y },
            radius: this.outerRadius
        });

        if (this.innerRadius > 0.001) {
            this.manager.addEntity({
                type: 'CIRCLE',
                center: { x: center.x, y: center.y },
                radius: this.innerRadius
            });
        }

        this.cmd?.log(`✔ Donut r=${this.innerRadius.toFixed(2)} R=${this.outerRadius.toFixed(2)}`, 'success');
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('DONUT — Nächster Mittelpunkt (Enter=Fertig):');
    }

    _tessellateCircle(center, radius, segments = 64) {
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push({
                x: center.x + radius * Math.cos(a),
                y: center.y + radius * Math.sin(a)
            });
        }
        return pts;
    }

    finish() {
        if (this.state !== 'place') {
            if (this.state === 'inner') {
                this.state = 'outer';
                this.cmd?.setPrompt(`DONUT — Außenradius <${this.outerRadius.toFixed(2)}>:`);
                return;
            }
            if (this.state === 'outer') {
                this.state = 'place';
                this.cmd?.setPrompt('DONUT — Mittelpunkt angeben (Enter=Fertig):');
                return;
            }
        }
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return null; }
}


// ════════════════════════════════════════════════════════════════════════════
//  XLINE TOOL (XL) — Konstruktionslinie (unendlich)
//  AutoCAD: Basispunkt → Richtungspunkt(e), "unendliche" Linie
//  Implementierung: Linie über gesamten Viewport hinaus (±100000)
// ════════════════════════════════════════════════════════════════════════════

class XLineTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
        this.mode = 'point';
        this.createdEntities = [];
    }

    start() {
        this.cmd?.setPrompt('XLINE — Basispunkt angeben [H=Horizontal/V=Vertikal/A=Winkel]:');
        this.cmd?.log('∞ XLine: Basispunkt → Richtung(en), H/V/A für Spezial-Modi', 'info');
        console.log('[XLineTool V1.0] gestartet');
    }

    acceptsOption(opt) { return ['H', 'V', 'A'].includes(opt); }

    handleOption(option) {
        if (option === 'H') {
            this.mode = 'hor';
            this.cmd?.setPrompt('XLINE Horizontal — Durchgangspunkt:');
        } else if (option === 'V') {
            this.mode = 'ver';
            this.cmd?.setPrompt('XLINE Vertikal — Durchgangspunkt:');
        } else if (option === 'A') {
            this.mode = 'angle';
            this.cmd?.setPrompt('XLINE — Winkel eingeben (Grad):');
        }
    }

    handleRawInput(value) {
        if (this.mode === 'angle' && !this.basePoint) {
            const deg = parseFloat(value.trim());
            if (!isNaN(deg)) {
                this._angleValue = deg * (Math.PI / 180);
                this.cmd?.setPrompt('XLINE Winkel — Durchgangspunkt:');
                return true;
            }
        }
        return false;
    }

    handleClick(point) {
        if (this.mode === 'hor') {
            this._createXLine(point, { x: point.x + 1, y: point.y });
            this.cmd?.setPrompt('XLINE Horizontal — Nächster Punkt (Enter=Fertig):');
            return;
        }
        if (this.mode === 'ver') {
            this._createXLine(point, { x: point.x, y: point.y + 1 });
            this.cmd?.setPrompt('XLINE Vertikal — Nächster Punkt (Enter=Fertig):');
            return;
        }
        if (this.mode === 'angle' && this._angleValue !== undefined) {
            const dir = {
                x: point.x + Math.cos(this._angleValue),
                y: point.y + Math.sin(this._angleValue)
            };
            this._createXLine(point, dir);
            this.cmd?.setPrompt('XLINE Winkel — Nächster Punkt (Enter=Fertig):');
            return;
        }

        if (!this.basePoint) {
            this.basePoint = { x: point.x, y: point.y };
            this.cmd?.setPrompt('XLINE — Richtungspunkt angeben:');
        } else {
            this._createXLine(this.basePoint, point);
            this.cmd?.setPrompt('XLINE — Nächster Richtungspunkt (Enter=Fertig):');
        }
    }

    handleMouseMove(point) {
        let from = null, to = null;

        if (this.mode === 'hor') {
            from = { x: point.x - 100000, y: point.y };
            to   = { x: point.x + 100000, y: point.y };
        } else if (this.mode === 'ver') {
            from = { x: point.x, y: point.y - 100000 };
            to   = { x: point.x, y: point.y + 100000 };
        } else if (this.mode === 'angle' && this._angleValue !== undefined) {
            const dx = Math.cos(this._angleValue) * 100000;
            const dy = Math.sin(this._angleValue) * 100000;
            from = { x: point.x - dx, y: point.y - dy };
            to   = { x: point.x + dx, y: point.y + dy };
        } else if (this.basePoint) {
            const dx = point.x - this.basePoint.x;
            const dy = point.y - this.basePoint.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.001) {
                const nx = dx / len * 100000;
                const ny = dy / len * 100000;
                from = { x: this.basePoint.x - nx, y: this.basePoint.y - ny };
                to   = { x: this.basePoint.x + nx, y: this.basePoint.y + ny };
            }
        }

        if (from && to) {
            this.manager.rubberBand = { type: 'line', data: { start: from, end: to } };
            this.manager.renderer?.render();
        }
    }

    _createXLine(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return;

        const nx = dx / len * 100000;
        const ny = dy / len * 100000;

        const entity = {
            type: 'LINE',
            start: { x: point1.x - nx, y: point1.y - ny },
            end:   { x: point1.x + nx, y: point1.y + ny },
            isXLine: true
        };

        this.manager.addEntity(entity);
        this.createdEntities.push(entity);

        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        console.log(`[XLineTool V1.0] ✔ XLine durch (${point1.x.toFixed(2)}, ${point1.y.toFixed(2)}) ∠${angle.toFixed(1)}°`);
        this.cmd?.log(`✔ XLine ∠${angle.toFixed(1)}°`, 'success');
        this.manager.rubberBand = null;
    }

    finish() {
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    cancel() {
        for (const ent of this.createdEntities) {
            const idx = this.manager.entities.indexOf(ent);
            if (idx !== -1) this.manager.entities.splice(idx, 1);
        }
        super.cancel();
    }

    getLastPoint() { return this.basePoint; }
}


// ════════════════════════════════════════════════════════════════════════════
//  LAZY-PATCH REGISTRATION (gleiches Pattern wie advanced-tools.js)
//  Patcht startTool() um Tools beim ersten Aufruf zu registrieren
// ════════════════════════════════════════════════════════════════════════════

if (typeof DrawingToolManager !== 'undefined') {
    var _origStartToolExt = DrawingToolManager.prototype.startTool;
    DrawingToolManager.prototype.startTool = function(shortcut) {
        if (!this.tools['EL']) {
            this.tools['EL']       = () => new EllipseTool(this);
            this.tools['ELLIPSE']  = () => new EllipseTool(this);
            this.tools['SP']       = () => new SplineTool(this);
            this.tools['SPLINE']   = () => new SplineTool(this);
            this.tools['DO']       = () => new DonutTool(this);
            this.tools['DONUT']    = () => new DonutTool(this);
            this.tools['XL']       = () => new XLineTool(this);
            this.tools['XLINE']    = () => new XLineTool(this);

            console.log('[DrawingToolsExt V1.0] ✅ 4 Tools registriert: EL, SP, DO, XL');
        }

        return _origStartToolExt.call(this, shortcut);
    };

    console.log('[DrawingToolsExt V1.0] Lazy-Patch auf startTool() installiert');
} else {
    console.error('[DrawingToolsExt V1.0] ❌ DrawingToolManager nicht gefunden! drawing-tools.js VOR drawing-tools-ext.js laden.');
}
