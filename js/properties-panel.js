/**
 * CeraCUT Properties Panel V1.2
 * Kontur-Eigenschaften als Kontextmenu-Sektion (Step 4 / CAM)
 * - Generiert editierbare CAM-Felder (Quality, Piercing, Lead-In, Kerf)
 * - Bindet Events mit Undo-Support (PropertyChangeCommand)
 * - Modi: 1 Kontur → Detailansicht / Mehrere → Batch-Editing
 * Refactored: 2026-03-13 (Sidebar → Kontextmenu)
 * Build: 20260313-ctxmenu
 */

class PropertiesPanel {

    constructor(options = {}) {
        this.app = options.app;
        console.log('[PropertiesPanel V1.1] Initialisiert (Kontextmenu-Modus)');
    }

    // ════════════════════════════════════════════════════════════════
    // OEFFENTLICHE API
    // ════════════════════════════════════════════════════════════════

    /**
     * CAM-Properties HTML fuer Kontextmenu generieren.
     * Gibt '' zurueck wenn nichts anzuzeigen (keine Selektion, kein CAM-Step).
     */
    generateContextMenuHTML() {
        const app = this.app;
        if (!app) return '';

        const contours = app.contours || [];
        const selected = contours.filter(c => c.isSelected && !c.isReference);
        if (selected.length === 0) return '';

        if (selected.length === 1) {
            return this._singleCAMHTML(selected[0], contours);
        }
        return this._batchCAMHTML(selected);
    }

    /**
     * Edit-Events in gegebenem Container binden.
     * Aufrufen NACH innerHTML-Injection.
     */
    bindEvents(container) {
        if (!container) return;

        // ── Area-Class Buttons ──
        container.querySelectorAll('.pp-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.dataset.action;
                const idx = parseInt(e.target.dataset.idx, 10);
                const contour = this.app?.contours?.[idx];
                if (!contour) return;

                if (action === 'applyAreaClass') {
                    const classes = typeof CamContour !== 'undefined'
                        ? CamContour.defaultAreaClasses() : [];
                    const cls = contour.getMatchingAreaClass?.(classes);
                    if (cls) {
                        contour.applyAreaClass(cls);
                        this.app.renderer?.render();
                        this.app.showToast?.(`Flaechenklasse "${cls.label}" angewendet`, 'success');
                    } else {
                        this.app.showToast?.('Keine passende Flaechenklasse', 'warning');
                    }
                }
            });
        });

        // ── Select-Felder (Quality, PiercingType, LeadInType, Dynamic) ──
        container.querySelectorAll('.pp-select').forEach(sel => {
            sel.addEventListener('click', e => e.stopPropagation());
            sel.addEventListener('mousedown', e => e.stopPropagation());
            sel.addEventListener('change', (e) => {
                const prop = e.target.dataset.prop;
                const isBatch = e.target.dataset.batch === 'true';
                const rawValue = e.target.value;

                let newValue;
                if (rawValue === 'true')       newValue = true;
                else if (rawValue === 'false') newValue = false;
                else {
                    const asInt = parseInt(rawValue, 10);
                    newValue = isNaN(asInt) ? rawValue : asInt;
                }
                if (newValue === '' || newValue === undefined) return;

                if (isBatch) this._batchSetProperty(prop, newValue);
                else this._setProperty(parseInt(e.target.dataset.idx, 10), prop, newValue);
            });
        });

        // ── Number-Inputs (Kerf, Lead-Laenge, Radius, etc.) ──
        container.querySelectorAll('.pp-input').forEach(inp => {
            inp.addEventListener('click', e => e.stopPropagation());
            inp.addEventListener('mousedown', e => e.stopPropagation());
            inp.addEventListener('change', (e) => {
                const prop = e.target.dataset.prop;
                const isBatch = e.target.dataset.batch === 'true';
                const newValue = parseFloat(e.target.value);
                if (isNaN(newValue)) return;

                if (isBatch) this._batchSetProperty(prop, newValue);
                else this._setProperty(parseInt(e.target.dataset.idx, 10), prop, newValue);
            });
            inp.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.target.blur();
            });
        });
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: HTML-Generierung
    // ════════════════════════════════════════════════════════════════

    /**
     * Einzelne Kontur → Detaillierte CAM-Eigenschaften
     */
    _singleCAMHTML(contour, allContours) {
        const idx = allContours.indexOf(contour);
        const qNames = { 1: 'Q1 Fein', 2: 'Q2 Standard', 3: 'Q3 Mittel', 4: 'Q4 Grob', 5: 'Q5 Trennschnitt' };
        const currentQ = contour.quality || 2;
        const type = this._getTypeLabel(contour);

        let html = `<div class="context-menu-divider"></div>`;
        html += `<div class="ctx-cam-section">`;
        html += `<div class="pp-group">
            <div class="pp-row"><span class="pp-label">CAM: ${contour.name || 'K' + (idx + 1)}</span><span class="pp-type-badge">${type}</span></div>
        </div>`;

        // ── Quality + Kerf ──
        html += `<div class="pp-group">
            <div class="pp-row">
                <span class="pp-key">Qualitaet:</span>
                <select class="pp-select" data-prop="quality" data-idx="${idx}">
                    ${[1,2,3,4,5].map(q => `<option value="${q}" ${q === currentQ ? 'selected' : ''}>${qNames[q]}</option>`).join('')}
                </select>
            </div>
            <div class="pp-row">
                <span class="pp-key">Kerf:</span>
                <input type="number" class="pp-input" data-prop="kerfWidth" data-idx="${idx}" value="${(contour.kerfWidth || 0.8).toFixed(2)}" step="0.01" min="0">
                <span class="pp-unit">mm</span>
            </div>
        </div>`;

        // ── Piercing (nur wenn cuttingMode gesetzt) ──
        if (contour.cuttingMode) {
            const pt = contour.piercingType || 'auto';
            const ptOptions = [
                { v: 'auto',          l: 'Auto (R923=1)' },
                { v: 'blind',         l: 'Blind (R923=9)' },
                { v: 'pierce_linear', l: 'Linear (R923=1)' },
                { v: 'stationary',    l: 'Stationaer (R923=2)' },
                { v: 'circular',      l: 'Kreis (R923=3)' },
                { v: 'drilling',      l: 'Bohren (R923=4)' },
                { v: 'air_start',     l: 'Luft-Start (R923=0)' },
            ];

            html += `<div class="pp-group">
                <div class="pp-row"><span class="pp-label">Piercing</span></div>
                <div class="pp-row">
                    <span class="pp-key">Typ:</span>
                    <select class="pp-select" data-prop="piercingType" data-idx="${idx}">
                        ${ptOptions.map(o => `<option value="${o.v}" ${o.v === pt ? 'selected' : ''}>${o.l}</option>`).join('')}
                    </select>
                </div>`;

            if (pt === 'stationary') {
                html += `<div class="pp-row">
                    <span class="pp-key">Standzeit:</span>
                    <input type="number" class="pp-input" data-prop="piercingStationaryTime" data-idx="${idx}" value="${(contour.piercingStationaryTime ?? 1.5).toFixed(2)}" step="0.1" min="0">
                    <span class="pp-unit">s</span>
                </div>`;
            }
            if (pt === 'circular') {
                html += `<div class="pp-row">
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

            // ── Lead-In ──
            const litOptions = ['arc', 'linear', 'tangent', 'on_geometry'];
            const litLabels = { arc: 'Bogen', linear: 'Linear', tangent: 'Tangential', on_geometry: 'Auf Kontur' };
            const liType = contour.leadInType || 'arc';
            const dynamic = contour.leadInDynamic || false;

            html += `<div class="pp-group">
                <div class="pp-row"><span class="pp-label">Lead-In</span></div>
                <div class="pp-row">
                    <span class="pp-key">Typ:</span>
                    <select class="pp-select" data-prop="leadInType" data-idx="${idx}">
                        ${litOptions.map(o => `<option value="${o}" ${o === liType ? 'selected' : ''}>${litLabels[o]}</option>`).join('')}
                    </select>
                </div>
                <div class="pp-row">
                    <span class="pp-key">Laenge:</span>
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
                <div class="pp-row">
                    <span class="pp-key">Dyn. Lead:</span>
                    <select class="pp-select" data-prop="leadInDynamic" data-idx="${idx}">
                        <option value="false" ${!dynamic ? 'selected' : ''}>Aus</option>
                        <option value="true" ${dynamic ? 'selected' : ''}>An (Auto)</option>
                    </select>
                </div>`;

            if (dynamic) {
                html += `<div class="pp-row">
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

            // Area Class (nur fuer holes)
            if (contour.cuttingMode === 'hole') {
                const areaCm2 = typeof contour.getAreaCm2 === 'function' ? contour.getAreaCm2().toFixed(2) : '?';
                const classApplied = contour.areaClassApplied ? ' \u2714' : '';
                html += `<div class="pp-row" style="margin-top:4px">
                    <span class="pp-key">Fl: ${areaCm2} cm\u00B2${classApplied}</span>
                    <button class="pp-btn" data-action="applyAreaClass" data-idx="${idx}" title="IGEMS Flaechenklassen-Lead anwenden">Auto-Lead</button>
                </div>`;
            }

            html += `</div>`; // close lead-in group
        }

        html += `</div>`; // close ctx-cam-section
        return html;
    }

    /**
     * Mehrere Konturen → Batch-Editing (Quality + Kerf)
     */
    _batchCAMHTML(selected) {
        const qNames = { 1: 'Q1 Fein', 2: 'Q2 Standard', 3: 'Q3 Mittel', 4: 'Q4 Grob', 5: 'Q5 Trennschnitt' };
        const qualities = [...new Set(selected.map(c => c.quality || 2))];
        const commonQ = qualities.length === 1 ? qualities[0] : null;

        let html = `<div class="context-menu-divider"></div>`;
        html += `<div class="ctx-cam-section">`;
        html += `<div class="pp-group">
            <div class="pp-row"><span class="pp-label">CAM (${selected.length} Konturen)</span></div>
        </div>`;
        html += `<div class="pp-group">
            <div class="pp-row">
                <span class="pp-key">Qualitaet:</span>
                <select class="pp-select" data-prop="quality" data-batch="true">
                    <option value="" ${!commonQ ? 'selected' : ''}>— Verschieden —</option>
                    ${[1,2,3,4,5].map(q => `<option value="${q}" ${q === commonQ ? 'selected' : ''}>${qNames[q]}</option>`).join('')}
                </select>
            </div>
            <div class="pp-row">
                <span class="pp-key">Kerf:</span>
                <input type="number" class="pp-input" data-prop="kerfWidth" data-batch="true" value="" placeholder="Verschieden" step="0.01" min="0">
                <span class="pp-unit">mm</span>
            </div>
        </div>`;
        html += `</div>`;
        return html;
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: Property-Aenderungen mit Undo
    // ════════════════════════════════════════════════════════════════

    // Lead-Properties die den leadManualOverride-Flag auslösen
    static LEAD_PROPERTIES = new Set([
        'leadInType', 'leadInLength', 'leadInRadius', 'leadInAngle',
        'leadOutLength', 'overcutLength', 'piercingType',
        'piercingStationaryTime', 'piercingCircularRadius', 'piercingCircularTime',
        'leadInDynamic', 'leadInLengthMin', 'leadInLengthMax'
    ]);

    _setProperty(contourIndex, property, newValue) {
        const contour = this.app?.contours?.[contourIndex];
        if (!contour) return;
        if (contour[property] === newValue) return;

        console.log(`[PropertiesPanel V1.2] ${contour.name}: ${property} ${contour[property]} \u2192 ${newValue}`);

        // V5.0: Lead-Änderung im Properties-Panel → Manual Override setzen
        if (PropertiesPanel.LEAD_PROPERTIES.has(property)) {
            contour.leadManualOverride = true;
        }

        const app = this.app;
        const rerender = () => {
            contour.invalidate?.();
            if (typeof ModificationTool !== 'undefined') {
                ModificationTool.invalidateCache?.(contour);
            }
            app.renderer?.render();
        };

        const cmd = new PropertyChangeCommand(contour, property, newValue, rerender);
        app.undoManager?.execute(cmd);
    }

    _batchSetProperty(property, newValue) {
        const selected = (this.app?.contours || []).filter(c => c.isSelected && !c.isReference);
        if (selected.length === 0) return;

        console.log(`[PropertiesPanel V1.1] Batch: ${property} \u2192 ${newValue} (${selected.length} Konturen)`);

        const app = this.app;
        const oldValues = selected.map(c => ({ contour: c, oldValue: c[property] }));

        const doFn = () => {
            selected.forEach(c => { c[property] = newValue; c.invalidate?.(); });
            app.renderer?.render();
        };
        const undoFn = () => {
            oldValues.forEach(({ contour, oldValue }) => { contour[property] = oldValue; contour.invalidate?.(); });
            app.renderer?.render();
        };

        const cmd = new FunctionCommand(`Batch: ${property} \u2192 ${newValue}`, doFn, undoFn);
        app.undoManager?.execute(cmd);
    }

    // ════════════════════════════════════════════════════════════════
    // PRIVATE: Hilfs-Funktionen
    // ════════════════════════════════════════════════════════════════

    _getTypeLabel(contour) {
        if (contour.isReference) return 'Ref';
        if (!contour.isClosed && contour.cuttingMode === 'slit') return 'Slit';
        if (!contour.isClosed) return 'Offen';
        if (contour.cuttingMode === 'hole') return 'Loch';
        if (contour.cuttingMode === 'disc') return 'Disc';
        return 'Kontur';
    }
}
