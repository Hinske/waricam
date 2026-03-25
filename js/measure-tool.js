/**
 * CeraCUT V1.1 - Measure Tool (IGEMS-Stil)
 * 5 Mess-Modi: Abstand, Radius, Winkel, Fläche, Volumen
 * Version: V1.1
 * Last Modified: 2026-03-25
 * Build: 20260325-circledetect
 *
 * V1.1: _detectCircle: Rechteck nicht mehr als Kreis erkannt (min 8 Punkte ohne Bulge),
 *        Bogen-Rendering in Area-Highlight, Bounds mit Arc-Extents,
 *        Radius-Overlay nur Bogen statt Vollkreis, Arc-HitTest mit Winkelbereich
 */

class MeasureManager {
    constructor(app) {
        this.app = app;
        this.mode = null;          // 'distance' | 'radius' | 'angle' | 'area' | 'volume'
        this.active = false;
        this.phase = 0;            // Klick-Phase
        this.points = [];          // Gesammelte Punkte
        this.currentResult = null; // Letztes Messergebnis
        this.results = [];         // Alle Messergebnisse (für Canvas-Overlay)
        this.mousePos = null;      // Aktuelle Mausposition (für Live-Preview)
        
        // Volumen-Parameter
        this.materialThickness = 8.0; // mm (Standard)
        this.materialDensity = 2.7;   // g/cm³ (Aluminium Standard)
        
        console.debug('[MeasureManager V1.1] initialisiert');
    }
    
    // ════════════════════════════════════════════════════════════════
    // API
    // ════════════════════════════════════════════════════════════════
    
    isActive() { return this.active; }
    getMode() { return this.mode; }
    
    /**
     * Messmodus starten
     * @param {'distance'|'radius'|'angle'|'area'|'volume'} mode
     */
    startMode(mode) {
        console.log(`[MeasureManager] startMode: ${mode}`);
        
        // Andere Modi beenden
        if (this.app.toolManager?.isToolActive()) {
            this.app.toolManager.cancelTool();
        }
        if (this.app.startpointMode) {
            this.app.toggleStartpointMode();
        }
        // Alte measureMode-Kompatibilität
        if (this.app.measureMode && !this.active) {
            this.app.measureMode = false;
        }
        
        this.mode = mode;
        this.active = true;
        this.phase = 0;
        this.points = [];
        this.currentResult = null;
        this.mousePos = null;
        
        // App-Flags synchronisieren
        this.app.measureMode = true;
        this.app.measureStart = null;
        
        // UI
        this.app.renderer.canvas.style.cursor = 'crosshair';
        this._updateStatusText();
        this._showInfoPanel(true);
        
        // Snap aktivieren
        if (this.app.snapManager && this.app.contours?.length) {
            this.app.snapManager.setContours(this.app.contours);
        }
        
        this.app.renderer?.render();
    }
    
    /** Messmodus beenden */
    cancelMode() {
        console.log('[MeasureManager] cancelMode — results cleared:', this.results.length);
        this.active = false;
        this.mode = null;
        this.phase = 0;
        this.points = [];
        this.currentResult = null;
        this.mousePos = null;
        this.results = [];          // V1.1 Fix: Gelbe Messlinien beim Beenden löschen
        
        // App-Flags
        this.app.measureMode = false;
        this.app.measureStart = null;
        this.app.measurements = [];
        
        // UI
        this.app.renderer.canvas.style.cursor = 
            this.app.toolManager?.isToolActive() ? 'crosshair' : 'default';
        this._showInfoPanel(false);
        this._clearStatusText();
        
        // Ribbon-Button deaktivieren
        document.getElementById('btn-measure-wrap')?.classList.remove('active');
        document.getElementById('ct-measure')?.classList.remove('active');
        const ind = document.getElementById('measure-indicator');
        if (ind) ind.style.display = 'none';
        
        this.app.renderer?.render();
    }
    
    /** Alle gespeicherten Messungen löschen */
    clearResults() {
        this.results = [];
        this.app.measurements = [];
        this.app.renderer?.render();
    }
    
    // ════════════════════════════════════════════════════════════════
    // EVENT HANDLING
    // ════════════════════════════════════════════════════════════════
    
    handleClick(worldPoint) {
        if (!this.active) return false;
        
        const point = this.app.currentSnapPoint || worldPoint;
        
        switch (this.mode) {
            case 'distance': return this._handleDistanceClick(point);
            case 'radius':   return this._handleRadiusClick(point);
            case 'angle':    return this._handleAngleClick(point);
            case 'area':     return this._handleAreaClick(point);
            case 'volume':   return this._handleVolumeClick(point);
        }
        return false;
    }
    
    handleMouseMove(worldPos) {
        if (!this.active) return;
        this.mousePos = worldPos;
        
        // Live-Preview für Abstand
        if (this.mode === 'distance' && this.phase === 1 && this.points.length === 1) {
            const p1 = this.points[0];
            const p2 = worldPos;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            this._updateInfoPanel({
                mode: 'distance',
                distance: dist,
                dx: Math.abs(dx),
                dy: Math.abs(dy),
                angle: angle,
                live: true
            });
            this.app.measureStart = p1;
        }
        
        // Live-Preview für Winkel (nach 2 Punkten)
        if (this.mode === 'angle' && this.phase === 2 && this.points.length === 2) {
            const vertex = this.points[0];
            const arm1 = this.points[1];
            const arm2 = worldPos;
            const angle = this._computeAngle(vertex, arm1, arm2);
            this._updateInfoPanel({
                mode: 'angle',
                angle: angle,
                vertex: vertex,
                live: true
            });
        }
        
        this.app.renderer?.render();
    }
    
    // ════════════════════════════════════════════════════════════════
    // ABSTAND (Distance) — 2 Punkte
    // ════════════════════════════════════════════════════════════════
    
    _handleDistanceClick(point) {
        if (this.phase === 0) {
            this.points = [{ x: point.x, y: point.y }];
            this.phase = 1;
            this.app.measureStart = this.points[0];
            this._updateStatusText('Zweiten Punkt anklicken');
            this._showInfoPanel(true);
            return true;
        }
        
        if (this.phase === 1) {
            const p1 = this.points[0];
            const p2 = { x: point.x, y: point.y };
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            const result = {
                mode: 'distance',
                p1, p2, distance,
                dx: Math.abs(dx),
                dy: Math.abs(dy),
                angle
            };
            
            this.currentResult = result;
            this.results.push(result);
            this.app.measurements.push({ p1, p2, distance, dx, dy, angle });
            
            this._updateInfoPanel(result);
            this.app.showToast(`📏 ${distance.toFixed(3)} mm`, 'success');
            
            // Reset für nächste Messung
            this.phase = 0;
            this.points = [];
            this.app.measureStart = null;
            this._updateStatusText();
            this.app.renderer?.render();
            return true;
        }
        
        return false;
    }
    
    // ════════════════════════════════════════════════════════════════
    // RADIUS — Klick auf Kreis/Bogen
    // ════════════════════════════════════════════════════════════════
    
    _handleRadiusClick(point) {
        const found = this._findCircleOrArc(point);
        
        if (!found) {
            this.app.showToast('Kein Kreis oder Bogen gefunden', 'warning');
            return true;
        }
        
        const circumference = 2 * Math.PI * found.radius;
        const area = Math.PI * found.radius * found.radius;
        
        const result = {
            mode: 'radius',
            center: found.center,
            radius: found.radius,
            diameter: found.radius * 2,
            circumference,
            area,
            isArc: found.isArc,
            arcAngle: found.arcAngle || 360,
            arcLength: found.isArc ? (found.arcAngle / 360 * circumference) : circumference
        };
        
        this.currentResult = result;
        this.results.push(result);
        this._updateInfoPanel(result);
        
        this.app.showToast(`⭕ R=${found.radius.toFixed(3)} mm, Ø=${(found.radius*2).toFixed(3)} mm`, 'success');
        this.app.renderer?.render();
        return true;
    }
    
    // ════════════════════════════════════════════════════════════════
    // WINKEL (Angle) — 3 Punkte: Scheitelpunkt + 2 Schenkelpunkte
    // ════════════════════════════════════════════════════════════════
    
    _handleAngleClick(point) {
        if (this.phase === 0) {
            this.points = [{ x: point.x, y: point.y }];
            this.phase = 1;
            this._updateStatusText('Ersten Schenkelpunkt anklicken');
            return true;
        }
        
        if (this.phase === 1) {
            this.points.push({ x: point.x, y: point.y });
            this.phase = 2;
            this._updateStatusText('Zweiten Schenkelpunkt anklicken');
            return true;
        }
        
        if (this.phase === 2) {
            const vertex = this.points[0];
            const arm1 = this.points[1];
            const arm2 = { x: point.x, y: point.y };
            
            const angle = this._computeAngle(vertex, arm1, arm2);
            const supplement = 360 - angle;
            
            const result = {
                mode: 'angle',
                vertex, arm1, arm2,
                angle,
                supplement,
                radians: angle * Math.PI / 180
            };
            
            this.currentResult = result;
            this.results.push(result);
            this._updateInfoPanel(result);
            
            this.app.showToast(`∠ ${angle.toFixed(2)}°`, 'success');
            
            this.phase = 0;
            this.points = [];
            this._updateStatusText();
            this.app.renderer?.render();
            return true;
        }
        
        return false;
    }
    
    // ════════════════════════════════════════════════════════════════
    // FLÄCHE (Area) — Klick auf geschlossene Kontur
    // ════════════════════════════════════════════════════════════════
    
    _handleAreaClick(point) {
        const contour = this.app.renderer?.findContourAtPoint(point.x, point.y);
        
        if (!contour) {
            this.app.showToast('Keine Kontur gefunden — bitte auf eine Kontur klicken', 'warning');
            return true;
        }
        
        if (!contour.isClosed) {
            this.app.showToast('Kontur ist nicht geschlossen — Fläche nur für geschlossene Konturen', 'warning');
            return true;
        }
        
        const area = this._computeArea(contour.points);
        const perimeter = this._computePerimeter(contour.points);
        const bounds = this._computeBounds(contour.points);
        
        const result = {
            mode: 'area',
            contour,
            area,
            areaCm2: area / 100,
            areaM2: area / 1000000,
            perimeter,
            bounds,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
            name: contour.name || 'Kontur'
        };
        
        this.currentResult = result;
        this.results.push(result);
        this._updateInfoPanel(result);
        
        this.app.showToast(`📐 ${area.toFixed(2)} mm² (${(area/100).toFixed(2)} cm²)`, 'success');
        
        this.app.contours.forEach(c => { c.isSelected = false; });
        contour.isSelected = true;
        this.app.renderer?.render();
        return true;
    }
    
    // ════════════════════════════════════════════════════════════════
    // VOLUMEN (Volume) — Klick auf Kontur → Fläche × Dicke
    // ════════════════════════════════════════════════════════════════
    
    _handleVolumeClick(point) {
        const contour = this.app.renderer?.findContourAtPoint(point.x, point.y);
        
        if (!contour) {
            this.app.showToast('Keine Kontur gefunden — bitte auf eine Kontur klicken', 'warning');
            return true;
        }
        
        if (!contour.isClosed) {
            this.app.showToast('Kontur ist nicht geschlossen — Volumen nur für geschlossene Konturen', 'warning');
            return true;
        }
        
        const area = this._computeArea(contour.points);
        const perimeter = this._computePerimeter(contour.points);
        const thickness = this.materialThickness;
        const density = this.materialDensity;
        
        const volumeMm3 = area * thickness;
        const volumeCm3 = volumeMm3 / 1000;
        const weightG = volumeCm3 * density;
        const weightKg = weightG / 1000;
        
        const result = {
            mode: 'volume',
            contour,
            area,
            areaCm2: area / 100,
            perimeter,
            thickness,
            density,
            volumeMm3,
            volumeCm3,
            weightG,
            weightKg,
            name: contour.name || 'Kontur'
        };
        
        this.currentResult = result;
        this.results.push(result);
        this._updateInfoPanel(result);
        
        this.app.showToast(
            `📦 Vol: ${volumeCm3.toFixed(2)} cm³, Gewicht: ${weightG < 1000 ? weightG.toFixed(1) + ' g' : weightKg.toFixed(3) + ' kg'}`,
            'success'
        );
        
        this.app.contours.forEach(c => { c.isSelected = false; });
        contour.isSelected = true;
        this.app.renderer?.render();
        return true;
    }
    
    // ════════════════════════════════════════════════════════════════
    // GEOMETRIE-HELFER
    // ════════════════════════════════════════════════════════════════
    
    _computeAngle(vertex, arm1, arm2) {
        const a1 = Math.atan2(arm1.y - vertex.y, arm1.x - vertex.x);
        const a2 = Math.atan2(arm2.y - vertex.y, arm2.x - vertex.x);
        let angle = (a2 - a1) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        return angle;
    }
    
    _computeArea(points) {
        if (!points || points.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            area += p1.x * p2.y - p2.x * p1.y;
            if (p1.bulge && Math.abs(p1.bulge) > 1e-6) {
                area += this._bulgeSegmentArea(p1, p2, p1.bulge);
            }
        }
        return Math.abs(area / 2);
    }
    
    _bulgeSegmentArea(p1, p2, bulge) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const chord = Math.sqrt(dx * dx + dy * dy);
        if (chord < 1e-10) return 0;
        const sagitta = Math.abs(bulge) * chord / 2;
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);
        const halfAngle = Math.atan2(chord / 2, radius - sagitta);
        const angle = 2 * halfAngle;
        const segArea = radius * radius * (angle - Math.sin(angle)) / 2;
        return bulge > 0 ? segArea * 2 : -segArea * 2;
    }
    
    _computePerimeter(points) {
        if (!points || points.length < 2) return 0;
        let len = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (p1.bulge && Math.abs(p1.bulge) > 1e-6) {
                len += this._bulgeArcLength(p1, p2, p1.bulge);
            } else {
                len += Math.hypot(p2.x - p1.x, p2.y - p1.y);
            }
        }
        return len;
    }
    
    _bulgeArcLength(p1, p2, bulge) {
        const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (chord < 1e-10) return 0;
        const angle = 4 * Math.atan(Math.abs(bulge));
        const radius = chord / (2 * Math.sin(angle / 2));
        return Math.abs(radius * angle);
    }
    
    _computeBounds(points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;

            // Bogen-Extrempunkte: Achsenschnittpunkte (0°/90°/180°/270°) prüfen
            if (i < points.length - 1 && p.bulge && Math.abs(p.bulge) > 1e-6) {
                const p2 = points[i + 1];
                const arc = this._bulgeToArc(p, p2, p.bulge);
                if (!arc) continue;
                const cx = arc.center.x, cy = arc.center.y, r = arc.radius;
                const sa = Math.atan2(p.y - cy, p.x - cx);
                const ea = Math.atan2(p2.y - cy, p2.x - cx);
                const ccw = p.bulge > 0;
                // Prüfe ob Achsenwinkel (0, π/2, π, -π/2) im Bogensweep liegt
                const axisAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
                const axisPoints = [
                    { x: cx + r, y: cy }, { x: cx, y: cy + r },
                    { x: cx - r, y: cy }, { x: cx, y: cy - r }
                ];
                for (let j = 0; j < 4; j++) {
                    if (this._angleInArc(axisAngles[j], sa, ea, ccw)) {
                        const ap = axisPoints[j];
                        if (ap.x < minX) minX = ap.x;
                        if (ap.y < minY) minY = ap.y;
                        if (ap.x > maxX) maxX = ap.x;
                        if (ap.y > maxY) maxY = ap.y;
                    }
                }
            }
        }
        return { minX, minY, maxX, maxY };
    }

    /** Prüft ob ein Winkel im Bogen-Sweep liegt */
    _angleInArc(angle, startAngle, endAngle, ccw) {
        // Normalisiere alle Winkel auf [0, 2π)
        const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const a = norm(angle);
        const s = norm(startAngle);
        const e = norm(endAngle);
        if (ccw) {
            // CCW: von s nach e gegen Uhrzeigersinn
            if (s <= e) return a >= s && a <= e;
            return a >= s || a <= e;
        } else {
            // CW: von s nach e im Uhrzeigersinn
            if (s >= e) return a <= s && a >= e;
            return a <= s || a >= e;
        }
    }
    
    _findCircleOrArc(clickPoint) {
        const tolerance = 15 / (this.app.renderer?.scale || 1);
        
        for (const contour of this.app.contours) {
            if (!contour.points || contour.points.length < 2) continue;
            
            // Kreis erkennen
            if (contour.isClosed && contour.points.length >= 4) {
                const circle = this._detectCircle(contour.points);
                if (circle) {
                    const distToCircle = Math.abs(
                        Math.hypot(clickPoint.x - circle.center.x, clickPoint.y - circle.center.y) - circle.radius
                    );
                    if (distToCircle < tolerance) {
                        return { ...circle, isArc: false, arcAngle: 360 };
                    }
                }
            }
            
            // Bogen-Segmente mit Bulge
            for (let i = 0; i < contour.points.length - 1; i++) {
                const p1 = contour.points[i];
                const p2 = contour.points[i + 1];
                if (p1.bulge && Math.abs(p1.bulge) > 0.01) {
                    const arc = this._bulgeToArc(p1, p2, p1.bulge);
                    if (!arc) continue;
                    const distToArc = Math.abs(
                        Math.hypot(clickPoint.x - arc.center.x, clickPoint.y - arc.center.y) - arc.radius
                    );
                    if (distToArc < tolerance) {
                        // Winkelbereich prüfen: Klick muss im Bogen liegen
                        const startAngle = Math.atan2(p1.y - arc.center.y, p1.x - arc.center.x);
                        const endAngle = Math.atan2(p2.y - arc.center.y, p2.x - arc.center.x);
                        const ccw = p1.bulge > 0;
                        const clickAngle = Math.atan2(clickPoint.y - arc.center.y, clickPoint.x - arc.center.x);
                        if (!this._angleInArc(clickAngle, startAngle, endAngle, ccw)) continue;
                        return {
                            center: arc.center,
                            radius: arc.radius,
                            isArc: true,
                            arcAngle: arc.angle * 180 / Math.PI,
                            startAngle,
                            endAngle,
                            ccw
                        };
                    }
                }
            }
        }
        return null;
    }
    
    _detectCircle(points) {
        const pts = points.slice(0, -1);
        if (pts.length < 3) return null;
        const hasBulge = pts.some(p => p.bulge && Math.abs(p.bulge) > 0.01);
        // Ohne Bulge: mindestens 8 Punkte nötig (Rechteck hat 4, wird sonst als Kreis erkannt)
        if (!hasBulge && pts.length < 8) return null;
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p.x; cy += p.y; }
        cx /= pts.length; cy /= pts.length;
        const radii = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
        const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;
        if (avgR < 0.01) return null;
        const maxDev = Math.max(...radii.map(r => Math.abs(r - avgR)));
        const relDev = maxDev / avgR;
        const threshold = hasBulge ? 0.05 : 0.02;
        if (relDev < threshold) {
            return { center: { x: cx, y: cy }, radius: avgR };
        }
        return null;
    }
    
    _bulgeToArc(p1, p2, bulge) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const chord = Math.sqrt(dx * dx + dy * dy);
        if (chord < 1e-10) return null;
        const sagitta = Math.abs(bulge) * chord / 2;
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const d = Math.sqrt(radius * radius - (chord / 2) * (chord / 2));
        const nx = -dy / chord;
        const ny = dx / chord;
        const sign = bulge > 0 ? 1 : -1;
        const cx = mx + sign * d * nx;
        const cy = my + sign * d * ny;
        const angle = 4 * Math.atan(Math.abs(bulge));
        return { center: { x: cx, y: cy }, radius, angle };
    }
    
    // ════════════════════════════════════════════════════════════════
    // CANVAS RENDERING
    // ════════════════════════════════════════════════════════════════
    
    drawAll(ctx, scale) {
        for (const result of this.results) {
            this._drawResult(ctx, scale, result, 1.0);
        }
        
        // Live-Preview: Rubber-Band für Abstand
        if (this.active && this.mode === 'distance' && this.phase === 1 && this.points.length === 1 && this.mousePos) {
            this._drawDistanceLine(ctx, scale, this.points[0], this.mousePos, 0.5);
        }
        
        // Live-Preview: Winkel-Arme
        if (this.active && this.mode === 'angle' && this.mousePos) {
            if (this.phase === 1 && this.points.length === 1) {
                this._drawAngleLine(ctx, scale, this.points[0], this.mousePos, 0.5);
            }
            if (this.phase === 2 && this.points.length === 2) {
                this._drawAngleLine(ctx, scale, this.points[0], this.points[1], 0.8);
                this._drawAngleLine(ctx, scale, this.points[0], this.mousePos, 0.5);
                this._drawAngleArc(ctx, scale, this.points[0], this.points[1], this.mousePos, 0.5);
            }
        }
        
        // Klickpunkte markieren
        if (this.active && this.points.length > 0) {
            ctx.save();
            for (const p of this.points) {
                const r = 4 / scale;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 / scale;
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    
    _drawResult(ctx, scale, result, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        switch (result.mode) {
            case 'distance': this._drawDistanceLine(ctx, scale, result.p1, result.p2, alpha); this._drawDistanceLabel(ctx, scale, result); break;
            case 'radius': this._drawRadiusResult(ctx, scale, result); break;
            case 'angle': this._drawAngleResult(ctx, scale, result); break;
            case 'area': case 'volume': this._drawAreaHighlight(ctx, scale, result); break;
        }
        ctx.restore();
    }
    
    _drawDistanceLine(ctx, scale, p1, p2, alpha) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([4 / scale, 4 / scale]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    
    _drawDistanceLabel(ctx, scale, result) {
        const mx = (result.p1.x + result.p2.x) / 2;
        const my = (result.p1.y + result.p2.y) / 2;
        const text = `${result.distance.toFixed(2)} mm`;
        const fontSize = Math.max(10, Math.min(14, 12 / scale * 20));
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const app = this.app;
        const sx = (mx - app.renderer.panX) * scale + app.renderer.canvas.width / 2;
        const sy = app.renderer.canvas.height / 2 - (my - app.renderer.panY) * scale;
        ctx.font = `bold ${fontSize}px "Segoe UI", sans-serif`;
        const metrics = ctx.measureText(text);
        const pad = 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(sx - metrics.width / 2 - pad, sy - fontSize - pad, metrics.width + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = '#ffc800';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy - fontSize / 2);
        ctx.restore();
    }
    
    _drawRadiusResult(ctx, scale, result) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.7)';
        ctx.lineWidth = 2.5 / scale;
        ctx.beginPath();
        if (result.isArc && result.startAngle !== undefined) {
            // Nur den tatsächlichen Bogen zeichnen
            ctx.arc(result.center.x, result.center.y, result.radius,
                    result.startAngle, result.endAngle, !result.ccw);
        } else {
            // Vollkreis
            ctx.arc(result.center.x, result.center.y, result.radius, 0, Math.PI * 2);
        }
        ctx.stroke();
        // Mittelpunkt-Kreuz
        const s = 5 / scale;
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(result.center.x - s, result.center.y);
        ctx.lineTo(result.center.x + s, result.center.y);
        ctx.moveTo(result.center.x, result.center.y - s);
        ctx.lineTo(result.center.x, result.center.y + s);
        ctx.stroke();
        // Radius-Linie zum Bogenmittelpunkt oder nach rechts
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(result.center.x, result.center.y);
        if (result.isArc && result.startAngle !== undefined) {
            // Linie zur Mitte des Bogens
            const midAngle = result.ccw
                ? result.startAngle + ((result.arcAngle || 90) * Math.PI / 180) / 2
                : result.startAngle - ((result.arcAngle || 90) * Math.PI / 180) / 2;
            ctx.lineTo(
                result.center.x + result.radius * Math.cos(midAngle),
                result.center.y + result.radius * Math.sin(midAngle)
            );
        } else {
            ctx.lineTo(result.center.x + result.radius, result.center.y);
        }
        ctx.stroke();
        ctx.restore();
    }
    
    _drawAngleResult(ctx, scale, result) {
        if (!result.vertex || !result.arm1 || !result.arm2) return;
        ctx.save();
        this._drawAngleLine(ctx, scale, result.vertex, result.arm1, 0.8);
        this._drawAngleLine(ctx, scale, result.vertex, result.arm2, 0.8);
        this._drawAngleArc(ctx, scale, result.vertex, result.arm1, result.arm2, 0.8);
        ctx.restore();
    }
    
    _drawAngleLine(ctx, scale, from, to, alpha) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    }
    
    _drawAngleArc(ctx, scale, vertex, arm1, arm2, alpha) {
        ctx.save();
        const r = 20 / scale;
        const a1 = Math.atan2(arm1.y - vertex.y, arm1.x - vertex.x);
        const a2 = Math.atan2(arm2.y - vertex.y, arm2.x - vertex.x);
        ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.arc(vertex.x, vertex.y, r, a1, a2, false);
        ctx.stroke();
        ctx.restore();
    }
    
    _drawAreaHighlight(ctx, scale, result) {
        if (!result.contour?.points) return;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 200, 0, 0.1)';
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        const pts = result.contour.points;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            if (p1.bulge && Math.abs(p1.bulge) > 1e-6) {
                const arc = this._bulgeToArc(p1, p2, p1.bulge);
                if (arc) {
                    const startAngle = Math.atan2(p1.y - arc.center.y, p1.x - arc.center.x);
                    const endAngle = Math.atan2(p2.y - arc.center.y, p2.x - arc.center.x);
                    // Negative Bulge = Uhrzeigersinn (CW)
                    ctx.arc(arc.center.x, arc.center.y, arc.radius, startAngle, endAngle, p1.bulge < 0);
                } else {
                    ctx.lineTo(p2.x, p2.y);
                }
            } else {
                ctx.lineTo(p2.x, p2.y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    
    // ════════════════════════════════════════════════════════════════
    // UI PANELS
    // ════════════════════════════════════════════════════════════════
    
    _showInfoPanel(show) {
        const panel = document.getElementById('measure-result-panel');
        if (panel) panel.style.display = show ? 'block' : 'none';
    }
    
    _updateInfoPanel(result) {
        const panel = document.getElementById('measure-result-panel');
        if (!panel) return;
        panel.style.display = 'block';
        
        let html = '';
        
        switch (result.mode) {
            case 'distance':
                html = `
                    <div class="meas-row"><span class="meas-label">Abstand:</span><span class="meas-value">${result.distance.toFixed(3)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">ΔX:</span><span class="meas-value">${result.dx.toFixed(3)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">ΔY:</span><span class="meas-value">${result.dy.toFixed(3)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Winkel:</span><span class="meas-value">${result.angle.toFixed(2)}°</span></div>
                `;
                break;
            case 'radius':
                html = `
                    <div class="meas-row"><span class="meas-label">Radius:</span><span class="meas-value">${result.radius.toFixed(3)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Durchmesser:</span><span class="meas-value">${result.diameter.toFixed(3)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Umfang:</span><span class="meas-value">${result.circumference.toFixed(2)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Kreisfläche:</span><span class="meas-value">${result.area.toFixed(2)} mm²</span></div>
                    <div class="meas-row"><span class="meas-label">Mittelpunkt:</span><span class="meas-value">(${result.center.x.toFixed(2)}, ${result.center.y.toFixed(2)})</span></div>
                    ${result.isArc ? `<div class="meas-row"><span class="meas-label">Bogenwinkel:</span><span class="meas-value">${result.arcAngle.toFixed(1)}°</span></div>` : ''}
                    ${result.isArc ? `<div class="meas-row"><span class="meas-label">Bogenlänge:</span><span class="meas-value">${result.arcLength.toFixed(2)} mm</span></div>` : ''}
                `;
                break;
            case 'angle':
                html = `
                    <div class="meas-row"><span class="meas-label">Winkel:</span><span class="meas-value">${result.angle.toFixed(2)}°</span></div>
                    <div class="meas-row"><span class="meas-label">Supplement:</span><span class="meas-value">${result.supplement?.toFixed(2) || ''}°</span></div>
                    <div class="meas-row"><span class="meas-label">Bogenmaß:</span><span class="meas-value">${result.radians?.toFixed(4) || ''} rad</span></div>
                `;
                break;
            case 'area':
                html = `
                    <div class="meas-row"><span class="meas-label">Fläche:</span><span class="meas-value">${result.area.toFixed(2)} mm²</span></div>
                    <div class="meas-row"><span class="meas-label">Fläche:</span><span class="meas-value">${result.areaCm2.toFixed(4)} cm²</span></div>
                    <div class="meas-row"><span class="meas-label">Umfang:</span><span class="meas-value">${result.perimeter.toFixed(2)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Breite:</span><span class="meas-value">${result.width.toFixed(2)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Höhe:</span><span class="meas-value">${result.height.toFixed(2)} mm</span></div>
                `;
                break;
            case 'volume':
                html = `
                    <div class="meas-row"><span class="meas-label">Fläche:</span><span class="meas-value">${result.areaCm2.toFixed(4)} cm²</span></div>
                    <div class="meas-row"><span class="meas-label">Umfang:</span><span class="meas-value">${result.perimeter.toFixed(2)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Dicke:</span><span class="meas-value">${result.thickness.toFixed(1)} mm</span></div>
                    <div class="meas-row"><span class="meas-label">Volumen:</span><span class="meas-value">${result.volumeCm3.toFixed(3)} cm³</span></div>
                    <div class="meas-row"><span class="meas-label">Dichte:</span><span class="meas-value">${result.density.toFixed(2)} g/cm³</span></div>
                    <div class="meas-row"><span class="meas-label">Gewicht:</span><span class="meas-value">${result.weightG < 1000 ? result.weightG.toFixed(1) + ' g' : result.weightKg.toFixed(3) + ' kg'}</span></div>
                `;
                break;
        }
        
        panel.innerHTML = html;
    }
    
    _updateStatusText(text) {
        const prompt = document.getElementById('cmd-prompt');
        const modeNames = {
            'distance': '📏 Abstand',
            'radius':   '⭕ Radius',
            'angle':    '∠ Winkel',
            'area':     '📐 Fläche',
            'volume':   '📦 Volumen'
        };
        if (text) {
            if (prompt) prompt.textContent = `${modeNames[this.mode] || 'Messen'}: ${text}`;
        } else if (this.mode) {
            const hints = {
                'distance': 'Ersten Punkt anklicken',
                'radius':   'Kreis oder Bogen anklicken',
                'angle':    'Scheitelpunkt anklicken',
                'area':     'Geschlossene Kontur anklicken',
                'volume':   'Geschlossene Kontur anklicken'
            };
            if (prompt) prompt.textContent = `${modeNames[this.mode]}: ${hints[this.mode]}`;
        }
    }
    
    _clearStatusText() {
        const prompt = document.getElementById('cmd-prompt');
        if (prompt) prompt.textContent = 'Befehl:';
    }
    
    setMaterialThickness(mm) {
        this.materialThickness = mm;
        console.log(`[MeasureManager] Material-Dicke: ${mm} mm`);
    }
    
    setMaterialDensity(gcm3) {
        this.materialDensity = gcm3;
        console.log(`[MeasureManager] Material-Dichte: ${gcm3} g/cm³`);
    }
}
