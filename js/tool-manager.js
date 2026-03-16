/**
 * CeraCUT Tool Manager V2.2 — Tier 4 Aufteilungstools
 * Ergänzt drawing-tools.js um CL2D (Halbieren), CLND (N-Teilen), CLDCL (Berechnungs-Dialog)
 * 
 * WICHTIG: drawing-tools.js MUSS vor dieser Datei geladen werden!
 * drawing-tools.js definiert: BaseTool, ModificationTool, DrawingToolManager,
 *   Tier 1 (Line/Circle/Rect/Arc/Poly), Tier 2 (Move/Copy/Rotate/Mirror/Scale/Erase),
 *   Tier 3 (Explode/Join/Break)
 * 
 * Diese Datei definiert NUR:
 *   - TransformUtils (Geometrie-Hilfsfunktionen)
 *   - createDivisionLines() (Teilungslinien-Generator)
 *   - CL2DTool, CLNDTool, CDCLTool (Tier 4 Aufteilungstools)
 *   - Registrierung der Tier 4 Tools in DrawingToolManager
 * 
 * Created: 2026-02-13 MEZ
 * Last Modified: 2026-02-16 00:15 MEZ
 * Build: 20260216-0015 MEZ
 */


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1: GEOMETRIE-HILFSFUNKTIONEN
// ════════════════════════════════════════════════════════════════════════════

const TransformUtils = {
    /** Punkt verschieben */
    translate(point, dx, dy) {
        return { x: point.x + dx, y: point.y + dy };
    },

    /** Punkt um Zentrum rotieren (Winkel in Radians) */
    rotate(point, center, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        return {
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos
        };
    },

    /** Punkt an Achse spiegeln (definiert durch 2 Punkte) */
    mirror(point, axisP1, axisP2) {
        const dx = axisP2.x - axisP1.x;
        const dy = axisP2.y - axisP1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return { x: point.x, y: point.y };
        const t = ((point.x - axisP1.x) * dx + (point.y - axisP1.y) * dy) / lenSq;
        const closestX = axisP1.x + t * dx;
        const closestY = axisP1.y + t * dy;
        return {
            x: 2 * closestX - point.x,
            y: 2 * closestY - point.y
        };
    },

    /** Punkt skalieren um Zentrum */
    scale(point, center, factorX, factorY) {
        return {
            x: center.x + (point.x - center.x) * factorX,
            y: center.y + (point.y - center.y) * (factorY ?? factorX)
        };
    },

    /** Winkel zwischen zwei Punkten (relativ zu Zentrum) in Grad */
    angleDeg(center, point) {
        return Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
    },

    /** Distanz zwischen zwei Punkten */
    distance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
};


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 2: TEILUNGSLINIEN-GENERATOR
// ════════════════════════════════════════════════════════════════════════════

/**
 * Erzeugt senkrechte Teilungslinien entlang eines Spans.
 * @param {Object} p1 - Startpunkt {x, y}
 * @param {Object} p2 - Endpunkt {x, y}
 * @param {number[]} fractions - Positionen als Bruchteile (0..1) entlang P1→P2
 * @param {number} lineLength - Länge der erzeugten Linien (senkrecht zum Span)
 * @returns {Object[]} Array von LINE-Entities
 */
function createDivisionLines(p1, p2, fractions, lineLength) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const spanLen = Math.hypot(dx, dy);
    if (spanLen < 0.001) return [];

    const nx = dx / spanLen;
    const ny = dy / spanLen;
    const perpX = -ny;
    const perpY = nx;

    const halfLen = lineLength / 2;
    const entities = [];

    for (const t of fractions) {
        const cx = p1.x + dx * t;
        const cy = p1.y + dy * t;
        entities.push({
            type: 'LINE',
            start: { x: cx - perpX * halfLen, y: cy - perpY * halfLen },
            end:   { x: cx + perpX * halfLen, y: cy + perpY * halfLen }
        });
    }
    return entities;
}


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 3: TIER 4 AUFTEILUNGSTOOLS (CL2D, CLND, CLDCL)
// ════════════════════════════════════════════════════════════════════════════

// ─── CL2D TOOL: Halbieren (Two Divided Distance) ───

class CL2DTool extends BaseTool {
    start() {
        this.p1 = null;
        this.p2 = null;
        this.cmd?.setPrompt('CL2D — Ersten Punkt angeben (Span-Start):');
    }

    handleClick(point) {
        if (!this.p1) {
            this.p1 = { x: point.x, y: point.y };
            this.cmd?.setPrompt('CL2D — Zweiten Punkt angeben (Span-Ende):');
            return;
        }

        this.p2 = { x: point.x, y: point.y };
        const spanLen = TransformUtils.distance(this.p1, this.p2);
        if (spanLen < 0.01) {
            this.cmd?.log('Span zu kurz!', 'error');
            return;
        }

        const lineLen = Math.max(spanLen, 100);
        const lines = createDivisionLines(this.p1, this.p2, [0.5], lineLen);
        for (const line of lines) {
            this.manager.addEntity(line);
        }

        this.cmd?.log(`✓ Mittellinie bei ${(spanLen / 2).toFixed(1)} mm (Span: ${spanLen.toFixed(1)} mm)`, 'success');

        this.p1 = null;
        this.p2 = null;
        this.cmd?.setPrompt('CL2D — Ersten Punkt angeben (oder ESC):');
    }

    handleMouseMove(point) {
        if (this.p1 && !this.p2) {
            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.p1, end: point }
            };
            this.manager.renderer?.render();
        }
    }

    getLastPoint() {
        return this.p1 || null;
    }
}


// ─── CLND TOOL: N-Teilen (Equally Divided Distance) ───

class CLNDTool extends BaseTool {
    start() {
        this.p1 = null;
        this.p2 = null;
        this.divCount = null;
        this.phase = 'p1';
        this.cmd?.setPrompt('CLND — Ersten Punkt angeben (Span-Start):');
    }

    handleClick(point) {
        if (this.phase === 'p1') {
            this.p1 = { x: point.x, y: point.y };
            this.phase = 'p2';
            this.cmd?.setPrompt('CLND — Zweiten Punkt angeben (Span-Ende):');
            return;
        }
        if (this.phase === 'p2') {
            this.p2 = { x: point.x, y: point.y };
            const spanLen = TransformUtils.distance(this.p1, this.p2);
            if (spanLen < 0.01) {
                this.cmd?.log('Span zu kurz!', 'error');
                this.phase = 'p1';
                this.p1 = null;
                return;
            }
            this.phase = 'count';
            this.cmd?.setPrompt(`CLND — Anzahl Teilungen [2]: (Span: ${spanLen.toFixed(1)} mm)`);
            return;
        }
    }

    handleMouseMove(point) {
        if (this.phase === 'p2' && this.p1) {
            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.p1, end: point }
            };
            this.manager.renderer?.render();
        }
    }

    handleRawInput(value) {
        if (this.phase !== 'count') return false;

        const n = parseInt(value, 10);
        if (isNaN(n) || n < 2 || n > 100) {
            this.cmd?.log('Ungültige Anzahl (2–100)', 'error');
            return true;
        }
        this._createDivisions(n);
        return true;
    }

    handleDistance(value) {
        if (this.phase === 'count') {
            const n = Math.round(value);
            if (n >= 2 && n <= 100) {
                this._createDivisions(n);
            }
        }
    }

    finish() {
        if (this.phase === 'count') {
            this._createDivisions(2);
        }
    }

    _createDivisions(n) {
        const spanLen = TransformUtils.distance(this.p1, this.p2);
        const lineLen = Math.max(spanLen, 100);

        const fractions = [];
        for (let i = 1; i < n; i++) {
            fractions.push(i / n);
        }

        const lines = createDivisionLines(this.p1, this.p2, fractions, lineLen);
        for (const line of lines) {
            this.manager.addEntity(line);
        }

        const segLen = spanLen / n;
        this.cmd?.log(`✓ ${n - 1} Teilungslinie(n) — ${n}×${segLen.toFixed(1)} mm (Span: ${spanLen.toFixed(1)} mm)`, 'success');

        this.p1 = null;
        this.p2 = null;
        this.phase = 'p1';
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('CLND — Ersten Punkt angeben (oder ESC):');
        this.manager.renderer?.render();
    }

    getLastPoint() {
        return this.p2 || this.p1 || null;
    }
}


// ─── CLDCL TOOL: Divided Calculation (Dialog-basiert) ───

class CDCLTool extends BaseTool {
    start() {
        this.p1 = null;
        this.p2 = null;
        this.phase = 'p1';
        this.dialogOpen = false;
        this.cmd?.setPrompt('CLDCL — Ersten Punkt angeben (Span-Start):');
    }

    handleClick(point) {
        if (this.dialogOpen && this.phase === 'range_p1') {
            this.p1 = { x: point.x, y: point.y };
            this.phase = 'range_p2';
            this.cmd?.setPrompt('CLDCL — Zweiten Punkt für Range:');
            return;
        }
        if (this.dialogOpen && this.phase === 'range_p2') {
            this.p2 = { x: point.x, y: point.y };
            this.phase = 'dialog';
            this._updateDialogSpan();
            this.cmd?.setPrompt('CLDCL — Parameter im Dialog einstellen');
            return;
        }

        if (this.phase === 'p1') {
            this.p1 = { x: point.x, y: point.y };
            this.phase = 'p2';
            this.cmd?.setPrompt('CLDCL — Zweiten Punkt angeben (Span-Ende):');
            return;
        }
        if (this.phase === 'p2') {
            this.p2 = { x: point.x, y: point.y };
            this.phase = 'dialog';
            this._openDialog();
            return;
        }
    }

    handleMouseMove(point) {
        if ((this.phase === 'p2' || this.phase === 'range_p2') && this.p1) {
            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.p1, end: point }
            };
            this.manager.renderer?.render();
        }
    }

    cancel() {
        this._closeDialog();
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() {
        return this.p2 || this.p1 || null;
    }

    // ─── DIALOG ───

    _openDialog() {
        const dlg = document.getElementById('cldcl-dialog');
        if (!dlg) {
            this.cmd?.log('CLDCL-Dialog nicht gefunden!', 'error');
            return;
        }
        this.dialogOpen = true;
        dlg.style.display = 'flex';
        this._updateDialogSpan();
        this.cmd?.setPrompt('CLDCL — Parameter einstellen, dann OK');
    }

    _closeDialog() {
        const dlg = document.getElementById('cldcl-dialog');
        if (dlg) dlg.style.display = 'none';
        this.dialogOpen = false;
    }

    _updateDialogSpan() {
        if (!this.p1 || !this.p2) return;
        const span = TransformUtils.distance(this.p1, this.p2);
        const spanEl = document.getElementById('cldcl-span-value');
        if (spanEl) spanEl.textContent = span.toFixed(1);
    }

    executeFromDialog() {
        if (!this.p1 || !this.p2) {
            this.cmd?.log('Kein Span definiert!', 'error');
            return;
        }

        const spanLen = TransformUtils.distance(this.p1, this.p2);
        const divType = parseInt(document.getElementById('cldcl-div-type')?.value || '4', 10);
        const jointType = document.querySelector('input[name="cldcl-joint-type"]:checked')?.value || 'none';
        const jointWidth = parseFloat(document.getElementById('cldcl-joint-width')?.value || '0');
        const joint = (jointType === 'joint') ? jointWidth : 0;

        const lengthA = parseFloat(document.getElementById('cldcl-length-a')?.value || '1000');
        const divN = parseInt(document.getElementById('cldcl-div-n')?.value || '5', 10);
        const maxL = parseFloat(document.getElementById('cldcl-max-l')?.value || '3000');

        let fractions = [];

        switch (divType) {
            case 1: fractions = this._calcFixedFromOneSide(spanLen, lengthA, joint); break;
            case 2: fractions = this._calcFixedToBoth(spanLen, lengthA, joint); break;
            case 3: fractions = this._calcFixedToCenter(spanLen, lengthA, joint); break;
            case 4: fractions = this._calcEquallyByNumber(spanLen, divN, joint); break;
            case 5: fractions = this._calcEquallyByMaxLength(spanLen, maxL, joint); break;
        }

        if (fractions.length === 0) {
            this.cmd?.log('Keine Teilungslinien berechnet (Span zu kurz?)', 'error');
            return;
        }

        const lineLen = Math.max(spanLen, 100);
        const lines = createDivisionLines(this.p1, this.p2, fractions, lineLen);
        for (const line of lines) {
            this.manager.addEntity(line);
        }

        const typeNames = ['', 'Fest-einseitig', 'Fest-beidseitig', 'Fest-Mitte', 'Gleich-Anzahl', 'Gleich-MaxLänge'];
        this.cmd?.log(`✓ ${lines.length} Teilungslinie(n) — Modus: ${typeNames[divType]}, Span: ${spanLen.toFixed(1)} mm`, 'success');

        this._closeDialog();
        this.manager.rubberBand = null;
        this.p1 = null;
        this.p2 = null;
        this.phase = 'p1';
        this.cmd?.setPrompt('CLDCL — Ersten Punkt angeben (oder ESC):');
        this.manager.renderer?.render();
    }

    // ─── BERECHNUNGS-ALGORITHMEN ───

    _calcFixedFromOneSide(spanLen, segLen, joint) {
        if (segLen <= 0) return [];
        const fractions = [];
        let pos = segLen;
        while (pos < spanLen - 0.01) {
            fractions.push(pos / spanLen);
            pos += segLen + joint;
        }
        return fractions;
    }

    _calcFixedToBoth(spanLen, segLen, joint) {
        if (segLen <= 0) return [];
        const fractions = [];
        let posL = segLen;
        while (posL < spanLen / 2 - 0.01) {
            fractions.push(posL / spanLen);
            posL += segLen + joint;
        }
        let posR = spanLen - segLen;
        while (posR > spanLen / 2 + 0.01) {
            fractions.push(posR / spanLen);
            posR -= (segLen + joint);
        }
        fractions.sort((a, b) => a - b);
        return this._dedup(fractions);
    }

    _calcFixedToCenter(spanLen, segLen, joint) {
        if (segLen <= 0) return [];
        const fractions = [];
        let posL = segLen;
        while (posL < spanLen - 0.01) {
            fractions.push(posL / spanLen);
            posL += segLen + joint;
        }
        let posR = spanLen - segLen;
        while (posR > 0.01) {
            fractions.push(posR / spanLen);
            posR -= (segLen + joint);
        }
        fractions.sort((a, b) => a - b);
        return this._dedup(fractions);
    }

    _calcEquallyByNumber(spanLen, n, joint) {
        if (n < 2) return [];
        const totalJoint = joint * (n - 1);
        const segLen = (spanLen - totalJoint) / n;
        if (segLen <= 0) return [];

        const fractions = [];
        for (let i = 1; i < n; i++) {
            const pos = i * segLen + (i - 0.5) * joint;
            fractions.push(pos / spanLen);
        }
        return fractions;
    }

    _calcEquallyByMaxLength(spanLen, maxLen, joint) {
        if (maxLen <= 0) return [];
        const n = Math.ceil(spanLen / maxLen);
        if (n < 2) return [];
        return this._calcEquallyByNumber(spanLen, n, joint);
    }

    _dedup(fractions) {
        const result = [];
        for (const f of fractions) {
            if (f > 0.001 && f < 0.999) {
                if (result.length === 0 || Math.abs(f - result[result.length - 1]) > 0.001) {
                    result.push(f);
                }
            }
        }
        return result;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4: REGISTRIERUNG & EXPORTS
// ════════════════════════════════════════════════════════════════════════════

// Tier 4 Tools in DrawingToolManager registrieren (Lazy-Patch)
if (typeof DrawingToolManager !== 'undefined') {
    const _origStartTool = DrawingToolManager.prototype.startTool;
    DrawingToolManager.prototype.startTool = function(shortcut) {
        // Einmalige Registrierung beim ersten Aufruf
        if (!this.tools['CL2D']) {
            this.tools['CL2D']  = () => new CL2DTool(this);
            this.tools['CLND']  = () => new CLNDTool(this);
            this.tools['CLDCL'] = () => new CDCLTool(this);
            console.log('[ToolManager V2.2] ✅ Tier 4 Aufteilungstools registriert');
        }
        return _origStartTool.call(this, shortcut);
    };
}

// Alias: app.js bevorzugt "ToolManager" — auf DrawingToolManager zeigen lassen
if (typeof DrawingToolManager !== 'undefined' && typeof ToolManager === 'undefined') {
    window.ToolManager = DrawingToolManager;
}

// Globale Exports
if (typeof window !== 'undefined') {
    window.TransformUtils = TransformUtils;
}

console.debug('[ToolManager V2.2] ✅ Tier 4 Erweiterung geladen (CL2D, CLND, CLDCL)');
