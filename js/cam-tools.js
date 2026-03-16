/**
 * CeraCUT CAM-Tools V1.1 — IGEMS Kap. 6 Geometrie-Vorbereitungstools
 * 7 Tools für Analyse, Optimierung und Vorbereitung der Schnittgeometrie
 * 
 * Tools:
 *   Edgefix     (EF)   — Polylinien-Abschnitt durch Arc/Line ersetzen (Glättung)
 *   Replace     (REP)  — Objekte durch Quell-Objekt ersetzen (per Schwerpunkt)
 *   Analyze     (AN)   — Lücken (rot) und Überlappungen (gelb) anzeigen
 *   BoundaryTrim(BT)   — Objekte innerhalb/außerhalb Grenze trimmen/löschen
 *   PolyJoint   (PJ)   — Geschlossene Polylinien verbinden oder aufteilen
 *   Vectorize   (VZ)   — Kurven/Arcs in Liniensegmente umwandeln (Toleranz)
 *   ConvexHull  (HULL) — Konvexes Hüllpolygon um selektierte Objekte
 * 
 * Benötigt: geometry-ops.js V2.1, drawing-tools.js V2.2, ceracut-pipeline.js V3.1
 * 
 * V1.1: Hit-Test Scaling — Klick-Threshold skaliert mit Zoom-Level
 * Created: 2026-02-17 MEZ
 * Build: 20260316-hittest
 */

// ════════════════════════════════════════════════════════════════════════════
//  EDGEFIX TOOL (EF) — Polylinien-Abschnitt durch Arc/Line ersetzen
//  IGEMS Kap. 6.2: Punkt A, Punkt B auf Kontur, dann Punkt C → neuer Arc
// ════════════════════════════════════════════════════════════════════════════

class EdgefixTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.state = 'pickContour';  // pickContour → pickA → pickB → pickC
        this.contour = null;
        this.contourIndex = -1;
        this.segA = null;   // { segmentIndex, point }
        this.segB = null;
        console.log('[CAM-Tools V1.1] EdgefixTool erstellt');
    }

    start() {
        console.log('[CAM-Tools V1.1] Edgefix gestartet');
        this.cmd?.setPrompt('EDGEFIX — Kontur anklicken:');
        this.cmd?.log('🔧 Edgefix: Kontur-Abschnitt durch Arc/Line ersetzen', 'info');
    }

    handleClick(point) {
        const _t0 = performance.now();
        const app = this.manager.app;
        const contours = app?.contours;
        if (!contours) return;

        if (this.state === 'pickContour') {
            // Kontur finden
            const found = this._findContourAtPoint(point, contours);
            if (!found) {
                this.cmd?.log('Keine Kontur gefunden', 'error');
                return;
            }
            this.contour = found.contour;
            this.contourIndex = found.index;
            this.state = 'pickA';
            this.cmd?.setPrompt('EDGEFIX — Startpunkt A auf Kontur anklicken:');
            console.log('[CAM-Tools V1.1] Edgefix: Kontur selektiert, idx=' + found.index);
        }
        else if (this.state === 'pickA') {
            this.segA = this._nearestOnContour(point);
            if (!this.segA) { this.cmd?.log('Punkt nicht auf Kontur', 'error'); return; }
            this.state = 'pickB';
            this.cmd?.setPrompt('EDGEFIX — Endpunkt B auf Kontur anklicken:');
            console.log('[CAM-Tools V1.1] Edgefix: Punkt A bei Segment ' + this.segA.segmentIndex);
        }
        else if (this.state === 'pickB') {
            this.segB = this._nearestOnContour(point);
            if (!this.segB) { this.cmd?.log('Punkt nicht auf Kontur', 'error'); return; }
            if (this.segB.segmentIndex <= this.segA.segmentIndex) {
                this.cmd?.log('Punkt B muss nach Punkt A liegen', 'error');
                return;
            }
            this.state = 'pickC';
            this.cmd?.setPrompt('EDGEFIX — Kurvenpunkt C zwischen A und B anklicken:');
            console.log('[CAM-Tools V1.1] Edgefix: Punkt B bei Segment ' + this.segB.segmentIndex);
        }
        else if (this.state === 'pickC') {
            this._executeEdgefix(point);
            // Zurück zum Anfang für nächste Aktion
            this.state = 'pickContour';
            this.contour = null;
            this.cmd?.setPrompt('EDGEFIX — Kontur anklicken (ESC = Ende):');
        }
        console.log('[CAM-Tools] Edgefix.handleClick: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _findContourAtPoint(point, contours) {
        for (let i = contours.length - 1; i >= 0; i--) {
            const c = contours[i];
            if (c.isReference) continue;
            const pts = c.points;
            if (!pts || pts.length < 2) continue;
            for (let s = 0; s < pts.length - 1; s++) {
                const d = GeometryOps.pointToSegmentDist(point.x, point.y,
                    pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y);
                const scale = this.manager?.app?.renderer?.scale || 1;
                const threshold = Math.max(1.0, 3.0 / scale);
                if (d < threshold) return { contour: c, index: i };
            }
        }
        return null;
    }

    _nearestOnContour(point) {
        const pts = this.contour.points;
        const scale = this.manager?.app?.renderer?.scale || 1;
        const threshold = Math.max(2.0, 5.0 / scale);
        return GeometryOps.findNearestSegment(pts, point.x, point.y, threshold);
    }

    _executeEdgefix(pointC) {
        const _t0 = performance.now();
        const pts = this.contour.points;
        const pA = this.segA.point;
        const pB = this.segB.point;

        // 3-Punkt Arc-Fitting: A, C, B → Kreisbogen berechnen
        const arc = this._fitArc(pA, pointC, pB);

        // Alte Punkte sichern für Undo
        const oldPoints = pts.map(p => ({ x: p.x, y: p.y }));

        // Segment-Bereich A→B durch neuen Arc/Linie ersetzen
        const newPoints = [];
        // Punkte VOR A
        for (let i = 0; i <= this.segA.segmentIndex; i++) {
            newPoints.push({ x: pts[i].x, y: pts[i].y });
        }
        newPoints.push({ x: pA.x, y: pA.y });

        if (arc) {
            // Arc-Punkte einfügen (tesselliert)
            const arcPts = this._tessellateArc(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw);
            for (const ap of arcPts) {
                newPoints.push({ x: ap.x, y: ap.y });
            }
        }
        // Sonst: gerade Linie (nur pB wird eingefügt)

        newPoints.push({ x: pB.x, y: pB.y });
        // Punkte NACH B
        for (let i = this.segB.segmentIndex + 1; i < pts.length; i++) {
            newPoints.push({ x: pts[i].x, y: pts[i].y });
        }

        // Undo-Command
        const contour = this.contour;
        const undoMgr = this.manager.app?.undoManager;
        if (undoMgr) {
            const cmd = {
                execute() {
                    contour.points = newPoints;
                    ModificationTool.invalidateCache(contour);
                },
                undo() {
                    contour.points = oldPoints;
                    ModificationTool.invalidateCache(contour);
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
            this.cmd?.log('✅ Edgefix: Abschnitt ersetzt (' + (arc ? 'Arc' : 'Linie') + ')', 'info');
        }
        this.manager.renderer?.render();
        console.log('[CAM-Tools] Edgefix._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _fitArc(pA, pC, pB) {
        // 3-Punkt Kreisberechnung (Umkreis des Dreiecks A-C-B)
        const ax = pA.x, ay = pA.y;
        const bx = pC.x, by = pC.y;
        const cx = pB.x, cy = pB.y;

        const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(D) < 1e-8) return null; // Kollinear → Linie statt Arc

        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
        const r = Math.hypot(ax - ux, ay - uy);

        // Maximalen Radius begrenzen (wenn fast gerade → Linie)
        if (r > 50000) return null;

        const startAngle = Math.atan2(ay - uy, ax - ux);
        const endAngle = Math.atan2(cy - uy, cx - ux);

        // CCW-Richtung bestimmen über Kreuzprodukt
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const ccw = cross > 0;

        return { cx: ux, cy: uy, r, startAngle, endAngle, ccw };
    }

    _tessellateArc(cx, cy, r, sa, ea, ccw) {
        const pts = [];
        let sweep = ea - sa;
        if (ccw && sweep < 0) sweep += 2 * Math.PI;
        if (!ccw && sweep > 0) sweep -= 2 * Math.PI;

        const steps = Math.max(8, Math.round(Math.abs(sweep) * r / 2));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const angle = sa + sweep * t;
            pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }
        return pts;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  REPLACE TOOL (REP) — Objekte durch Quell-Objekt ersetzen
//  IGEMS Kap. 6.3: Source wählen, Targets wählen → Targets = Kopie(Source)
// ════════════════════════════════════════════════════════════════════════════

class ReplaceTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.state = 'pickSource';
        this.sourceContour = null;
        this.targetContours = [];
        console.log('[CAM-Tools V1.1] ReplaceTool erstellt');
    }

    getToolName() { return 'REPLACE'; }

    start() {
        console.log('[CAM-Tools V1.1] Replace gestartet');
        this.state = 'pickSource';
        this.cmd?.setPrompt('REPLACE — Quell-Objekt (A) anklicken:');
        this.cmd?.log('🔄 Replace: Objekte durch Quell-Objekt ersetzen', 'info');
    }

    handleClick(point) {
        const _t0 = performance.now();
        const contours = this.manager.app?.contours;
        if (!contours) return;

        if (this.state === 'pickSource') {
            const found = this.manager.findContourAtPoint(point);
            if (!found || found.isReference) {
                this.cmd?.log('Kein gültiges Quell-Objekt', 'error');
                return;
            }
            this.sourceContour = found;
            this.state = 'pickTargets';
            this.cmd?.setPrompt('REPLACE — Ziel-Objekte (B,C,...) anklicken, Enter = ausführen:');
            console.log('[CAM-Tools V1.1] Replace: Quell-Objekt gewählt');
        }
        else if (this.state === 'pickTargets') {
            const found = this.manager.findContourAtPoint(point);
            if (!found || found.isReference || found === this.sourceContour) {
                this.cmd?.log('Ungültiges Ziel (gleich wie Quelle oder Referenz)', 'error');
                return;
            }
            if (this.targetContours.indexOf(found) === -1) {
                this.targetContours.push(found);
                found.isSelected = true;
                this.manager.renderer?.render();
                this.cmd?.setPrompt('REPLACE — ' + this.targetContours.length + ' Ziel(e) gewählt (Klick=+, Enter=ausführen):');
                console.log('[CAM-Tools V1.1] Replace: +1 Ziel, gesamt=' + this.targetContours.length);
            }
        }
        console.log('[CAM-Tools] Replace.handleClick: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    finish() {
        if (this.state === 'pickTargets' && this.targetContours.length > 0) {
            this._executeReplace();
        } else if (this.state === 'pickSource') {
            this.cmd?.log('Kein Quell-Objekt gewählt', 'error');
        } else {
            this.cmd?.log('Keine Ziel-Objekte gewählt', 'error');
        }
    }

    _executeReplace() {
        const _t0 = performance.now();
        const app = this.manager.app;
        const contours = app?.contours;
        const undoMgr = app?.undoManager;
        if (!contours || !undoMgr) return;

        const source = this.sourceContour;
        const sourceCentroid = this._centroid(source.points);
        const sourcePointsCopy = source.points.map(p => ({ x: p.x, y: p.y }));

        // Für jedes Target: Schwerpunkt berechnen, Verschiebungsvektor, Punkte kopieren
        const replacements = [];
        for (const target of this.targetContours) {
            const targetCentroid = this._centroid(target.points);
            const dx = targetCentroid.x - sourceCentroid.x;
            const dy = targetCentroid.y - sourceCentroid.y;
            const newPoints = sourcePointsCopy.map(p => ({ x: p.x + dx, y: p.y + dy }));
            replacements.push({
                contour: target,
                oldPoints: target.points.map(p => ({ x: p.x, y: p.y })),
                oldIsClosed: target.isClosed,
                newPoints: newPoints,
                newIsClosed: source.isClosed
            });
        }

        const cmd = {
            execute() {
                for (const r of replacements) {
                    r.contour.points = r.newPoints.map(p => ({ x: p.x, y: p.y }));
                    r.contour.isClosed = r.newIsClosed;
                    ModificationTool.invalidateCache(r.contour);
                }
            },
            undo() {
                for (const r of replacements) {
                    r.contour.points = r.oldPoints.map(p => ({ x: p.x, y: p.y }));
                    r.contour.isClosed = r.oldIsClosed;
                    ModificationTool.invalidateCache(r.contour);
                }
            }
        };
        cmd.execute();
        undoMgr.undoStack.push(cmd);

        // Selektion aufheben
        for (const t of this.targetContours) t.isSelected = false;
        this.manager.renderer?.render();
        this.cmd?.log('✅ Replace: ' + replacements.length + ' Objekt(e) ersetzt', 'info');

        // Reset
        this.state = 'pickSource';
        this.sourceContour = null;
        this.targetContours = [];
        this.cmd?.setPrompt('REPLACE — Quell-Objekt (A) anklicken (ESC = Ende):');
        console.log('[CAM-Tools] Replace._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _centroid(points) {
        if (!points || points.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0;
        for (const p of points) { sx += p.x; sy += p.y; }
        return { x: sx / points.length, y: sy / points.length };
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  ANALYZE TOOL (AN) — Lücken und Überlappungen visualisieren
//  IGEMS Kap. 6.4: Rote Kreise = Lücken, Gelbe Kreise = Überlappungen
// ════════════════════════════════════════════════════════════════════════════

class AnalyzeTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        console.log('[CAM-Tools V1.1] AnalyzeTool erstellt');
    }

    getToolName() { return 'ANALYZE'; }

    start() {
        console.log('[CAM-Tools V1.1] Analyze gestartet');
        // Prüfe ob Konturen selektiert sind (Noun-Verb)
        const preSelected = this.manager.getSelectedContours();
        if (preSelected.length > 0) {
            this.selectedContours = [...preSelected];
            this._executeAnalyze();
        } else {
            this.state = 'select';
            this.cmd?.setPrompt('ANALYZE — Objekte wählen, Enter = analysieren:');
            this.cmd?.log('🔍 Analyze: Lücken und Überlappungen anzeigen', 'info');
        }
    }

    _onSelectionComplete(contours) {
        this._executeAnalyze();
    }

    _executeAnalyze() {
        const _t0 = performance.now();
        const contours = this.selectedContours.length > 0 ? this.selectedContours : this.manager.app?.contours;
        if (!contours || contours.length === 0) {
            this.cmd?.log('Keine Objekte zum Analysieren', 'error');
            return;
        }

        const tolerance = 0.1; // Chaining-Toleranz
        const overlapTolerance = 0.05;
        const gaps = [];
        const overlaps = [];

        // Alle Endpunkte sammeln und paarweise prüfen
        const endpoints = [];
        for (const c of contours) {
            if (c.isReference || !c.points || c.points.length < 2) continue;
            const pts = c.points;
            if (!c.isClosed) {
                endpoints.push({ point: pts[0], contour: c, type: 'start' });
                endpoints.push({ point: pts[pts.length - 1], contour: c, type: 'end' });
            }
            // Geschlossene Konturen: Prüfe ob Start/Ende zusammenpassen
            if (c.isClosed && pts.length >= 2) {
                const d = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
                if (d > tolerance && d < 2.0) {
                    gaps.push({
                        x: (pts[0].x + pts[pts.length - 1].x) / 2,
                        y: (pts[0].y + pts[pts.length - 1].y) / 2,
                        distance: d,
                        type: 'gap'
                    });
                }
            }
        }

        // Paarweise Endpunkt-Vergleich
        for (let i = 0; i < endpoints.length; i++) {
            for (let j = i + 1; j < endpoints.length; j++) {
                if (endpoints[i].contour === endpoints[j].contour) continue;
                const d = Math.hypot(
                    endpoints[i].point.x - endpoints[j].point.x,
                    endpoints[i].point.y - endpoints[j].point.y
                );
                if (d > overlapTolerance && d <= tolerance * 10) {
                    // Lücke erkannt
                    gaps.push({
                        x: (endpoints[i].point.x + endpoints[j].point.x) / 2,
                        y: (endpoints[i].point.y + endpoints[j].point.y) / 2,
                        distance: d,
                        type: 'gap'
                    });
                } else if (d <= overlapTolerance) {
                    // Nahezu identische Endpunkte — Überlappung prüfen
                    overlaps.push({
                        x: endpoints[i].point.x,
                        y: endpoints[i].point.y,
                        distance: d,
                        type: 'overlap'
                    });
                }
            }
        }

        // Segment-Überlappungen prüfen (parallele, überlagerte Segmente)
        for (let i = 0; i < contours.length; i++) {
            for (let j = i + 1; j < contours.length; j++) {
                if (contours[i].isReference || contours[j].isReference) continue;
                const ptsA = contours[i].points;
                const ptsB = contours[j].points;
                if (!ptsA || !ptsB || ptsA.length < 2 || ptsB.length < 2) continue;

                // Stichproben-Check: Mittelpunkte einiger Segmente von A auf B prüfen
                const sampleStep = Math.max(1, Math.floor(ptsA.length / 10));
                for (let s = 0; s < ptsA.length - 1; s += sampleStep) {
                    const mx = (ptsA[s].x + ptsA[s + 1].x) / 2;
                    const my = (ptsA[s].y + ptsA[s + 1].y) / 2;
                    const nearest = GeometryOps.findNearestSegment(ptsB, mx, my, overlapTolerance);
                    if (nearest && nearest.distance < overlapTolerance) {
                        overlaps.push({ x: mx, y: my, distance: nearest.distance, type: 'overlap' });
                    }
                }
            }
        }

        // Ergebnis als Analyse-Markierungen speichern (im Renderer)
        const markers = [];
        for (const g of gaps) {
            markers.push({ x: g.x, y: g.y, radius: Math.max(1.5, g.distance * 3), color: '#FF0000', type: 'gap' });
        }
        for (const o of overlaps) {
            markers.push({ x: o.x, y: o.y, radius: 2.0, color: '#FFFF00', type: 'overlap' });
        }

        // Deduplizieren (nur einzigartige Positionen, Radius 1mm)
        const unique = [];
        for (const m of markers) {
            const dup = unique.find(u => Math.hypot(u.x - m.x, u.y - m.y) < 1.0 && u.type === m.type);
            if (!dup) unique.push(m);
        }

        // Im Renderer als temporäre Overlays speichern
        const renderer = this.manager.renderer;
        if (renderer) {
            renderer._analyzeMarkers = unique;
            renderer.render();
        }

        // Undo: Markierungen hinzufügen/entfernen
        const undoMgr = this.manager.app?.undoManager;
        if (undoMgr) {
            const cmd = {
                execute() { if (renderer) { renderer._analyzeMarkers = unique; renderer.render(); } },
                undo() { if (renderer) { renderer._analyzeMarkers = null; renderer.render(); } }
            };
            undoMgr.undoStack.push(cmd);
        }

        const gapCount = unique.filter(m => m.type === 'gap').length;
        const overlapCount = unique.filter(m => m.type === 'overlap').length;
        this.cmd?.log('✅ Analyze: ' + gapCount + ' Lücke(n) 🔴, ' + overlapCount + ' Überlappung(en) 🟡', 'info');
        if (gapCount === 0 && overlapCount === 0) {
            this.cmd?.log('✅ Geometrie ist sauber — keine Probleme gefunden', 'info');
        }

        this.cancel();
        console.log('[CAM-Tools] Analyze._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  BOUNDARY TRIM TOOL (BT) — Objekte innerhalb/außerhalb Grenze löschen
//  IGEMS Kap. 6.6: Klick auf Begrenzung → alles innerhalb löschen
//  SHIFT = invertiert (alles außerhalb löschen)
// ════════════════════════════════════════════════════════════════════════════

class BoundaryTrimTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.state = 'pickBoundary';
        this.boundaryContour = null;
        console.log('[CAM-Tools V1.1] BoundaryTrimTool erstellt');
    }

    start() {
        console.log('[CAM-Tools V1.1] BoundaryTrim gestartet');
        this.cmd?.setPrompt('BOUNDARY TRIM — Geschlossene Begrenzung anklicken (SHIFT = invertiert):');
        this.cmd?.log('✂️ Boundary Trim: Objekte innerhalb/außerhalb einer Grenze löschen', 'info');
    }

    handleClick(point) {
        const _t0 = performance.now();
        const app = this.manager.app;
        const contours = app?.contours;
        if (!contours) return;

        if (this.state === 'pickBoundary') {
            // Begrenzungskontur finden
            const found = this.manager.findContourAtPoint(point);
            if (!found || !found.isClosed) {
                this.cmd?.log('Bitte eine geschlossene Kontur als Begrenzung wählen', 'error');
                return;
            }
            this.boundaryContour = found;

            // Shift-Status aus letztem Event (wird von ToolManager/Renderer gesetzt)
            const shiftHeld = this.manager._lastShift || false;
            this._executeBoundaryTrim(shiftHeld);

            // Reset für nächste Aktion
            this.boundaryContour = null;
            this.cmd?.setPrompt('BOUNDARY TRIM — Begrenzung anklicken (ESC = Ende):');
        }
        console.log('[CAM-Tools] BoundaryTrim.handleClick: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _executeBoundaryTrim(invertMode) {
        const _t0 = performance.now();
        const app = this.manager.app;
        const contours = app.contours;
        const boundary = this.boundaryContour;
        const boundaryPts = boundary.points;

        // Alle Konturen prüfen die nicht die Boundary sind
        const toDelete = [];

        for (let i = 0; i < contours.length; i++) {
            const c = contours[i];
            if (c === boundary || c.isReference) continue;
            if (!c.points || c.points.length < 2) continue;

            // Schwerpunkt-Test: Ist die Kontur hauptsächlich innerhalb?
            const centroid = this._centroid(c.points);
            const inside = this._pointInPolygon(centroid, boundaryPts);

            // invertMode: SHIFT = alles AUSSERHALB löschen
            const shouldDelete = invertMode ? !inside : inside;

            if (shouldDelete) {
                toDelete.push({ contour: c, index: i });
            }
        }

        if (toDelete.length === 0) {
            this.cmd?.log('Keine Objekte zum Löschen gefunden', 'info');
            console.log('[CAM-Tools] BoundaryTrim._execute: 0ms (nichts zu tun)');
            return;
        }

        // Undo-Command: Konturen löschen (mit Position-Restore)
        const undoMgr = app.undoManager;
        if (undoMgr) {
            const deleted = toDelete.map(d => ({
                contour: d.contour,
                index: contours.indexOf(d.contour)
            }));
            // Rückwärts sortieren für korrektes Splicing
            deleted.sort((a, b) => b.index - a.index);

            const cmd = {
                execute() {
                    for (const d of deleted) {
                        const idx = contours.indexOf(d.contour);
                        if (idx !== -1) contours.splice(idx, 1);
                    }
                },
                undo() {
                    for (let i = deleted.length - 1; i >= 0; i--) {
                        contours.splice(deleted[i].index, 0, deleted[i].contour);
                    }
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
        }

        this.manager.renderer?.render();
        app.updateContourPanel?.();
        const mode = invertMode ? 'außerhalb' : 'innerhalb';
        this.cmd?.log('✅ Boundary Trim: ' + toDelete.length + ' Objekt(e) ' + mode + ' gelöscht', 'info');
        console.log('[CAM-Tools] BoundaryTrim._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _centroid(points) {
        let sx = 0, sy = 0;
        for (const p of points) { sx += p.x; sy += p.y; }
        return { x: sx / points.length, y: sy / points.length };
    }

    _pointInPolygon(point, polygon) {
        let inside = false;
        const x = point.x, y = point.y;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  POLY JOINT TOOL (PJ) — Geschlossene Polylinien verbinden oder aufteilen
//  IGEMS Kap. 6.8: Breite → A→B: Außen→Außen = Split, Innen→Innen = Join
// ════════════════════════════════════════════════════════════════════════════

class PolyJointTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.state = 'width';  // width → pickA → pickB
        this.width = 1.0;
        this.pointA = null;
        console.log('[CAM-Tools V1.1] PolyJointTool erstellt');
    }

    start() {
        console.log('[CAM-Tools V1.1] PolyJoint gestartet');
        this.cmd?.setPrompt('POLY JOINT — Brückenbreite <' + this.width + '>:');
        this.cmd?.log('🔗 Poly Joint: Geschlossene Polylinien verbinden oder aufteilen', 'info');
    }

    handleRawInput(value) {
        if (this.state === 'width') {
            const num = parseFloat(value.trim());
            if (!isNaN(num) && num > 0) {
                this.width = num;
            }
            this.state = 'pickA';
            this.cmd?.setPrompt('POLY JOINT W=' + this.width.toFixed(2) + ' — Punkt A anklicken:');
            return true;
        }
        return false;
    }

    finish() {
        if (this.state === 'width') {
            this.state = 'pickA';
            this.cmd?.setPrompt('POLY JOINT W=' + this.width.toFixed(2) + ' — Punkt A anklicken:');
        }
    }

    handleClick(point) {
        const _t0 = performance.now();
        if (this.state === 'width') {
            this.state = 'pickA';
            this.cmd?.setPrompt('POLY JOINT W=' + this.width.toFixed(2) + ' — Punkt A anklicken:');
        }

        if (this.state === 'pickA') {
            this.pointA = { x: point.x, y: point.y };
            this.state = 'pickB';
            this.cmd?.setPrompt('POLY JOINT — Punkt B anklicken:');
            console.log('[CAM-Tools V1.1] PolyJoint: Punkt A gesetzt');
        }
        else if (this.state === 'pickB') {
            this._executePolyJoint(point);
            // Reset
            this.state = 'pickA';
            this.pointA = null;
            this.cmd?.setPrompt('POLY JOINT W=' + this.width.toFixed(2) + ' — Punkt A anklicken (ESC = Ende):');
        }
        console.log('[CAM-Tools] PolyJoint.handleClick: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    handleMouseMove(point) {
        if (this.state === 'pickB' && this.pointA) {
            this.manager.rubberBand = {
                type: 'line',
                data: { start: this.pointA, end: point }
            };
            this.manager.renderer?.render();
        }
    }

    _executePolyJoint(pointB) {
        const _t0 = performance.now();
        const app = this.manager.app;
        const contours = app?.contours;
        if (!contours) return;

        // Finde Konturen an Punkt A und B
        const contourA = this.manager.findContourAtPoint(this.pointA);
        const contourB = this.manager.findContourAtPoint(pointB);

        if (!contourA || !contourA.isClosed) {
            this.cmd?.log('Punkt A muss auf geschlossener Kontur liegen', 'error');
            return;
        }

        if (contourA === contourB || !contourB) {
            // SPLIT: Beide Punkte auf gleicher Kontur oder B nicht auf Kontur
            this._splitContour(contourA, this.pointA, pointB);
        } else if (contourB && contourB.isClosed) {
            // JOIN: Zwei verschiedene geschlossene Konturen
            this._joinContours(contourA, contourB, this.pointA, pointB);
        } else {
            this.cmd?.log('Punkt B muss auf geschlossener Kontur liegen', 'error');
        }
        console.log('[CAM-Tools] PolyJoint._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _splitContour(contour, pA, pB) {
        const pts = contour.points;
        const nearA = GeometryOps.findNearestSegment(pts, pA.x, pA.y, Infinity);
        const nearB = GeometryOps.findNearestSegment(pts, pB.x, pB.y, Infinity);
        if (!nearA || !nearB) return;

        // Zwei Split-Punkte auf Kontur
        const splitA = nearA.point;
        const splitB = nearB.point;

        const oldPoints = pts.map(p => ({ x: p.x, y: p.y }));
        const oldIsClosed = contour.isClosed;

        // Kontour aufteilen: A→B und B→A
        const idxA = Math.min(nearA.segmentIndex, nearB.segmentIndex);
        const idxB = Math.max(nearA.segmentIndex, nearB.segmentIndex);
        const ptFirst = nearA.segmentIndex <= nearB.segmentIndex ? splitA : splitB;
        const ptSecond = nearA.segmentIndex <= nearB.segmentIndex ? splitB : splitA;

        const part1 = [{ x: ptFirst.x, y: ptFirst.y }];
        for (let i = idxA + 1; i <= idxB; i++) part1.push({ x: pts[i].x, y: pts[i].y });
        part1.push({ x: ptSecond.x, y: ptSecond.y });

        const part2 = [{ x: ptSecond.x, y: ptSecond.y }];
        for (let i = idxB + 1; i < pts.length; i++) part2.push({ x: pts[i].x, y: pts[i].y });
        for (let i = 1; i <= idxA; i++) part2.push({ x: pts[i].x, y: pts[i].y });
        part2.push({ x: ptFirst.x, y: ptFirst.y });

        // Undo
        const undoMgr = this.manager.app?.undoManager;
        const appRef = this.manager.app;
        if (undoMgr && appRef) {
            const contourRef = contour;
            const cmd = {
                _newContour: null,
                execute() {
                    contourRef.points = part1;
                    contourRef.isClosed = false;
                    ModificationTool.invalidateCache(contourRef);
                    const newContour = new CamContour(part2, false);
                    newContour.cuttingMode = 'slit';
                    appRef.contours.push(newContour);
                    this._newContour = newContour;
                },
                undo() {
                    contourRef.points = oldPoints;
                    contourRef.isClosed = oldIsClosed;
                    ModificationTool.invalidateCache(contourRef);
                    const idx = appRef.contours.indexOf(this._newContour);
                    if (idx !== -1) appRef.contours.splice(idx, 1);
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
        }

        this.manager.renderer?.render();
        appRef?.updateContourPanel?.();
        this.cmd?.log('✅ Poly Joint: Kontur aufgeteilt (Split)', 'info');
    }

    _joinContours(contourA, contourB, pA, pB) {
        const ptsA = contourA.points;
        const ptsB = contourB.points;

        const nearA = GeometryOps.findNearestSegment(ptsA, pA.x, pA.y, Infinity);
        const nearB = GeometryOps.findNearestSegment(ptsB, pB.x, pB.y, Infinity);
        if (!nearA || !nearB) return;

        // Neue vereinigte Kontur: A-Abschnitt → Brücke → B-Abschnitt → Brücke zurück
        const newPoints = [];
        // A ab Split-Punkt
        for (let i = nearA.segmentIndex + 1; i < ptsA.length; i++) newPoints.push({ x: ptsA[i].x, y: ptsA[i].y });
        for (let i = 1; i <= nearA.segmentIndex; i++) newPoints.push({ x: ptsA[i].x, y: ptsA[i].y });
        newPoints.push({ x: nearA.point.x, y: nearA.point.y });

        // Brücke A→B
        newPoints.push({ x: nearB.point.x, y: nearB.point.y });

        // B ab Split-Punkt
        for (let i = nearB.segmentIndex + 1; i < ptsB.length; i++) newPoints.push({ x: ptsB[i].x, y: ptsB[i].y });
        for (let i = 1; i <= nearB.segmentIndex; i++) newPoints.push({ x: ptsB[i].x, y: ptsB[i].y });
        newPoints.push({ x: nearB.point.x, y: nearB.point.y });

        // Brücke B→A (schließt)
        newPoints.push({ x: nearA.point.x, y: nearA.point.y });

        // Undo
        const oldPointsA = ptsA.map(p => ({ x: p.x, y: p.y }));
        const oldClosedA = contourA.isClosed;
        const appRef = this.manager.app;
        const undoMgr = appRef?.undoManager;

        if (undoMgr) {
            const cA = contourA;
            const cB = contourB;
            const oldPointsB = ptsB.map(p => ({ x: p.x, y: p.y }));
            const oldClosedB = contourB.isClosed;
            const idxB = appRef.contours.indexOf(contourB);

            const cmd = {
                execute() {
                    cA.points = newPoints;
                    cA.isClosed = true;
                    ModificationTool.invalidateCache(cA);
                    // B entfernen
                    const idx = appRef.contours.indexOf(cB);
                    if (idx !== -1) appRef.contours.splice(idx, 1);
                },
                undo() {
                    cA.points = oldPointsA;
                    cA.isClosed = oldClosedA;
                    ModificationTool.invalidateCache(cA);
                    cB.points = oldPointsB;
                    cB.isClosed = oldClosedB;
                    ModificationTool.invalidateCache(cB);
                    appRef.contours.splice(idxB, 0, cB);
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
        }

        this.manager.renderer?.render();
        appRef?.updateContourPanel?.();
        this.cmd?.log('✅ Poly Joint: 2 Konturen verbunden (Join)', 'info');
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  VECTORIZE TOOL (VZ) — Kurven/Arcs in Liniensegmente umwandeln
//  IGEMS Kap. 6.9: Gegenteil von Curvefit — Toleranz bestimmt Genauigkeit
// ════════════════════════════════════════════════════════════════════════════

class VectorizeTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.tolerance = 0.1;  // mm
        this.state = 'tolerance';
        console.log('[CAM-Tools V1.1] VectorizeTool erstellt');
    }

    getToolName() { return 'VECTORIZE'; }

    start() {
        console.log('[CAM-Tools V1.1] Vectorize gestartet');
        this.state = 'tolerance';
        this.cmd?.setPrompt('VECTORIZE — Toleranz <' + this.tolerance + ' mm>:');
        this.cmd?.log('📐 Vectorize: Kurven in Liniensegmente umwandeln', 'info');
    }

    handleRawInput(value) {
        if (this.state === 'tolerance') {
            const num = parseFloat(value.trim());
            if (!isNaN(num) && num > 0) {
                this.tolerance = num;
            }
            this.state = 'select';
            this.cmd?.setPrompt('VECTORIZE T=' + this.tolerance + 'mm — Objekte wählen, Enter = umwandeln:');
            return true;
        }
        return false;
    }

    finish() {
        if (this.state === 'tolerance') {
            this.state = 'select';
            this.cmd?.setPrompt('VECTORIZE T=' + this.tolerance + 'mm — Objekte wählen, Enter = umwandeln:');
            return;
        }
        // Selektion abschließen
        if (this.state === 'select') {
            const selected = this.manager.getSelectedContours();
            if (selected.length === 0) {
                this.cmd?.log('Keine Objekte ausgewählt', 'error');
                return;
            }
            this.selectedContours = [...selected];
            this._executeVectorize();
        }
    }

    handleClick(point) {
        if (this.state === 'tolerance') {
            this.state = 'select';
            this.cmd?.setPrompt('VECTORIZE T=' + this.tolerance + 'mm — Objekte wählen, Enter = umwandeln:');
        }
        if (this.state === 'select') {
            // Kontur selektieren/deselektieren
            const contour = this.manager.findContourAtPoint(point);
            if (contour && !contour.isReference) {
                contour.isSelected = !contour.isSelected;
                this.manager.renderer?.render();
                const count = this.manager.getSelectedContours().length;
                this.cmd?.setPrompt('VECTORIZE — ' + count + ' Objekt(e) (Enter = umwandeln):');
            }
        }
    }

    _executeVectorize() {
        const _t0 = performance.now();
        const contours = this.selectedContours;
        const tol = this.tolerance;
        let totalBefore = 0;
        let totalAfter = 0;

        const undoData = [];

        for (const c of contours) {
            if (!c.points || c.points.length < 2) continue;
            const pts = c.points;
            const oldPoints = pts.map(p => ({ x: p.x, y: p.y, bulge: p.bulge }));
            totalBefore += pts.length;

            // Alle Punkte mit Bulge (Arc-Segmente) in Liniensegmente tessellieren
            const newPoints = [];
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                newPoints.push({ x: p.x, y: p.y }); // Kein bulge mehr

                if (p.bulge && i < pts.length - 1) {
                    // Arc tessellieren
                    const next = pts[i + 1];
                    const arcPts = this._tessellateArcFromBulge(p, next, p.bulge, tol);
                    for (const ap of arcPts) {
                        newPoints.push({ x: ap.x, y: ap.y });
                    }
                }
            }

            totalAfter += newPoints.length;
            undoData.push({ contour: c, oldPoints, newPoints });
        }

        // Undo-Command
        const undoMgr = this.manager.app?.undoManager;
        if (undoMgr) {
            const cmd = {
                execute() {
                    for (const d of undoData) {
                        d.contour.points = d.newPoints.map(p => ({ x: p.x, y: p.y }));
                        ModificationTool.invalidateCache(d.contour);
                    }
                },
                undo() {
                    for (const d of undoData) {
                        d.contour.points = d.oldPoints.map(p => ({ x: p.x, y: p.y, bulge: p.bulge }));
                        ModificationTool.invalidateCache(d.contour);
                    }
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
        }

        // Selektion aufheben
        for (const c of contours) c.isSelected = false;
        this.manager.renderer?.render();
        this.manager.app?.updateContourPanel?.();
        this.cmd?.log('✅ Vectorize: ' + contours.length + ' Kontur(en), ' + totalBefore + ' → ' + totalAfter + ' Punkte (Tol=' + tol + 'mm)', 'info');
        this.cancel();
        console.log('[CAM-Tools] Vectorize._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    _tessellateArcFromBulge(p1, p2, bulge, tol) {
        const pts = [];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const chord = Math.hypot(dx, dy);
        if (chord < 1e-8) return pts;

        const theta = 4 * Math.atan(Math.abs(bulge));
        const r = chord / (2 * Math.sin(theta / 2));
        if (r < 1e-8) return pts;

        // Schrittanzahl basierend auf Toleranz: n ≈ θ / (2·acos(1 - tol/r))
        const sagitta = r * (1 - Math.cos(theta / (2 * Math.max(2, Math.ceil(theta / (2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r)))))))));
        const stepAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r)));
        const steps = Math.max(2, Math.ceil(theta / stepAngle));

        // Arc-Center berechnen
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const d = r * Math.cos(theta / 2);
        const sign = bulge > 0 ? 1 : -1;
        const cx = mx - sign * d * dy / chord;
        const cy = my + sign * d * dx / chord;

        const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
        const sweep = bulge > 0 ? theta : -theta;

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const angle = startAngle + sweep * t;
            pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }
        return pts;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  CONVEX HULL TOOL (HULL) — Konvexes Hüllpolygon um selektierte Objekte
//  IGEMS Kap. 6.11: Andrew's Monotone Chain Algorithmus
// ════════════════════════════════════════════════════════════════════════════

class ConvexHullTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        console.log('[CAM-Tools V1.1] ConvexHullTool erstellt');
    }

    getToolName() { return 'CONVEX HULL'; }

    start() {
        console.log('[CAM-Tools V1.1] ConvexHull gestartet');
        const preSelected = this.manager.getSelectedContours();
        if (preSelected.length > 0) {
            this.selectedContours = [...preSelected];
            this._executeConvexHull();
        } else {
            this.state = 'select';
            this.cmd?.setPrompt('CONVEX HULL — Objekte wählen, Enter = Hull erzeugen:');
            this.cmd?.log('⬡ Convex Hull: Konvexes Hüllpolygon um Objekte', 'info');
        }
    }

    _onSelectionComplete(contours) {
        this._executeConvexHull();
    }

    _executeConvexHull() {
        const _t0 = performance.now();
        const contours = this.selectedContours;
        if (!contours || contours.length === 0) {
            this.cmd?.log('Keine Objekte ausgewählt', 'error');
            return;
        }

        // Alle Punkte sammeln
        const allPoints = [];
        for (const c of contours) {
            if (!c.points) continue;
            for (const p of c.points) {
                allPoints.push({ x: p.x, y: p.y });
            }
        }

        if (allPoints.length < 3) {
            this.cmd?.log('Mindestens 3 Punkte benötigt', 'error');
            return;
        }

        // Andrew's Monotone Chain
        const hull = this._andrewsMonotoneChain(allPoints);

        if (hull.length < 3) {
            this.cmd?.log('Konvexe Hülle konnte nicht berechnet werden', 'error');
            return;
        }

        // Hülle schließen (letzter Punkt = erster Punkt)
        const hullPoints = hull.map(p => ({ x: p.x, y: p.y }));
        hullPoints.push({ x: hull[0].x, y: hull[0].y });

        // Neue Kontur erstellen
        const app = this.manager.app;
        const undoMgr = app?.undoManager;

        if (app && undoMgr) {
            const newContour = new CamContour(hullPoints, true);
            newContour.cuttingMode = 'disc';

            const cmd = {
                execute() {
                    app.contours.push(newContour);
                },
                undo() {
                    const idx = app.contours.indexOf(newContour);
                    if (idx !== -1) app.contours.splice(idx, 1);
                }
            };
            cmd.execute();
            undoMgr.undoStack.push(cmd);
        }

        // Selektion aufheben
        for (const c of contours) c.isSelected = false;
        this.manager.renderer?.render();
        app?.updateContourPanel?.();
        this.cmd?.log('✅ Convex Hull: Hüllpolygon erzeugt (' + hull.length + ' Ecken, ' + allPoints.length + ' Eingabe-Punkte)', 'info');
        this.cancel();
        console.log('[CAM-Tools] ConvexHull._execute: ' + (performance.now() - _t0).toFixed(2) + 'ms');
    }

    /**
     * Andrew's Monotone Chain Convex Hull — O(n log n)
     * Mathematisch bewiesen, numerisch stabil
     */
    _andrewsMonotoneChain(points) {
        const _t0 = performance.now();
        // Deduplizieren
        const unique = [];
        const seen = new Set();
        for (const p of points) {
            const key = Math.round(p.x * 1000) + ',' + Math.round(p.y * 1000);
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(p);
            }
        }

        if (unique.length < 3) {
            console.log('[CAM-Tools] ConvexHull.andrew: ' + (performance.now() - _t0).toFixed(2) + 'ms (< 3 Punkte)');
            return unique;
        }

        // Sortieren: x aufsteigend, bei Gleichheit y aufsteigend
        unique.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

        const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

        // Untere Hülle
        const lower = [];
        for (const p of unique) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        // Obere Hülle
        const upper = [];
        for (let i = unique.length - 1; i >= 0; i--) {
            const p = unique[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        // Zusammenfügen (letzten Punkt jeder Hälfte weglassen, da er der erste der anderen ist)
        lower.pop();
        upper.pop();
        const result = lower.concat(upper);
        console.log('[CAM-Tools] ConvexHull.andrew: ' + (performance.now() - _t0).toFixed(2) + 'ms (' + result.length + ' Hull-Punkte)');
        return result;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  LAZY-PATCH REGISTRATION — Tools in DrawingToolManager einbinden
//  Gleiches Pattern wie advanced-tools.js / drawing-tools-ext.js
// ════════════════════════════════════════════════════════════════════════════

if (typeof DrawingToolManager !== 'undefined') {
    const _origStartToolCam = DrawingToolManager.prototype.startTool;

    DrawingToolManager.prototype.startTool = function(shortcut) {
        // Einmalig registrieren
        if (!this._camToolsRegistered) {
            this._camToolsRegistered = true;

            this.tools['EF']         = () => new EdgefixTool(this);
            this.tools['EDGEFIX']    = () => new EdgefixTool(this);
            this.tools['REP']        = () => new ReplaceTool(this);
            this.tools['REPLACE']    = () => new ReplaceTool(this);
            this.tools['AN']         = () => new AnalyzeTool(this);
            this.tools['ANALYZE']    = () => new AnalyzeTool(this);
            this.tools['BT']         = () => new BoundaryTrimTool(this);
            this.tools['BTRIM']      = () => new BoundaryTrimTool(this);
            this.tools['PJ']         = () => new PolyJointTool(this);
            this.tools['POLYJOINT']  = () => new PolyJointTool(this);
            this.tools['VZ']         = () => new VectorizeTool(this);
            this.tools['VECTORIZE']  = () => new VectorizeTool(this);
            this.tools['HULL']       = () => new ConvexHullTool(this);
            this.tools['CONVEXHULL'] = () => new ConvexHullTool(this);

            console.debug('[CAM-Tools V1.1] ✅ 7 CAM-Vorbereitungstools registriert (EF, REP, AN, BT, PJ, VZ, HULL)');
        }

        // Auto-Apply gezeichnete Entities bei Mod-Tool-Start
        var key = shortcut.toUpperCase();
        var camModTools = ['REP', 'REPLACE', 'AN', 'ANALYZE', 'BT', 'BTRIM',
                           'VZ', 'VECTORIZE', 'HULL', 'CONVEXHULL'];
        if (camModTools.indexOf(key) !== -1 && this.entities.length > 0) {
            this.commandLine?.log('Auto-Apply: ' + this.entities.length + ' Objekte übernommen', 'info');
            this.applyEntities();
        }

        return _origStartToolCam.call(this, shortcut);
    };

    console.debug('[CAM-Tools V1.1] ✅ Lazy-Patch installiert');
} else {
    console.warn('[CAM-Tools V1.1] ⚠️ DrawingToolManager nicht gefunden — Lazy-Patch übersprungen');
}


// ════════════════════════════════════════════════════════════════════════════
//  RENDERER-ERWEITERUNG: Analyze-Markierungen zeichnen
//  Patcht render() um rote/gelbe Kreise zu zeichnen
// ════════════════════════════════════════════════════════════════════════════

if (typeof CanvasRenderer !== 'undefined') {
    const _origRenderCam = CanvasRenderer.prototype.render;

    CanvasRenderer.prototype.render = function() {
        // Original-Render aufrufen
        const result = _origRenderCam.apply(this, arguments);

        // Analyze-Markierungen zeichnen (falls vorhanden)
        if (this._analyzeMarkers && this._analyzeMarkers.length > 0) {
            const ctx = this.ctx;
            if (!ctx) return result;

            ctx.save();
            // Viewport-Transformation anwenden
            ctx.setTransform(this.dpr * this.zoom, 0, 0, -this.dpr * this.zoom,
                this.dpr * this.panX, this.dpr * (this.canvas.height / this.dpr - this.panY));

            for (const m of this._analyzeMarkers) {
                const screenRadius = Math.max(m.radius, 4 / this.zoom);
                ctx.beginPath();
                ctx.arc(m.x, m.y, screenRadius, 0, Math.PI * 2);
                ctx.strokeStyle = m.color;
                ctx.lineWidth = 2 / this.zoom;
                ctx.stroke();
                // Halbtransparente Füllung
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = m.color;
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }

            ctx.restore();
        }

        return result;
    };

    console.debug('[CAM-Tools V1.1] ✅ Renderer-Patch für Analyze-Markierungen installiert');
}
