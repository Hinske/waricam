/**
 * DXF Browser — Server-seitiger Datei-Browser
 *
 * Ermöglicht das Browsen und Laden von DXF-Dateien vom Server-Netzlaufwerk
 * über die /api/dxf/* Endpunkte von server.js.
 *
 * Version: V1.0
 * Last Modified: 2026-03-15
 */

class DXFBrowser {
    constructor(app) {
        this.app = app;
        this.currentPath = localStorage.getItem('ceracut-dxf-browser-path') || '';
        this.overlay = null;
        this.isAvailable = null; // null = ungeprüft
    }

    /**
     * Prüft ob die Server-API verfügbar ist.
     */
    async checkAvailability() {
        try {
            const resp = await fetch('/api/health');
            if (resp.ok) {
                this.isAvailable = true;
                return true;
            }
        } catch { /* nicht verfügbar */ }
        this.isAvailable = false;
        return false;
    }

    /**
     * Öffnet den DXF-Browser-Dialog.
     */
    async open() {
        // Verfügbarkeit prüfen (nur beim ersten Mal)
        if (this.isAvailable === null) {
            await this.checkAvailability();
        }

        if (!this.isAvailable) {
            this.app.showToast('Server-DXF-Browse nicht verfügbar (API antwortet nicht)', 'error');
            return;
        }

        this._createModal();
        this.loadDirectory(this.currentPath || '');
    }

    /**
     * Schließt den Dialog.
     */
    close() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    /**
     * Erstellt das Modal-Overlay.
     */
    _createModal() {
        // Altes Modal entfernen falls vorhanden
        this.close();

        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.style.cssText = 'display:flex; z-index:10000;';

        this.overlay.innerHTML = `
            <div style="width:600px; max-height:80vh; display:flex; flex-direction:column; background:#1e1e1e; border:1px solid #555; border-radius:6px; box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div class="dialog-header" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #444;">
                    <h3 style="margin:0; font-size:14px; color:#e0e0e0;">Server DXF-Dateien</h3>
                    <button class="dxf-browser-close" style="background:none; border:none; color:#888; font-size:18px; cursor:pointer; padding:0 4px;">&times;</button>
                </div>
                <div class="dxf-browser-breadcrumb" style="padding:8px 16px; border-bottom:1px solid #333; font-size:12px; color:#888; display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                </div>
                <div class="dxf-browser-list" style="flex:1; overflow-y:auto; padding:4px 0; min-height:200px;">
                    <div style="padding:40px; text-align:center; color:#666;">Lade...</div>
                </div>
                <div class="dxf-browser-status" style="padding:8px 16px; border-top:1px solid #333; font-size:11px; color:#666;">
                </div>
            </div>
        `;

        // Event: Overlay-Klick schließt
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Event: X-Button
        this.overlay.querySelector('.dxf-browser-close').addEventListener('click', () => this.close());

        // Event: Escape
        this._escHandler = (e) => {
            if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', this._escHandler); }
        };
        document.addEventListener('keydown', this._escHandler);

        document.body.appendChild(this.overlay);
    }

    /**
     * Lädt ein Verzeichnis und zeigt den Inhalt an.
     */
    async loadDirectory(dirPath) {
        this.currentPath = dirPath;
        localStorage.setItem('ceracut-dxf-browser-path', dirPath);
        const listEl = this.overlay?.querySelector('.dxf-browser-list');
        const statusEl = this.overlay?.querySelector('.dxf-browser-status');
        if (!listEl) return;

        listEl.innerHTML = '<div style="padding:40px; text-align:center; color:#666;">Lade...</div>';

        try {
            const resp = await fetch(`/api/dxf/list?path=${encodeURIComponent(dirPath)}`);
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                listEl.innerHTML = `<div style="padding:40px; text-align:center; color:#f44;">Fehler: ${err.error || resp.statusText}</div>`;
                return;
            }

            const data = await resp.json();
            this._renderBreadcrumb(data.path);
            this._renderList(data.items, listEl);

            if (statusEl) {
                const dirs = data.items.filter(i => i.type === 'directory').length;
                const files = data.items.filter(i => i.type === 'file').length;
                statusEl.textContent = `${dirs} Ordner, ${files} DXF-Dateien`;
            }
        } catch (err) {
            listEl.innerHTML = `<div style="padding:40px; text-align:center; color:#f44;">Verbindungsfehler: ${err.message}</div>`;
        }
    }

    /**
     * Rendert die Breadcrumb-Navigation.
     */
    _renderBreadcrumb(currentPath) {
        const el = this.overlay?.querySelector('.dxf-browser-breadcrumb');
        if (!el) return;

        el.innerHTML = '';

        // Root-Link
        const rootLink = document.createElement('span');
        rootLink.textContent = '📁 DXF-Root';
        rootLink.style.cssText = 'cursor:pointer; color:#4fc3f7;';
        rootLink.addEventListener('click', () => this.loadDirectory(''));
        el.appendChild(rootLink);

        if (!currentPath) return;

        // Pfad-Segmente
        const parts = currentPath.split('/').filter(Boolean);
        let accumulated = '';
        for (const part of parts) {
            accumulated += (accumulated ? '/' : '') + part;
            const sep = document.createElement('span');
            sep.textContent = ' / ';
            sep.style.color = '#555';
            el.appendChild(sep);

            const link = document.createElement('span');
            link.textContent = part;
            const linkPath = accumulated;
            link.style.cssText = 'cursor:pointer; color:#4fc3f7;';
            link.addEventListener('click', () => this.loadDirectory(linkPath));
            el.appendChild(link);
        }
    }

    /**
     * Rendert die Dateiliste.
     */
    _renderList(items, listEl) {
        listEl.innerHTML = '';

        if (items.length === 0) {
            listEl.innerHTML = '<div style="padding:40px; text-align:center; color:#666;">Keine DXF-Dateien oder Ordner</div>';
            return;
        }

        // ".." Eintrag wenn nicht im Root
        if (this.currentPath) {
            const upItem = this._createListItem('..', 'directory', 0);
            upItem.addEventListener('click', () => {
                const parent = this.currentPath.split('/').slice(0, -1).join('/');
                this.loadDirectory(parent);
            });
            listEl.appendChild(upItem);
        }

        for (const item of items) {
            const el = this._createListItem(item.name, item.type, item.size);

            if (item.type === 'directory') {
                el.addEventListener('click', () => {
                    const subPath = this.currentPath ? this.currentPath + '/' + item.name : item.name;
                    this.loadDirectory(subPath);
                });
            } else {
                el.addEventListener('click', () => {
                    const filePath = this.currentPath ? this.currentPath + '/' + item.name : item.name;
                    this.selectFile(filePath, item.name, item.size);
                });
            }

            listEl.appendChild(el);
        }
    }

    /**
     * Erstellt ein Listen-Element.
     */
    _createListItem(name, type, size) {
        const el = document.createElement('div');
        el.style.cssText = 'padding:8px 16px; cursor:pointer; display:flex; align-items:center; gap:8px; border-bottom:1px solid #2a2a2a;';

        // Hover-Effekt
        el.addEventListener('mouseenter', () => el.style.background = '#2a3a4a');
        el.addEventListener('mouseleave', () => el.style.background = 'none');

        const icon = document.createElement('span');
        icon.style.fontSize = '14px';
        icon.textContent = type === 'directory' ? '📁' : '📄';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        nameSpan.style.cssText = 'flex:1; color:#e0e0e0; font-size:13px;';

        el.appendChild(icon);
        el.appendChild(nameSpan);

        if (type === 'file' && size > 0) {
            const sizeSpan = document.createElement('span');
            sizeSpan.textContent = (size / 1024).toFixed(1) + ' KB';
            sizeSpan.style.cssText = 'color:#666; font-size:11px;';
            el.appendChild(sizeSpan);
        }

        return el;
    }

    /**
     * Lädt eine ausgewählte DXF-Datei vom Server.
     */
    async selectFile(filePath, fileName, fileSize) {
        const statusEl = this.overlay?.querySelector('.dxf-browser-status');
        if (statusEl) statusEl.textContent = `Lade ${fileName}...`;

        try {
            const resp = await fetch(`/api/dxf/file?path=${encodeURIComponent(filePath)}`);
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                this.app.showToast(`Fehler: ${err.error || resp.statusText}`, 'error');
                return;
            }

            // DXF als ArrayBuffer lesen und als ISO-8859-1 dekodieren
            const buffer = await resp.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let content = '';
            for (let i = 0; i < bytes.length; i++) {
                content += String.fromCharCode(bytes[i]);
            }

            this.close();
            this.app.loadDXFContent(fileName, content, (fileSize / 1024).toFixed(1));

        } catch (err) {
            this.app.showToast(`Verbindungsfehler: ${err.message}`, 'error');
            if (statusEl) statusEl.textContent = 'Fehler beim Laden';
        }
    }
}
