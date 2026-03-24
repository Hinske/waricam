/**
 * CeraCUT Layer Manager V1.2
 * Verwaltung von Zeichnungslayern (AutoCAD-Stil)
 *
 * Features:
 * - Layer anlegen, umbenennen, löschen
 * - Sichtbarkeit, Sperren, Farbe, Linientyp
 * - Aktiver Layer (neue Entities landen hier)
 * - Import aus DXF-Parse-Result
 * - ACI-Farb-Mapping (AutoCAD Color Index)
 * - Drag-to-Reorder (Layer "0" immer oben)
 * - Undo-fähige Layer-Operationen (Visibility, Lock, Color)
 *
 * Version: V1.2
 * Last Modified: 2026-03-24 MEZ
 * Build: 20260324-undofix
 */

// ════════════════════════════════════════════════════════════════════════════
//  ACI Color Table (AutoCAD Color Index → Hex)
// ════════════════════════════════════════════════════════════════════════════

const ACI_COLORS = {
    0: '#000000',   // ByBlock
    1: '#ff0000',   // Rot
    2: '#ffff00',   // Gelb
    3: '#00ff00',   // Grün
    4: '#00ffff',   // Cyan
    5: '#0000ff',   // Blau
    6: '#ff00ff',   // Magenta
    7: '#ffffff',   // Weiß/Schwarz (abhängig vom Hintergrund)
    8: '#808080',   // Dunkelgrau
    9: '#c0c0c0',   // Hellgrau
    10: '#ff0000', 11: '#ff7f7f', 12: '#cc0000', 13: '#ff4c4c', 14: '#cc0000',
    15: '#ff1919', 16: '#cc1414', 17: '#990f0f', 18: '#7f0000', 19: '#4c0000',
    20: '#ff7f00', 21: '#ff7f3f',
    30: '#ff7f00', 40: '#ffbf00', 50: '#ffff00',
    60: '#bfff00', 70: '#7fff00', 80: '#00ff00',
    90: '#00ff7f', 100: '#00ffbf', 110: '#00ffff',
    120: '#00bfff', 130: '#007fff', 140: '#0000ff',
    150: '#7f00ff', 160: '#0055ff', 170: '#ff00ff',
    180: '#ff007f', 190: '#ff003f',
    200: '#ff7fbf', 210: '#ff00bf', 220: '#bf0060',
    250: '#333333', 251: '#505050', 252: '#696969',
    253: '#808080', 254: '#bebebe', 255: '#ffffff',
    256: '#ffffff'  // ByLayer
};

// Standard-Farben für neue Layer (Rotation)
const DEFAULT_LAYER_COLORS = [
    '#ffffff', '#ff0000', '#ffff00', '#00ff00', '#00ffff',
    '#0000ff', '#ff00ff', '#ff7f00', '#7fff00', '#00ff7f'
];

// Hex → nächster ACI-Code (für DXF-Export)
function hexToACI(hex) {
    hex = hex.toLowerCase();
    let bestACI = 7;
    let bestDist = Infinity;
    const r1 = parseInt(hex.substr(1, 2), 16);
    const g1 = parseInt(hex.substr(3, 2), 16);
    const b1 = parseInt(hex.substr(5, 2), 16);
    for (const [aci, aciHex] of Object.entries(ACI_COLORS)) {
        const r2 = parseInt(aciHex.substr(1, 2), 16);
        const g2 = parseInt(aciHex.substr(3, 2), 16);
        const b2 = parseInt(aciHex.substr(5, 2), 16);
        const dist = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            bestACI = parseInt(aci);
        }
    }
    return bestACI;
}

// ACI → Hex
function aciToHex(aci) {
    return ACI_COLORS[aci] || ACI_COLORS[7];
}


// ════════════════════════════════════════════════════════════════════════════
//  LAYER MANAGER
// ════════════════════════════════════════════════════════════════════════════

class LayerManager {

    constructor() {
        /** @type {Map<string, LayerDef>} */
        this.layers = new Map();

        /** Aktiver Layer-Name (neue Entities landen hier) */
        this.activeLayer = '0';

        /** Callback bei Änderungen (für UI-Updates) */
        this.onChange = null;

        /** Referenz auf UndoManager (wird von app.js gesetzt) */
        this.undoManager = null;

        // Default-Layer "0" anlegen
        this._addDefaultLayer();

        console.debug('[LayerManager V1.2] Initialisiert');
    }

    // ═══ INTERNE HELFER ═══

    _addDefaultLayer() {
        this.layers.set('0', {
            name: '0',
            color: '#ffffff',
            visible: true,
            locked: false,
            lineType: 'Continuous',
            entityCount: 0,
            order: 0
        });
    }

    _nextColor() {
        const idx = this.layers.size % DEFAULT_LAYER_COLORS.length;
        return DEFAULT_LAYER_COLORS[idx];
    }

    _nextOrder() {
        let max = 0;
        for (const l of this.layers.values()) {
            if (l.order > max) max = l.order;
        }
        return max + 1;
    }

    _notify() {
        if (typeof this.onChange === 'function') {
            this.onChange(this);
        }
    }

    // ═══ ÖFFENTLICHE API ═══

    /**
     * Layer hinzufügen
     * @param {string} name
     * @param {object} options - { color, visible, locked, lineType }
     * @returns {boolean} Erfolg
     */
    addLayer(name, options = {}) {
        if (!name || typeof name !== 'string') return false;
        name = name.trim();
        if (name === '' || this.layers.has(name)) return false;

        this.layers.set(name, {
            name: name,
            color: options.color || this._nextColor(),
            visible: options.visible !== false,
            locked: options.locked === true,
            lineType: options.lineType || 'Continuous',
            entityCount: options.entityCount || 0,
            order: options.order ?? this._nextOrder()
        });

        this._notify();
        return true;
    }

    /**
     * Layer entfernen
     * @param {string} name
     * @returns {boolean} Erfolg
     */
    removeLayer(name) {
        if (name === '0') return false; // Layer 0 ist geschützt
        if (!this.layers.has(name)) return false;

        this.layers.delete(name);

        // Wenn gelöschter Layer aktiv war → auf "0" wechseln
        if (this.activeLayer === name) {
            this.activeLayer = '0';
        }

        this._notify();
        return true;
    }

    /**
     * Layer umbenennen
     * @param {string} oldName
     * @param {string} newName
     * @returns {boolean} Erfolg
     */
    renameLayer(oldName, newName) {
        if (oldName === '0') return false; // Layer 0 kann nicht umbenannt werden
        if (!newName || newName.trim() === '') return false;
        newName = newName.trim();
        if (this.layers.has(newName)) return false;
        if (!this.layers.has(oldName)) return false;

        const layerDef = this.layers.get(oldName);
        layerDef.name = newName;
        this.layers.delete(oldName);
        this.layers.set(newName, layerDef);

        if (this.activeLayer === oldName) {
            this.activeLayer = newName;
        }

        this._notify();
        return true;
    }

    /**
     * Aktiven Layer setzen
     * @param {string} name
     * @returns {boolean} Erfolg
     */
    setActive(name) {
        if (!this.layers.has(name)) return false;
        const layer = this.layers.get(name);
        if (layer.locked) return false; // Gesperrte Layer können nicht aktiv sein
        this.activeLayer = name;
        this._notify();
        return true;
    }

    /**
     * Sichtbarkeit togglen
     * @param {string} name
     * @returns {boolean} Neuer Zustand
     */
    toggleVisibility(name) {
        const layer = this.layers.get(name);
        if (!layer) return false;
        const oldVal = layer.visible;
        layer.visible = !layer.visible;
        const newVal = layer.visible;
        // Undo-fähig machen
        if (this.undoManager) {
            const self = this;
            const cmd = new FunctionCommand(
                `Layer "${name}" ${newVal ? 'einblenden' : 'ausblenden'}`,
                () => { layer.visible = newVal; self._notify(); },
                () => { layer.visible = oldVal; self._notify(); }
            );
            // Aktion bereits ausgeführt → direkt auf Stack
            this.undoManager.undoStack.push(cmd);
            this.undoManager.redoStack.length = 0;
            this.undoManager._notifyStateChange();
        }
        this._notify();
        return layer.visible;
    }

    /**
     * Sperren togglen
     * @param {string} name
     * @returns {boolean} Neuer Zustand
     */
    toggleLock(name) {
        if (name === '0') return false; // Layer 0 kann nicht gesperrt werden
        const layer = this.layers.get(name);
        if (!layer) return false;
        const oldLocked = layer.locked;
        const oldActive = this.activeLayer;
        layer.locked = !layer.locked;
        const newLocked = layer.locked;
        // Wenn aktiver Layer gesperrt wird → auf "0" wechseln
        if (layer.locked && this.activeLayer === name) {
            this.activeLayer = '0';
        }
        const newActive = this.activeLayer;
        // Undo-fähig machen
        if (this.undoManager) {
            const self = this;
            const cmd = new FunctionCommand(
                `Layer "${name}" ${newLocked ? 'sperren' : 'entsperren'}`,
                () => { layer.locked = newLocked; self.activeLayer = newActive; self._notify(); },
                () => { layer.locked = oldLocked; self.activeLayer = oldActive; self._notify(); }
            );
            this.undoManager.undoStack.push(cmd);
            this.undoManager.redoStack.length = 0;
            this.undoManager._notifyStateChange();
        }
        this._notify();
        return layer.locked;
    }

    /**
     * Farbe setzen
     * @param {string} name
     * @param {string} color - Hex-Farbcode (#rrggbb)
     */
    setColor(name, color) {
        const layer = this.layers.get(name);
        if (!layer) return;
        const oldColor = layer.color;
        layer.color = color;
        // Undo-fähig machen
        if (this.undoManager) {
            const self = this;
            const cmd = new FunctionCommand(
                `Layer "${name}" Farbe ändern`,
                () => { layer.color = color; self._notify(); },
                () => { layer.color = oldColor; self._notify(); }
            );
            this.undoManager.undoStack.push(cmd);
            this.undoManager.redoStack.length = 0;
            this.undoManager._notifyStateChange();
        }
        this._notify();
    }

    /**
     * Linientyp setzen
     * @param {string} name
     * @param {string} lineType - 'Continuous', 'Dashed', 'DashDot', 'Dotted'
     */
    setLineType(name, lineType) {
        const layer = this.layers.get(name);
        if (!layer) return;
        layer.lineType = lineType;
        this._notify();
    }

    /**
     * Layer-Definition abrufen
     * @param {string} name
     * @returns {LayerDef|null}
     */
    getLayer(name) {
        return this.layers.get(name) || null;
    }

    /**
     * Aktive Layer-Definition
     * @returns {LayerDef}
     */
    getActiveLayer() {
        return this.layers.get(this.activeLayer) || this.layers.get('0');
    }

    /**
     * Alle Layer als Array (sortiert: "0" zuerst, dann nach order)
     * @returns {LayerDef[]}
     */
    getAllLayers() {
        const all = Array.from(this.layers.values());
        all.sort((a, b) => {
            if (a.name === '0') return -1;
            if (b.name === '0') return 1;
            return (a.order ?? 0) - (b.order ?? 0);
        });
        return all;
    }

    /**
     * Layer-Reihenfolge ändern (Drag-to-Reorder)
     * Layer "0" bleibt immer an Position 0
     * @param {number} fromIdx - Quell-Index (in getAllLayers()-Array)
     * @param {number} toIdx - Ziel-Index
     */
    reorderLayer(fromIdx, toIdx) {
        const layers = this.getAllLayers();
        // Layer "0" darf nicht bewegt werden (ist immer Index 0)
        if (fromIdx <= 0 || toIdx <= 0) return;
        if (fromIdx === toIdx) return;
        if (fromIdx >= layers.length || toIdx >= layers.length) return;

        // Array umsortieren
        const [moved] = layers.splice(fromIdx, 1);
        layers.splice(toIdx, 0, moved);

        // Order-Werte neu vergeben (Layer "0" bleibt 0)
        for (let i = 0; i < layers.length; i++) {
            layers[i].order = i;
        }

        this._notify();
    }

    /**
     * Layer-Namen als Array
     * @returns {string[]}
     */
    getLayerNames() {
        return this.getAllLayers().map(l => l.name);
    }

    /**
     * Ist Layer sichtbar?
     * @param {string} name
     * @returns {boolean}
     */
    isVisible(name) {
        const layer = this.layers.get(name);
        return layer ? layer.visible : true;
    }

    // ═══ IMPORT / SYNC ═══

    /**
     * Layer aus DXF-Parse-Result importieren
     * Bestehende Layer werden beibehalten, neue hinzugefügt
     * @param {Set|Array} layerNames - Layer-Namen aus dem Parser
     * @param {object} layerColors - Optional: { layerName: aciCode }
     */
    importFromDXF(layerNames, layerColors = {}) {
        const names = layerNames instanceof Set ? Array.from(layerNames) : (layerNames || []);

        for (const name of names) {
            if (!name || this.layers.has(name)) continue;

            const aciCode = layerColors[name];
            const color = aciCode ? aciToHex(aciCode) : this._nextColor();

            this.addLayer(name, { color });
        }

        this._notify();
    }

    /**
     * Entity-Zähler pro Layer aktualisieren
     * @param {Array} contours - Konturen-Array
     */
    updateEntityCounts(contours) {
        // Alle Zähler zurücksetzen
        for (const layer of this.layers.values()) {
            layer.entityCount = 0;
        }

        // Zählen
        if (contours) {
            for (const c of contours) {
                const name = c.layer || '0';
                const layer = this.layers.get(name);
                if (layer) {
                    layer.entityCount++;
                } else {
                    // Layer existiert noch nicht → anlegen
                    this.addLayer(name);
                    const newLayer = this.layers.get(name);
                    if (newLayer) newLayer.entityCount = 1;
                }
            }
        }

        // UI aktualisieren (Dropdown filtert leere Layer)
        this._notify();
    }

    /**
     * Alle Layer zurücksetzen (bei "Neu")
     */
    reset() {
        this.layers.clear();
        this.activeLayer = '0';
        this._addDefaultLayer();
        this._notify();
    }

    /**
     * State als JSON exportieren (für Persistenz)
     */
    toJSON() {
        return {
            activeLayer: this.activeLayer,
            layers: Array.from(this.layers.entries()).map(([name, def]) => ({
                name: def.name,
                color: def.color,
                visible: def.visible,
                locked: def.locked,
                lineType: def.lineType,
                order: def.order ?? 0
            }))
        };
    }

    /**
     * State aus JSON importieren
     */
    fromJSON(data) {
        if (!data) return;
        this.layers.clear();
        if (data.layers) {
            for (let i = 0; i < data.layers.length; i++) {
                const l = data.layers[i];
                this.layers.set(l.name, {
                    name: l.name,
                    color: l.color || '#ffffff',
                    visible: l.visible !== false,
                    locked: l.locked === true,
                    lineType: l.lineType || 'Continuous',
                    entityCount: 0,
                    order: l.order ?? i
                });
            }
        }
        if (!this.layers.has('0')) this._addDefaultLayer();
        this.activeLayer = data.activeLayer || '0';
        this._notify();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  TYPEDEF (JSDoc)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} LayerDef
 * @property {string} name
 * @property {string} color - Hex (#rrggbb)
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {string} lineType - 'Continuous', 'Dashed', 'DashDot', 'Dotted'
 * @property {number} entityCount
 * @property {number} order - Sortier-Reihenfolge (0 = Layer "0", dann aufsteigend)
 */
