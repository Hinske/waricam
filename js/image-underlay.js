/**
 * CeraCUT Image Underlay V1.0
 * Bild-Hintergrund für Nachzeichnen (AutoCAD IMAGE/IMAGEATTACH)
 * 
 * Features:
 * - Bild-Import per Drag & Drop oder Button (PNG/JPG/BMP/WEBP)
 * - 2-Punkt-Kalibrierung für realen Maßstab
 * - Grips: 4 Ecken (Skalieren) + Mitte (Verschieben)
 * - Properties Panel Integration
 * - Persistenz via IndexedDB (Bild-Blob) + State-JSON (Metadaten)
 * - DXF-kompatible IMAGE Entity (Import + Export)
 * - Undo/Redo für alle Aktionen
 * 
 * Created: 2026-02-16 MEZ
 */

class ImageUnderlayManager {

    static DB_NAME = 'ceracut-images';
    static DB_VERSION = 1;
    static STORE_NAME = 'blobs';

    constructor(app) {
        this.app = app;
        this.underlays = [];  // Array von Underlay-Objekten
        this._db = null;      // IndexedDB Handle
        this._calibrating = null;  // Kalibrierungs-State
        this._placing = null;      // Platzierungs-State (Bild am Cursor)
        this._selectedUnderlay = null;

        this._initDB();
        console.log('[ImageUnderlay V1.0] Manager initialisiert');
    }

    // ═══════════════════════════════════════════════════════════
    // IndexedDB
    // ═══════════════════════════════════════════════════════════

    _initDB() {
        const req = indexedDB.open(ImageUnderlayManager.DB_NAME, ImageUnderlayManager.DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(ImageUnderlayManager.STORE_NAME)) {
                db.createObjectStore(ImageUnderlayManager.STORE_NAME);
            }
        };
        req.onsuccess = (e) => {
            this._db = e.target.result;
            console.log('[ImageUnderlay V1.0] IndexedDB bereit');
        };
        req.onerror = (e) => {
            console.error('[ImageUnderlay V1.0] IndexedDB Fehler:', e.target.error);
        };
    }

    async _storeBlob(key, blob) {
        if (!this._db) return false;
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(ImageUnderlayManager.STORE_NAME, 'readwrite');
            tx.objectStore(ImageUnderlayManager.STORE_NAME).put(blob, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => { console.error('[ImageUnderlay] Store error:', e); reject(e); };
        });
    }

    async _loadBlob(key) {
        if (!this._db) return null;
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(ImageUnderlayManager.STORE_NAME, 'readonly');
            const req = tx.objectStore(ImageUnderlayManager.STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e);
        });
    }

    async _deleteBlob(key) {
        if (!this._db) return;
        return new Promise((resolve) => {
            const tx = this._db.transaction(ImageUnderlayManager.STORE_NAME, 'readwrite');
            tx.objectStore(ImageUnderlayManager.STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // IMPORT
    // ═══════════════════════════════════════════════════════════

    /**
     * Bild-Datei importieren (File-Objekt)
     * Startet Platzierungs-Modus: Bild folgt dem Cursor bis Klick.
     */
    async importImage(file) {
        console.time('[ImageUnderlay] importImage');

        if (!file.type.match(/^image\/(png|jpeg|bmp|webp)/)) {
            this.app?.showToast('Nur PNG, JPG, BMP oder WEBP erlaubt', 'error');
            return null;
        }

        // Blob in IndexedDB speichern
        const id = 'img_' + Date.now();
        const blob = file.slice();  // Kopie als Blob
        await this._storeBlob(id, blob);

        // Image-Element erstellen
        const img = await this._blobToImage(blob);

        const underlay = {
            id,
            filename: file.name,
            image: img,
            insertionPoint: { x: 0, y: 0 },
            scale: 1.0,        // px → World-Units (mm)
            rotation: 0,       // Grad
            opacity: 0.5,
            visible: true,
            locked: false,
            width: img.naturalWidth,
            height: img.naturalHeight,
            _blob: blob         // Referenz für Export
        };

        this.underlays.push(underlay);
        this._selectedUnderlay = underlay;

        console.timeEnd('[ImageUnderlay] importImage');
        console.log(`[ImageUnderlay V1.0] Bild geladen: ${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`);

        // Platzierungs-Modus starten
        this._startPlacement(underlay);
        return underlay;
    }

    _blobToImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve(img);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // PLACEMENT MODE (Bild am Cursor platzieren)
    // ═══════════════════════════════════════════════════════════

    _startPlacement(underlay) {
        this._placing = underlay;
        this.app?.commandLine?.setPrompt('IMAGE — Einfügepunkt angeben:');
        this.app?.showToast('Klicke auf Canvas für Einfügepunkt', 'info');
    }

    /** Vom Canvas-Click aufgerufen */
    handleClick(worldPos) {
        // 1. Platzierung
        if (this._placing) {
            this._placing.insertionPoint = { x: worldPos.x, y: worldPos.y };
            const placed = this._placing;
            this._placing = null;

            // Undo registrieren
            if (this.app?.undoManager) {
                const self = this;
                const cmd = new FunctionCommand(
                    'Image Attach ' + placed.filename,
                    () => { if (!self.underlays.includes(placed)) self.underlays.push(placed); },
                    () => { const idx = self.underlays.indexOf(placed); if (idx >= 0) self.underlays.splice(idx, 1); }
                );
                this.app.undoManager.undoStack.push(cmd);
                if (this.app.undoManager.redoStack) this.app.undoManager.redoStack.length = 0;
            }

            // Kalibrierung anbieten
            this._startCalibration(placed);
            this.app?.renderer?.render();
            return true;
        }

        // 2. Kalibrierung — Punkt 1
        if (this._calibrating?.phase === 'p1') {
            this._calibrating.p1 = { x: worldPos.x, y: worldPos.y };
            this._calibrating.phase = 'p2';
            this.app?.commandLine?.setPrompt('IMAGE KALIBRIERUNG — Zweiten Punkt angeben:');
            return true;
        }

        // 3. Kalibrierung — Punkt 2
        if (this._calibrating?.phase === 'p2') {
            this._calibrating.p2 = { x: worldPos.x, y: worldPos.y };
            this._finishCalibration();
            return true;
        }

        return false;
    }

    /** Maus-Bewegung für Platzierungs-Vorschau */
    handleMouseMove(worldPos) {
        if (this._placing) {
            this._placing.insertionPoint = { x: worldPos.x, y: worldPos.y };
            this.app?.renderer?.render();
        }
    }

    isActive() {
        return !!(this._placing || this._calibrating);
    }

    cancel() {
        if (this._placing) {
            // Bild wieder entfernen
            const idx = this.underlays.indexOf(this._placing);
            if (idx >= 0) this.underlays.splice(idx, 1);
            this._deleteBlob(this._placing.id);
            this._placing = null;
        }
        if (this._calibrating) {
            this._calibrating = null;
        }
        this.app?.commandLine?.setPrompt('Befehl:');
        this.app?.renderer?.render();
    }

    // ═══════════════════════════════════════════════════════════
    // KALIBRIERUNG (2-Punkt)
    // ═══════════════════════════════════════════════════════════

    _startCalibration(underlay) {
        this._calibrating = {
            underlay,
            phase: 'p1',  // 'p1' → 'p2' → 'dist'
            p1: null,
            p2: null
        };
        this.app?.commandLine?.setPrompt('IMAGE KALIBRIERUNG — Ersten Punkt auf dem Bild angeben (bekanntes Maß):');
        this.app?.showToast('2-Punkt-Kalibrierung: Klicke zwei Punkte mit bekanntem Abstand', 'info');
    }

    _finishCalibration() {
        const cal = this._calibrating;
        if (!cal?.p1 || !cal?.p2) return;

        // Pixel-Abstand auf dem Bild
        const ul = cal.underlay;
        const ip = ul.insertionPoint;
        const currentScale = ul.scale || 1;

        // Punkte zurück in Bild-Pixel rechnen
        const px1x = (cal.p1.x - ip.x) / currentScale;
        const px1y = (cal.p1.y - ip.y) / currentScale;
        const px2x = (cal.p2.x - ip.x) / currentScale;
        const px2y = (cal.p2.y - ip.y) / currentScale;
        const pixelDist = Math.hypot(px2x - px1x, px2y - px1y);

        if (pixelDist < 1) {
            this.app?.showToast('Punkte zu nah beieinander!', 'error');
            this._calibrating = null;
            return;
        }

        // Reale Distanz abfragen
        const realDist = parseFloat(prompt(`Realer Abstand zwischen den zwei Punkten (mm):`));
        if (!realDist || realDist <= 0 || isNaN(realDist)) {
            this.app?.showToast('Kalibrierung abgebrochen', 'warning');
            this._calibrating = null;
            this.app?.commandLine?.setPrompt('Befehl:');
            return;
        }

        const oldScale = ul.scale;
        const newScale = realDist / pixelDist;

        ul.scale = newScale;
        console.log(`[ImageUnderlay V1.0] Kalibriert: ${pixelDist.toFixed(1)}px = ${realDist}mm → Scale=${newScale.toFixed(6)}`);
        this.app?.showToast(`Kalibriert: 1px = ${newScale.toFixed(4)}mm`, 'success');

        // Undo für Kalibrierung
        if (this.app?.undoManager) {
            const cmd = new FunctionCommand(
                'Image Calibrate',
                () => { ul.scale = newScale; },
                () => { ul.scale = oldScale; }
            );
            this.app.undoManager.undoStack.push(cmd);
            if (this.app.undoManager.redoStack) this.app.undoManager.redoStack.length = 0;
        }

        this._calibrating = null;
        this.app?.commandLine?.setPrompt('Befehl:');
        this.app?.renderer?.render();
    }

    /** Kalibrierung erneut starten (für UI-Button) */
    recalibrate(underlay) {
        const ul = underlay || this._selectedUnderlay || this.underlays[0];
        if (!ul) return;
        this._startCalibration(ul);
    }

    // ═══════════════════════════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════════════════════════

    /**
     * Alle sichtbaren Underlays im World-Koordinatensystem zeichnen.
     * Wird vom Renderer aufgerufen (ctx ist bereits transformiert: translate + scale(1, -1)).
     */
    drawAll(ctx, scale) {
        for (const ul of this.underlays) {
            if (!ul.visible || !ul.image) continue;

            const ip = ul.insertionPoint;
            const s = ul.scale;
            const w = ul.width * s;
            const h = ul.height * s;

            ctx.save();
            ctx.globalAlpha = ul.opacity;

            // Y-Achse ist im Canvas invertiert (scale(1, -1)),
            // daher müssen wir das Bild nochmal vertikal spiegeln
            ctx.translate(ip.x, ip.y);
            ctx.scale(1, -1);  // Bild richtig herum

            if (ul.rotation) {
                ctx.rotate(-ul.rotation * Math.PI / 180);
            }

            ctx.drawImage(ul.image, 0, 0, w, h);

            ctx.restore();
        }
    }

    /**
     * Grips für selektiertes Bild zeichnen (4 Ecken + Mitte).
     * Im Screen-Koordinatensystem.
     */
    drawGrips(ctx, renderer) {
        const ul = this._selectedUnderlay;
        if (!ul || !ul.visible) return;

        const ip = ul.insertionPoint;
        const s = ul.scale;
        const w = ul.width * s;
        const h = ul.height * s;

        // Eckpunkte in Welt-Koordinaten (Bild wächst nach +X und +Y)
        const corners = [
            { x: ip.x, y: ip.y },            // Unten-Links (Insertion)
            { x: ip.x + w, y: ip.y },        // Unten-Rechts
            { x: ip.x + w, y: ip.y + h },    // Oben-Rechts
            { x: ip.x, y: ip.y + h },        // Oben-Links
        ];
        const center = { x: ip.x + w / 2, y: ip.y + h / 2 };

        const size = 5;
        ctx.fillStyle = '#4488FF';

        for (const p of corners) {
            const sp = renderer.worldToScreen(p.x, p.y);
            ctx.fillRect(sp.x - size, sp.y - size, size * 2, size * 2);
        }
        // Mitte: etwas größer
        const sc = renderer.worldToScreen(center.x, center.y);
        ctx.fillStyle = '#44FF88';
        ctx.fillRect(sc.x - size, sc.y - size, size * 2, size * 2);

        // Rahmen (gestrichelt)
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#4488FF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const s0 = renderer.worldToScreen(corners[0].x, corners[0].y);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i <= 4; i++) {
            const si = renderer.worldToScreen(corners[i % 4].x, corners[i % 4].y);
            ctx.lineTo(si.x, si.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ═══════════════════════════════════════════════════════════
    // HIT-TEST & SELEKTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Prüft ob ein Welt-Punkt auf einem Underlay liegt.
     * @returns {object|null} Underlay oder null
     */
    hitTest(worldX, worldY) {
        // Rückwärts iterieren (oberstes Bild zuerst)
        for (let i = this.underlays.length - 1; i >= 0; i--) {
            const ul = this.underlays[i];
            if (!ul.visible) continue;
            const ip = ul.insertionPoint;
            const s = ul.scale;
            const w = ul.width * s;
            const h = ul.height * s;

            if (worldX >= ip.x && worldX <= ip.x + w &&
                worldY >= ip.y && worldY <= ip.y + h) {
                return ul;
            }
        }
        return null;
    }

    select(underlay) {
        this._selectedUnderlay = underlay;
    }

    deselect() {
        this._selectedUnderlay = null;
    }

    get selectedUnderlay() {
        return this._selectedUnderlay;
    }

    // ═══════════════════════════════════════════════════════════
    // MODIFIKATION
    // ═══════════════════════════════════════════════════════════

    setOpacity(underlay, value) {
        const old = underlay.opacity;
        underlay.opacity = Math.max(0.05, Math.min(1.0, value));
        if (this.app?.undoManager) {
            const cmd = new FunctionCommand(
                'Image Opacity',
                () => { underlay.opacity = value; },
                () => { underlay.opacity = old; }
            );
            this.app.undoManager.undoStack.push(cmd);
            if (this.app.undoManager.redoStack) this.app.undoManager.redoStack.length = 0;
        }
        this.app?.renderer?.render();
    }

    removeUnderlay(underlay) {
        const idx = this.underlays.indexOf(underlay);
        if (idx < 0) return;

        this.underlays.splice(idx, 1);
        if (this._selectedUnderlay === underlay) this._selectedUnderlay = null;
        this._deleteBlob(underlay.id);

        // Undo
        if (this.app?.undoManager) {
            const self = this;
            const cmd = new FunctionCommand(
                'Image Remove ' + underlay.filename,
                () => { const i = self.underlays.indexOf(underlay); if (i >= 0) self.underlays.splice(i, 1); },
                () => { self.underlays.splice(idx, 0, underlay); self._storeBlob(underlay.id, underlay._blob); }
            );
            this.app.undoManager.undoStack.push(cmd);
            if (this.app.undoManager.redoStack) this.app.undoManager.redoStack.length = 0;
        }

        this.app?.renderer?.render();
    }

    toggleVisibility(underlay) {
        underlay.visible = !underlay.visible;
        this.app?.renderer?.render();
    }

    // ═══════════════════════════════════════════════════════════
    // PERSISTENZ — State für Save/Load
    // ═══════════════════════════════════════════════════════════

    /** Metadaten für JSON-State (ohne Bild-Blob) */
    getStateForSave() {
        return this.underlays.map(ul => ({
            id: ul.id,
            filename: ul.filename,
            insertionPoint: { ...ul.insertionPoint },
            scale: ul.scale,
            rotation: ul.rotation,
            opacity: ul.opacity,
            visible: ul.visible,
            locked: ul.locked,
            width: ul.width,
            height: ul.height
        }));
    }

    /** Aus gespeichertem State + IndexedDB wiederherstellen */
    async restoreFromState(metaArray) {
        if (!metaArray || !Array.isArray(metaArray)) return;
        this.underlays = [];

        for (const meta of metaArray) {
            try {
                const blob = await this._loadBlob(meta.id);
                if (!blob) {
                    console.warn(`[ImageUnderlay] Bild ${meta.filename} (${meta.id}) nicht in IndexedDB gefunden — übersprungen`);
                    continue;
                }
                const img = await this._blobToImage(blob);
                this.underlays.push({
                    ...meta,
                    image: img,
                    _blob: blob
                });
                console.log(`[ImageUnderlay V1.0] Bild wiederhergestellt: ${meta.filename}`);
            } catch (err) {
                console.error(`[ImageUnderlay] Fehler beim Laden von ${meta.filename}:`, err);
            }
        }
        this.app?.renderer?.render();
    }

    // ═══════════════════════════════════════════════════════════
    // DXF EXPORT (IMAGE Entity + IMAGEDEF)
    // ═══════════════════════════════════════════════════════════

    /**
     * DXF-Zeilen für IMAGE Entities generieren.
     * Wird vom DXFWriter aufgerufen.
     * @returns {string[]} Array von DXF-Zeilen
     */
    getDXFEntities() {
        const lines = [];
        for (const ul of this.underlays) {
            // IMAGE Entity (Platzierung)
            lines.push('  0', 'IMAGE');
            lines.push('  8', '0');           // Layer
            lines.push(' 10', ul.insertionPoint.x.toFixed(6));  // Insertion X
            lines.push(' 20', ul.insertionPoint.y.toFixed(6));  // Insertion Y
            lines.push(' 30', '0.0');                            // Insertion Z
            // U-Vektor (Scale + Rotation X-Richtung)
            const cosA = Math.cos((ul.rotation || 0) * Math.PI / 180) * ul.scale;
            const sinA = Math.sin((ul.rotation || 0) * Math.PI / 180) * ul.scale;
            lines.push(' 11', cosA.toFixed(6));   // U-vector X
            lines.push(' 21', sinA.toFixed(6));   // U-vector Y
            lines.push(' 31', '0.0');
            // V-Vektor
            lines.push(' 12', (-sinA).toFixed(6));  // V-vector X
            lines.push(' 22', cosA.toFixed(6));     // V-vector Y
            lines.push(' 32', '0.0');
            // Image Size in Pixels
            lines.push(' 13', ul.width.toFixed(1));
            lines.push(' 23', ul.height.toFixed(1));
            // Dateiname als XDATA
            lines.push('1001', 'CERACUT_IMAGE');
            lines.push('1000', ul.filename);
        }
        return lines;
    }

    /**
     * IMAGE Entity aus DXF-Parser-Daten importieren.
     * Zeigt dem User einen File-Picker für das referenzierte Bild.
     * @param {object} imageData - Geparste IMAGE Entity { filename, insertionPoint, uVector, vVector, pixelWidth, pixelHeight }
     */
    async importFromDXF(imageData) {
        console.log(`[ImageUnderlay V1.0] DXF IMAGE Entity gefunden: ${imageData.filename}`);

        // User nach der Bild-Datei fragen
        let file = null;

        if ('showOpenFilePicker' in window) {
            try {
                this.app?.showToast(`Bild "${imageData.filename}" wird referenziert — bitte Datei auswählen`, 'info');
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'Bilddateien', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.bmp', '.webp'] } }],
                    multiple: false
                });
                file = await handle.getFile();
            } catch (err) {
                if (err.name !== 'AbortError') console.error('[ImageUnderlay] File picker error:', err);
                return null;
            }
        } else {
            // Fallback: HTML <input type="file">
            file = await this._promptFileInput();
        }

        if (!file) return null;

        // Bild importieren
        const ul = await this.importImage(file);
        if (!ul) return null;

        // DXF-Metadaten übernehmen
        ul.insertionPoint = imageData.insertionPoint || { x: 0, y: 0 };
        ul.scale = Math.hypot(imageData.uVector?.x || 1, imageData.uVector?.y || 0);
        ul.rotation = Math.atan2(imageData.uVector?.y || 0, imageData.uVector?.x || 1) * 180 / Math.PI;

        // Platzierungs-Modus abbrechen (Position kommt aus DXF)
        this._placing = null;
        this._calibrating = null;
        this.app?.commandLine?.setPrompt('Befehl:');

        console.log(`[ImageUnderlay V1.0] DXF IMAGE importiert: scale=${ul.scale.toFixed(4)}, rot=${ul.rotation.toFixed(1)}°`);
        this.app?.renderer?.render();
        return ul;
    }

    _promptFileInput() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => resolve(input.files[0] || null);
            input.click();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════════

    clear() {
        for (const ul of this.underlays) {
            this._deleteBlob(ul.id);
        }
        this.underlays = [];
        this._selectedUnderlay = null;
        this._placing = null;
        this._calibrating = null;
    }
}
