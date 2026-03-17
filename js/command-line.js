/**
 * CeraCUT Command Line V1.3
 * AutoCAD-style Command Line Interface
 * - Prompt-System für Zeichentools
 * - Koordinateneingabe (absolut + relativ)
 * - Shortcut-Routing (L, C, N, A, P + M, R, S, O, Shift+C, Shift+M)
 * - History + ArrowUp/Down Navigation
 * - Input-Validation-Feedback (rote Fehlermeldung)
 * Created: 2026-02-13 MEZ
 * Last Modified: 2026-03-17 MEZ
 * Build: 20260317-quickwins
 */

class CommandLine {

    constructor(options = {}) {
        // DOM-Elemente
        this.containerEl = document.getElementById(options.containerId || 'command-line');
        this.inputEl = document.getElementById(options.inputId || 'cmd-input');
        this.promptEl = document.getElementById(options.promptId || 'cmd-prompt');
        this.historyEl = document.getElementById(options.historyId || 'cmd-history');

        // State
        this.active = false;           // Ist ein Tool aktiv?
        this.currentPrompt = '';
        this.history = [];
        this.maxHistory = 50;

        // V1.3: Befehls-History für ArrowUp/Down Navigation
        this.commandHistory = [];      // Eingegebene Befehle (Strings)
        this.maxCommandHistory = 30;
        this._historyIndex = -1;       // -1 = kein Browsen, 0 = neuester
        this._savedInput = '';         // Eingabe vor ArrowUp gesichert

        // Callbacks
        this.onInput = options.onInput || null;        // (value: string) => void
        this.onShortcut = options.onShortcut || null;   // (key: string) => void
        this.onEscape = options.onEscape || null;       // () => void
        this.onEnter = options.onEnter || null;          // () => void — Enter ohne Eingabe
        this.onBackspace = options.onBackspace || null;  // () => void — Backspace Undo

        this._init();
        console.debug('[CommandLine V1.3] ✅ Initialisiert');
    }

    _init() {
        if (!this.inputEl) {
            console.error('[CommandLine] Input-Element nicht gefunden!');
            return;
        }

        // Keydown-Handler auf dem Input-Feld
        this.inputEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

        // Klick auf Container fokussiert Input
        this.containerEl?.addEventListener('click', () => {
            this.inputEl.focus();
        });

        // Standardmäßig bereit-Prompt
        this.setPrompt('Befehl eingeben — Linie(L) Kreis(C) Rechteck(N) | F1 = Hilfe');
    }

    // ════════════════════════════════════════════════════════════════
    // ÖFFENTLICHE API
    // ════════════════════════════════════════════════════════════════

    /** Prompt-Text setzen (zeigt was erwartet wird) */
    setPrompt(text) {
        this.currentPrompt = text;
        if (this.promptEl) {
            this.promptEl.textContent = text;
        }
    }

    /** Tool aktivieren — Fokus auf Input */
    activate() {
        this.active = true;
        this.inputEl?.focus();
        this.containerEl?.classList.add('active');
    }

    /** Tool deaktivieren — Standard-Prompt */
    deactivate() {
        this.active = false;
        if (this.inputEl) this.inputEl.value = '';
        this.containerEl?.classList.remove('active');
        this.setPrompt('Befehl eingeben — Linie(L) Kreis(C) Rechteck(N) | F1 = Hilfe');
    }

    /** Nachricht in die History schreiben */
    log(message, type = 'info') {
        this.history.push({ message, type, time: Date.now() });
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this._renderHistory();
    }

    /** Input-Feld leeren */
    clearInput() {
        if (this.inputEl) this.inputEl.value = '';
    }

    /** Fokus setzen */
    focus() {
        this.inputEl?.focus();
    }

    // ════════════════════════════════════════════════════════════════
    // KOORDINATEN-PARSING
    // ════════════════════════════════════════════════════════════════

    /**
     * Koordinateneingabe parsen
     * Absolut:  "100,50" oder "100 50"
     * Relativ:  "@30,20" oder "@30 20"
     * Einzelwert (als Radius/Distanz): "5.5"
     * @param {string} input - Benutzereingabe
     * @param {{x:number, y:number}|null} lastPoint - Letzter Punkt (für relative Eingabe)
     * @returns {{ type: 'point'|'distance'|'option', x?: number, y?: number, value?: number, option?: string } | null}
     */
    static parseInput(input, lastPoint = null) {
        if (!input || input.trim() === '') return null;

        const trimmed = input.trim();

        // Options-Erkennung: Buchstaben-Befehle wie "D", "R", "LE", "EX", "CH", etc.
        if (/^[a-zA-Z]{1,6}$/i.test(trimmed)) {
            return { type: 'option', option: trimmed.toUpperCase() };
        }

        // Relative Koordinaten: @x,y oder @x y
        if (trimmed.startsWith('@')) {
            const coords = trimmed.substring(1);
            const parts = coords.split(/[,\s]+/).map(Number);

            if (parts.length === 2 && parts.every(n => !isNaN(n))) {
                const baseX = lastPoint?.x || 0;
                const baseY = lastPoint?.y || 0;
                return {
                    type: 'point',
                    x: baseX + parts[0],
                    y: baseY + parts[1]
                };
            }
            // @distance (relative Distanz, z.B. für Radius)
            if (parts.length === 1 && !isNaN(parts[0])) {
                return { type: 'distance', value: parts[0] };
            }
            return null;
        }

        // Absolute Koordinaten: x,y oder x y
        const parts = trimmed.split(/[,\s]+/).map(Number);

        if (parts.length === 2 && parts.every(n => !isNaN(n))) {
            return { type: 'point', x: parts[0], y: parts[1] };
        }

        // Einzelwert (Radius, Distanz, Durchmesser)
        if (parts.length === 1 && !isNaN(parts[0])) {
            return { type: 'distance', value: parts[0] };
        }

        return null;
    }

    // ════════════════════════════════════════════════════════════════
    // INTERNES
    // ════════════════════════════════════════════════════════════════

    _handleKeyDown(e) {
        const value = this.inputEl.value.trim();

        switch (e.key) {
            case 'Enter':
            case ' ':  // Space = Bestätigen (wie AutoCAD)
                e.preventDefault();

                if (value === '') {
                    // Enter/Space ohne Eingabe → Tool beenden oder bestätigen
                    if (this.onEnter) this.onEnter();
                    return;
                }

                // Wenn kein Tool aktiv ist, prüfe auf Shortcut
                if (!this.active) {
                    console.log('[CmdLine] onShortcut dispatch: value="' + value + '" (active=false!)');
                    this._pushCommandHistory(value);
                    if (this.onShortcut) {
                        this.onShortcut(value.toUpperCase());
                    }
                    this.inputEl.value = '';
                    this._historyIndex = -1;
                    return;
                }

                // Tool ist aktiv → Eingabe weiterleiten
                // V1.3: Input-Validation — rote Fehlermeldung bei ungültiger Eingabe
                const parsed = CommandLine.parseInput(value);
                if (!parsed) {
                    this.log(`Ungültige Eingabe: "${value}" — Erwartet: Koordinaten (100,50), relativ (@25,10) oder Distanz (25)`, 'error');
                    this.inputEl.value = '';
                    return;
                }

                console.log('[CmdLine] onInput dispatch: value="' + value + '", active=' + this.active);
                this._pushCommandHistory(value);
                this.log(`> ${value}`, 'input');
                if (this.onInput) this.onInput(value);
                this.inputEl.value = '';
                this._historyIndex = -1;
                break;

            case 'Escape':
                e.preventDefault();
                this.inputEl.value = '';
                if (this.onEscape) this.onEscape();
                break;

            case 'ArrowUp':
                e.preventDefault();
                this._navigateHistory(1);
                break;

            case 'ArrowDown':
                e.preventDefault();
                this._navigateHistory(-1);
                break;

            case 'Backspace':
                // Wenn Input leer ist → Undo letzte Aktion im Tool
                if (value === '' && this.active) {
                    e.preventDefault();
                    if (this.onBackspace) this.onBackspace();
                }
                break;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // V1.3: BEFEHLS-HISTORY NAVIGATION
    // ════════════════════════════════════════════════════════════════

    /** Befehl in History speichern */
    _pushCommandHistory(cmd) {
        if (!cmd || cmd.trim() === '') return;
        const trimmed = cmd.trim();
        // Duplikate am Ende vermeiden
        if (this.commandHistory.length > 0 && this.commandHistory[0] === trimmed) return;
        this.commandHistory.unshift(trimmed);  // Neueste vorne
        if (this.commandHistory.length > this.maxCommandHistory) {
            this.commandHistory.pop();
        }
    }

    /** ArrowUp (+1) = älter, ArrowDown (-1) = neuer */
    _navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;

        if (this._historyIndex === -1 && direction === 1) {
            // Erste ArrowUp-Taste: aktuelle Eingabe sichern
            this._savedInput = this.inputEl.value;
            this._historyIndex = 0;
        } else {
            this._historyIndex += direction;
        }

        // Zurück zur gespeicherten Eingabe
        if (this._historyIndex < 0) {
            this._historyIndex = -1;
            this.inputEl.value = this._savedInput;
            return;
        }

        // Am Ende der History stoppen
        if (this._historyIndex >= this.commandHistory.length) {
            this._historyIndex = this.commandHistory.length - 1;
            return;
        }

        this.inputEl.value = this.commandHistory[this._historyIndex];
    }

    _renderHistory() {
        if (!this.historyEl) return;

        // Zeige nur die letzten 5 Einträge
        const recent = this.history.slice(-5);
        this.historyEl.innerHTML = recent.map(entry => {
            const cls = entry.type === 'input' ? 'cmd-input-echo' :
                        entry.type === 'error' ? 'cmd-error' :
                        entry.type === 'success' ? 'cmd-success' : 'cmd-info';
            const safe = entry.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return `<div class="${cls}">${safe}</div>`;
        }).join('');

        // Auto-scroll
        this.historyEl.scrollTop = this.historyEl.scrollHeight;
    }
}
