/**
 * WARICAM V3.8 - Main Application
 * Wizard Controller + Konturen-Panel
 * V3.8: Layer-System, Layer-Manager Dialog, DXF-Writer R12
 * V3.7: Tier 4 Aufteilen — CL2D (Halbieren), CLND (N-Teilen), CLDCL (Divided Calculation)
 *       Ribbon-Gruppe "Aufteilen" im Start-Tab
 * V3.6: Tier 3 Phase A — GeometryOps, Explode (X), Join (J), Break (B)
 *       LineTool S/C=Close, Rechtsklick=Bestätigen, Auto-Apply Fixes
 * V3.5: Tier 2 Modification Tools (Move, Copy, Rotate, Mirror, Scale, Erase)
 *       Always-Active ToolManager, Window-Selection, Noun-Verb + Verb-Noun
 * V3.4: CAD Drawing Tools (Line, Circle, Rectangle, Arc, Polyline)
 * V3.3: Sinumerik 840D Postprozessor, Export + Vorschau-Modal
 * V3.2: Vollständige Undo-Abdeckung aller Benutzeraktionen
 * V3.1: Undo/Redo (Command Pattern), Clipboard (Copy/Cut/Paste)
 * V3.14: CAM-Tab Redesign — Außen/Innen-Lead, Material-Gruppe, Piercing-Typen, Speed-Info
 * V4.5: IGEMS 4-Slot Lead-System — Alternativ-Lead Fallback bei Kollision
 * Last Modified: 2026-02-17 UTC
 * Build: 20260217-cam45
 */

// XSS Protection
function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class WaricamApp {
    constructor() {
        // State
        this.currentStep = 1;
        this.totalSteps = 6; // Jetzt 6 Steps!
        this.fileLoaded = false;
        this.dxfContent = null;
        this.dxfResult = null;
        this.contours = [];
        this.cutOrder = []; // Schnitt-Reihenfolge (Indizes)
        this.selectedLayers = [];
        this.bounds = null;
        
        // Settings
        this.settings = {
            chainingTolerance: 0.1,
            kerfWidth: 0.8,
            quality: 2,
            origin: { x: 0, y: 0 },
            originPreset: 'bottom-left',
            microjointWidth: 0.5,
            microjointCount: 2,
            // V3.14: Material
            materialThickness: 10.0,
            kerfWidth: 0.8,   // fest 0.80mm (Düsen-Ø)
            // V3.14: Innen-Lead "= Außen" Flag
            internalLeadLikeExternal: true,
            // V4.5: Alternativ-Lead (intern automatisch)
            altLeadEnabled: true,
            // V5.0: CeraJet Technologie
            technology: {
                materialId: 1,          // Stahl
                nozzleId: 3,            // 0.25W / 0.80A (Standard)
                pressure: 2900,         // bar
                optMode: 'minKosten',   // Optimierungsmodus
                abrasiveOverride: null  // null = Auto aus Tabelle
            },
            // V5.2: Intarsien-Modus
            intarsiaMode: false,
            intarsiaGap: 1.6,           // Fugenbreite in mm
            intarsiaPreview: null,      // 'pos' | 'neg' | null
            // V5.3 Phase B: Flächenklassen (IGEMS-Standard)
            areaClasses: null           // null = nicht aktiv, Array = [{maxArea, enabled, ...}]
        };
        
        // Modi
        this.measureMode = false;
        this.measureStart = null;
        this.measurements = [];
        this.currentSnapPoint = null;
        
        this.startpointMode = false; // NEU: Startpunkt-Modus
        
        // Kontext-Menü
        this.contextMenuContour = null;
        this.contextMenuPoint = null;
        this.canvasContextMenuPoint = null; // V5.2: Rechtsklick-Position für Canvas-Menü
        this.lastToolShortcut = null;       // V5.2: Letzte Funktion für "Wiederholen"
        
        // Components
        this.renderer = null;
        
        // Undo/Redo & Clipboard (V1.0)
        this.undoManager = new UndoManager({
            maxHistory: 50,
            onStateChange: (state) => this._updateUndoUI(state)
        });
        this.clipboardManager = new ClipboardManager({
            undoManager: this.undoManager,
            app: this
        });
        
        // V3.5: ToolManager (Zeichnen + Modifikation)
        this.commandLine = null;
        this.snapManager = null;
        this.drawingTools = null;  // Alias für toolManager (Backward-Kompatibilität)
        this.toolManager = null;
        
        // V3.8: Layer-Management + DXF-Writer
        this.layerManager = new LayerManager();
        this.layerManager.onChange = () => this._updateLayerUI();
        this.dxfWriter = new DXFWriter();
        this.loadedFileName = '';  // Geladener Dateiname (für "Speichern")
        
        // V3.11: Image Underlay Manager
        this.imageUnderlayManager = new ImageUnderlayManager(this);
        
        // V3.1: Verifikation dass Undo-Integration geladen ist
        console.log(`[App V3.5] UndoManager: ${this.undoManager ? '✅ OK' : '❌ FEHLT'}, Clipboard: ${this.clipboardManager ? '✅ OK' : '❌ FEHLT'}`);
        
        this.init();
    }
    
    init() {
        console.log('%c╔══════════════════════════════════════════════╗', 'color: #00aaff; font-weight: bold');
        console.log('%c║  WARICAM Wasserstrahl-CAM V3.8               ║', 'color: #00aaff; font-weight: bold');
        console.log('%c║  V3.8: Layer-System + DXF-Writer R12         ║', 'color: #00aaff; font-weight: bold');
        console.log('%c╚══════════════════════════════════════════════╝', 'color: #00aaff; font-weight: bold');
        
        this.initRenderer();
        this.initDrawingTools();  // V3.4
        this.bindNavigationEvents();
        this.bindFileEvents();
        this.bindOriginEvents();
        this.bindReferenceEvents();
        this.bindCuttingEvents();
        this.bindExportEvents();
        this.bindCanvasEvents();
        this.bindMeasureEvents();
        this.bindStartpointEvents();
        this.bindContextMenuEvents();
        this.bindKeyboardEvents();
        this.bindContourPanelEvents();
        this.bindLeadLiveUpdates();
        this.bindMicrojointEvents();
        this.bindOrderEvents();
        this.bindTolerancePresets();  // Quick-Fix #5
        this.bindDrawingEvents();    // V3.4
        
        this.updateStepUI();
    }
    
    // ════════════════════════════════════════════════════════════════
    // QUICK-FIX #4: LOADING SPINNER
    // ════════════════════════════════════════════════════════════════
    
    showParserSpinner(show, subtext = 'Bitte warten') {
        const spinner = document.getElementById('parser-spinner');
        if (spinner) {
            spinner.style.display = show ? 'flex' : 'none';
            if (show) {
                document.getElementById('spinner-subtext').textContent = subtext;
            }
        }
    }
    
    // ════════════════════════════════════════════════════════════════
    // QUICK-FIX #5: TOLERANZ-PRESETS
    // ════════════════════════════════════════════════════════════════
    
    bindTolerancePresets() {
        document.querySelectorAll('.tolerance-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const tolerance = parseFloat(btn.dataset.tolerance);
                document.getElementById('chaining-tolerance').value = tolerance;
                this.settings.chainingTolerance = tolerance;
                
                // UI Update
                document.querySelectorAll('.tolerance-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.showToast(`Toleranz: ${tolerance}mm`, 'info');
            });
        });
        
        // Sync Input mit Presets
        document.getElementById('chaining-tolerance')?.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            document.querySelectorAll('.tolerance-preset').forEach(btn => {
                btn.classList.toggle('active', parseFloat(btn.dataset.tolerance) === value);
            });
        });
    }
    
    // ════════════════════════════════════════════════════════════════
    // RENDERER
    // ════════════════════════════════════════════════════════════════
    
    initRenderer() {
        if (typeof CanvasRenderer === 'undefined') {
            console.error('CanvasRenderer not loaded!');
            return;
        }
        
        this.renderer = new CanvasRenderer('canvas');
        this.renderer.app = this;
        
        // Mouse move callback
        this.renderer.onMouseMove = (worldX, worldY, snapPoint) => {
            document.getElementById('coord-x').textContent = worldX.toFixed(3);
            document.getElementById('coord-y').textContent = worldY.toFixed(3);
            
            // V3.5: Erweitertes Snap-System — immer aktiv (AutoCAD Running-OSNAP)
            let activeSnap = snapPoint;
            if (this.snapManager) {
                // Konturen immer synchron halten (nach Import, Zeichnen, Undo etc.)
                if (this.snapManager._contours !== this.contours && this.contours?.length) {
                    this.snapManager.setContours(this.contours);
                }
                const snap = this.snapManager.findSnap(worldX, worldY, this.renderer.scale);
                if (snap) activeSnap = { point: snap.point, type: snap.typeDef.name };
            }
            
            const snapIndicator = document.getElementById('snap-indicator');
            const prevSnap = this.currentSnapPoint;
            if (activeSnap) {
                this.currentSnapPoint = activeSnap.point;
                snapIndicator.style.display = 'inline';
                snapIndicator.textContent = `● SNAP (${activeSnap.type})`;
            } else {
                this.currentSnapPoint = null;
                snapIndicator.style.display = 'none';
            }
            
            // Snap aktiv → nativen Cursor verstecken, Crosshair wird am Snap-Punkt gezeichnet
            const hasSnap = !!this.snapManager?.currentSnap;
            if (this.toolManager?.isToolActive() || this.measureMode) {
                this.renderer.canvas.style.cursor = hasSnap ? 'none' : 'crosshair';
            }
            
            // Canvas bei Snap-Wechsel neu rendern (Crosshair + Indikator)
            // V1.2-fix: Auch bei Positionswechsel rendern + immer wenn Snap aktiv
            const snapChanged = (!!prevSnap !== !!this.currentSnapPoint) ||
                (prevSnap && this.currentSnapPoint && (prevSnap.x !== this.currentSnapPoint.x || prevSnap.y !== this.currentSnapPoint.y));
            if (snapChanged) {
                this.renderer?.render();
            }
            
            // V3.5: Tool Mouse-Move (Zeichnen + Modifikation)
            if (this.toolManager?.isToolActive()) {
                this.toolManager.handleMouseMove({ x: worldX, y: worldY });
            }
            
            // Messwerkzeug Live-Update
            if (this.measureMode && this.measureStart) {
                const endPoint = this.currentSnapPoint || { x: worldX, y: worldY };
                this.updateMeasureInfo(this.measureStart, endPoint);
            }
        };
        
        // Canvas click callback (Klick auf leere Fläche)
        this.renderer.onClick = (worldPoint) => {
            // Messmodus hat höchste Priorität
            if (this.measureMode) {
                this.handleMeasureClick(worldPoint);
                return;
            }
            // V3.5: Aktives Tool hat Priorität (Zeichnen + Modifikation)
            if (this.toolManager?.isToolActive()) {
                this.toolManager.handleClick(worldPoint);
                return;
            }
            if (this.startpointMode) {
                const contour = this.renderer.findContourAtPoint(worldPoint.x, worldPoint.y);
                if (contour && (contour.isClosed || contour.cuttingMode === 'slit') && !contour.isReference) {
                    this.setStartpointOnContour(contour, worldPoint);
                }
                return;
            }
            if (this.currentStep === 3) {
                const point = this.currentSnapPoint || worldPoint;
                this.setOriginFromPoint(point);
                this.currentStep = 0; // Reset nach Setzen
                document.getElementById('btn-set-origin-from-snap')?.classList.remove('active');
                document.getElementById('ct-origin')?.classList.remove('active');
                this.showToast(`Nullpunkt: X=${point.x.toFixed(3)}, Y=${point.y.toFixed(3)}`, 'success');
                console.log('[Origin V5.0] Nullpunkt gesetzt:', point.x.toFixed(3), point.y.toFixed(3));
                return;
            }
            // V3.5: Klick auf leere Fläche → Selektion aufheben (wenn kein Tool aktiv)
            this.contours.forEach(c => { c.isSelected = false; });
            this.renderer?.invalidateGrips?.();  // V3.10
            this.renderer?.render();
            this.updateContourPanel();
        };
        
        // Contour click callback
        this.renderer.onContourClick = (contour, worldPoint, isShift) => {
            // V3.5: Aktives Tool hat Priorität (Zeichnen + Modifikation)
            if (this.toolManager?.isToolActive()) {
                this.toolManager.handleClick(worldPoint);
                return;
            }
            if (this.measureMode) {
                this.handleMeasureClick(worldPoint);
                return;
            }
            
            if (this.startpointMode) {
                if ((contour.isClosed || contour.cuttingMode === 'slit') && !contour.isReference) {
                    this.setStartpointOnContour(contour, worldPoint);
                }
                return;
            }
            
            // Step-spezifische Logik
            if (this.currentStep === 2) {
                this.toggleReference(contour);
                return;
            }
            if (this.currentStep === 3) {
                const point = this.currentSnapPoint || worldPoint;
                this.setOriginFromPoint(point);
                this.currentStep = 0;
                document.getElementById('btn-set-origin-from-snap')?.classList.remove('active');
                document.getElementById('ct-origin')?.classList.remove('active');
                this.showToast(`Nullpunkt: X=${point.x.toFixed(3)}, Y=${point.y.toFixed(3)}`, 'success');
                console.log('[Origin V5.0] Nullpunkt gesetzt:', point.x.toFixed(3), point.y.toFixed(3));
                return;
            }
            
            // V5.2: Additive Selektion — Klick addiert, Shift subtrahiert
            if (isShift) {
                // Shift+Klick: Aus Selektion entfernen
                contour.isSelected = false;
            } else {
                // Klick: Zur Selektion hinzufügen (ohne andere zu deselektieren)
                contour.isSelected = true;
            }
            this.renderer.invalidateGrips?.();  // V3.10: Grips aktualisieren
            this.renderer.render();
            this.updateContourPanel();
        };
        
        // V5.2: Rechtsklick — Tool bestätigen ODER Kontext-Menü (Kontur/Canvas)
        this.renderer.onRightClick = (contour, worldPoint, screenX, screenY) => {
            // Aktives Tool hat Priorität — Rechtsklick = Enter/Bestätigen (AutoCAD-Stil)
            if (this.toolManager?.isToolActive()) {
                this.toolManager._handleEnter();
                return;
            }
            if (contour) {
                this.showContextMenu(contour, worldPoint, screenX, screenY);
            } else {
                // V5.2: Canvas-Kontextmenü auf leerer Fläche
                this.showCanvasContextMenu(worldPoint, screenX, screenY);
            }
        };
        
        console.log('✓ CanvasRenderer initialized');
    }
    
    // ════════════════════════════════════════════════════════════════
    // V3.4: CAD DRAWING TOOLS
    // ════════════════════════════════════════════════════════════════
    
    initDrawingTools() {
        // CommandLine
        if (typeof CommandLine !== 'undefined') {
            this.commandLine = new CommandLine({
                containerId: 'command-line',
                inputId: 'cmd-input',
                promptId: 'cmd-prompt',
                historyId: 'cmd-history'
            });
        } else {
            console.warn('[V3.5] CommandLine nicht geladen');
        }
        
        // SnapManager
        if (typeof SnapManager !== 'undefined') {
            this.snapManager = new SnapManager();
        } else {
            console.warn('[V3.5] SnapManager nicht geladen');
        }
        
        // V3.5: ToolManager (ersetzt DrawingToolManager)
        const ToolCls = (typeof ToolManager !== 'undefined') ? ToolManager :
                        (typeof DrawingToolManager !== 'undefined') ? DrawingToolManager : null;
        if (ToolCls) {
            this.toolManager = new ToolCls({
                app: this,
                renderer: this.renderer,
                commandLine: this.commandLine,
                snapManager: this.snapManager
            });
            this.drawingTools = this.toolManager;  // Backward-Kompatibilität
        } else {
            console.warn('[V3.5] ToolManager nicht geladen');
        }
        
        // V3.5: Command-Line immer sichtbar + aktiv
        if (this.commandLine) {
            this.commandLine.activate();
            const cmdContainer = document.getElementById('command-line');
            if (cmdContainer) cmdContainer.style.display = 'flex';
        }
        
        // V3.5: SnapManager mit Konturen synchronisieren
        if (this.snapManager && this.contours?.length) {
            this.snapManager.setContours(this.contours);
        }
        
        console.log(`[V3.5] ToolManager: CmdLine=${this.commandLine ? '✅' : '❌'}, Snap=${this.snapManager ? '✅' : '❌'}, Tools=${this.toolManager ? '✅' : '❌'}`);
    }
    
    bindDrawingEvents() {
        // V3.4: Step 1 Tab-System (Import / Zeichnen)
        document.querySelectorAll('.step1-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                // Tab-Buttons umschalten
                document.querySelectorAll('.step1-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Tab-Content umschalten
                document.getElementById('tab-import').style.display = targetTab === 'import' ? 'block' : 'none';
                document.getElementById('tab-import')?.classList.toggle('active', targetTab === 'import');
                document.getElementById('tab-draw').style.display = targetTab === 'draw' ? 'block' : 'none';
                document.getElementById('tab-draw')?.classList.toggle('active', targetTab === 'draw');
                
                // Zeichenmodus automatisch aktivieren/deaktivieren
                if (targetTab === 'draw' && !this.drawingTools?.drawMode) {
                    this.toggleDrawMode();
                } else if (targetTab === 'import' && this.drawingTools?.drawMode) {
                    this.toggleDrawMode();
                }
            });
        });
        
        // Sidebar Draw-Tool Buttons
        document.querySelectorAll('.draw-sidebar-btn[data-shortcut]').forEach(btn => {
            btn.addEventListener('click', () => {
                const shortcut = btn.dataset.shortcut;
                if (!this.drawingTools?.drawMode) this.toggleDrawMode();
                this.drawingTools?.startTool(shortcut);
            });
        });
        
        // Sidebar Apply + Clear
        document.getElementById('btn-apply-drawing-sidebar')?.addEventListener('click', () => {
            this.drawingTools?.applyEntities();
            this._updateDrawEntityCount();
        });
        document.getElementById('btn-clear-drawing')?.addEventListener('click', () => {
            if (this.drawingTools) {
                this.drawingTools.entities = [];
                this.drawingTools.rubberBand = null;
                this.renderer?.render();
                this._updateDrawEntityCount();
                this.showToast('Zeichnung gelöscht', 'info');
            }
        });
        
        // Sidebar Ortho + Snap Checkboxen
        document.getElementById('draw-ortho-cb')?.addEventListener('change', (e) => {
            if (this.snapManager) {
                this.snapManager.orthoEnabled = e.target.checked;
                document.getElementById('btn-ortho-toggle')?.classList.toggle('active', e.target.checked);
            }
        });
        document.getElementById('draw-snap-cb')?.addEventListener('change', (e) => {
            if (this.snapManager) {
                // Haupt-Snaps ein/ausschalten (Nearest bleibt separat steuerbar)
                const on = e.target.checked;
                this.snapManager.enabledSnaps.endpoint = on;
                this.snapManager.enabledSnaps.midpoint = on;
                this.snapManager.enabledSnaps.center = on;
                this.snapManager.enabledSnaps.intersection = on;
                // nearest bleibt wie es ist (standardmäßig AUS)
            }
        });
        
        // Draw-Mode Toggle-Button
        document.getElementById('btn-draw-mode')?.addEventListener('click', () => {
            this.toggleDrawMode();
        });
        
        // Draw-Toolbar Buttons (Tool-Selektion)
        document.querySelectorAll('.draw-tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (!this.drawingTools?.drawMode) this.toggleDrawMode();
                this.drawingTools?.startTool(tool);
                this.lastToolShortcut = tool; // V5.2: Letzte Funktion merken
                
                // Active-State visuell
                document.querySelectorAll('.draw-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Apply-Button
        document.getElementById('btn-apply-drawing')?.addEventListener('click', () => {
            this.drawingTools?.applyEntities();
        });
        
        // Ortho-Toggle
        document.getElementById('btn-ortho-toggle')?.addEventListener('click', () => {
            if (this.snapManager) {
                const ortho = this.snapManager.toggleOrtho();
                document.getElementById('btn-ortho-toggle')?.classList.toggle('active', ortho);
                this.showToast(ortho ? '⊞ Ortho-Modus EIN (0°/90°)' : '⊞ Ortho-Modus AUS', 'info');
            }
        });
    }
    
    toggleDrawMode() {
        if (!this.drawingTools) return;
        
        if (this.drawingTools.drawMode) {
            // Zeichenmodus beenden
            this.drawingTools.exitDrawMode();
            document.getElementById('btn-draw-mode')?.classList.remove('active');
            document.getElementById('draw-toolbar').style.display = 'none';
            this.showToast('Zeichenmodus beendet', 'info');
        } else {
            // Andere Modi beenden
            if (this.measureMode) this.toggleMeasureMode();
            if (this.startpointMode) this.toggleStartpointMode();
            
            // Zeichenmodus starten
            this.drawingTools.enterDrawMode();
            this.snapManager?.setContours(this.contours || []);
            document.getElementById('btn-draw-mode')?.classList.add('active');
            document.getElementById('draw-toolbar').style.display = 'flex';
            this.showToast('✏️ Zeichenmodus: Werkzeug wählen oder Shortcut eingeben (L/C/N/A/P)', 'success');
        }
    }
    
    /** Gezeichnete Entities zum Kontur-Array hinzufügen (durch Pipeline) */
    addDrawnEntities(dxfEntities) {
        if (!dxfEntities || dxfEntities.length === 0) return;
        
        const tolerance = this.settings.chainingTolerance || 0.1;
        
        // Entities durch DXF-Parser chainContours schicken
        let newContours = [];
        try {
            if (typeof DXFParser !== 'undefined' && DXFParser.chainContours) {
                newContours = DXFParser.chainContours(dxfEntities, tolerance);
            } else {
                // Fallback: Direkte Konvertierung
                for (const entity of dxfEntities) {
                    if (entity.points && entity.points.length >= 2) {
                        if (typeof CamContour !== 'undefined') {
                            const c = new CamContour(entity.points, {
                                layer: 'DRAW',
                                name: `Gezeichnet ${this.contours.length + newContours.length + 1}`
                            });
                            newContours.push(c);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[V3.4] addDrawnEntities Fehler:', e);
            this.showToast('Fehler beim Konvertieren der Zeichnung', 'error');
            return;
        }
        
        if (newContours.length === 0) {
            this.showToast('Keine gültigen Konturen aus Zeichnung', 'warning');
            return;
        }
        
        // CamContour-Wrapping + Topologie-Klassifizierung (V5.0)
        const camContours = newContours.map(c => {
            let cam;
            if (typeof CamContour !== 'undefined' && !(c instanceof CamContour)) {
                cam = new CamContour(c.points, {
                    layer: 'DRAW',
                    name: c.name || 'Gezeichnet'
                });
            } else {
                cam = c;
            }
            
            // V5.0: cuttingMode setzen (sonst keine Kerf/Leads/Flags)
            if (!cam.cuttingMode) {
                if (!cam.isClosed) {
                    cam.cuttingMode = 'slit';
                } else {
                    // Nesting-Check: liegt die neue Kontur innerhalb einer bestehenden Disc?
                    let nestingLevel = 0;
                    const testPt = cam.points[0];
                    for (const existing of this.contours) {
                        if (existing.isClosed && !existing.isReference && existing.points?.length >= 3) {
                            if (WaricamPipeline._pointInPolygon(testPt, existing.points)) {
                                nestingLevel++;
                            }
                        }
                    }
                    cam.cuttingMode = nestingLevel % 2 === 0 ? 'disc' : 'hole';
                    cam.nestingLevel = nestingLevel;
                    cam.type = nestingLevel % 2 === 0 ? 'OUTER' : 'INNER';
                    console.log(`[V5.0] Gezeichnete Kontur klassifiziert: ${cam.cuttingMode} (nesting=${nestingLevel})`);
                }
            }
            return cam;
        });
        
        // Über Undo-Manager hinzufügen
        const addCmd = new AddContoursCommand(
            this.contours,
            camContours,
            this.contours.length,
            () => {
                this.rebuildCutOrder();
                this.renderer?.setContours(this.contours);
                this.updateContourPanel();
                this.updateStats({ totalEntities: this.contours.length });
            }
        );
        this.undoManager.execute(addCmd);
        
        // V3.5-fix: fileLoaded setzen damit Step-Navigation funktioniert (auch ohne DXF-Import)
        if (!this.fileLoaded) {
            this.fileLoaded = true;
            console.log('[App V3.5] fileLoaded=true (via Drawing)');
        }
        
        // Drop-Zone ausblenden + Canvas-Fit (Fix: empty-state bleibt sonst sichtbar)
        document.getElementById('drop-zone')?.classList.remove('empty-state', 'visible');
        this.updateStepUI();
        this.renderer?.fitToContent();
        
        this.showToast(`✓ ${camContours.length} gezeichnete Kontur(en) hinzugefügt (STRG+Z = Rückgängig)`, 'success');
        this._updateDrawEntityCount();
    }
    
    /** Entity-Zähler im Zeichnen-Tab aktualisieren */
    _updateDrawEntityCount() {
        const count = this.drawingTools?.entities?.length || 0;
        const el = document.getElementById('draw-entity-count');
        if (el) el.textContent = count;
    }
    
    // ════════════════════════════════════════════════════════════════
    // STARTPUNKT VERSCHIEBEN (V2.8)
    // ════════════════════════════════════════════════════════════════
    
    bindStartpointEvents() {
        document.getElementById('btn-set-startpoint')?.addEventListener('click', () => {
            this.toggleStartpointMode();
        });
    }
    
    toggleStartpointMode() {
        this.startpointMode = !this.startpointMode;
        
        // Andere Modi beenden
        if (this.startpointMode && this.measureMode) {
            this.toggleMeasureMode();
        }
        
        const btn = document.getElementById('btn-set-startpoint');
        const indicator = document.getElementById('startpoint-indicator');
        
        if (this.startpointMode) {
            btn?.classList.add('active');
            if (indicator) indicator.style.display = 'inline';
            this.renderer.canvas.style.cursor = 'crosshair';
            this.renderer.canvas.classList.add('startpoint-mode');
            this.showToast('📍 Startpunkt-Modus - Klick auf Kontur, ESC zum Beenden', 'success');
        } else {
            btn?.classList.remove('active');
            if (indicator) indicator.style.display = 'none';
            this.renderer.canvas.style.cursor = 'default';
            this.renderer.canvas.classList.remove('startpoint-mode');
        }
    }
    
    setStartpointOnContour(contour, clickPoint) {
        if (!contour || !contour.points || contour.points.length < 3) return;
        
        const points = contour.points;
        
        // Finde nächsten Punkt auf der Kontur
        let nearestIndex = 0;
        let minDist = Infinity;
        
        for (let i = 0; i < points.length - 1; i++) {
            const d = Math.hypot(points[i].x - clickPoint.x, points[i].y - clickPoint.y);
            if (d < minDist) {
                minDist = d;
                nearestIndex = i;
            }
        }
        
        // Rotiere Punkte-Array
        if (nearestIndex > 0) {
            const before = points.slice(0, nearestIndex);
            const after = points.slice(nearestIndex);
            
            // Neues Array: after + before (ohne doppelten Schlusspunkt)
            const newPoints = [...after];
            
            // Wenn geschlossen, alten Anfang anhängen
            if (contour.isClosed) {
                newPoints.push(...before);
                // Schließen
                if (newPoints.length > 0) {
                    newPoints.push({...newPoints[0]});
                }
            }
            
            contour.points = newPoints;
            contour.invalidate?.();
            
            this.showToast(`📍 Startpunkt verschoben (Punkt ${nearestIndex})`, 'success');
            this.renderer.render();
            this.updateContourPanel();
        }
    }
    
    // ════════════════════════════════════════════════════════════════
    // KONTEXT-MENÜ (V2.8)
    // ════════════════════════════════════════════════════════════════
    
    bindContextMenuEvents() {
        const menu = document.getElementById('context-menu');
        const canvasMenu = document.getElementById('canvas-context-menu');
        
        // Kontur-Menü Items
        menu?.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
                this.hideContextMenu();
            });
        });

        // V5.2: Canvas-Menü Items
        canvasMenu?.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.canvasAction;
                if (action) this.handleCanvasContextMenuAction(action);
            });
        });
        
        // Klick außerhalb schließt beide Menüs
        document.addEventListener('click', (e) => {
            if (!menu?.contains(e.target)) this.hideContextMenu();
            if (!canvasMenu?.contains(e.target)) this.hideCanvasContextMenu();
        });
        
        // ESC schließt beide Menüs
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
                this.hideCanvasContextMenu();
            }
        });
        
        // Canvas Rechtsklick (Backup-Handler für Kontext-Menü)
        this.renderer?.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.toolManager?.isToolActive()) return;
            
            const worldPos = this.renderer.screenToWorld(e.offsetX, e.offsetY);
            const contour = this.renderer.findContourAtPoint(worldPos.x, worldPos.y);
            
            if (contour) {
                this.showContextMenu(contour, worldPos, e.clientX, e.clientY);
            } else {
                // V5.2: Canvas-Menü auf leerer Fläche
                this.showCanvasContextMenu(worldPos, e.clientX, e.clientY);
            }
        });
    }
    
    showContextMenu(contour, worldPoint, screenX, screenY) {
        this.contextMenuContour = contour;
        this.contextMenuPoint = worldPoint;
        this.hideCanvasContextMenu(); // V5.2: Canvas-Menü schließen
        
        const menu = document.getElementById('context-menu');
        if (!menu) return;
        
        // Position
        menu.style.left = `${screenX}px`;
        menu.style.top = `${screenY}px`;
        menu.classList.add('visible');
        
        // Menü-Items je nach Kontext ein/ausblenden
        const isReference = contour.isReference;
        const isCuttable = (contour.isClosed || contour.cuttingMode === 'slit') && !isReference;
        
        menu.querySelector('[data-action="set-startpoint"]').style.display = 
            isCuttable ? 'flex' : 'none';
        menu.querySelector('[data-action="reverse-direction"]').style.display = 
            isCuttable ? 'flex' : 'none';
        menu.querySelector('[data-action="add-microjoint"]').style.display = 
            (contour.isClosed && !isReference) ? 'flex' : 'none';
    }
    
    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        menu?.classList.remove('visible');
        this.contextMenuContour = null;
        this.contextMenuPoint = null;
    }
    
    handleContextMenuAction(action) {
        const contour = this.contextMenuContour;
        const point = this.contextMenuPoint;
        
        if (!contour) return;
        
        const rerender = () => {
            this.renderer?.render();
            this.updateContourPanel();
        };
        
        switch (action) {
            case 'set-startpoint':
                this.setStartpointOnContour(contour, point);
                break;
                
            case 'reverse-direction':
                this.reverseContourDirection(contour);
                break;
                
            case 'set-hole': {
                const cmd = new PropertyChangeCommand(contour, 'cuttingMode', 'hole', () => {
                    contour.invalidate?.();
                    rerender();
                });
                this.undoManager.execute(cmd);
                this.showToast('⭕ Als Loch markiert (STRG+Z = Rückgängig)', 'success');
                return; // rerender schon im Callback
            }
                
            case 'set-disc': {
                const cmd = new PropertyChangeCommand(contour, 'cuttingMode', 'disc', () => {
                    contour.invalidate?.();
                    rerender();
                });
                this.undoManager.execute(cmd);
                this.showToast('🔵 Als Scheibe markiert (STRG+Z = Rückgängig)', 'success');
                return;
            }
                
            case 'flip-kerf': {
                const wasFlipped = !!contour.kerfFlipped;
                const cmd = new FunctionCommand(
                    'Kerf umkehren',
                    () => { contour.toggleKerfSide?.(); rerender(); },
                    () => { contour.toggleKerfSide?.(); rerender(); }
                );
                this.undoManager.execute(cmd);
                this.showToast(
                    !wasFlipped ? '⇄ Kerf umgekehrt' : '⇄ Kerf normal',
                    'success'
                );
                return;
            }
                
            case 'set-reference': {
                const cmd = new PropertyChangeCommand(contour, 'isReference', !contour.isReference, rerender);
                this.undoManager.execute(cmd);
                this.showToast(!contour.isReference ? '🚫 Als Referenz markiert' : 'Referenz aufgehoben', 'success');
                return;
            }
                
            case 'add-microjoint':
                this.addMicrojointAtPoint(contour, point);
                break;

            case 'origin-to-endpoint': {
                // V5.3: Nullpunkt zum nächsten Endpunkt der Kontur setzen
                if (!contour.points || contour.points.length < 2) break;
                const clickPt = this.currentSnapPoint || point;
                let bestPt = contour.points[0];
                let bestDist = Infinity;
                for (const p of contour.points) {
                    const d = Math.hypot(p.x - clickPt.x, p.y - clickPt.y);
                    if (d < bestDist) { bestDist = d; bestPt = p; }
                }
                this.setOriginFromPoint({ x: bestPt.x, y: bestPt.y });
                this.showToast(`📍 Nullpunkt → Endpunkt: X=${bestPt.x.toFixed(3)}, Y=${bestPt.y.toFixed(3)}`, 'success');
                console.log('[Origin V5.3] Nullpunkt → Endpunkt:', bestPt.x.toFixed(3), bestPt.y.toFixed(3));
                break;
            }

            case 'origin-to-midpoint': {
                // V5.3: Nullpunkt zum geometrischen Mittelpunkt (Centroid) der Kontur
                if (!contour.points || contour.points.length < 2) break;
                let cx = 0, cy = 0;
                const pts = contour.isClosed ? contour.points.slice(0, -1) : contour.points;
                for (const p of pts) { cx += p.x; cy += p.y; }
                cx /= pts.length;
                cy /= pts.length;
                this.setOriginFromPoint({ x: cx, y: cy });
                this.showToast(`📍 Nullpunkt → Mittelpunkt: X=${cx.toFixed(3)}, Y=${cy.toFixed(3)}`, 'success');
                console.log('[Origin V5.3] Nullpunkt → Mittelpunkt:', cx.toFixed(3), cy.toFixed(3));
                break;
            }
                
            case 'duplicate':
                this.duplicateContour(contour);
                return; // hat eigenes rerender
                
            case 'delete':
                this.deleteContour(contour);
                return; // hat eigenes rerender
        }
        
        this.renderer?.render();
        this.updateContourPanel();
    }
    
    // ════════════════════════════════════════════════════════════════
    // V5.2: CANVAS-KONTEXTMENÜ (Rechtsklick auf leere Fläche)
    // ════════════════════════════════════════════════════════════════

    showCanvasContextMenu(worldPoint, screenX, screenY) {
        console.log('[ContextMenu V5.2] Canvas-Menü:', worldPoint.x.toFixed(2), worldPoint.y.toFixed(2));
        this.canvasContextMenuPoint = worldPoint;
        this.hideContextMenu(); // Kontur-Menü schließen falls offen

        const menu = document.getElementById('canvas-context-menu');
        if (!menu) return;

        // "Letzte Funktion" ein/ausblenden
        const repeatItem = menu.querySelector('[data-canvas-action="repeat-last"]');
        if (repeatItem) {
            if (this.lastToolShortcut) {
                repeatItem.style.display = 'flex';
                repeatItem.textContent = `↺ ${this.lastToolShortcut} wiederholen`;
            } else {
                repeatItem.style.display = 'none';
            }
        }

        // Undo/Redo Verfügbarkeit
        const undoItem = menu.querySelector('[data-canvas-action="undo"]');
        const redoItem = menu.querySelector('[data-canvas-action="redo"]');
        if (undoItem) undoItem.style.opacity = this.undoManager?.canUndo() ? '1' : '0.4';
        if (redoItem) redoItem.style.opacity = this.undoManager?.canRedo() ? '1' : '0.4';

        // Paste Verfügbarkeit
        const pasteItem = menu.querySelector('[data-canvas-action="paste"]');
        if (pasteItem) pasteItem.style.opacity = this.undoManager?.clipboard?.length ? '1' : '0.4';

        // Position
        menu.style.left = `${screenX}px`;
        menu.style.top = `${screenY}px`;
        menu.classList.add('visible');
    }

    hideCanvasContextMenu() {
        const menu = document.getElementById('canvas-context-menu');
        menu?.classList.remove('visible');
        this.canvasContextMenuPoint = null;
    }

    handleCanvasContextMenuAction(action) {
        console.log('[ContextMenu V5.2] Canvas-Aktion:', action);
        const point = this.canvasContextMenuPoint;

        switch (action) {
            case 'repeat-last':
                if (this.lastToolShortcut && this.toolManager) {
                    this.toolManager.startTool(this.lastToolShortcut);
                }
                break;

            case 'paste':
                this.undoManager?.paste?.(this);
                break;

            case 'select-all':
                this.contours.forEach(c => { if (!c.isReference) c.isSelected = true; });
                this.renderer?.invalidateGrips?.();
                this.renderer?.render();
                this.updateContourPanel();
                break;

            case 'deselect-all':
                this.contours.forEach(c => { c.isSelected = false; });
                this.renderer?.invalidateGrips?.();
                this.renderer?.render();
                this.updateContourPanel();
                break;

            case 'undo':
                this.undoManager?.undo();
                this._refreshAfterUndoRedo();
                break;

            case 'redo':
                this.undoManager?.redo();
                this._refreshAfterUndoRedo();
                break;

            case 'set-origin':
                if (point) {
                    const snapPt = this.currentSnapPoint || point;
                    this.setOriginFromPoint(snapPt);
                    this.showToast(`Nullpunkt: X=${snapPt.x.toFixed(3)}, Y=${snapPt.y.toFixed(3)}`, 'success');
                    console.log('[Origin V5.2] Nullpunkt via Kontextmenü:', snapPt.x.toFixed(3), snapPt.y.toFixed(3));
                }
                break;

            case 'zoom-fit':
                this.renderer?.fitToContent();
                break;

            case 'calculator':
                this._showCalculator();
                break;
        }

        this.hideCanvasContextMenu();
    }

    /** V5.2: Mini-Taschenrechner (Prompt-basiert) */
    _showCalculator() {
        const expr = prompt('🧮 Taschenrechner — Ausdruck eingeben:', '');
        if (expr === null || expr.trim() === '') return;
        try {
            // Sichere Auswertung: nur Zahlen und Operatoren
            const sanitized = expr.replace(/[^0-9+\-*/().,%^sqrt\s]/gi, '');
            // Math-Funktionen erlauben
            const safe = sanitized
                .replace(/sqrt/gi, 'Math.sqrt')
                .replace(/\^/g, '**')
                .replace(/%/g, '/100*');
            const result = Function('"use strict"; return (' + safe + ')')();
            this.showToast(`🧮 ${expr} = ${result}`, 'success');
            // In Commandline eintragen für Copy
            const cmdInput = document.getElementById('cmd-input');
            if (cmdInput) cmdInput.value = String(result);
            console.log('[Calculator V5.2]', expr, '=', result);
        } catch (e) {
            this.showToast(`❌ Ungültiger Ausdruck: ${expr}`, 'error');
        }
    }

    reverseContourDirection(contour) {
        if (!contour || !contour.points) return;
        
        const cmd = new FunctionCommand(
            'Richtung umkehren',
            () => {
                contour.points = contour.points.slice().reverse();
                contour.invalidate?.();
                this.renderer?.render();
            },
            () => {
                contour.points = contour.points.slice().reverse();
                contour.invalidate?.();
                this.renderer?.render();
            }
        );
        this.undoManager.execute(cmd);
        
        this.showToast('↻ Richtung umgekehrt (STRG+Z = Rückgängig)', 'success');
    }
    
    /** Referenz-Status togglen (Canvas-Klick + Panel-Klick in Step 2) */
    toggleReference(contour) {
        if (!contour) return;
        const newVal = !contour.isReference;
        const cmd = new PropertyChangeCommand(contour, 'isReference', newVal, () => {
            if (contour.isReference) this.setOriginToReferenceUL();
            this.renderer?.render();
            this.updateContourPanel();
        });
        this.undoManager.execute(cmd);
        this.showToast(newVal ? '🟨 Referenz gesetzt (STRG+Z = Rückgängig)' : 'Referenz aufgehoben', 'success');
    }
    
    // ════════════════════════════════════════════════════════════════
    // KONTUR LÖSCHEN / DUPLIZIEREN (V2.8)
    // ════════════════════════════════════════════════════════════════
    
    deleteContour(contour) {
        const index = this.contours.indexOf(contour);
        if (index === -1) return;
        
        const name = contour.name || `Kontur ${index + 1}`;
        
        // Über UndoManager löschen (Undo-fähig)
        const deleteCmd = new DeleteContoursCommand(
            this.contours,
            [contour],
            () => {
                this.rebuildCutOrder();
                this.renderer?.setContours(this.contours);
                this.updateContourPanel();
                this.updateStats({ totalEntities: this.contours.length });
            }
        );
        this.undoManager.execute(deleteCmd);
        
        this.showToast(`🗑️ "${name}" gelöscht (STRG+Z = Rückgängig)`, 'success');
    }
    
    deleteSelectedContours() {
        const selected = this.contours.filter(c => c.isSelected);
        
        if (selected.length === 0) {
            this.showToast('Keine Konturen ausgewählt', 'warning');
            return;
        }
        
        // Über UndoManager löschen (Undo-fähig)
        const deleteCmd = new DeleteContoursCommand(
            this.contours,
            selected,
            () => {
                this.rebuildCutOrder();
                this.renderer?.setContours(this.contours);
                this.updateContourPanel();
            }
        );
        this.undoManager.execute(deleteCmd);
        
        this.showToast(`🗑️ ${selected.length} Konturen gelöscht (STRG+Z = Rückgängig)`, 'success');
    }
    
    duplicateContour(contour) {
        const index = this.contours.indexOf(contour);
        if (index === -1) return;
        
        // Deep copy
        let newContour;
        if (typeof CamContour !== 'undefined' && contour instanceof CamContour) {
            const points = contour.points.map(p => ({...p}));
            newContour = new CamContour(points, { isClosed: contour.isClosed });
            Object.assign(newContour, {
                ...contour,
                points: points,
                name: (contour.name || `Kontur ${index + 1}`) + ' (Kopie)',
                isSelected: false,
                microjoints: contour.microjoints ? [...contour.microjoints] : []
            });
        } else {
            newContour = {
                ...contour,
                points: contour.points.map(p => ({...p})),
                name: (contour.name || `Kontur ${index + 1}`) + ' (Kopie)',
                isSelected: false,
                microjoints: contour.microjoints ? [...contour.microjoints] : []
            };
        }
        
        // Über UndoManager einfügen (Undo-fähig)
        const addCmd = new AddContoursCommand(
            this.contours,
            [newContour],
            index + 1,
            () => {
                this.rebuildCutOrder();
                this.renderer?.setContours(this.contours);
                this.updateContourPanel();
            }
        );
        this.undoManager.execute(addCmd);
        
        this.showToast(`📋 "${newContour.name}" dupliziert (STRG+Z = Rückgängig)`, 'success');
    }
    
    // ════════════════════════════════════════════════════════════════
    // MICRO-JOINTS / STEGE (V2.8)
    // ════════════════════════════════════════════════════════════════
    
    bindMicrojointEvents() {
        document.getElementById('btn-add-microjoints')?.addEventListener('click', () => {
            this.addAutoMicrojoints();
        });
        
        document.getElementById('btn-clear-microjoints')?.addEventListener('click', () => {
            this.clearMicrojoints();
        });
    }
    
    addMicrojointAtPoint(contour, point) {
        if (!contour || !contour.points) return;
        
        const position = this.findPositionOnContour(contour, point);
        const width = parseFloat(document.getElementById('microjoint-width')?.value) || 0.5;
        const oldJoints = contour.microjoints ? [...contour.microjoints] : [];
        
        if (!contour.microjoints) contour.microjoints = [];
        contour.microjoints.push({ position, width });
        
        const newJoints = [...contour.microjoints];
        const cmd = new FunctionCommand(
            'Steg hinzufügen',
            () => { contour.microjoints = newJoints.map(j => ({...j})); this.renderer?.render(); this.updateContourPanel(); },
            () => { contour.microjoints = oldJoints.map(j => ({...j})); this.renderer?.render(); this.updateContourPanel(); }
        );
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();
        
        this.showToast(`✂️ Steg hinzugefügt (${position.toFixed(1)}mm, STRG+Z = Rückgängig)`, 'success');
        this.renderer?.render();
    }
    
    findPositionOnContour(contour, point) {
        const points = contour.points;
        let totalDist = 0;
        let nearestDist = Infinity;
        let nearestPosition = 0;
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            
            // Projektion des Punkts auf Segment
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (dx*dx + dy*dy || 1)));
            
            const projX = p1.x + t * dx;
            const projY = p1.y + t * dy;
            const dist = Math.hypot(point.x - projX, point.y - projY);
            
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestPosition = totalDist + t * segLen;
            }
            
            totalDist += segLen;
        }
        
        return nearestPosition;
    }
    
    addAutoMicrojoints() {
        const count = parseInt(document.getElementById('microjoint-count')?.value) || 2;
        const width = parseFloat(document.getElementById('microjoint-width')?.value) || 0.5;
        
        const selected = this.contours.filter(c => c.isSelected && c.isClosed && !c.isReference);
        const targets = selected.length > 0 ? selected : this.contours.filter(c => c.isClosed && !c.isReference);
        
        if (targets.length === 0) {
            this.showToast('Keine schneidbaren Konturen', 'warning');
            return;
        }
        
        // Snapshot VOR Änderung
        const snapshot = targets.map(c => ({ contour: c, old: c.microjoints ? c.microjoints.map(j => ({...j})) : [] }));
        
        let totalJoints = 0;
        targets.forEach(contour => {
            const perimeter = this.getContourPerimeter(contour);
            contour.microjoints = [];
            for (let i = 0; i < count; i++) {
                const position = (perimeter / count) * (i + 0.5);
                contour.microjoints.push({ position, width });
                totalJoints++;
            }
        });
        
        // Snapshot NACH Änderung
        const newState = targets.map(c => ({ contour: c, joints: c.microjoints.map(j => ({...j})) }));
        const app = this;
        const cmd = new FunctionCommand(
            `Auto-Stege (${totalJoints} auf ${targets.length} Konturen)`,
            () => { newState.forEach(s => { s.contour.microjoints = s.joints.map(j => ({...j})); }); app.renderer?.render(); app.updateContourPanel(); },
            () => { snapshot.forEach(s => { s.contour.microjoints = s.old.map(j => ({...j})); }); app.renderer?.render(); app.updateContourPanel(); }
        );
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();
        
        this.showToast(`✂️ ${totalJoints} Stege auf ${targets.length} Konturen (STRG+Z = Rückgängig)`, 'success');
        this.renderer?.render();
        this.updateContourPanel();
    }
    
    clearMicrojoints() {
        const selected = this.contours.filter(c => c.isSelected);
        const targets = selected.length > 0 ? selected : this.contours;
        
        // Nur Konturen mit Stegen sammeln
        const affected = targets.filter(c => c.microjoints && c.microjoints.length > 0);
        if (affected.length === 0) {
            this.showToast('Keine Stege vorhanden', 'info');
            return;
        }
        
        // Snapshot VOR Löschung
        const snapshot = affected.map(c => ({ contour: c, old: c.microjoints.map(j => ({...j})) }));
        let cleared = 0;
        affected.forEach(c => {
            cleared += c.microjoints.length;
            c.microjoints = [];
        });
        
        const app = this;
        const cmd = new FunctionCommand(
            `${cleared} Stege entfernen`,
            () => { snapshot.forEach(s => { s.contour.microjoints = []; }); app.renderer?.render(); app.updateContourPanel(); },
            () => { snapshot.forEach(s => { s.contour.microjoints = s.old.map(j => ({...j})); }); app.renderer?.render(); app.updateContourPanel(); }
        );
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();
        
        this.showToast(`${cleared} Stege entfernt (STRG+Z = Rückgängig)`, 'success');
        this.renderer?.render();
        this.updateContourPanel();
    }
    
    getContourPerimeter(contour) {
        if (!contour || !contour.points) return 0;
        let len = 0;
        for (let i = 1; i < contour.points.length; i++) {
            len += Math.hypot(
                contour.points[i].x - contour.points[i-1].x,
                contour.points[i].y - contour.points[i-1].y
            );
        }
        return len;
    }
    
    // ════════════════════════════════════════════════════════════════
    // STEP 5: REIHENFOLGE (V2.8)
    // ════════════════════════════════════════════════════════════════
    
    bindOrderEvents() {
        const sortBtn = document.getElementById('btn-auto-sort');
        console.log('[INIT] btn-auto-sort:', sortBtn ? 'gefunden' : 'NICHT GEFUNDEN');
        
        sortBtn?.addEventListener('click', () => {
            console.log('[SORT] Button geklickt, Methode:', document.getElementById('sort-method')?.value);
            this.autoSortContours();
        });
    }
    
    rebuildCutOrder() {
        // Alle nicht-Referenz, geschlossenen Konturen in cutOrder
        this.cutOrder = [];
        this.contours.forEach((c, i) => {
            if (!c.isReference && (c.isClosed || c.cuttingMode === 'slit')) {
                this.cutOrder.push(i);
            }
        });
        this.renderer?.render();
    }
    
    autoSortContours() {
        const method = document.getElementById('sort-method')?.value || 'inside-out';
        
        // Nur schneidbare Konturen
        const cuttable = this.contours
            .map((c, i) => ({ contour: c, index: i }))
            .filter(item => !item.contour.isReference && (item.contour.isClosed || item.contour.cuttingMode === 'slit'));
        
        if (cuttable.length === 0) {
            this.showToast('Keine schneidbaren Konturen', 'warning');
            return;
        }
        
        // Für "shortest-path-selected": Prüfe ob eine Kontur ausgewählt ist
        let startContour = null;
        if (method === 'shortest-path-selected') {
            const selected = cuttable.find(item => item.contour.isSelected);
            if (!selected) {
                this.showToast('⚠️ Bitte erst eine Startkontur auswählen', 'warning');
                return;
            }
            startContour = selected;
        }
        
        switch (method) {
            case 'inside-out':
                // Kleinste (Löcher) zuerst, dann größere (Scheiben)
                cuttable.sort((a, b) => {
                    const areaA = Math.abs(this.computeArea(a.contour.points));
                    const areaB = Math.abs(this.computeArea(b.contour.points));
                    return areaA - areaB;
                });
                break;
                
            case 'outside-in':
                // Größte zuerst
                cuttable.sort((a, b) => {
                    const areaA = Math.abs(this.computeArea(a.contour.points));
                    const areaB = Math.abs(this.computeArea(b.contour.points));
                    return areaB - areaA;
                });
                break;
                
            case 'shortest-path':
                // Greedy nearest-neighbor TSP (von hinten-rechts)
                this.sortByShortestPath(cuttable, null);
                break;
                
            case 'shortest-path-selected':
                // TSP ab ausgewählter Kontur
                this.sortByShortestPath(cuttable, startContour);
                break;
                
            case 'by-layer':
                cuttable.sort((a, b) => (a.contour.layer || '').localeCompare(b.contour.layer || ''));
                break;
                
            case 'by-size':
                cuttable.sort((a, b) => {
                    const areaA = Math.abs(this.computeArea(a.contour.points));
                    const areaB = Math.abs(this.computeArea(b.contour.points));
                    return areaA - areaB;
                });
                break;
        }
        
        const oldOrder = [...this.cutOrder];
        const newOrder = cuttable.map(item => item.index);
        this.cutOrder = newOrder;
        
        // Reversed-Indizes für Undo (Serpentinen-Umkehr rückgängig machen)
        const reversedIndices = [...(this._lastReversedContourIndices || [])];
        
        // Undo-Command für Sortierung + Richtungsumkehr
        const app = this;
        const cmd = new FunctionCommand(
            `Sortierung: ${method}`,
            () => {
                // Redo: Konturen erneut umkehren + neue Reihenfolge
                reversedIndices.forEach(idx => { if (app.contours[idx]?.points) app.contours[idx].points.reverse(); });
                app.cutOrder = [...newOrder];
                app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render();
            },
            () => {
                // Undo: Konturen zurück-umkehren + alte Reihenfolge
                reversedIndices.forEach(idx => { if (app.contours[idx]?.points) app.contours[idx].points.reverse(); });
                app.cutOrder = [...oldOrder];
                app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render();
            }
        );
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();
        
        console.log('[SORT] Neue Reihenfolge:', this.cutOrder);
        this.showToast(`🔄 Sortiert: ${method} (STRG+Z = Rückgängig)`, 'success');
        this.updateCutOrderList();
        this.updateOrderStats();
        this.renderer?.render();
    }
    
    sortByShortestPath(cuttable, startItem = null) {
        if (cuttable.length < 2) return;
        console.time('[SORT] sortByShortestPath');
        
        // Endpunkte vorab berechnen (Start + Ende jeder Kontur)
        const endpoints = new Map();
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const item of cuttable) {
            const pts = item.contour.points;
            const first = pts[0];
            const last = pts[pts.length - 1];
            endpoints.set(item, { first, last });
            // Für Startpunkt-Berechnung
            const cx = (first.x + last.x) / 2;
            const cy = (first.y + last.y) / 2;
            if (cx > maxX) maxX = cx;
            if (cy > maxY) maxY = cy;
        }
        
        const sorted = [];
        const remaining = [...cuttable];
        let currentPos;
        
        // Startpunkt bestimmen
        if (startItem) {
            const startIdx = remaining.findIndex(item => item === startItem);
            if (startIdx !== -1) {
                const first = remaining.splice(startIdx, 1)[0];
                sorted.push(first);
                const ep = endpoints.get(first);
                currentPos = ep.last; // Ende des ersten Schnitts
                console.log('[SORT] TSP ab Kontur:', first.contour.name || first.index);
            }
        } else {
            // Standard: Hinten-Rechts (maxX, maxY) für Spritzer-Vermeidung
            currentPos = { x: maxX + 10, y: maxY + 10 };
        }
        
        // Greedy nearest-neighbor mit Endpunkt-Awareness
        // Für jede Kontur: prüfe Distanz zu Start UND Ende
        // Wähle nächste Kontur + optimale Richtung
        // → Erzeugt automatisch Serpentinen/Boustrophedon bei Slits
        let reversals = 0;
        const reversedContourIndices = []; // Kontour-Indizes die umgekehrt wurden
        
        while (remaining.length > 0) {
            let bestIdx = 0;
            let bestDist = Infinity;
            let bestReverse = false;
            
            for (let i = 0; i < remaining.length; i++) {
                const ep = endpoints.get(remaining[i]);
                const isClosed = remaining[i].contour.isClosed;
                
                // Distanz zum Start der Kontur (normale Richtung)
                const dxS = ep.first.x - currentPos.x;
                const dyS = ep.first.y - currentPos.y;
                const distToStart = dxS * dxS + dyS * dyS; // Quadrat reicht für Vergleich
                
                if (distToStart < bestDist) {
                    bestDist = distToStart;
                    bestIdx = i;
                    bestReverse = false;
                }
                
                // Distanz zum Ende der Kontur (umgekehrte Richtung)
                // Nur für offene Konturen (Slits) — geschlossene sind richtungsunabhängig
                if (!isClosed) {
                    const dxE = ep.last.x - currentPos.x;
                    const dyE = ep.last.y - currentPos.y;
                    const distToEnd = dxE * dxE + dyE * dyE;
                    
                    if (distToEnd < bestDist) {
                        bestDist = distToEnd;
                        bestIdx = i;
                        bestReverse = true;
                    }
                }
            }
            
            const best = remaining.splice(bestIdx, 1)[0];
            
            // Kontur umkehren wenn das Ende näher war
            if (bestReverse && best.contour.points) {
                best.contour.points.reverse();
                // Endpunkte-Cache aktualisieren
                const ep = endpoints.get(best);
                const tmp = ep.first;
                ep.first = ep.last;
                ep.last = tmp;
                reversals++;
                reversedContourIndices.push(best.index);
            }
            
            sorted.push(best);
            const ep = endpoints.get(best);
            currentPos = ep.last; // Weiter vom Ende des Schnitts
        }
        
        // In-place sortieren
        cuttable.length = 0;
        cuttable.push(...sorted);
        
        // Reversed-Indizes für Undo verfügbar machen
        this._lastReversedContourIndices = reversedContourIndices;
        
        console.timeEnd('[SORT] sortByShortestPath');
        console.log(`[SORT] ${sorted.length} Konturen, ${reversals} Richtungsumkehrungen (Serpentine)`);
    }
    
    updateCutOrderList() {
        const listEl = document.getElementById('cut-order-list');
        if (!listEl) return;
        
        if (this.cutOrder.length === 0) {
            listEl.innerHTML = '<p class="empty-hint">Keine Konturen zum Schneiden</p>';
            return;
        }
        
        const html = this.cutOrder.map((contourIdx, orderIdx) => {
            const c = this.contours[contourIdx];
            if (!c) return '';
            
            const name = sanitizeHTML(c.name) || `Kontur ${contourIdx + 1}`;
            const mode = c.cuttingMode === 'hole' ? 'hole' : 'disc';
            const modeLabel = mode === 'hole' ? 'Loch' : 'Scheibe';
            
            const qColors = {
                1: '#22c55e', 2: '#3b82f6', 3: '#eab308', 4: '#f97316', 5: '#ef4444'
            };
            const color = qColors[c.quality || 2];
            
            return `
                <div class="cut-order-item" draggable="true" data-order="${orderIdx}" data-index="${contourIdx}">
                    <span class="cut-order-handle">≡</span>
                    <span class="cut-order-number">${orderIdx + 1}</span>
                    <span class="cut-order-color" style="background: ${color}"></span>
                    <span class="cut-order-name">${name}</span>
                    <span class="cut-order-badge ${mode}">${modeLabel}</span>
                    <div class="cut-order-buttons">
                        <button class="cut-order-btn" data-action="up" title="Nach oben">↑</button>
                        <button class="cut-order-btn" data-action="down" title="Nach unten">↓</button>
                    </div>
                </div>
            `;
        }).join('');
        
        listEl.innerHTML = html;
        
        // Drag & Drop Events
        this.initDragAndDrop(listEl);
        
        // Button Events
        listEl.querySelectorAll('.cut-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.cut-order-item');
                const orderIdx = parseInt(item.dataset.order, 10);
                const action = btn.dataset.action;
                
                const oldOrder = [...this.cutOrder];
                
                if (action === 'up' && orderIdx > 0) {
                    [this.cutOrder[orderIdx], this.cutOrder[orderIdx - 1]] = 
                    [this.cutOrder[orderIdx - 1], this.cutOrder[orderIdx]];
                } else if (action === 'down' && orderIdx < this.cutOrder.length - 1) {
                    [this.cutOrder[orderIdx], this.cutOrder[orderIdx + 1]] = 
                    [this.cutOrder[orderIdx + 1], this.cutOrder[orderIdx]];
                } else {
                    return; // Nichts geändert
                }
                
                const newOrder = [...this.cutOrder];
                const app = this;
                const cmd = new FunctionCommand(
                    `Reihenfolge: ${action}`,
                    () => { app.cutOrder = [...newOrder]; app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render(); },
                    () => { app.cutOrder = [...oldOrder]; app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render(); }
                );
                this.undoManager.undoStack.push(cmd);
                this.undoManager.redoStack.length = 0;
                this.undoManager._notifyStateChange();
                
                this.updateCutOrderList();
                this.updateOrderStats();
                this.renderer?.render();
            });
        });
        
        // Klick wählt Kontur aus
        listEl.querySelectorAll('.cut-order-item').forEach(item => {
            item.addEventListener('click', () => {
                const contourIdx = parseInt(item.dataset.index, 10);
                this.contours.forEach(c => { c.isSelected = false; });
                if (this.contours[contourIdx]) {
                    this.contours[contourIdx].isSelected = true;
                }
                this.renderer?.render();
                this.updateContourPanel();
            });
        });
    }
    
    initDragAndDrop(listEl) {
        let draggedItem = null;
        
        listEl.querySelectorAll('.cut-order-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                listEl.querySelectorAll('.cut-order-item').forEach(i => i.classList.remove('drag-over'));
                draggedItem = null;
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                if (item !== draggedItem) {
                    item.classList.add('drag-over');
                }
            });
            
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                
                if (!draggedItem || item === draggedItem) return;
                
                const fromIdx = parseInt(draggedItem.dataset.order, 10);
                const toIdx = parseInt(item.dataset.order, 10);
                
                const oldOrder = [...this.cutOrder];
                
                // Array umsortieren
                const [moved] = this.cutOrder.splice(fromIdx, 1);
                this.cutOrder.splice(toIdx, 0, moved);
                
                const newOrder = [...this.cutOrder];
                const app = this;
                const cmd = new FunctionCommand(
                    'Reihenfolge: Drag&Drop',
                    () => { app.cutOrder = [...newOrder]; app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render(); },
                    () => { app.cutOrder = [...oldOrder]; app.updateCutOrderList(); app.updateOrderStats(); app.renderer?.render(); }
                );
                this.undoManager.undoStack.push(cmd);
                this.undoManager.redoStack.length = 0;
                this.undoManager._notifyStateChange();
                
                this.updateCutOrderList();
                this.updateOrderStats();
                this.renderer?.render();
            });
        });
    }
    
    updateOrderStats() {
        let totalLength = 0;
        let travelLength = 0;
        let lastPos = this.settings.origin;
        
        this.cutOrder.forEach(idx => {
            const c = this.contours[idx];
            if (!c) return;
            
            // Schnittlänge
            totalLength += this.getContourPerimeter(c);
            
            // Verfahrweg zum Start
            if (c.points && c.points.length > 0) {
                const start = c.points[0];
                travelLength += Math.hypot(start.x - lastPos.x, start.y - lastPos.y);
                lastPos = c.points[c.points.length - 1] || start;
            }
        });
        
        document.getElementById('order-stat-count').textContent = this.cutOrder.length;
        document.getElementById('order-stat-length').textContent = `${totalLength.toFixed(1)} mm`;
        document.getElementById('order-stat-travel').textContent = `${travelLength.toFixed(1)} mm`;
    }
    
    // ════════════════════════════════════════════════════════════════
    // KONTUREN PANEL (Links)
    // ════════════════════════════════════════════════════════════════
    
    bindContourPanelEvents() {
        document.getElementById('btn-toggle-contours')?.addEventListener('click', () => {
            const panel = document.getElementById('contour-panel');
            panel.classList.toggle('collapsed');
        });
        
        document.getElementById('btn-select-all')?.addEventListener('click', () => {
            this.contours.forEach(c => { 
                if (!c.isReference) c.isSelected = true; 
            });
            this.renderer?.render();
            this.updateContourPanel();
        });
        
        document.getElementById('btn-select-none')?.addEventListener('click', () => {
            this.contours.forEach(c => { c.isSelected = false; });
            this.renderer?.render();
            this.updateContourPanel();
        });
    }
    
    updateContourPanel() {
        const listEl = document.getElementById('contour-list-panel');
        if (!listEl) return;
        
        if (!this.contours || this.contours.length === 0) {
            listEl.innerHTML = '<p class="empty-hint">Keine Datei geladen</p>';
            document.getElementById('panel-stat-total').textContent = '0';
            document.getElementById('panel-stat-selected').textContent = '0';
            return;
        }
        
        const html = this.contours.map((c, i) => {
            const isRef = c.isReference;
            const isOpen = !c.isClosed;
            const quality = c.quality || this.settings.quality || 2;
            const hasMicrojoints = c.microjoints && c.microjoints.length > 0;
            
            const qColors = {
                1: '#22c55e', 2: '#3b82f6', 3: '#eab308', 4: '#f97316', 5: '#ef4444'
            };
            
            let color = qColors[quality];
            if (isRef) color = '#555555';
            if (isOpen && c.cuttingMode === 'slit') color = '#FFaa00';
            else if (isOpen) color = '#888888';
            
            let badge = '', badgeClass = '';
            if (isRef) { badge = 'Ref'; badgeClass = 'ref'; }
            else if (isOpen && c.cuttingMode === 'slit') { badge = 'Slit'; badgeClass = 'slit'; }
            else if (isOpen) { badge = 'Open'; badgeClass = ''; }
            else { badge = c.cuttingMode === 'hole' ? 'Loch' : 'Disc'; badgeClass = c.cuttingMode === 'hole' ? 'hole' : 'disc'; }
            
            const microjointBadge = hasMicrojoints ? `<span class="microjoint-badge">${c.microjoints.length}⚡</span>` : '';
            
            return `
                <div class="contour-item-panel ${c.isSelected ? 'selected' : ''} ${isRef ? 'reference' : ''} ${hasMicrojoints ? 'has-microjoints' : ''}" 
                     data-index="${i}">
                    <div class="color-dot" style="background: ${color}"></div>
                    <span class="name">${sanitizeHTML(c.name) || 'K' + (i+1)}</span>
                    <span class="badge ${badgeClass}">${badge}</span>
                    ${microjointBadge}
                    <span class="delete-btn" data-index="${i}" title="Löschen">✕</span>
                </div>
            `;
        }).join('');
        
        listEl.innerHTML = html;
        
        // Stats
        document.getElementById('panel-stat-total').textContent = this.contours.length;
        document.getElementById('panel-stat-selected').textContent = this.contours.filter(c => c.isSelected).length;
        
        // Click Events
        listEl.querySelectorAll('.contour-item-panel').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    const index = parseInt(e.target.dataset.index, 10);
                    this.deleteContour(this.contours[index]);
                    return;
                }
                
                const index = parseInt(item.dataset.index, 10);
                const contour = this.contours[index];
                
                if (e.shiftKey) {
                    contour.isSelected = !contour.isSelected;
                } else if (this.currentStep === 2) {
                    this.toggleReference(contour);
                    return; // toggleReference macht eigenes Render + Panel-Update
                } else {
                    this.contours.forEach(c => { c.isSelected = false; });
                    contour.isSelected = true;
                }
                
                this.renderer?.render();
                this.updateContourPanel();
            });
        });
    }
    
    // ════════════════════════════════════════════════════════════════
    // MESSWERKZEUG
    // ════════════════════════════════════════════════════════════════
    
    bindMeasureEvents() {
        document.getElementById('btn-measure')?.addEventListener('click', () => {
            this.toggleMeasureMode();
        });
    }
    
    toggleMeasureMode() {
        this.measureMode = !this.measureMode;
        this.measureStart = null;
        
        // Andere Modi beenden
        if (this.measureMode && this.startpointMode) {
            this.toggleStartpointMode();
        }
        
        const btn = document.getElementById('btn-measure');
        const indicator = document.getElementById('measure-indicator');
        const measureInfo = document.getElementById('measure-info');
        
        if (this.measureMode) {
            btn?.classList.add('active');
            document.getElementById('ct-measure')?.classList.add('active');
            if (indicator) indicator.style.display = 'inline';
            this.renderer.canvas.style.cursor = 'crosshair';
            this.showToast('📏 Messmodus - Klick für Start, ESC zum Beenden', 'success');
        } else {
            btn?.classList.remove('active');
            document.getElementById('ct-measure')?.classList.remove('active');
            if (indicator) indicator.style.display = 'none';
            if (measureInfo) measureInfo.style.display = 'none';
            // Im Zeichenmodus: Cursor zurück auf crosshair
            this.renderer.canvas.style.cursor = this.toolManager?.isToolActive() ? 'crosshair' : 'default';
            this.measurements = [];
        }
        
        this.renderer.render();
    }
    
    handleMeasureClick(worldPoint) {
        const point = this.currentSnapPoint || worldPoint;
        
        if (!this.measureStart) {
            this.measureStart = { x: point.x, y: point.y };
            document.getElementById('measure-info').style.display = 'flex';
        } else {
            const p1 = this.measureStart;
            const p2 = { x: point.x, y: point.y };
            
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            this.measurements.push({ p1, p2, distance, dx, dy, angle });
            this.measureStart = null;
            
            this.showToast(`📏 ${distance.toFixed(2)} mm`, 'success');
            document.getElementById('measure-info').style.display = 'none';
        }
        
        this.renderer.render();
    }
    
    updateMeasureInfo(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        document.getElementById('measure-distance').textContent = `L: ${distance.toFixed(2)} mm`;
        document.getElementById('measure-angle').textContent = `∠ ${angle.toFixed(1)}°`;
    }
    
    // ════════════════════════════════════════════════════════════════
    // KEYBOARD
    // ════════════════════════════════════════════════════════════════
    
    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            // V3.5: Command-Line Input hat eigene Handler — nur ESC/F-Tasten durchlassen
            const isCmdInput = e.target.id === 'cmd-input';
            if (!isCmdInput && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            if (isCmdInput && e.key !== 'Escape' && e.key !== 'F2' && e.key !== 'F3' && e.key !== 'F8') return;
            
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            
            // V3.5: Auto-Focus — Tastatureingabe landet automatisch in cmd-input
            // Gilt IMMER (nicht nur im Draw-Mode), außer bei Spezial-Tasten
            if (!isCmdInput && !ctrl && !e.altKey && e.key.length === 1 && e.key !== ' ') {
                const cmdInput = document.getElementById('cmd-input');
                const cmdHasText = cmdInput && cmdInput.value.length > 0;
                
                // V3.9: Wenn cmd-input bereits Text hat → IMMER dorthin routen
                // (ermöglicht Multi-Char-Befehle: TX, EL, SP, DO, CL2D, DTEXT, etc.)
                if (cmdHasText) {
                    cmdInput.focus();
                    return;
                }
                
                // V4.1: ALLE Zeichen an cmd-input routen (AutoCAD-Stil)
                // Kein sofortiges Auslösen — Befehl wird erst bei Enter/Space ausgeführt
                // Damit funktionieren Multi-Char-Befehle: LE, EX, CH, AR, BO, ZF etc.
                if (cmdInput) {
                    e.preventDefault();
                    cmdInput.focus();
                    cmdInput.value += e.key;
                    cmdInput.dispatchEvent(new Event('input'));
                    return;
                }
            }
            
            switch (e.key) {
                // V4.1: Enter/Space → cmd-input absenden oder Tool beenden
                case 'Enter':
                case ' ': {
                    const cmdInput2 = document.getElementById('cmd-input');
                    const cmdVal = cmdInput2?.value?.trim() || '';
                    const onCmdInput = e.target.id === 'cmd-input';
                    
                    if (!onCmdInput && cmdVal !== '') {
                        // Text in cmd-input aber Fokus woanders → absenden
                        e.preventDefault();
                        // Simuliere Enter auf cmd-input
                        cmdInput2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: false }));
                    } else if (!onCmdInput && cmdVal === '' && this.toolManager?.isToolActive()) {
                        // Leerer cmd-input + Tool aktiv → Tool beenden/bestätigen
                        e.preventDefault();
                        this.toolManager._handleEnter();
                    }
                    break;
                }
                    
                // V3.5: F2 = Zeichenmodus Toggle (Backward-Kompatibilität, fokussiert cmd-input)
                case 'F2':
                    e.preventDefault();
                    this.toggleDrawMode();
                    break;
                    
                // V3.5: F3 = Messmodus (vorher M)
                case 'F3':
                    e.preventDefault();
                    this.toggleMeasureMode();
                    break;
                    
                // V3.5: Ortho-Modus Toggle
                case 'F8':
                    e.preventDefault();
                    if (this.snapManager) {
                        const ortho = this.snapManager.toggleOrtho();
                        document.getElementById('btn-ortho-toggle')?.classList.toggle('active', ortho);
                        this.showToast(ortho ? '⊞ Ortho EIN' : '⊞ Ortho AUS', 'info');
                    }
                    break;
                    
                case 'Escape':
                    // V3.5: Tool abbrechen → Messmodus beenden → Selektion aufheben
                    if (this.toolManager?.isToolActive()) {
                        this.toolManager.cancelTool();
                        break;
                    }
                    if (this.measureMode) {
                        this.toggleMeasureMode();
                        break;
                    }
                    if (this.startpointMode) {
                        this.toggleStartpointMode();
                        break;
                    }
                    // Selektion aufheben
                    this.contours.forEach(c => { c.isSelected = false; });
                    this.renderer?.render();
                    this.updateContourPanel();
                    this.hideContextMenu();
                    break;
                    
                case 'Delete':
                    if (!ctrl) {
                        // V3.5: DEL = Erase Tool (mit Undo)
                        const selected = this.contours.filter(c => c.isSelected && !c.isReference);
                        if (selected.length > 0) {
                            e.preventDefault();
                            this.toolManager?.startTool('ERASE');
                        }
                    }
                    break;
                    
                // V4.0: F = Fillet (nicht mehr FitToContent)
                // FitToContent jetzt via Home-Taste oder Doppelklick Mausrad
                case 'Home':
                    if (!ctrl) { e.preventDefault(); this.renderer?.fitToContent(); }
                    break;
                    
                case '+':
                case '=':
                    this.renderer?.zoomIn();
                    break;
                    
                case '-':
                    this.renderer?.zoomOut();
                    break;
                    
                case 'a':
                case 'A':
                    if (ctrl) {
                        e.preventDefault();
                        this.contours.forEach(c => { if (!c.isReference) c.isSelected = true; });
                        this.renderer?.render();
                        this.updateContourPanel();
                    }
                    break;
                    
                // ── Undo/Redo/Clipboard (V1.0) ──
                case 'z':
                case 'Z':
                    if (ctrl) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            if (this.undoManager.redo()) this._refreshAfterUndoRedo();
                        } else {
                            if (this.undoManager.undo()) this._refreshAfterUndoRedo();
                        }
                    }
                    break;
                    
                case 'y':
                case 'Y':
                    if (ctrl) {
                        e.preventDefault();
                        if (this.undoManager.redo()) this._refreshAfterUndoRedo();
                    }
                    break;
                    
                case 'c':
                case 'C':
                    if (ctrl) {
                        e.preventDefault();
                        this.clipboardManager.copy(); // STRG+C = Copy
                    }
                    break;
                    
                case 'x':
                case 'X':
                    if (ctrl) {
                        e.preventDefault();
                        this.clipboardManager.cut(); // STRG+X = Cut
                    }
                    break;
                    
                case 'v':
                case 'V':
                    if (ctrl) {
                        e.preventDefault();
                        this.clipboardManager.paste(); // STRG+V = Paste
                    }
                    break;
                
                // V3.8: DXF Speichern
                case 's':
                case 'S':
                    if (ctrl) {
                        e.preventDefault();
                        if (shift) {
                            this.saveDXFAs();  // STRG+SHIFT+S = Speichern unter
                        } else {
                            this.saveDXF();    // STRG+S = Speichern
                        }
                    }
                    break;
            }
        });
    }
    
    /** UI nach Undo/Redo aktualisieren */
    _refreshAfterUndoRedo() {
        this.renderer?.render();
        this.updateContourPanel();
        this.updateCutOrderList?.();
        this.updateOrderStats?.();
    }
    
    bindCanvasEvents() {
        // ── Ribbon Ansicht-Buttons ──
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.renderer?.zoomIn());
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.renderer?.zoomOut());
        document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.renderer?.fitToContent());
        document.getElementById('btn-toggle-grid')?.addEventListener('click', () => this._toggleGrid());

        // ── V3.11: Floating Canvas Toolbar ──
        document.getElementById('ct-zoom-in')?.addEventListener('click', () => this.renderer?.zoomIn());
        document.getElementById('ct-zoom-out')?.addEventListener('click', () => this.renderer?.zoomOut());
        document.getElementById('ct-fit')?.addEventListener('click', () => this.renderer?.fitToContent());
        document.getElementById('ct-grid')?.addEventListener('click', () => this._toggleGrid());
        document.getElementById('ct-measure')?.addEventListener('click', () => this.toggleMeasureMode());
        document.getElementById('ct-delete')?.addEventListener('click', () => {
            if (this.toolManager) this.toolManager.startTool('E');
        });

        // Grid-Button Initialzustand
        if (this.renderer) {
            const active = this.renderer.gridEnabled;
            document.getElementById('ct-grid')?.classList.toggle('active', active);
        }

        // ── V3.11: Linie-Flyout (Linie / Polylinie / XLine) ──
        this._initLineFlyout();
    }

    /** Toggle grid on/off – sync Ribbon + Floating Toolbar */
    _toggleGrid() {
        if (!this.renderer) return;
        this.renderer.gridEnabled = !this.renderer.gridEnabled;
        const active = this.renderer.gridEnabled;
        document.getElementById('ct-grid')?.classList.toggle('active', active);
        this.renderer.render();
    }

    /** Linie-Flyout: Rechtsklick auf Linie-Button → Untermenü */
    _initLineFlyout() {
        const lineBtn = document.querySelector('.ribbon-btn-lg[data-tool="L"]');
        const lineFlyout = document.getElementById('line-flyout');
        if (!lineBtn || !lineFlyout) return;

        // Rechtsklick öffnet Flyout
        lineBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = lineBtn.getBoundingClientRect();
            lineFlyout.style.left = (rect.right + 2) + 'px';
            lineFlyout.style.top = rect.top + 'px';
            lineFlyout.style.display = 'block';
        });

        // Klick auf ▾-Label öffnet auch Flyout
        const label = lineBtn.querySelector('.label');
        if (label) {
            label.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = lineBtn.getBoundingClientRect();
                lineFlyout.style.left = (rect.right + 2) + 'px';
                lineFlyout.style.top = rect.top + 'px';
                lineFlyout.style.display = lineFlyout.style.display === 'block' ? 'none' : 'block';
            });
        }

        // Flyout-Items
        lineFlyout.querySelectorAll('.flyout-item').forEach(item => {
            item.addEventListener('click', () => {
                const mode = item.dataset.lineMode;
                lineFlyout.style.display = 'none';
                if (this.toolManager && mode) this.toolManager.startTool(mode);
            });
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.1)');
            item.addEventListener('mouseleave', () => item.style.background = '');
        });

        // Klick außerhalb schließt Flyout
        document.addEventListener('click', (e) => {
            if (!lineFlyout.contains(e.target) && !lineBtn.contains(e.target)) {
                lineFlyout.style.display = 'none';
            }
        });
    }
    
    // ════════════════════════════════════════════════════════════════
    // NAVIGATION
    // ════════════════════════════════════════════════════════════════
    
    bindNavigationEvents() {
        document.querySelectorAll('.step-item').forEach(item => {
            item.addEventListener('click', () => {
                const step = parseInt(item.dataset.step, 10);
                if (this.canGoToStep(step)) {
                    this.goToStep(step);
                }
            });
        });
        
        document.getElementById('btn-prev').addEventListener('click', () => this.prevStep());
        document.getElementById('btn-next').addEventListener('click', () => this.nextStep());
    }
    
    canGoToStep(step) {
        if (step < this.currentStep) return true;
        if (step === 1) return true;
        if (step > 1 && !this.fileLoaded) return false;
        return step <= this.currentStep + 1;
    }
    
    goToStep(step) {
        if (step < 1 || step > this.totalSteps) return;
        this.currentStep = step;
        this.updateStepUI();
        this.onStepEnter(step);
    }
    
    nextStep() {
        if (this.currentStep === 1 && !this.fileLoaded) {
            this.showToast('Bitte laden Sie zuerst eine DXF-Datei', 'warning');
            return;
        }
        if (this.currentStep < this.totalSteps) {
            this.goToStep(this.currentStep + 1);
        }
    }
    
    prevStep() {
        if (this.currentStep > 1) {
            this.goToStep(this.currentStep - 1);
        }
    }
    
    updateStepUI() {
        document.querySelectorAll('.step-item').forEach((item, i) => {
            const step = i + 1;
            item.classList.remove('active', 'completed', 'locked');
            
            if (step < this.currentStep) {
                item.classList.add('completed');
            } else if (step === this.currentStep) {
                item.classList.add('active');
            } else if (!this.canGoToStep(step)) {
                item.classList.add('locked');
            }
        });
        
        document.querySelectorAll('.step-connector').forEach((conn, i) => {
            conn.classList.toggle('completed', i < this.currentStep - 1);
        });
        
        document.querySelectorAll('.step-content').forEach(content => {
            const step = parseInt(content.dataset.step, 10);
            content.classList.toggle('active', step === this.currentStep);
        });
        
        document.getElementById('btn-prev').disabled = this.currentStep === 1;
        document.getElementById('btn-next').textContent = this.currentStep === this.totalSteps ? '✓ Fertig' : 'Weiter →';
        
        const dropZone = document.getElementById('drop-zone');
        if (this.fileLoaded) {
            dropZone.classList.remove('empty-state', 'visible');
        } else if (this.currentStep === 1) {
            dropZone.classList.add('empty-state');
        }
    }
    
    onStepEnter(step) {
        // Modi beenden
        if (this.measureMode) this.toggleMeasureMode();
        if (this.startpointMode) this.toggleStartpointMode();
        
        switch (step) {
            case 1:
                if (this.renderer) this.renderer.currentMode = null;
                break;
            case 2:
                if (this.renderer) this.renderer.currentMode = 'referenz';
                this.updateContourPanel();
                const hasRef = this.contours.some(c => c.isReference);
                if (!hasRef && this.contours.length > 0) {
                    this.autoDetectReference();
                }
                break;
            case 3:
                if (this.renderer) this.renderer.currentMode = 'nullpunkt';
                this.updateOriginDisplay();
                this.updateContourPanel();
                break;
            case 4:
                if (this.renderer) this.renderer.currentMode = 'anschuss';
                this.updateContourPanel();
                break;
            case 5:
                if (this.renderer) this.renderer.currentMode = 'reihenfolge';
                this.rebuildCutOrder();
                this.updateCutOrderList();
                this.updateOrderStats();
                this.updateContourPanel();
                break;
            case 6:
                if (this.renderer) this.renderer.currentMode = null;
                this.updateExportSummary();
                break;
        }
        
        this.renderer?.render();
    }
    
    // ════════════════════════════════════════════════════════════════
    // FILE HANDLING
    // ════════════════════════════════════════════════════════════════
    
    bindFileEvents() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const dropZone = document.getElementById('drop-zone');
        const canvasArea = document.getElementById('canvas-area');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) this.loadFile(e.target.files[0]);
        });
        
        canvasArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('visible');
            dropZone.classList.remove('empty-state');
        });
        
        canvasArea.addEventListener('dragleave', (e) => {
            if (!canvasArea.contains(e.relatedTarget)) {
                if (!this.fileLoaded) dropZone.classList.add('empty-state');
                dropZone.classList.remove('visible');
            }
        });
        
        canvasArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('visible');
            if (e.dataTransfer?.files[0]) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });
        
        document.getElementById('btn-apply-layers')?.addEventListener('click', () => {
            this.applyLayerSelection();
        });
    }
    
    loadFile(file) {
        if (!file.name.toLowerCase().endsWith('.dxf')) {
            this.showToast('Bitte eine DXF-Datei auswählen', 'error');
            return;
        }
        
        this.dxfFileName = file.name;
        this.loadedFileName = file.name;  // V3.8: Für DXF-Speichern
        this.outputFileName = file.name.replace(/\.dxf$/i, '.cnc');
        
        const reader = new FileReader();
        
        reader.onerror = () => {
            this.showToast('Datei konnte nicht gelesen werden', 'error');
        };
        
        reader.onload = (e) => {
            console.timeEnd('[PERF] FileReader.readAsText');
            this.dxfContent = e.target.result;
            console.log('[PERF] DXF content size:', (this.dxfContent.length / 1024).toFixed(1), 'KB');
            this.parseDXF();
            
            const fileStatusEl = document.getElementById('file-status');
            if (fileStatusEl) fileStatusEl.innerHTML = `
                <div class="file-loaded">
                    <span class="icon">📄</span>
                    <span class="name">${sanitizeHTML(file.name)}</span>
                    <span class="size">${(file.size / 1024).toFixed(1)} KB</span>
                </div>
            `;
            
            document.getElementById('current-filename').textContent = `📄 ${file.name}`;
            const planInput = document.getElementById('planname-input');
            if (planInput) planInput.value = file.name.replace(/\.dxf$/i, '').toUpperCase();
            
            this.showToast(`${file.name} geladen`, 'success');
        };
        
        console.time('[PERF] FileReader.readAsText');
        reader.readAsText(file, 'ISO-8859-1');
    }
    
    parseDXF() {
        if (!this.dxfContent || typeof DXFParser === 'undefined') {
            this.showToast('DXF-Parser nicht verfügbar', 'error');
            return;
        }
        
        let layers = [];
        
        // Quick-Fix #4: Spinner anzeigen
        this.showParserSpinner(true, 'Parsing DXF-Datei...');
        
        // Async-Wrapper für Spinner
        setTimeout(() => {
            try {
                const tolerance = parseFloat(document.getElementById('chaining-tolerance').value) || 0.1;
                
                console.time('[PERF] DXFParser.parse');
                this.dxfResult = DXFParser.parse(this.dxfContent, {
                    chainingTolerance: tolerance
                });
                console.timeEnd('[PERF] DXFParser.parse');
                
                if (!this.dxfResult || !this.dxfResult.success) {
                    this.showToast('DXF Parse-Fehler', 'error');
                    this.showParserSpinner(false);
                    return;
                }
                
                // Quick-Fix #1: Ignorierte Entities anzeigen
                if (this.dxfResult.ignoredCount > 0) {
                    const types = this.dxfResult.ignoredTypes?.join(', ') || 'Unbekannt';
                    this.showToast(
                        `⚠️ ${this.dxfResult.ignoredCount} Element(e) ignoriert: ${types}`,
                        'warning'
                    );
                    console.warn('[WARICAM] Ignorierte Entity-Typen:', types);
                }
                
                // Quick-Fix #2: Größen-Warnung
                if (this.dxfResult.entities && this.dxfResult.entities.length > 5000) {
                    this.showToast(
                        `⚠️ Große Datei (${this.dxfResult.entities.length} Elemente)`,
                        'warning'
                    );
                }
                
                // Parser-Warnungen anzeigen
                if (this.dxfResult.warnings && this.dxfResult.warnings.length > 0) {
                    this.dxfResult.warnings.forEach(w => {
                        if (w.type === 'OPEN_CONTOURS') {
                            this.showToast(`⚠️ ${w.message}`, 'warning');
                        }
                    });
                }
                
                layers = Array.from(this.dxfResult.layers || []);
                this.selectedLayers = [...layers];
                
                // V3.8: Layer in LayerManager importieren (mit ACI-Farben aus TABLES)
                const layerColors = this.dxfResult.layerDefs?.colors || {};
                this.layerManager.importFromDXF(layers, layerColors);
                this.layerManager.updateEntityCounts(this.dxfResult.contours || []);
                
            } catch (error) {
                console.error('[WARICAM] Parse error:', error);
                this.showToast(`Parse-Fehler: ${error.message}`, 'error');
                this.showParserSpinner(false);
                return;
            }
            
            // Spinner ausblenden
            this.showParserSpinner(false);
            
            if (!layers || layers.length === 0) {
                layers = [''];
            }
            
            const layerList = document.getElementById('layer-list');
            if (layerList) layerList.innerHTML = layers.map(layer => {
                const safeName = sanitizeHTML(layer);
                return `
                    <div class="layer-item">
                        <input type="checkbox" id="layer-${safeName}" value="${safeName}" checked>
                        <label for="layer-${safeName}">${safeName || '(Default)'}</label>
                    </div>
                `;
            }).join('');
            
            // V3.8: Layer werden jetzt über LayerManager gesteuert
            // document.getElementById('btn-apply-layers').style.display = 'block';
            this.fileLoaded = true;
            this.applyLayerSelection();
        }, 50); // Kleine Verzögerung damit Spinner erscheint
    }
    
    applyLayerSelection() {
        const checkboxes = document.querySelectorAll('#layer-list input[type="checkbox"]');
        const allContours = this.dxfResult.contours || [];
        
        if (checkboxes.length === 0) {
            // Kein layer-list vorhanden → alle Layer durchlassen
            this.selectedLayers = [...new Set(allContours.map(c => c.layer || ''))];
        } else {
            this.selectedLayers = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
        }
        
        const filteredContours = allContours.filter(c => 
            this.selectedLayers.includes(c.layer || '')
        );
        
        this.runPipeline(filteredContours);
    }
    
    runPipeline(contours) {
        console.time('[PERF] runPipeline total');
        // Undo-Historie leeren bei neuem Import
        this.undoManager?.clear();
        this.clipboardManager?.clear();
        
        if (typeof WaricamPipeline === 'undefined') {
            this.contours = contours;
            this.updateRenderer();
            return;
        }
        
        // V3.0: Arc-Fitting Einstellungen aus UI lesen
        const enableArcFitting = document.getElementById('enable-arc-fitting')?.checked || false;
        const arcFittingTolerance = parseFloat(document.getElementById('arc-fitting-tolerance')?.value) || 0.01;

        console.time('[PERF] Pipeline.autoProcess');
        const result = WaricamPipeline.autoProcess(contours, {
            kerfWidth: this.settings.kerfWidth,
            quality: this.settings.quality,
            enableArcFitting: enableArcFitting,
            arcFittingTolerance: arcFittingTolerance,
            skipReference: true  // V3.8: Referenz manuell per Layer, nicht automatisch
        });
        console.timeEnd('[PERF] Pipeline.autoProcess');
        
        if (result.success) {
            this.contours = result.contours;
            console.time('[PERF] updateRenderer');
            this.updateStats(result);
            this.updateRenderer();
            console.timeEnd('[PERF] updateRenderer');
            console.time('[PERF] updateContourPanel+rebuild');
            this.updateContourPanel();
            this.rebuildCutOrder();
            this.updateStepUI();
            console.timeEnd('[PERF] updateContourPanel+rebuild');
            
            // V3.1: Import-Zustand als Restore-Punkt merken (NICHT im Undo-Stack!)
            // Undo-Stack startet leer – erst echte Benutzeraktionen werden registriert
            this._importSnapshot = this.contours.map(c => 
                typeof c.clone === 'function' ? c.clone() : { ...c, points: c.points?.map(p => ({...p})) || [] }
            );
            console.log(`[UndoManager V1.0] Import-Snapshot gespeichert (${this._importSnapshot.length} Konturen, Stack bleibt leer)`);

            // V3.0: Feedback für MicroHealing
            const healStats = result.healingStats;
            if (healStats && (healStats.overlapsFixed > 0 || healStats.duplicatesRemoved > 0)) {
                this.showToast(
                    `🔧 Repariert: ${healStats.overlapsFixed || 0} Überlappungen, ${healStats.duplicatesRemoved || 0} Duplikate`,
                    'info'
                );
            }

            // V3.1: Feedback für CamPreProcessor
            const preStats = result.preProcessStats;
            if (preStats && (preStats.spikeCount > 0 || preStats.removedContours > 0 || preStats.pointsBefore > preStats.pointsAfter)) {
                const reduction = preStats.pointsBefore > 0
                    ? Math.round((1 - preStats.pointsAfter / preStats.pointsBefore) * 100) : 0;
                this.showToast(
                    `🔬 Vorverarbeitung: ${preStats.pointsBefore}→${preStats.pointsAfter} Punkte (−${reduction}%), ${preStats.removedContours} Konturen entfernt`,
                    'info'
                );
            }

            // V3.0: Feedback für Arc-Fitting
            const arcStats = WaricamPipeline.arcFittingStats;
            if (arcStats && arcStats.totalArcs > 0) {
                const ratio = (result.contours.length > 0) ?
                    ((arcStats.totalArcs + arcStats.totalLines) / result.contours.length).toFixed(1) : '1';
                this.showToast(
                    `⭕ Arc-Fitting: ${arcStats.totalArcs} Bögen, ${arcStats.totalLines} Linien`,
                    'success'
                );
            }

            console.timeEnd('[PERF] runPipeline total');
            setTimeout(() => this.goToStep(2), 300);
        } else if (contours.length === 0) {
            // Leere DXF-Datei — kein Fehler, nur Info
            this.contours = [];
            this.updateRenderer();
            this.updateContourPanel();
            this.showToast('Datei enthält keine Konturen', 'info');
        } else {
            this.showToast('Pipeline-Fehler: ' + (result.error || 'unbekannt'), 'error');
        }
    }
    
    updateRenderer() {
        if (!this.renderer) return;
        this.renderer.setContours(this.contours);
        this.renderer.fitToContent();
        document.getElementById('drop-zone').classList.remove('empty-state', 'visible');
    }
    
    updateStats(result) {
        document.getElementById('stat-contours').textContent = result?.totalEntities || this.contours.length;
        document.getElementById('stat-outer').textContent = result?.outerContours || 0;
        document.getElementById('stat-inner').textContent = result?.innerContours || 0;
    }
    
    // ════════════════════════════════════════════════════════════════
    // ORIGIN
    // ════════════════════════════════════════════════════════════════
    
    bindOriginEvents() {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.setOriginPreset(btn.dataset.pos);
            });
        });
        
        document.getElementById('origin-x')?.addEventListener('change', () => this.updateOriginFromInputs());
        document.getElementById('origin-y')?.addEventListener('change', () => this.updateOriginFromInputs());
        
        document.getElementById('btn-set-origin-from-snap')?.addEventListener('click', () => {
            // V5.0: Nullpunkt-Modus togglen (wie ct-origin in Canvas-Toolbar)
            if (this.currentStep === 3) {
                this.currentStep = 0;
                document.getElementById('btn-set-origin-from-snap')?.classList.remove('active');
                document.getElementById('ct-origin')?.classList.remove('active');
                this.showToast('Nullpunkt-Modus beendet', 'info');
            } else {
                this.currentStep = 3;
                document.getElementById('btn-set-origin-from-snap')?.classList.add('active');
                document.getElementById('ct-origin')?.classList.add('active');
                this.showToast('Klicke auf Canvas für neuen Nullpunkt (Snap aktiv)', 'info');
            }
        });
    }
    
    setOriginFromPoint(point) {
        this.settings.origin = { x: point.x, y: point.y };
        this.updateOriginDisplay();
        
        if (this.renderer?.setNullPoint) {
            this.renderer.setNullPoint(point.x, point.y);
            this.renderer.render();
        }
        
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    }
    
    setOriginPreset(preset) {
        this.settings.originPreset = preset;
        
        const b = this.getReferenceBounds();
        if (!b) {
            this.showToast('Keine Konturen vorhanden', 'warning');
            return;
        }
        
        let x = 0, y = 0;
        
        switch (preset) {
            case 'top-left':     x = b.minX; y = b.maxY; break;
            case 'top-center':   x = (b.minX + b.maxX) / 2; y = b.maxY; break;
            case 'top-right':    x = b.maxX; y = b.maxY; break;
            case 'center-left':  x = b.minX; y = (b.minY + b.maxY) / 2; break;
            case 'center':       x = (b.minX + b.maxX) / 2; y = (b.minY + b.maxY) / 2; break;
            case 'center-right': x = b.maxX; y = (b.minY + b.maxY) / 2; break;
            case 'bottom-left':  x = b.minX; y = b.minY; break;
            case 'bottom-center': x = (b.minX + b.maxX) / 2; y = b.minY; break;
            case 'bottom-right': x = b.maxX; y = b.minY; break;
        }
        
        this.settings.origin = { x, y };
        this.updateOriginDisplay();
        
        if (this.renderer?.setNullPoint) {
            this.renderer.setNullPoint(x, y);
            this.renderer.render();
        }
        
        this.showToast(`Nullpunkt: ${preset}`, 'success');
    }
    
    getReferenceBounds() {
        let sources = this.contours.filter(c => c.isReference);
        // V5.0: Fallback auf ALLE Konturen wenn keine Referenz vorhanden
        if (sources.length === 0) {
            sources = this.contours.filter(c => c.points && c.points.length > 0);
        }
        if (sources.length === 0) return null;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        sources.forEach(c => {
            const points = c.points;
            if (!points) return;
            for (const p of points) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
        });
        
        return { minX, minY, maxX, maxY };
    }
    
    updateOriginFromInputs() {
        const x = parseFloat(document.getElementById('origin-x')?.value) || 0;
        const y = parseFloat(document.getElementById('origin-y')?.value) || 0;
        
        this.settings.origin = { x, y };
        
        if (this.renderer?.setNullPoint) {
            this.renderer.setNullPoint(x, y);
            this.renderer.render();
        }
    }
    
    updateOriginDisplay() {
        const oxEl = document.getElementById('origin-x');
        const oyEl = document.getElementById('origin-y');
        if (oxEl) oxEl.value = this.settings.origin.x.toFixed(3);
        if (oyEl) oyEl.value = this.settings.origin.y.toFixed(3);
    }
    
    setOriginToReferenceUL() {
        const bounds = this.getReferenceBounds();
        if (!bounds) return;
        
        const x = bounds.minX;
        const y = bounds.minY;
        
        this.settings.origin = { x, y };
        this.settings.originPreset = 'bottom-left';
        
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.preset-btn[data-pos="bottom-left"]')?.classList.add('selected');
        
        this.updateOriginDisplay();
        
        if (this.renderer?.setNullPoint) {
            this.renderer.setNullPoint(x, y);
            this.renderer.render();
        }
    }
    
    // ════════════════════════════════════════════════════════════════
    // REFERENCE
    // ════════════════════════════════════════════════════════════════
    
    bindReferenceEvents() {
        document.getElementById('btn-clear-ref')?.addEventListener('click', () => {
            const wasRef = this.contours.filter(c => c.isReference);
            if (wasRef.length === 0) return;
            const snapshot = wasRef.map(c => ({ contour: c, old: true }));
            wasRef.forEach(c => { c.isReference = false; });
            const app = this;
            const cmd = new FunctionCommand(
                'Referenz löschen',
                () => { snapshot.forEach(s => { s.contour.isReference = false; }); app.renderer?.render(); app.updateContourPanel(); },
                () => { snapshot.forEach(s => { s.contour.isReference = true; }); app.setOriginToReferenceUL(); app.renderer?.render(); app.updateContourPanel(); }
            );
            this.undoManager.undoStack.push(cmd);
            this.undoManager.redoStack.length = 0;
            this.undoManager._notifyStateChange();
            this.showToast('Referenz gelöscht (STRG+Z = Rückgängig)', 'success');
            this.renderer?.render();
            this.updateContourPanel();
        });
        
        document.getElementById('btn-auto-reference')?.addEventListener('click', () => {
            this.autoDetectReference();
        });
    }
    
    autoDetectReference() {
        const mode = document.getElementById('reference-contour-select')?.value || 'auto';
        
        // Snapshot VOR Änderung: alle bisherigen Referenz-Konturen merken
        const oldRefs = this.contours.filter(c => c.isReference);
        
        this.contours.forEach(c => { c.isReference = false; });
        
        let referenceContour = null;
        const closedContours = this.contours.filter(c => c.isClosed === true);
        
        if (closedContours.length === 0) {
            // Undo für das Zurücksetzen, falls vorher Referenzen existierten
            if (oldRefs.length > 0) {
                const app = this;
                const cmd = new FunctionCommand(
                    'Referenz zurückgesetzt (keine geschlossenen Konturen)',
                    () => { app.contours.forEach(c => { c.isReference = false; }); app.renderer?.render(); app.updateContourPanel(); },
                    () => { oldRefs.forEach(c => { c.isReference = true; }); app.setOriginToReferenceUL(); app.renderer?.render(); app.updateContourPanel(); }
                );
                this.undoManager.undoStack.push(cmd);
                this.undoManager.redoStack.length = 0;
                this.undoManager._notifyStateChange();
            }
            this.showToast('Keine geschlossenen Konturen für Referenz gefunden', 'warning');
            return;
        }
        
        if (mode === 'fliese') {
            referenceContour = closedContours.find(c => 
                c.layer && c.layer.toLowerCase().includes('fliese')
            );
        }
        
        if (!referenceContour && mode !== 'manual') {
            let maxArea = 0;
            closedContours.forEach(c => {
                const area = typeof c.getArea === 'function' ? 
                    Math.abs(c.getArea()) : this.computeArea(c.points);
                if (area > maxArea) {
                    maxArea = area;
                    referenceContour = c;
                }
            });
        }
        
        if (referenceContour) {
            referenceContour.isReference = true;
            this.setOriginToReferenceUL();
            
            // Undo-Command: neue Referenz vs. alte Referenzen
            const newRef = referenceContour;
            const app = this;
            const cmd = new FunctionCommand(
                `Auto-Referenz: ${referenceContour.layer || 'größte Fläche'}`,
                () => { app.contours.forEach(c => { c.isReference = false; }); newRef.isReference = true; app.setOriginToReferenceUL(); app.renderer?.render(); app.updateContourPanel(); },
                () => { app.contours.forEach(c => { c.isReference = false; }); oldRefs.forEach(c => { c.isReference = true; }); if (oldRefs.length > 0) app.setOriginToReferenceUL(); app.renderer?.render(); app.updateContourPanel(); }
            );
            this.undoManager.undoStack.push(cmd);
            this.undoManager.redoStack.length = 0;
            this.undoManager._notifyStateChange();
            
            const info = referenceContour.layer || 'größte geschlossene Fläche';
            this.showToast(`Referenz: ${info} (STRG+Z = Rückgängig)`, 'success');
            this.renderer?.render();
            this.updateContourPanel();
        } else {
            this.showToast('Keine passende Referenz gefunden', 'warning');
        }
    }
    
    computeArea(points) {
        if (!points || points.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area / 2);
    }
    
    // ════════════════════════════════════════════════════════════════
    // CUTTING
    // ════════════════════════════════════════════════════════════════
    
    bindCuttingEvents() {
        document.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setCuttingModeForSelected(mode);
                document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        document.querySelectorAll('.quality-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const quality = parseInt(btn.dataset.quality, 10);
                this.setQualityForSelected(quality);
                document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        document.getElementById('btn-apply-kerf')?.addEventListener('click', () => this.applyKerfWidth());
        document.getElementById('btn-direction-cw')?.addEventListener('click', () => this.setDirectionForSelected('cw'));
        document.getElementById('btn-direction-ccw')?.addEventListener('click', () => this.setDirectionForSelected('ccw'));
    }
    
    setCuttingModeForSelected(mode) {
        const selected = this.contours.filter(c => c.isSelected && c.isClosed && !c.isReference);
        
        if (selected.length === 0) {
            this.showToast('Bitte erst Konturen auswählen', 'warning');
            return;
        }
        
        // Gruppierte Undo-Aktion
        this.undoManager.beginGroup(`Modus → ${mode === 'hole' ? 'Loch' : 'Scheibe'}`);
        selected.forEach(c => {
            this.undoManager.execute(new PropertyChangeCommand(c, 'cuttingMode', mode, () => {
                c.invalidate?.();
            }));
        });
        this.undoManager.endGroup();
        
        this.showToast(`${selected.length} Konturen: ${mode === 'hole' ? 'Loch' : 'Scheibe'} (STRG+Z = Rückgängig)`, 'success');
        this.renderer?.render();
        this.updateContourPanel();
    }
    
    setQualityForSelected(quality) {
        const selected = this.contours.filter(c => c.isSelected && !c.isReference);
        const targets = selected.length > 0 
            ? selected 
            : this.contours.filter(c => !c.isReference);
        
        if (targets.length === 0) return;
        
        const oldQuality = this.settings.quality;
        
        // Gruppierte Undo-Aktion: Alle Qualitätsänderungen als eine Einheit
        this.undoManager.beginGroup(`Qualität → Q${quality}`);
        
        targets.forEach(c => {
            this.undoManager.execute(new PropertyChangeCommand(c, 'quality', quality));
        });
        
        this.undoManager.endGroup();
        
        this.settings.quality = quality;
        this.renderer?.render();
        this.updateContourPanel();
        
        const label = selected.length > 0 
            ? `Q${quality} für ${selected.length} Konturen` 
            : `Q${quality} für alle`;
        this.showToast(`Qualität ${label} (STRG+Z = Rückgängig)`, 'success');
    }
    
    applyKerfWidth() {
        const newKerf = parseFloat(document.getElementById('kerf-width')?.value) || 0.8;
        const oldKerf = this.settings.kerfWidth;
        const targets = this.contours.filter(c => c.isClosed && !c.isReference);
        
        if (targets.length === 0) return;
        
        // Gruppierte Undo-Aktion
        this.undoManager.beginGroup(`Kerf → ${newKerf} mm`);
        
        targets.forEach(c => {
            this.undoManager.execute(new PropertyChangeCommand(c, 'kerfWidth', newKerf, () => {
                c.invalidate?.();
            }));
        });
        
        this.undoManager.endGroup();
        
        this.settings.kerfWidth = newKerf;
        this.renderer?.render();
        this.showToast(`Kerf: ${newKerf} mm für ${targets.length} Konturen (STRG+Z = Rückgängig)`, 'success');
    }
    
    setDirectionForSelected(direction) {
        const selected = this.contours.filter(c => c.isSelected && c.isClosed && !c.isReference);
        
        if (selected.length === 0) {
            this.showToast('Bitte erst Konturen auswählen', 'warning');
            return;
        }
        
        // Nur Konturen sammeln die tatsächlich umgekehrt werden müssen
        const toReverse = selected.filter(c => {
            if (!c.points || c.points.length < 3) return false;
            const currentCW = this.isClockwise(c.points);
            const wantCW = (direction === 'cw');
            return currentCW !== wantCW;
        });
        
        if (toReverse.length > 0) {
            this.undoManager.beginGroup(`Richtung → ${direction.toUpperCase()}`);
            
            toReverse.forEach(c => {
                this.undoManager.execute(new FunctionCommand(
                    `Richtung umkehren`,
                    () => { c.points = c.points.slice().reverse(); c.invalidate?.(); },
                    () => { c.points = c.points.slice().reverse(); c.invalidate?.(); }
                ));
            });
            
            this.undoManager.endGroup();
        }
        
        this.showToast(`${selected.length} Konturen: ${direction.toUpperCase()} (STRG+Z = Rückgängig)`, 'success');
        this.renderer?.render();
    }
    
    isClockwise(points) {
        let sum = 0;
        for (let i = 0; i < points.length - 1; i++) {
            sum += (points[i+1].x - points[i].x) * (points[i+1].y + points[i].y);
        }
        return sum > 0;
    }
    
    // Live-Updates für Lead-Parameter
    bindLeadLiveUpdates() {
        this._leadSnapshot = null; // Snapshot vor erster Änderung
        
        // V3.14: Außen-Lead + Innen-Lead Felder
        // V5.3 Phase B: +piercing params, +dynamic lead
        const extInputs = [
            'lead-type', 'lead-in-length', 'lead-in-radius', 'lead-in-angle',
            'overcut-length', 'lead-out-length',
            'prefer-corners', 'piercing-type',
            'piercing-stationary-time', 'piercing-circular-radius', 'piercing-circular-time',
            'dynamic-lead-ext', 'dyn-lead-min', 'dyn-lead-max'
        ];
        const intInputs = [
            'int-lead-type', 'int-lead-in-length', 'int-lead-in-radius', 'int-lead-in-angle',
            'int-overcut-length', 'int-lead-out-length'
        ];
        const allInputs = [...extInputs, ...intInputs];

        allInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    this._captureLeadSnapshot(); // Snapshot VOR erster Änderung
                    this._applyLeadValues();      // Live-Preview
                });
                el.addEventListener('change', () => {
                    this._applyLeadValues();      // Finale Werte setzen
                    this._commitLeadChanges();    // Als Undo-Command registrieren
                });
            }
        });

        // V3.14: "= Außen" Checkbox → Settings sync + Live-Update
        document.getElementById('int-like-ext')?.addEventListener('change', (e) => {
            this.settings.internalLeadLikeExternal = e.target.checked;
            this._captureLeadSnapshot();
            this._applyLeadValues();
            this._commitLeadChanges();
            console.log('[CAM V3.14] Innen-Lead:', e.target.checked ? '= Außen (sync)' : 'eigene Parameter');
        });

        // V3.14: Material-Dicke sync
        document.getElementById('material-thickness')?.addEventListener('change', (e) => {
            this.settings.materialThickness = parseFloat(e.target.value) || 8.0;
            console.log('[CAM V3.14] Material-Dicke:', this.settings.materialThickness, 'mm');
        });

        // V4.5: Alternativ-Lead Felder (IGEMS Slot 4)
        const altInputs = [
            'alt-lead-type', 'alt-lead-in-length', 'alt-lead-in-angle',
            'alt-lead-out-length', 'alt-overcut-length'
        ];
        altInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    this._captureLeadSnapshot();
                    this._applyLeadValues();
                });
                el.addEventListener('change', () => {
                    this._applyLeadValues();
                    this._commitLeadChanges();
                });
            }
        });

        // V4.5: "Auto-Fallback" Checkbox
        document.getElementById('alt-lead-enabled')?.addEventListener('change', (e) => {
            this.settings.altLeadEnabled = e.target.checked;
            this._captureLeadSnapshot();
            this._applyLeadValues();
            this._commitLeadChanges();
            console.log('[CAM V4.5] Alternativ-Lead:', e.target.checked ? 'aktiv' : 'deaktiviert');
        });
    }
    
    /** Lead-Werte aus UI lesen (Außen-Parameter)
     *  V5.3 Phase B: +piercingType, +dynamic lead, +piercing R-params */
    _getLeadValuesFromUI() {
        const piercingType = document.getElementById('piercing-type')?.value || 'auto';
        const dynamicLead = document.getElementById('dynamic-lead-ext')?.checked || false;
        return {
            leadInType:    document.getElementById('lead-type')?.value || 'arc',
            leadInLength:  parseFloat(document.getElementById('lead-in-length')?.value) || 4.0,
            leadInRadius:  parseFloat(document.getElementById('lead-in-radius')?.value) || 2.0,
            leadInAngle:   parseFloat(document.getElementById('lead-in-angle')?.value) || 90,
            overcutLength: (() => { const v = parseFloat(document.getElementById('overcut-length')?.value); return isNaN(v) ? 1.0 : v; })(),
            leadOutLength: parseFloat(document.getElementById('lead-out-length')?.value) || 4.0,
            preferCorners: document.getElementById('prefer-corners')?.checked ?? true,
            piercingType:  piercingType,
            // B.1: Piercing R-Parameter
            piercingStationaryTime: parseFloat(document.getElementById('piercing-stationary-time')?.value) || 1.5,
            piercingCircularRadius: parseFloat(document.getElementById('piercing-circular-radius')?.value) || 2.0,
            piercingCircularTime:   parseFloat(document.getElementById('piercing-circular-time')?.value) || 2.0,
            // B.2: Dynamic Lead
            leadInDynamic:    dynamicLead,
            leadInLengthMin:  dynamicLead ? (parseFloat(document.getElementById('dyn-lead-min')?.value) || 1.0) : undefined,
            leadInLengthMax:  dynamicLead ? (parseFloat(document.getElementById('dyn-lead-max')?.value) || 15.0) : undefined
        };
    }

    /** V3.14: Innen-Lead-Werte aus UI lesen (fällt auf Außen zurück wenn "= Außen") */
    _getInternalLeadValuesFromUI() {
        if (this.settings.internalLeadLikeExternal) {
            return this._getLeadValuesFromUI(); // Identisch mit Außen
        }
        const ext = this._getLeadValuesFromUI();
        return {
            leadInType:    document.getElementById('int-lead-type')?.value || ext.leadInType,
            leadInLength:  parseFloat(document.getElementById('int-lead-in-length')?.value) || ext.leadInLength,
            leadInRadius:  parseFloat(document.getElementById('int-lead-in-radius')?.value) || ext.leadInRadius,
            leadInAngle:   parseFloat(document.getElementById('int-lead-in-angle')?.value) || ext.leadInAngle,
            overcutLength: (() => { const v = parseFloat(document.getElementById('int-overcut-length')?.value); return isNaN(v) ? ext.overcutLength : v; })(),
            leadOutLength: parseFloat(document.getElementById('int-lead-out-length')?.value) || ext.leadOutLength,
            preferCorners: ext.preferCorners, // Gleiche Ecken-Präferenz für Innen
            piercingType:  ext.piercingType   // Gleicher Piercing-Typ (später per Flächenklasse überschreibbar)
        };
    }
    
    /** V4.5: Alternativ-Lead-Werte direkt aus UI lesen (IGEMS Slot 4 — Fallback bei Kollision)
     *  Liest ALLE Alt-Lead-Parameter direkt aus DOM (kein Settings-Umweg) */
    _getAlternativeLeadValuesFromUI() {
        return {
            altLeadEnabled:   this.settings.altLeadEnabled,
            altLeadType:      document.getElementById('alt-lead-type')?.value || 'linear',
            altLeadInLength:  parseFloat(document.getElementById('alt-lead-in-length')?.value) || 3.0,
            altLeadInAngle:   parseFloat(document.getElementById('alt-lead-in-angle')?.value) || 5,
            altLeadOutLength: parseFloat(document.getElementById('alt-lead-out-length')?.value) || 2.0,
            altOvercutLength: parseFloat(document.getElementById('alt-overcut-length')?.value) || 2.0
        };
    }

    /** Lead-Properties auf eine Kontur anwenden
     *  V4.5: Setzt auch Alternativ-Lead-Parameter für Fallback-Kette
     *  V5.3 Phase B: +piercing R-params, +dynamic lead, +area classes */
    _applyLeadToContour(c, vals) {
        c.leadInType = vals.leadInType;
        c.leadInLength = vals.leadInLength;
        c.leadInRadius = vals.leadInRadius;
        c.leadInAngle = vals.leadInAngle;
        c.overcutLength = vals.overcutLength;
        c.leadOutType = vals.leadInType;
        c.leadOutLength = vals.leadOutLength;
        c.leadOutRadius = vals.leadInRadius;
        c.leadOutAngle = vals.leadInAngle;
        c.preferCorners = vals.preferCorners;
        c.piercingType = vals.piercingType;
        // B.1: Piercing R-Parameter
        if (vals.piercingStationaryTime !== undefined) c.piercingStationaryTime = vals.piercingStationaryTime;
        if (vals.piercingCircularRadius !== undefined) c.piercingCircularRadius = vals.piercingCircularRadius;
        if (vals.piercingCircularTime !== undefined)   c.piercingCircularTime   = vals.piercingCircularTime;
        // B.2: Dynamic Lead
        if (vals.leadInDynamic !== undefined) {
            c.leadInDynamic    = vals.leadInDynamic;
            c.leadInLengthMin  = vals.leadInLengthMin;
            c.leadInLengthMax  = vals.leadInLengthMax;
        }
        // V4.5: Alternativ-Lead auf Kontur setzen (Undo-safe: aus altVals oder aktuellen UI-Werten)
        if (vals.altLeadEnabled !== undefined) {
            c.altLeadEnabled   = vals.altLeadEnabled;
            c.altLeadType      = vals.altLeadType;
            c.altLeadInLength  = vals.altLeadInLength;
            c.altLeadInAngle   = vals.altLeadInAngle;
            c.altLeadOutLength = vals.altLeadOutLength;
            c.altOvercutLength = vals.altOvercutLength;
        } else {
            const alt = this._getAlternativeLeadValuesFromUI();
            c.altLeadEnabled   = alt.altLeadEnabled;
            c.altLeadType      = alt.altLeadType;
            c.altLeadInLength  = alt.altLeadInLength;
            c.altLeadInAngle   = alt.altLeadInAngle;
            c.altLeadOutLength = alt.altLeadOutLength;
            c.altOvercutLength = alt.altOvercutLength;
        }
        c._cachedLeadInPath = null;
        c._cachedLeadOutPath = null;
        c._cachedOvercutPath = null;
        if (vals.preferCorners && c._rotationCount === 0) {
            c.autoPlaceStartPoint?.();
        }
    }
    
    /** Lead-Properties einer Kontur auslesen
     *  V4.5: Inkl. Alternativ-Lead-State
     *  V5.3 Phase B: +piercing R-params, +dynamic lead */
    _readLeadFromContour(c) {
        return {
            leadInType:    c.leadInType,
            leadInLength:  c.leadInLength,
            leadInRadius:  c.leadInRadius,
            leadInAngle:   c.leadInAngle,
            overcutLength: c.overcutLength,
            leadOutLength: c.leadOutLength,
            preferCorners: c.preferCorners,
            piercingType:  c.piercingType,
            // B.1: Piercing R-params
            piercingStationaryTime: c.piercingStationaryTime,
            piercingCircularRadius: c.piercingCircularRadius,
            piercingCircularTime:   c.piercingCircularTime,
            // B.2: Dynamic Lead
            leadInDynamic:   c.leadInDynamic,
            leadInLengthMin: c.leadInLengthMin,
            leadInLengthMax: c.leadInLengthMax,
            // Alt-Lead
            altLeadEnabled:   c.altLeadEnabled,
            altLeadType:      c.altLeadType,
            altLeadInLength:  c.altLeadInLength,
            altLeadInAngle:   c.altLeadInAngle,
            altLeadOutLength: c.altLeadOutLength,
            altOvercutLength: c.altOvercutLength
        };
    }
    
    /** Snapshot VOR der ersten Slider-Bewegung sichern */
    _captureLeadSnapshot() {
        if (this._leadSnapshot) return; // Nur beim ersten Aufruf
        const targets = this._getLeadTargets();
        this._leadSnapshot = targets.map(c => ({ contour: c, old: this._readLeadFromContour(c) }));
    }
    
    /** Ziel-Konturen für Lead-Änderungen ermitteln */
    _getLeadTargets() {
        const selected = this.contours.filter(c => c.isSelected && !c.isReference && (c.isClosed || c.cuttingMode === 'slit'));
        return selected.length > 0 ? selected : this.contours.filter(c => !c.isReference && (c.isClosed || c.cuttingMode === 'slit'));
    }
    
    /** Lead-Werte aus UI auf Konturen anwenden (Live-Preview)
     *  V3.14: Differenziert Außen/Innen basierend auf cuttingMode
     *  V5.3 Phase B: Flächenklassen-Override für Innenkonturen */
    _applyLeadValues() {
        const extVals = this._getLeadValuesFromUI();
        const intVals = this._getInternalLeadValuesFromUI();
        const useAreaClasses = document.getElementById('use-area-classes')?.checked && this.settings.areaClasses;
        const targets = this._getLeadTargets();
        
        targets.forEach(c => {
            if (c.cuttingMode === 'hole') {
                // B.3: Flächenklassen-Override für Löcher
                if (useAreaClasses && typeof c.applyAreaClass === 'function') {
                    const applied = c.applyAreaClass(this.settings.areaClasses);
                    if (applied) {
                        console.log(`[Phase B.3] Flächenklasse angewandt auf Kontur #${c.id}: area=${c._lastAreaCm2?.toFixed(2)} cm²`);
                        return; // Flächenklasse hat alle Werte gesetzt
                    }
                }
                this._applyLeadToContour(c, intVals);
            } else {
                this._applyLeadToContour(c, extVals);
            }
        });

        this.renderer?.render();
    }
    
    /** Backward-Compat: Falls updateLeadPreview() direkt aufgerufen wird */
    updateLeadPreview() {
        this._captureLeadSnapshot();
        this._applyLeadValues();
        this._commitLeadChanges();
    }
    
    /** Lead-Änderungen als Undo-Command registrieren (nach Slider-Release)
     *  V3.14: Speichert Außen/Innen-Werte getrennt */
    _commitLeadChanges() {
        const snapshot = this._leadSnapshot;
        this._leadSnapshot = null; // Reset für nächste Änderung
        
        if (!snapshot || snapshot.length === 0) return;
        
        const newExtVals = this._getLeadValuesFromUI();
        const newIntVals = this._getInternalLeadValuesFromUI();
        const newAltVals = this._getAlternativeLeadValuesFromUI();
        const app = this;
        
        // V4.5: Alt-Lead-Werte in Ext/Int mergen für korrektes Redo
        const extWithAlt = Object.assign({}, newExtVals, newAltVals);
        const intWithAlt = Object.assign({}, newIntVals, newAltVals);
        
        const cmd = new FunctionCommand(
            `Lead-In/Out Parameter ändern (${snapshot.length} Konturen)`,
            () => {
                snapshot.forEach(({ contour }) => {
                    const vals = (contour.cuttingMode === 'hole') ? intWithAlt : extWithAlt;
                    app._applyLeadToContour(contour, vals);
                });
                app.renderer?.render();
            },
            () => {
                snapshot.forEach(({ contour, old }) => app._applyLeadToContour(contour, old));
                app.renderer?.render();
            }
        );
        // Bereits ausgeführt, nur auf Stack legen
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();
        console.log(`[UndoManager V4.5] Lead-Parameter registriert (${snapshot.length} Konturen, Außen/Innen/Alt differenziert)`);
    }
    
    // ════════════════════════════════════════════════════════════════
    // EXPORT
    // ════════════════════════════════════════════════════════════════
    
    bindExportEvents() {
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportGCode());
        document.getElementById('btn-preview')?.addEventListener('click', () => this.previewGCode());
    }
    
    updateExportSummary() {
        const cuttable = this.contours.filter(c => !c.isReference && (c.isClosed || c.cuttingMode === 'slit'));
        let totalLength = 0;
        
        cuttable.forEach(c => {
            totalLength += this.getContourPerimeter(c);
        });
        
        const feedRate = 2000; // mm/min (Beispiel)
        const timeMin = totalLength / feedRate;
        
        document.getElementById('summary-contours').textContent = cuttable.length;
        document.getElementById('summary-length').textContent = `${totalLength.toFixed(1)} mm`;
        document.getElementById('summary-time').textContent = `${timeMin.toFixed(1)} min`;
    }
    
    /**
     * V5.0: Liefert R-Parameter aus CeraJet-Engine für den Postprozessor.
     * Fallback auf leeres Objekt wenn Engine nicht verfügbar.
     */
    getTechnologyParams() {
        if (typeof CeraJetEngine === 'undefined') {
            console.warn('[App] CeraJetEngine nicht verfügbar — Standard-Template wird verwendet');
            return {};
        }

        const tech = this.settings.technology;
        const result = CeraJetEngine.calculate({
            materialId: tech.materialId,
            nozzleId: tech.nozzleId,
            thickness: this.settings.materialThickness,
            pressure: tech.pressure,
            optMode: tech.optMode,
            abrasiveOverride: tech.abrasiveOverride
        });

        const rParams = CeraJetEngine.toRParameters(result);
        console.log(`[App V5.0] getTechnologyParams: ${result.material.name}, ${this.settings.materialThickness}mm → ${Object.keys(rParams).length} R-Parameter`);
        return rParams;
    }

    exportGCode() {
        if (!this.contours || this.contours.length === 0) {
            this.showToast('Keine Konturen zum Exportieren', 'error');
            return;
        }
        if (!this.cutOrder || this.cutOrder.length === 0) {
            this.showToast('Keine Schneidreihenfolge festgelegt', 'error');
            return;
        }

        const planName = document.getElementById('planname-input')?.value
            || this.dxfFileName?.replace(/\.dxf$/i, '').toUpperCase()
            || 'UNNAMED';

        // V5.0: Technologie-Parameter aus CeraJet-Engine
        const technologyParams = this.getTechnologyParams();

        const pp = new SinumerikPostprocessor();
        const result = pp.generateDownload(this.contours, this.cutOrder, {
            planName,
            dicke: this.settings.materialThickness || 10.0,
            material: this._cerajetResult?.material?.name || 'AALLGEMEIN',
            technologyParams
        });

        if (!result) {
            this.showToast('Export fehlgeschlagen — keine Daten', 'error');
            return;
        }

        if (result.warnings.length > 0) {
            console.warn('[EXPORT] Warnungen:', result.warnings);
            this.showToast(`Export mit ${result.warnings.length} Warnung(en)`, 'warning');
        }

        // Download auslösen
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`✅ ${result.filename} exportiert (${result.stats.contours} Konturen)`, 'success');
    }

    previewGCode() {
        if (!this.contours || this.contours.length === 0) {
            this.showToast('Keine Konturen für Vorschau', 'error');
            return;
        }
        if (!this.cutOrder || this.cutOrder.length === 0) {
            this.showToast('Keine Schneidreihenfolge festgelegt', 'error');
            return;
        }

        const planName = document.getElementById('planname-input')?.value
            || this.dxfFileName?.replace(/\.dxf$/i, '').toUpperCase()
            || 'UNNAMED';

        // V5.0: Technologie-Parameter aus CeraJet-Engine
        const technologyParams = this.getTechnologyParams();

        const pp = new SinumerikPostprocessor();
        const result = pp.generate(this.contours, this.cutOrder, {
            planName,
            dicke: this.settings.materialThickness || 10.0,
            material: this._cerajetResult?.material?.name || 'AALLGEMEIN',
            technologyParams
        });

        if (!result.code) {
            this.showToast('Vorschau: Kein Code generiert', 'error');
            return;
        }

        // Vorschau-Modal anzeigen
        this._showPreviewModal(result.code, result.warnings, result.stats);
    }

    // ════════════════════════════════════════════════════════════════
    // V5.2: INTARSIEN-EXPORT (Dual NEG/POS)
    // ════════════════════════════════════════════════════════════════

    /**
     * Erzeugt zwei CNC-Dateien für Intarsien-Schnitt:
     * - PLAN_POS.CNC: Einleger (normale cuttingModes)
     * - PLAN_NEG.CNC: Aussparung (invertierte cuttingModes disc↔hole)
     *
     * Prinzip: POS schneidet das Teil aus (disc=Teil, hole=Loch)
     *          NEG schneidet die Aussparung (disc→Loch, hole→Teil)
     *          → Gleiche Geometrie, invertierte Kerf-Kompensation
     *          → Leads flippen automatisch (Pierce immer im Abfall)
     */
    exportIntarsia() {
        console.time('[Intarsia V5.2] Export');
        console.log('[Intarsia V5.2] exportIntarsia() gestartet');

        if (!this.contours || this.contours.length === 0) {
            this.showToast('Keine Konturen zum Exportieren', 'error');
            return;
        }
        if (!this.cutOrder || this.cutOrder.length === 0) {
            this.showToast('Keine Schneidreihenfolge festgelegt', 'error');
            return;
        }

        const baseName = document.getElementById('planname-input')?.value
            || this.dxfFileName?.replace(/\.dxf$/i, '').toUpperCase()
            || 'UNNAMED';

        const technologyParams = this.getTechnologyParams();
        const commonSettings = {
            dicke: this.settings.materialThickness || 10.0,
            material: this._cerajetResult?.material?.name || 'AALLGEMEIN',
            technologyParams
        };

        // ─── NEG Export (Aussparung) — normale cuttingModes (disc→G42) ───
        // Disc-Konturen + G42 = Kerf nach außen = Loch wird größer = Aussparung
        console.log('[Intarsia V5.2] Generiere NEG (Aussparung, normale Modes)...');
        const ppNeg = new SinumerikPostprocessor();
        const negResult = ppNeg.generate(this.contours, this.cutOrder, {
            ...commonSettings,
            planName: baseName + '_NEG'
        });

        // ─── POS Export (Einleger) — invertierte cuttingModes (disc→hole→G41) ───
        // Hole-Modus + G41 = Kerf nach innen = Teil wird kleiner = Einleger
        console.log('[Intarsia V5.2] Generiere POS (Einleger, invertierte Modes)...');
        const posContours = this._createIntarsiaContours('pos');
        const ppPos = new SinumerikPostprocessor();
        const posResult = ppPos.generate(posContours, this.cutOrder, {
            ...commonSettings,
            planName: baseName + '_POS'
        });

        // ─── Downloads auslösen ───
        const allWarnings = [
            ...posResult.warnings.map(w => `POS: ${w}`),
            ...negResult.warnings.map(w => `NEG: ${w}`)
        ];

        if (allWarnings.length > 0) {
            console.warn('[Intarsia V5.2] Warnungen:', allWarnings);
        }

        this._downloadIntarsiaFile(posResult.code, baseName + '_POS.CNC');
        // Kurze Verzögerung damit Browser nicht "Multiple Downloads" blockiert
        setTimeout(() => {
            this._downloadIntarsiaFile(negResult.code, baseName + '_NEG.CNC');
        }, 300);

        const totalContours = (posResult.stats?.contours || 0) + (negResult.stats?.contours || 0);
        this.showToast(
            `✅ Intarsien: ${baseName}_POS.CNC + ${baseName}_NEG.CNC (${posResult.stats?.contours || 0} Konturen)`,
            'success'
        );

        console.log(`[Intarsia V5.2] Export abgeschlossen: POS=${posResult.stats?.contours} NEG=${negResult.stats?.contours} Konturen`);
        console.timeEnd('[Intarsia V5.2] Export');
    }

    /**
     * Erzeugt Kontur-Klone mit invertiertem cuttingMode für POS-Export.
     *
     * Normal (NEG/Aussparung): disc→G42 (Kerf außen, Loch größer)
     * Invertiert (POS/Einleger): disc→hole→G41 (Kerf innen, Teil kleiner)
     *
     * Nesting-Level-Alternation bei A/O/B etc.:
     *   NEG (normal):     Level 1=disc(G42), Level 2=hole(G41)  [Standard-Pipeline]
     *   POS (invertiert):  Level 1=hole(G41), Level 2=disc(G42)  [Alles umgedreht]
     *
     * Lead-Seite folgt automatisch aus dem neuen cuttingMode:
     *   hole → Innen-Lead-Parameter (Pierce außen)
     *   disc → Außen-Lead-Parameter (Pierce innen)
     */
    _createIntarsiaContours(fileType) {
        console.log(`[Intarsia V5.2] _createIntarsiaContours('${fileType}')`);

        const extVals = this._getLeadValuesFromUI();
        const intVals = this._getInternalLeadValuesFromUI();
        const altVals = this._getAlternativeLeadValuesFromUI();

        return this.contours.map((c, idx) => {
            // Referenz unverändert durchreichen
            if (c.isReference) return c;

            // Nicht-schneidbare Konturen unverändert
            if (!c.isClosed && c.cuttingMode !== 'slit') return c;

            // Clone erstellen
            const clone = c.clone();

            if (fileType === 'pos') {
                // POS = Einleger: cuttingMode invertieren
                // disc→hole (G42→G41), hole→disc (G41→G42)
                if (clone.cuttingMode === 'disc') {
                    clone.cuttingMode = 'hole';
                    clone.type = 'INNER';
                } else if (clone.cuttingMode === 'hole') {
                    clone.cuttingMode = 'disc';
                    clone.type = 'OUTER';
                }
                // slit bleibt slit
            }

            // Leads neu berechnen passend zum (ggf. invertierten) cuttingMode
            // hole → Innen-Lead (Pierce außen), disc → Außen-Lead (Pierce innen)
            const leadVals = Object.assign({},
                (clone.cuttingMode === 'hole') ? intVals : extVals,
                altVals
            );
            this._applyLeadToContour(clone, leadVals);

            console.log(`[Intarsia V5.2] Kontur ${idx}: ${c.cuttingMode}→${clone.cuttingMode} (nesting=${clone.nestingLevel})`);
            return clone;
        });
    }

    /**
     * Einzelne CNC-Datei als Download auslösen.
     * Nutzt FSAPI-Ordner wenn verfügbar (CeraCAM Shim setzt window._cncDirHandle).
     */
    async _downloadIntarsiaFile(code, filename) {
        if (!code) return;

        // FSAPI-Ordner-Export (wie normaler CNC-Export)
        if (window._cncDirHandle) {
            try {
                const fh = await window._cncDirHandle.getFileHandle(filename, { create: true });
                const w = await fh.createWritable();
                await w.write(code);
                await w.close();
                console.log(`[Intarsia V5.2] FSAPI: ${filename} → ${window._cncDirHandle.name}/`);
                return;
            } catch (err) {
                console.warn(`[Intarsia V5.2] FSAPI fehlgeschlagen, Fallback auf Download:`, err);
            }
        }

        // Fallback: normaler Browser-Download
        const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[Intarsia V5.2] Download: ${filename} (${code.length} bytes)`);
    }

    _showPreviewModal(code, warnings, stats) {
        // Existierendes Modal entfernen
        const existing = document.getElementById('gcode-preview-modal');
        if (existing) existing.remove();

        const warningHtml = warnings.length > 0
            ? `<div style="background:#fff3cd;color:#856404;padding:8px;border-radius:4px;margin-bottom:8px;font-size:12px">⚠️ ${warnings.join('<br>⚠️ ')}</div>`
            : '';

        const modal = document.createElement('div');
        modal.id = 'gcode-preview-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center';
        modal.innerHTML = `
            <div style="background:#1e1e1e;border-radius:8px;width:80%;max-width:900px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
                <div style="padding:16px 20px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <span style="color:#fff;font-weight:600">📋 G-Code Vorschau</span>
                        <span style="color:#888;margin-left:12px;font-size:13px">${stats.contours} Konturen · ${code.split('\n').length} Zeilen · ${(code.length/1024).toFixed(1)} KB</span>
                    </div>
                    <div>
                        <button id="gcode-copy-btn" style="background:#0d6efd;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;margin-right:8px;font-size:13px">📋 Kopieren</button>
                        <button id="gcode-close-btn" style="background:#444;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px">✕ Schließen</button>
                    </div>
                </div>
                ${warningHtml}
                <pre style="margin:0;padding:16px 20px;overflow:auto;flex:1;color:#d4d4d4;font-family:'Consolas','Courier New',monospace;font-size:13px;line-height:1.5;white-space:pre">${this._escapeHtml(code)}</pre>
            </div>
        `;

        document.body.appendChild(modal);

        // Events
        modal.querySelector('#gcode-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        modal.querySelector('#gcode-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(code).then(() => {
                this.showToast('G-Code in Zwischenablage kopiert', 'success');
            });
        });

        // ESC zum Schließen
        const escHandler = (e) => {
            if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
        };
        document.addEventListener('keydown', escHandler);
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    // ════════════════════════════════════════════════════════════════
    // UTILS
    // ════════════════════════════════════════════════════════════════
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    // ════════════════════════════════════════════════════════════════
    // UNDO/REDO UI-Helfer (V1.0)
    // ════════════════════════════════════════════════════════════════
    
    /**
     * Aktualisiert Undo/Redo Toolbar-Buttons (disabled/enabled + Tooltip)
     * Wird als Callback von UndoManager.onStateChange aufgerufen.
     * @param {{ undoCount: number, redoCount: number, lastAction: string|null }} state
     */
    _updateUndoUI(state) {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        
        if (btnUndo) {
            btnUndo.disabled = !state.undoCount;
            btnUndo.title = state.lastAction
                ? `Rückgängig: ${state.lastAction} (STRG+Z)`
                : 'Rückgängig (STRG+Z)';
        }
        if (btnRedo) {
            btnRedo.disabled = !state.redoCount;
            btnRedo.title = 'Wiederholen (STRG+Y)';
        }
    }

    // ════════════════════════════════════════════════════════════════
    // V3.8: LAYER UI
    // ════════════════════════════════════════════════════════════════

    /** Aktualisiert alle Layer-Dropdowns und Farbpunkte */
    _updateLayerUI() {
        const layers = this.layerManager.getAllLayers();
        const active = this.layerManager.activeLayer;

        // Ribbon-Dropdown
        const ribbonSel = document.getElementById('ribbon-layer-select');
        if (ribbonSel) {
            ribbonSel.innerHTML = layers.map(l => {
                const sel = l.name === active ? ' selected' : '';
                const vis = l.visible ? '' : ' (aus)';
                return `<option value="${l.name}"${sel}>${l.name}${vis}</option>`;
            }).join('');
        }

        // Status-Bar Dropdown
        const statusSel = document.getElementById('status-layer-select');
        if (statusSel) {
            statusSel.innerHTML = ribbonSel?.innerHTML || '';
        }

        // Farbpunkte
        const activeLayer = this.layerManager.getActiveLayer();
        const color = activeLayer?.color || '#fff';
        const ribbonDot = document.getElementById('ribbon-layer-color-dot');
        if (ribbonDot) ribbonDot.style.background = color;
        const statusDot = document.getElementById('status-layer-color');
        if (statusDot) statusDot.style.background = color;
    }

    /** Selektierte Konturen auf neuen Layer verschieben */
    _moveSelectedContoursToLayer(newLayer) {
        const selected = this.contours.filter(c => c.isSelected);
        if (selected.length === 0) return;

        // Snapshot für Undo
        const snapshot = selected.map(c => ({ contour: c, oldLayer: c.layer }));
        const app = this;

        // Anwenden
        selected.forEach(c => { c.layer = newLayer; });

        // Undo-Command
        const cmd = new FunctionCommand(
            `Layer → ${newLayer} (${selected.length} Konturen)`,
            () => { snapshot.forEach(s => { s.contour.layer = newLayer; }); app.layerManager.updateEntityCounts(app.contours); app.renderer?.render(); app.updateContourPanel(); },
            () => { snapshot.forEach(s => { s.contour.layer = s.oldLayer; }); app.layerManager.updateEntityCounts(app.contours); app.renderer?.render(); app.updateContourPanel(); }
        );
        this.undoManager.undoStack.push(cmd);
        this.undoManager.redoStack.length = 0;
        this.undoManager._notifyStateChange();

        this.layerManager.updateEntityCounts(this.contours);
        this.renderer?.render();
        this.updateContourPanel();
        this.showToast(`${selected.length} Kontur(en) → Layer "${newLayer}" (STRG+Z = Rückgängig)`, 'success');
        console.log(`[Layer] ${selected.length} Konturen verschoben auf Layer "${newLayer}"`);
    }

    /** Layer-Manager Dialog öffnen */
    openLayerManager() {
        this.layerManager.updateEntityCounts(this.contours);
        this._renderLayerManagerTable();
        document.getElementById('layer-manager-dialog').style.display = 'flex';
    }

    /** Layer-Manager Dialog schließen */
    closeLayerManager() {
        document.getElementById('layer-manager-dialog').style.display = 'none';
    }

    /** Layer-Manager Tabelle rendern */
    _renderLayerManagerTable() {
        const tbody = document.getElementById('lm-table-body');
        if (!tbody) return;
        const layers = this.layerManager.getAllLayers();
        const active = this.layerManager.activeLayer;

        tbody.innerHTML = layers.map(l => {
            const isActive = l.name === active;
            const rowClass = isActive ? 'lm-active' : '';
            const visClass = l.visible ? '' : ' off';
            const lockClass = l.locked ? ' locked' : '';
            const visIcon = l.visible ? '💡' : '💡';
            const lockIcon = l.locked ? '🔒' : '🔓';
            return `<tr class="${rowClass}" data-layer="${l.name}">
                <td>${isActive ? '▶' : ''}</td>
                <td><button class="lm-visible-btn${visClass}" data-action="toggle-vis" data-layer="${l.name}">${visIcon}</button></td>
                <td><button class="lm-lock-btn${lockClass}" data-action="toggle-lock" data-layer="${l.name}">${lockIcon}</button></td>
                <td>${l.name}</td>
                <td><span class="lm-color-swatch" data-action="change-color" data-layer="${l.name}" style="background:${l.color}"></span></td>
                <td><select class="lm-linetype-select" data-action="change-linetype" data-layer="${l.name}">
                    <option value="Continuous"${l.lineType === 'Continuous' ? ' selected' : ''}>Continuous</option>
                    <option value="Dashed"${l.lineType === 'Dashed' ? ' selected' : ''}>Dashed</option>
                    <option value="DashDot"${l.lineType === 'DashDot' ? ' selected' : ''}>DashDot</option>
                    <option value="Dotted"${l.lineType === 'Dotted' ? ' selected' : ''}>Dotted</option>
                </select></td>
                <td style="text-align:right">${l.entityCount}</td>
            </tr>`;
        }).join('');
    }

    // ════════════════════════════════════════════════════════════════
    // V3.8: DXF SPEICHERN
    // ════════════════════════════════════════════════════════════════

    /** Speichern (gleicher Dateiname) */
    saveDXF() {
        const filename = this.loadedFileName || 'zeichnung.dxf';
        this._doSaveDXF(filename);
    }

    /** Speichern unter... (neuer Dateiname) */
    saveDXFAs() {
        const defaultName = this.loadedFileName || 'zeichnung.dxf';
        const filename = prompt('Dateiname:', defaultName);
        if (!filename) return;
        const safeName = filename.endsWith('.dxf') ? filename : filename + '.dxf';
        this.loadedFileName = safeName;
        this._doSaveDXF(safeName);
    }

    /** DXF-Export auslösen */
    _doSaveDXF(filename) {
        if (!this.contours || this.contours.length === 0) {
            this.showToast('Keine Konturen zum Speichern', 'warning');
            return;
        }

        try {
            const result = this.dxfWriter.generateDownload(
                this.contours,
                this.layerManager,
                { filename }
            );

            const stats = result.stats;
            this.showToast(
                `✅ ${filename} gespeichert (${stats.entities} Entities, ${(stats.fileSize / 1024).toFixed(1)} KB)`,
                'success'
            );
            console.log('[DXF-Writer] Export:', stats);

            // Dateiname aktualisieren
            document.getElementById('current-filename').textContent = `📄 ${filename}`;
        } catch (err) {
            console.error('[DXF-Writer] Fehler:', err);
            this.showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
        }
    }
}

// Init App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WaricamApp();
});
