/**
 * =========================================================================
 *  CeraCUT / CeraCUT – Undo/Redo Manager (Command Pattern) + Clipboard
 * =========================================================================
 *  Datei:    undo-manager.js
 *  Version:  V1.1
 *  Erstellt: 2026-02-12
 *  Build:    20260212-1800 MEZ
 *
 *  Beschreibung:
 *    Command Pattern basierter Undo/Redo-Manager für alle Benutzeraktionen.
 *    Integrierte Clipboard-Funktionalität (Copy/Cut/Paste) für Konturen.
 *    Keyboard-Shortcuts: STRG+Z (Undo), STRG+Y / STRG+Shift+Z (Redo),
 *                        STRG+C (Copy), STRG+X (Cut), STRG+V (Paste)
 *
 *  Integration:
 *    Wird in app.js über this.undoManager / this.clipboardManager verwendet.
 *    Jede Benutzeraktion wird als Command-Objekt über
 *    this.undoManager.execute(command) ausgeführt.
 * =========================================================================
 */

// =========================================================================
//  SECTION 1: Basis-Command-Klasse
// =========================================================================

/**
 * Abstrakte Basisklasse für alle Commands.
 * Jedes Command muss execute() und undo() implementieren.
 * Optional: redo() – Standard ist erneutes execute().
 */
class BaseCommand {
    /**
     * @param {string} description - Kurzbeschreibung für Debug/UI
     */
    constructor(description = 'Unbekannte Aktion') {
        this.description = description;
        this.timestamp = Date.now();
    }

    /** Aktion ausführen */
    execute() {
        throw new Error(`[UndoManager V1.0] execute() nicht implementiert: ${this.description}`);
    }

    /** Aktion rückgängig machen */
    undo() {
        throw new Error(`[UndoManager V1.0] undo() nicht implementiert: ${this.description}`);
    }

    /** Aktion wiederholen (Standard: erneutes execute) */
    redo() {
        this.execute();
    }
}


// =========================================================================
//  SECTION 2: Konkrete Command-Implementierungen (CeraCUT-spezifisch)
// =========================================================================

/**
 * Command: Eigenschaft eines Objekts ändern (z.B. Qualität, Typ, Startpunkt)
 */
class PropertyChangeCommand extends BaseCommand {
    /**
     * @param {object}   target     - Zielobjekt (z.B. CamContour)
     * @param {string}   property   - Eigenschaftsname
     * @param {*}        newValue   - Neuer Wert
     * @param {Function} [onChanged] - Callback nach Änderung (Re-Render)
     */
    constructor(target, property, newValue, onChanged = null) {
        super(`Eigenschaft "${property}" ändern`);
        this.target = target;
        this.property = property;
        this.oldValue = target[property];
        this.newValue = newValue;
        this.onChanged = onChanged;
    }

    execute() {
        this.target[this.property] = this.newValue;
        this.onChanged?.();
    }

    undo() {
        this.target[this.property] = this.oldValue;
        this.onChanged?.();
    }
}


/**
 * Command: Mehrere Eigenschaften gleichzeitig ändern (Batch)
 * Nützlich z.B. beim Ändern von Lead-In-Parametern (Typ + Länge + Winkel)
 */
class BatchPropertyChangeCommand extends BaseCommand {
    /**
     * @param {object}   target     - Zielobjekt
     * @param {Object}   changes    - { property: newValue, ... }
     * @param {Function} [onChanged]
     */
    constructor(target, changes, onChanged = null) {
        const props = Object.keys(changes).join(', ');
        super(`Batch-Änderung: ${props}`);
        this.target = target;
        this.changes = changes;
        this.oldValues = {};
        this.onChanged = onChanged;

        // Alte Werte sichern
        for (const key of Object.keys(changes)) {
            this.oldValues[key] = target[key];
        }
    }

    execute() {
        for (const [key, value] of Object.entries(this.changes)) {
            this.target[key] = value;
        }
        this.onChanged?.();
    }

    undo() {
        for (const [key, value] of Object.entries(this.oldValues)) {
            this.target[key] = value;
        }
        this.onChanged?.();
    }
}


/**
 * Command: Kontur(en) löschen
 * Speichert Position im Array für korrektes Wiederherstellen.
 */
class DeleteContoursCommand extends BaseCommand {
    /**
     * @param {Array}    contourArray - Referenz auf das Konturen-Array (app.contours)
     * @param {Array}    contours     - Die zu löschenden Konturen
     * @param {Function} [onChanged]
     */
    constructor(contourArray, contours, onChanged = null) {
        super(`${contours.length} Kontur(en) löschen`);
        this.contourArray = contourArray;
        this.contours = [...contours]; // Kopie
        this.onChanged = onChanged;
        // Position jeder Kontur im Array merken (für Wiederherstellen)
        this.positions = contours.map(c => contourArray.indexOf(c));
    }

    execute() {
        // Rückwärts entfernen, damit Indizes stabil bleiben
        const sorted = [...this.positions]
            .map((pos, i) => ({ pos, i }))
            .sort((a, b) => b.pos - a.pos);
        for (const { pos } of sorted) {
            if (pos >= 0) {
                this.contourArray.splice(pos, 1);
            }
        }
        this.onChanged?.();
    }

    undo() {
        // In Originalreihenfolge wieder einfügen
        for (let i = 0; i < this.contours.length; i++) {
            const pos = this.positions[i];
            if (pos >= 0) {
                this.contourArray.splice(pos, 0, this.contours[i]);
            }
        }
        this.onChanged?.();
    }
}


/**
 * Command: Kontur(en) hinzufügen (z.B. nach Paste oder Duplizieren)
 */
class AddContoursCommand extends BaseCommand {
    /**
     * @param {Array}    contourArray - Referenz auf das Konturen-Array
     * @param {Array}    contours     - Die hinzuzufügenden Konturen
     * @param {number}   [insertAt]   - Position zum Einfügen (-1 = am Ende)
     * @param {Function} [onChanged]
     */
    constructor(contourArray, contours, insertAt = -1, onChanged = null) {
        super(`${contours.length} Kontur(en) hinzufügen`);
        this.contourArray = contourArray;
        this.contours = [...contours];
        this.insertAt = insertAt;
        this.onChanged = onChanged;
    }

    execute() {
        if (this.insertAt >= 0) {
            this.contourArray.splice(this.insertAt, 0, ...this.contours);
        } else {
            this.contourArray.push(...this.contours);
        }
        this.onChanged?.();
    }

    undo() {
        for (const contour of this.contours) {
            const idx = this.contourArray.indexOf(contour);
            if (idx >= 0) {
                this.contourArray.splice(idx, 1);
            }
        }
        this.onChanged?.();
    }
}


/**
 * Command: Konturen-Reihenfolge ändern (Cut-Order / Sortierung)
 */
class ReorderContoursCommand extends BaseCommand {
    /**
     * @param {Array}    contourArray - Referenz auf das Konturen-Array
     * @param {Array}    newOrder     - Neue Reihenfolge (gleiche Referenzen)
     * @param {Function} [onChanged]
     */
    constructor(contourArray, newOrder, onChanged = null) {
        super('Konturen-Reihenfolge ändern');
        this.contourArray = contourArray;
        this.oldOrder = [...contourArray];
        this.newOrder = [...newOrder];
        this.onChanged = onChanged;
    }

    execute() {
        this.contourArray.length = 0;
        this.contourArray.push(...this.newOrder);
        this.onChanged?.();
    }

    undo() {
        this.contourArray.length = 0;
        this.contourArray.push(...this.oldOrder);
        this.onChanged?.();
    }
}


/**
 * Command: Startpunkt einer Kontur verschieben (Drag)
 */
class MoveStartPointCommand extends BaseCommand {
    /**
     * @param {object}   contour      - CamContour
     * @param {number}   oldSegIndex  - Alter Segment-Index
     * @param {number}   oldParam     - Alter Parameter (t-Wert)
     * @param {number}   newSegIndex  - Neuer Segment-Index
     * @param {number}   newParam     - Neuer Parameter (t-Wert)
     * @param {Function} [onChanged]
     */
    constructor(contour, oldSegIndex, oldParam, newSegIndex, newParam, onChanged = null) {
        super('Startpunkt verschieben');
        this.contour = contour;
        this.oldSegIndex = oldSegIndex;
        this.oldParam = oldParam;
        this.newSegIndex = newSegIndex;
        this.newParam = newParam;
        this.onChanged = onChanged;
    }

    execute() {
        this.contour.setStartPoint?.(this.newSegIndex, this.newParam);
        this.onChanged?.();
    }

    undo() {
        this.contour.setStartPoint?.(this.oldSegIndex, this.oldParam);
        this.onChanged?.();
    }
}


/**
 * Command: Konturen-Punkte transformieren (Move/Rotate/Scale/Mirror)
 * Speichert Deep-Copy aller alten Punkte für Undo.
 */
class TransformContoursCommand extends BaseCommand {
    /**
     * @param {CamContour[]} contours   - Die zu transformierenden Konturen
     * @param {Function}     transformFn - (contour) => void — wendet Transformation auf contour.points an
     * @param {string}       [description]
     * @param {Function}     [onChanged]
     */
    constructor(contours, transformFn, description = 'Konturen transformieren', onChanged = null) {
        super(description);
        this.contours = [...contours];
        this.transformFn = transformFn;
        this.onChanged = onChanged;

        // Deep-Copy aller Punkte VORHER sichern
        this.oldPointsMap = new Map();
        for (const c of this.contours) {
            this.oldPointsMap.set(c, c.points.map(p => ({ x: p.x, y: p.y })));
        }
    }

    execute() {
        for (const c of this.contours) {
            this.transformFn(c);
            c._cachedKerfPolyline = null;
            c._cachedLeadInPath = null;
            c._cachedLeadOutPath = null;
            c._cachedOvercutPath = null;
            c._cacheKey = null;
        }
        // Neue Punkte nach Transformation sichern (für redo)
        this._newPointsMap = new Map();
        for (const c of this.contours) {
            this._newPointsMap.set(c, c.points.map(p => ({ x: p.x, y: p.y })));
        }
        this.onChanged?.();
    }

    undo() {
        for (const c of this.contours) {
            const oldPts = this.oldPointsMap.get(c);
            if (oldPts) {
                c.points = oldPts.map(p => ({ x: p.x, y: p.y }));
                c._cachedKerfPolyline = null;
                c._cachedLeadInPath = null;
                c._cachedLeadOutPath = null;
                c._cachedOvercutPath = null;
                c._cacheKey = null;
            }
        }
        this.onChanged?.();
    }

    redo() {
        // Transformation erneut anwenden — gespeicherte neue Punkte verwenden
        if (!this._newPointsMap) {
            console.warn('[UndoManager] redo() ohne gespeicherte newPoints — übersprungen');
            return;
        }
        for (const c of this.contours) {
            const newPts = this._newPointsMap.get(c);
            if (newPts) {
                c.points = newPts.map(p => ({ x: p.x, y: p.y }));
                c._cachedKerfPolyline = null;
                c._cachedLeadInPath = null;
                c._cachedLeadOutPath = null;
                c._cachedOvercutPath = null;
                c._cacheKey = null;
            }
        }
        this.onChanged?.();
    }
}


/**
 * Command: Generisches Function-Pair (für Sonderfälle)
 * Nimmt execute- und undo-Funktionen als Lambdas entgegen.
 */
class FunctionCommand extends BaseCommand {
    /**
     * @param {string}   description
     * @param {Function} executeFn
     * @param {Function} undoFn
     */
    constructor(description, executeFn, undoFn) {
        super(description);
        this._executeFn = executeFn;
        this._undoFn = undoFn;
    }

    execute() { this._executeFn(); }
    undo() { this._undoFn(); }
}


// =========================================================================
//  SECTION 3: UndoManager (Zentrale Verwaltung)
// =========================================================================

class UndoManager {
    /**
     * @param {object}   options
     * @param {number}   [options.maxHistory=50]   - Max. Undo-Schritte
     * @param {Function} [options.onStateChange]   - Callback bei Undo/Redo-Änderung
     */
    constructor(options = {}) {
        this.maxHistory = options.maxHistory || 50;
        this.onStateChange = options.onStateChange || null;

        /** @type {BaseCommand[]} */
        this.undoStack = [];

        /** @type {BaseCommand[]} */
        this.redoStack = [];

        // Gruppen-Modus: Mehrere Commands als eine Einheit
        this._groupCommands = null;
        this._groupDescription = null;

        console.log(`[UndoManager V1.0] Initialisiert (max. ${this.maxHistory} Schritte)`);
    }

    // ----- Haupt-API -----

    /**
     * Command ausführen und auf den Undo-Stack legen.
     * Leert den Redo-Stack (neue Aktion nach Undo = kein Redo mehr)
     * @param {BaseCommand} command
     */
    execute(command) {
        try {
            command.execute();
        } catch (err) {
            console.error(`[UndoManager V1.1] Fehler bei execute() von "${command.description}":`, err);
            // Offene Gruppe schließen, damit kein inkonsistenter Gruppen-Zustand bleibt
            if (this._groupCommands) {
                this._groupCommands = null;
                this._groupDescription = null;
            }
            throw err;
        }

        if (this._groupCommands) {
            this._groupCommands.push(command);
        } else {
            this.undoStack.push(command);
            this._trimStack();

            // Edge Case: Redo-Stack leeren nach neuer Aktion
            if (this.redoStack.length > 0) {
                this.redoStack.length = 0;
                console.log('[UndoManager V1.1] Redo-Stack geleert (neue Aktion nach Undo)');
            }

            this._notifyStateChange();
        }

        console.log(`[UndoManager V1.1] Ausgeführt: "${command.description}"`);
    }

    /**
     * Letzte Aktion rückgängig machen (STRG+Z)
     * @returns {boolean} true wenn Undo ausgeführt wurde
     */
    undo() {
        if (!this.canUndo()) {
            console.log('[UndoManager V1.0] Undo-Stack leer');
            return false;
        }

        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);

        console.log(`[UndoManager V1.0] Undo: "${command.description}"`);
        this._notifyStateChange();
        return true;
    }

    /**
     * Letzte rückgängig gemachte Aktion wiederholen (STRG+Y)
     * @returns {boolean} true wenn Redo ausgeführt wurde
     */
    redo() {
        if (!this.canRedo()) {
            console.log('[UndoManager V1.0] Redo-Stack leer');
            return false;
        }

        const command = this.redoStack.pop();
        command.redo();
        this.undoStack.push(command);

        console.log(`[UndoManager V1.0] Redo: "${command.description}"`);
        this._notifyStateChange();
        return true;
    }

    /** @returns {boolean} */
    canUndo() { return this.undoStack.length > 0; }

    /** @returns {boolean} */
    canRedo() { return this.redoStack.length > 0; }

    // ----- Gruppen-Modus -----

    /**
     * Beginnt eine Gruppe: Alle Commands bis endGroup() = EINE Undo-Einheit.
     * @param {string} description
     */
    beginGroup(description = 'Gruppierte Aktion') {
        if (this._groupCommands) {
            console.warn('[UndoManager V1.0] Verschachtelte Gruppen nicht unterstützt!');
            return;
        }
        this._groupCommands = [];
        this._groupDescription = description;
    }

    /** Beendet die Gruppe und legt sie als ein Command auf den Undo-Stack. */
    endGroup() {
        if (!this._groupCommands) {
            console.warn('[UndoManager V1.0] Kein Gruppen-Modus aktiv!');
            return;
        }

        const commands = this._groupCommands;
        const description = this._groupDescription;
        this._groupCommands = null;
        this._groupDescription = null;

        if (commands.length === 0) return;

        const groupCommand = new FunctionCommand(
            description,
            () => commands.forEach(c => c.execute()),
            () => [...commands].reverse().forEach(c => c.undo())
        );
        groupCommand.timestamp = commands[0].timestamp;

        this.undoStack.push(groupCommand);
        this._trimStack();

        if (this.redoStack.length > 0) {
            this.redoStack.length = 0;
        }

        this._notifyStateChange();
        console.log(`[UndoManager V1.0] Gruppe: "${description}" (${commands.length} Schritte)`);
    }

    // ----- Verwaltung -----

    /** Historie komplett leeren (z.B. bei neuem DXF-Import) */
    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this._groupCommands = null;
        this._notifyStateChange();
        console.log('[UndoManager V1.0] Historie gelöscht');
    }

    /**
     * Status-Zusammenfassung (für UI/Debug)
     * @returns {{ undoCount: number, redoCount: number, lastAction: string|null }}
     */
    getState() {
        const lastCmd = this.undoStack.length > 0
            ? this.undoStack[this.undoStack.length - 1]
            : null;
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            lastAction: lastCmd?.description || null
        };
    }

    // ----- Interne Helfer -----

    _trimStack() {
        while (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
    }

    _notifyStateChange() {
        this.onStateChange?.(this.getState());
    }
}


// =========================================================================
//  SECTION 3b: WizardStepUndo — Verschachteltes Undo pro Wizard-Step (V1.1)
// =========================================================================

/**
 * Verwaltet Undo-Stacks pro Wizard-Step.
 * Jeder Step hat seinen eigenen Undo-Stack, so dass beim Zurückgehen
 * im Wizard alle Änderungen des aktuellen Steps rückgängig gemacht werden.
 *
 * Integration:
 *   app.wizardUndo = new WizardStepUndo(app.undoManager);
 *   // Beim Step-Wechsel:
 *   app.wizardUndo.enterStep(stepNumber);
 *   // Beim Zurückgehen:
 *   app.wizardUndo.undoStep(stepNumber);  // macht alle Änderungen des Steps rückgängig
 */
class WizardStepUndo {
    constructor(undoManager) {
        this.undoManager = undoManager;
        this._stepMarkers = {};   // step → undoStack-Index beim Betreten
        this._currentStep = null;
        console.log('[WizardStepUndo V1.1] Initialisiert');
    }

    /**
     * Markiert den Beginn eines Wizard-Steps.
     * Speichert den aktuellen Undo-Stack-Index als Marker.
     */
    enterStep(stepNumber) {
        this._stepMarkers[stepNumber] = this.undoManager.undoStack.length;
        this._currentStep = stepNumber;
        console.log(`[WizardStepUndo V1.1] Step ${stepNumber} betreten (Marker bei Index ${this._stepMarkers[stepNumber]})`);
    }

    /**
     * Macht alle Änderungen des angegebenen Steps rückgängig.
     * Führt Undo aus bis der Stack auf den Marker-Index zurückgesetzt ist.
     * @returns {number} Anzahl rückgängig gemachter Aktionen
     */
    undoStep(stepNumber) {
        const marker = this._stepMarkers[stepNumber];
        if (marker === undefined) {
            console.warn(`[WizardStepUndo V1.1] Kein Marker für Step ${stepNumber}`);
            return 0;
        }

        let undoneCount = 0;
        let maxIter = 1000;
        while (this.undoManager.undoStack.length > marker && this.undoManager.canUndo() && --maxIter > 0) {
            this.undoManager.undo();
            undoneCount++;
        }
        if (maxIter <= 0) {
            console.warn(`[WizardStepUndo V1.1] Max-Iterationen erreicht bei undoStep(${stepNumber}) — moeglicher Endlos-Loop abgebrochen`);
        }

        // Marker entfernen
        delete this._stepMarkers[stepNumber];

        if (undoneCount > 0) {
            console.log(`[WizardStepUndo V1.1] Step ${stepNumber}: ${undoneCount} Aktionen rückgängig gemacht`);
        }
        return undoneCount;
    }

    /**
     * Prüft ob der aktuelle Step Änderungen hat.
     */
    hasChanges(stepNumber) {
        const marker = this._stepMarkers[stepNumber];
        if (marker === undefined) return false;
        return this.undoManager.undoStack.length > marker;
    }

    /**
     * Anzahl Änderungen im aktuellen Step.
     */
    getChangeCount(stepNumber) {
        const marker = this._stepMarkers[stepNumber];
        if (marker === undefined) return 0;
        return Math.max(0, this.undoManager.undoStack.length - marker);
    }

    /**
     * Alle Marker zurücksetzen (z.B. beim Neuladen).
     */
    reset() {
        this._stepMarkers = {};
        this._currentStep = null;
        console.log('[WizardStepUndo V1.1] Reset');
    }

    get currentStep() { return this._currentStep; }
}


// =========================================================================
//  SECTION 4: ClipboardManager (Copy / Cut / Paste)
// =========================================================================

class ClipboardManager {
    /**
     * @param {object}      options
     * @param {UndoManager}  options.undoManager
     * @param {CeraCutApp}   options.app          - Referenz auf die App-Instanz
     */
    constructor(options) {
        this.undoManager = options.undoManager;
        this.app = options.app;

        /** @type {object[]|null} Internes Clipboard (geklonte Konturen) */
        this._clipboard = null;

        /** Offset für Paste-Verschiebung (damit nicht exakt übereinander) */
        this._pasteOffset = { x: 5, y: -5 };

        console.log('[Clipboard V1.0] Initialisiert');
    }

    /**
     * Selektierte Konturen in das Clipboard kopieren.
     * @returns {number} Anzahl kopierter Konturen
     */
    copy() {
        const selected = this.app.contours.filter(c => c.isSelected);
        if (selected.length === 0) {
            this.app.showToast?.('Nichts selektiert', 'warning');
            return 0;
        }

        this._clipboard = selected.map(c => this._cloneContour(c));

        this.app.showToast?.(`📋 ${selected.length} Kontur(en) kopiert`, 'info');
        console.log(`[Clipboard V1.0] ${selected.length} Kontur(en) kopiert`);

        // Optional: System-Zwischenablage (JSON-Metadaten)
        this._writeToSystemClipboard(selected);

        return selected.length;
    }

    /**
     * Selektierte Konturen ausschneiden (Copy + Delete).
     * Die Löschung wird als Command im UndoManager registriert!
     * @returns {number} Anzahl ausgeschnittener Konturen
     */
    cut() {
        const selected = this.app.contours.filter(c => c.isSelected);
        if (selected.length === 0) {
            this.app.showToast?.('Nichts selektiert', 'warning');
            return 0;
        }

        // Erst kopieren
        this._clipboard = selected.map(c => this._cloneContour(c));

        // Dann als Undo-fähige Aktion löschen
        const deleteCmd = new DeleteContoursCommand(
            this.app.contours,
            selected,
            () => {
                this.app.rebuildCutOrder?.();
                this.app.renderer?.setContours(this.app.contours);
                this.app.updateContourPanel?.();
            }
        );
        this.undoManager.execute(deleteCmd);

        this.app.showToast?.(`✂️ ${selected.length} Kontur(en) ausgeschnitten`, 'success');
        console.log(`[Clipboard V1.0] ${selected.length} Kontur(en) ausgeschnitten`);

        this._writeToSystemClipboard(selected);
        return selected.length;
    }

    /**
     * Konturen aus dem Clipboard einfügen.
     * Wird als Command im UndoManager registriert.
     * @returns {number} Anzahl eingefügter Konturen
     */
    paste() {
        if (!this._clipboard || this._clipboard.length === 0) {
            this.app.showToast?.('Clipboard leer', 'warning');
            return 0;
        }

        // Neue Deep-Copies erstellen (damit mehrfaches Paste geht)
        const clones = this._clipboard.map(c => {
            const clone = this._cloneContour(c);
            this._applyOffset(clone, this._pasteOffset);
            return clone;
        });

        // Alte Selektion aufheben, neue Konturen selektieren
        const addCmd = new AddContoursCommand(
            this.app.contours,
            clones,
            -1,
            () => {
                this.app.contours.forEach(c => { c.isSelected = false; });
                clones.forEach(c => { c.isSelected = true; });
                this.app.rebuildCutOrder?.();
                this.app.renderer?.setContours(this.app.contours);
                this.app.updateContourPanel?.();
            }
        );
        this.undoManager.execute(addCmd);

        this.app.showToast?.(`📄 ${clones.length} Kontur(en) eingefügt`, 'success');
        console.log(`[Clipboard V1.0] ${clones.length} Kontur(en) eingefügt`);
        return clones.length;
    }

    /** @returns {boolean} */
    hasContent() {
        return this._clipboard !== null && this._clipboard.length > 0;
    }

    /** Clipboard leeren */
    clear() {
        this._clipboard = null;
    }

    // ----- Interne Helfer -----

    /**
     * Deep-Clone einer Kontur – unterstützt CAMContour und Plain Objects
     */
    _cloneContour(contour) {
        // Falls CAMContour mit clone()-Methode
        if (typeof contour.clone === 'function') {
            return contour.clone();
        }

        // Falls CAMContour-Instanz ohne clone()
        if (typeof CAMContour !== 'undefined' && contour instanceof CAMContour) {
            const points = contour.points?.map(p => ({ ...p })) || [];
            const newContour = new CAMContour(points, contour.isClosed);
            for (const key of Object.keys(contour)) {
                if (key === 'points') continue;
                const val = contour[key];
                if (Array.isArray(val)) {
                    newContour[key] = val.map(item =>
                        typeof item === 'object' && item !== null ? { ...item } : item
                    );
                } else if (typeof val === 'object' && val !== null) {
                    newContour[key] = { ...val };
                } else {
                    newContour[key] = val;
                }
            }
            newContour.isSelected = false;
            return newContour;
        }

        // Fallback: Plain Object Deep Copy
        const copy = {
            ...contour,
            points: contour.points?.map(p => ({ ...p })) || [],
            isSelected: false,
            microjoints: contour.microjoints ? [...contour.microjoints] : []
        };
        return copy;
    }

    /**
     * Offset auf alle Punkte einer Kontur anwenden
     */
    _applyOffset(contour, offset) {
        if (!offset) return;

        if (contour.points) {
            for (const p of contour.points) {
                if (p.x !== undefined) p.x += offset.x;
                if (p.y !== undefined) p.y += offset.y;
            }
        }

        if (contour.segments) {
            for (const seg of contour.segments) {
                if (seg.start) { seg.start.x += offset.x; seg.start.y += offset.y; }
                if (seg.end)   { seg.end.x += offset.x;   seg.end.y += offset.y; }
                if (seg.center){ seg.center.x += offset.x; seg.center.y += offset.y; }
            }
        }

        contour.recalculateBounds?.();
    }

    /**
     * Metadaten in System-Zwischenablage schreiben (optional)
     */
    async _writeToSystemClipboard(contours) {
        try {
            if (!navigator.clipboard?.writeText) return;
            const data = {
                type: 'ceracut-contours',
                version: '1.0',
                count: contours.length,
                timestamp: new Date().toISOString()
            };
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        } catch (err) {
            // Nicht kritisch
        }
    }
}


// =========================================================================
//  SECTION 5: Global verfügbar machen (Vanilla JS)
// =========================================================================

if (typeof window !== 'undefined') {
    window.UndoManager = UndoManager;
    window.ClipboardManager = ClipboardManager;
    window.WizardStepUndo = WizardStepUndo;

    window.Commands = {
        BaseCommand,
        PropertyChangeCommand,
        BatchPropertyChangeCommand,
        DeleteContoursCommand,
        AddContoursCommand,
        ReorderContoursCommand,
        MoveStartPointCommand,
        TransformContoursCommand,
        FunctionCommand
    };
}
