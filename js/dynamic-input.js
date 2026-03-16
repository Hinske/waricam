/**
 * CeraCUT Dynamic Input HUD V1.0
 * AutoCAD-style Koordinatenanzeige am Cursor
 * - Zeigt absolute/relative Koordinaten
 * - Zeigt Distanz + Winkel bei aktivem Tool
 * - Folgt dem Mauszeiger
 * Created: 2026-03-09 MEZ
 * Build: 20260309-dynhud
 */

const DynamicInput = (() => {
    let hudEl = null;
    let enabled = true;
    let lastWorldPos = null;
    let lastBasePoint = null;

    function init() {
        // HUD-Element erstellen
        hudEl = document.createElement('div');
        hudEl.id = 'dynamic-input-hud';
        hudEl.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
            background: rgba(30, 30, 50, 0.92);
            border: 1px solid #4fc3f7;
            border-radius: 3px;
            padding: 2px 6px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
            color: #e0e0e0;
            white-space: nowrap;
            display: none;
            line-height: 1.4;
        `;
        document.body.appendChild(hudEl);
        console.debug('[DynamicInput V1.0] Initialisiert');
    }

    function update(screenX, screenY, worldX, worldY, basePoint) {
        if (!enabled || !hudEl) return;

        lastWorldPos = { x: worldX, y: worldY };
        lastBasePoint = basePoint;

        // Position: rechts unterhalb vom Cursor
        hudEl.style.left = (screenX + 18) + 'px';
        hudEl.style.top = (screenY + 18) + 'px';

        // Inhalt
        let html = '';

        if (basePoint) {
            // Aktives Tool mit Basispunkt → relative Koordinaten + Distanz/Winkel
            const dx = worldX - basePoint.x;
            const dy = worldY - basePoint.y;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            html = `<span style="color:#4fc3f7">Δ</span> ${dx.toFixed(1)}, ${dy.toFixed(1)}`;
            html += `<br><span style="color:#aaa">D:</span> ${dist.toFixed(1)} <span style="color:#aaa">∠</span> ${angle.toFixed(1)}°`;
        } else {
            // Kein Basispunkt → absolute Koordinaten
            html = `<span style="color:#4fc3f7">X:</span> ${worldX.toFixed(1)}  <span style="color:#4fc3f7">Y:</span> ${worldY.toFixed(1)}`;
        }

        hudEl.innerHTML = html;
        hudEl.style.display = 'block';

        // Bildschirmrand-Korrektur
        const rect = hudEl.getBoundingClientRect();
        if (rect.right > window.innerWidth - 5) {
            hudEl.style.left = (screenX - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight - 5) {
            hudEl.style.top = (screenY - rect.height - 10) + 'px';
        }
    }

    function hide() {
        if (hudEl) hudEl.style.display = 'none';
    }

    function toggle() {
        enabled = !enabled;
        if (!enabled) hide();
        return enabled;
    }

    function isEnabled() {
        return enabled;
    }

    function setEnabled(val) {
        enabled = val;
        if (!enabled) hide();
    }

    // Init bei DOM ready
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    return { update, hide, toggle, isEnabled, setEnabled };
})();

// Global
if (typeof window !== 'undefined') {
    window.DynamicInput = DynamicInput;
}
