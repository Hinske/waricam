/**
 * WARICAM Drawing & Modification Tools V2.2
 * AutoCAD-style CAD Tools für WARICAM
 * 
 * Tier 1 – Zeichnen:  Line (L), Circle (C), Rectangle (N), Arc (A), Polyline (P)
 * Tier 2 – Modifizieren: Move (M), Copy (Shift+C), Rotate (R), Mirror (Shift+M),
 *                         Scale (S), Offset (O), Erase (DEL)
 * 
 * - State-Machine pro Tool
 * - Rubber-Band Preview + Ghost-Preview (Modifikation)
 * - Noun-Verb + Verb-Noun Selektion (AutoCAD-Stil)
 * - Window-Selection (Drag-Rechteck)
 * - Integration mit CommandLine + SnapManager + UndoManager
 * 
 * V2.3: AutoCAD Compliance — Aliases (E/REC/CO/RO/MI/SC/TR/PL/F/CH/EX), Continuous Mode, Previous Selection
 * V2.2: FIX _entityToDxfFormat — points+isClosed statt startX/closed (Linien waren nicht selektierbar)
 * V2.0: Tier 2 Modification Tools, Always-Active ToolManager
 * V1.1: handleRawInput für Linie/Rechteck/Polylinie
 * V1.0: Initiale 5 Zeichentools
 * Created: 2026-02-13 MEZ
 * Last Modified: 2026-03-09 MEZ
 * Build: 20260309-autocad
 */

// ════════════════════════════════════════════════════════════════
// DRAWING TOOL MANAGER (erweitert um Modification Tools)
// ════════════════════════════════════════════════════════════════

class DrawingToolManager {

    constructor(options = {}) {
        this.app = options.app;
        this.renderer = options.renderer;
        this.commandLine = options.commandLine;
        this.snapManager = options.snapManager;

        // Aktives Tool
        this.activeTool = null;

        // V2.3: Continuous Mode — Tool-Name merken für Auto-Restart
        this._lastToolKey = null;

        // V2.3: Previous Selection — letzte Selektion merken
        this._previousSelection = [];

        // Gezeichnete Entities (werden bei "Apply" zu Konturen)
        this.entities = [];

        // Rubber-Band State (live-Vorschau für Zeichentools)
        this.rubberBand = null;  // { type: 'line'|'rect'|'circle'|'arc', data: {...} }

        // V2.0: Ghost-Preview (halbtransparente Kopie für Move/Copy/Rotate/Mirror/Scale)
        this.ghostContours = null;  // [ { points: [...], color: string } ] oder null

        // V2.0: Window-Selection (Drag-Rechteck)
        this.windowSelection = null;  // { start: {x,y}, end: {x,y} } oder null

        // Modus (Backward-Kompatibilität: drawMode für Zeichnen-Tab)
        this.drawMode = false;

        // Tool-Registry: Tier 1 (Zeichnen) + Tier 2 (Modifikation) + AutoCAD Aliases
        this.tools = {
            // Tier 1: Zeichnen
            'L':      () => new LineTool(this),
            'LINE':   () => new LineTool(this),
            'C':      () => new CircleTool(this),
            'CIRCLE': () => new CircleTool(this),
            'N':      () => new RectangleTool(this),
            'REC':    () => new RectangleTool(this),       // AutoCAD: REC
            'RECT':   () => new RectangleTool(this),       // AutoCAD: RECT
            'RECTANGLE': () => new RectangleTool(this),
            'A':      () => new ArcTool(this),
            'ARC':    () => new ArcTool(this),
            'P':      () => new PolylineTool(this),
            'PL':     () => new PolylineTool(this),        // AutoCAD: PL
            'PLINE':  () => new PolylineTool(this),        // AutoCAD: PLINE
            // Tier 2: Modifikation
            'M':      () => new MoveTool(this),
            'MOVE':   () => new MoveTool(this),
            'CO':     () => new CopyTool(this),            // AutoCAD: CO
            'COPY':   () => new CopyTool(this),
            'R':      () => new RotateTool(this),
            'RO':     () => new RotateTool(this),          // AutoCAD: RO
            'ROTATE': () => new RotateTool(this),
            'MI':     () => new MirrorTool(this),           // AutoCAD: MI
            'MIRROR': () => new MirrorTool(this),
            'S':      () => new ScaleTool(this),
            'SC':     () => new ScaleTool(this),            // AutoCAD: SC
            'SCALE':  () => new ScaleTool(this),
            'O':      () => new OffsetTool(this),
            'OFFSET': () => new OffsetTool(this),
            'E':      () => new EraseTool(this),            // AutoCAD: E
            'ERASE':  () => new EraseTool(this),
            'DELETE':  () => new EraseTool(this),
            // Tier 3: Geometrie-Operationen
            'X':       () => new ExplodeTool(this),
            'EXPLODE': () => new ExplodeTool(this),
            'J':       () => new JoinTool(this),
            'JOIN':    () => new JoinTool(this),
            'B':       () => new BreakTool(this),
            'BREAK':   () => new BreakTool(this),
        };

        // CommandLine-Callbacks verknüpfen
        if (this.commandLine) {
            this.commandLine.onShortcut = (key) => {
                if (this.activeTool) { this._handleInput(key); } else { this.startTool(key); }
            };
            this.commandLine.onInput = (value) => this._handleInput(value);
            this.commandLine.onEscape = () => this.cancelTool();
            this.commandLine.onEnter = () => this._handleEnter();
            this.commandLine.onBackspace = () => this._handleBackspace();
        }

        console.log('[DrawingTools V2.0] ✅ Initialisiert (Tier 1 + Tier 2)');
    }

    // ════════════════════════════════════════════════════════════════
    // ÖFFENTLICHE API
    // ════════════════════════════════════════════════════════════════

    /** Prüft ob irgendein Tool gerade aktiv ist (Zeichnen ODER Modifikation) */
    isToolActive() {
        return this.activeTool !== null;
    }

    /** Zeichenmodus aktivieren (für Zeichnen-Tab, Backward-Kompatibilität) */
    enterDrawMode() {
        this.drawMode = true;
        this.commandLine?.activate();
        this._setDefaultPrompt();
        if (this.renderer) {
            this.renderer.canvas.style.cursor = 'crosshair';
        }
    }

    /** Zeichenmodus verlassen */
    exitDrawMode() {
        this.cancelTool();
        this.drawMode = false;
        this.commandLine?.deactivate();
        if (this.renderer) {
            this.renderer.canvas.style.cursor = 'default';
        }
    }

    /** Tool per Shortcut starten */
    startTool(shortcut) {
        const key = shortcut.toUpperCase();
        const factory = this.tools[key];

        if (!factory) {
            this.commandLine?.log(`Unbekannter Befehl: "${shortcut}"`, 'error');
            return false;
        }

        // V3.5-fix: Auto-Apply gezeichnete Entities bei Modification-Tool-Start
        const isModTool = ['M','MOVE','COPY','R','ROTATE','MIRROR','S','SCALE','O','OFFSET','ERASE','DELETE'].includes(key);
        if (isModTool && this.entities.length > 0) {
            this.commandLine?.log(`Auto-Apply: ${this.entities.length} gezeichnete Objekte werden übernommen`, 'info');
            this.applyEntities();
        }

        // Vorheriges Tool beenden
        if (this.activeTool) {
            this.activeTool.cancel();
        }

        // Ghost + Window-Selection zurücksetzen
        this.ghostContours = null;
        this.windowSelection = null;

        this.activeTool = factory();
        this.activeTool._toolKey = key;  // V2.3: Tool-Key für Continuous Mode
        this.commandLine?.activate();
        this.activeTool.start();

        // V2.3: Letzte Tool-Key merken für Continuous Mode
        this._lastToolKey = key;

        // V5.2: Letzte Funktion merken für Kontextmenü "Wiederholen"
        if (this.app) this.app.lastToolShortcut = key;

        // Cursor: Crosshair für alle Tools
        if (this.renderer) {
            this.renderer.canvas.style.cursor = 'crosshair';
        }

        return true;
    }

    // V2.3: Continuous Mode — Tool nach Abschluss automatisch neu starten
    restartTool() {
        if (this._lastToolKey) {
            this.startTool(this._lastToolKey);
        }
    }

    // V2.3: Previous Selection speichern (vor Deselect)
    savePreviousSelection() {
        const sel = this.getSelectedContours();
        if (sel.length > 0) {
            this._previousSelection = [...sel];
        }
    }

    // V2.3: Previous Selection wiederherstellen
    restorePreviousSelection() {
        if (this._previousSelection.length === 0) {
            this.commandLine?.log('Keine vorherige Auswahl vorhanden', 'error');
            return;
        }
        // Nur noch existierende Konturen selektieren
        const valid = this._previousSelection.filter(c => this.app?.contours?.includes(c));
        if (valid.length === 0) {
            this.commandLine?.log('Vorherige Konturen nicht mehr vorhanden', 'error');
            return;
        }
        this.app.contours.forEach(c => { c.isSelected = false; });
        for (const c of valid) { c.isSelected = true; }
        this.renderer?.render();
        this.app?.updateContourPanel?.();
        this.commandLine?.log(`${valid.length} Kontur(en) aus vorheriger Auswahl wiederhergestellt`, 'info');
    }

    /** Aktives Tool abbrechen */
    cancelTool() {
        if (this.activeTool) {
            this.activeTool.cancel();
            this.activeTool = null;
        }
        this.rubberBand = null;
        this.ghostContours = null;
        this.commandLine?.clearInput();

        this._setDefaultPrompt();

        // Cursor zurücksetzen
        if (this.renderer) {
            this.renderer.canvas.style.cursor = this.drawMode ? 'crosshair' : 'default';
        }

        this.renderer?.render();
    }

    /** Gezeichnete Entities zu Konturen konvertieren und hinzufügen */
    applyEntities() {
        if (this.entities.length === 0) {
            this.commandLine?.log('Keine gezeichneten Objekte zum Anwenden', 'error');
            return;
        }

        const dxfEntities = this.entities.map(e => this._entityToDxfFormat(e));
        this.commandLine?.log(`${this.entities.length} Objekte werden angewendet...`, 'info');

        if (this.app?.addDrawnEntities) {
            this.app.addDrawnEntities(dxfEntities);
        }

        this.entities = [];
        this.renderer?.render();
    }

    /** Entity hinzufügen (wird von Zeichentools aufgerufen) */
    addEntity(entity) {
        this.entities.push(entity);
        this.snapManager?.setDrawingEntities(this.entities);
        this.commandLine?.log(`✓ ${entity.type} erstellt`, 'success');
        this.renderer?.render();
    }

    /** Letzte Entity entfernen (Undo innerhalb des Zeichnens) */
    removeLastEntity() {
        if (this.entities.length > 0) {
            const removed = this.entities.pop();
            this.snapManager?.setDrawingEntities(this.entities);
            this.commandLine?.log(`↩ ${removed.type} entfernt`, 'info');
            this.renderer?.render();
        }
    }

    // ════════════════════════════════════════════════════════════════
    // V2.0: SELEKTION-HELFER (für Modification Tools)
    // ════════════════════════════════════════════════════════════════

    /** Aktuell selektierte Konturen holen (nicht-Referenz) */
    getSelectedContours() {
        if (!this.app?.contours) return [];
        return this.app.contours.filter(c => c.isSelected && !c.isReference);
    }

    /** Kontur bei Klick finden */
    findContourAtPoint(worldPoint) {
        return this.renderer?.findContourAtPoint(worldPoint.x, worldPoint.y) || null;
    }

    /** Selektion setzen (für Verb-Noun Auswahl-Phase) */
    selectContour(contour, addToSelection = false) {
        if (!this.app?.contours) return;
        if (!addToSelection) {
            this.app.contours.forEach(c => { c.isSelected = false; });
        }
        if (contour && !contour.isReference) {
            contour.isSelected = true;
        }
        this.renderer?.render();
        this.app?.updateContourPanel?.();
    }

    /** Alle Konturen deselektieren */
    deselectAll() {
        if (!this.app?.contours) return;
        this.savePreviousSelection();  // V2.3: Previous Selection merken
        this.app.contours.forEach(c => { c.isSelected = false; });
        this.renderer?.render();
        this.app?.updateContourPanel?.();
    }

    // ════════════════════════════════════════════════════════════════
    // V2.0: WINDOW-SELECTION (Drag-Rechteck)
    // ════════════════════════════════════════════════════════════════

    /** Window-Selection starten (vom Canvas mousedown) */
    startWindowSelection(worldPoint) {
        this.windowSelection = {
            start: { x: worldPoint.x, y: worldPoint.y },
            end: { x: worldPoint.x, y: worldPoint.y }
        };
    }

    /** Window-Selection beenden (vom Canvas mouseup) */
    endWindowSelection(worldPoint, addToSelection = false) {
        if (!this.windowSelection) return;

        const ws = this.windowSelection;
        ws.end = { x: worldPoint.x, y: worldPoint.y };

        const minX = Math.min(ws.start.x, ws.end.x);
        const maxX = Math.max(ws.start.x, ws.end.x);
        const minY = Math.min(ws.start.y, ws.end.y);
        const maxY = Math.max(ws.start.y, ws.end.y);

        // Zu kleines Rechteck ignorieren
        if (maxX - minX < 0.5 && maxY - minY < 0.5) {
            this.windowSelection = null;
            this.renderer?.render();
            return;
        }

        // Links→Rechts = Window (Kontur muss vollständig drin sein)
        // Rechts→Links = Crossing (Kontur muss nur berührt werden)
        const isWindow = ws.end.x >= ws.start.x;

        if (!addToSelection) {
            this.app?.contours?.forEach(c => { c.isSelected = false; });
        }

        let count = 0;
        this.app?.contours?.forEach(c => {
            if (c.isReference || !c.points || c.points.length < 2) return;

            if (isWindow) {
                // Window: ALLE Punkte müssen im Rechteck liegen
                const allInside = c.points.every(p =>
                    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
                );
                if (allInside) { c.isSelected = true; count++; }
            } else {
                // Crossing: Punkt im Rechteck ODER Segment schneidet Rechteck
                const touches = this._contourTouchesRect(c.points, minX, minY, maxX, maxY);
                if (touches) { c.isSelected = true; count++; }
            }
        });

        if (count > 0) {
            this.commandLine?.log(`${count} Kontur(en) ausgewählt (${isWindow ? 'Window' : 'Crossing'})`, 'info');
        }

        this.windowSelection = null;
        this.renderer?.render();
        this.app?.updateContourPanel?.();

        // Wenn ein ModificationTool in der Auswahl-Phase ist, Selektion abschließen
        if (this.activeTool instanceof ModificationTool && this.activeTool.state === 'select') {
            const selected = this.getSelectedContours();
            if (selected.length > 0) {
                this.activeTool._onSelectionComplete(selected);
            }
        }
    }

    /** Crossing-Test: berührt oder schneidet die Kontur das Rechteck? */
    _contourTouchesRect(points, minX, minY, maxX, maxY) {
        if (!points || points.length < 1) return false;
        // Punkt im Rechteck?
        for (const p of points) {
            if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return true;
        }
        // Segment schneidet Rechteck-Kante?
        const rectEdges = [
            { x1: minX, y1: minY, x2: maxX, y2: minY }, // unten
            { x1: maxX, y1: minY, x2: maxX, y2: maxY }, // rechts
            { x1: maxX, y1: maxY, x2: minX, y2: maxY }, // oben
            { x1: minX, y1: maxY, x2: minX, y2: minY }  // links
        ];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            for (const re of rectEdges) {
                if (this._segmentsIntersect(a.x, a.y, b.x, b.y, re.x1, re.y1, re.x2, re.y2)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Segment-Segment Schnitt-Test */
    _segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (Math.abs(denom) < 1e-12) return false;
        const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
        const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    // ════════════════════════════════════════════════════════════════
    // CANVAS EVENT-HANDLER
    // ════════════════════════════════════════════════════════════════

    /** Canvas-Klick — wird von App/Renderer aufgerufen */
    handleClick(worldPoint) {
        // Snap anwenden
        const snapped = this.snapManager?.currentSnap?.point || worldPoint;

        // Ortho anwenden (nur relevant für Zeichentools)
        const lastPt = this.activeTool?.getLastPoint?.() || null;
        const orthoPoint = this.snapManager?.applyOrtho(snapped.x, snapped.y, lastPt) || snapped;
        const finalPoint = this.snapManager?.currentSnap ? snapped : orthoPoint;

        if (this.activeTool) {
            this.activeTool.handleClick(finalPoint);
            return true;
        }

        return false;
    }

    /** Mouse-Move — für Rubber-Band + Ghost-Preview */
    handleMouseMove(worldPoint) {
        if (!this.activeTool) return;

        // Snap + Ortho
        const snapped = this.snapManager?.currentSnap?.point || worldPoint;
        const lastPt = this.activeTool?.getLastPoint?.() || null;
        const orthoPoint = this.snapManager?.applyOrtho(snapped.x, snapped.y, lastPt) || snapped;
        const finalPoint = this.snapManager?.currentSnap ? snapped : orthoPoint;

        this.activeTool.handleMouseMove(finalPoint);
    }

    // ════════════════════════════════════════════════════════════════
    // RENDERING
    // ════════════════════════════════════════════════════════════════

    /** Alle Overlays rendern: Entities, Rubber-Band, Ghost-Preview, Window-Selection */
    drawOverlay(ctx, scale) {
        // Gezeichnete Entities (Tier 1)
        for (const entity of this.entities) {
            this._drawEntity(ctx, entity, scale);
        }

        // Rubber-Band (Zeichentools)
        if (this.rubberBand) {
            this._drawRubberBand(ctx, scale);
        }

        // V2.0: Ghost-Preview (Modifikationstools)
        if (this.ghostContours) {
            this._drawGhostContours(ctx, scale);
        }

        // V2.0: Window-Selection Rechteck
        if (this.windowSelection) {
            this._drawWindowSelection(ctx, scale);
        }
    }

    _drawEntity(ctx, entity, scale) {
        const lineWidth = 1.5 / scale;

        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);

        switch (entity.type) {
            case 'LINE':
                ctx.beginPath();
                ctx.moveTo(entity.start.x, entity.start.y);
                ctx.lineTo(entity.end.x, entity.end.y);
                ctx.stroke();
                break;

            case 'CIRCLE': {
                ctx.beginPath();
                ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
                ctx.stroke();

                // Center-Kreuz
                const cs = 3 / scale;
                ctx.beginPath();
                ctx.moveTo(entity.center.x - cs, entity.center.y);
                ctx.lineTo(entity.center.x + cs, entity.center.y);
                ctx.moveTo(entity.center.x, entity.center.y - cs);
                ctx.lineTo(entity.center.x, entity.center.y + cs);
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 0.5 / scale;
                ctx.stroke();
                break;
            }

            case 'ARC': {
                ctx.beginPath();
                ctx.arc(
                    entity.center.x, entity.center.y,
                    entity.radius,
                    entity.startAngle, entity.endAngle,
                    entity.ccw
                );
                ctx.stroke();
                break;
            }

            case 'RECTANGLE':
            case 'POLYLINE': {
                const pts = entity.points;
                if (pts && pts.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(pts[i].x, pts[i].y);
                    }
                    if (entity.closed) ctx.closePath();
                    ctx.stroke();
                }
                break;
            }

            case 'ELLIPSE':
            case 'SPLINE': {
                const epts = entity.points;
                if (epts && epts.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(epts[0].x, epts[0].y);
                    for (let i = 1; i < epts.length; i++) {
                        ctx.lineTo(epts[i].x, epts[i].y);
                    }
                    if (entity.closed) ctx.closePath();
                    ctx.stroke();
                    if (entity.type === 'ELLIPSE' && entity.center) {
                        const cs2 = 3 / scale;
                        ctx.beginPath();
                        ctx.moveTo(entity.center.x - cs2, entity.center.y);
                        ctx.lineTo(entity.center.x + cs2, entity.center.y);
                        ctx.moveTo(entity.center.x, entity.center.y - cs2);
                        ctx.lineTo(entity.center.x, entity.center.y + cs2);
                        ctx.strokeStyle = '#888';
                        ctx.lineWidth = 0.5 / scale;
                        ctx.stroke();
                    }
                }
                break;
            }
        }

        ctx.restore();
    }

    _drawRubberBand(ctx, scale) {
        const rb = this.rubberBand;
        const lineWidth = 1.0 / scale;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([4 / scale, 4 / scale]);

        switch (rb.type) {
            case 'line':
                ctx.beginPath();
                ctx.moveTo(rb.data.start.x, rb.data.start.y);
                ctx.lineTo(rb.data.end.x, rb.data.end.y);
                ctx.stroke();
                break;

            case 'rect':
                ctx.beginPath();
                ctx.moveTo(rb.data.p1.x, rb.data.p1.y);
                ctx.lineTo(rb.data.p2.x, rb.data.p1.y);
                ctx.lineTo(rb.data.p2.x, rb.data.p2.y);
                ctx.lineTo(rb.data.p1.x, rb.data.p2.y);
                ctx.closePath();
                ctx.stroke();
                break;

            case 'circle':
                ctx.beginPath();
                ctx.arc(rb.data.center.x, rb.data.center.y, rb.data.radius, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'arc':
                if (rb.data.radius > 0) {
                    ctx.beginPath();
                    ctx.arc(
                        rb.data.center.x, rb.data.center.y,
                        rb.data.radius,
                        rb.data.startAngle, rb.data.endAngle,
                        rb.data.ccw
                    );
                    ctx.stroke();
                }
                break;

            case 'polyline': {
                const pts = rb.data.points;
                if (pts && pts.length >= 1) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(pts[i].x, pts[i].y);
                    }
                    if (rb.data.cursorPoint) {
                        ctx.lineTo(rb.data.cursorPoint.x, rb.data.cursorPoint.y);
                    }
                    ctx.stroke();
                }
                break;
            }

            case 'ellipse': {
                const epts = rb.data.points;
                if (epts && epts.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(epts[0].x, epts[0].y);
                    for (let i = 1; i < epts.length; i++) ctx.lineTo(epts[i].x, epts[i].y);
                    ctx.closePath();
                    ctx.stroke();
                }
                break;
            }

            case 'donut': {
                const outer = rb.data.outerPoints;
                if (outer && outer.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(outer[0].x, outer[0].y);
                    for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
                    ctx.closePath();
                    ctx.stroke();
                }
                const inner = rb.data.innerPoints;
                if (inner && inner.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(inner[0].x, inner[0].y);
                    for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
                    ctx.closePath();
                    ctx.stroke();
                }
                break;
            }

            case 'textPreview': {
                const tContours = rb.data.contours;
                if (tContours) {
                    ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
                    for (const tc of tContours) {
                        if (tc.length < 2) continue;
                        ctx.beginPath();
                        ctx.moveTo(tc[0].x, tc[0].y);
                        for (let i = 1; i < tc.length; i++) ctx.lineTo(tc[i].x, tc[i].y);
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
                break;
            }

            // V3.6: Break-Tool — Teilungspunkt-Indikator
            case 'breakPoint': {
                const pt = rb.data.point;
                if (pt) {
                    const r = 4 / scale;
                    // ×-Markierung
                    ctx.strokeStyle = '#ff4444';
                    ctx.lineWidth = 2 / scale;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(pt.x - r, pt.y - r);
                    ctx.lineTo(pt.x + r, pt.y + r);
                    ctx.moveTo(pt.x + r, pt.y - r);
                    ctx.lineTo(pt.x - r, pt.y + r);
                    ctx.stroke();
                    // Kreis drum herum
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, r * 1.5, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255, 68, 68, 0.6)';
                    ctx.stroke();
                }
                break;
            }

            // V3.10: Fillet-Preview — Cyan gestrichelt (Segment-Highlight + Bogen-Vorschau)
            case 'filletPreview': {
                // Highlightete Segmente (Cyan gestrichelt)
                if (rb.data.segments) {
                    ctx.strokeStyle = '#00FFFF';
                    ctx.lineWidth = 2.0 / scale;
                    ctx.setLineDash([6 / scale, 3 / scale]);
                    for (const seg of rb.data.segments) {
                        ctx.beginPath();
                        ctx.moveTo(seg.start.x, seg.start.y);
                        ctx.lineTo(seg.end.x, seg.end.y);
                        ctx.stroke();
                    }
                }
                // Bogen-Preview (Cyan durchgezogen)
                if (rb.data.arcPoints && rb.data.arcPoints.length >= 2) {
                    ctx.strokeStyle = '#00FFFF';
                    ctx.lineWidth = 2.0 / scale;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(rb.data.arcPoints[0].x, rb.data.arcPoints[0].y);
                    for (let i = 1; i < rb.data.arcPoints.length; i++) {
                        ctx.lineTo(rb.data.arcPoints[i].x, rb.data.arcPoints[i].y);
                    }
                    ctx.stroke();
                }
                break;
            }

            // V3.10: Trim-Preview — Rot gestrichelt (Teil der entfernt wird)
            case 'trimPreview': {
                if (rb.data.points && rb.data.points.length >= 2) {
                    ctx.strokeStyle = '#FF4444';
                    ctx.lineWidth = 2.5 / scale;
                    ctx.setLineDash([6 / scale, 3 / scale]);
                    ctx.beginPath();
                    ctx.moveTo(rb.data.points[0].x, rb.data.points[0].y);
                    for (let i = 1; i < rb.data.points.length; i++) {
                        ctx.lineTo(rb.data.points[i].x, rb.data.points[i].y);
                    }
                    ctx.stroke();
                }
                break;
            }

            // V5.5.1: Offset-Preview — Grün halbtransparent (Ghost)
            case 'offsetPreview': {
                if (rb.data.points && rb.data.points.length >= 2) {
                    ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
                    ctx.lineWidth = 2.0 / scale;
                    ctx.setLineDash([8 / scale, 4 / scale]);
                    ctx.beginPath();
                    ctx.moveTo(rb.data.points[0].x, rb.data.points[0].y);
                    for (let i = 1; i < rb.data.points.length; i++) {
                        ctx.lineTo(rb.data.points[i].x, rb.data.points[i].y);
                    }
                    if (rb.data.closed) ctx.closePath();
                    ctx.stroke();
                }
                break;
            }
        }

        ctx.restore();
    }

    /** V2.0: Ghost-Konturen zeichnen (halbtransparent, gestrichelt) */
    _drawGhostContours(ctx, scale) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.lineWidth = 1.5 / scale;

        for (const ghost of this.ghostContours) {
            if (!ghost.points || ghost.points.length < 2) continue;

            ctx.strokeStyle = ghost.color || '#00ff88';
            ctx.beginPath();
            ctx.moveTo(ghost.points[0].x, ghost.points[0].y);
            for (let i = 1; i < ghost.points.length; i++) {
                ctx.lineTo(ghost.points[i].x, ghost.points[i].y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    /** V2.0: Window-Selection Rechteck zeichnen */
    _drawWindowSelection(ctx, scale) {
        const ws = this.windowSelection;
        if (!ws || !ws.start || !ws.end) return;

        const isWindow = ws.end.x >= ws.start.x;  // Links→Rechts = Window, Rechts→Links = Crossing

        ctx.save();

        // Füllung
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = isWindow ? '#0088ff' : '#00ff44';
        ctx.fillRect(
            Math.min(ws.start.x, ws.end.x),
            Math.min(ws.start.y, ws.end.y),
            Math.abs(ws.end.x - ws.start.x),
            Math.abs(ws.end.y - ws.start.y)
        );

        // Rahmen
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = isWindow ? '#0088ff' : '#00ff44';
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash(isWindow ? [] : [6 / scale, 4 / scale]);  // Window=durchgezogen, Crossing=gestrichelt
        ctx.strokeRect(
            Math.min(ws.start.x, ws.end.x),
            Math.min(ws.start.y, ws.end.y),
            Math.abs(ws.end.x - ws.start.x),
            Math.abs(ws.end.y - ws.start.y)
        );

        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE HELFER
    // ════════════════════════════════════════════════════════════════

    /** Standard-Prompt anzeigen */
    _setDefaultPrompt() {
        this.commandLine?.setPrompt('Befehl (L C N A P | M CO RO MI SC E O X J B | REC PL ...)');
    }

    _handleInput(value) {
        console.log('[DTM] _handleInput: value="' + value + '", activeTool=' + (this.activeTool ? this.activeTool.constructor.name : 'null'));
        if (!this.activeTool) {
            // Kein Tool aktiv → vielleicht Shortcut?
            this.startTool(value);
            return;
        }

        // Tool darf Eingabe direkt verarbeiten (z.B. Rechteck: "100,100" = Dimensionen)
        if (this.activeTool.handleRawInput?.(value)) {
            console.log('[DTM] handleRawInput returned true');
            return;
        }

        // Parse Eingabe
        const lastPt = this.activeTool.getLastPoint?.() || null;
        const parsed = CommandLine.parseInput(value, lastPt);

        if (!parsed) {
            this.commandLine?.log(`Ungültige Eingabe: "${value}"`, 'error');
            return;
        }

        if (parsed.type === 'option') {
            const toolWantsIt = this.activeTool.acceptsOption?.(parsed.option);
            if (!toolWantsIt && this.tools[parsed.option]) {
                // Tool-Shortcut → Tool wechseln
                this.startTool(parsed.option);
            } else {
                this.activeTool.handleOption(parsed.option);
            }
        } else if (parsed.type === 'point') {
            this.activeTool.handleClick({ x: parsed.x, y: parsed.y });
        } else if (parsed.type === 'distance') {
            this.activeTool.handleDistance(parsed.value);
        }
    }

    _handleEnter() {
        if (this.activeTool) {
            this.activeTool.finish();
        }
    }

    _handleBackspace() {
        if (this.activeTool?.handleUndo) {
            this.activeTool.handleUndo();
        }
    }

    /** Entity in DXF-Parser-kompatibles Format konvertieren */
    _entityToDxfFormat(entity) {
        // V2.1 FIX: Format muss zu chainContours passen (points + isClosed)
        switch (entity.type) {
            case 'LINE':
                return {
                    type: 'LINE',
                    points: [
                        { x: entity.start.x, y: entity.start.y },
                        { x: entity.end.x, y: entity.end.y }
                    ],
                    isClosed: false,
                    layer: entity.layer || 'DRAW'
                };

            case 'CIRCLE': {
                const pts = [];
                const n = 64;
                for (let i = 0; i <= n; i++) {
                    const a = (i / n) * Math.PI * 2;
                    pts.push({
                        x: entity.center.x + entity.radius * Math.cos(a),
                        y: entity.center.y + entity.radius * Math.sin(a)
                    });
                }
                return { type: 'LWPOLYLINE', points: pts, isClosed: true, layer: entity.layer || 'DRAW' };
            }

            case 'ARC': {
                const pts = [];
                const n = 32;
                let startA = entity.startAngle;
                let endA = entity.endAngle;
                if (entity.ccw && endA < startA) endA += Math.PI * 2;
                if (!entity.ccw && startA < endA) startA += Math.PI * 2;

                for (let i = 0; i <= n; i++) {
                    const t = i / n;
                    const a = entity.ccw
                        ? startA + t * (endA - startA)
                        : startA - t * (startA - endA);
                    pts.push({
                        x: entity.center.x + entity.radius * Math.cos(a),
                        y: entity.center.y + entity.radius * Math.sin(a)
                    });
                }
                return { type: 'LWPOLYLINE', points: pts, isClosed: false, layer: entity.layer || 'DRAW' };
            }

            case 'RECTANGLE':
            case 'POLYLINE':
                return {
                    type: 'LWPOLYLINE',
                    points: entity.points.map(p => ({ x: p.x, y: p.y })),
                    isClosed: entity.closed || false,
                    layer: entity.layer || 'DRAW'
                };

            case 'ELLIPSE':
                return {
                    type: 'LWPOLYLINE',
                    points: entity.points.map(p => ({ x: p.x, y: p.y })),
                    isClosed: true,
                    layer: entity.layer || 'DRAW'
                };

            case 'SPLINE':
                return {
                    type: 'LWPOLYLINE',
                    points: entity.points.map(p => ({ x: p.x, y: p.y })),
                    isClosed: entity.closed || false,
                    layer: entity.layer || 'DRAW'
                };

            default:
                return entity;
        }
    }
}


// ════════════════════════════════════════════════════════════════
// BASE TOOL (Basisklasse für alle Tools)
// ════════════════════════════════════════════════════════════════

class BaseTool {
    constructor(manager) {
        this.manager = manager;
        this.cmd = manager.commandLine;
    }

    start() {}
    handleClick(point) {}
    handleMouseMove(point) {}
    handleOption(option) {}
    handleDistance(value) {}
    handleRawInput(value) { return false; }
    handleUndo() {}
    acceptsOption(opt) { return false; }
    finish() { this.cancel(); }
    cancel() {
        this.manager.rubberBand = null;
        this.manager.ghostContours = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }
    getLastPoint() { return null; }
}


// ════════════════════════════════════════════════════════════════
// MODIFICATION TOOL (Basisklasse für Tier 2, V2.0)
// ════════════════════════════════════════════════════════════════

class ModificationTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.state = 'select';            // 'select' | tool-spezifisch
        this.selectedContours = [];       // CamContour-Referenzen
        this.selectionLocked = false;     // true wenn Selektion abgeschlossen
    }

    /** Tool starten: Noun-Verb oder Verb-Noun? */
    start() {
        // Prüfe ob bereits Konturen selektiert sind (Noun-Verb)
        const preSelected = this.manager.getSelectedContours();

        if (preSelected.length > 0) {
            // Noun-Verb: Selektion übernehmen, direkt zum nächsten Schritt
            this.selectedContours = [...preSelected];
            this.selectionLocked = true;
            this.cmd?.log(`${this.getToolName()}: ${this.selectedContours.length} Objekt(e) ausgewählt`, 'info');
            this._onSelectionComplete(this.selectedContours);
        } else {
            // Verb-Noun: Auswahl-Phase starten
            this.state = 'select';
            this.cmd?.setPrompt(`${this.getToolName()} — Objekte wählen (Klick/Fenster, P=Vorherige, Enter = fertig):`);
        }
    }

    // V2.3: "P" = Previous Selection in der Auswahl-Phase
    acceptsOption(opt) {
        return opt === 'P' && this.state === 'select';
    }

    handleOption(option) {
        if (option === 'P' && this.state === 'select') {
            this.manager.restorePreviousSelection();
            const selected = this.manager.getSelectedContours();
            if (selected.length > 0) {
                this.selectedContours = [...selected];
                this.selectionLocked = true;
                this._onSelectionComplete(this.selectedContours);
            }
            return;
        }
    }

    /** Klick in der Auswahl-Phase */
    handleClick(point) {
        if (this.state === 'select') {
            // Kontur am Klickpunkt finden
            const contour = this.manager.findContourAtPoint(point);
            if (contour && !contour.isReference) {
                contour.isSelected = !contour.isSelected;
                this.manager.renderer?.render();
                this.manager.app?.updateContourPanel?.();

                const count = this.manager.getSelectedContours().length;
                this.cmd?.setPrompt(`${this.getToolName()} — ${count} Objekt(e) ausgewählt (Klick=+/-, Enter=fertig):`);
            }
            return;
        }

        // Subklasse übernimmt (überschreibt handleClick)
    }

    /** Enter in der Auswahl-Phase → Selektion abschließen */
    finish() {
        if (this.state === 'select') {
            const selected = this.manager.getSelectedContours();
            if (selected.length === 0) {
                this.cmd?.log(`${this.getToolName()}: Keine Objekte ausgewählt`, 'error');
                return;
            }
            this.selectedContours = [...selected];
            this.selectionLocked = true;
            this._onSelectionComplete(this.selectedContours);
            return;
        }

        // Subklasse kann finish() überschreiben
    }

    /** Wird aufgerufen wenn Selektion abgeschlossen ist — Subklasse überschreibt */
    _onSelectionComplete(contours) {
        // Subklassen überschreiben diese Methode
    }

    /** Tool-Name für Prompts */
    getToolName() { return 'MODIFY'; }

    cancel() {
        this.selectedContours = [];
        this.selectionLocked = false;
        super.cancel();
    }

    // ════════════════════════════════════════════════════════════════
    // GEOMETRIE-HELFER (für Transformationen)
    // ════════════════════════════════════════════════════════════════

    /** Deep-Copy aller Punkte einer Kontur */
    static deepCopyPoints(contour) {
        return contour.points.map(p => ({ x: p.x, y: p.y }));
    }

    /** Kerf/Lead-Caches einer Kontur invalidieren (nach Punkt-Änderungen) */
    static invalidateCache(contour) {
        contour._cachedKerfPolyline = null;
        contour._cacheKey = null;
        contour._cachedLeadInPath = null;
        contour._cachedLeadOutPath = null;
        contour._cachedOvercutPath = null;
    }

    /** Punkte-Array um Vektor verschieben (in-place) */
    static translatePoints(points, dx, dy) {
        for (const p of points) {
            p.x += dx;
            p.y += dy;
        }
    }

    /** Punkte-Array um Zentrum rotieren (in-place) */
    static rotatePoints(points, centerX, centerY, angleRad) {
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        for (const p of points) {
            const dx = p.x - centerX;
            const dy = p.y - centerY;
            p.x = centerX + dx * cos - dy * sin;
            p.y = centerY + dx * sin + dy * cos;
        }
    }

    /** Punkte-Array an Achse spiegeln (in-place) */
    static mirrorPoints(points, lineP1, lineP2) {
        const dx = lineP2.x - lineP1.x;
        const dy = lineP2.y - lineP1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return;

        for (const p of points) {
            const t = ((p.x - lineP1.x) * dx + (p.y - lineP1.y) * dy) / lenSq;
            const projX = lineP1.x + t * dx;
            const projY = lineP1.y + t * dy;
            p.x = 2 * projX - p.x;
            p.y = 2 * projY - p.y;
        }
    }

    /** Punkte-Array skalieren (in-place) */
    static scalePoints(points, centerX, centerY, factorX, factorY) {
        for (const p of points) {
            p.x = centerX + (p.x - centerX) * factorX;
            p.y = centerY + (p.y - centerY) * factorY;
        }
    }

    /** Ghost-Preview für transformierte Konturen erzeugen */
    _createGhostPreview(contours, transformFn) {
        return contours.map(c => {
            const ghostPoints = ModificationTool.deepCopyPoints(c);
            transformFn(ghostPoints);
            return {
                points: ghostPoints,
                color: '#00ff88'
            };
        });
    }
}


// ════════════════════════════════════════════════════════════════
// MOVE TOOL (M)
// ════════════════════════════════════════════════════════════════

class MoveTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
    }

    getToolName() { return 'MOVE'; }

    start() {
        this.cmd?.log('📦 Move: Objekte wählen → Basispunkt → Zielpunkt', 'info');
        super.start();
    }

    _onSelectionComplete(contours) {
        this.state = 'basepoint';
        this.cmd?.setPrompt(`MOVE (${contours.length} Obj.) — Basispunkt angeben:`);
    }

    handleClick(point) {
        // Auswahl-Phase
        if (this.state === 'select') {
            super.handleClick(point);
            return;
        }

        // Basispunkt setzen
        if (this.state === 'basepoint') {
            this.basePoint = { x: point.x, y: point.y };
            this.state = 'destination';
            this.cmd?.setPrompt('MOVE — Zweiten Punkt angeben oder <dx,dy>:');
            return;
        }

        // Zielpunkt → Verschiebung ausführen
        if (this.state === 'destination') {
            this._executeMove(point);
            return;
        }
    }

    handleMouseMove(point) {
        if (this.state === 'destination' && this.basePoint) {
            const dx = point.x - this.basePoint.x;
            const dy = point.y - this.basePoint.y;

            // Ghost-Preview: Konturen an neuer Position
            this.manager.ghostContours = this._createGhostPreview(
                this.selectedContours,
                (pts) => ModificationTool.translatePoints(pts, dx, dy)
            );

            // Rubber-Band: Linie von Basispunkt zum Cursor
            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.basePoint, end: point }
            };

            this.manager.renderer?.render();
        }
    }

    /** "100,50" als relativer Versatz */
    handleRawInput(value) {
        if (this.state !== 'destination' || !this.basePoint) return false;
        const trimmed = value.trim();
        if (trimmed.startsWith('@')) return false;

        const parts = trimmed.split(/[,\s]+/).map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            const target = {
                x: this.basePoint.x + parts[0],
                y: this.basePoint.y + parts[1]
            };
            this.cmd?.log(`→ Versatz (${parts[0]}, ${parts[1]}) mm`, 'info');
            this._executeMove(target);
            return true;
        }
        return false;
    }

    handleDistance(value) {
        if (this.state !== 'destination' || !this.basePoint) return;

        // Distanz in aktueller Mausrichtung
        const rb = this.manager.rubberBand;
        let angle = 0;
        if (rb?.data?.end) {
            angle = Math.atan2(rb.data.end.y - this.basePoint.y, rb.data.end.x - this.basePoint.x);
        }

        const target = {
            x: this.basePoint.x + value * Math.cos(angle),
            y: this.basePoint.y + value * Math.sin(angle)
        };
        this.cmd?.log(`→ Distanz ${value.toFixed(2)} mm, Richtung ${(angle * 180 / Math.PI).toFixed(1)}°`, 'info');
        this._executeMove(target);
    }

    _executeMove(targetPoint) {
        const dx = targetPoint.x - this.basePoint.x;
        const dy = targetPoint.y - this.basePoint.y;

        if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
            this.cmd?.log('Move: Kein Versatz — abgebrochen', 'warning');
            this._finishTool();
            return;
        }

        // Snapshots VOR der Transformation (für Undo)
        const snapshots = this.selectedContours.map(c => ({
            contour: c,
            oldPoints: ModificationTool.deepCopyPoints(c)
        }));

        // Transformation ausführen
        for (const c of this.selectedContours) {
            ModificationTool.translatePoints(c.points, dx, dy);
            ModificationTool.invalidateCache(c);
        }

        // Undo-Command registrieren
        const app = this.manager.app;
        const contours = [...this.selectedContours];
        const newSnapshots = contours.map(c => ({
            contour: c,
            newPoints: ModificationTool.deepCopyPoints(c)
        }));

        const cmd = new FunctionCommand(
            `Move (${contours.length} Konturen, Δ${dx.toFixed(1)},${dy.toFixed(1)})`,
            () => {
                // Redo: Neue Punkte setzen
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = newSnapshots[i].newPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            },
            () => {
                // Undo: Alte Punkte zurücksetzen
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = snapshots[i].oldPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            }
        );

        // Bereits ausgeführt → direkt auf Stack
        app?.undoManager?.undoStack.push(cmd);
        app?.undoManager?.redoStack && (app.undoManager.redoStack.length = 0);
        app?.undoManager?._notifyStateChange?.();

        this.cmd?.log(`✓ ${contours.length} Kontur(en) verschoben um (${dx.toFixed(2)}, ${dy.toFixed(2)}) mm`, 'success');
        app?.showToast?.(`📦 ${contours.length} Konturen verschoben (STRG+Z = Rückgängig)`, 'success');

        this._finishTool();
    }

    _finishTool() {
        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        // V2.3: Continuous Mode — Tool automatisch neu starten
        this.manager.restartTool();
    }

    finish() {
        if (this.state === 'select') {
            super.finish();
            return;
        }
        // In anderen States: Tool beenden
        this._finishTool();
    }

    getLastPoint() { return this.basePoint; }
}


// ════════════════════════════════════════════════════════════════
// COPY TOOL (Shift+C) — wie Move, aber Original bleibt
// ════════════════════════════════════════════════════════════════

class CopyTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
        this.arrayCount = 0;    // 0 = normaler Modus, >0 = Anordnung-Modus
        this.copyCount = 0;
    }

    getToolName() { return 'COPY'; }

    start() {
        this.cmd?.log('📋 Copy: Objekte wählen → Basispunkt → Zielpunkt [A=Anordnung]', 'info');
        super.start();
    }

    _onSelectionComplete(contours) {
        this.state = 'basepoint';
        this.cmd?.setPrompt(`COPY (${contours.length} Obj.) — Basispunkt angeben:`);
    }

    acceptsOption(opt) { return opt === 'A' && this.state === 'destination'; }

    handleOption(option) {
        if (option === 'A' && this.state === 'destination') {
            this.state = 'array_count';
            this.cmd?.setPrompt('COPY [Anordnung] — Anzahl Kopien eingeben:');
            this.cmd?.log('📐 Anordnung: Anzahl eingeben, dann Zielpunkt → gleichmäßig verteilt', 'info');
        }
    }

    handleClick(point) {
        if (this.state === 'select') { super.handleClick(point); return; }

        if (this.state === 'basepoint') {
            this.basePoint = { x: point.x, y: point.y };
            this.state = 'destination';
            this.cmd?.setPrompt('COPY — Zielpunkt angeben [A=Anordnung] oder <dx,dy>:');
            return;
        }

        if (this.state === 'destination' || this.state === 'array_dest') {
            this._executeCopy(point);
            return;
        }
    }

    handleMouseMove(point) {
        if ((this.state === 'destination' || this.state === 'array_dest') && this.basePoint) {
            const dx = point.x - this.basePoint.x;
            const dy = point.y - this.basePoint.y;

            // Ghost-Preview: Bei Anordnung alle N Kopien zeigen
            if (this.arrayCount > 0) {
                const ghosts = [];
                for (let i = 1; i <= this.arrayCount; i++) {
                    for (const c of this.selectedContours) {
                        const ghostPts = ModificationTool.deepCopyPoints(c);
                        ModificationTool.translatePoints(ghostPts, dx * i, dy * i);
                        ghosts.push({ points: ghostPts, color: '#00ff88' });
                    }
                }
                this.manager.ghostContours = ghosts;
            } else {
                this.manager.ghostContours = this._createGhostPreview(
                    this.selectedContours,
                    (pts) => ModificationTool.translatePoints(pts, dx, dy)
                );
            }

            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.basePoint, end: point }
            };

            this.manager.renderer?.render();
        }
    }

    handleRawInput(value) {
        // Anordnung: Anzahl eingeben
        if (this.state === 'array_count') {
            const n = parseInt(value.trim(), 10);
            if (isNaN(n) || n < 1 || n > 1000) {
                this.cmd?.log('Ungültige Anzahl (1–1000)', 'error');
                return true;
            }
            this.arrayCount = n;
            this.state = 'array_dest';
            this.cmd?.setPrompt(`COPY [Anordnung ×${n}] — Abstand pro Kopie angeben (Klick/Zahl/dx,dy):`);
            this.cmd?.log(`→ ${n} Kopien mit gleichem Abstand`, 'info');
            return true;
        }

        // destination / array_dest: dx,dy Versatz
        if ((this.state !== 'destination' && this.state !== 'array_dest') || !this.basePoint) return false;
        const parts = value.trim().split(/[,\s]+/).map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            const target = { x: this.basePoint.x + parts[0], y: this.basePoint.y + parts[1] };
            this.cmd?.log(`→ Versatz (${parts[0]}, ${parts[1]}) mm`, 'info');
            this._executeCopy(target);
            return true;
        }
        return false;
    }

    /** Distanz-Eingabe: "5" = 5mm in aktueller Mausrichtung */
    handleDistance(value) {
        // Anordnung: Anzahl als Zahl
        if (this.state === 'array_count') {
            const n = Math.max(1, Math.min(1000, Math.floor(value)));
            this.arrayCount = n;
            this.state = 'array_dest';
            this.cmd?.setPrompt(`COPY [Anordnung ×${n}] — Abstand pro Kopie angeben (Klick/Zahl/dx,dy):`);
            this.cmd?.log(`→ ${n} Kopien mit gleichem Abstand`, 'info');
            return;
        }

        if ((this.state !== 'destination' && this.state !== 'array_dest') || !this.basePoint) return;

        // Richtung aus RubberBand (Mausposition)
        const rb = this.manager.rubberBand;
        let angle = 0;
        if (rb?.data?.end) {
            angle = Math.atan2(rb.data.end.y - this.basePoint.y, rb.data.end.x - this.basePoint.x);
        }

        const target = {
            x: this.basePoint.x + value * Math.cos(angle),
            y: this.basePoint.y + value * Math.sin(angle)
        };
        this.cmd?.log(`→ Distanz ${value.toFixed(2)} mm, Richtung ${(angle * 180 / Math.PI).toFixed(1)}°`, 'info');
        this._executeCopy(target);
    }

    /** Einen Klon einer Kontur erstellen */
    _cloneContour(src, dx, dy) {
        const pts = ModificationTool.deepCopyPoints(src);
        ModificationTool.translatePoints(pts, dx, dy);

        if (typeof CamContour !== 'undefined' && src instanceof CamContour) {
            if (typeof src.clone === 'function') {
                const clone = src.clone();
                clone.points = pts;
                clone.name = (src.name || 'Kontur') + ' (Kopie)';
                clone.isSelected = false;
                return clone;
            }
            const clone = new CamContour(pts, {
                name: (src.name || 'Kontur') + ' (Kopie)',
                cuttingMode: src.cuttingMode,
                kerfWidth: src.kerfWidth,
                quality: src.quality,
                layer: src.layer,
                leadInType: src.leadInType,
                leadInLength: src.leadInLength,
                leadInRadius: src.leadInRadius,
                leadInAngle: src.leadInAngle,
                leadOutType: src.leadOutType,
                leadOutLength: src.leadOutLength,
                leadOutRadius: src.leadOutRadius,
                leadOutAngle: src.leadOutAngle,
                overcutLength: src.overcutLength,
            });
            clone.isSelected = false;
            return clone;
        }
        return { ...src, points: pts, name: (src.name || 'Kontur') + ' (Kopie)', isSelected: false };
    }

    _executeCopy(targetPoint) {
        const dx = targetPoint.x - this.basePoint.x;
        const dy = targetPoint.y - this.basePoint.y;
        const app = this.manager.app;

        let clones = [];

        if (this.arrayCount > 0) {
            // ═══ ANORDNUNG: N Kopien mit gleichem Abstand ═══
            for (let i = 1; i <= this.arrayCount; i++) {
                for (const c of this.selectedContours) {
                    clones.push(this._cloneContour(c, dx * i, dy * i));
                }
            }
            console.log(`[COPY Array] ${this.arrayCount} × ${this.selectedContours.length} = ${clones.length} Kopien, Δ(${dx.toFixed(1)},${dy.toFixed(1)}) pro Kopie`);
        } else {
            // ═══ NORMAL: 1 Kopie ═══
            for (const c of this.selectedContours) {
                clones.push(this._cloneContour(c, dx, dy));
            }
        }

        // Über UndoManager hinzufügen
        const addCmd = new AddContoursCommand(
            app.contours,
            clones,
            app.contours.length,
            () => {
                app.rebuildCutOrder?.();
                app.renderer?.setContours(app.contours);
                app.updateContourPanel?.();
            }
        );
        app?.undoManager?.execute(addCmd);

        // Feedback
        this.copyCount += (this.arrayCount > 0 ? this.arrayCount : 1);
        if (this.arrayCount > 0) {
            this.cmd?.log(`✓ Anordnung: ${this.arrayCount} × ${this.selectedContours.length} = ${clones.length} Kopien (Δ${dx.toFixed(1)},${dy.toFixed(1)} mm pro Kopie)`, 'success');
            app?.showToast?.(`📐 ${clones.length} Kopien angeordnet (STRG+Z = Rückgängig)`, 'success');
            // Anordnung beendet Tool (wie AutoCAD)
            this._finishTool();
        } else {
            this.cmd?.log(`✓ Kopie #${this.copyCount}: ${clones.length} Kontur(en) (Δ${dx.toFixed(1)},${dy.toFixed(1)} mm)`, 'success');
            app?.showToast?.(`📋 Kopie #${this.copyCount} erstellt (weitere platzieren oder ESC)`, 'success');
            // Mehrfach-Kopie: Im destination-State bleiben
            this.manager.ghostContours = null;
            this.manager.rubberBand = null;
            this.manager.renderer?.render();
            this.cmd?.setPrompt(`COPY — Nächsten Zielpunkt angeben [A=Anordnung] (ESC/Enter = fertig):`);
        }
    }

    _finishTool() {
        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        // V2.3: Continuous Mode
        this.manager.restartTool();
    }

    finish() {
        if (this.state === 'select') { super.finish(); return; }
        if (this.copyCount > 0) {
            this.cmd?.log(`COPY abgeschlossen: ${this.copyCount} Kopie(n)`, 'success');
        }
        this._finishTool();
    }

    cancel() {
        if ((this.state === 'destination' || this.state === 'array_dest') && this.copyCount > 0) {
            this.cmd?.log(`COPY abgeschlossen: ${this.copyCount} Kopie(n)`, 'success');
            this._finishTool();
            return;
        }
        super.cancel();
    }

    getLastPoint() { return this.basePoint; }
}


// ════════════════════════════════════════════════════════════════
// ROTATE TOOL (R)
// ════════════════════════════════════════════════════════════════

class RotateTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
        this.referenceAngle = null;
    }

    getToolName() { return 'ROTATE'; }

    start() {
        this.cmd?.log('🔄 Rotate: Objekte wählen → Basispunkt → Winkel', 'info');
        super.start();
    }

    _onSelectionComplete(contours) {
        this.state = 'basepoint';
        this.cmd?.setPrompt(`ROTATE (${contours.length} Obj.) — Basispunkt angeben:`);
    }

    handleClick(point) {
        if (this.state === 'select') { super.handleClick(point); return; }

        if (this.state === 'basepoint') {
            this.basePoint = { x: point.x, y: point.y };
            this.state = 'angle';
            this.cmd?.setPrompt('ROTATE — Winkel angeben (Grad) oder Punkt für Referenzwinkel:');
            return;
        }

        if (this.state === 'angle') {
            // Klick = Richtungswinkel vom Basispunkt
            const angle = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
            if (this.referenceAngle === null) {
                this.referenceAngle = angle;
                this.state = 'newangle';
                this.cmd?.setPrompt('ROTATE — Neuen Winkel angeben (Punkt oder Grad):');
            } else {
                this._executeRotation(angle - this.referenceAngle);
            }
            return;
        }

        if (this.state === 'newangle') {
            const newAngle = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
            this._executeRotation(newAngle - this.referenceAngle);
            return;
        }
    }

    handleMouseMove(point) {
        if ((this.state === 'angle' || this.state === 'newangle') && this.basePoint) {
            const currentAngle = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
            const rotAngle = this.referenceAngle !== null
                ? currentAngle - this.referenceAngle
                : currentAngle;

            this.manager.ghostContours = this._createGhostPreview(
                this.selectedContours,
                (pts) => ModificationTool.rotatePoints(pts, this.basePoint.x, this.basePoint.y, rotAngle)
            );

            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.basePoint, end: point }
            };

            this.manager.renderer?.render();
        }
    }

    handleDistance(value) {
        if ((this.state === 'angle' || this.state === 'newangle') && this.basePoint) {
            const angleRad = value * Math.PI / 180;
            this.cmd?.log(`→ Rotation ${value}°`, 'info');
            this._executeRotation(angleRad);
        }
    }

    _executeRotation(angleRad) {
        const app = this.manager.app;
        const cx = this.basePoint.x;
        const cy = this.basePoint.y;

        const snapshots = this.selectedContours.map(c => ({
            contour: c,
            oldPoints: ModificationTool.deepCopyPoints(c)
        }));

        for (const c of this.selectedContours) {
            ModificationTool.rotatePoints(c.points, cx, cy, angleRad);
            ModificationTool.invalidateCache(c);
        }

        const contours = [...this.selectedContours];
        const newSnapshots = contours.map(c => ({
            contour: c,
            newPoints: ModificationTool.deepCopyPoints(c)
        }));

        const angleDeg = (angleRad * 180 / Math.PI).toFixed(1);
        const cmd = new FunctionCommand(
            `Rotate (${contours.length} Konturen, ${angleDeg}°)`,
            () => {
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = newSnapshots[i].newPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            },
            () => {
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = snapshots[i].oldPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            }
        );

        app?.undoManager?.undoStack.push(cmd);
        app?.undoManager?.redoStack && (app.undoManager.redoStack.length = 0);
        app?.undoManager?._notifyStateChange?.();

        this.cmd?.log(`✓ ${contours.length} Kontur(en) rotiert um ${angleDeg}°`, 'success');
        app?.showToast?.(`🔄 ${contours.length} Konturen rotiert (STRG+Z = Rückgängig)`, 'success');

        this._finishTool();
    }

    _finishTool() {
        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        // V2.3: Continuous Mode
        this.manager.restartTool();
    }

    finish() {
        if (this.state === 'select') { super.finish(); return; }
        this._finishTool();
    }

    getLastPoint() { return this.basePoint; }
}


// ════════════════════════════════════════════════════════════════
// MIRROR TOOL (Shift+M)
// ════════════════════════════════════════════════════════════════

class MirrorTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.lineP1 = null;
        this.lineP2 = null;
        this.mirroredClones = null;
    }

    getToolName() { return 'MIRROR'; }

    start() {
        this.cmd?.log('🪞 Mirror: Objekte wählen → Spiegelachse (2 Punkte) → Quelle löschen?', 'info');
        console.log('[MirrorTool] gestartet (AutoCAD-Stil: Kopie + Quelle-löschen-Abfrage)');
        super.start();
    }

    _onSelectionComplete(contours) {
        this.state = 'line_p1';
        this.cmd?.setPrompt(`MIRROR (${contours.length} Obj.) — 1. Punkt der Spiegelachse:`);
    }

    handleClick(point) {
        if (this.state === 'select') { super.handleClick(point); return; }

        if (this.state === 'line_p1') {
            this.lineP1 = { x: point.x, y: point.y };
            this.state = 'line_p2';
            this.cmd?.setPrompt('MIRROR — 2. Punkt der Spiegelachse:');
            return;
        }

        if (this.state === 'line_p2') {
            this._executeMirror(point);
            return;
        }
    }

    handleMouseMove(point) {
        if (this.state === 'line_p2' && this.lineP1) {
            this.manager.ghostContours = this._createGhostPreview(
                this.selectedContours,
                (pts) => ModificationTool.mirrorPoints(pts, this.lineP1, point)
            );

            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.lineP1, end: point }
            };

            this.manager.renderer?.render();
        }
    }

    _executeMirror(lineP2) {
        console.time('[MirrorTool] _executeMirror');
        const app = this.manager.app;
        this.lineP2 = { ...lineP2 };

        // Gespiegelte KLONE erzeugen (Originale bleiben unverändert!)
        this.mirroredClones = this.selectedContours.map(c => {
            const pts = ModificationTool.deepCopyPoints(c);
            ModificationTool.mirrorPoints(pts, this.lineP1, lineP2);

            if (typeof CamContour !== 'undefined' && c instanceof CamContour) {
                if (typeof c.clone === 'function') {
                    const clone = c.clone();
                    clone.points = pts;
                    clone.name = (c.name || 'Kontur') + ' (Spiegel)';
                    clone.isSelected = false;
                    return clone;
                }
                const clone = new CamContour(pts, {
                    name: (c.name || 'Kontur') + ' (Spiegel)',
                    cuttingMode: c.cuttingMode, kerfWidth: c.kerfWidth,
                    quality: c.quality, layer: c.layer,
                    leadInType: c.leadInType, leadInLength: c.leadInLength,
                    leadInRadius: c.leadInRadius, leadInAngle: c.leadInAngle,
                    leadOutType: c.leadOutType, leadOutLength: c.leadOutLength,
                    leadOutRadius: c.leadOutRadius, leadOutAngle: c.leadOutAngle,
                    overcutLength: c.overcutLength,
                });
                clone.isSelected = false;
                return clone;
            }
            return { ...c, points: pts, name: (c.name || 'Kontur') + ' (Spiegel)', isSelected: false };
        });

        // Klone zum Canvas hinzufügen
        const addCmd = new AddContoursCommand(
            app.contours, this.mirroredClones, app.contours.length,
            () => {
                app.rebuildCutOrder?.();
                app.renderer?.setContours(app.contours);
                app.updateContourPanel?.();
            }
        );
        app?.undoManager?.execute(addCmd);

        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.manager.renderer?.render();

        // AutoCAD-Abfrage: "Quellobjekte löschen?"
        this.state = 'delete_source';
        this.cmd?.setPrompt('Quellobjekte löschen? [Ja/Nein] <N>:');
        this.cmd?.log(`🪞 ${this.mirroredClones.length} gespiegelte Kopie(n) erstellt — Quellobjekte löschen? [J/N]`, 'info');
        console.timeEnd('[MirrorTool] _executeMirror');
    }

    handleRawInput(value) {
        if (this.state !== 'delete_source') return false;

        const input = value.trim().toUpperCase();
        if (input === 'J' || input === 'JA' || input === 'Y' || input === 'YES') {
            this._deleteSourceObjects();
            return true;
        }
        if (input === 'N' || input === 'NEIN' || input === 'NO' || input === '') {
            this.cmd?.log('✓ Quellobjekte beibehalten', 'success');
            this.manager.app?.showToast?.(`🪞 ${this.mirroredClones.length} Kopie(n) gespiegelt (STRG+Z = Rückgängig)`, 'success');
            this._finishTool();
            return true;
        }
        this.cmd?.log('Bitte J (Ja) oder N (Nein) eingeben', 'warning');
        return true;
    }

    finish() {
        if (this.state === 'select') { super.finish(); return; }
        if (this.state === 'delete_source') {
            this.cmd?.log('✓ Quellobjekte beibehalten', 'success');
            this.manager.app?.showToast?.(`🪞 ${this.mirroredClones?.length || 0} Kopie(n) gespiegelt (STRG+Z = Rückgängig)`, 'success');
            this._finishTool();
            return;
        }
        this._finishTool();
    }

    _deleteSourceObjects() {
        const app = this.manager.app;
        if (!app) { this._finishTool(); return; }

        const deleteCmd = new DeleteContoursCommand(
            app.contours, [...this.selectedContours],
            () => {
                app.rebuildCutOrder?.();
                app.renderer?.setContours(app.contours);
                app.updateContourPanel?.();
            }
        );
        app.undoManager?.execute(deleteCmd);

        this.cmd?.log(`✓ ${this.selectedContours.length} Quellobjekt(e) gelöscht`, 'success');
        app.showToast?.(`🪞 Gespiegelt + Quelle gelöscht (STRG+Z = Rückgängig)`, 'success');
        console.log(`[MirrorTool] ${this.selectedContours.length} Quellobjekte gelöscht`);
        this._finishTool();
    }

    _finishTool() {
        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.mirroredClones = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        // V2.3: Continuous Mode
        this.manager.restartTool();
    }

    getLastPoint() { return this.lineP1; }
}


// ════════════════════════════════════════════════════════════════
// SCALE TOOL (S)
// ════════════════════════════════════════════════════════════════

class ScaleTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.basePoint = null;
    }

    getToolName() { return 'SCALE'; }

    start() {
        this.cmd?.log('📐 Scale: Objekte wählen → Basispunkt → Faktor', 'info');
        super.start();
    }

    _onSelectionComplete(contours) {
        this.state = 'basepoint';
        this.cmd?.setPrompt(`SCALE (${contours.length} Obj.) — Basispunkt angeben:`);
    }

    handleClick(point) {
        if (this.state === 'select') { super.handleClick(point); return; }

        if (this.state === 'basepoint') {
            this.basePoint = { x: point.x, y: point.y };
            this.state = 'factor';
            this.cmd?.setPrompt('SCALE — Skalierungsfaktor eingeben (z.B. 2, 0.5):');
            return;
        }
    }

    handleDistance(value) {
        if (this.state === 'factor' && this.basePoint) {
            if (Math.abs(value) < 0.0001) {
                this.cmd?.log('Skalierungsfaktor darf nicht 0 sein', 'error');
                return;
            }
            this._executeScale(value, value);
        }
    }

    handleMouseMove(point) {
        if (this.state === 'factor' && this.basePoint) {
            // Dynamischer Faktor basierend auf Maus-Abstand
            const baseDist = 50;  // Referenz-Distanz
            const dist = Math.hypot(point.x - this.basePoint.x, point.y - this.basePoint.y);
            const factor = Math.max(0.1, dist / baseDist);

            this.manager.ghostContours = this._createGhostPreview(
                this.selectedContours,
                (pts) => ModificationTool.scalePoints(pts, this.basePoint.x, this.basePoint.y, factor, factor)
            );

            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.basePoint, end: point }
            };

            this.manager.renderer?.render();
        }
    }

    _executeScale(factorX, factorY) {
        const app = this.manager.app;
        const cx = this.basePoint.x;
        const cy = this.basePoint.y;

        const snapshots = this.selectedContours.map(c => ({
            contour: c,
            oldPoints: ModificationTool.deepCopyPoints(c)
        }));

        for (const c of this.selectedContours) {
            ModificationTool.scalePoints(c.points, cx, cy, factorX, factorY);
            ModificationTool.invalidateCache(c);
        }

        const contours = [...this.selectedContours];
        const newSnapshots = contours.map(c => ({
            contour: c,
            newPoints: ModificationTool.deepCopyPoints(c)
        }));

        const cmd = new FunctionCommand(
            `Scale (${contours.length} Konturen, Faktor ${factorX.toFixed(2)})`,
            () => {
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = newSnapshots[i].newPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            },
            () => {
                for (let i = 0; i < contours.length; i++) {
                    contours[i].points = snapshots[i].oldPoints.map(p => ({ ...p }));
                    ModificationTool.invalidateCache(contours[i]);
                }
                app?.renderer?.render();
                app?.updateContourPanel?.();
            }
        );

        app?.undoManager?.undoStack.push(cmd);
        app?.undoManager?.redoStack && (app.undoManager.redoStack.length = 0);
        app?.undoManager?._notifyStateChange?.();

        this.cmd?.log(`✓ ${contours.length} Kontur(en) skaliert (Faktor ${factorX.toFixed(2)})`, 'success');
        app?.showToast?.(`📐 Skaliert ×${factorX.toFixed(2)} (STRG+Z = Rückgängig)`, 'success');

        this._finishTool();
    }

    _finishTool() {
        this.manager.ghostContours = null;
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        // V2.3: Continuous Mode
        this.manager.restartTool();
    }

    finish() {
        if (this.state === 'select') { super.finish(); return; }
        this._finishTool();
    }

    getLastPoint() { return this.basePoint; }
}


// ════════════════════════════════════════════════════════════════
// OFFSET TOOL (O) — Platzhalter für spätere Implementierung
// ════════════════════════════════════════════════════════════════

class OffsetTool extends ModificationTool {
    getToolName() { return 'OFFSET'; }

    start() {
        this.cmd?.log('⚠️ Offset-Tool: Noch nicht implementiert (kommt in V2.1)', 'warning');
        this.manager.activeTool = null;
        this.manager._setDefaultPrompt();
    }
}


// ════════════════════════════════════════════════════════════════
// ERASE TOOL (DEL)
// ════════════════════════════════════════════════════════════════

class EraseTool extends ModificationTool {
    getToolName() { return 'ERASE'; }

    start() {
        // Prüfe ob bereits Konturen selektiert sind
        const preSelected = this.manager.getSelectedContours();

        if (preSelected.length > 0) {
            // Sofort löschen (Noun-Verb)
            this._executeErase(preSelected);
        } else {
            // Verb-Noun: Auswahl-Phase
            this.state = 'select';
            this.cmd?.setPrompt('ERASE — Objekte wählen (Klick/Fenster, Enter = löschen):');
            this.cmd?.log('🗑️ Erase: Objekte wählen und Enter drücken', 'info');
        }
    }

    _onSelectionComplete(contours) {
        this._executeErase(contours);
    }

    _executeErase(contours) {
        const app = this.manager.app;
        if (!app) return;

        const deleteCmd = new DeleteContoursCommand(
            app.contours,
            [...contours],
            () => {
                app.rebuildCutOrder?.();
                app.renderer?.setContours(app.contours);
                app.updateContourPanel?.();
            }
        );
        app.undoManager?.execute(deleteCmd);

        this.cmd?.log(`✓ ${contours.length} Kontur(en) gelöscht`, 'success');
        app.showToast?.(`🗑️ ${contours.length} Konturen gelöscht (STRG+Z = Rückgängig)`, 'success');

        this.manager.activeTool = null;
        this.manager._setDefaultPrompt();
        this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════
// LINE TOOL (L)
// ════════════════════════════════════════════════════════════════

class LineTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.points = [];
        this.segments = [];
    }

    start() {
        this.cmd?.setPrompt('LINIE — Startpunkt angeben:');
        this.cmd?.log('🔷 Linie: Punkte setzen, S/C=Schließen, Enter/Space = Fertig, ESC = Abbrechen, Backspace = Undo', 'info');
    }

    acceptsOption(opt) { return ['S', 'C'].includes(opt); }

    handleOption(option) {
        if (option === 'S' || option === 'C') {
            this._close();
        }
    }

    _close() {
        if (this.points.length < 3) {
            this.cmd?.log('Mindestens 3 Punkte zum Schließen benötigt', 'error');
            return;
        }
        // Schließlinie vom letzten Punkt zum Startpunkt
        const last = this.points[this.points.length - 1];
        const first = this.points[0];
        const entity = {
            type: 'LINE',
            start: { x: last.x, y: last.y },
            end: { x: first.x, y: first.y }
        };
        this.segments.push(entity);
        this.manager.addEntity(entity);
        this.cmd?.log(`✔ Linienzug geschlossen (${this.points.length} Punkte)`, 'success');

        // Tool beenden (wie PolylineTool bei Close)
        this.points = [];
        this.segments = [];
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    handleClick(point) {
        this.points.push({ x: point.x, y: point.y });

        if (this.points.length >= 2) {
            const p1 = this.points[this.points.length - 2];
            const p2 = this.points[this.points.length - 1];

            const entity = {
                type: 'LINE',
                start: { x: p1.x, y: p1.y },
                end: { x: p2.x, y: p2.y }
            };
            this.segments.push(entity);
            this.manager.addEntity(entity);
        }

        const closeHint = this.points.length >= 3 ? ' / S=Schließen' : '';
        this.cmd?.setPrompt(`LINIE — Nächster Punkt [dx,dy / Länge / Undo${closeHint} / Enter=Fertig]: (${this.points.length} Pkt)`);
    }

    handleMouseMove(point) {
        if (this.points.length > 0) {
            const last = this.points[this.points.length - 1];
            this.manager.rubberBand = {
                type: 'line',
                data: { start: last, end: point }
            };
            this.manager.renderer?.render();
        }
    }

    handleRawInput(value) {
        if (this.points.length === 0) return false;
        const trimmed = value.trim();
        if (trimmed.startsWith('@')) return false;
        
        const parts = trimmed.split(/[,\s]+/).map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            const last = this.points[this.points.length - 1];
            const newPoint = { x: last.x + parts[0], y: last.y + parts[1] };
            this.cmd?.log(`→ Relativ (${parts[0]}, ${parts[1]}) mm`, 'info');
            this.handleClick(newPoint);
            return true;
        }
        return false;
    }

    handleDistance(value) {
        if (this.points.length === 0) {
            this.cmd?.log('Erst Startpunkt setzen!', 'error');
            return;
        }

        const last = this.points[this.points.length - 1];
        let angle;

        if (this.manager.rubberBand?.data?.end) {
            const rb = this.manager.rubberBand.data;
            angle = Math.atan2(rb.end.y - rb.start.y, rb.end.x - rb.start.x);
        } else if (this.points.length >= 2) {
            const prev = this.points[this.points.length - 2];
            angle = Math.atan2(last.y - prev.y, last.x - prev.x);
        } else {
            angle = 0;
        }

        const newPoint = {
            x: last.x + value * Math.cos(angle),
            y: last.y + value * Math.sin(angle)
        };

        this.cmd?.log(`→ Länge ${value.toFixed(2)} mm in Richtung ${(angle * 180 / Math.PI).toFixed(1)}°`, 'info');
        this.handleClick(newPoint);
    }

    handleUndo() {
        if (this.points.length > 0) {
            this.points.pop();
            if (this.segments.length > 0) {
                this.segments.pop();
                this.manager.removeLastEntity();
            }
            this.cmd?.log('↩ Letzter Punkt entfernt', 'info');

            if (this.points.length === 0) {
                this.cmd?.setPrompt('LINIE — Startpunkt angeben:');
            } else {
                const closeHint = this.points.length >= 3 ? ' / S=Schließen' : '';
                this.cmd?.setPrompt(`LINIE — Nächster Punkt [dx,dy / Länge / Undo${closeHint} / Enter=Fertig]: (${this.points.length} Pkt)`);
            }
        }
    }

    finish() {
        if (this.points.length === 0) {
            this.manager.rubberBand = null;
            this.manager._setDefaultPrompt();
            this.manager.activeTool = null;
            this.manager.renderer?.render();
            return;
        }
        if (this.points.length < 2) {
            this.cmd?.log('Linie: Mindestens 2 Punkte benötigt', 'error');
        }
        this.points = [];
        this.segments = [];
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('LINIE — Startpunkt angeben (Enter=Beenden):');
        this.manager.renderer?.render();
    }

    cancel() {
        for (const seg of this.segments) {
            const idx = this.manager.entities.indexOf(seg);
            if (idx !== -1) this.manager.entities.splice(idx, 1);
        }
        super.cancel();
    }

    getLastPoint() {
        return this.points.length > 0 ? this.points[this.points.length - 1] : null;
    }
}


// ════════════════════════════════════════════════════════════════
// CIRCLE TOOL (C)
// ════════════════════════════════════════════════════════════════

class CircleTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.center = null;
        this.mode = 'radius';       // 'radius' | 'diameter'
        this.subMode = 'center';    // 'center' | '2p' | '3p' | 'ttr' | 'ttt'
        this.p1 = null;             // 2P/3P: erster Punkt
        this.p2 = null;             // 2P/3P: zweiter Punkt
        // TTR State
        this._ttrObj1 = null;       // { type:'line', p1, p2 } oder { type:'circle', center, radius }
        this._ttrObj2 = null;
        this._ttrClickPt1 = null;   // Klickpunkt für Lösungsauswahl
        this._ttrClickPt2 = null;
    }

    getToolName() { return 'CIRCLE'; }

    start() {
        console.log('[CircleTool] gestartet (6 Modi: Mittel+R, Mittel+D, 2P, 3P, TTR, TTT)');
        this.subMode = 'center';
        this.mode = 'radius';
        this.center = null;
        this.p1 = null;
        this.p2 = null;
        this.cmd?.setPrompt('KREIS — Mittelpunkt angeben [2P/3P/TTR]:');
        this.cmd?.log('🔵 Kreis: Mittelpunkt → Radius | 2P = 2 Punkte | 3P = 3 Punkte | D = Durchmesser', 'info');
    }

    acceptsOption(opt) {
        return ['D', 'R', '2P', '3P', 'TTR', 'TTT'].includes(opt.toUpperCase());
    }

    handleOption(option) {
        const opt = option.toUpperCase();
        if (opt === 'D') {
            this.mode = 'diameter';
            if (this.subMode === 'center' && this.center) {
                this.cmd?.setPrompt('KREIS — Durchmesser angeben:');
            }
        } else if (opt === 'R') {
            this.mode = 'radius';
            if (this.subMode === 'center' && this.center) {
                this.cmd?.setPrompt('KREIS — Radius angeben:');
            }
        } else if (opt === '2P') {
            this.subMode = '2p';
            this.center = null;
            this.p1 = null;
            this.p2 = null;
            this.cmd?.setPrompt('KREIS 2P — 1. Punkt auf Durchmesser:');
            this.cmd?.log('🔵 2-Punkte-Kreis: Durchmesser durch 2 Punkte definiert', 'info');
        } else if (opt === '3P') {
            this.subMode = '3p';
            this.center = null;
            this.p1 = null;
            this.p2 = null;
            this.cmd?.setPrompt('KREIS 3P — 1. Punkt:');
            this.cmd?.log('🔵 3-Punkte-Kreis: Kreis durch 3 Punkte', 'info');
        } else if (opt === 'TTR') {
            this.subMode = 'ttr';
            this.center = null;
            this.p1 = null;
            this.p2 = null;
            this._ttrObj1 = null;
            this._ttrObj2 = null;
            this._ttrClickPt1 = null;
            this._ttrClickPt2 = null;
            this.cmd?.setPrompt('KREIS TTR — 1. Tangenten-Objekt wählen (Linie oder Kreis):');
            this.cmd?.log('🔵 Tan,Tan,Radius: Klicke auf 2 Objekte, dann Radius eingeben', 'info');
        } else if (opt === 'TTT') {
            this.cmd?.log('⚠ Tan,Tan,Tan ist noch nicht implementiert', 'warning');
        }
    }

    handleClick(point) {
        // ── CENTER mode: Mittel+Radius / Mittel+Durchmesser ──
        if (this.subMode === 'center') {
            if (!this.center) {
                this.center = { x: point.x, y: point.y };
                this.cmd?.setPrompt(`KREIS — ${this.mode === 'radius' ? 'Radius' : 'Durchmesser'} angeben [D/R]:`);
            } else {
                let radius = Math.hypot(point.x - this.center.x, point.y - this.center.y);
                if (this.mode === 'diameter') radius /= 2;
                this._createCircle(this.center, radius);
            }
            return;
        }

        // ── 2P mode: Durchmesser durch 2 Punkte ──
        if (this.subMode === '2p') {
            if (!this.p1) {
                this.p1 = { x: point.x, y: point.y };
                this.cmd?.setPrompt('KREIS 2P — 2. Punkt auf Durchmesser:');
            } else {
                const cx = (this.p1.x + point.x) / 2;
                const cy = (this.p1.y + point.y) / 2;
                const radius = Math.hypot(point.x - this.p1.x, point.y - this.p1.y) / 2;
                this._createCircle({ x: cx, y: cy }, radius);
            }
            return;
        }

        // ── 3P mode: Kreis durch 3 Punkte ──
        if (this.subMode === '3p') {
            if (!this.p1) {
                this.p1 = { x: point.x, y: point.y };
                this.cmd?.setPrompt('KREIS 3P — 2. Punkt:');
            } else if (!this.p2) {
                this.p2 = { x: point.x, y: point.y };
                this.cmd?.setPrompt('KREIS 3P — 3. Punkt:');
            } else {
                const circle = CircleTool._circumscribedCircle(this.p1, this.p2, point);
                if (circle) {
                    this._createCircle(circle.center, circle.radius);
                } else {
                    this.cmd?.log('3 Punkte sind kollinear — kein Kreis möglich', 'error');
                }
            }
            return;
        }

        // ── TTR mode: Tan,Tan,Radius ──
        if (this.subMode === 'ttr') {
            // Objekt unter Klickpunkt identifizieren
            const geom = CircleTool._findNearestGeometry(point, this.manager.app?.contours);
            if (!geom) {
                this.cmd?.log('Kein Objekt gefunden — näher an Linie oder Kreis klicken', 'error');
                return;
            }

            if (!this._ttrObj1) {
                this._ttrObj1 = geom;
                this._ttrClickPt1 = { x: point.x, y: point.y };
                const typeName = geom.type === 'circle' ? 'Kreis' : 'Linie';
                this.cmd?.log(`1. Objekt: ${typeName}`, 'info');
                this.cmd?.setPrompt('KREIS TTR — 2. Tangenten-Objekt wählen:');
            } else if (!this._ttrObj2) {
                this._ttrObj2 = geom;
                this._ttrClickPt2 = { x: point.x, y: point.y };
                const typeName = geom.type === 'circle' ? 'Kreis' : 'Linie';
                this.cmd?.log(`2. Objekt: ${typeName}`, 'info');
                this.cmd?.setPrompt('KREIS TTR — Radius angeben:');
            }
            return;
        }
    }

    handleMouseMove(point) {
        // ── CENTER: Vorschau Kreis um Mittelpunkt ──
        if (this.subMode === 'center' && this.center) {
            let radius = Math.hypot(point.x - this.center.x, point.y - this.center.y);
            if (this.mode === 'diameter') radius /= 2;
            this.manager.rubberBand = { type: 'circle', data: { center: this.center, radius } };
            this.manager.renderer?.render();
            return;
        }

        // ── 2P: Vorschau Kreis durch P1 + Cursor ──
        if (this.subMode === '2p' && this.p1) {
            const cx = (this.p1.x + point.x) / 2;
            const cy = (this.p1.y + point.y) / 2;
            const radius = Math.hypot(point.x - this.p1.x, point.y - this.p1.y) / 2;
            this.manager.rubberBand = { type: 'circle', data: { center: { x: cx, y: cy }, radius } };
            this.manager.renderer?.render();
            return;
        }

        // ── 3P: Vorschau Kreis durch P1, P2, Cursor ──
        if (this.subMode === '3p' && this.p1 && this.p2) {
            const circle = CircleTool._circumscribedCircle(this.p1, this.p2, point);
            if (circle && circle.radius < 1e6) {
                this.manager.rubberBand = { type: 'circle', data: { center: circle.center, radius: circle.radius } };
            } else {
                this.manager.rubberBand = null;
            }
            this.manager.renderer?.render();
            return;
        }
    }

    handleDistance(value) {
        // TTR: Radius eingeben nach 2 Objekten
        if (this.subMode === 'ttr') {
            if (!this._ttrObj1 || !this._ttrObj2) {
                this.cmd?.log('Erst 2 Tangenten-Objekte wählen!', 'error');
                return;
            }
            const result = CircleTool._solveTTR(
                this._ttrObj1, this._ttrObj2, value,
                this._ttrClickPt1, this._ttrClickPt2
            );
            if (result) {
                console.log(`[CircleTool TTR] Lösung: M(${result.x.toFixed(3)}, ${result.y.toFixed(3)}) R=${value.toFixed(3)}`);
                this._createCircle(result, value);
            } else {
                this.cmd?.log(`Kein tangentialer Kreis mit R=${value.toFixed(3)} möglich`, 'error');
            }
            return;
        }

        if (this.subMode === 'center' && this.center) {
            let radius = value;
            if (this.mode === 'diameter') radius = value / 2;
            this._createCircle(this.center, radius);
        } else {
            this.cmd?.log('Erst Mittelpunkt setzen!', 'error');
        }
    }

    handleRawInput(value) {
        // Sub-Modus-Erkennung aus Kommandozeile
        const v = value.trim().toUpperCase();
        if (v === '2P' || v === '3P' || v === 'TTR' || v === 'TTT' || v === 'D' || v === 'R') {
            this.handleOption(v);
            return true;
        }
        return false;
    }

    _createCircle(center, radius) {
        if (radius <= 0) { this.cmd?.log('Radius muss größer als 0 sein', 'error'); return; }
        console.log(`[CircleTool] Kreis erstellt: M(${center.x.toFixed(3)}, ${center.y.toFixed(3)}) R=${radius.toFixed(3)} [${this.subMode}]`);

        this.manager.addEntity({
            type: 'CIRCLE',
            center: { x: center.x, y: center.y },
            radius: radius
        });
        this.manager.rubberBand = null;

        // Reset für nächsten Kreis (gleicher SubMode bleibt)
        this.center = null;
        this.p1 = null;
        this.p2 = null;
        this._ttrObj1 = null;
        this._ttrObj2 = null;
        this._ttrClickPt1 = null;
        this._ttrClickPt2 = null;
        this.mode = 'radius';

        if (this.subMode === 'center') {
            this.cmd?.setPrompt('KREIS — Mittelpunkt angeben [2P/3P/TTR] (Enter=Fertig):');
        } else if (this.subMode === '2p') {
            this.cmd?.setPrompt('KREIS 2P — 1. Punkt auf Durchmesser (Enter=Fertig):');
        } else if (this.subMode === '3p') {
            this.cmd?.setPrompt('KREIS 3P — 1. Punkt (Enter=Fertig):');
        } else if (this.subMode === 'ttr') {
            this.cmd?.setPrompt('KREIS TTR — 1. Tangenten-Objekt wählen (Enter=Fertig):');
        }
    }

    /**
     * Umkreis durch 3 Punkte berechnen (Circumscribed Circle)
     * Gibt { center: {x,y}, radius } zurück oder null wenn kollinear
     */
    static _circumscribedCircle(p1, p2, p3) {
        const ax = p1.x, ay = p1.y;
        const bx = p2.x, by = p2.y;
        const cx = p3.x, cy = p3.y;

        const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(D) < 1e-10) return null; // kollinear

        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;

        const radius = Math.hypot(ax - ux, ay - uy);
        return { center: { x: ux, y: uy }, radius };
    }

    // ════════════════════════════════════════════════════════════════
    // TTR GEOMETRIE-SOLVER (Tan,Tan,Radius)
    // ════════════════════════════════════════════════════════════════

    /**
     * Nächstes geometrisches Objekt (Linie oder Kreis) am Klickpunkt finden.
     * Durchsucht alle Konturen, gibt { type:'line', p1, p2 } oder { type:'circle', center, radius } zurück.
     */
    static _findNearestGeometry(point, contours) {
        if (!contours || contours.length === 0) return null;
        const MAX_DIST = 20; // Toleranz in Weltkoordinaten

        let bestDist = Infinity;
        let bestGeom = null;

        for (const c of contours) {
            if (!c.points || c.points.length < 2) continue;
            if (c.isReference) continue;

            // Kreis-Erkennung: geschlossene Kontur mit gleichen Abständen vom Zentroid
            const circ = CircleTool._detectCircle(c);
            if (circ) {
                const dist = Math.abs(Math.hypot(point.x - circ.center.x, point.y - circ.center.y) - circ.radius);
                if (dist < bestDist && dist < MAX_DIST) {
                    bestDist = dist;
                    bestGeom = { type: 'circle', center: circ.center, radius: circ.radius };
                }
                continue;
            }

            // Liniensegmente durchsuchen
            for (let i = 0; i < c.points.length - 1; i++) {
                const p1 = c.points[i];
                const p2 = c.points[i + 1];
                const dist = CircleTool._pointToSegmentDist(point, p1, p2);
                if (dist < bestDist && dist < MAX_DIST) {
                    bestDist = dist;
                    bestGeom = { type: 'line', p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } };
                }
            }
        }
        return bestGeom;
    }

    /** Prüfe ob eine Kontur ein Kreis ist (alle Punkte gleich weit vom Zentroid) */
    static _detectCircle(contour) {
        if (!contour.isClosed || contour.points.length < 16) return null;
        const n = contour.isClosed ? contour.points.length - 1 : contour.points.length;
        if (n < 16) return null;

        let cx = 0, cy = 0;
        for (let i = 0; i < n; i++) { cx += contour.points[i].x; cy += contour.points[i].y; }
        cx /= n; cy /= n;

        let sumR = 0;
        let minR = Infinity, maxR = 0;
        for (let i = 0; i < n; i++) {
            const r = Math.hypot(contour.points[i].x - cx, contour.points[i].y - cy);
            sumR += r;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
        }
        const avgR = sumR / n;
        if (avgR < 0.01) return null;

        // Toleranz: max 2% Abweichung
        if ((maxR - minR) / avgR < 0.02) {
            return { center: { x: cx, y: cy }, radius: avgR };
        }
        return null;
    }

    /** Abstand Punkt zu Liniensegment */
    static _pointToSegmentDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    /**
     * TTR Löser: Finde Mittelpunkt eines Kreises mit Radius r,
     * tangential an obj1 und obj2.
     * Gibt {x, y} zurück oder null.
     */
    static _solveTTR(obj1, obj2, r, clickPt1, clickPt2) {
        console.time('[TTR solve]');
        const candidates = [];

        if (obj1.type === 'line' && obj2.type === 'line') {
            // Linie + Linie: 4 Offset-Kombinationen
            for (const s1 of [-1, 1]) {
                const off1 = CircleTool._offsetLine(obj1.p1, obj1.p2, r * s1);
                for (const s2 of [-1, 1]) {
                    const off2 = CircleTool._offsetLine(obj2.p1, obj2.p2, r * s2);
                    const pt = CircleTool._lineLineIntersect(off1.p1, off1.p2, off2.p1, off2.p2);
                    if (pt) candidates.push(pt);
                }
            }
        } else if (obj1.type === 'line' && obj2.type === 'circle') {
            // Linie + Kreis
            for (const s1 of [-1, 1]) {
                const off = CircleTool._offsetLine(obj1.p1, obj1.p2, r * s1);
                for (const s2 of [-1, 1]) {
                    const offR = obj2.radius + r * s2;
                    if (offR < 0) continue;
                    const pts = CircleTool._lineCircleIntersect(off.p1, off.p2, obj2.center, offR);
                    candidates.push(...pts);
                }
            }
        } else if (obj1.type === 'circle' && obj2.type === 'line') {
            // Kreis + Linie (umgekehrt)
            for (const s1 of [-1, 1]) {
                const offR = obj1.radius + r * s1;
                if (offR < 0) continue;
                for (const s2 of [-1, 1]) {
                    const off = CircleTool._offsetLine(obj2.p1, obj2.p2, r * s2);
                    const pts = CircleTool._lineCircleIntersect(off.p1, off.p2, obj1.center, offR);
                    candidates.push(...pts);
                }
            }
        } else if (obj1.type === 'circle' && obj2.type === 'circle') {
            // Kreis + Kreis
            for (const s1 of [-1, 1]) {
                const offR1 = obj1.radius + r * s1;
                if (offR1 < 0) continue;
                for (const s2 of [-1, 1]) {
                    const offR2 = obj2.radius + r * s2;
                    if (offR2 < 0) continue;
                    const pts = CircleTool._circleCircleIntersect(obj1.center, offR1, obj2.center, offR2);
                    candidates.push(...pts);
                }
            }
        }

        console.timeEnd('[TTR solve]');
        console.log(`[TTR] ${candidates.length} Kandidaten gefunden`);

        if (candidates.length === 0) return null;

        // Beste Lösung: nächste an BEIDEN Klickpunkten
        let best = null, bestScore = Infinity;
        for (const c of candidates) {
            const d1 = Math.hypot(c.x - clickPt1.x, c.y - clickPt1.y);
            const d2 = Math.hypot(c.x - clickPt2.x, c.y - clickPt2.y);
            const score = d1 + d2;
            if (score < bestScore) {
                bestScore = score;
                best = c;
            }
        }
        return best;
    }

    /** Linie um Distanz verschieben (senkrecht) */
    static _offsetLine(p1, p2, dist) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-12) return { p1: { ...p1 }, p2: { ...p2 } };
        const nx = -dy / len * dist, ny = dx / len * dist;
        return {
            p1: { x: p1.x + nx, y: p1.y + ny },
            p2: { x: p2.x + nx, y: p2.y + ny }
        };
    }

    /** Schnittpunkt zweier unendlicher Linien */
    static _lineLineIntersect(a1, a2, b1, b2) {
        const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
        const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
        const det = d1x * d2y - d1y * d2x;
        if (Math.abs(det) < 1e-12) return null; // parallel
        const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / det;
        return { x: a1.x + t * d1x, y: a1.y + t * d1y };
    }

    /** Schnittpunkte Linie (unendlich) mit Kreis */
    static _lineCircleIntersect(lp1, lp2, center, radius) {
        const dx = lp2.x - lp1.x, dy = lp2.y - lp1.y;
        const fx = lp1.x - center.x, fy = lp1.y - center.y;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - radius * radius;
        let disc = b * b - 4 * a * c;
        if (disc < -1e-10) return [];
        if (disc < 0) disc = 0;
        const sqrtDisc = Math.sqrt(disc);
        const results = [];
        for (const sign of [-1, 1]) {
            const t = (-b + sign * sqrtDisc) / (2 * a);
            results.push({ x: lp1.x + t * dx, y: lp1.y + t * dy });
        }
        // Deduplizieren bei Tangente (disc ≈ 0)
        if (disc < 1e-6 && results.length === 2) {
            return [results[0]];
        }
        return results;
    }

    /** Schnittpunkte zweier Kreise */
    static _circleCircleIntersect(c1, r1, c2, r2) {
        const dx = c2.x - c1.x, dy = c2.y - c1.y;
        const d = Math.hypot(dx, dy);
        if (d > r1 + r2 + 1e-10 || d < Math.abs(r1 - r2) - 1e-10 || d < 1e-12) return [];

        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        let h2 = r1 * r1 - a * a;
        if (h2 < 0) h2 = 0;
        const h = Math.sqrt(h2);

        const mx = c1.x + a * dx / d;
        const my = c1.y + a * dy / d;
        const px = -dy / d * h;
        const py = dx / d * h;

        if (h < 1e-10) return [{ x: mx, y: my }];
        return [
            { x: mx + px, y: my + py },
            { x: mx - px, y: my - py }
        ];
    }

    finish() {
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return this.center || this.p2 || this.p1; }
}


// ════════════════════════════════════════════════════════════════
// RECTANGLE TOOL (N)
// ════════════════════════════════════════════════════════════════

class RectangleTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.corner1 = null;
    }

    start() {
        this.cmd?.setPrompt('RECHTECK — Erste Ecke angeben:');
        this.cmd?.log('🔷 Rechteck: 2 gegenüberliegende Ecken', 'info');
    }

    handleClick(point) {
        if (!this.corner1) {
            this.corner1 = { x: point.x, y: point.y };
            this.cmd?.setPrompt('RECHTECK — Gegenüberliegende Ecke oder Breite,Höhe (z.B. 100,50):');
        } else {
            this._createRectangle(point);
        }
    }

    handleMouseMove(point) {
        if (this.corner1) {
            this.manager.rubberBand = { type: 'rect', data: { p1: this.corner1, p2: point } };
            this.manager.renderer?.render();
        }
    }

    handleDistance(value) {
        if (this.corner1) {
            this.cmd?.log(`→ Quadrat ${value.toFixed(1)} × ${value.toFixed(1)} mm`, 'info');
            this._createRectangle({ x: this.corner1.x + value, y: this.corner1.y + value });
        }
    }

    handleRawInput(value) {
        if (!this.corner1) return false;
        const parts = value.trim().split(/[,\s]+/).map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            const [w, h] = parts;
            this.cmd?.log(`→ Rechteck ${w.toFixed(1)} × ${h.toFixed(1)} mm`, 'info');
            this._createRectangle({ x: this.corner1.x + w, y: this.corner1.y + h });
            return true;
        }
        return false;
    }

    _createRectangle(corner2) {
        const p1 = this.corner1, p2 = corner2;
        this.manager.addEntity({
            type: 'RECTANGLE',
            points: [
                { x: p1.x, y: p1.y }, { x: p2.x, y: p1.y },
                { x: p2.x, y: p2.y }, { x: p1.x, y: p2.y },
                { x: p1.x, y: p1.y }
            ],
            closed: true
        });
        this.manager.rubberBand = null;
        this.corner1 = null;
        this.cmd?.setPrompt('RECHTECK — Erste Ecke angeben (Enter=Fertig):');
    }

    finish() {
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return this.corner1; }
}


// ════════════════════════════════════════════════════════════════
// ARC TOOL (A) — 3-Punkt-Bogen
// ════════════════════════════════════════════════════════════════

class ArcTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.p1 = null;
        this.p2 = null;
    }

    start() {
        this.cmd?.setPrompt('BOGEN — Startpunkt angeben:');
        this.cmd?.log('⭕ Bogen: 3 Punkte (Start → Mitte → Ende)', 'info');
    }

    handleClick(point) {
        if (!this.p1) {
            this.p1 = { x: point.x, y: point.y };
            this.cmd?.setPrompt('BOGEN — Zweiten Punkt angeben:');
        } else if (!this.p2) {
            this.p2 = { x: point.x, y: point.y };
            this.cmd?.setPrompt('BOGEN — Endpunkt angeben:');
        } else {
            this._createArc(point);
        }
    }

    handleMouseMove(point) {
        if (this.p1 && this.p2) {
            const arc = this._calcArcFrom3Points(this.p1, this.p2, point);
            if (arc) {
                this.manager.rubberBand = { type: 'arc', data: arc };
            }
        } else if (this.p1) {
            this.manager.rubberBand = { type: 'line', data: { start: this.p1, end: point } };
        }
        this.manager.renderer?.render();
    }

    _createArc(p3) {
        const arc = this._calcArcFrom3Points(this.p1, this.p2, p3);
        if (!arc) {
            this.cmd?.log('Punkte sind kollinear — kein Bogen möglich', 'error');
            return;
        }

        const pts = [];
        const n = 32;
        let startA = arc.startAngle, endA = arc.endAngle;
        if (arc.ccw) { if (endA <= startA) endA += Math.PI * 2; }
        else { if (startA <= endA) startA += Math.PI * 2; }

        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const a = arc.ccw ? startA + t * (endA - startA) : startA - t * (startA - endA);
            pts.push({ x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) });
        }

        this.manager.addEntity({
            type: 'ARC', center: arc.center, radius: arc.radius,
            startAngle: arc.startAngle, endAngle: arc.endAngle, ccw: arc.ccw,
            startPoint: { ...this.p1 }, endPoint: { ...p3 }, midPoint: { ...this.p2 },
            points: pts
        });
        this.manager.rubberBand = null;
        this.p1 = null;
        this.p2 = null;
        this.cmd?.setPrompt('BOGEN — Startpunkt angeben (Enter=Fertig):');
    }

    _calcArcFrom3Points(p1, p2, p3) {
        const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(d) < 1e-10) return null;

        const ux = ((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by)) / d;
        const uy = ((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax)) / d;
        const radius = Math.hypot(ax - ux, ay - uy);
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

        return {
            center: { x: ux, y: uy }, radius,
            startAngle: Math.atan2(ay - uy, ax - ux),
            endAngle: Math.atan2(cy - uy, cx - ux),
            ccw: cross > 0
        };
    }

    finish() {
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    getLastPoint() { return this.p2 || this.p1; }
}


// ════════════════════════════════════════════════════════════════
// POLYLINE TOOL (P)
// ════════════════════════════════════════════════════════════════

class PolylineTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.points = [];
        this.mode = 'line';
        this.closed = false;
    }

    start() {
        this.cmd?.setPrompt('POLYLINIE — Startpunkt angeben:');
        this.cmd?.log('🔷 Polylinie: Punkte setzen, A=Bogen, L=Linie, C=Schließen, Enter=Fertig', 'info');
    }

    handleClick(point) {
        this.points.push({ x: point.x, y: point.y });

        if (this.points.length === 1) {
            this.cmd?.setPrompt('POLYLINIE — Nächster Punkt [A=Bogen/L=Linie/C=Schließen/Undo]:');
        } else {
            this.cmd?.setPrompt(`POLYLINIE — Nächster Punkt [A/L/C/Undo]: (${this.points.length} Punkte, Modus: ${this.mode === 'arc' ? 'Bogen' : 'Linie'})`);
        }

        this.manager.renderer?.render();
    }

    handleMouseMove(point) {
        if (this.points.length > 0) {
            this.manager.rubberBand = {
                type: 'polyline',
                data: { points: this.points, cursorPoint: point }
            };
            this.manager.renderer?.render();
        }
    }

    acceptsOption(opt) { return ['A', 'L', 'C', 'U'].includes(opt); }

    handleOption(option) {
        switch (option) {
            case 'A':
                this.mode = 'arc';
                this.cmd?.log('Modus: Bogen', 'info');
                this.cmd?.setPrompt('POLYLINIE — Nächster Punkt [Bogen-Modus] [L=Linie/C=Schließen]:');
                break;
            case 'L':
                this.mode = 'line';
                this.cmd?.log('Modus: Linie', 'info');
                this.cmd?.setPrompt('POLYLINIE — Nächster Punkt [Linien-Modus] [A=Bogen/C=Schließen]:');
                break;
            case 'C': this._close(); break;
            case 'U': this.handleUndo(); break;
        }
    }

    handleRawInput(value) {
        if (this.points.length === 0) return false;
        const trimmed = value.trim();
        if (trimmed.startsWith('@')) return false;
        const parts = trimmed.split(/[,\s]+/).map(Number);
        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            const last = this.points[this.points.length - 1];
            this.cmd?.log(`→ Relativ (${parts[0]}, ${parts[1]}) mm`, 'info');
            this.handleClick({ x: last.x + parts[0], y: last.y + parts[1] });
            return true;
        }
        return false;
    }

    handleUndo() {
        if (this.points.length > 0) {
            this.points.pop();
            this.cmd?.log('↩ Letzter Punkt entfernt', 'info');
            this.manager.renderer?.render();
        }
    }

    _close() {
        if (this.points.length < 3) { this.cmd?.log('Mindestens 3 Punkte zum Schließen', 'error'); return; }
        this.closed = true;
        this._createPolyline();
    }

    finish() {
        if (this.points.length < 2) {
            this.cmd?.log('Polylinie: Mindestens 2 Punkte benötigt', 'error');
            this.manager.rubberBand = null;
            this.manager.activeTool = null;
            this.manager.renderer?.render();
            return;
        }
        this._createPolyline();
    }

    _createPolyline() {
        const finalPoints = this.points.map(p => ({ x: p.x, y: p.y }));
        if (this.closed) finalPoints.push({ x: finalPoints[0].x, y: finalPoints[0].y });

        this.manager.addEntity({ type: 'POLYLINE', points: finalPoints, closed: this.closed });
        this.manager.rubberBand = null;

        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    cancel() {
        this.points = [];
        super.cancel();
    }

    getLastPoint() {
        return this.points.length > 0 ? this.points[this.points.length - 1] : null;
    }
}


// ════════════════════════════════════════════════════════════════════════
// TIER 3: GEOMETRIE-OPERATIONEN — Explode, Join, Break
// ════════════════════════════════════════════════════════════════════════

/**
 * EXPLODE (X) — Kontur(en) in einzelne Liniensegmente zerlegen.
 * Selektion → sofortige Ausführung.
 * Jedes Segment wird eine eigene CamContour (offene Linie).
 */
class ExplodeTool extends ModificationTool {
    start() {
        this.cmd?.setPrompt('EXPLODE — Konturen auswählen (Enter=Ausführen):');
        this.cmd?.log('💥 Explode: Konturen in Einzelsegmente zerlegen', 'info');

        // Noun-Verb: Bereits selektierte Konturen sofort ausführen (kein Enter nötig)
        const selected = this.manager.getSelectedContours();
        if (selected.length > 0) {
            console.log(`[ExplodeTool] Noun-Verb: ${selected.length} Kontur(en) vorausgewählt → sofortige Ausführung`);
            this._execute();
        } else {
            this.state = 'select';
        }
    }

    finish() {
        if (this.state === 'select') {
            // Nach Selektion → zur Bestätigung wechseln
            const selected = this.manager.getSelectedContours();
            if (selected.length === 0) {
                this.cmd?.log('Keine Konturen ausgewählt', 'error');
                super.finish();
                return;
            }
            this.state = 'confirm';
            this.cmd?.setPrompt(`EXPLODE — ${selected.length} Kontur(en) → Enter=Ausführen:`);
            return;
        }

        this._execute();
    }

    _execute() {
        const selected = this.manager.getSelectedContours();
        if (selected.length === 0) {
            this.cmd?.log('Keine Konturen ausgewählt', 'error');
            super.finish();
            return;
        }

        const contours = this.manager.app?.contours;
        if (!contours || typeof GeometryOps === 'undefined') {
            this.cmd?.log('GeometryOps nicht verfügbar', 'error');
            super.finish();
            return;
        }

        // Snapshots für Undo
        const oldContours = selected.map(c => ({
            contour: c,
            index: contours.indexOf(c)
        }));

        // Neue Segmente erzeugen
        const newContoursList = [];
        let totalSegments = 0;

        for (const src of selected) {
            const segments = GeometryOps.explodeToSegments(src.points);
            for (const segPts of segments) {
                const nc = new CamContour(segPts, {
                    layer: src.layer || 'DRAW',
                    name: `Segment_${totalSegments + 1}`
                });
                newContoursList.push(nc);
                totalSegments++;
            }
        }

        if (newContoursList.length === 0) {
            this.cmd?.log('Keine Segmente erzeugt', 'warning');
            super.finish();
            return;
        }

        // Undo-Command: Original löschen + Segmente einfügen
        const app = this.manager.app;
        const rerender = () => {
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        const cmd = new FunctionCommand(
            `Explode ${selected.length} Kontur(en) → ${totalSegments} Segmente`,
            () => {
                // Execute: Originale entfernen, Segmente einfügen
                for (const item of oldContours) {
                    const idx = contours.indexOf(item.contour);
                    if (idx !== -1) contours.splice(idx, 1);
                }
                contours.push(...newContoursList);
                contours.forEach(c => { c.isSelected = false; });
                rerender();
            },
            () => {
                // Undo: Segmente entfernen, Originale wiederherstellen
                for (const nc of newContoursList) {
                    const idx = contours.indexOf(nc);
                    if (idx !== -1) contours.splice(idx, 1);
                }
                // Originale an ihren alten Positionen einfügen (sortiert!)
                const sorted = [...oldContours].sort((a, b) => a.index - b.index);
                for (const item of sorted) {
                    const insertIdx = Math.min(item.index, contours.length);
                    contours.splice(insertIdx, 0, item.contour);
                }
                rerender();
            }
        );

        app.undoManager?.execute(cmd);
        this.cmd?.log(`✔ ${totalSegments} Segmente aus ${selected.length} Kontur(en) erzeugt (Strg+Z = Rückgängig)`, 'success');

        // Tool beenden
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager._setDefaultPrompt();
        this.manager.renderer?.render();
    }
}


/**
 * JOIN (J) — Mehrere Konturen zu einer Polylinie verbinden.
 * Verbindet Konturen deren Endpunkte nahe beieinanderliegen.
 * Selektion (≥2) → sofortige Ausführung.
 */
class JoinTool extends ModificationTool {
    start() {
        this.cmd?.setPrompt('JOIN — Konturen auswählen (mind. 2, Enter=Ausführen):');
        this.cmd?.log('🔗 Join: Konturen zu einer Polylinie verbinden', 'info');

        const selected = this.manager.getSelectedContours();
        if (selected.length >= 2) {
            console.log(`[JoinTool] Noun-Verb: ${selected.length} Konturen vorausgewählt → sofortige Ausführung`);
            this._execute();
        } else {
            this.state = 'select';
        }
    }

    finish() {
        if (this.state === 'select') {
            const selected = this.manager.getSelectedContours();
            if (selected.length < 2) {
                this.cmd?.log('Mindestens 2 Konturen auswählen', 'error');
                return;
            }
            this.state = 'confirm';
            this.cmd?.setPrompt(`JOIN — ${selected.length} Konturen → Enter=Verbinden:`);
            return;
        }

        this._execute();
    }

    _execute() {
        const selected = this.manager.getSelectedContours();
        if (selected.length < 2) {
            this.cmd?.log('Mindestens 2 Konturen auswählen', 'error');
            super.finish();
            return;
        }

        const contours = this.manager.app?.contours;
        if (!contours || typeof GeometryOps === 'undefined') {
            this.cmd?.log('GeometryOps nicht verfügbar', 'error');
            super.finish();
            return;
        }

        const tolerance = this.manager.app?.settings?.chainingTolerance || 0.5;

        // Join berechnen
        const joinData = selected.map(c => ({ points: c.points, isClosed: c.isClosed }));
        const result = GeometryOps.joinContours(joinData, tolerance);

        if (!result || result.points.length < 2) {
            this.cmd?.log('Verbindung fehlgeschlagen — Endpunkte zu weit entfernt?', 'error');
            super.finish();
            return;
        }

        if (result.unusedCount > 0) {
            this.cmd?.log(`⚠ ${result.unusedCount} Kontur(en) konnten nicht verbunden werden (Toleranz: ${tolerance} mm)`, 'warning');
        }

        // Snapshots für Undo
        const oldContours = selected.map(c => ({
            contour: c,
            index: contours.indexOf(c)
        }));

        // Neue verbundene Kontur
        const joinedContour = new CamContour(result.points, {
            layer: selected[0].layer || 'DRAW',
            name: `Joined_${Date.now().toString(36)}`
        });

        const app = this.manager.app;
        const rerender = () => {
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        const cmd = new FunctionCommand(
            `Join ${selected.length} Konturen → 1 Polylinie`,
            () => {
                // Execute: Originale entfernen, verbundene einfügen
                for (const item of oldContours) {
                    const idx = contours.indexOf(item.contour);
                    if (idx !== -1) contours.splice(idx, 1);
                }
                contours.push(joinedContour);
                contours.forEach(c => { c.isSelected = false; });
                joinedContour.isSelected = true;
                rerender();
            },
            () => {
                // Undo: Verbundene entfernen, Originale wiederherstellen
                const idx = contours.indexOf(joinedContour);
                if (idx !== -1) contours.splice(idx, 1);
                const sorted = [...oldContours].sort((a, b) => a.index - b.index);
                for (const item of sorted) {
                    const insertIdx = Math.min(item.index, contours.length);
                    contours.splice(insertIdx, 0, item.contour);
                }
                rerender();
            }
        );

        app.undoManager?.execute(cmd);
        const closedInfo = result.isClosed ? ' (geschlossen)' : ' (offen)';
        this.cmd?.log(`✔ ${selected.length} Konturen verbunden → ${result.points.length} Punkte${closedInfo} (Strg+Z = Rückgängig)`, 'success');

        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager._setDefaultPrompt();
        this.manager.renderer?.render();
    }
}


/**
 * BREAK (B) — Kontur an einem Punkt teilen.
 * Phase 1: Kontur anklicken (oder vorauswählen)
 * Phase 2: Teilungspunkt anklicken
 * Geschlossene Kontur → wird geöffnet (ein Teil).
 * Offene Kontur → wird in zwei Teile geteilt.
 */
class BreakTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.targetContour = null;
        this.state = 'select'; // 'select' → 'pickPoint'
    }

    start() {
        this.cmd?.setPrompt('BREAK — Kontur auswählen:');
        this.cmd?.log('✂️ Break: Kontur an einem Punkt teilen', 'info');

        // Noun-Verb: Genau eine Kontur vorausgewählt
        const selected = this.manager.getSelectedContours?.() || [];
        if (selected.length === 1) {
            this.targetContour = selected[0];
            this.state = 'pickPoint';
            this.cmd?.log(`Kontur "${this.targetContour.name}" ausgewählt`, 'info');
            this.cmd?.setPrompt('BREAK — Teilungspunkt auf der Kontur anklicken:');
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
            this.targetContour = clicked;
            this.state = 'pickPoint';
            // Kontur hervorheben
            contours.forEach(c => { c.isSelected = false; });
            clicked.isSelected = true;
            this.manager.renderer?.render();
            this.cmd?.log(`Kontur "${clicked.name}" ausgewählt`, 'info');
            this.cmd?.setPrompt('BREAK — Teilungspunkt auf der Kontur anklicken:');
            return;
        }

        if (this.state === 'pickPoint') {
            this._executeBreak(point);
        }
    }

    _executeBreak(clickPoint) {
        const contours = this.manager.app?.contours;
        const target = this.targetContour;
        if (!contours || !target || typeof GeometryOps === 'undefined') return;

        // Nächstes Segment zum Klickpunkt finden
        const tolerance = 10 / (this.manager.renderer?.scale || 1); // 10px Toleranz
        const hit = GeometryOps.findNearestSegment(target.points, clickPoint.x, clickPoint.y, tolerance);

        if (!hit) {
            this.cmd?.log('Klickpunkt nicht auf der Kontur — näher klicken', 'warning');
            return;
        }

        // Teilung berechnen
        const parts = GeometryOps.splitContourAtPoint(
            target.points, target.isClosed, hit.segmentIndex, hit.point
        );

        if (parts.length === 0) {
            this.cmd?.log('Teilung fehlgeschlagen', 'error');
            this.cancel();
            return;
        }

        // Neue Konturen erzeugen
        const newContours = parts.map((pts, i) => {
            const nc = new CamContour(pts, {
                layer: target.layer || 'DRAW',
                name: `${target.name}_Teil${i + 1}`
            });
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
            `Break → ${parts.length} Teil(e)`,
            () => {
                const idx = contours.indexOf(target);
                if (idx !== -1) contours.splice(idx, 1);
                contours.push(...newContours);
                contours.forEach(c => { c.isSelected = false; });
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
        const info = target.isClosed ? '(geschlossen → offen)' : `(→ ${parts.length} Teile)`;
        this.cmd?.log(`✔ Kontur geteilt ${info} (Strg+Z = Rückgängig)`, 'success');

        // Tool beenden
        this.manager.rubberBand = null;
        this.manager.activeTool = null;
        this.manager._setDefaultPrompt();
        this.manager.renderer?.render();
    }

    handleMouseMove(point) {
        // Im pickPoint-Modus: Nächsten Punkt auf Kontur anzeigen
        if (this.state === 'pickPoint' && this.targetContour) {
            const hit = GeometryOps?.findNearestSegment(
                this.targetContour.points, point.x, point.y, Infinity
            );
            if (hit) {
                this.manager.rubberBand = {
                    type: 'breakPoint',
                    data: { point: hit.point }
                };
                this.manager.renderer?.render();
            }
        }
    }

    finish() {
        if (this.state === 'select') {
            // Enter ohne Auswahl → Tool beenden
            this.cancel();
        }
    }
}
