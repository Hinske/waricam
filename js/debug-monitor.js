/**
 * WARICAM Debug Monitor V1.0
 * ════════════════════════════════════════════════════════════
 * Automatisches Fehler-Monitoring für CeraCAM / WARICAM
 *
 * Features:
 *   - Globaler Error-Catcher (window.onerror + unhandledrejection)
 *   - Automatische Zuordnung zu bekannten WARICAM-Fallen
 *   - Session-Log in sessionStorage (letzte 200 Einträge)
 *   - Action-Tracker: Letzte 50 User-Aktionen protokolliert
 *   - Performance-Monitor: Frames die >16ms dauern
 *   - Debug-Overlay: Strg+Shift+D → öffnet/schließt Panel
 *   - JSON-Export für Claude Code Analyse
 *   - Kein Framework, kein Build-Tool — reines Vanilla JS
 *
 * Aktivierung: Als ERSTES Script in index.html laden
 *   <script src="js/debug-monitor.js?v=20260219-dm10"></script>
 *
 * Claude Code Workflow:
 *   1. Strg+Shift+D → "Export JSON"
 *   2. Datei an Claude Code übergeben
 *   3. claude "Analysiere diesen WARICAM Debug-Log und schlage Fixes vor"
 *
 * Build: 20260219-dm10
 */

(function() {
    'use strict';

    console.time('[DebugMonitor V1.0] Init');
    console.log('%c[DebugMonitor V1.0] Startet — Strg+Shift+D für Overlay', 'color: #ff9800; font-weight: bold');

    // ═══════════════════════════════════════════════════════
    // BEKANNTE WARICAM-FALLEN (aus system-anweisung V16)
    // ═══════════════════════════════════════════════════════

    const KNOWN_TRAPS = [
        {
            id: 'duplicate-class',
            pattern: /Identifier '(.+)' has already been declared/i,
            label: '🔴 Klassen-Duplikat',
            hint: 'Klasse nur in EINER Datei definieren! Grep nach dem Klassenname in allen 27 JS-Dateien.',
            severity: 'critical'
        },
        {
            id: 'rubberband-data',
            pattern: /Cannot read propert(?:y|ies) of undefined.*data/i,
            label: '🔴 RubberBand ohne data-Wrapper',
            hint: 'Format muss sein: { type: "line", data: { start, end } } — der data-Wrapper fehlt!',
            severity: 'critical'
        },
        {
            id: 'browser-cache',
            pattern: /SyntaxError.*unexpected token/i,
            label: '🟡 Browser-Cache veraltet',
            hint: 'Cache-Busting: ?v= Parameter in index.html hochzählen. Dann Hard-Reload (Strg+Shift+R).',
            severity: 'warning'
        },
        {
            id: 'canvas-arc-yflip',
            pattern: /arc.*scale.*-1|scale.*-1.*arc/i,
            label: '🟡 Canvas Arc Y-Flip',
            hint: 'Bei scale(1,-1): ctx.arc(cx, cy, r, -sa, -ea, false) — negative Winkel wegen Y-Spiegelung!',
            severity: 'warning'
        },
        {
            id: 'lazy-patch-order',
            pattern: /is not a constructor|Cannot read.*prototype/i,
            label: '🔴 Lazy-Patch Reihenfolge',
            hint: 'advanced-tools.js → drawing-tools-ext.js → text-tool.js MÜSSEN nach tool-manager.js geladen werden!',
            severity: 'critical'
        },
        {
            id: 'undo-missing',
            pattern: /\[UndoManager/i,
            label: '✅ UndoManager aktiv',
            hint: 'UndoManager ist registriert — gut.',
            severity: 'info',
            isPositive: true
        },
        {
            id: 'property-no-render',
            pattern: /property.*=.*value|value.*property/i,
            label: '🟡 Property ohne Render?',
            hint: '_refreshAfterUndoRedo() nach undo/redo aufrufen!',
            severity: 'warning'
        },
        {
            id: 'font-cors',
            pattern: /opentype|XHR.*font|font.*blocked|CORS.*font/i,
            label: '🟡 Font-Loading blockiert',
            hint: 'file:// blockiert XHR → FileReader API + File-Picker verwenden statt opentype.load(url).',
            severity: 'warning'
        },
        {
            id: 'flyout-not-closing',
            pattern: /flyout|document.*click/i,
            label: '🟡 Flyout schließt nicht',
            hint: 'Document-Click-Handler fehlt: document.addEventListener("click", closeFlyouts).',
            severity: 'warning'
        },
        {
            id: 'grip-click-bleed',
            pattern: /grip.*drag|drag.*grip|gripDrag/i,
            label: '🟡 Grip-Drag Click-Bleed',
            hint: 'gripDragJustEnded Guard fehlt — mouseup nach Grip-Drag hebt Selektion auf.',
            severity: 'warning'
        },
        {
            id: 'single-char-shortcut',
            pattern: /shortcut.*input|input.*shortcut/i,
            label: '🟡 Single-Char-Shortcut fängt Multi-Char ab',
            hint: 'Bei nicht-leerem cmd-input → alle Tasten dorthin routen, nicht als Shortcut behandeln.',
            severity: 'warning'
        },
        {
            id: 'cross-layer-chaining',
            pattern: /chaining|_findGridMatch|layer.*chain|chain.*layer/i,
            label: '🟡 Cross-Layer Chaining',
            hint: 'Layer-Filter in _findGridMatch() prüfen (V3.3 Fix).',
            severity: 'warning'
        },
        {
            id: 'data-tool-mismatch',
            pattern: /data-tool|ribbon.*tool|tool.*ribbon/i,
            label: '🟡 Ribbon data-tool Attribut',
            hint: 'data-tool muss exakt dem registrierten Shortcut in tool-manager.js entsprechen!',
            severity: 'warning'
        }
    ];

    // ═══════════════════════════════════════════════════════
    // SESSION LOG MANAGEMENT
    // ═══════════════════════════════════════════════════════

    const SESSION_KEY = 'waricam_debug_log';
    const MAX_LOG_ENTRIES = 200;
    const MAX_ACTION_ENTRIES = 50;

    let _sessionLog = [];
    let _actionLog = [];
    let _perfWarnings = [];
    let _overlayVisible = false;

    function _loadFromStorage() {
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                _sessionLog = parsed.errors || [];
                _actionLog = parsed.actions || [];
                _perfWarnings = parsed.perf || [];
            }
        } catch(e) {
            _sessionLog = [];
            _actionLog = [];
        }
    }

    function _saveToStorage() {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                errors: _sessionLog.slice(-MAX_LOG_ENTRIES),
                actions: _actionLog.slice(-MAX_ACTION_ENTRIES),
                perf: _perfWarnings.slice(-50),
                lastUpdate: new Date().toISOString(),
                buildVersion: '5.3',
                buildDate: '20260219'
            }));
        } catch(e) {
            // sessionStorage voll — alten Log löschen und neu starten
            sessionStorage.removeItem(SESSION_KEY);
        }
    }

    function _matchKnownTrap(message, stack) {
        const combined = (message || '') + (stack || '');
        for (const trap of KNOWN_TRAPS) {
            if (trap.pattern.test(combined)) {
                return trap;
            }
        }
        return null;
    }

    function _logError(type, message, source, line, col, stack, extra) {
        console.time('[DebugMonitor V1.0] Error-Verarbeitung');

        const trap = _matchKnownTrap(message, stack);
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            type,
            message: String(message || 'Unbekannter Fehler'),
            source: source || '',
            line: line || 0,
            col: col || 0,
            stack: stack || '',
            trap: trap ? { id: trap.id, label: trap.label, hint: trap.hint, severity: trap.severity } : null,
            lastActions: _actionLog.slice(-5),
            extra: extra || null
        };

        _sessionLog.push(entry);
        if (_sessionLog.length > MAX_LOG_ENTRIES) {
            _sessionLog = _sessionLog.slice(-MAX_LOG_ENTRIES);
        }

        _saveToStorage();

        // Farb-codiertes Console-Log
        const severity = trap?.severity || 'error';
        const colors = {
            critical: 'background: #c00; color: white; padding: 2px 6px; border-radius: 2px',
            error:    'background: #900; color: white; padding: 2px 6px; border-radius: 2px',
            warning:  'background: #c60; color: white; padding: 2px 6px; border-radius: 2px',
            info:     'background: #060; color: white; padding: 2px 6px; border-radius: 2px'
        };

        if (trap && !trap.isPositive) {
            console.group('%c' + trap.label + ' ' + message, colors[severity]);
            console.log('%c💡 Hinweis:', 'color: #ffaa00; font-weight: bold', trap.hint);
            if (source) console.log(`📍 ${source}:${line}`);
            if (stack) console.log('Stack:', stack.split('\n').slice(0,4).join('\n'));
            console.groupEnd();
        } else if (!trap) {
            console.group('%c🔴 Unbekannter Fehler: ' + message, colors.error);
            if (source) console.log(`📍 ${source}:${line}`);
            if (stack) console.log('Stack:', stack.split('\n').slice(0,4).join('\n'));
            console.groupEnd();
        }

        // Overlay aktualisieren falls offen
        if (_overlayVisible) {
            _updateOverlay();
        }

        console.timeEnd('[DebugMonitor V1.0] Error-Verarbeitung');
    }

    // ═══════════════════════════════════════════════════════
    // ACTION TRACKER
    // ═══════════════════════════════════════════════════════

    function _trackAction(action) {
        _actionLog.push({
            timestamp: new Date().toISOString(),
            action
        });
        if (_actionLog.length > MAX_ACTION_ENTRIES) {
            _actionLog = _actionLog.slice(-MAX_ACTION_ENTRIES);
        }
        // Kein Storage-Save bei jeder Aktion (Performance) — nur bei Errors
    }

    // User-Aktionen tracken
    function _setupActionTracking() {
        // Mausklicks auf wichtige Elemente
        document.addEventListener('click', (e) => {
            const el = e.target;
            const tag = el.tagName;
            const id = el.id ? '#' + el.id : '';
            const cls = el.className && typeof el.className === 'string'
                ? '.' + el.className.split(' ').filter(c => c && c.length < 30).slice(0,2).join('.')
                : '';
            const tool = el.dataset?.tool || el.dataset?.ribbon || '';
            const label = el.textContent?.trim().slice(0,30) || '';

            _trackAction(`click ${tag}${id}${cls}${tool ? ' [tool:' + tool + ']' : ''}${label ? ' "' + label + '"' : ''}`);
        }, true);

        // Tastatur-Shortcuts
        document.addEventListener('keydown', (e) => {
            if (['Shift','Control','Alt','Meta'].includes(e.key)) return;
            const mod = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '');
            _trackAction(`key ${mod}${e.key}`);
        }, true);

        // DXF Datei-Drop/-Öffnen
        document.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files?.length) {
                _trackAction(`drop ${files.length} Datei(en): ${Array.from(files).map(f => f.name).join(', ')}`);
            }
        }, true);

        console.log('[DebugMonitor V1.0] Action-Tracking aktiv');
    }

    // ═══════════════════════════════════════════════════════
    // PERFORMANCE MONITOR
    // ═══════════════════════════════════════════════════════

    function _setupPerformanceMonitor() {
        let _lastFrameTime = performance.now();
        let _frameDropCount = 0;
        let _frameCheckActive = true;

        function _checkFrame(now) {
            if (!_frameCheckActive) return;

            const delta = now - _lastFrameTime;
            _lastFrameTime = now;

            // Frame >50ms = potentieller Lag (3× 16ms Schwelle)
            if (delta > 50 && delta < 5000) {
                _frameDropCount++;

                // Nur erste 20 Frame-Drops loggen (danach nur zählen)
                if (_frameDropCount <= 20 || _frameDropCount % 50 === 0) {
                    const warn = {
                        timestamp: new Date().toISOString(),
                        deltaMs: Math.round(delta),
                        count: _frameDropCount
                    };
                    _perfWarnings.push(warn);

                    if (_frameDropCount <= 5) {
                        console.warn(`[DebugMonitor V1.0] 🐢 Frame-Drop: ${Math.round(delta)}ms (Schwelle: 50ms)`);
                    }
                }
            }

            requestAnimationFrame(_checkFrame);
        }

        requestAnimationFrame(_checkFrame);

        // Perf-Zusammenfassung alle 30 Sekunden (wenn Drops vorhanden)
        setInterval(() => {
            if (_frameDropCount > 0 && _frameDropCount % 10 === 0) {
                console.warn(`[DebugMonitor V1.0] Performance: ${_frameDropCount} Frame-Drops seit Session-Start`);
            }
        }, 30000);

        console.log('[DebugMonitor V1.0] Performance-Monitor aktiv (Schwelle: 50ms)');
    }

    // ═══════════════════════════════════════════════════════
    // GLOBALE ERROR-HANDLER
    // ═══════════════════════════════════════════════════════

    function _setupErrorHandlers() {
        // Synchrone Fehler
        const _origOnerror = window.onerror;
        window.onerror = function(message, source, line, col, error) {
            _logError('js-error', message, source, line, col, error?.stack);
            if (_origOnerror) return _origOnerror.apply(this, arguments);
            return false; // Nicht supprimieren — Browser zeigt weiterhin Fehler
        };

        // Promise-Fehler (async/await ohne catch)
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const msg = reason?.message || String(reason) || 'Unbehandelte Promise-Ablehnung';
            const stack = reason?.stack || '';
            _logError('promise-rejection', msg, 'Promise', 0, 0, stack);
        });

        // console.error überwachen (für interne WARICAM Fehler die console.error nutzen)
        const _origError = console.error;
        console.error = function(...args) {
            _origError.apply(console, args);
            const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a).slice(0,200) : String(a)).join(' ');
            // Nur echte Fehler tracken, nicht Debug-Output
            if (msg.length > 3 && !msg.includes('[DebugMonitor')) {
                _logError('console-error', msg, 'console.error', 0, 0, '');
            }
        };

        console.log('[DebugMonitor V1.0] Error-Handler registriert (onerror + unhandledrejection + console.error)');
    }

    // ═══════════════════════════════════════════════════════
    // DEBUG OVERLAY UI
    // ═══════════════════════════════════════════════════════

    function _createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'waricam-debug-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 520px;
            max-height: 80vh;
            background: #1a1a1a;
            color: #e0e0e0;
            border: 1px solid #ff9800;
            border-radius: 4px;
            font-family: Consolas, monospace;
            font-size: 11px;
            z-index: 999999;
            box-shadow: 0 4px 24px rgba(0,0,0,0.7);
            display: none;
            flex-direction: column;
            overflow: hidden;
        `;

        overlay.innerHTML = `
            <div id="wdm-header" style="
                background: #2a1a00;
                border-bottom: 1px solid #ff9800;
                padding: 6px 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: move;
                user-select: none;
            ">
                <span style="color: #ff9800; font-weight: bold;">🔍 WARICAM Debug Monitor V1.0</span>
                <div style="display: flex; gap: 6px;">
                    <button id="wdm-export" style="background:#004499;color:#fff;border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:10px;">📥 Export JSON</button>
                    <button id="wdm-clear" style="background:#440000;color:#fff;border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:10px;">🗑 Löschen</button>
                    <button id="wdm-close" style="background:#333;color:#fff;border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:10px;">✕</button>
                </div>
            </div>
            <div id="wdm-tabs" style="display:flex;border-bottom:1px solid #333;">
                <button class="wdm-tab active" data-tab="errors" style="flex:1;padding:4px;background:#222;border:none;color:#e0e0e0;cursor:pointer;font-size:10px;border-bottom:2px solid #ff9800;">Fehler</button>
                <button class="wdm-tab" data-tab="actions" style="flex:1;padding:4px;background:#1a1a1a;border:none;color:#888;cursor:pointer;font-size:10px;">Aktionen</button>
                <button class="wdm-tab" data-tab="perf" style="flex:1;padding:4px;background:#1a1a1a;border:none;color:#888;cursor:pointer;font-size:10px;">Performance</button>
                <button class="wdm-tab" data-tab="traps" style="flex:1;padding:4px;background:#1a1a1a;border:none;color:#888;cursor:pointer;font-size:10px;">Fallen (${KNOWN_TRAPS.filter(t=>!t.isPositive).length})</button>
            </div>
            <div id="wdm-content" style="overflow-y:auto;flex:1;max-height:calc(80vh - 80px);"></div>
            <div id="wdm-footer" style="background:#111;padding:4px 10px;font-size:10px;color:#666;border-top:1px solid #333;">
                Strg+Shift+D zum Schließen · Letzte Aktualisierung: —
            </div>
        `;

        document.body.appendChild(overlay);

        // Tab-Switching
        let _activeTab = 'errors';
        overlay.querySelectorAll('.wdm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.wdm-tab').forEach(t => {
                    t.style.background = '#1a1a1a';
                    t.style.color = '#888';
                    t.style.borderBottom = 'none';
                });
                tab.style.background = '#222';
                tab.style.color = '#e0e0e0';
                tab.style.borderBottom = '2px solid #ff9800';
                _activeTab = tab.dataset.tab;
                _renderTab(_activeTab);
            });
        });

        // Buttons
        document.getElementById('wdm-close').addEventListener('click', () => _toggleOverlay());
        document.getElementById('wdm-clear').addEventListener('click', () => {
            _sessionLog = [];
            _actionLog = [];
            _perfWarnings = [];
            sessionStorage.removeItem(SESSION_KEY);
            _renderTab(_activeTab);
            console.log('[DebugMonitor V1.0] Log geleert');
        });
        document.getElementById('wdm-export').addEventListener('click', () => _exportJSON());

        // Draggable Header
        _makeDraggable(overlay, document.getElementById('wdm-header'));

        // Render-Funktion speichern
        overlay._renderTab = _renderTab;
        overlay._activeTab = () => _activeTab;

        function _renderTab(tab) {
            const content = document.getElementById('wdm-content');
            const footer = document.getElementById('wdm-footer');

            footer.textContent = `Strg+Shift+D zum Schließen · Aktualisiert: ${new Date().toLocaleTimeString('de-DE')}`;

            if (tab === 'errors') {
                if (_sessionLog.length === 0) {
                    content.innerHTML = '<div style="padding:20px;text-align:center;color:#0a0;">✅ Keine Fehler in dieser Session!</div>';
                    return;
                }
                const entries = [..._sessionLog].reverse().slice(0, 50);
                content.innerHTML = entries.map(e => {
                    const colors = { critical: '#ff4444', error: '#ff6666', warning: '#ffaa00', info: '#66ff66' };
                    const severity = e.trap?.severity || 'error';
                    const color = colors[severity] || '#ff6666';
                    return `
                        <div style="border-bottom:1px solid #2a2a2a;padding:6px 10px;">
                            <div style="color:${color};font-weight:bold;">${e.trap?.label || '🔴 ' + e.type}</div>
                            <div style="color:#ccc;margin-top:2px;word-break:break-all;">${_esc(e.message.slice(0,200))}</div>
                            ${e.trap?.hint ? `<div style="color:#ffaa00;margin-top:3px;font-size:10px;">💡 ${_esc(e.trap.hint)}</div>` : ''}
                            <div style="color:#555;margin-top:2px;font-size:10px;">${e.source ? e.source.split('/').pop() + ':' + e.line : ''} · ${new Date(e.timestamp).toLocaleTimeString('de-DE')}</div>
                        </div>
                    `;
                }).join('');
            }
            else if (tab === 'actions') {
                const actions = [..._actionLog].reverse().slice(0, 50);
                if (actions.length === 0) {
                    content.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Noch keine Aktionen</div>';
                    return;
                }
                content.innerHTML = actions.map(a => `
                    <div style="border-bottom:1px solid #1a1a1a;padding:3px 10px;color:#aaa;font-size:10px;">
                        <span style="color:#555;">${new Date(a.timestamp).toLocaleTimeString('de-DE')}</span>
                        &nbsp;${_esc(a.action)}
                    </div>
                `).join('');
            }
            else if (tab === 'perf') {
                const drops = _perfWarnings.slice(-30);
                if (drops.length === 0) {
                    content.innerHTML = '<div style="padding:20px;text-align:center;color:#0a0;">✅ Keine Frame-Drops (&lt;50ms Schwelle)!</div>';
                    return;
                }
                const total = drops.reduce((s, w) => s + w.deltaMs, 0);
                content.innerHTML = `
                    <div style="padding:8px 10px;color:#ffaa00;">⚠ ${drops.length} Frame-Drops · Ø ${Math.round(total/drops.length)}ms</div>
                    ${drops.reverse().map(w => `
                        <div style="border-bottom:1px solid #1a1a1a;padding:3px 10px;color:#aaa;font-size:10px;">
                            <span style="color:${w.deltaMs > 100 ? '#ff4444' : '#ffaa00'};">${w.deltaMs}ms</span>
                            &nbsp;·&nbsp;
                            <span style="color:#555;">${new Date(w.timestamp).toLocaleTimeString('de-DE')}</span>
                            &nbsp;·&nbsp;#${w.count}
                        </div>
                    `).join('')}
                `;
            }
            else if (tab === 'traps') {
                const activeFalls = KNOWN_TRAPS.filter(t => !t.isPositive);
                const hitIds = new Set(_sessionLog.map(e => e.trap?.id).filter(Boolean));
                content.innerHTML = activeFalls.map(trap => {
                    const hit = hitIds.has(trap.id);
                    const hitCount = _sessionLog.filter(e => e.trap?.id === trap.id).length;
                    const bg = hit ? 'background: #1a0000;' : '';
                    return `
                        <div style="border-bottom:1px solid #2a2a2a;padding:6px 10px;${bg}">
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:${hit ? '#ff4444' : '#666'};font-weight:${hit ? 'bold' : 'normal'};">${trap.label}</span>
                                ${hit ? `<span style="background:#600;color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;">${hitCount}× getroffen!</span>` : '<span style="color:#333;font-size:10px;">— nicht getroffen</span>'}
                            </div>
                            <div style="color:#777;font-size:10px;margin-top:2px;">💡 ${_esc(trap.hint)}</div>
                        </div>
                    `;
                }).join('');
            }
        }

        return { overlay, renderTab: _renderTab, getActiveTab: () => _activeTab };
    }

    function _esc(str) {
        return String(str)
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
    }

    function _makeDraggable(el, handle) {
        let startX, startY, startLeft, startTop;
        handle.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            el.style.right = 'auto';
            el.style.left = startLeft + 'px';
            el.style.top = startTop + 'px';

            function onMove(e) {
                el.style.left = (startLeft + e.clientX - startX) + 'px';
                el.style.top = (startTop + e.clientY - startY) + 'px';
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    let _overlayRef = null;

    function _toggleOverlay() {
        if (!_overlayRef) {
            _overlayRef = _createOverlay();
        }
        const el = document.getElementById('waricam-debug-overlay');
        _overlayVisible = !_overlayVisible;
        el.style.display = _overlayVisible ? 'flex' : 'none';
        if (_overlayVisible) {
            _overlayRef.renderTab(_overlayRef.getActiveTab());
        }
        console.log(`[DebugMonitor V1.0] Overlay ${_overlayVisible ? 'geöffnet' : 'geschlossen'}`);
    }

    function _updateOverlay() {
        if (_overlayRef && _overlayVisible) {
            _overlayRef.renderTab(_overlayRef.getActiveTab());
        }
    }

    // ═══════════════════════════════════════════════════════
    // JSON EXPORT (für Claude Code)
    // ═══════════════════════════════════════════════════════

    function _exportJSON() {
        console.time('[DebugMonitor V1.0] JSON-Export');

        const data = {
            meta: {
                exportTime: new Date().toISOString(),
                sessionStart: _sessionLog[0]?.timestamp || new Date().toISOString(),
                buildVersion: '5.3',
                buildDate: '20260219',
                totalErrors: _sessionLog.length,
                totalActions: _actionLog.length,
                totalPerfWarnings: _perfWarnings.length
            },
            summary: {
                criticalErrors: _sessionLog.filter(e => e.trap?.severity === 'critical').length,
                warnings: _sessionLog.filter(e => e.trap?.severity === 'warning').length,
                unknownErrors: _sessionLog.filter(e => !e.trap).length,
                trapsHit: [...new Set(_sessionLog.map(e => e.trap?.id).filter(Boolean))],
                avgFrameDrop: _perfWarnings.length > 0
                    ? Math.round(_perfWarnings.reduce((s,w) => s + w.deltaMs, 0) / _perfWarnings.length)
                    : 0
            },
            errors: _sessionLog,
            actions: _actionLog,
            perfWarnings: _perfWarnings,
            knownTraps: KNOWN_TRAPS.filter(t => !t.isPositive).map(t => ({
                id: t.id,
                label: t.label,
                hint: t.hint,
                severity: t.severity,
                hitCount: _sessionLog.filter(e => e.trap?.id === t.id).length
            }))
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `waricam-debug-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        console.log(`[DebugMonitor V1.0] JSON exportiert: ${_sessionLog.length} Fehler, ${_actionLog.length} Aktionen`);
        console.timeEnd('[DebugMonitor V1.0] JSON-Export');
    }

    // ═══════════════════════════════════════════════════════
    // KEYBOARD SHORTCUT
    // ═══════════════════════════════════════════════════════

    function _setupShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                e.stopPropagation();
                _toggleOverlay();
            }
        }, true); // capture phase — vor allem anderen
        console.log('[DebugMonitor V1.0] Shortcut: Strg+Shift+D');
    }

    // ═══════════════════════════════════════════════════════
    // PUBLIC API (window.waricamDebug)
    // ═══════════════════════════════════════════════════════

    window.waricamDebug = {
        /** Overlay öffnen/schließen */
        toggle: _toggleOverlay,

        /** Session-Log als Array */
        getLog: () => [..._sessionLog],

        /** Aktionen-Log als Array */
        getActions: () => [..._actionLog],

        /** Performance-Warnings als Array */
        getPerf: () => [..._perfWarnings],

        /** JSON-Datei herunterladen */
        exportJSON: _exportJSON,

        /** Log leeren */
        clear: () => {
            _sessionLog = [];
            _actionLog = [];
            _perfWarnings = [];
            sessionStorage.removeItem(SESSION_KEY);
            console.log('[DebugMonitor V1.0] Log geleert via API');
        },

        /** Manuell einen Fehler loggen (für Tests) */
        logError: (msg, source) => _logError('manual', msg, source || 'manual', 0, 0, ''),

        /** Bekannte Fallen anzeigen */
        showTraps: () => {
            console.group('[DebugMonitor V1.0] Bekannte WARICAM-Fallen:');
            KNOWN_TRAPS.filter(t => !t.isPositive).forEach(t => {
                const hits = _sessionLog.filter(e => e.trap?.id === t.id).length;
                console.log(`${t.label} [${hits > 0 ? '⚠ ' + hits + '× getroffen' : '✅ nicht getroffen'}]\n  💡 ${t.hint}`);
            });
            console.groupEnd();
        },

        /** Session-Zusammenfassung in Console */
        summary: () => {
            const crits = _sessionLog.filter(e => e.trap?.severity === 'critical').length;
            const warns = _sessionLog.filter(e => e.trap?.severity === 'warning').length;
            const unkn  = _sessionLog.filter(e => !e.trap).length;
            const traps = [...new Set(_sessionLog.map(e => e.trap?.id).filter(Boolean))];
            console.group('[DebugMonitor V1.0] Session-Zusammenfassung');
            console.log(`Fehler: ${crits} kritisch, ${warns} Warnungen, ${unkn} unbekannt`);
            console.log(`Aktionen: ${_actionLog.length} | Frame-Drops: ${_perfWarnings.length}`);
            if (traps.length) console.log(`Getroffene Fallen: ${traps.join(', ')}`);
            else console.log('✅ Keine bekannten Fallen getroffen!');
            console.groupEnd();
        }
    };

    // ═══════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════

    _loadFromStorage();
    _setupErrorHandlers();
    _setupShortcut();

    // Action-Tracking + Performance-Monitor nach DOM-Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            _setupActionTracking();
            _setupPerformanceMonitor();
        });
    } else {
        _setupActionTracking();
        _setupPerformanceMonitor();
    }

    // Gespeicherte Fehler aus vorheriger Session melden
    if (_sessionLog.length > 0) {
        console.warn(`[DebugMonitor V1.0] ⚠ ${_sessionLog.length} Fehler aus vorheriger Session geladen — Strg+Shift+D zum Anzeigen`);
    }

    console.timeEnd('[DebugMonitor V1.0] Init');

})();
