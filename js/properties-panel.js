/**
 * WARICAM Properties Panel V1.0
 * AutoCAD-Style Eigenschaften-Panel im rechten Sidebar
 * - Zeigt Geometrie-Daten der selektierten Kontur(en)
 * - Editierbare Felder mit Undo-Support (PropertyChangeCommand)
 * - 3 Modi: Keine Selektion / 1 Kontur / Mehrere Konturen
 * - Automatisches Update bei Selektions-Wechsel
 * Created: 2026-02-16 MEZ
 * Build: 20260216-1600 MEZ
 */

class PropertiesPanel {

    constructor(options = {}) {
        this.app = options.app;

        // DOM-Referenz
        this._el = document.getElementById('properties-section');
        this._content = document.getElementById('properties-content');

        // State
        this._lastSelectionKey = '';  // Cache-Key um unnötige Updates zu vermeiden

        if (!this._el || !this._content) {
            console.warn('[PropertiesPanel V1.0] ⚠️ DOM-Elemente nicht gefunden (#properties-section / #properties-content)');
            return;
        }

        console.log('[PropertiesPanel V1.0] ✅ Initialisiert');
    }

    // ════════════════════════════════════════════════════════════════
    // ÖFFENTLICHE API
    // ════════════════════════════════════════════════════════════════

    /**
     * Panel aktualisieren — aufrufen bei Selektions-Wechsel
     * (wird von updateContourPanel() in app.js getriggert)
     */
    update() {
        if (!this._content || !this.app) return;

        const contours = this.app.contours || [];
        const selected = contours.filter(c => c.isSelected);

        // Cache-Check: Hat sich die Selektion geändert?
        const selKey = selected.map((c, i) => `${contours.indexOf(c)}`).join(',');
        if (selKey === this._lastSelectionKey && selKey !== '') return;
        this._lastSelectionKey = selKey;

        if (selected.length === 0) {
            this._renderNoSelection(contours);
        } else if (selected.length === 1) {
            this._renderSingleSelection(selected[0], contours);
        } else {
            this._renderMultiSelection(selected, contours);
        }
    }

    /** Force-Update (Cache ignorieren) */
    forceUpdate() {
        this._lastSelectionKey = '';
        this.update();
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: Render-Modi
    // ════════════════════════════════════════════════════════════════

    /**
     * Keine Selektion → Zeichnungs-Übersicht
     */
    _renderNoSelection(contours) {
        const closed = contours.filter(c => c.isClosed && !c.isReference);
        const refs = contours.filter(c => c.isReference);
        const open = contours.filter(c => !c.isClosed && !c.isReference);

        let totalArea = 0;
        let totalPerimeter = 0;
        for (const c of contours) {
            if (c.isClosed && !c.isReference) {
                totalArea += this._getArea(c);
            }
            totalPerimeter += this._getPerimeter(c);
        }

        this._content.innerHTML = `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Zeichnung</span></div>
                <div class="pp-row"><span class="pp-key">Konturen:</span><span class="pp-val">${contours.length}</span></div>
                <div class="pp-row"><span class="pp-key">Geschlossen:</span><span class="pp-val">${closed.length}</span></div>
                <div class="pp-row"><span class="pp-key">Offen:</span><span class="pp-val">${open.length}</span></div>
                <div class="pp-row"><span class="pp-key">Referenz:</span><span class="pp-val">${refs.length}</span></div>
                <div class="pp-row"><span class="pp-key">Gesamtfläche:</span><span class="pp-val">${totalArea.toFixed(2)} mm²</span></div>
                <div class="pp-row"><span class="pp-key">Ges.-Umfang:</span><span class="pp-val">${totalPerimeter.toFixed(2)} mm</span></div>
            </div>
        `;
    }

    /**
     * 1 Kontur selektiert → Detailansicht mit editierbaren Feldern
     */
    _renderSingleSelection(contour, allContours) {
        const idx = allContours.indexOf(contour);
        const area = this._getArea(contour);
        const perimeter = this._getPerimeter(contour);
        const bb = this._getBoundingBox(contour);
        const center = this._getCenter(contour);
        const type = this._getTypeLabel(contour);
        const pointCount = contour.points ? contour.points.length : 0;

        // Kreis-Erkennung
        const isCircle = contour.type === 'CIRCLE' || this._isCircular(contour);
        const radius = isCircle ? this._getRadius(contour) : null;

        let html = `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">${contour.name || 'Kontur ' + (idx + 1)}</span><span class="pp-type-badge">${type}</span></div>
            </div>

            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Geometrie</span></div>
                <div class="pp-row"><span class="pp-key">Punkte:</span><span class="pp-val">${pointCount}</span></div>
                <div class="pp-row"><span class="pp-key">Geschlossen:</span><span class="pp-val">${contour.isClosed ? 'Ja' : 'Nein'}</span></div>`;

        if (contour.isClosed) {
            html += `
                <div class="pp-row"><span class="pp-key">Fläche:</span><span class="pp-val">${area.toFixed(3)} mm²</span></div>`;
        }

        html += `
                <div class="pp-row"><span class="pp-key">Umfang:</span><span class="pp-val">${perimeter.toFixed(3)} mm</span></div>
                <div class="pp-row"><span class="pp-key">BBox:</span><span class="pp-val">${bb.width.toFixed(2)} × ${bb.height.toFixed(2)}</span></div>
            </div>`;

        if (isCircle && radius !== null) {
            html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Kreis</span></div>
                <div class="pp-row"><span class="pp-key">Radius:</span><span class="pp-val">${radius.toFixed(3)} mm</span></div>
                <div class="pp-row"><span class="pp-key">Durchmesser:</span><span class="pp-val">${(radius * 2).toFixed(3)} mm</span></div>
            </div>`;
        }

        html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Position</span></div>
                <div class="pp-row"><span class="pp-key">Mitte X:</span><span class="pp-val">${center.x.toFixed(3)}</span></div>
                <div class="pp-row"><span class="pp-key">Mitte Y:</span><span class="pp-val">${center.y.toFixed(3)}</span></div>
                <div class="pp-row"><span class="pp-key">Min:</span><span class="pp-val">(${bb.minX.toFixed(2)}, ${bb.minY.toFixed(2)})</span></div>
                <div class="pp-row"><span class="pp-key">Max:</span><span class="pp-val">(${bb.maxX.toFixed(2)}, ${bb.maxY.toFixed(2)})</span></div>
            </div>`;

        // CAM-Eigenschaften (editierbar!)
        if (!contour.isReference) {
            const qColors = { 1: '#22c55e', 2: '#3b82f6', 3: '#eab308', 4: '#f97316', 5: '#ef4444' };
            const qNames = { 1: 'Q1 Fein', 2: 'Q2 Standard', 3: 'Q3 Mittel', 4: 'Q4 Grob', 5: 'Q5 Trennschnitt' };
            const currentQ = contour.quality || 2;

            html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">CAM</span></div>
                <div class="pp-row">
                    <span class="pp-key">Layer:</span>
                    <span class="pp-val">${contour.layer || '(Standard)'}</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Modus:</span>
                    <span class="pp-val">${contour.cuttingMode || '—'}</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Qualität:</span>
                    <select class="pp-select" data-prop="quality" data-idx="${idx}">
                        ${[1,2,3,4,5].map(q => `<option value="${q}" ${q === currentQ ? 'selected' : ''}>${qNames[q]}</option>`).join('')}
                    </select>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Kerf:</span>
                    <input type="number" class="pp-input" data-prop="kerfWidth" data-idx="${idx}" value="${(contour.kerfWidth || 0.8).toFixed(2)}" step="0.01" min="0">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Referenz:</span>
                    <span class="pp-val">${contour.isReference ? 'Ja' : 'Nein'}</span>
                </div>
            </div>`;

            // ── B.1 Piercing-Typ ─────────────────────────────────
            if (contour.cuttingMode) {
                const pt = contour.piercingType || 'auto';
                const ptOptions = [
                    { v: 'auto',          l: 'Auto (R923=1)' },
                    { v: 'blind',         l: 'Blind (R923=9)' },
                    { v: 'pierce_linear', l: 'Linear (R923=1)' },
                    { v: 'stationary',    l: 'Stationär (R923=2)' },
                    { v: 'circular',      l: 'Kreis (R923=3)' },
                    { v: 'drilling',      l: 'Bohren (R923=4)' },
                    { v: 'air_start',     l: 'Luft-Start (R923=0)' },
                ];
                html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Anschuss (Piercing)</span></div>
                <div class="pp-row">
                    <span class="pp-key">Typ:</span>
                    <select class="pp-select" data-prop="piercingType" data-idx="${idx}">
                        ${ptOptions.map(o => `<option value="${o.v}" ${o.v === pt ? 'selected' : ''}>${o.l}</option>`).join('')}
                    </select>
                </div>`;

                if (pt === 'stationary') {
                    html += `
                <div class="pp-row">
                    <span class="pp-key">Standzeit:</span>
                    <input type="number" class="pp-input" data-prop="piercingStationaryTime" data-idx="${idx}" value="${(contour.piercingStationaryTime ?? 1.5).toFixed(2)}" step="0.1" min="0">
                    <span class="pp-unit">s</span>
                </div>`;
                }
                if (pt === 'circular') {
                    html += `
                <div class="pp-row">
                    <span class="pp-key">Kreis-R:</span>
                    <input type="number" class="pp-input" data-prop="piercingCircularRadius" data-idx="${idx}" value="${(contour.piercingCircularRadius ?? 2.0).toFixed(2)}" step="0.1" min="0">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Kreis-t:</span>
                    <input type="number" class="pp-input" data-prop="piercingCircularTime" data-idx="${idx}" value="${(contour.piercingCircularTime ?? 2.0).toFixed(2)}" step="0.1" min="0">
                    <span class="pp-unit">s</span>
                </div>`;
                }
                html += `</div>`;

                // ── B.2 Lead-In Parameter ───────────────────────────
                const litOptions = ['arc', 'linear', 'tangent', 'on_geometry'];
                const litLabels = { arc: 'Bogen', linear: 'Linear', tangent: 'Tangential', on_geometry: 'Auf Kontur' };
                const liType = contour.leadInType || 'arc';
                const dynamic = contour.leadInDynamic || false;

                html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">Lead-In</span></div>
                <div class="pp-row">
                    <span class="pp-key">Typ:</span>
                    <select class="pp-select" data-prop="leadInType" data-idx="${idx}">
                        ${litOptions.map(o => `<option value="${o}" ${o === liType ? 'selected' : ''}>${litLabels[o]}</option>`).join('')}
                    </select>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Länge:</span>
                    <input type="number" class="pp-input" data-prop="leadInLength" data-idx="${idx}" value="${(contour.leadInLength || 4).toFixed(1)}" step="0.5" min="0.5">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Radius:</span>
                    <input type="number" class="pp-input" data-prop="leadInRadius" data-idx="${idx}" value="${(contour.leadInRadius || 2).toFixed(1)}" step="0.5" min="0">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Overcut:</span>
                    <input type="number" class="pp-input" data-prop="overcutLength" data-idx="${idx}" value="${(contour.overcutLength ?? 1).toFixed(1)}" step="0.25">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row" title="Dynamic Lead: Passt Lead-L\u00e4nge automatisch an den verf\u00fcgbaren Platz an">
                    <span class="pp-key">Dyn. Lead:</span>
                    <select class="pp-select" data-prop="leadInDynamic" data-idx="${idx}">
                        <option value="false" ${!dynamic ? 'selected' : ''}>Aus</option>
                        <option value="true" ${dynamic ? 'selected' : ''}>An (Auto-Länge)</option>
                    </select>
                </div>`;

                if (dynamic) {
                    html += `
                <div class="pp-row">
                    <span class="pp-key">L min:</span>
                    <input type="number" class="pp-input" data-prop="leadInLengthMin" data-idx="${idx}" value="${(contour.leadInLengthMin ?? 1).toFixed(1)}" step="0.5" min="0.5">
                    <span class="pp-unit">mm</span>
                </div>
                <div class="pp-row">
                    <span class="pp-key">L max:</span>
                    <input type="number" class="pp-input" data-prop="leadInLengthMax" data-idx="${idx}" value="${(contour.leadInLengthMax ?? 15).toFixed(1)}" step="1" min="1">
                    <span class="pp-unit">mm</span>
                </div>`;
                }

                // ── B.3 Flächenklassen (nur für Innen-Konturen) ──────────
                if (contour.cuttingMode === 'hole') {
                    const areaCm2 = typeof contour.getAreaCm2 === 'function' ? contour.getAreaCm2().toFixed(2) : '?';
                    const classApplied = contour.areaClassApplied ? ' ✔' : '';
                    html += `
                <div class="pp-row" style="margin-top:6px">
                    <span class="pp-key">ÜFl: ${areaCm2} cm²${classApplied}</span>
                    <button class="pp-btn" data-action="applyAreaClass" data-idx="${idx}" title="IGEMS Flächenklassen-Lead auto. anwenden" style="font-size:10px;padding:2px 6px">Auto-Lead</button>
                </div>`;
                }

                html += `</div>`;
            }  // end if cuttingMode
        }

        this._content.innerHTML = html;
        this._bindEditEvents();
    }

    /**
     * Mehrere Konturen selektiert → Gemeinsame Eigenschaften
     */
    _renderMultiSelection(selected, allContours) {
        const count = selected.length;
        const closed = selected.filter(c => c.isClosed).length;
        const refs = selected.filter(c => c.isReference).length;

        let totalArea = 0;
        let totalPerimeter = 0;
        for (const c of selected) {
            if (c.isClosed) totalArea += this._getArea(c);
            totalPerimeter += this._getPerimeter(c);
        }

        // Gemeinsame Qualität?
        const qualities = [...new Set(selected.map(c => c.quality || 2))];
        const commonQuality = qualities.length === 1 ? qualities[0] : null;
        const qNames = { 1: 'Q1 Fein', 2: 'Q2 Standard', 3: 'Q3 Mittel', 4: 'Q4 Grob', 5: 'Q5 Trennschnitt' };

        let html = `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">${count} Konturen selektiert</span></div>
            </div>

            <div class="pp-group">
                <div class="pp-row"><span class="pp-key">Geschlossen:</span><span class="pp-val">${closed} / ${count}</span></div>
                <div class="pp-row"><span class="pp-key">Referenz:</span><span class="pp-val">${refs}</span></div>
                <div class="pp-row"><span class="pp-key">Ges. Fläche:</span><span class="pp-val">${totalArea.toFixed(2)} mm²</span></div>
                <div class="pp-row"><span class="pp-key">Ges. Umfang:</span><span class="pp-val">${totalPerimeter.toFixed(2)} mm</span></div>
            </div>`;

        // Gemeinsame Qualität editieren (Batch)
        const nonRef = selected.filter(c => !c.isReference);
        if (nonRef.length > 0) {
            html += `
            <div class="pp-group">
                <div class="pp-row"><span class="pp-label">CAM (Batch)</span></div>
                <div class="pp-row">
                    <span class="pp-key">Qualität:</span>
                    <select class="pp-select" data-prop="quality" data-batch="true">
                        <option value="" ${!commonQuality ? 'selected' : ''}>— Verschieden —</option>
                        ${[1,2,3,4,5].map(q => `<option value="${q}" ${q === commonQuality ? 'selected' : ''}>${qNames[q]}</option>`).join('')}
                    </select>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Kerf:</span>
                    <input type="number" class="pp-input" data-prop="kerfWidth" data-batch="true" value="" placeholder="Verschieden" step="0.01" min="0">
                    <span class="pp-unit">mm</span>
                </div>
            </div>`;
        }

        this._content.innerHTML = html;
        this._bindEditEvents();
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: Edit-Events mit Undo-Support
    // ════════════════════════════════════════════════════════════════

    _bindEditEvents() {
        if (!this._content) return;

        // ── Button-Actions (applyAreaClass) ────────────────────────
        this._content.querySelectorAll('.pp-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const idx = parseInt(e.target.dataset.idx, 10);
                const contour = this.app?.contours?.[idx];
                if (!contour) return;

                if (action === 'applyAreaClass') {
                    const classes = typeof CamContour !== 'undefined'
                        ? CamContour.defaultAreaClasses()
                        : [];
                    const cls = contour.getMatchingAreaClass?.(classes);
                    if (cls) {
                        contour.applyAreaClass(cls);
                        this.app.renderer?.render();
                        this.forceUpdate();
                        this.app.showToast?.(`Flächenklasse „${cls.label}“ angewendet`, 'success');
                    } else {
                        this.app.showToast?.('Keine passende Flächenklasse', 'warning');
                    }
                }
            });
        });

        // Select-Felder (Qualität + String-Properties)
        this._content.querySelectorAll('.pp-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const prop = e.target.dataset.prop;
                const isBatch = e.target.dataset.batch === 'true';
                const rawValue = e.target.value;

                // Typ-Erkennung: Boolean-Selects (leadInDynamic)
                let newValue;
                if (rawValue === 'true')       newValue = true;
                else if (rawValue === 'false') newValue = false;
                else {
                    const asInt = parseInt(rawValue, 10);
                    // String-Properties (leadInType, piercingType) bleiben String
                    newValue = isNaN(asInt) ? rawValue : asInt;
                }
                if (newValue === '' || newValue === undefined) return;

                if (isBatch) {
                    this._batchSetProperty(prop, newValue);
                } else {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    this._setProperty(idx, prop, newValue);
                }
            });
        });

        // Number-Input-Felder (Kerf)
        this._content.querySelectorAll('.pp-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const prop = e.target.dataset.prop;
                const isBatch = e.target.dataset.batch === 'true';
                const newValue = parseFloat(e.target.value);
                if (isNaN(newValue)) return;

                if (isBatch) {
                    this._batchSetProperty(prop, newValue);
                } else {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    this._setProperty(idx, prop, newValue);
                }
            });

            // Prevent canvas shortcuts while typing in property fields
            inp.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });
        });
    }

    /**
     * Einzelne Eigenschaft setzen (mit Undo)
     */
    _setProperty(contourIndex, property, newValue) {
        const contour = this.app?.contours?.[contourIndex];
        if (!contour) return;

        const oldValue = contour[property];
        if (oldValue === newValue) return;

        console.log(`[PropertiesPanel V1.0] ${contour.name}: ${property} ${oldValue} → ${newValue}`);

        const app = this.app;
        const rerender = () => {
            contour.invalidate?.();
            app.renderer?.render();
            app.updateContourPanel?.();
        };

        const cmd = new PropertyChangeCommand(contour, property, newValue, rerender);
        app.undoManager?.execute(cmd);
    }

    /**
     * Eigenschaft für alle selektierten Konturen setzen (Batch, mit Undo)
     */
    _batchSetProperty(property, newValue) {
        const selected = (this.app?.contours || []).filter(c => c.isSelected && !c.isReference);
        if (selected.length === 0) return;

        console.log(`[PropertiesPanel V1.0] Batch: ${property} → ${newValue} für ${selected.length} Konturen`);

        const app = this.app;
        const oldValues = selected.map(c => ({ contour: c, oldValue: c[property] }));

        const doFn = () => {
            selected.forEach(c => { c[property] = newValue; c.invalidate?.(); });
            app.renderer?.render();
            app.updateContourPanel?.();
        };

        const undoFn = () => {
            oldValues.forEach(({ contour, oldValue }) => { contour[property] = oldValue; contour.invalidate?.(); });
            app.renderer?.render();
            app.updateContourPanel?.();
        };

        const cmd = new FunctionCommand(`Batch: ${property} → ${newValue}`, doFn, undoFn);
        app.undoManager?.execute(cmd);
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: Geometrie-Berechnungen
    // ════════════════════════════════════════════════════════════════

    _getArea(contour) {
        if (!contour.isClosed || !contour.points || contour.points.length < 3) return 0;
        if (typeof contour.getArea === 'function') return Math.abs(contour.getArea());
        // Shoelace-Fallback
        return Math.abs(this._shoelaceArea(contour.points));
    }

    _getPerimeter(contour) {
        if (!contour.points || contour.points.length < 2) return 0;
        if (typeof contour.getPerimeter === 'function') return contour.getPerimeter();
        let len = 0;
        const pts = contour.points;
        for (let i = 0; i < pts.length - 1; i++) {
            len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        }
        return len;
    }

    _getBoundingBox(contour) {
        if (!contour.points || contour.points.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of contour.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    _getCenter(contour) {
        if (contour.center) return contour.center;
        const bb = this._getBoundingBox(contour);
        return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    }

    _getRadius(contour) {
        if (contour.radius) return contour.radius;
        // Berechne aus BoundingBox (falls Kreis)
        const bb = this._getBoundingBox(contour);
        return Math.max(bb.width, bb.height) / 2;
    }

    _isCircular(contour) {
        if (!contour.isClosed || !contour.points || contour.points.length < 8) return false;
        const bb = this._getBoundingBox(contour);
        const aspect = bb.width / (bb.height || 0.001);
        return aspect > 0.95 && aspect < 1.05;  // Nahezu quadratische BBox = wahrscheinlich Kreis
    }

    _getTypeLabel(contour) {
        if (contour.isReference) return 'Ref';
        if (!contour.isClosed && contour.cuttingMode === 'slit') return 'Slit';
        if (!contour.isClosed) return 'Offen';
        if (contour.cuttingMode === 'hole') return 'Loch';
        if (contour.cuttingMode === 'disc') return 'Disc';
        return 'Kontur';
    }

    _shoelaceArea(points) {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return area / 2;
    }
}
