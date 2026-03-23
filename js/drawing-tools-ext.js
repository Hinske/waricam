/**
 * CeraCUT Drawing Tools Extension V1.7
 * Zusätzliche Zeichentools: Ellipse, Spline, Donut, XLine, OverlapBreak, Hatch
 * V1.7: SplineTool AutoCAD-Overhaul — Dual-Preview, Close-to-Start, Continuous Mode, FitPoints erhalten
 * V1.6: Hatch Farbpalette — Floating Toolbar mit 8 AutoCAD-Farben + Pattern-Auswahl
 * V1.5: Hatch als eigenständige CamContour (cuttingMode='none') — AutoCAD-konform
 *        Live-Preview beim Hover, separate Selektion/Löschung/Undo
 * V1.4: Hatch-Bereichsklick — Point-in-Polygon statt Linien-Distanz (Industrie-Standard)
 * V1.3: Hatch-Fix — Toast-Feedback, Panel-Refresh nach Hatch-Klick
 * Lazy-Patch Registration (wie advanced-tools.js)
 * Created: 2026-02-16 MEZ
 * Last Modified: 2026-03-23 MEZ
 * Build: 20260323-splinetool
 *
 * Abhängigkeiten:
 *   - drawing-tools.js (BaseTool, DrawingToolManager)
 *   - geometry.js (SplineUtils)
 *   - geometry-ops.js (GeometryOps.pointInPolygon — Hatch-Bereichsklick)
 *   - cam-contour.js (CamContour — Hatch-Property, getArea)
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
        console.log('[SplineTool V1.1] gestartet');
    }

    handleClick(point) {
        // V1.1: Close-to-Start — Klick nahe Startpunkt schliesst den Spline
        if (this.fitPoints.length >= 3) {
            const fp = this.fitPoints[0];
            const scale = this.manager.renderer?.scale || 1;
            const snapDist = scale > 0 ? 10 / scale : 5;
            if (Math.hypot(point.x - fp.x, point.y - fp.y) < snapDist) {
                this.closed = true;
                this._createSpline();
                return;
            }
        }

        this.fitPoints.push({ x: point.x, y: point.y });
        const n = this.fitPoints.length;
        console.debug(`[SplineTool V1.1] Fit-Punkt ${n}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);

        if (n >= 2) {
            this.cmd?.setPrompt(`SPLINE — Nächster Punkt (${n} Pkt) [U=Undo / S=Schließen / Enter=Fertig]:`);
        } else {
            this.cmd?.setPrompt('SPLINE — Nächsten Fit-Punkt angeben:');
        }
    }

    handleMouseMove(point) {
        if (this.fitPoints.length >= 1) {
            const cursorPt = { x: point.x, y: point.y };
            const previewPts = [...this.fitPoints, cursorPt];
            const tessellated = this._tessellate(previewPts, false);

            // V1.1: Dual-Preview — Kontrollpolygon (gestrichelt) + glatte Kurve (solid)
            this.manager.rubberBand = {
                type: 'spline',
                data: {
                    fitPoints: previewPts,
                    curve: tessellated,
                    closed: false
                }
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
            // Kein Punkt → Tool beenden
            this.manager.rubberBand = null;
            this.manager._setDefaultPrompt();
            this.manager.activeTool = null;
            this.manager.renderer?.render();
        } else {
            this.cmd?.log('Spline: Mindestens 2 Punkte benötigt', 'error');
        }
    }

    _createSpline() {
        const pts = this._tessellate(this.fitPoints, this.closed);

        if (pts.length < 2) {
            this.cmd?.log('Spline: Zu wenig Punkte erzeugt', 'error');
            return;
        }

        this.manager.addEntity({
            type: 'SPLINE',
            fitPoints: this.fitPoints.map(p => ({ x: p.x, y: p.y })),
            points: pts,
            closed: this.closed
        });

        console.debug(`[SplineTool V1.1] Spline ${this.fitPoints.length} Fit-Punkte → ${pts.length} Segmente, closed=${this.closed}`);
        this.cmd?.log(`Spline ${this.fitPoints.length} Punkte${this.closed ? ' (geschlossen)' : ''} (Strg+Z)`, 'success');

        // V1.1: Continuous Mode — Reset für nächsten Spline
        this.fitPoints = [];
        this.closed = false;
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('SPLINE — Ersten Fit-Punkt angeben (ESC=Ende):');
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

        console.warn('[SplineTool V1.1] SplineUtils nicht verfügbar — Fallback auf linear');
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
//  OVERLAP BREAK TOOL (OB) — Kontur trennen + tangentiale Überlappung
//  Für Wasserstrahl-Einläufe: Split + Verlängerung = physische Überlappung
// ════════════════════════════════════════════════════════════════════════════

/**
 * OVERLAP BREAK (OB) — Kontur an einem Punkt teilen + tangentiale Überlappung.
 * Phase 1: Kontur auswählen (oder Noun-Verb)
 * Phase 2: Split-Punkt auf der Kontur anklicken
 * Phase 3: Richtung der Verlängerung durch Mausposition bestimmen (Teil A / Teil B)
 *
 * Geschlossene Kontur → wird geöffnet, ein Ende ragt über das andere hinaus
 * Offene Kontur → wird geteilt, ein Teil wird tangential verlängert
 */
class OverlapBreakTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.targetContour = null;
        this.splitHit = null;         // { segmentIndex, t, point }
        this.overlapLength = 5.0;     // Default: 5mm
        this.state = 'select';        // 'select' → 'pickPoint' → 'pickDirection'
    }

    start() {
        this.cmd?.setPrompt('OVERLAP BREAK — Kontur auswählen [Überlappung=' + this.overlapLength.toFixed(1) + 'mm]:');
        this.cmd?.log('✂️ Overlap Break: Kontur trennen + tangentiale Überlappung', 'info');
        this.cmd?.log('   Optionen: Zahl eingeben = Überlappungslänge ändern', 'info');

        // Noun-Verb: Genau eine offene Kontur vorausgewählt
        const selected = this.manager.getSelectedContours?.() || [];
        if (selected.length === 1) {
            if (selected[0].isClosed) {
                this.cmd?.log('Overlap Break nur für offene Konturen — geschlossene Kontur ignoriert', 'warning');
            } else {
                this.targetContour = selected[0];
                this.state = 'pickPoint';
                this.cmd?.log(`Kontur "${this.targetContour.name}" ausgewählt`, 'info');
                this.cmd?.setPrompt('OVERLAP BREAK — Teilungspunkt auf der Kontur anklicken:');
            }
        }
    }

    handleClick(point) {
        const contours = this.manager.app?.contours;
        if (!contours) return;

        if (this.state === 'select') {
            // Phase 1: Kontur unter Cursor finden
            const clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
            if (!clicked || clicked.isReference) {
                this.cmd?.log('Keine gültige Kontur getroffen', 'warning');
                return;
            }
            if (clicked.isClosed) {
                this.cmd?.log('Overlap Break nur für offene Konturen — geschlossene Kontur ignoriert', 'warning');
                return;
            }
            this.targetContour = clicked;
            this.state = 'pickPoint';
            contours.forEach(c => { c.isSelected = false; });
            clicked.isSelected = true;
            this.manager.renderer?.render();
            this.cmd?.log(`Kontur "${clicked.name}" ausgewählt`, 'info');
            this.cmd?.setPrompt('OVERLAP BREAK — Teilungspunkt auf der Kontur anklicken:');
            return;
        }

        if (this.state === 'pickPoint') {
            // Phase 2: Split-Punkt bestimmen
            const snapMgr = this.manager.snapManager;
            const snapped = snapMgr?.currentSnap?.point || point;
            const tolerance = 10 / (this.manager.renderer?.scale || 1);
            const hit = GeometryOps.findNearestSegment(this.targetContour.points, snapped.x, snapped.y, tolerance);
            if (!hit) {
                this.cmd?.log('Klickpunkt nicht auf der Kontur — näher klicken', 'warning');
                return;
            }
            // Vertex-Snap
            if (hit.t < 1e-6) {
                hit.point = { x: this.targetContour.points[hit.segmentIndex].x, y: this.targetContour.points[hit.segmentIndex].y };
                hit.t = 0;
            } else if (hit.t > 1 - 1e-6) {
                hit.point = { x: this.targetContour.points[hit.segmentIndex + 1].x, y: this.targetContour.points[hit.segmentIndex + 1].y };
                hit.t = 1;
            }
            this.splitHit = hit;

            if (this.targetContour.isClosed) {
                // Geschlossene Konturen ignorieren — OB nur für offene Konturen sinnvoll
                this.cmd?.log('Overlap Break nur für offene Konturen — geschlossene Kontur ignoriert', 'warning');
                this.splitHit = null;
                return;
            } else {
                // Offene Kontur: Richtung wählen
                this.state = 'pickDirection';
                this.cmd?.setPrompt('OVERLAP BREAK — Seite für Überlappung anklicken (A=vor Split / B=nach Split):');
            }
            return;
        }

        if (this.state === 'pickDirection') {
            // Phase 3: Richtung bestimmen — welches Teil verlängern?
            const extendA = this._isCloserToPartA(point);
            this._executeOverlapBreak(extendA);
        }
    }

    /** Bestimmt ob der Klickpunkt näher an Teil A (vor Split) oder Teil B (nach Split) liegt */
    _isCloserToPartA(mousePoint) {
        const target = this.targetContour;
        const hit = this.splitHit;
        if (!target || !hit) return true;

        // Mittelpunkt von Teil A (Start→Split) vs Teil B (Split→Ende)
        const midIdxA = Math.floor(hit.segmentIndex / 2);
        const midIdxB = Math.min(hit.segmentIndex + 1 + Math.floor((target.points.length - 1 - hit.segmentIndex) / 2), target.points.length - 1);
        const midA = target.points[midIdxA] || target.points[0];
        const midB = target.points[midIdxB] || target.points[target.points.length - 1];
        const dA = Math.hypot(mousePoint.x - midA.x, mousePoint.y - midA.y);
        const dB = Math.hypot(mousePoint.x - midB.x, mousePoint.y - midB.y);
        return dA < dB;
    }

    _executeOverlapBreak(extendA) {
        const contours = this.manager.app?.contours;
        const target = this.targetContour;
        const hit = this.splitHit;
        if (!contours || !target || !hit || typeof GeometryOps === 'undefined') return;

        // splitAndOverlap aufrufen
        const parts = GeometryOps.splitAndOverlap(
            target.points, target.isClosed, hit.segmentIndex, hit.point,
            this.overlapLength, extendA
        );

        if (!parts || parts.length === 0) {
            this.cmd?.log('Überlappungs-Break fehlgeschlagen', 'error');
            this.cancel();
            return;
        }

        // Neue Konturen erzeugen — CAM-Properties vererben, cuttingMode = null (Slit)
        const newContours = parts.map((pts, i) => {
            const nc = new CamContour(pts, {
                layer: target.layer || 'DRAW',
                name: `${target.name}_OB${i + 1}`,
                quality: target.quality,
                cuttingMode: null,  // Slit-Modus: kein Kerf-Offset
                leadInType: target.leadInType,
                leadInLength: target.leadInLength,
                leadInRadius: target.leadInRadius,
                leadInAngle: target.leadInAngle,
                leadOutType: target.leadOutType,
                leadOutLength: target.leadOutLength,
                leadOutRadius: target.leadOutRadius,
                leadOutAngle: target.leadOutAngle
            });
            nc.kerfWidth = 0;       // Kein Kerf bei Überlappung
            nc.kerfSide = 'none';
            return nc;
        });

        // Undo-Command
        const targetIndex = contours.indexOf(target);
        const app = this.manager.app;
        const rerender = () => {
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        const cmd = new FunctionCommand(
            `Overlap Break → ${parts.length} Teil(e), ${this.overlapLength.toFixed(1)}mm Überlappung`,
            () => {
                const idx = contours.indexOf(target);
                if (idx !== -1) contours.splice(idx, 1);
                contours.push(...newContours);
                contours.forEach(c => { c.isSelected = false; });
                // Pipeline re-trigger für Topologie-Validierung
                if (typeof CeraCutPipeline !== 'undefined') {
                    CeraCutPipeline.autoProcess(app.contours, { kerfWidth: app.kerfWidth || 0.8 });
                }
                rerender();
            },
            () => {
                for (const nc of newContours) {
                    const idx = contours.indexOf(nc);
                    if (idx !== -1) contours.splice(idx, 1);
                }
                const insertIdx = Math.min(targetIndex, contours.length);
                contours.splice(insertIdx, 0, target);
                rerender();
            }
        );

        app.undoManager?.execute(cmd);
        const sideInfo = extendA ? 'Teil A verlängert' : 'Teil B verlängert';
        const closedInfo = target.isClosed ? ' (geschlossen → offen + Überlappung)' : '';
        this.cmd?.log(`✔ Overlap Break: ${sideInfo}, ${this.overlapLength.toFixed(1)}mm${closedInfo} (Strg+Z = Rückgängig)`, 'success');

        // Continuous Mode: zurück auf 'select'
        this.manager.rubberBand = null;
        this.targetContour = null;
        this.splitHit = null;
        this.state = 'select';
        this.cmd?.setPrompt('OVERLAP BREAK — Nächste Kontur auswählen (ESC = Beenden):');
        this.manager.renderer?.render();
    }

    handleMouseMove(point) {
        if (!this.targetContour || typeof GeometryOps === 'undefined') return;
        const snapMgr = this.manager.snapManager;
        const snapped = snapMgr?.currentSnap?.point || point;

        if (this.state === 'pickPoint') {
            // Split-Punkt Vorschau mit Überlappungslinie
            const hit = GeometryOps.findNearestSegment(this.targetContour.points, snapped.x, snapped.y, Infinity);
            if (hit) {
                // Vorschau für Teil-A-Verlängerung (Standard)
                const preview = GeometryOps.getOverlapPreview(
                    this.targetContour.points, this.targetContour.isClosed,
                    hit.segmentIndex, hit.point, this.overlapLength, true
                );
                this.manager.rubberBand = {
                    type: 'overlapBreak',
                    data: {
                        point: hit.point,
                        overlapLine: preview,
                        label: this.overlapLength.toFixed(1) + ' mm'
                    }
                };
                this.manager.renderer?.render();
            }
        }

        if (this.state === 'pickDirection') {
            // Richtungs-Vorschau: zeige Überlappung auf der mausnahen Seite
            const extendA = this._isCloserToPartA(point);
            const preview = GeometryOps.getOverlapPreview(
                this.targetContour.points, this.targetContour.isClosed,
                this.splitHit.segmentIndex, this.splitHit.point,
                this.overlapLength, extendA
            );
            this.manager.rubberBand = {
                type: 'overlapBreak',
                data: {
                    point: this.splitHit.point,
                    overlapLine: preview,
                    label: (extendA ? 'A: ' : 'B: ') + this.overlapLength.toFixed(1) + ' mm'
                }
            };
            this.manager.renderer?.render();
        }
    }

    /** Zahlen-Eingabe ändert die Überlappungslänge */
    handleRawInput(value) {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0 && num <= 500) {
            this.overlapLength = num;
            this.cmd?.log(`Überlappungslänge: ${num.toFixed(1)} mm`, 'info');
            this.cmd?.setPrompt(`OVERLAP BREAK — Überlappung=${num.toFixed(1)}mm — Kontur/Punkt wählen:`);
            return true;
        }
        return false;
    }

    finish() {
        if (this.state === 'select') {
            this.cancel();
        } else if (this.state === 'pickDirection') {
            // Enter = Standard (Teil A verlängern)
            this._executeOverlapBreak(true);
        }
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  HATCH TOOL (H) — Schraffur auf geschlossene Konturen
//  AutoCAD: H → Kontur anklicken → Solid/Lines/Cross/Dots
//  V1.5: Hatch als eigenständige CamContour (cuttingMode='none') — wird nie geschnitten
// ════════════════════════════════════════════════════════════════════════════

class HatchTool extends BaseTool {
    // V1.6: AutoCAD-Farbpalette
    static HATCH_COLORS = [
        { name: 'ByLayer', color: null,      css: 'linear-gradient(135deg, #666 25%, #999 50%, #666 75%)' },
        { name: 'Rot',     color: '#FF0000', css: '#FF0000' },
        { name: 'Gelb',    color: '#FFFF00', css: '#FFFF00' },
        { name: 'Grün',    color: '#00FF00', css: '#00FF00' },
        { name: 'Cyan',    color: '#00FFFF', css: '#00FFFF' },
        { name: 'Blau',    color: '#0000FF', css: '#0000FF' },
        { name: 'Magenta', color: '#FF00FF', css: '#FF00FF' },
        { name: 'Weiß',    color: '#FFFFFF', css: '#FFFFFF' }
    ];

    constructor(manager) {
        super(manager);
        this.state = 'select';
        this.pattern = 'solid';  // 'solid' | 'lines' | 'cross' | 'dots'
        this.angle = 45;
        this.spacing = 3;
        this.opacity = 0.25;
        this.color = null;       // null = Konturfarbe (ByLayer)
        this._previewContour = null;
        this._paletteEl = null;  // V1.6: Farbpalette DOM-Element
    }

    start() {
        const patternLabel = { solid: 'Solid', lines: 'Linien', cross: 'Kreuz', dots: 'Punkte' };
        this.cmd?.setPrompt(`HATCH — IN geschlossenen Bereich klicken [${patternLabel[this.pattern]}] [S/L/C/D]:`);
        this.cmd?.log('▧ Schraffur: IN einen geschlossenen Bereich klicken → Füllung anwenden', 'info');
        this.cmd?.log('   Optionen: S=Solid  L=Linien  C=Kreuz  D=Punkte', 'info');
        console.log('[HatchTool V1.6] gestartet, Pattern=' + this.pattern);
        this._showColorPalette();
    }

    // ═══ V1.6: Floating Farbpalette ═══

    _showColorPalette() {
        this._removeColorPalette();
        const canvasArea = document.getElementById('canvas-area');
        if (!canvasArea) return;

        const bar = document.createElement('div');
        bar.id = 'hatch-color-palette';
        bar.style.cssText = `
            position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
            display: flex; gap: 4px; padding: 4px 8px;
            background: rgba(15,15,26,0.92); border: 1px solid rgba(255,255,255,0.15);
            border-radius: 6px; z-index: 100; align-items: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        `;

        // Pattern-Buttons
        const patterns = [
            { key: 'solid', label: '■', tip: 'Solid (S)' },
            { key: 'lines', label: '╱', tip: 'Linien (L)' },
            { key: 'cross', label: '╳', tip: 'Kreuz (C)' },
            { key: 'dots',  label: '⠿', tip: 'Punkte (D)' }
        ];
        for (const p of patterns) {
            const btn = document.createElement('button');
            btn.textContent = p.label;
            btn.title = p.tip;
            btn.dataset.pattern = p.key;
            btn.style.cssText = `
                width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.2);
                border-radius: 4px; cursor: pointer; font-size: 14px;
                display: flex; align-items: center; justify-content: center;
                background: ${p.key === this.pattern ? 'var(--accent-blue, #3b82f6)' : 'rgba(255,255,255,0.06)'};
                color: #fff;
            `;
            btn.addEventListener('click', () => {
                this.pattern = p.key;
                this._updatePaletteState();
                this.cmd?.log(`Pattern: ${p.tip}`, 'info');
                console.log(`[HatchTool V1.6] Pattern → ${this.pattern}`);
            });
            bar.appendChild(btn);
        }

        // Separator
        const sep = document.createElement('div');
        sep.style.cssText = 'width: 1px; height: 20px; background: rgba(255,255,255,0.2); margin: 0 4px;';
        bar.appendChild(sep);

        // Farb-Buttons
        for (const c of HatchTool.HATCH_COLORS) {
            const btn = document.createElement('button');
            btn.title = c.name;
            btn.dataset.hatchColor = c.color || 'bylayer';
            btn.style.cssText = `
                width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
                border: 2px solid ${this.color === c.color ? '#fff' : 'rgba(255,255,255,0.25)'};
                background: ${c.css};
                ${c.color === null ? 'background-size: 8px 8px;' : ''}
            `;
            btn.addEventListener('click', () => {
                this.color = c.color;
                this._updatePaletteState();
                this.cmd?.log(`Farbe: ${c.name}`, 'info');
                console.log(`[HatchTool V1.6] Farbe → ${c.name} (${c.color})`);
            });
            bar.appendChild(btn);
        }

        canvasArea.appendChild(bar);
        this._paletteEl = bar;
    }

    _updatePaletteState() {
        if (!this._paletteEl) return;
        // Pattern-Buttons highlighten
        this._paletteEl.querySelectorAll('[data-pattern]').forEach(btn => {
            const active = btn.dataset.pattern === this.pattern;
            btn.style.background = active ? 'var(--accent-blue, #3b82f6)' : 'rgba(255,255,255,0.06)';
        });
        // Farb-Buttons highlighten
        this._paletteEl.querySelectorAll('[data-hatch-color]').forEach(btn => {
            const val = btn.dataset.hatchColor;
            const active = (val === 'bylayer' && this.color === null) || val === this.color;
            btn.style.borderColor = active ? '#fff' : 'rgba(255,255,255,0.25)';
        });
        // Preview aktualisieren wenn Kontur unter Cursor
        if (this._previewContour && this.manager.renderer) {
            this.manager.renderer._hatchPreview = {
                contour: this._previewContour,
                hatch: {
                    pattern: this.pattern,
                    color: this.color,
                    angle: this.angle,
                    spacing: this.spacing,
                    opacity: Math.min(this.opacity, 0.15)
                }
            };
            this.manager.renderer.render();
        }
    }

    _removeColorPalette() {
        if (this._paletteEl) {
            this._paletteEl.remove();
            this._paletteEl = null;
        }
    }

    acceptsOption(opt) { return ['S', 'L', 'C', 'D'].includes(opt); }

    handleOption(option) {
        const map = { S: 'solid', L: 'lines', C: 'cross', D: 'dots' };
        const labels = { S: 'Solid', L: 'Linien', C: 'Kreuz', D: 'Punkte' };
        if (map[option]) {
            this.pattern = map[option];
            this.cmd?.log(`Pattern: ${labels[option]}`, 'info');
            this.cmd?.setPrompt(`HATCH [${labels[option]}] — IN geschlossenen Bereich klicken:`);
            console.log(`[HatchTool V1.5] Pattern → ${this.pattern}`);
        }
    }

    /**
     * V1.5: Bereichs-Klick — Point-in-Polygon.
     * Findet die kleinste geschlossene Kontur, die den Klickpunkt umschließt.
     * Überspringt Hatch-Konturen (cuttingMode='none') um Hatch-auf-Hatch zu verhindern.
     */
    _findEnclosingContour(point) {
        const contours = this.manager.app?.contours;
        if (!contours?.length) return null;
        if (typeof GeometryOps === 'undefined' || !GeometryOps.pointInPolygon) return null;

        const lm = this.manager.app?.layerManager;
        const candidates = [];

        for (const c of contours) {
            if (!c.isClosed || c.isReference) continue;
            if (c.isHatchContour || c.cuttingMode === 'none') continue;  // V1.5: Hatch-Konturen überspringen
            if (!c.points || c.points.length < 3) continue;
            // Unsichtbare Layer überspringen
            if (lm) {
                const ld = lm.getLayer(c.layer || '0');
                if (ld && !ld.visible) continue;
            }
            if (GeometryOps.pointInPolygon(point, c.points)) {
                candidates.push(c);
            }
        }

        if (candidates.length === 0) return null;

        // Kleinste Fläche = innerste Kontur
        candidates.sort((a, b) => a.getArea() - b.getArea());
        return candidates[0];
    }

    /**
     * V1.5: Erstellt eine eigenständige CamContour als Hatch-Entity.
     * Die Kontur kopiert die Boundary-Punkte der Eltern-Kontur und wird nie geschnitten.
     */
    _createHatchContour(parentContour) {
        if (typeof CamContour === 'undefined') return null;

        // Deep-Copy der Boundary-Punkte
        const pts = parentContour.points.map(p => ({ x: p.x, y: p.y }));

        const hatchContour = new CamContour(pts, {
            name: `Hatch_${parentContour.name}`,
            cuttingMode: 'none',
            layer: parentContour.layer || '0',
            kerfWidth: 0,
            hatch: {
                pattern: this.pattern,
                color: this.color,
                angle: this.angle,
                spacing: this.spacing,
                opacity: this.opacity
            },
            isHatchContour: true,
            parentContourName: parentContour.name
        });

        return hatchContour;
    }

    handleClick(point) {
        const renderer = this.manager.renderer;
        if (!renderer) return;

        const contour = this._findEnclosingContour(point);
        if (!contour) {
            this.cmd?.log('Kein geschlossener Bereich getroffen — klicke IN eine Kontur', 'warning');
            return;
        }

        // Prüfe ob bereits ein Hatch für diese Kontur existiert
        const app = this.manager.app;
        const existing = app?.contours?.find(c => c.isHatchContour && c.parentContourName === contour.name);
        if (existing) {
            this.cmd?.log(`Kontur "${contour.name}" hat bereits eine Schraffur — erst löschen (DEL)`, 'warning');
            return;
        }

        const hatchContour = this._createHatchContour(contour);
        if (!hatchContour) {
            this.cmd?.log('CamContour nicht verfügbar', 'error');
            return;
        }

        // Undo-Support: Hatch-Kontur hinzufügen/entfernen
        if (typeof FunctionCommand !== 'undefined' && app?.undoManager) {
            const cmd = new FunctionCommand(
                `Schraffur [${this.pattern}] → ${contour.name}`,
                () => {
                    if (!app.contours.includes(hatchContour)) {
                        app.contours.push(hatchContour);
                    }
                    app.renderer?.render();
                },
                () => {
                    const idx = app.contours.indexOf(hatchContour);
                    if (idx >= 0) app.contours.splice(idx, 1);
                    app.renderer?.render();
                }
            );
            app.undoManager.execute(cmd);
        } else {
            app?.contours?.push(hatchContour);
        }

        this.cmd?.log(`✔ Schraffur [${this.pattern}] → ${contour.name}`, 'success');
        console.log(`[HatchTool V1.5] ✔ Hatch-Kontur erstellt: ${hatchContour.name}, pattern=${this.pattern}`);
        renderer.render();

        app?.showToast?.(`Schraffur [${this.pattern}] → ${contour.name}`, 'success');
        app?.updateContourPanel?.();

        // Continuous Mode — bereit für nächste Kontur
        const patternLabel = { solid: 'Solid', lines: 'Linien', cross: 'Kreuz', dots: 'Punkte' };
        this.cmd?.setPrompt(`HATCH [${patternLabel[this.pattern]}] — Nächsten Bereich klicken (ESC=Beenden):`);
    }

    handleMouseMove(point) {
        const renderer = this.manager.renderer;
        if (!renderer) return;

        // V1.5: Live-Preview — Hatch-Pattern auf gehoverte Kontur zeigen
        const hovered = this._findEnclosingContour(point);

        if (hovered !== this._previewContour) {
            this._previewContour = hovered;

            // Temporäres Hatch-Objekt für Preview setzen (wird im Renderer genutzt)
            if (hovered) {
                renderer._hatchPreview = {
                    contour: hovered,
                    hatch: {
                        pattern: this.pattern,
                        color: this.color,
                        angle: this.angle,
                        spacing: this.spacing,
                        opacity: Math.min(this.opacity, 0.15)  // Etwas transparenter als final
                    }
                };
            } else {
                renderer._hatchPreview = null;
            }

            renderer.hoveredContour = hovered;
            renderer.render();
        }
    }

    /** Zahlen-Eingabe ändert Spacing (für Lines/Cross/Dots) */
    handleRawInput(value) {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0 && num <= 50) {
            this.spacing = num;
            this.cmd?.log(`Linienabstand: ${num.toFixed(1)} mm`, 'info');
            return true;
        }
        return false;
    }

    finish() {
        this._previewContour = null;
        this._removeColorPalette();
        if (this.manager.renderer) {
            this.manager.renderer._hatchPreview = null;
        }
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return null; }
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
            this.tools['OBREAK']       = () => new OverlapBreakTool(this);
            this.tools['OVERLAPBREAK'] = () => new OverlapBreakTool(this);
            this.tools['H']            = () => new HatchTool(this);
            this.tools['HT']           = () => new HatchTool(this);
            this.tools['HATCH']        = () => new HatchTool(this);

            console.log('[DrawingToolsExt V1.2] ✅ 6 Tools registriert: EL, SP, DO, XL, OBREAK, H');
        }

        return _origStartToolExt.call(this, shortcut);
    };

    console.debug('[DrawingToolsExt V1.2] Lazy-Patch auf startTool() installiert');
} else {
    console.error('[DrawingToolsExt V1.2] ❌ DrawingToolManager nicht gefunden! drawing-tools.js VOR drawing-tools-ext.js laden.');
}
