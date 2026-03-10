/**
 * WARICAM V3.12 - Canvas Renderer
 * Features: Selection, Lead-In/Out, Overcut, Micro-Joints, Travel Paths, Order Numbers,
 *           Startpunkt-Drag im Anschuss-Modus, SLIT Support
 * V3.12: Dimension Rendering Integration
 * V3.10: Grip Editing System (Vertex, Midpoint, Center, Quadrant)
 *        Anschussfahnen nur in CAM-Modi (nicht im CAD-Zeichenmodus)
 * V3.11: Image Underlay Rendering
 * V3.5: Ghost-Preview + Window-Selection Rendering
 * V3.4: Drawing-Overlay + SnapManager-Rendering
 * Last Modified: 2026-02-16 MEZ
 */

// ════════════════════════════════════════════════════════════════
// CANVAS THEME PALETTES
// ════════════════════════════════════════════════════════════════
const CANVAS_THEMES = {
    dark: {
        background:     '#0f0f1a',
        grid:           '#1a1a2e',
        gridMajor:      '#2d3748',
        disc:           '#00aaff',
        hole:           '#ff6600',
        reference:      '#555555',
        openPath:       '#FF8800',
        slit:           '#FFaa00',
        selected:       '#00ff88',
        hovered:        '#ffff00',
        kerf:           '#ff0000',
        kerfSelected:   '#00ff88',
        kerfHovered:    '#ffff00',
        q1: '#22c55e', q2: '#3b82f6', q3: '#eab308', q4: '#f97316', q5: '#ef4444',
        original:       'rgba(255,255,255,0.4)',
        leadIn:         '#00ff00',
        leadOut:        '#ff00ff',
        overcut:        '#00ffff',
        microjoint:     '#ff8800',
        travel:         '#888888',
        orderNumber:    '#ffffff',
        orderNumberBg:  'rgba(0,100,200,0.9)',
        measurement:    '#00FFFF',
        measurementText:'#FFFFFF',
        snap:           '#FFFF00',
        nullPoint:      '#00ff88',
        grip:           '#4488FF',
        gripHot:        '#FF4444',
        gripHover:      '#FFFF00'
    },
    light: {
        background:     '#e8e8e8',
        grid:           '#cccccc',
        gridMajor:      '#999999',
        disc:           '#0055cc',
        hole:           '#cc3300',
        reference:      '#888888',
        openPath:       '#cc6600',
        slit:           '#bb7700',
        selected:       '#008844',
        hovered:        '#aa8800',
        kerf:           '#cc0000',
        kerfSelected:   '#008844',
        kerfHovered:    '#aa8800',
        q1: '#16a34a', q2: '#1d4ed8', q3: '#b45309', q4: '#c2410c', q5: '#dc2626',
        original:       'rgba(0,0,0,0.35)',
        leadIn:         '#007700',
        leadOut:        '#880088',
        overcut:        '#006688',
        microjoint:     '#cc5500',
        travel:         '#666666',
        orderNumber:    '#ffffff',
        orderNumberBg:  'rgba(0,80,180,0.9)',
        measurement:    '#006688',
        measurementText:'#000000',
        snap:           '#cc8800',
        nullPoint:      '#008844',
        grip:           '#1155cc',
        gripHot:        '#cc2200',
        gripHover:      '#cc8800'
    }
};

class CanvasRenderer {
    static TOLERANCE = {
        SNAP: 8,       // Reduziert von 12 — weniger aggressives Snapping
        HIT_TEST: 12,  // Reduziert von 15
        MIN_DISTANCE: 0.001
    };

    static LINE_WIDTH = {
        BASE: 1.2,
        KERF: 2.0,
        LEAD: 2.0,
        OVERCUT: 2.5,
        HOVER: 2.0,
        MICROJOINT: 4.0,
        TRAVEL: 1.5
    };

    static MARKER_SIZE = {
        ARROW: 6,
        OVERCUT_ARROW: 4,
        PIERCE_POINT: 3,
        START_TRIANGLE: 6,
        SNAP: 5,
        MICROJOINT: 4,
        ORDER_NUMBER: 14
    };

    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.contours = [];
        this.app = null;

        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;

        // DPR-Tracking (Fix: Cursor-Versatz auf High-DPI / Browser-Zoom)
        this._dpr = window.devicePixelRatio || 1;
        this._logicalWidth = 0;
        this._logicalHeight = 0;

        this.gridEnabled = true;
        this.currentMode = null;
        this.nullPoint = null;
        this.hoveredContour = null;

        // V3.10: Grip Editing State
        this._grips = [];           // Berechnete Grips für selektierte Konturen
        this._hoveredGrip = null;   // Grip unter dem Cursor
        this._gripDirty = false;    // Erst dirty wenn Selektion existiert
        this._hasSelection = false; // Schneller Check ohne .some() bei jedem Render

        // Starte mit gespeichertem Theme oder Dark als Default
        const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('ceracam-theme')) || 'dark';
        this.colors = Object.assign({}, CANVAS_THEMES[savedTheme] || CANVAS_THEMES.dark);
        this._currentTheme = savedTheme;

        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        this.onMouseMove = null;
        this.onClick = null;
        this.onContourClick = null;
        this.onRightClick = null;

        this.initCanvasSize();
        this.initEventListeners();
    }

    initCanvasSize() {
        const resize = () => {
            const container = this.canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            const w = container.clientWidth;
            const h = container.clientHeight;

            // Bitmap auf Device-Auflösung skalieren
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);

            // CSS-Größe explizit auf logische Pixel setzen
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';

            // DPR + logische Dimensionen speichern
            this._dpr = dpr;
            this._logicalWidth = w;
            this._logicalHeight = h;

            this.render();
        };
        resize();
        window.addEventListener('resize', resize);
    }

    initEventListeners() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomIntensity = 0.1;
            const delta = -e.deltaY;
            const factor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);

            const worldBefore = this.screenToWorld(mouseX, mouseY);
            this.scale *= factor;
            this.scale = Math.max(0.01, Math.min(1000, this.scale));
            const worldAfter = this.screenToWorld(mouseX, mouseY);

            this.offsetX += (worldAfter.x - worldBefore.x) * this.scale;
            this.offsetY -= (worldAfter.y - worldBefore.y) * this.scale;

            this.render();
        });

        let isPanning = false;
        let lastX, lastY;

        // Startpunkt-Drag State
        let isDraggingStartPoint = false;
        let dragContour = null;

        // V3.10: Grip-Drag State
        let isDraggingGrip = false;
        let dragGrip = null;
        let dragOldPoints = null;  // Snapshot für Undo
        let dragContourRef = null; // Referenz auf Kontur
        let gripDragJustEnded = false; // Guard gegen Click nach Drag

        // V3.5: Window-Selection State
        let isWindowSelecting = false;
        let windowSelectStartScreen = null;
        let windowSelectJustEnded = false;  // V3.11: Guard gegen Click nach Window-Selection

        this.canvas.addEventListener('mousedown', (e) => {
            // V3.10: Grip-Drag prüfen (VOR allem anderen, NUR wenn Grips existieren)
            if (e.button === 0 && !e.shiftKey && !isDraggingGrip && this._grips.length > 0) {
                const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
                const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                const isToolActive = toolMgr?.isToolActive?.();
                if (!isToolActive && !this.app?.measureMode) {
                    const hitGrip = this._hitTestGrip(worldPos);
                    if (hitGrip) {
                        isDraggingGrip = true;
                        dragGrip = hitGrip;
                        dragContourRef = hitGrip.contour;
                        dragOldPoints = dragContourRef.points.map(p => ({x: p.x, y: p.y}));
                        this.canvas.style.cursor = 'crosshair';
                        return;
                    }
                }
            }

            // V5.2: Startpunkt-Drag prüfen (VOR Panning) — auch im Reihenfolge-Modus
            if (e.button === 0 && !e.shiftKey && (this.currentMode === 'anschuss' || this.currentMode === 'reihenfolge')) {
                const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
                const hit = this._hitTestStartTriangle(worldPos);
                if (hit) {
                    isDraggingStartPoint = true;
                    dragContour = hit;
                    this.canvas.style.cursor = 'grabbing';
                    return;
                }
            }

            // V3.5: Pan mit Mittel-Taste oder Shift+Links
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                isPanning = true;
                lastX = e.offsetX;
                lastY = e.offsetY;
                this.canvas.style.cursor = 'grabbing';
                return;
            }

            // V3.5: Links-Klick auf leere Fläche → Window-Selection starten
            if (e.button === 0 && !e.shiftKey) {
                const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
                const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                const isToolActive = toolMgr?.isToolActive?.();
                const contourAtPoint = this.findContourAtPoint(worldPos.x, worldPos.y);
                // Nur Window-Selection wenn KEIN Tool aktiv und KEINE Kontur getroffen
                if (!isToolActive && !contourAtPoint && !this.app?.measureMode) {
                    windowSelectStartScreen = { x: e.offsetX, y: e.offsetY };
                    // Noch nicht sofort starten — erst bei Drag-Threshold
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const worldPos = this.screenToWorld(e.offsetX, e.offsetY);

            // V3.10: Grip-Drag aktiv
            if (isDraggingGrip && dragGrip && dragContourRef) {
                // Snap anwenden
                const snapPt = this.app?.snapManager?.currentSnap?.point || worldPos;
                this._applyGripDrag(dragGrip, snapPt, dragContourRef);
                // Grips NICHT neu berechnen während Drag (Performance!)
                this.render();
                return;
            }

            // Startpunkt-Drag aktiv
            if (isDraggingStartPoint && dragContour) {
                dragContour.setStartPoint(worldPos);
                this.render();
                return;
            }

            // V3.5: Window-Selection Drag
            if (windowSelectStartScreen && e.buttons === 1) {
                const dx = e.offsetX - windowSelectStartScreen.x;
                const dy = e.offsetY - windowSelectStartScreen.y;
                if (!isWindowSelecting && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    isWindowSelecting = true;
                    const startWorld = this.screenToWorld(windowSelectStartScreen.x, windowSelectStartScreen.y);
                    const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                    toolMgr?.startWindowSelection?.(startWorld);
                }
                if (isWindowSelecting) {
                    const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                    if (toolMgr?.windowSelection) {
                        toolMgr.windowSelection.end = worldPos;
                    }
                    this.render();
                    // Normale Mousemove-Events trotzdem auslösen (Koordinaten-Anzeige)
                }
            }

            const hovered = this.findContourAtPoint(worldPos.x, worldPos.y);
            let needsRender = false;
            if (hovered !== this.hoveredContour) {
                this.hoveredContour = hovered;
                needsRender = true;
            }

            // V3.10: Grip-Hover — nur prüfen wenn Selektion existiert
            if (!isDraggingGrip && !isPanning && !isWindowSelecting && this._grips.length > 0) {
                const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                if (!toolMgr?.isToolActive?.() && !this.app?.measureMode) {
                    const prevHover = this._hoveredGrip;
                    this._hoveredGrip = this._hitTestGrip(worldPos);
                    if (this._hoveredGrip !== prevHover) {
                        this.canvas.style.cursor = this._hoveredGrip ? 'pointer' : 'default';
                        needsRender = true;
                    }
                }
            }
            if (needsRender) this.render();

            // V5.2: Cursor-Feedback im Anschuss-/Reihenfolge-Modus
            if ((this.currentMode === 'anschuss' || this.currentMode === 'reihenfolge') && !isDraggingStartPoint && !isPanning) {
                const overStart = this._hitTestStartTriangle(worldPos);
                this.canvas.style.cursor = overStart ? 'grab' : 'default';
            }

            const snapPoint = this.findSnapPoint(worldPos.x, worldPos.y);

            if (this.onMouseMove) {
                this.onMouseMove(worldPos.x, worldPos.y, snapPoint, e.clientX, e.clientY);
            }

            if (isPanning) {
                this.offsetX += e.offsetX - lastX;
                this.offsetY += e.offsetY - lastY;
                lastX = e.offsetX;
                lastY = e.offsetY;
                this.render();
            }

            if (this.app?.measureMode && this.app?.measureStart) {
                this.render();
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            // V3.5: Window-Selection beenden
            if (isWindowSelecting) {
                const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
                const toolMgr = this.app?.drawingTools || this.app?.toolManager;
                toolMgr?.endWindowSelection?.(worldPos, e.shiftKey);
                isWindowSelecting = false;
                windowSelectStartScreen = null;
                windowSelectJustEnded = true;  // V3.11: Click-Event unterdrücken
                return;  // Kein Click-Event feuern
            }
            windowSelectStartScreen = null;

            // V3.10: Grip-Drag beenden + Undo-Command registrieren
            if (isDraggingGrip && dragContourRef && dragOldPoints) {
                const contour = dragContourRef;
                const oldPts = dragOldPoints;
                const newPts = contour.points.map(p => ({x: p.x, y: p.y}));
                // Cache invalidieren
                if (typeof ModificationTool !== 'undefined') ModificationTool.invalidateCache(contour);
                contour._cachedKerfPolyline = null;
                contour._cacheKey = null;
                // Undo-Command (bereits ausgeführt → push, nicht execute)
                const app = this.app;
                const rerender = () => {
                    if (typeof ModificationTool !== 'undefined') ModificationTool.invalidateCache(contour);
                    contour._cachedKerfPolyline = null;
                    contour._cacheKey = null;
                    app?.renderer?.setContours(app.contours);
                    app?.rebuildCutOrder?.();
                    app?.updateContourPanel?.();
                    app?.renderer?.render();
                };
                const cmd = new FunctionCommand(
                    'Grip Move ' + contour.name,
                    () => { contour.points = newPts.map(p => ({x:p.x, y:p.y})); rerender(); },
                    () => { contour.points = oldPts.map(p => ({x:p.x, y:p.y})); rerender(); }
                );
                app?.undoManager?.undoStack?.push(cmd);
                if (app?.undoManager?.redoStack) app.undoManager.redoStack.length = 0;
                this._gripDirty = true;
                isDraggingGrip = false;
                dragGrip = null;
                dragOldPoints = null;
                dragContourRef = null;
                this.canvas.style.cursor = 'default';
                gripDragJustEnded = true;
                this.render();
                return;
            }

            if (isDraggingStartPoint) {
                isDraggingStartPoint = false;
                dragContour = null;
                this.canvas.style.cursor = 'default';
            }
            if (isPanning) {
                isPanning = false;
                this.canvas.style.cursor = this.app?.measureMode ? 'crosshair' : 'default';
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            isPanning = false;
            isDraggingStartPoint = false;
            isWindowSelecting = false;
            windowSelectStartScreen = null;
            dragContour = null;
            this.hoveredContour = null;
            this._hoveredGrip = null;
            // V3.11: Snap-Indikator löschen (verhindert "Endpoint bleibt hängen")
            if (this.app?.snapManager) this.app.snapManager.currentSnap = null;
            if (this.app) this.app.currentSnapPoint = null;
            const snapEl = document.getElementById('snap-indicator');
            if (snapEl) snapEl.style.display = 'none';
            // V3.10: Grip-Drag abbrechen (ohne Commit)
            if (isDraggingGrip && dragContourRef && dragOldPoints) {
                dragContourRef.points = dragOldPoints.map(p => ({x: p.x, y: p.y}));
                this._gripDirty = true;
            }
            isDraggingGrip = false;
            dragGrip = null;
            dragOldPoints = null;
            dragContourRef = null;
            // Window-Selection abbrechen
            const toolMgr = this.app?.drawingTools || this.app?.toolManager;
            if (toolMgr?.windowSelection) {
                toolMgr.windowSelection = null;
            }
            // V2.3: Dynamic Input HUD verstecken
            if (typeof DynamicInput !== 'undefined') DynamicInput.hide();
            this.render();
        });

        this.canvas.addEventListener('click', (e) => {
            if (isPanning || isDraggingStartPoint || isDraggingGrip) return;
            // V3.10: Click nach Grip-Drag unterdrücken
            if (gripDragJustEnded) { gripDragJustEnded = false; return; }
            // V3.11: Click nach Window-Selection unterdrücken
            if (windowSelectJustEnded) { windowSelectJustEnded = false; return; }

            const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
            const clickedContour = this.findContourAtPoint(worldPos.x, worldPos.y);

            // V3.11: Wenn Zeichentool aktiv → immer an onClick (Tool braucht Klick, z.B. TTR)
            const toolMgr2 = this.app?.drawingTools || this.app?.toolManager;
            const toolActive = toolMgr2?.isToolActive?.();
            if (toolActive && this.onClick) {
                this.onClick(worldPos);
            } else if (clickedContour && this.onContourClick) {
                this.onContourClick(clickedContour, worldPos, e.shiftKey);
            } else if (this.onClick) {
                this.onClick(worldPos);
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const worldPos = this.screenToWorld(e.offsetX, e.offsetY);
            const contour = this.findContourAtPoint(worldPos.x, worldPos.y);
            if (this.onRightClick) {
                this.onRightClick(contour, worldPos, e.clientX, e.clientY);
            }
        });
    }

    setContours(contours) {
        this.contours = contours || [];
        // V3.10: Grips nur invalidieren wenn Selektion aktiv war
        if (this._hasSelection) this._gripDirty = true;
        this.render();
    }

    setNullPoint(x, y) {
        this.nullPoint = { x, y };
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: -(screenY - this.offsetY) / this.scale
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.offsetX,
            y: -worldY * this.scale + this.offsetY
        };
    }

    getContourColor(contour) {
        if (contour === this.hoveredContour) return this.colors.hovered;
        if (contour.isSelected) return this.colors.selected;
        if (contour.isReference) return this.colors.reference;
        if (!contour.isClosed && contour.cuttingMode === 'slit') return this.colors.slit;
        if (!contour.isClosed) return this.colors.openPath;

        const quality = contour.quality || 2;
        const qColors = {
            1: this.colors.q1, 2: this.colors.q2, 3: this.colors.q3,
            4: this.colors.q4, 5: this.colors.q5
        };
        return qColors[quality] || this.colors.disc;
    }

    getKerfColor(contour) {
        if (contour === this.hoveredContour) return this.colors.kerfHovered;
        if (contour.isSelected) return this.colors.kerfSelected;
        return this.colors.kerf;
    }

    render() {
        const ctx = this.ctx;
        const dpr = this._dpr || 1;

        // DPR-Basistransform: Alle Zeichenoperationen in CSS-Pixel-Raum
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this._logicalWidth, this._logicalHeight);

        if (this.gridEnabled) this.drawGrid(ctx);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, -this.scale);

        // V3.11: Image Underlays (VOR Konturen, unterster Layer)
        if (this.app?.imageUnderlayManager?.underlays?.length > 0) {
            this.app.imageUnderlayManager.drawAll(ctx, this.scale);
        }

        if (this.contours) {
            // V3.8: Layer-Sichtbarkeit filtern
            const lm = this.app?.layerManager;
            const visible = lm 
                ? this.contours.filter(c => lm.isVisible(c.layer))
                : this.contours;
            
            visible.filter(c => c.isReference).forEach(c => this.drawContour(ctx, c));
            visible.filter(c => !c.isReference).forEach(c => this.drawContour(ctx, c));

            if (this.currentMode === 'reihenfolge' && this.app?.cutOrder) {
                this.drawTravelPaths(ctx);
            }
        }

        if (this.app?.measureMode && this.app?.measurements) this.drawMeasurements(ctx);
        if (this.app?.measureMode && this.app?.measureStart) this.drawRubberBand(ctx);

        // V3.12: Dimensions (nach Konturen, vor Grips)
        if (this.app?.dimensionManager?.dimensions?.length > 0 || this.app?.dimensionManager?.isActive()) {
            this.app.dimensionManager.drawAll(ctx, this.scale);
        }

        // V3.12: MeasureManager Overlay (IGEMS 5-Modi)
        if (this.app?.measureManager && (this.app.measureManager.isActive() || this.app.measureManager.results.length > 0)) {
            this.app.measureManager.drawAll(ctx, this.scale);
        }

        // V3.10: Grips für selektierte Konturen zeichnen
        this._drawGrips(ctx);

        ctx.restore();

        if (this.currentMode === 'reihenfolge' && this.app?.cutOrder) {
            this.drawOrderNumbers();
        }

        if (this.nullPoint) this.drawNullPoint();

        // V3.11: Image Underlay Grips (im Screen-Space)
        if (this.app?.imageUnderlayManager?.selectedUnderlay) {
            this.app.imageUnderlayManager.drawGrips(ctx, this);
        }
        // V3.4: Drawing-Overlay (Zeichentools)
        if (this.app?.drawingTools) {
            ctx.save();
            ctx.translate(this.offsetX, this.offsetY);
            ctx.scale(this.scale, -this.scale);
            this.app.drawingTools.drawOverlay(ctx, this.scale);
            ctx.restore();
        }

        // V1.2: Snap-Indikator immer anzeigen (Running-OSNAP), Crosshair nur bei Tool
        const snapActive = this.app?.snapManager?.currentSnap;
        if (snapActive) {
            const snap = this.app.snapManager.currentSnap;
            const scr = this.worldToScreen(snap.point.x, snap.point.y);
            // Fadenkreuz nur bei aktivem Tool/Messmodus (Cursor wird hidden)
            const toolMgr = this.app?.drawingTools || this.app?.toolManager;
            if (toolMgr?.isToolActive?.() || toolMgr?.drawMode || this.app?.measureMode) {
                this._drawSnapCrosshair(ctx, scr.x, scr.y);
            }
            // Snap-Symbol + Label immer
            this.app.snapManager.drawSnapIndicator(ctx, scr.x, scr.y);
        } else if (this.app?.currentSnapPoint) {
            this.drawSnapIndicator(this.app.currentSnapPoint);
        }

        if (this.app?.measureMode) this.drawMeasurementLabels();
    }

    drawGrid(ctx) {
        const gridSize = 10;
        const majorEvery = 5;

        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this._logicalWidth, this._logicalHeight);

        const startX = Math.floor(topLeft.x / gridSize) * gridSize;
        const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
        const startY = Math.floor(bottomRight.y / gridSize) * gridSize;
        const endY = Math.ceil(topLeft.y / gridSize) * gridSize;

        ctx.lineWidth = 1;

        for (let x = startX; x <= endX; x += gridSize) {
            const screenX = this.worldToScreen(x, 0).x;
            const isMajor = Math.abs(x % (gridSize * majorEvery)) < 0.001;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
            ctx.globalAlpha = isMajor ? 0.5 : 0.2;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, this._logicalHeight);
            ctx.stroke();
        }

        for (let y = startY; y <= endY; y += gridSize) {
            const screenY = this.worldToScreen(0, y).y;
            const isMajor = Math.abs(y % (gridSize * majorEvery)) < 0.001;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
            ctx.globalAlpha = isMajor ? 0.5 : 0.2;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(this._logicalWidth, screenY);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    drawContour(ctx, contour) {
        const points = contour.points;
        if (!points || points.length < 2) return;

        const isHovered = contour === this.hoveredContour;
        const isSelected = contour.isSelected;

        let baseWidth = CanvasRenderer.LINE_WIDTH.BASE / this.scale;
        if (isHovered || isSelected) baseWidth = CanvasRenderer.LINE_WIDTH.HOVER / this.scale;

        if (!contour.isReference && contour.isClosed) {
            // CLOSED CONTOUR: Disc/Hole mit Kerf, Leads, Overcut, Microjoints
            let kerfPoints = null;
            try {
                if (typeof contour.getKerfOffsetPolyline === 'function') {
                    const kerf = contour.getKerfOffsetPolyline();
                    if (kerf?.points && kerf.points.length > 2 && !contour.compensationSkipped) {
                        kerfPoints = kerf.points;
                    }
                }
            } catch (e) { /* ignore */ }

            // V3.11: Kerf nur in CAM-Modi anzeigen (nicht im CAD-Zeichenmodus)
            if (kerfPoints && (this.currentMode === 'anschuss' || this.currentMode === 'reihenfolge')) {
                ctx.globalAlpha = 0.45;
                ctx.setLineDash([6 / this.scale, 3 / this.scale]);
                this.drawPath(ctx, kerfPoints, this.getKerfColor(contour), baseWidth * 0.9);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }

            // V3.11: Layer-Farbe als Grundfarbe
            const layerName = contour.layer || '0';
            const layerDef = this.app?.layerManager?.getLayer(layerName);
            let displayColor = layerDef?.color || this.colors.disc;
            if (isHovered) displayColor = this.colors.hovered;
            if (isSelected) displayColor = this.colors.selected;
            this.drawPath(ctx, points, displayColor, baseWidth);

            const markerPoints = kerfPoints || points;

            // V3.10: Anschussfahnen nur in CAM-Modi (nicht im CAD-Zeichenmodus)
            if (this.currentMode === 'anschuss' || this.currentMode === 'reihenfolge') {
                this.drawStartTriangle(ctx, markerPoints[0], this.colors.leadIn);
                this.drawSingleDirectionArrow(ctx, markerPoints);
                this.drawLeadIn(ctx, contour, markerPoints);
                this.drawOvercut(ctx, contour, markerPoints);
                this.drawLeadOut(ctx, contour, markerPoints);

                if (contour.microjoints && contour.microjoints.length > 0) {
                    this.drawMicrojoints(ctx, contour, markerPoints);
                }
            }

        } else if (contour.isReference) {
            // REFERENCE: Gestrichelt
            ctx.setLineDash([8 / this.scale, 4 / this.scale]);
            this.drawPath(ctx, points, this.colors.reference, baseWidth * 1.5);
            ctx.setLineDash([]);

        } else if (!contour.isClosed) {
            // SLIT/OPEN: Offener Pfad
            // V3.11: Layer-Farbe als Grundfarbe
            const layerNameOpen = contour.layer || '0';
            const layerDefOpen = this.app?.layerManager?.getLayer(layerNameOpen);
            let displayColor = layerDefOpen?.color || this.colors.slit;
            if (isHovered) displayColor = this.colors.hovered;
            if (isSelected) displayColor = this.colors.selected;
            this.drawPath(ctx, points, displayColor, baseWidth);

            // V3.10: Anschussfahnen nur in CAM-Modi
            if (this.currentMode === 'anschuss' || this.currentMode === 'reihenfolge') {
                this.drawStartTriangle(ctx, points[0], this.colors.leadIn);
                this.drawSingleDirectionArrow(ctx, points);
                this.drawLeadIn(ctx, contour, points);
                this.drawOvercut(ctx, contour, points);
            }
        }
    }

    drawPath(ctx, points, color, lineWidth) {
        if (!points || points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    drawStartTriangle(ctx, point, color) {
        if (!point) return;
        const size = CanvasRenderer.MARKER_SIZE.START_TRIANGLE / this.scale;

        ctx.beginPath();
        ctx.moveTo(point.x, point.y + size);
        ctx.lineTo(point.x - size * 0.7, point.y - size * 0.5);
        ctx.lineTo(point.x + size * 0.7, point.y - size * 0.5);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1 / this.scale;
        ctx.stroke();
    }

    drawSingleDirectionArrow(ctx, points) {
        if (!points || points.length < 3) return;

        let totalLength = 0;
        for (let i = 1; i < points.length; i++) {
            totalLength += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
        }

        const targetDist = totalLength * 0.25;
        let accumulated = 0;

        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i-1].x;
            const dy = points[i].y - points[i-1].y;
            const segLen = Math.hypot(dx, dy);

            if (accumulated + segLen >= targetDist) {
                const t = (targetDist - accumulated) / segLen;
                const ax = points[i-1].x + dx * t;
                const ay = points[i-1].y + dy * t;
                const angle = Math.atan2(dy, dx);
                this.drawSmallArrow(ctx, ax, ay, angle, '#ffffff');
                break;
            }
            accumulated += segLen;
        }
    }

    drawSmallArrow(ctx, x, y, angle, color) {
        const size = CanvasRenderer.MARKER_SIZE.ARROW / this.scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.5, size * 0.6);
        ctx.lineTo(-size * 0.3, 0);
        ctx.lineTo(-size * 0.5, -size * 0.6);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.8 / this.scale;
        ctx.stroke();

        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // VERFAHRWEGE (Travel Paths) - Step 5
    // ════════════════════════════════════════════════════════════════

    drawTravelPaths(ctx) {
        const cutOrder = this.app.cutOrder;
        if (!cutOrder || cutOrder.length < 1) return;

        const origin = this.app.settings?.origin || { x: 0, y: 0 };

        ctx.setLineDash([4 / this.scale, 4 / this.scale]);
        ctx.strokeStyle = this.colors.travel;
        ctx.lineWidth = CanvasRenderer.LINE_WIDTH.TRAVEL / this.scale;

        let lastPos = origin;

        for (let i = 0; i < cutOrder.length; i++) {
            const contour = this.contours[cutOrder[i]];
            if (!contour || !contour.points || contour.points.length < 1) continue;

            const startPoint = contour.points[0];

            ctx.beginPath();
            ctx.moveTo(lastPos.x, lastPos.y);
            ctx.lineTo(startPoint.x, startPoint.y);
            ctx.stroke();

            const midX = (lastPos.x + startPoint.x) / 2;
            const midY = (lastPos.y + startPoint.y) / 2;
            const angle = Math.atan2(startPoint.y - lastPos.y, startPoint.x - lastPos.x);

            ctx.setLineDash([]);
            this.drawTravelArrow(ctx, midX, midY, angle);
            ctx.setLineDash([4 / this.scale, 4 / this.scale]);

            const endPoint = contour.points[contour.points.length - 1];
            lastPos = endPoint;
        }

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(origin.x, origin.y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.setLineDash([]);
    }

    drawTravelArrow(ctx, x, y, angle) {
        const size = 4 / this.scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.closePath();

        ctx.fillStyle = this.colors.travel;
        ctx.fill();

        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // REIHENFOLGE-NUMMERN (Order Numbers) - Step 5
    // ════════════════════════════════════════════════════════════════

    drawOrderNumbers() {
        const cutOrder = this.app.cutOrder;
        if (!cutOrder || cutOrder.length < 1) return;

        const ctx = this.ctx;

        for (let i = 0; i < cutOrder.length; i++) {
            const contour = this.contours[cutOrder[i]];
            if (!contour || !contour.points || contour.points.length < 1) continue;

            let cx = 0, cy = 0;
            for (const p of contour.points) {
                cx += p.x;
                cy += p.y;
            }
            cx /= contour.points.length;
            cy /= contour.points.length;

            const screen = this.worldToScreen(cx, cy);
            const num = i + 1;
            const size = CanvasRenderer.MARKER_SIZE.ORDER_NUMBER;

            ctx.beginPath();
            ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
            ctx.fillStyle = this.colors.orderNumberBg;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = `bold ${size}px sans-serif`;
            ctx.fillStyle = this.colors.orderNumber;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num.toString(), screen.x, screen.y);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // LEAD-IN (IGEMS-Stil: Einfache Linie Pierce → Entry)
    // ════════════════════════════════════════════════════════════════

    drawLeadIn(ctx, contour, kerfPoints) {
        let leadPath = null;
        try { leadPath = contour.getLeadInPath?.(); } catch(e) {}
        if (!leadPath?.points?.length || leadPath.points.length < 1) return;

        // "On geometry" -> kein sichtbarer Lead
        if (leadPath.type === 'on_geometry') {
            this.drawPierceSymbol(ctx, leadPath.piercingPoint, this.colors.leadIn, 'on_geometry');
            this._drawLeadTypeLabel(ctx, leadPath.piercingPoint, 'OG', this.colors.leadIn);
            return;
        }

        const pts = leadPath.points;
        if (pts.length < 2) return;

        const pierce = pts[0];
        const color = this.colors.leadIn;
        const lw = CanvasRenderer.LINE_WIDTH.LEAD / this.scale;
        const dash = this._getLeadDash(leadPath.type, lw);

        ctx.save();
        ctx.setLineDash(dash);
        if (leadPath.type === 'arc' && leadPath.arcCenter && leadPath.arcRadius) {
            this._drawArcLead(ctx, leadPath, color, lw);
        } else if (pts.length > 2) {
            this._drawLeadPath(ctx, pts, color, lw);
        } else {
            ctx.beginPath();
            ctx.moveTo(pierce.x, pierce.y);
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.stroke();
        }
        ctx.restore();

        // Pierce-Punkt
        this.drawPierceSymbol(ctx, pierce, color, 'pierce');

        // Typ-Label am Pierce-Punkt
        const label = this._getLeadTypeLabel(leadPath.type);
        this._drawLeadTypeLabel(ctx, pierce, label, color);

        // Richtungspfeil auf ~60% des Pfades
        const arrowIdx = Math.min(Math.floor(pts.length * 0.6), pts.length - 1);
        const prevIdx = Math.max(arrowIdx - 1, 0);
        const ax = pts[arrowIdx].x, ay = pts[arrowIdx].y;
        const angle = Math.atan2(ay - pts[prevIdx].y, ax - pts[prevIdx].x);
        this.drawSmallArrow(ctx, ax, ay, angle, color);
    }

    /** V5.2: Pfad mit Zwischenpunkten zeichnen (für gekürzte Arc-Leads Fallback) */
    _drawLeadPath(ctx, pts, color, lineWidth) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    /**
     * V5.6: Echte ctx.arc() Darstellung für Arc-Leads
     * Nutzt arcStartAngle/arcEndAngle direkt aus leadPath-Metadaten
     * Zeichnet: optionale Gerade (Pierce → Bogenstart) + Canvas-Bogen
     */
    _drawArcLead(ctx, leadPath, color, lineWidth) {
        const { arcCenter, arcRadius, arcSweepCCW, arcStartAngle, arcEndAngle, points, hasLinePortion } = leadPath;
        if (!arcCenter || !arcRadius || !points || points.length < 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        // Gerade Portion: Pierce-Punkt → Bogenstart (wenn Lead länger als Bogenlänge)
        if (hasLinePortion && points.length > 2) {
            const arcStartPt = { x: arcCenter.x + arcRadius * Math.cos(arcStartAngle), y: arcCenter.y + arcRadius * Math.sin(arcStartAngle) };
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(arcStartPt.x, arcStartPt.y);
            ctx.stroke();
        }

        // Bogen mit echtem ctx.arc()
        const sAngle = (arcStartAngle !== undefined) ? arcStartAngle
            : Math.atan2(points[0].y - arcCenter.y, points[0].x - arcCenter.x);
        const eAngle = (arcEndAngle !== undefined) ? arcEndAngle
            : Math.atan2(points[points.length - 1].y - arcCenter.y, points[points.length - 1].x - arcCenter.x);

        ctx.beginPath();
        ctx.arc(arcCenter.x, arcCenter.y, arcRadius, sAngle, eAngle, arcSweepCCW);
        ctx.stroke();
    }

    /** V5.2: Pierce-Symbol — ⊕ (Kreis + Kreuz) statt einfachem Punkt */
    drawPierceSymbol(ctx, point, color, type = 'pierce') {
        if (!point) return;
        const size = CanvasRenderer.MARKER_SIZE.PIERCE_POINT / this.scale;
        const crossSize = size * 1.4;

        // Gefüllter Kreis
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5 / this.scale;
        ctx.stroke();

        // Kreuz (⊕) — immer zeichnen für bessere Sichtbarkeit
        ctx.beginPath();
        ctx.moveTo(point.x - crossSize, point.y);
        ctx.lineTo(point.x + crossSize, point.y);
        ctx.moveTo(point.x, point.y - crossSize);
        ctx.lineTo(point.x, point.y + crossSize);
        ctx.strokeStyle = type === 'on_geometry' ? '#000' : color;
        ctx.lineWidth = 0.8 / this.scale;
        ctx.stroke();
    }

    /** Dash-Pattern je Lead-Typ (skaliert auf Linewidth) */
    _getLeadDash(type, lw) {
        const s = Math.max(lw * 3, 2 / this.scale);
        switch (type) {
            case 'arc':      return [];                        // durchgezogen
            case 'linear':   return [s * 2, s];                // gestrichelt ▬ ▬ ▬
            case 'tangent':  return [s * 2, s * 0.6, s * 0.5, s * 0.6]; // strichpunkt ▬·▬·
            default:         return [];
        }
    }

    /** Kurzlabel pro Lead-Typ */
    _getLeadTypeLabel(type) {
        switch (type) {
            case 'arc':     return 'A';
            case 'linear':  return 'L';
            case 'tangent': return 'T';
            default:        return '';
        }
    }

    /** Typ-Label neben dem Pierce-Punkt zeichnen */
    _drawLeadTypeLabel(ctx, point, label, color) {
        if (!label || !point) return;
        const fontSize = Math.max(10, 12 / this.scale);
        ctx.save();
        // Canvas hat Y-Flip → temporär zurückdrehen für Text
        ctx.translate(point.x, point.y);
        ctx.scale(1, -1);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, fontSize * 0.8, -fontSize * 0.3);
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // LEAD-OUT (IGEMS-Stil: Einfache Linie Exit → End)
    // ════════════════════════════════════════════════════════════════

    drawLeadOut(ctx, contour, kerfPoints) {
        let leadPath = null;
        try { leadPath = contour.getLeadOutPath?.(); } catch(e) {}
        if (!leadPath?.points?.length || leadPath.points.length < 2) return;

        const pts = leadPath.points;
        const color = this.colors.leadOut;
        const lw = CanvasRenderer.LINE_WIDTH.LEAD / this.scale;
        const dash = this._getLeadDash(leadPath.type, lw);

        ctx.save();
        ctx.setLineDash(dash);
        if (leadPath.type === 'arc' && leadPath.arcCenter && leadPath.arcRadius) {
            this._drawArcLead(ctx, leadPath, color, lw);
        } else if (pts.length > 2) {
            this._drawLeadPath(ctx, pts, color, lw);
        } else {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.stroke();
        }
        ctx.restore();

        // End-Punkt
        this.drawPierceSymbol(ctx, pts[pts.length - 1], color, 'exit');
    }

    // ════════════════════════════════════════════════════════════════
    // OVERCUT (entlang Kontur / Slit: rückwärts)
    // ════════════════════════════════════════════════════════════════

    drawOvercut(ctx, contour, kerfPoints) {
        let overcutPath = null;
        try { overcutPath = contour.getOvercutPath?.(); } catch(e) {}

        if (!overcutPath) return;

        if (overcutPath.type === 'negative') {
            // Negativer Overcut: X-Symbol am Startpunkt (Lücke)
            const p = kerfPoints?.[0];
            if (p) {
                const s = CanvasRenderer.MARKER_SIZE.PIERCE_POINT / this.scale;
                ctx.beginPath();
                ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
                ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s);
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 1.5 / this.scale;
                ctx.stroke();
            }
            return;
        }

        const pts = overcutPath.points;
        if (!pts || pts.length < 2) return;

        // Overcut-Linie
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = this.colors.overcut;
        ctx.lineWidth = CanvasRenderer.LINE_WIDTH.OVERCUT / this.scale;
        ctx.stroke();

        // Pfeil am Overcut-Ende
        if (pts.length >= 2) {
            const last = pts[pts.length - 1];
            const prev = pts[pts.length - 2];
            this.drawOvercutArrow(ctx, last.x, last.y, Math.atan2(last.y - prev.y, last.x - prev.x));
        }
    }

    drawOvercutArrow(ctx, x, y, angle) {
        const size = CanvasRenderer.MARKER_SIZE.OVERCUT_ARROW / this.scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.5, size * 0.5);
        ctx.lineTo(-size * 0.5, -size * 0.5);
        ctx.closePath();

        ctx.fillStyle = this.colors.overcut;
        ctx.fill();

        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // MICRO-JOINTS
    // ════════════════════════════════════════════════════════════════

    drawMicrojoints(ctx, contour, kerfPoints) {
        if (!contour.microjoints || contour.microjoints.length === 0) return;
        if (!kerfPoints || kerfPoints.length < 2) return;

        const distances = [0];
        for (let i = 1; i < kerfPoints.length; i++) {
            const d = Math.hypot(kerfPoints[i].x - kerfPoints[i-1].x, kerfPoints[i].y - kerfPoints[i-1].y);
            distances.push(distances[i-1] + d);
        }
        const totalLength = distances[distances.length - 1];

        for (const mj of contour.microjoints) {
            const position = mj.position % totalLength;
            const width = mj.width || 0.5;

            const pointData = this.getPointAtDistance(kerfPoints, distances, position);
            if (!pointData) continue;

            const { x, y } = pointData;
            const size = CanvasRenderer.MARKER_SIZE.MICROJOINT / this.scale;

            ctx.save();
            ctx.translate(x, y);

            ctx.beginPath();
            ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = this.colors.microjoint;
            ctx.globalAlpha = 0.3;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.moveTo(-size, -size);
            ctx.lineTo(size, size);
            ctx.moveTo(size, -size);
            ctx.lineTo(-size, size);
            ctx.strokeStyle = this.colors.microjoint;
            ctx.lineWidth = 2 / this.scale;
            ctx.stroke();

            ctx.restore();
        }
    }

    getPointAtDistance(points, distances, targetDist) {
        for (let i = 1; i < points.length; i++) {
            if (distances[i] >= targetDist) {
                const t = (targetDist - distances[i-1]) / (distances[i] - distances[i-1] || 1);
                return {
                    x: points[i-1].x + t * (points[i].x - points[i-1].x),
                    y: points[i-1].y + t * (points[i].y - points[i-1].y),
                    angle: Math.atan2(points[i].y - points[i-1].y, points[i].x - points[i-1].x)
                };
            }
        }
        return null;
    }

    // ════════════════════════════════════════════════════════════════
    // MESSUNGEN
    // ════════════════════════════════════════════════════════════════

    drawMeasurements(ctx) {
        for (const m of this.app.measurements) {
            ctx.beginPath();
            ctx.moveTo(m.p1.x, m.p1.y);
            ctx.lineTo(m.p2.x, m.p2.y);
            ctx.strokeStyle = this.colors.measurement;
            ctx.lineWidth = 2 / this.scale;
            ctx.stroke();

            const markerSize = CanvasRenderer.MARKER_SIZE.SNAP / this.scale;
            ctx.fillStyle = this.colors.measurement;
            ctx.beginPath();
            ctx.arc(m.p1.x, m.p1.y, markerSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(m.p2.x, m.p2.y, markerSize, 0, Math.PI * 2);
            ctx.fill();

            m._labelWorldPos = { x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 };
        }
    }

    drawRubberBand(ctx) {
        const start = this.app.measureStart;
        const snapPoint = this.app.currentSnapPoint;
        const coordX = parseFloat(document.getElementById('coord-x')?.textContent) || 0;
        const coordY = parseFloat(document.getElementById('coord-y')?.textContent) || 0;
        const end = snapPoint || { x: coordX, y: coordY };

        ctx.setLineDash([5 / this.scale, 5 / this.scale]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = this.colors.measurement;
        ctx.lineWidth = 1.5 / this.scale;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = this.colors.measurement;
        ctx.beginPath();
        ctx.arc(start.x, start.y, CanvasRenderer.MARKER_SIZE.SNAP / this.scale, 0, Math.PI * 2);
        ctx.fill();
    }

    drawNullPoint() {
        const screen = this.worldToScreen(this.nullPoint.x, this.nullPoint.y);
        const ctx = this.ctx;
        const size = 20;

        ctx.save();

        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(screen.x + size * 1.5, screen.y);
        ctx.stroke();

        ctx.strokeStyle = '#00ff00';
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(screen.x, screen.y - size * 1.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ff0000';
        ctx.fillText('X', screen.x + size * 1.5 + 4, screen.y + 4);
        ctx.fillStyle = '#00ff00';
        ctx.fillText('Y', screen.x - 4, screen.y - size * 1.5 - 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('0', screen.x - 14, screen.y + 14);

        ctx.restore();
    }

    drawSnapIndicator(point) {
        const screen = this.worldToScreen(point.x, point.y);
        const ctx = this.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = this.colors.snap;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = this.colors.snap;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(screen.x - 10, screen.y);
        ctx.lineTo(screen.x - 5, screen.y);
        ctx.moveTo(screen.x + 5, screen.y);
        ctx.lineTo(screen.x + 10, screen.y);
        ctx.moveTo(screen.x, screen.y - 10);
        ctx.lineTo(screen.x, screen.y - 5);
        ctx.moveTo(screen.x, screen.y + 5);
        ctx.lineTo(screen.x, screen.y + 10);
        ctx.stroke();

        ctx.restore();
    }

    /** V3.4: Fadenkreuz am Snap-Punkt (nur wenn Snap aktiv + nativer Cursor hidden) */
    _drawSnapCrosshair(ctx, sx, sy) {
        const arm = 20;
        const gap = 5;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sx - arm, sy); ctx.lineTo(sx - gap, sy);
        ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + arm, sy);
        ctx.moveTo(sx, sy - arm); ctx.lineTo(sx, sy - gap);
        ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + arm);
        ctx.stroke();
        ctx.restore();
    }

    drawMeasurementLabels() {
        if (!this.app?.measurements) return;
        const ctx = this.ctx;
        ctx.save();

        for (const m of this.app.measurements) {
            if (m._labelWorldPos) {
                const screen = this.worldToScreen(m._labelWorldPos.x, m._labelWorldPos.y);
                const text = `${m.distance.toFixed(2)} mm`;

                ctx.font = 'bold 12px monospace';
                const metrics = ctx.measureText(text);
                const padding = 6;
                const width = metrics.width + padding * 2;
                const height = 18;

                ctx.fillStyle = 'rgba(0, 80, 100, 0.95)';
                ctx.fillRect(screen.x - width / 2, screen.y - height / 2, width, height);

                ctx.strokeStyle = this.colors.measurement;
                ctx.lineWidth = 2;
                ctx.strokeRect(screen.x - width / 2, screen.y - height / 2, width, height);

                ctx.fillStyle = this.colors.measurementText;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, screen.x, screen.y);
            }
        }
        ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    // SNAP & HIT-TEST
    // ════════════════════════════════════════════════════════════════

    findSnapPoint(worldX, worldY) {
        const tolerance = CanvasRenderer.TOLERANCE.SNAP / this.scale;
        let closest = null;
        let closestDist = tolerance;

        if (!this.contours) return null;

        for (const contour of this.contours) {
            const points = contour.points;
            if (!points || points.length < 2) continue;

            for (const p of points) {
                const d = Math.hypot(p.x - worldX, p.y - worldY);
                if (d < closestDist) {
                    closestDist = d;
                    closest = { point: { x: p.x, y: p.y }, type: 'endpoint' };
                }
            }

            for (let i = 0; i < points.length - 1; i++) {
                const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
                const d = Math.hypot(mid.x - worldX, mid.y - worldY);
                if (d < closestDist) {
                    closestDist = d;
                    closest = { point: mid, type: 'midpoint' };
                }
            }

            if (contour.center) {
                const d = Math.hypot(contour.center.x - worldX, contour.center.y - worldY);
                if (d < closestDist) {
                    closestDist = d;
                    closest = { point: { x: contour.center.x, y: contour.center.y }, type: 'center' };
                }
            }
        }
        return closest;
    }

    findContourAtPoint(worldX, worldY) {
        const tolerance = CanvasRenderer.TOLERANCE.HIT_TEST / this.scale;
        if (!this.contours) return null;

        // V3.11: LayerManager für Sichtbarkeits-Check
        const lm = this.app?.layerManager;

        // V5.0: Rückwärts iterieren (AutoCAD-Konvention: zuletzt gezeichnet = oben)
        for (let ci = this.contours.length - 1; ci >= 0; ci--) {
            const contour = this.contours[ci];
            // V3.11: Unsichtbare Layer überspringen
            if (lm) {
                const ld = lm.getLayer(contour.layer || '0');
                if (ld && !ld.visible) continue;
            }
            const points = contour.points;
            if (points && points.length >= 2) {
                for (let i = 0; i < points.length - 1; i++) {
                    const dist = this.pointToSegmentDistance(worldX, worldY, points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                    if (dist < tolerance) return contour;
                }
            }

            try {
                const kerf = contour.getKerfOffsetPolyline?.();
                if (kerf?.points && kerf.points.length >= 2) {
                    for (let i = 0; i < kerf.points.length - 1; i++) {
                        const dist = this.pointToSegmentDistance(worldX, worldY,
                            kerf.points[i].x, kerf.points[i].y,
                            kerf.points[i+1].x, kerf.points[i+1].y);
                        if (dist < tolerance) return contour;
                    }
                }
            } catch(e) {}
        }
        return null;
    }

    _hitTestStartTriangle(worldPos) {
        if (!this.contours) return null;
        const hitRadius = CanvasRenderer.MARKER_SIZE.START_TRIANGLE / this.scale * 2;
        for (const contour of this.contours) {
            if (contour.isReference || (!contour.isClosed && contour.cuttingMode !== 'slit')) continue;
            let startPoint = contour.points[0];
            try {
                const kerf = contour.getKerfOffsetPolyline?.();
                if (kerf?.points?.length > 2 && !contour.compensationSkipped) {
                    startPoint = kerf.points[0];
                }
            } catch(e) {}
            if (!startPoint) continue;
            const dist = Math.hypot(worldPos.x - startPoint.x, worldPos.y - startPoint.y);
            if (dist < hitRadius) return contour;
        }
        return null;
    }

    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    zoomIn() { this.scale *= 1.3; this.render(); }
    zoomOut() { this.scale /= 1.3; this.render(); }

    fitToContent() {
        if (!this.contours || this.contours.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of this.contours) {
            if (!c.points) continue;
            for (const p of c.points) {
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            }
        }
        if (!isFinite(minX)) return;
        const w = maxX - minX || 1, h = maxY - minY || 1;
        const cw = this._logicalWidth, ch = this._logicalHeight;
        const margin = 40;
        this.scale = Math.min((cw - 2 * margin) / w, (ch - 2 * margin) / h);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        this.offsetX = cw / 2 - cx * this.scale;
        this.offsetY = ch / 2 + cy * this.scale;
        this.render();
    }

    // ════════════════════════════════════════════════════════════════
    // V3.10: GRIP EDITING SYSTEM
    // ════════════════════════════════════════════════════════════════

    /**
     * Grips für alle selektierten Konturen berechnen.
     * Grip-Objekt: { type, x, y, contour, indices, label }
     *   type: 'vertex' | 'midpoint' | 'center' | 'quadrant'
     *   indices: Array von Punkt-Indizes die beim Drag bewegt werden
     */
    _computeGrips() {
        this._grips = [];
        if (!this.contours) return;

        const selected = this.contours.filter(c => c.isSelected);
        if (selected.length === 0) return;

        for (const contour of selected) {
            const pts = contour.points;
            if (!pts || pts.length < 2) continue;

            // Kreis-Erkennung
            if (this._isCircleContour(contour)) {
                this._addCircleGrips(contour);
                continue;
            }

            // Segment-Anzahl (bei geschlossener Kontur: letzter Punkt = erster)
            const segCount = contour.isClosed ? pts.length - 1 : pts.length - 1;
            const vertCount = contour.isClosed ? pts.length - 1 : pts.length;

            // Max-Grips-Limit: Bei >80 Vertices nur Vertex-Grips, keine Midpoints
            const showMidpoints = vertCount <= 80;

            // Vertex-Grips
            for (let i = 0; i < vertCount; i++) {
                this._grips.push({
                    type: 'vertex',
                    x: pts[i].x,
                    y: pts[i].y,
                    contour: contour,
                    indices: contour.isClosed && i === 0
                        ? [0, pts.length - 1]  // Erster + letzter Punkt synchron
                        : [i],
                    label: 'V' + i
                });
            }

            // Midpoint-Grips
            if (showMidpoints) {
                for (let i = 0; i < segCount; i++) {
                    const j = (i + 1) % pts.length;
                    if (contour.isClosed && j >= pts.length - 1 && i !== segCount - 1) continue;
                    const nextIdx = contour.isClosed && i === segCount - 1 ? 0 : i + 1;
                    this._grips.push({
                        type: 'midpoint',
                        x: (pts[i].x + pts[nextIdx].x) / 2,
                        y: (pts[i].y + pts[nextIdx].y) / 2,
                        contour: contour,
                        indices: contour.isClosed && nextIdx === 0
                            ? [i, 0, pts.length - 1]  // Wrap-Around
                            : [i, nextIdx],
                        label: 'M' + i
                    });
                }
            }
        }
        this._gripDirty = false;
    }

    /**
     * Kreis-Heuristik: Geschlossen, ≥8 Punkte, alle Punkte ±3% gleich weit vom Centroid.
     */
    _isCircleContour(contour) {
        if (!contour.isClosed) return false;
        const pts = contour.points;
        const n = pts.length - 1; // Ohne doppelten Schlusspunkt
        if (n < 8) return false;

        // Centroid
        let cx = 0, cy = 0;
        for (let i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
        cx /= n; cy /= n;

        // Distanzen zum Centroid
        const dists = [];
        for (let i = 0; i < n; i++) {
            dists.push(Math.hypot(pts[i].x - cx, pts[i].y - cy));
        }
        const avgR = dists.reduce((s, d) => s + d, 0) / n;
        if (avgR < 0.01) return false; // Degeneriert

        // Alle Distanzen innerhalb ±3%?
        const tolerance = 0.03;
        return dists.every(d => Math.abs(d - avgR) / avgR < tolerance);
    }

    /**
     * Center + 4 Quadranten-Grips für Kreise.
     */
    _addCircleGrips(contour) {
        const pts = contour.points;
        const n = pts.length - 1;

        // Centroid + Radius berechnen
        let cx = 0, cy = 0;
        for (let i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
        cx /= n; cy /= n;
        let avgR = 0;
        for (let i = 0; i < n; i++) avgR += Math.hypot(pts[i].x - cx, pts[i].y - cy);
        avgR /= n;

        // Center-Grip: Bewegt alle Punkte
        const allIndices = [];
        for (let i = 0; i < pts.length; i++) allIndices.push(i);
        this._grips.push({
            type: 'center',
            x: cx, y: cy,
            contour: contour,
            indices: allIndices,
            _center: { x: cx, y: cy },
            _radius: avgR,
            label: 'Center'
        });

        // 4 Quadranten-Grips (0°, 90°, 180°, 270°)
        const quadrants = [
            { angle: 0,   x: cx + avgR, y: cy },
            { angle: 90,  x: cx, y: cy + avgR },
            { angle: 180, x: cx - avgR, y: cy },
            { angle: 270, x: cx, y: cy - avgR }
        ];
        for (const q of quadrants) {
            this._grips.push({
                type: 'quadrant',
                x: q.x, y: q.y,
                contour: contour,
                indices: allIndices,
                _center: { x: cx, y: cy },
                _radius: avgR,
                _angle: q.angle,
                label: 'Q' + q.angle
            });
        }
    }

    /**
     * Hit-Test: Prüft ob ein Weltpunkt auf einem Grip liegt.
     * @returns {Object|null} Grip-Objekt oder null
     */
    _hitTestGrip(worldPos) {
        if (this._gripDirty) this._computeGrips();
        if (this._grips.length === 0) return null;

        const hitRadius = 6 / this.scale; // 6 Pixel Toleranz
        let closest = null;
        let closestDist = hitRadius;

        for (const grip of this._grips) {
            const dist = Math.hypot(worldPos.x - grip.x, worldPos.y - grip.y);
            if (dist < closestDist) {
                closestDist = dist;
                closest = grip;
            }
        }
        return closest;
    }

    /**
     * Grip-Drag anwenden: Punkt(e) auf neue Position setzen.
     */
    _applyGripDrag(grip, newPos, contour) {
        const pts = contour.points;

        switch (grip.type) {
            case 'vertex': {
                // Einzelner Punkt (oder erster+letzter bei geschlossen)
                for (const idx of grip.indices) {
                    pts[idx].x = newPos.x;
                    pts[idx].y = newPos.y;
                }
                break;
            }
            case 'midpoint': {
                // Delta berechnen: Differenz zwischen neuem und altem Mittelpunkt
                const dx = newPos.x - grip.x;
                const dy = newPos.y - grip.y;
                for (const idx of grip.indices) {
                    pts[idx].x += dx;
                    pts[idx].y += dy;
                }
                // Grip-Position updaten für nächsten Frame
                grip.x = newPos.x;
                grip.y = newPos.y;
                break;
            }
            case 'center': {
                // Gesamte Kontur verschieben
                const dx = newPos.x - grip._center.x;
                const dy = newPos.y - grip._center.y;
                for (let i = 0; i < pts.length; i++) {
                    pts[i].x += dx;
                    pts[i].y += dy;
                }
                grip._center.x = newPos.x;
                grip._center.y = newPos.y;
                grip.x = newPos.x;
                grip.y = newPos.y;
                break;
            }
            case 'quadrant': {
                // Radius ändern: Abstand newPos zu Center = neuer Radius
                const cx = grip._center.x;
                const cy = grip._center.y;
                const newR = Math.max(0.1, Math.hypot(newPos.x - cx, newPos.y - cy));
                const oldR = grip._radius;
                if (oldR < 0.01) break;
                const scale = newR / oldR;
                for (let i = 0; i < pts.length; i++) {
                    pts[i].x = cx + (pts[i].x - cx) * scale;
                    pts[i].y = cy + (pts[i].y - cy) * scale;
                }
                grip._radius = newR;
                // Grip-Position auf neuen Quadranten-Punkt setzen
                const angleRad = grip._angle * Math.PI / 180;
                grip.x = cx + newR * Math.cos(angleRad);
                grip.y = cy + newR * Math.sin(angleRad);
                break;
            }
        }

        // Cache invalidieren
        contour._cachedKerfPolyline = null;
        contour._cacheKey = null;
        contour._cachedLeadInPath = null;
        contour._cachedLeadOutPath = null;
        contour._cachedOvercutPath = null;
    }

    /**
     * Grips zeichnen (blaue Quadrate, rot bei Hover/Drag).
     * Wird im World-Koordinatensystem aufgerufen (ctx ist bereits transformiert).
     */
    _drawGrips(ctx) {
        // Schneller Bail-Out: Keine Selektion → 0 Overhead
        if (!this._hasSelection && this._grips.length === 0) return;

        // Keine Grips wenn Tool aktiv oder Messmodus
        const toolMgr = this.app?.drawingTools || this.app?.toolManager;
        if (toolMgr?.isToolActive?.()) return;
        if (this.app?.measureMode) return;

        if (this._gripDirty) this._computeGrips();
        if (this._grips.length === 0) return;

        const size = 4 / this.scale;  // 4px Quadrat in Bildschirmpixeln

        for (const grip of this._grips) {
            let color = this.colors.grip;
            if (grip === this._hoveredGrip) color = this.colors.gripHover;

            ctx.fillStyle = color;
            // Quadrat zentriert auf Grip-Position
            ctx.fillRect(grip.x - size, grip.y - size, size * 2, size * 2);
        }
    }

    /**
     * Grips als dirty markieren (extern aufrufbar, z.B. nach Selektionänderung).
     */
    // ════════════════════════════════════════════════════════════════
    // THEME
    // ════════════════════════════════════════════════════════════════

    /**
     * Wechselt die Canvas-Farbpalette.
     * @param {'dark'|'light'} theme
     */
    setTheme(theme) {
        const palette = CANVAS_THEMES[theme];
        if (!palette) { console.warn('[CanvasRenderer] Unbekanntes Theme:', theme); return; }
        this.colors = Object.assign({}, palette);
        this._currentTheme = theme;
        console.log('[CanvasRenderer] Theme gewechselt:', theme);

        // V3.12 Fix: ACI 7 Layer-Farben invertieren (AutoCAD-Verhalten)
        // ACI 7 = weiß auf dunklem Hintergrund, schwarz auf hellem Hintergrund
        if (this.app?.layerManager) {
            const lm = this.app.layerManager;
            const isDark = (theme === 'dark');
            const aci7Dark = '#ffffff';
            const aci7Light = '#000000';
            const fromColor = isDark ? aci7Light : aci7Dark;
            const toColor   = isDark ? aci7Dark  : aci7Light;
            let changed = 0;
            for (const layer of lm.layers.values()) {
                if (layer.color.toLowerCase() === fromColor.toLowerCase()) {
                    layer.color = toColor;
                    changed++;
                }
            }
            if (changed > 0) {
                console.log(`[CanvasRenderer] ACI 7 invertiert: ${changed} Layer ${fromColor} → ${toColor}`);
                lm._notify();
            }
        }

        this.render();
    }

    invalidateGrips() {
        this._hasSelection = this.contours?.some(c => c.isSelected) || false;
        this._gripDirty = this._hasSelection;
        if (!this._hasSelection) {
            this._grips = [];
            this._hoveredGrip = null;
        }
    }
}
