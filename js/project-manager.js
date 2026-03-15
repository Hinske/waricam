/**
 * ProjectManager V1.0
 * Workspace-Verwaltung mit FSAPI
 *
 * Verwaltet einen lokalen Arbeitsordner als "Workspace":
 * - DXF-Dateiliste aus Ordner scannen
 * - Auto-Save (.bak) in regelmässigen Abständen
 * - CNC-Unterordner automatisch erstellen
 * - IndexedDB-Persistenz für Directory-Handle
 *
 * @version 1.0
 * @lastModified 2026-03-13
 * @build 20260313-workspace
 */

class ProjectManager {
    constructor(app) {
        this.app = app;
        this.directoryHandle = null;   // FileSystemDirectoryHandle (Workspace-Root)
        this.cncDirHandle = null;      // FileSystemDirectoryHandle (/CNC Unterordner)
        this.files = [];               // [{name, lastModified, size, handle}]
        this._autoSaveTimer = null;
        this._autoSaveIntervalMs = 60000; // 60s Standard
        this._dbName = 'ceracut-project';
        this._dbStore = 'handles';
        this._isScanning = false;

        console.log('[ProjectManager V1.0] Initialisiert');
    }

    // ═══════════════════════════════════════════════════════════════
    //  FSAPI VERFÜGBARKEIT
    // ═══════════════════════════════════════════════════════════════

    get hasFSAPI() {
        return 'showDirectoryPicker' in window;
    }

    get isWorkspaceOpen() {
        return this.directoryHandle !== null;
    }

    get workspaceName() {
        return this.directoryHandle?.name || '';
    }

    // ═══════════════════════════════════════════════════════════════
    //  WORKSPACE ÖFFNEN / SCHLIESSEN
    // ═══════════════════════════════════════════════════════════════

    /**
     * Öffnet einen Workspace-Ordner via Directory Picker
     * @returns {boolean} true wenn erfolgreich
     */
    async openWorkspace() {
        if (!this.hasFSAPI) {
            this.app.showToast('File System API nicht verfügbar (nur Chrome/Edge)', 'warning');
            return false;
        }

        try {
            this.directoryHandle = await window.showDirectoryPicker({
                id: 'ceracut-workspace',
                mode: 'readwrite',
                startIn: 'documents'
            });

            // Handle in IndexedDB persistieren
            await this._persistHandle('workspace', this.directoryHandle);

            // CNC-Unterordner sicherstellen
            await this.ensureCNCFolder();

            // Workspace scannen
            await this.scanWorkspace();

            // Auto-Save starten
            this.startAutoSave();

            // App-State aktualisieren
            this.app._lastDirHandle = this.directoryHandle;

            console.log(`[ProjectManager V1.0] Workspace geöffnet: ${this.directoryHandle.name}`);
            this.app.showToast(`Workspace: ${this.directoryHandle.name}`, 'success');

            this._updateUI();
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[ProjectManager V1.0] Workspace öffnen fehlgeschlagen:', err);
                this.app.showToast('Workspace konnte nicht geöffnet werden', 'error');
            }
            return false;
        }
    }

    /**
     * Schliesst den aktuellen Workspace
     */
    closeWorkspace() {
        this.stopAutoSave();
        this.directoryHandle = null;
        this.cncDirHandle = null;
        this.files = [];
        this._updateUI();
        console.log('[ProjectManager V1.0] Workspace geschlossen');
    }

    /**
     * Versucht den letzten Workspace aus IndexedDB wiederherzustellen
     * @returns {boolean} true wenn erfolgreich
     */
    async restoreWorkspace() {
        if (!this.hasFSAPI) return false;

        try {
            const handle = await this._restoreHandle('workspace');
            if (!handle) return false;

            // Permission prüfen — queryPermission gibt 'granted' oder 'prompt'
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                this.directoryHandle = handle;
                await this.ensureCNCFolder();
                await this.scanWorkspace();
                this.startAutoSave();
                this.app._lastDirHandle = this.directoryHandle;
                this._updateUI();
                console.log(`[ProjectManager V1.0] Workspace wiederhergestellt: ${handle.name}`);
                return true;
            }

            // Permission muss erneut erteilt werden — UI zeigt "Erneut verbinden"
            this._pendingHandle = handle;
            this._updateUI();
            return false;
        } catch (err) {
            console.warn('[ProjectManager V1.0] Workspace-Wiederherstellung fehlgeschlagen:', err);
            return false;
        }
    }

    /**
     * Erneut verbinden — User klickt Button, Permission-Prompt erscheint
     */
    async reconnectWorkspace() {
        if (!this._pendingHandle) return false;

        try {
            const perm = await this._pendingHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                this.directoryHandle = this._pendingHandle;
                this._pendingHandle = null;
                await this._persistHandle('workspace', this.directoryHandle);
                await this.ensureCNCFolder();
                await this.scanWorkspace();
                this.startAutoSave();
                this.app._lastDirHandle = this.directoryHandle;
                this._updateUI();
                console.log(`[ProjectManager V1.0] Workspace reconnected: ${this.directoryHandle.name}`);
                this.app.showToast(`Workspace: ${this.directoryHandle.name}`, 'success');
                return true;
            }
        } catch (err) {
            console.warn('[ProjectManager V1.0] Reconnect fehlgeschlagen:', err);
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════════════
    //  WORKSPACE SCANNEN
    // ═══════════════════════════════════════════════════════════════

    /**
     * Scannt alle .dxf Dateien im Workspace-Ordner
     */
    async scanWorkspace() {
        if (!this.directoryHandle) return;
        if (this._isScanning) return;

        this._isScanning = true;
        const files = [];

        try {
            for await (const [name, handle] of this.directoryHandle.entries()) {
                if (handle.kind !== 'file') continue;
                if (!name.toLowerCase().endsWith('.dxf')) continue;
                // .bak Dateien ausblenden
                if (name.toLowerCase().endsWith('.bak.dxf')) continue;

                try {
                    const file = await handle.getFile();
                    files.push({
                        name: file.name,
                        lastModified: file.lastModified,
                        size: file.size,
                        handle
                    });
                } catch (err) {
                    // Datei evtl. gesperrt — überspringen
                    console.warn(`[ProjectManager V1.0] Kann ${name} nicht lesen:`, err.message);
                }
            }

            // Alphabetisch sortieren
            files.sort((a, b) => a.name.localeCompare(b.name, 'de'));
            this.files = files;

            console.log(`[ProjectManager V1.0] Scan: ${files.length} DXF-Dateien gefunden`);
            this._updateFileList();
        } catch (err) {
            console.error('[ProjectManager V1.0] Scan fehlgeschlagen:', err);
        } finally {
            this._isScanning = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  DATEI LADEN AUS WORKSPACE
    // ═══════════════════════════════════════════════════════════════

    /**
     * Lädt eine DXF-Datei aus dem Workspace über ihren Namen
     * @param {string} filename
     */
    async loadFileByName(filename) {
        const entry = this.files.find(f => f.name === filename);
        if (!entry) {
            this.app.showToast(`Datei "${filename}" nicht im Workspace gefunden`, 'error');
            return;
        }

        try {
            const file = await entry.handle.getFile();

            // FSAPI-Handle setzen für Ctrl+S
            this.app._dxfFileHandle = entry.handle;
            this.app._lastDirHandle = this.directoryHandle;

            this.app.loadFile(file);

            // Aktive Datei in Liste markieren
            this._highlightFile(filename);

            console.log(`[ProjectManager V1.0] Geladen: ${filename}`);
        } catch (err) {
            console.error(`[ProjectManager V1.0] Laden fehlgeschlagen: ${filename}`, err);
            this.app.showToast(`Fehler beim Laden von "${filename}"`, 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUTO-SAVE
    // ═══════════════════════════════════════════════════════════════

    startAutoSave(intervalMs) {
        this.stopAutoSave();
        if (intervalMs) this._autoSaveIntervalMs = intervalMs;

        this._autoSaveTimer = setInterval(() => this._doAutoSave(), this._autoSaveIntervalMs);
        console.log(`[ProjectManager V1.0] Auto-Save gestartet (${this._autoSaveIntervalMs / 1000}s)`);
    }

    stopAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
            console.log('[ProjectManager V1.0] Auto-Save gestoppt');
        }
    }

    async _doAutoSave() {
        if (!this.directoryHandle) return;
        if (!this.app.contours || this.app.contours.length === 0) return;
        if (!this.app.isDirty) return;

        const baseName = this.app.loadedFileName || 'zeichnung';
        const bakName = baseName.replace(/\.dxf$/i, '') + '.bak.dxf';

        try {
            const result = this.app.dxfWriter.generate(
                this.app.contours,
                this.app.layerManager,
                { filename: bakName }
            );

            const fileHandle = await this.directoryHandle.getFileHandle(bakName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(result.content);
            await writable.close();

            console.log(`[ProjectManager V1.0] Auto-Save: ${bakName} (${(result.content.length / 1024).toFixed(1)} KB)`);
        } catch (err) {
            console.warn('[ProjectManager V1.0] Auto-Save fehlgeschlagen:', err.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  CNC-UNTERORDNER
    // ═══════════════════════════════════════════════════════════════

    /**
     * Erstellt oder öffnet den /CNC Unterordner im Workspace
     */
    async ensureCNCFolder() {
        if (!this.directoryHandle) return null;

        try {
            this.cncDirHandle = await this.directoryHandle.getDirectoryHandle('CNC', { create: true });
            // Global setzen für Intarsia-Export Kompatibilität
            window._cncDirHandle = this.cncDirHandle;

            // CNC-Ordner-Anzeige im Ribbon aktualisieren
            const pathEl = document.getElementById('cnc-folder-path');
            if (pathEl) {
                pathEl.textContent = '📁 ' + this.directoryHandle.name + '/CNC';
                pathEl.title = this.directoryHandle.name + '/CNC';
                pathEl.style.color = '#0a0';
            }

            console.log(`[ProjectManager V1.0] CNC-Ordner: ${this.directoryHandle.name}/CNC`);
            return this.cncDirHandle;
        } catch (err) {
            console.error('[ProjectManager V1.0] CNC-Ordner erstellen fehlgeschlagen:', err);
            return null;
        }
    }

    /**
     * Speichert eine CNC-Datei in den /CNC Unterordner
     * @param {string} filename
     * @param {string} content
     * @returns {boolean}
     */
    async saveCNCFile(filename, content) {
        if (!this.cncDirHandle) {
            await this.ensureCNCFolder();
        }
        if (!this.cncDirHandle) return false;

        try {
            const fileHandle = await this.cncDirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();

            console.log(`[ProjectManager V1.0] CNC gespeichert: CNC/${filename}`);
            return true;
        } catch (err) {
            console.error(`[ProjectManager V1.0] CNC speichern fehlgeschlagen: ${filename}`, err);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  INDEXEDDB PERSISTENZ
    // ═══════════════════════════════════════════════════════════════

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this._dbStore)) {
                    db.createObjectStore(this._dbStore);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _persistHandle(key, handle) {
        try {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readwrite');
                tx.objectStore(this._dbStore).put(handle, key);
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            });
        } catch (err) {
            console.warn('[ProjectManager V1.0] IndexedDB persist fehlgeschlagen:', err);
        }
    }

    async _restoreHandle(key) {
        try {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readonly');
                const req = tx.objectStore(this._dbStore).get(key);
                req.onsuccess = () => { db.close(); resolve(req.result || null); };
                req.onerror = () => { db.close(); reject(req.error); };
            });
        } catch (err) {
            console.warn('[ProjectManager V1.0] IndexedDB restore fehlgeschlagen:', err);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  UI-UPDATE
    // ═══════════════════════════════════════════════════════════════

    _updateUI() {
        const sidebar = document.getElementById('workspace-sidebar');
        const statusEl = document.getElementById('workspace-status');
        const btnOpen = document.getElementById('btn-workspace-open');
        const btnReconnect = document.getElementById('btn-workspace-reconnect');
        const btnClose = document.getElementById('btn-workspace-close');
        const btnRefresh = document.getElementById('btn-workspace-refresh');

        if (this.isWorkspaceOpen) {
            // Sidebar zeigen
            sidebar?.classList.remove('hidden');
            if (statusEl) {
                statusEl.textContent = '📁 ' + this.workspaceName;
                statusEl.style.color = '#0a0';
            }
            if (btnOpen) btnOpen.style.display = 'none';
            if (btnReconnect) btnReconnect.style.display = 'none';
            if (btnClose) btnClose.style.display = '';
            if (btnRefresh) btnRefresh.style.display = '';
        } else if (this._pendingHandle) {
            // Reconnect-Modus
            sidebar?.classList.remove('hidden');
            if (statusEl) {
                statusEl.textContent = this._pendingHandle.name + ' (getrennt)';
                statusEl.style.color = '#e8a020';
            }
            if (btnOpen) btnOpen.style.display = 'none';
            if (btnReconnect) btnReconnect.style.display = '';
            if (btnClose) btnClose.style.display = 'none';
            if (btnRefresh) btnRefresh.style.display = 'none';
        } else {
            // Kein Workspace
            sidebar?.classList.add('hidden');
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.style.color = '';
            }
            if (btnOpen) btnOpen.style.display = '';
            if (btnReconnect) btnReconnect.style.display = 'none';
            if (btnClose) btnClose.style.display = 'none';
            if (btnRefresh) btnRefresh.style.display = 'none';
        }

        this._updateFileList();
    }

    _updateFileList() {
        const listEl = document.getElementById('workspace-file-list');
        if (!listEl) return;

        if (this.files.length === 0) {
            listEl.innerHTML = '<div class="ws-empty">Keine DXF-Dateien</div>';
            return;
        }

        listEl.innerHTML = this.files.map(f => {
            const date = new Date(f.lastModified);
            const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const sizeKB = (f.size / 1024).toFixed(0);
            const isActive = this.app.loadedFileName === f.name;

            return `<div class="ws-file${isActive ? ' active' : ''}" data-filename="${this._escapeHtml(f.name)}" title="${this._escapeHtml(f.name)} — ${sizeKB} KB">
                <div class="ws-file-icon">📄</div>
                <div class="ws-file-info">
                    <div class="ws-file-name">${this._escapeHtml(f.name)}</div>
                    <div class="ws-file-meta">${dateStr} ${timeStr} — ${sizeKB} KB</div>
                </div>
            </div>`;
        }).join('');

        // Klick-Handler auf Datei-Einträge
        listEl.querySelectorAll('.ws-file').forEach(el => {
            el.addEventListener('click', () => {
                const filename = el.dataset.filename;
                if (filename) this.loadFileByName(filename);
            });
        });
    }

    _highlightFile(filename) {
        const listEl = document.getElementById('workspace-file-list');
        if (!listEl) return;
        listEl.querySelectorAll('.ws-file').forEach(el => {
            el.classList.toggle('active', el.dataset.filename === filename);
        });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
