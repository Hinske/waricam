/**
 * CeraCUT Advanced Tools V1.5 — Tier 5 CAD Tools
 * 14 CAD-Werkzeuge + Ribbon-Alias-Fix
 *
 * V1.5: Overkill-Tool (OK) — Duplikate + überlappende Linien entfernen, Toleranz-Dialog
 * V1.4: Aufteilen-Werkzeuge (CL2D, CLND, CLDCL)
 * V1.3: Offset Ghost-Preview (handleMouseMove), Chamfer Continuous Mode + finish()
 * V1.2: Arabeske-Tool (AB) — Parametrische Laternenfliese, 8 Kreisbögen, Fugen-Offset
 * V1.1: Fillet Continuous Mode + Bogen-Preview, Trim Hover-Preview (Rot gestrichelt)
 * V1.0: Initial 12 Tools
 *
 * Tools: Fillet (F), Trim (T), Offset (O), Extend (EX), Chamfer (CH),
 *        Zero Fillet (ZF), Boolean (BO), N-gon (NG), Obround (OB),
 *        Array (AR), Lengthen (LE), Boundary Poly (BP), Arabeske (AB),
 *        Overkill (OK)
 *
 * Benötigt: geometry-ops.js V2.2, drawing-tools.js V2.3
 *
 * Last Modified: 2026-03-11 MEZ
 * Build: 20260311-offset
 */

// ════════════════════════════════════════════════════════════════════════════
//  FILLET TOOL (F) — Tangentialer Bogen zwischen zwei Segmenten
// ════════════════════════════════════════════════════════════════════════════

class FilletTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.radius = 2.0;
        this.state = 'radius';
        this.seg1Contour = null;
        this.seg1Index = -1;
    }

    start() {
        this.cmd?.setPrompt('FILLET — Radius <' + this.radius + '> [P=Polylinie]:');
        this.cmd?.log('🔵 Fillet: Radius eingeben oder Enter für R=' + this.radius + ', P = Polyline', 'info');
    }

    handleRawInput(value) {
        var upper = value.trim().toUpperCase();
        if (this.state === 'radius' || this.state === 'pick1') {
            if (upper === 'P') {
                this.state = 'pickPoly';
                this.cmd?.setPrompt('FILLET [Polyline] R=' + this.radius + ' — Kontur anklicken:');
                return true;
            }
            // Enter ohne Eingabe → mit aktuellem Radius weitermachen
            if (value.trim() === '') {
                this.state = 'pick1';
                this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Erstes Segment anklicken [P=Polylinie]:');
                return true;
            }
            var num = parseFloat(value);
            if (!isNaN(num) && num >= 0) {
                this.radius = num;
                this.state = 'pick1';
                this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Erstes Segment anklicken [P=Polylinie]:');
                return true;
            }
        }
        return false;
    }

    // V3.10: Enter/Space leiten auch an handleRawInput weiter
    finish() {
        if (this.state === 'radius') {
            this.state = 'pick1';
            this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Erstes Segment anklicken [P=Polylinie]:');
            return;
        }
    }

    handleClick(point) {
        var app = this.manager.app;
        var contours = app?.contours;
        if (!contours) return;

        if (this.state === 'radius') {
            this.state = 'pick1';
            this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Erstes Segment anklicken [P=Polylinie]:');
        }

        if (this.state === 'pickPoly') {
            this._executePolylineFillet(point);
            return;
        }

        var tolerance = 10 / (this.manager.renderer?.scale || 1);
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked) { this.cmd?.log('Keine Kontur getroffen', 'warning'); return; }

        var hit = GeometryOps.findNearestSegment(clicked.points, point.x, point.y, tolerance);
        if (!hit) { this.cmd?.log('Segment nicht getroffen — näher klicken', 'warning'); return; }

        if (this.state === 'pick1') {
            this.seg1Contour = clicked;
            this.seg1Index = hit.segmentIndex;
            this.state = 'pick2';
            this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Zweites Segment anklicken' + (this.radius === 0 ? ' (auch andere Kontur):' : ' (benachbart):'));
            // V3.10: Erstes Segment als Cyan Highlight zeigen
            this._updatePreview(null);
            return;
        }

        if (this.state === 'pick2') {
            if (clicked !== this.seg1Contour) {
                // V3.13: Cross-Contour Zero Fillet (wie AutoCAD FILLET R=0)
                if (this.radius === 0) {
                    this._executeCrossContourZeroFillet(this.seg1Contour, this.seg1Index, clicked, hit.segmentIndex);
                } else {
                    this.cmd?.log('Cross-Contour nur mit R=0 möglich', 'error');
                }
                return;
            }
            this._executeTwoSegmentFillet(clicked, this.seg1Index, hit.segmentIndex);
        }
    }

    // V3.10: Fillet-Preview bei Mousemove (Bogen-Vorschau + Segment-Highlight)
    handleMouseMove(point) {
        if (this.state !== 'pick2' || !this.seg1Contour) return;

        var tolerance = 10 / (this.manager.renderer?.scale || 1);
        var hovered = this.manager.renderer?.findContourAtPoint(point.x, point.y);

        // Cross-Contour Preview bei R=0
        if (hovered !== this.seg1Contour) {
            if (this.radius === 0 && hovered) {
                var hitB = GeometryOps.findNearestSegment(hovered.points, point.x, point.y, tolerance);
                if (hitB) {
                    this._updateCrossContourPreview(this.seg1Contour, this.seg1Index, hovered, hitB.segmentIndex);
                    return;
                }
            }
            this._updatePreview(null);
            return;
        }

        var hit = GeometryOps.findNearestSegment(hovered.points, point.x, point.y, tolerance);
        if (!hit) { this._updatePreview(null); return; }

        // Prüfe Nachbarschaft zum ersten Segment
        var cornerIdx = this._getCornerIndex(hovered, this.seg1Index, hit.segmentIndex);
        if (cornerIdx === null) { this._updatePreview(null); return; }

        // Fillet berechnen und als Preview zeigen
        var pts = hovered.points;
        var isClosed = hovered.isClosed;
        var pPrev = pts[cornerIdx - 1 >= 0 ? cornerIdx - 1 : (isClosed ? pts.length - 2 : 0)];
        var pCorner = pts[cornerIdx];
        var pNext = pts[cornerIdx + 1 < pts.length ? cornerIdx + 1 : (isClosed ? 1 : pts.length - 1)];

        if (this.radius === 0) {
            var isect = GeometryOps.lineLineIntersection(pPrev, pCorner, pCorner, pNext);
            this._updatePreview(isect ? [isect.point] : null);
        } else {
            var fillet = GeometryOps.computeFillet(pPrev, pCorner, pNext, this.radius);
            this._updatePreview(fillet ? fillet.arcPoints : null);
        }
    }

    // V3.10: RubberBand-Aktualisierung
    _updatePreview(arcPoints) {
        var segments = [];
        // Erstes Segment immer als Highlight zeigen
        if (this.seg1Contour && this.seg1Index >= 0) {
            var pts = this.seg1Contour.points;
            if (this.seg1Index < pts.length - 1) {
                segments.push({
                    start: { x: pts[this.seg1Index].x, y: pts[this.seg1Index].y },
                    end: { x: pts[this.seg1Index + 1].x, y: pts[this.seg1Index + 1].y }
                });
            }
        }
        this.manager.rubberBand = {
            type: 'filletPreview',
            data: {
                segments: segments,
                arcPoints: arcPoints || []
            }
        };
        this.manager.renderer?.render();
    }

    // Hilfsfunktion: Gemeinsame Ecke zweier Segment-Indizes finden
    _getCornerIndex(contour, segIdx1, segIdx2) {
        var pts = contour.points;
        if (!pts || pts.length < 3) return null;
        var diff = Math.abs(segIdx1 - segIdx2);
        if (diff === 1) return Math.max(segIdx1, segIdx2);
        // Wrap-Around bei geschlossener Kontur
        var n = pts.length - 1; // Segmentzahl
        if (contour.isClosed) {
            if ((segIdx1 === 0 && segIdx2 === n - 1) || (segIdx2 === 0 && segIdx1 === n - 1)) {
                return 0;
            }
        }
        return null;
    }

    _executeTwoSegmentFillet(contour, segIdx1, segIdx2) {
        var app = this.manager.app;
        var pts = contour.points;
        if (!pts || pts.length < 3) return;

        var cornerIdx = this._getCornerIndex(contour, segIdx1, segIdx2);
        if (cornerIdx === null) {
            this.cmd?.log('Segmente müssen benachbart sein (gemeinsame Ecke)', 'error');
            this._resetToPick1();
            return;
        }

        var isClosed = contour.isClosed;
        var pPrev = pts[cornerIdx - 1 >= 0 ? cornerIdx - 1 : (isClosed ? pts.length - 2 : 0)];
        var pCorner = pts[cornerIdx];
        var pNext = pts[cornerIdx + 1 < pts.length ? cornerIdx + 1 : (isClosed ? 1 : pts.length - 1)];

        if (this.radius === 0) {
            var isect = GeometryOps.lineLineIntersection(pPrev, pCorner, pCorner, pNext);
            if (!isect) { this.cmd?.log('Kein Schnittpunkt', 'error'); return; }
            this._applyVertexChange(contour, cornerIdx, [isect.point], app);
            return;
        }

        var fillet = GeometryOps.computeFillet(pPrev, pCorner, pNext, this.radius);
        if (!fillet) {
            this.cmd?.log('Radius ' + this.radius + ' zu groß für diese Ecke', 'error');
            this._resetToPick1();
            return;
        }
        this._applyVertexChange(contour, cornerIdx, fillet.arcPoints, app);
    }

    _applyVertexChange(contour, cornerIdx, replacementPoints, app) {
        var oldPoints = contour.points.map(function(p) { return {x: p.x, y: p.y}; });
        var newPoints = [];
        for (var i = 0; i < cornerIdx; i++) newPoints.push({x: contour.points[i].x, y: contour.points[i].y});
        for (var j = 0; j < replacementPoints.length; j++) newPoints.push({x: replacementPoints[j].x, y: replacementPoints[j].y});
        for (var k = cornerIdx + 1; k < contour.points.length; k++) newPoints.push({x: contour.points[k].x, y: contour.points[k].y});

        var rerender = function() {
            ModificationTool.invalidateCache(contour);
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        var radius = this.radius;
        var cmd = new FunctionCommand(
            'Fillet R=' + radius + ' auf ' + contour.name,
            function() { contour.points = newPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
            function() { contour.points = oldPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Fillet R=' + radius + ' angewendet (Strg+Z = Rückgängig)', 'success');
        // V3.10: Continuous Mode — Tool bleibt aktiv!
        this._resetToPick1();
    }

    // ════ V3.13: Cross-Contour Zero Fillet ════
    // Zwei separate Konturen zum Schnittpunkt verlängern/trimmen

    _executeCrossContourZeroFillet(contourA, segIdxA, contourB, segIdxB) {
        console.log('[Fillet] Cross-Contour Zero Fillet: segA=%d, segB=%d', segIdxA, segIdxB);
        console.time('[Fillet] CrossContour');
        var app = this.manager.app;
        var ptsA = contourA.points;
        var ptsB = contourB.points;

        if (!ptsA || ptsA.length < 2 || !ptsB || ptsB.length < 2) {
            this.cmd?.log('Ungültige Konturen', 'error');
            this._resetToPick1(); return;
        }
        if (contourA.isClosed || contourB.isClosed) {
            this.cmd?.log('Cross-Contour Zero Fillet nur für offene Konturen', 'error');
            this._resetToPick1(); return;
        }

        // Welches Ende jeder Kontur ist näher am geklickten Segment?
        var endA = this._nearerEnd(ptsA, segIdxA);
        var endB = this._nearerEnd(ptsB, segIdxB);
        console.log('[Fillet] EndA=%s, EndB=%s', endA, endB);

        // Endsegmente extrahieren (Richtung: Kontur-Inneres → Endpunkt)
        var segA1, segA2, segB1, segB2;
        if (endA === 'start') { segA1 = ptsA[1]; segA2 = ptsA[0]; }
        else { segA1 = ptsA[ptsA.length - 2]; segA2 = ptsA[ptsA.length - 1]; }
        if (endB === 'start') { segB1 = ptsB[1]; segB2 = ptsB[0]; }
        else { segB1 = ptsB[ptsB.length - 2]; segB2 = ptsB[ptsB.length - 1]; }

        // Unbounded Schnittpunkt (Geraden, nicht Segmente)
        var isect = GeometryOps.lineLineIntersection(segA1, segA2, segB1, segB2);
        if (!isect) {
            this.cmd?.log('Parallele Linien — kein Schnittpunkt', 'error');
            this._resetToPick1(); return;
        }
        console.log('[Fillet] Intersection: (%.3f, %.3f)', isect.point.x, isect.point.y);

        // Neue Punkte berechnen
        var oldPtsA = ptsA.map(function(p) { return {x: p.x, y: p.y}; });
        var oldPtsB = ptsB.map(function(p) { return {x: p.x, y: p.y}; });
        var newPtsA = ptsA.map(function(p) { return {x: p.x, y: p.y}; });
        var newPtsB = ptsB.map(function(p) { return {x: p.x, y: p.y}; });

        if (endA === 'start') newPtsA[0] = {x: isect.point.x, y: isect.point.y};
        else newPtsA[newPtsA.length - 1] = {x: isect.point.x, y: isect.point.y};
        if (endB === 'start') newPtsB[0] = {x: isect.point.x, y: isect.point.y};
        else newPtsB[newPtsB.length - 1] = {x: isect.point.x, y: isect.point.y};

        // Undo-Command
        var rerender = function() {
            ModificationTool.invalidateCache(contourA);
            ModificationTool.invalidateCache(contourB);
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };
        var cmd = new FunctionCommand('Zero Fillet Cross-Contour',
            function() {
                contourA.points = newPtsA.map(function(p) { return {x: p.x, y: p.y}; });
                contourB.points = newPtsB.map(function(p) { return {x: p.x, y: p.y}; });
                rerender();
            },
            function() {
                contourA.points = oldPtsA.map(function(p) { return {x: p.x, y: p.y}; });
                contourB.points = oldPtsB.map(function(p) { return {x: p.x, y: p.y}; });
                rerender();
            }
        );
        app.undoManager?.execute(cmd);
        console.timeEnd('[Fillet] CrossContour');
        this.cmd?.log('✔ Zero Fillet Cross-Contour (Strg+Z = Rückgängig)', 'success');
        this._resetToPick1();
    }

    // Bestimmt welches Ende einer Kontur näher am Segment-Index liegt
    _nearerEnd(points, segIdx) {
        var lastSegIdx = points.length - 2;
        if (lastSegIdx <= 0) return 'end';
        return (segIdx <= lastSegIdx / 2) ? 'start' : 'end';
    }

    // Preview für Cross-Contour Zero Fillet (Cyan-Linien zum Schnittpunkt)
    _updateCrossContourPreview(contourA, segIdxA, contourB, segIdxB) {
        var ptsA = contourA.points, ptsB = contourB.points;
        if (!ptsA || ptsA.length < 2 || !ptsB || ptsB.length < 2) {
            this._updatePreview(null); return;
        }
        var endA = this._nearerEnd(ptsA, segIdxA);
        var endB = this._nearerEnd(ptsB, segIdxB);

        var segA1, segA2, segB1, segB2;
        if (endA === 'start') { segA1 = ptsA[1]; segA2 = ptsA[0]; }
        else { segA1 = ptsA[ptsA.length - 2]; segA2 = ptsA[ptsA.length - 1]; }
        if (endB === 'start') { segB1 = ptsB[1]; segB2 = ptsB[0]; }
        else { segB1 = ptsB[ptsB.length - 2]; segB2 = ptsB[ptsB.length - 1]; }

        var isect = GeometryOps.lineLineIntersection(segA1, segA2, segB1, segB2);
        if (!isect) { this._updatePreview(null); return; }

        // Segment-1 Highlight + Verlängerungslinien zum Schnittpunkt
        var segments = [];
        if (this.seg1Contour && this.seg1Index >= 0) {
            var pts1 = this.seg1Contour.points;
            if (this.seg1Index < pts1.length - 1) {
                segments.push({
                    start: {x: pts1[this.seg1Index].x, y: pts1[this.seg1Index].y},
                    end: {x: pts1[this.seg1Index + 1].x, y: pts1[this.seg1Index + 1].y}
                });
            }
        }
        this.manager.rubberBand = {
            type: 'filletPreview',
            data: {
                segments: segments,
                arcPoints: [
                    {x: segA2.x, y: segA2.y},
                    {x: isect.point.x, y: isect.point.y},
                    {x: segB2.x, y: segB2.y}
                ]
            }
        };
        this.manager.renderer?.render();
    }

    _executePolylineFillet(point) {
        var app = this.manager.app;
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked) { this.cmd?.log('Keine Kontur getroffen', 'warning'); return; }
        if (clicked.points.length < 3) { this.cmd?.log('Zu wenige Ecken', 'error'); return; }

        var oldPoints = clicked.points.map(function(p){return {x:p.x,y:p.y};});
        var newPoints = GeometryOps.filletPolyline(clicked.points, clicked.isClosed, this.radius);
        if (!newPoints || newPoints.length < 3) { this.cmd?.log('Fillet fehlgeschlagen', 'error'); this._resetToPick1?.(); return; }

        var rerender = function() {
            ModificationTool.invalidateCache(clicked);
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        var radius = this.radius;
        var cmd = new FunctionCommand(
            'Fillet Polyline R=' + radius,
            function() { clicked.points = newPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
            function() { clicked.points = oldPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Fillet R=' + radius + ' auf alle Ecken (Strg+Z = Rückgängig)', 'success');
        // V3.10: Continuous Mode — zurück zu pick1
        this._resetToPick1();
    }

    // V3.10: State zurücksetzen für nächste Abrundung (Continuous Mode)
    _resetToPick1() {
        this.seg1Contour = null;
        this.seg1Index = -1;
        this.state = 'pick1';
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('FILLET R=' + this.radius + ' — Nächstes Segment [P=Polylinie, ESC=Ende]:');
        this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  TRIM TOOL (T)
// ════════════════════════════════════════════════════════════════════════════

class TrimTool extends BaseTool {
    constructor(manager) {
        super(manager);
        // V3.10: Cache für Hover-Preview (Performance)
        this._lastHoverContour = null;
        this._lastHoverPreview = null;
    }

    start() {
        this.cmd?.setPrompt('TRIM — Segment anklicken das getrimmt werden soll:');
        this.cmd?.log('✂️ Trim: Klick auf den Teil der ENTFERNT werden soll (Hover = Vorschau)', 'info');
    }

    // V3.10: Hover-Preview — Rot gestrichelt zeigt was entfernt wird
    handleMouseMove(point) {
        var app = this.manager.app;
        var contours = app?.contours;
        if (!contours || contours.length < 2) return;

        var hovered = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!hovered || hovered.isReference) {
            if (this._lastHoverContour) {
                this._lastHoverContour = null;
                this._lastHoverPreview = null;
                this.manager.rubberBand = null;
                this.manager.renderer?.render();
            }
            return;
        }

        // Cache: Nur neu berechnen wenn sich die Kontur ändert oder Maus deutlich bewegt
        var boundaries = contours.filter(function(c) { return c !== hovered && !c.isReference; });
        if (boundaries.length === 0) return;

        var removedPts = GeometryOps.trimContourPreview(
            hovered.points, hovered.isClosed, point, boundaries
        );

        if (removedPts && removedPts.length >= 2) {
            this.manager.rubberBand = {
                type: 'trimPreview',
                data: { points: removedPts }
            };
            this._lastHoverContour = hovered;
            this._lastHoverPreview = removedPts;
        } else {
            this.manager.rubberBand = null;
            this._lastHoverContour = null;
            this._lastHoverPreview = null;
        }
        this.manager.renderer?.render();
    }

    handleClick(point) {
        var app = this.manager.app;
        var contours = app?.contours;
        if (!contours || contours.length < 2) { this.cmd?.log('Mind. 2 Konturen nötig', 'error'); return; }

        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked || clicked.isReference) { this.cmd?.log('Keine trimmbare Kontur', 'warning'); return; }

        var boundaries = contours.filter(function(c) { return c !== clicked && !c.isReference; });
        if (boundaries.length === 0) { this.cmd?.log('Keine Boundaries', 'error'); return; }

        var resultParts = GeometryOps.trimContour(clicked.points, clicked.isClosed, point, boundaries);
        if (resultParts.length === 0 || (resultParts.length === 1 && resultParts[0] === clicked.points)) {
            this.cmd?.log('Kein Schnittpunkt gefunden', 'warning');
            return;
        }

        var newContours = resultParts.map(function(pts, i) {
            return new CamContour(pts, { layer: clicked.layer || '0', name: clicked.name + '_T' + (i+1) });
        });

        var targetIndex = contours.indexOf(clicked);
        var rerender = function() {
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        var cmd = new FunctionCommand(
            'Trim ' + clicked.name,
            function() {
                var idx = contours.indexOf(clicked);
                if (idx !== -1) contours.splice(idx, 1);
                for (var i = 0; i < newContours.length; i++) contours.push(newContours[i]);
                contours.forEach(function(c) { c.isSelected = false; });
                rerender();
            },
            function() {
                // BUG23 fix: Einfüge-Position dynamisch aus erstem newContour ableiten,
                // damit targetIndex nach zwischenzeitlichen Add/Remove-Operationen korrekt bleibt.
                var insertAt = targetIndex;
                var firstNewIdx = contours.indexOf(newContours[0]);
                if (firstNewIdx !== -1) insertAt = firstNewIdx;
                for (var i = 0; i < newContours.length; i++) {
                    var idx = contours.indexOf(newContours[i]);
                    if (idx !== -1) contours.splice(idx, 1);
                }
                contours.splice(Math.min(Math.max(0, insertAt), contours.length), 0, clicked);
                rerender();
            }
        );
        app.undoManager?.execute(cmd);
        // V3.10: Preview-Cache leeren nach Trim
        this._lastHoverContour = null;
        this._lastHoverPreview = null;
        this.manager.rubberBand = null;
        this.cmd?.log('✔ Getrimmt → ' + newContours.length + ' Teil(e) (Strg+Z = Rückgängig)', 'success');
        this.cmd?.setPrompt('TRIM — Nächstes Segment (ESC = Ende):');
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  EXTEND TOOL (EX)
// ════════════════════════════════════════════════════════════════════════════

class ExtendTool extends BaseTool {
    start() {
        this.cmd?.setPrompt('EXTEND — Kontur-Ende anklicken:');
        this.cmd?.log('↔️ Extend: Klick nahe dem Ende einer offenen Kontur', 'info');
    }

    handleClick(point) {
        var app = this.manager.app;
        var contours = app?.contours;
        if (!contours || contours.length < 2) { this.cmd?.log('Mind. 2 Konturen nötig', 'error'); return; }

        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked || clicked.isReference || clicked.isClosed) { this.cmd?.log('Offene Kontur anklicken', 'warning'); return; }

        var dStart = GeometryOps.dist(point, clicked.points[0]);
        var dEnd = GeometryOps.dist(point, clicked.points[clicked.points.length - 1]);
        var whichEnd = dStart < dEnd ? 'start' : 'end';

        var boundaries = contours.filter(function(c) { return c !== clicked && !c.isReference; });
        var oldPoints = clicked.points.map(function(p) { return {x:p.x, y:p.y}; });
        var newPoints = GeometryOps.extendContour(clicked.points, whichEnd, boundaries, clicked);

        if (newPoints === clicked.points) { this.cmd?.log('Kein Schnittpunkt gefunden', 'warning'); return; }

        var rerender = function() {
            ModificationTool.invalidateCache(clicked);
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        var cmd = new FunctionCommand(
            'Extend ' + clicked.name,
            function() { clicked.points = newPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
            function() { clicked.points = oldPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Verlängert (Strg+Z = Rückgängig)', 'success');
        this.cmd?.setPrompt('EXTEND — Nächstes Ende (ESC = Ende):');
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  OFFSET TOOL (O) — Ersetzt den Stub
// ════════════════════════════════════════════════════════════════════════════

class OffsetToolAdvanced extends BaseTool {
    constructor(manager) {
        super(manager);
        this.distance = 5.0;
        this.state = 'distance';
        this.targetContour = null;
    }

    start() {
        this.cmd?.setPrompt('OFFSET — Abstand <' + this.distance + '>:');
        this.cmd?.log('⟺ Offset: Abstand → Kontur → Seite klicken', 'info');
    }

    handleRawInput(value) {
        if (this.state === 'distance') {
            var num = parseFloat(value);
            if (!isNaN(num) && num > 0) {
                this.distance = num;
                this.state = 'pick';
                this.cmd?.setPrompt('OFFSET ' + this.distance + 'mm — Kontur anklicken:');
                return true;
            }
        }
        return false;
    }

    // V1.3: Offset-Seite berechnen (Vorzeichen)
    _getOffsetSign(point, target) {
        if (target.isClosed) {
            return GeometryOps.pointInPolygon(point, target.points) ? -1 : 1;
        }
        var hit = GeometryOps.findNearestSegment(target.points, point.x, point.y);
        if (hit) {
            var p1 = target.points[hit.segmentIndex], p2 = target.points[hit.segmentIndex + 1];
            var cross = (p2.x - p1.x) * (point.y - p1.y) - (p2.y - p1.y) * (point.x - p1.x);
            return cross > 0 ? 1 : -1;
        }
        return 1;
    }

    // V1.3: Ghost-Preview beim Mausbewegen
    handleMouseMove(point) {
        if (this.state !== 'side' || !this.targetContour) return;

        var sign = this._getOffsetSign(point, this.targetContour);
        var previewPts = GeometryOps.offsetContour(this.targetContour.points, this.distance * sign, this.targetContour.isClosed);
        if (previewPts && previewPts.length >= 2) {
            this.manager.rubberBand = {
                type: 'offsetPreview',
                data: { points: previewPts, closed: this.targetContour.isClosed }
            };
        } else {
            this.manager.rubberBand = null;
        }
        this.manager.renderer?.render();
    }

    handleClick(point) {
        var app = this.manager.app;
        var contours = app?.contours;
        if (!contours) return;

        if (this.state === 'distance') {
            this.state = 'pick';
            this.cmd?.setPrompt('OFFSET ' + this.distance + 'mm — Kontur anklicken:');
        }

        if (this.state === 'pick') {
            var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
            if (!clicked || clicked.isReference) { this.cmd?.log('Keine gültige Kontur', 'warning'); return; }
            this.targetContour = clicked;
            contours.forEach(function(c) { c.isSelected = false; });
            clicked.isSelected = true;
            this.manager.renderer?.render();
            this.state = 'side';
            this.cmd?.setPrompt('OFFSET — Seite anklicken (Maus zeigt Vorschau):');
            return;
        }

        if (this.state === 'side') {
            var target = this.targetContour;
            var sign = this._getOffsetSign(point, target);

            var offsetPts = GeometryOps.offsetContour(target.points, this.distance * sign, target.isClosed);
            if (!offsetPts || offsetPts.length < 2) { this.cmd?.log('Offset fehlgeschlagen', 'error'); this.state = 'pick'; return; }

            var nc = new CamContour(offsetPts, { layer: target.layer || '0', name: target.name + '_Offset' });
            if (target.isClosed) nc.isClosed = true;

            var rerender = function() {
                app.renderer?.setContours(app.contours);
                app.rebuildCutOrder?.();
                app.updateContourPanel?.();
                app.renderer?.render();
            };

            var dist = this.distance;
            var cmd = new FunctionCommand(
                'Offset ' + dist + 'mm',
                function() { contours.push(nc); rerender(); },
                function() { var idx = contours.indexOf(nc); if (idx !== -1) contours.splice(idx, 1); rerender(); }
            );
            app.undoManager?.execute(cmd);
            this.cmd?.log('✔ Offset ' + dist + 'mm (Strg+Z = Rückgängig)', 'success');
            this.targetContour = null;
            this.state = 'pick';
            contours.forEach(function(c) { c.isSelected = false; });
            this.manager.rubberBand = null;
            this.cmd?.setPrompt('OFFSET ' + dist + 'mm — Nächste Kontur (ESC = Ende):');
            this.manager.renderer?.render();
        }
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  CHAMFER TOOL (CH)
// ════════════════════════════════════════════════════════════════════════════

class ChamferTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.dist1 = 2.0;
        this.dist2 = 2.0;
        this.state = 'distance';
        this.seg1Contour = null;
        this.seg1Index = -1;
    }

    start() {
        this.cmd?.setPrompt('CHAMFER — Fase-Länge <' + this.dist1 + '>:');
        this.cmd?.log('◇ Chamfer: Fase-Länge → 2 benachbarte Segmente klicken', 'info');
    }

    handleRawInput(value) {
        var num = parseFloat(value);
        if (isNaN(num) || num < 0) return false;
        if (this.state === 'distance') { this.dist1 = num; this.dist2 = num; this.state = 'pick1'; this.cmd?.setPrompt('CHAMFER ' + this.dist1 + 'mm — Erstes Segment:'); return true; }
        return false;
    }

    handleClick(point) {
        var app = this.manager.app;
        if (!app?.contours) return;

        if (this.state === 'distance') { this.state = 'pick1'; this.cmd?.setPrompt('CHAMFER ' + this.dist1 + 'mm — Erstes Segment:'); return; }

        var tolerance = 10 / (this.manager.renderer?.scale || 1);
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked) { this.cmd?.log('Keine Kontur', 'warning'); return; }
        var hit = GeometryOps.findNearestSegment(clicked.points, point.x, point.y, tolerance);
        if (!hit) { this.cmd?.log('Segment nicht getroffen', 'warning'); return; }

        if (this.state === 'pick1') {
            this.seg1Contour = clicked; this.seg1Index = hit.segmentIndex;
            this.state = 'pick2'; this.cmd?.setPrompt('CHAMFER — Zweites Segment:');
            return;
        }

        if (this.state === 'pick2') {
            if (clicked !== this.seg1Contour) { this.cmd?.log('Gleiche Kontur nötig', 'error'); return; }
            var diff = Math.abs(this.seg1Index - hit.segmentIndex);
            var maxSeg = clicked.isClosed ? clicked.points.length - 2 : clicked.points.length - 2;
            var isWrapAround = clicked.isClosed && ((this.seg1Index === 0 && hit.segmentIndex === maxSeg) || (hit.segmentIndex === 0 && this.seg1Index === maxSeg));
            if (diff !== 1 && !isWrapAround) { this.cmd?.log('Benachbarte Segmente nötig', 'error'); this.state = 'pick1'; return; }

            // BUG4 fix: wrap-around bei geschlossener Kontur → Ecke ist Index 0, nicht maxSeg
            var n = clicked.points.length - 1; // Segmentzahl
            var cornerIdx = isWrapAround ? 0 : Math.max(this.seg1Index, hit.segmentIndex);
            var pts = clicked.points;
            var pPrev = pts[cornerIdx-1 >= 0 ? cornerIdx-1 : pts.length-2];
            var pCorner = pts[cornerIdx];
            var pNext = pts[cornerIdx+1 < pts.length ? cornerIdx+1 : 1];

            var chamfer = GeometryOps.computeChamfer(pPrev, pCorner, pNext, this.dist1, this.dist2);
            if (!chamfer) { this.cmd?.log('Fase zu lang', 'error'); this.state = 'pick1'; return; }

            var oldPoints = clicked.points.map(function(p){return {x:p.x,y:p.y};});
            var newPoints = [];
            for (var i = 0; i < cornerIdx; i++) newPoints.push({x:pts[i].x, y:pts[i].y});
            newPoints.push({x:chamfer.cut1.x, y:chamfer.cut1.y});
            newPoints.push({x:chamfer.cut2.x, y:chamfer.cut2.y});
            for (var k = cornerIdx+1; k < pts.length; k++) newPoints.push({x:pts[k].x, y:pts[k].y});

            var rerender = function() {
                ModificationTool.invalidateCache(clicked);
                app.renderer?.setContours(app.contours);
                app.rebuildCutOrder?.(); app.updateContourPanel?.(); app.renderer?.render();
            };
            var d1 = this.dist1;
            var cmd = new FunctionCommand('Chamfer ' + d1,
                function() { clicked.points = newPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
                function() { clicked.points = oldPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
            );
            app.undoManager?.execute(cmd);
            this.cmd?.log('✔ Chamfer angewendet (Strg+Z = Rückgängig)', 'success');
            // V1.3: Continuous Mode — zurück zu pick1
            this.seg1Contour = null; this.seg1Index = -1; this.state = 'pick1';
            this.manager.rubberBand = null;
            this.cmd?.setPrompt('CHAMFER ' + this.dist1 + 'mm — Nächstes Segment [ESC=Ende]:');
            this.manager.renderer?.render();
        }
    }

    // V1.3: Enter/Space mit aktuellem Abstand weitermachen
    finish() {
        if (this.state === 'distance') {
            this.state = 'pick1';
            this.cmd?.setPrompt('CHAMFER ' + this.dist1 + 'mm — Erstes Segment:');
        }
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  ZERO FILLET TOOL (ZF) — R=0, Ecke auf Schnittpunkt
// ════════════════════════════════════════════════════════════════════════════

class ZeroFilletTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.seg1Contour = null; this.seg1Index = -1; this.state = 'pick1';
    }
    start() {
        this.cmd?.setPrompt('ZERO FILLET — Erstes Segment (auch Cross-Contour):');
        this.cmd?.log('⊿ Zero Fillet: 2 Segmente auf Schnittpunkt trimmen (auch verschiedene Konturen)', 'info');
    }
    handleClick(point) {
        var app = this.manager.app;
        if (!app?.contours) return;
        var tolerance = 10 / (this.manager.renderer?.scale || 1);
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked) { this.cmd?.log('Keine Kontur', 'warning'); return; }
        var hit = GeometryOps.findNearestSegment(clicked.points, point.x, point.y, tolerance);
        if (!hit) { this.cmd?.log('Segment nicht getroffen', 'warning'); return; }

        if (this.state === 'pick1') {
            this.seg1Contour = clicked; this.seg1Index = hit.segmentIndex;
            this.state = 'pick2'; this.cmd?.setPrompt('ZERO FILLET — Zweites Segment (gleiche oder andere Kontur):');
            return;
        }
        if (this.state === 'pick2') {
            // V3.13: Cross-Contour Zero Fillet
            if (clicked !== this.seg1Contour) {
                this._executeCrossContour(this.seg1Contour, this.seg1Index, clicked, hit.segmentIndex);
                return;
            }
            // Intra-Contour (Original-Logik)
            var diff = Math.abs(this.seg1Index - hit.segmentIndex);
            if (diff !== 1) { this.cmd?.log('Benachbarte Segmente nötig (oder andere Kontur wählen)', 'error'); this.state = 'pick1'; return; }
            var cornerIdx = Math.max(this.seg1Index, hit.segmentIndex);
            var pts = clicked.points;
            if (cornerIdx < 1 || cornerIdx + 1 >= pts.length) { this.cmd?.log('Eckpunkt am Rand — nicht möglich', 'error'); this.state = 'pick1'; return; }
            var pPrev = pts[cornerIdx-1]; var pCorner = pts[cornerIdx]; var pNext = pts[cornerIdx+1];
            var isect = GeometryOps.lineLineIntersection(pPrev, pCorner, pCorner, pNext);
            if (!isect) { this.cmd?.log('Parallel — kein Schnittpunkt', 'error'); return; }

            var oldPoints = pts.map(function(p){return {x:p.x,y:p.y};});
            var newPoints = pts.map(function(p){return {x:p.x,y:p.y};});
            newPoints[cornerIdx] = {x: isect.point.x, y: isect.point.y};

            var rerender = function() {
                ModificationTool.invalidateCache(clicked);
                app.renderer?.setContours(app.contours); app.rebuildCutOrder?.();
                app.updateContourPanel?.(); app.renderer?.render();
            };
            var cmd = new FunctionCommand('Zero Fillet',
                function() { clicked.points = newPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
                function() { clicked.points = oldPoints.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
            );
            app.undoManager?.execute(cmd);
            this.cmd?.log('✔ Zero Fillet (Strg+Z = Rückgängig)', 'success');
            this.seg1Contour = null; this.seg1Index = -1; this.state = 'pick1';
            this.manager.rubberBand = null;
            this.cmd?.setPrompt('ZERO FILLET — Nächstes Segment (ESC = Ende):');
            this.manager.renderer?.render();
        }
    }

    // V3.13: Cross-Contour Zero Fillet (gleiche Logik wie FilletTool)
    _executeCrossContour(contourA, segIdxA, contourB, segIdxB) {
        console.log('[ZF] Cross-Contour: segA=%d, segB=%d', segIdxA, segIdxB);
        var app = this.manager.app;
        var ptsA = contourA.points, ptsB = contourB.points;
        if (!ptsA || ptsA.length < 2 || !ptsB || ptsB.length < 2) {
            this.cmd?.log('Ungültige Konturen', 'error'); this.state = 'pick1'; return;
        }
        if (contourA.isClosed || contourB.isClosed) {
            this.cmd?.log('Cross-Contour nur für offene Konturen', 'error'); this.state = 'pick1'; return;
        }
        // Welches Ende näher am Klick?
        var lastA = ptsA.length - 2, lastB = ptsB.length - 2;
        var endA = (segIdxA <= lastA / 2) ? 'start' : 'end';
        var endB = (segIdxB <= lastB / 2) ? 'start' : 'end';
        var segA1, segA2, segB1, segB2;
        if (endA === 'start') { segA1 = ptsA[1]; segA2 = ptsA[0]; }
        else { segA1 = ptsA[ptsA.length-2]; segA2 = ptsA[ptsA.length-1]; }
        if (endB === 'start') { segB1 = ptsB[1]; segB2 = ptsB[0]; }
        else { segB1 = ptsB[ptsB.length-2]; segB2 = ptsB[ptsB.length-1]; }
        var isect = GeometryOps.lineLineIntersection(segA1, segA2, segB1, segB2);
        if (!isect) { this.cmd?.log('Parallele Linien', 'error'); this.state = 'pick1'; return; }
        var oldA = ptsA.map(function(p){return {x:p.x,y:p.y};});
        var oldB = ptsB.map(function(p){return {x:p.x,y:p.y};});
        var newA = ptsA.map(function(p){return {x:p.x,y:p.y};});
        var newB = ptsB.map(function(p){return {x:p.x,y:p.y};});
        if (endA === 'start') newA[0] = {x:isect.point.x, y:isect.point.y};
        else newA[newA.length-1] = {x:isect.point.x, y:isect.point.y};
        if (endB === 'start') newB[0] = {x:isect.point.x, y:isect.point.y};
        else newB[newB.length-1] = {x:isect.point.x, y:isect.point.y};
        var rerender = function() {
            ModificationTool.invalidateCache(contourA); ModificationTool.invalidateCache(contourB);
            app.renderer?.setContours(app.contours); app.rebuildCutOrder?.();
            app.updateContourPanel?.(); app.renderer?.render();
        };
        var cmd = new FunctionCommand('Zero Fillet Cross-Contour',
            function() { contourA.points = newA.map(function(p){return {x:p.x,y:p.y};}); contourB.points = newB.map(function(p){return {x:p.x,y:p.y};}); rerender(); },
            function() { contourA.points = oldA.map(function(p){return {x:p.x,y:p.y};}); contourB.points = oldB.map(function(p){return {x:p.x,y:p.y};}); rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Zero Fillet Cross-Contour (Strg+Z = Rückgängig)', 'success');
        this.seg1Contour = null; this.seg1Index = -1; this.state = 'pick1';
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('ZERO FILLET — Nächstes Segment (ESC = Ende):');
        this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  BOOLEAN TOOL (BO) — Union/Intersect/Subtract
// ════════════════════════════════════════════════════════════════════════════

class BooleanTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.mode = 'union'; this.state = 'mode'; this.contourA = null;
    }
    start() {
        this.cmd?.setPrompt('BOOLEAN — [U=Union, I=Intersect, S=Subtract] <U>:');
        this.cmd?.log('🔲 Boolean auf 2 geschlossene Konturen', 'info');
        var selected = this.manager.getSelectedContours();
        if (selected.length === 2 && selected[0].isClosed && selected[1].isClosed) {
            this.contourA = selected[0]; this.state = 'pickB_pre';
        }
    }
    handleRawInput(value) {
        var u = value.trim().toUpperCase();
        if (u === 'U') this.mode = 'union'; else if (u === 'I') this.mode = 'intersect';
        else if (u === 'S') this.mode = 'subtract'; else return false;
        if (this.state === 'pickB_pre') { this.cmd?.log('Modus: ' + this.mode, 'info'); return true; }
        this.state = 'pickA'; this.cmd?.setPrompt('BOOLEAN [' + this.mode + '] — Erste Kontur:');
        return true;
    }
    handleClick(point) {
        var app = this.manager.app;
        if (!app?.contours) return;
        if (this.state === 'mode') { this.state = 'pickA'; this.cmd?.setPrompt('BOOLEAN [' + this.mode + '] — Erste Kontur:'); }
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked || !clicked.isClosed) { this.cmd?.log('Geschlossene Kontur nötig', 'warning'); return; }
        if (this.state === 'pickA') {
            this.contourA = clicked; clicked.isSelected = true; this.manager.renderer?.render();
            this.state = 'pickB'; this.cmd?.setPrompt('BOOLEAN — Zweite Kontur:');
            return;
        }
        if (this.state === 'pickB' || this.state === 'pickB_pre') {
            if (clicked === this.contourA) { this.cmd?.log('Andere Kontur wählen', 'warning'); return; }
            this._execute(this.contourA, clicked);
        }
    }
    finish() {
        if (this.state === 'pickB_pre') {
            var sel = this.manager.getSelectedContours();
            if (sel.length === 2) this._execute(sel[0], sel[1]);
        }
    }
    _execute(cA, cB) {
        var app = this.manager.app; var contours = app.contours;
        var results = GeometryOps.booleanOp(cA.points, cB.points, this.mode);
        if (!results || results.length === 0) { this.cmd?.log('Kein Ergebnis', 'warning'); this.cancel(); return; }

        var newCs = results.map(function(pts, i) {
            var nc = new CamContour(pts, { layer: cA.layer || '0', name: cA.name + '_' + i });
            nc.isClosed = true; return nc;
        });
        var idxA = contours.indexOf(cA), idxB = contours.indexOf(cB);
        var rerender = function() {
            app.renderer?.setContours(app.contours); app.rebuildCutOrder?.();
            app.updateContourPanel?.(); app.renderer?.render();
        };
        var mode = this.mode;
        var cmd = new FunctionCommand('Boolean ' + mode,
            function() {
                var i = contours.indexOf(cA); if (i !== -1) contours.splice(i, 1);
                i = contours.indexOf(cB); if (i !== -1) contours.splice(i, 1);
                for (var j = 0; j < newCs.length; j++) contours.push(newCs[j]);
                contours.forEach(function(c) { c.isSelected = false; });
                rerender();
            },
            function() {
                for (var j = 0; j < newCs.length; j++) { var idx = contours.indexOf(newCs[j]); if (idx !== -1) contours.splice(idx, 1); }
                contours.splice(Math.min(idxA, contours.length), 0, cA);
                contours.splice(Math.min(idxB, contours.length), 0, cB);
                rerender();
            }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Boolean ' + mode + ' (Strg+Z = Rückgängig)', 'success');
        this.manager.rubberBand = null; this.manager.activeTool = null;
        this.manager._setDefaultPrompt(); this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  N-GON TOOL (NG) — Regelmäßiges Polygon
// ════════════════════════════════════════════════════════════════════════════

class NgonTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.sides = 6; this.inscribed = true; this.center = null; this.state = 'sides';
    }
    start() {
        this.cmd?.setPrompt('N-GON — Seiten <' + this.sides + '> [I/O]:');
        this.cmd?.log('⬡ N-Gon: Seiten → Zentrum → Radius', 'info');
    }
    handleRawInput(value) {
        var u = value.trim().toUpperCase();
        if (u === 'I') { this.inscribed = true; this.cmd?.log('Inscribed', 'info'); return true; }
        if (u === 'O') { this.inscribed = false; this.cmd?.log('Circumscribed', 'info'); return true; }
        if (this.state === 'sides') {
            var n = parseInt(value); if (!isNaN(n) && n >= 3 && n <= 64) {
                this.sides = n; this.state = 'center'; this.cmd?.setPrompt('N-GON ' + n + ' Seiten — Zentrum:');
                return true;
            }
        }
        if (this.state === 'radius') {
            var r = parseFloat(value); if (!isNaN(r) && r > 0) { this._create(r); return true; }
        }
        return false;
    }
    handleClick(point) {
        if (this.state === 'sides') { this.state = 'center'; this.cmd?.setPrompt('N-GON ' + this.sides + ' — Zentrum:'); return; }
        if (this.state === 'center') { this.center = {x:point.x, y:point.y}; this.state = 'radius'; this.cmd?.setPrompt('N-GON — Radius:'); return; }
        if (this.state === 'radius' && this.center) {
            var r = GeometryOps.dist(this.center, point); if (r < 0.01) return;
            this._create(r);
        }
    }
    handleMouseMove(point) {
        if (this.state === 'radius' && this.center) {
            var r = GeometryOps.dist(this.center, point);
            var pts = GeometryOps.createNgon(this.center, r, this.sides, this.inscribed);
            this.manager.rubberBand = { type: 'polyline', data: { points: pts } };
            this.manager.renderer?.render();
        }
    }
    _create(radius) {
        var pts = GeometryOps.createNgon(this.center, radius, this.sides, this.inscribed);
        if (pts.length < 4) return;
        this.manager.addEntity({ type: 'POLYLINE', points: pts, closed: true });
        this.cmd?.log('✔ ' + this.sides + '-Eck R=' + radius.toFixed(1) + 'mm', 'success');
        this.center = null; this.state = 'center'; this.manager.rubberBand = null;
        this.cmd?.setPrompt('N-GON — Nächstes Zentrum (ESC = Ende):');
        this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  OBROUND TOOL (OB) — Langloch
// ════════════════════════════════════════════════════════════════════════════

class ObroundTool extends BaseTool {
    constructor(manager) { super(manager); this.center = null; this.state = 'center'; }
    start() {
        this.cmd?.setPrompt('OBROUND — Zentrum anklicken:');
        this.cmd?.log('⬭ Obround: Zentrum → Breite,Höhe eingeben oder 2. Punkt', 'info');
    }
    handleRawInput(value) {
        if (this.state === 'dimensions') {
            var parts = value.replace(/[,;x×]/g, ' ').trim().split(/\s+/);
            if (parts.length >= 2) {
                var w = parseFloat(parts[0]), h = parseFloat(parts[1]);
                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) { this._create(w, h); return true; }
            }
        }
        return false;
    }
    handleClick(point) {
        if (this.state === 'center') {
            this.center = {x:point.x, y:point.y}; this.state = 'dimensions';
            this.cmd?.setPrompt('OBROUND — Breite,Höhe oder Eckpunkt:');
            return;
        }
        if (this.state === 'dimensions' && this.center) {
            var w = Math.abs(point.x - this.center.x) * 2;
            var h = Math.abs(point.y - this.center.y) * 2;
            if (w < 0.1 || h < 0.1) return;
            this._create(w, h);
        }
    }
    handleMouseMove(point) {
        if (this.state === 'dimensions' && this.center) {
            var w = Math.abs(point.x - this.center.x) * 2;
            var h = Math.abs(point.y - this.center.y) * 2;
            if (w > 0.1 && h > 0.1) {
                this.manager.rubberBand = { type: 'polyline', data: { points: GeometryOps.createObround(this.center, w, h) } };
                this.manager.renderer?.render();
            }
        }
    }
    _create(w, h) {
        var pts = GeometryOps.createObround(this.center, w, h);
        if (pts.length < 4) return;
        this.manager.addEntity({ type: 'POLYLINE', points: pts, closed: true });
        this.cmd?.log('✔ Langloch ' + w.toFixed(1) + '×' + h.toFixed(1) + 'mm', 'success');
        this.center = null; this.state = 'center'; this.manager.rubberBand = null;
        this.cmd?.setPrompt('OBROUND — Nächstes Zentrum (ESC = Ende):');
        this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  ARRAY TOOL (AR) — Rechteckiges/Polares Muster
// ════════════════════════════════════════════════════════════════════════════

class ArrayTool extends ModificationTool {
    constructor(manager) {
        super(manager);
        this.arrayType = 'rect'; this.rows = 2; this.cols = 2; this.dX = 50; this.dY = 50;
        this.polarCenter = null; this.polarCount = 6; this.polarAngle = 360;
    }
    getToolName() { return 'ARRAY'; }
    _onSelectionComplete() { this.state = 'type'; this.cmd?.setPrompt('ARRAY — [R=Rechteckig, P=Polar] <R>:'); }
    handleRawInput(value) {
        var u = value.trim().toUpperCase(); var num = parseFloat(value);
        if (this.state === 'type') {
            if (u === 'P') { this.arrayType = 'polar'; this.state = 'polar_center'; this.cmd?.setPrompt('ARRAY [Polar] — Zentrum:'); return true; }
            this.arrayType = 'rect'; this.state = 'rect_rows'; this.cmd?.setPrompt('ARRAY — Zeilen <' + this.rows + '>:'); return true;
        }
        if (isNaN(num)) return false;
        if (this.state === 'rect_rows') { this.rows = Math.max(1, Math.floor(num)); this.state = 'rect_cols'; this.cmd?.setPrompt('ARRAY — Spalten <' + this.cols + '>:'); return true; }
        if (this.state === 'rect_cols') { this.cols = Math.max(1, Math.floor(num)); this.state = 'rect_dx'; this.cmd?.setPrompt('ARRAY — ΔX <' + this.dX + '>:'); return true; }
        if (this.state === 'rect_dx') { this.dX = num; this.state = 'rect_dy'; this.cmd?.setPrompt('ARRAY — ΔY <' + this.dY + '>:'); return true; }
        if (this.state === 'rect_dy') { this.dY = num; this._execRect(); return true; }
        if (this.state === 'polar_count') { this.polarCount = Math.max(2, Math.floor(num)); this.state = 'polar_angle'; this.cmd?.setPrompt('ARRAY — Winkel <' + this.polarAngle + '>°:'); return true; }
        if (this.state === 'polar_angle') { this.polarAngle = num; this._execPolar(); return true; }
        return false;
    }
    handleClick(point) {
        if (this.state === 'select') { super.handleClick(point); return; }
        if (this.state === 'type') { this.arrayType = 'rect'; this.state = 'rect_rows'; this.cmd?.setPrompt('ARRAY — Zeilen <' + this.rows + '>:'); return; }
        if (this.state === 'polar_center') { this.polarCenter = {x:point.x,y:point.y}; this.state = 'polar_count'; this.cmd?.setPrompt('ARRAY — Kopien <' + this.polarCount + '>:'); }
    }
    finish() {
        if (this.state === 'select') { super.finish(); return; }
        if (this.state === 'rect_rows') { this.state = 'rect_cols'; this.cmd?.setPrompt('ARRAY — Spalten <' + this.cols + '>:'); return; }
        if (this.state === 'rect_cols') { this.state = 'rect_dx'; this.cmd?.setPrompt('ARRAY — ΔX <' + this.dX + '>:'); return; }
        if (this.state === 'rect_dx') { this.state = 'rect_dy'; this.cmd?.setPrompt('ARRAY — ΔY <' + this.dY + '>:'); return; }
        if (this.state === 'rect_dy') { this._execRect(); return; }
        if (this.state === 'polar_count') { this.state = 'polar_angle'; this.cmd?.setPrompt('ARRAY — Winkel <' + this.polarAngle + '>°:'); return; }
        if (this.state === 'polar_angle') { this._execPolar(); return; }
        if (this.state === 'type') { this.arrayType = 'rect'; this.state = 'rect_rows'; this.cmd?.setPrompt('ARRAY — Zeilen <' + this.rows + '>:'); }
    }
    _execRect() {
        var app = this.manager.app; if (!app?.contours) return;
        var clones = [];
        for (var r = 0; r < this.rows; r++) { for (var c = 0; c < this.cols; c++) {
            if (r === 0 && c === 0) continue;
            var dx = c * this.dX, dy = r * this.dY;
            for (var s = 0; s < this.selectedContours.length; s++) {
                var src = this.selectedContours[s];
                var nc = new CamContour(src.points.map(function(p){return {x:p.x+dx,y:p.y+dy};}), {layer:src.layer||'0', name:src.name+'_R'+r+'C'+c});
                if (src.isClosed) nc.isClosed = true;
                clones.push(nc);
            }
        }}
        this._addClones(clones, 'Rect Array ' + this.rows + '×' + this.cols);
    }
    _execPolar() {
        var app = this.manager.app; if (!app?.contours || !this.polarCenter) return;
        var clones = [], cx = this.polarCenter.x, cy = this.polarCenter.y;
        var totalRad = this.polarAngle * Math.PI / 180;
        for (var i = 1; i < this.polarCount; i++) {
            var angle = (i / this.polarCount) * totalRad;
            var cos = Math.cos(angle), sin = Math.sin(angle);
            for (var s = 0; s < this.selectedContours.length; s++) {
                var src = this.selectedContours[s];
                var nc = new CamContour(src.points.map(function(p){
                    var rx = p.x-cx, ry = p.y-cy;
                    return {x: cx + rx*cos - ry*sin, y: cy + rx*sin + ry*cos};
                }), {layer:src.layer||'0', name:src.name+'_P'+i});
                if (src.isClosed) nc.isClosed = true;
                clones.push(nc);
            }
        }
        this._addClones(clones, 'Polar Array ' + this.polarCount + '×');
    }
    _addClones(clones, label) {
        var app = this.manager.app; var contours = app.contours;
        var rerender = function() {
            app.renderer?.setContours(app.contours); app.rebuildCutOrder?.();
            app.updateContourPanel?.(); app.renderer?.render();
        };
        var cmd = new FunctionCommand(label,
            function() { for (var i=0;i<clones.length;i++) contours.push(clones[i]); contours.forEach(function(c){c.isSelected=false;}); rerender(); },
            function() { for (var i=0;i<clones.length;i++) { var idx=contours.indexOf(clones[i]); if(idx!==-1) contours.splice(idx,1); } rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ ' + clones.length + ' Kopie(n) (Strg+Z)', 'success');
        this.manager.rubberBand = null; this.manager.activeTool = null;
        this.manager._setDefaultPrompt(); this.manager.renderer?.render();
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  ARABESKE TOOL (AB) — Parametrische Laternenfliese
// ════════════════════════════════════════════════════════════════════════════

class ArabeskeTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.width = 120;
        this.height = 120;
        this.neckRatio = 0.25;
        this.bulge = 0.75;
        this.neckTension = 0.55;
        this.fugeOffset = 0; // halbe Fugenbreite
        this.center = null;
        this.state = 'dimensions'; // 'dimensions' | 'neck' | 'center'
        console.log('[ArabeskeTool V2.0] gestartet');
    }

    start() {
        this.cmd?.setPrompt('ARABESKE — Breite,Höhe <' + this.width + ',' + this.height + '> [F=Fuge]:');
        this.cmd?.log('◇ Arabeske: Maße → Einbuchtung → Zentrum klicken', 'info');
    }

    _summary() {
        var s = this.width + '×' + this.height + ' neck=' + (this.neckRatio * 100).toFixed(0) + '%';
        if (this.fugeOffset > 0) s += ' fuge=' + (this.fugeOffset * 2).toFixed(1) + 'mm';
        return s;
    }

    handleRawInput(value) {
        var u = value.trim().toUpperCase();
        console.log('[ArabeskeTool V2.0] Input:', u, 'state:', this.state);

        // F = Fugen-Modus (jederzeit)
        if (u === 'F') {
            this.state = 'fuge';
            this.cmd?.setPrompt('ARABESKE — Fugenbreite (mm) <' + (this.fugeOffset * 2).toFixed(1) + '>:');
            return true;
        }

        if (this.state === 'fuge') {
            var f = parseFloat(value);
            if (!isNaN(f) && f >= 0 && f <= 20) {
                this.fugeOffset = f / 2;
                this.cmd?.log('✔ Fuge: ' + f.toFixed(1) + 'mm (Offset: ±' + this.fugeOffset.toFixed(1) + 'mm)', 'success');
                this.state = 'center';
                this.cmd?.setPrompt('ARABESKE ' + this._summary() + ' — Zentrum:');
                return true;
            }
            return false;
        }

        if (this.state === 'dimensions') {
            var parts = value.replace(/[,;x×]/g, ' ').trim().split(/\s+/);
            if (parts.length >= 2) {
                var w = parseFloat(parts[0]), h = parseFloat(parts[1]);
                if (!isNaN(w) && !isNaN(h) && w > 5 && h > 5) {
                    this.width = w; this.height = h;
                    this.state = 'neck';
                    this.cmd?.setPrompt('ARABESKE ' + w + '×' + h + ' — Einbuchtung % <' + (this.neckRatio * 100).toFixed(0) + '> [F=Fuge]:');
                    return true;
                }
            }
            // Einzelne Zahl = quadratisch
            var s = parseFloat(value);
            if (!isNaN(s) && s > 5) {
                this.width = s; this.height = s;
                this.state = 'neck';
                this.cmd?.setPrompt('ARABESKE ' + s + '×' + s + ' — Einbuchtung % <' + (this.neckRatio * 100).toFixed(0) + '> [F=Fuge]:');
                return true;
            }
            return false;
        }

        if (this.state === 'neck') {
            var n = parseFloat(value);
            if (!isNaN(n) && n >= 15 && n <= 85) {
                this.neckRatio = n / 100;
                this.state = 'center';
                this.cmd?.setPrompt('ARABESKE ' + this._summary() + ' — Zentrum:');
                return true;
            }
            return false;
        }

        return false;
    }

    handleClick(point) {
        console.log('[ArabeskeTool V2.0] Klick state:', this.state, 'point:', point.x.toFixed(1), point.y.toFixed(1));

        if (this.state === 'dimensions') {
            // Standard-Maße übernehmen
            this.state = 'neck';
            this.cmd?.setPrompt('ARABESKE ' + this.width + '×' + this.height + ' — Einbuchtung % <' + (this.neckRatio * 100).toFixed(0) + '> [F=Fuge]:');
            return;
        }

        if (this.state === 'neck') {
            // Standard-Neck übernehmen
            this.state = 'center';
            this.cmd?.setPrompt('ARABESKE ' + this._summary() + ' — Zentrum:');
            return;
        }

        if (this.state === 'center') {
            this.center = { x: point.x, y: point.y };
            this._create();
        }
    }

    handleMouseMove(point) {
        if (this.state === 'center') {
            var pts = GeometryOps.createArabeske(
                point, this.width, this.height, this.neckRatio, this.fugeOffset,
                this.bulge, this.neckTension
            );
            if (pts.length > 2) {
                this.manager.rubberBand = { type: 'polyline', data: { points: pts } };
                this.manager.renderer?.render();
            }
        }
    }

    _create() {
        console.time('[ArabeskeTool V2.0] _create');
        var pts = GeometryOps.createArabeske(
            this.center, this.width, this.height, this.neckRatio, this.fugeOffset,
            this.bulge, this.neckTension
        );
        if (pts.length < 4) {
            this.cmd?.log('✘ Arabeske: Ungültige Parameter', 'error');
            console.timeEnd('[ArabeskeTool V2.0] _create');
            return;
        }
        this.manager.addEntity({ type: 'POLYLINE', points: pts, closed: true });

        this.cmd?.log('✔ Arabeske ' + this._summary() +
            ' (' + (pts.length - 1) + ' Punkte, Bézier)', 'success');

        this.center = null;
        this.manager.rubberBand = null;
        this.cmd?.setPrompt('ARABESKE — Nächstes Zentrum (ESC = Ende):');
        this.manager.renderer?.render();
        console.timeEnd('[ArabeskeTool V2.0] _create');
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  LENGTHEN TOOL (LE) — AutoCAD-Stil: Delta setzen, dann mehrere Enden klicken
// ════════════════════════════════════════════════════════════════════════════

class LengthenTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.mode = 'delta';    // 'delta' | 'total' | 'percent'
        this.delta = null;      // Gespeicherter Delta-Wert (bleibt zwischen Klicks)
        this.state = 'mode';    // 'mode' | 'value' | 'pick'
    }

    start() {
        this.cmd?.setPrompt('LENGTHEN — Modus [D=Delta, T=Total, P=Prozent] <D>:');
        this.cmd?.log('↕️ Lengthen: Modus wählen → Wert eingeben → Enden anklicken (beliebig viele)', 'info');
    }

    handleRawInput(value) {
        console.log('[LE] handleRawInput called, value="' + value + '", state=' + this.state + ', mode=' + this.mode);
        var upper = value.toUpperCase();

        // Modus-Auswahl
        if (this.state === 'mode') {
            if (upper === 'D' || upper === 'DELTA') { this.mode = 'delta'; }
            else if (upper === 'T' || upper === 'TOTAL') { this.mode = 'total'; }
            else if (upper === 'P' || upper === 'PERCENT' || upper === 'PROZENT') { this.mode = 'percent'; }
            else {
                // Zahl direkt eingegeben → Delta-Modus mit diesem Wert
                var num = parseFloat(value);
                if (!isNaN(num)) {
                    this.mode = 'delta';
                    this.delta = num;
                    this.state = 'pick';
                    this.cmd?.setPrompt('LENGTHEN [Delta ' + (num > 0 ? '+' : '') + num + 'mm] — Linienende anklicken (ESC=Ende):');
                    this.cmd?.log('Delta: ' + (num > 0 ? '+' : '') + num + 'mm — jetzt Enden anklicken', 'info');
                    return true;
                }
                this.cmd?.log('Ungültig. D=Delta, T=Total, P=Prozent oder Zahl eingeben', 'warning');
                return true;
            }
            this.state = 'value';
            var modeNames = { delta: 'Delta (mm)', total: 'Gesamtlänge (mm)', percent: 'Prozent (%)' };
            this.cmd?.setPrompt('LENGTHEN [' + this.mode + '] — ' + modeNames[this.mode] + ':');
            return true;
        }

        // Wert eingeben
        if (this.state === 'value') {
            var num = parseFloat(value);
            if (isNaN(num)) { this.cmd?.log('Zahl erwartet', 'warning'); return true; }
            if (this.mode === 'percent' && num <= 0) { this.cmd?.log('Prozent muss > 0 sein', 'warning'); return true; }
            this.delta = num;
            this.state = 'pick';
            var label = this.mode === 'delta' ? ((num > 0 ? '+' : '') + num + 'mm') :
                        this.mode === 'total' ? (num + 'mm total') :
                        (num + '%');
            this.cmd?.setPrompt('LENGTHEN [' + label + '] — Linienende anklicken (ESC=Ende):');
            this.cmd?.log(label + ' — jetzt Enden anklicken (beliebig viele)', 'info');
            return true;
        }

        // Im Pick-Modus: neuen Delta-Wert ändern
        if (this.state === 'pick') {
            var num = parseFloat(value);
            if (!isNaN(num)) {
                this.delta = num;
                var label = this.mode === 'delta' ? ((num > 0 ? '+' : '') + num + 'mm') :
                            this.mode === 'total' ? (num + 'mm total') :
                            (num + '%');
                this.cmd?.setPrompt('LENGTHEN [' + label + '] — Linienende anklicken (ESC=Ende):');
                this.cmd?.log('Neuer Wert: ' + label, 'info');
                return true;
            }
        }
        return false;
    }

    handleClick(point) {
        // Im Modus/Wert-Phase: Enter/Klick = Defaults übernehmen
        if (this.state === 'mode') {
            this.state = 'value';
            this.cmd?.setPrompt('LENGTHEN [Delta] — Delta-Wert (mm):');
            return;
        }
        if (this.state === 'value') return; // Wert muss eingegeben werden

        // Pick-Phase: Linie anklicken
        var app = this.manager.app;
        var clicked = this.manager.renderer?.findContourAtPoint(point.x, point.y);
        if (!clicked || clicked.isClosed) {
            this.cmd?.log('Offene Kontur nötig', 'warning');
            return;
        }

        // Nächstes Ende bestimmen
        var pts = clicked.points;
        var dS = GeometryOps.dist(point, pts[0]);
        var dE = GeometryOps.dist(point, pts[pts.length - 1]);
        var whichEnd = dS < dE ? 'start' : 'end';

        // Richtungsvektor am gewählten Ende
        var s1, s2;
        if (whichEnd === 'end') { s1 = pts[pts.length - 2]; s2 = pts[pts.length - 1]; }
        else { s1 = pts[1]; s2 = pts[0]; }
        var dx = s2.x - s1.x, dy = s2.y - s1.y;
        var segLen = Math.hypot(dx, dy);
        if (segLen < 1e-10) { this.cmd?.log('Segment zu kurz', 'warning'); return; }
        var dirX = dx / segLen, dirY = dy / segLen;

        // Neuen Endpunkt berechnen je nach Modus
        var newEnd;
        if (this.mode === 'delta') {
            newEnd = { x: s2.x + dirX * this.delta, y: s2.y + dirY * this.delta };
        } else if (this.mode === 'total') {
            // Gesamtlänge der Kontur berechnen
            var totalLen = 0;
            for (var i = 0; i < pts.length - 1; i++) {
                totalLen += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
            }
            var diff = this.delta - totalLen;
            newEnd = { x: s2.x + dirX * diff, y: s2.y + dirY * diff };
        } else { // percent
            var totalLen = 0;
            for (var i = 0; i < pts.length - 1; i++) {
                totalLen += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
            }
            var newTotalLen = totalLen * (this.delta / 100);
            var diff = newTotalLen - totalLen;
            newEnd = { x: s2.x + dirX * diff, y: s2.y + dirY * diff };
        }

        // Undo-fähig ausführen
        this._applyLengthen(clicked, whichEnd, newEnd, app);
    }

    _applyLengthen(contour, whichEnd, newEnd, app) {
        var oldPts = contour.points.map(function(p) { return {x: p.x, y: p.y}; });
        var newPts = contour.points.map(function(p) { return {x: p.x, y: p.y}; });
        if (whichEnd === 'end') newPts[newPts.length - 1] = {x: newEnd.x, y: newEnd.y};
        else newPts[0] = {x: newEnd.x, y: newEnd.y};

        var rerender = function() {
            ModificationTool.invalidateCache(contour);
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        var cmd = new FunctionCommand('Lengthen',
            function() { contour.points = newPts.map(function(p) { return {x: p.x, y: p.y}; }); rerender(); },
            function() { contour.points = oldPts.map(function(p) { return {x: p.x, y: p.y}; }); rerender(); }
        );
        app.undoManager?.execute(cmd);

        this.cmd?.log('✔ Verlängert am ' + whichEnd + ' (Strg+Z)', 'success');
        app.contours.forEach(function(c) { c.isSelected = false; });
        this.manager.renderer?.render();
        // Prompt bleibt — sofort nächste Linie klicken!
    }

    handleMouseMove(point) {
        // Kein RubberBand im Pick-Modus (da Sofort-Ausführung)
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  BOUNDARY POLY TOOL (BP)
// ════════════════════════════════════════════════════════════════════════════

class BoundaryPolyTool extends BaseTool {
    start() {
        this.cmd?.setPrompt('BOUNDARY POLY — Punkt im Bereich anklicken:');
        this.cmd?.log('🔲 Boundary Poly: Klick innerhalb eines geschlossenen Bereichs', 'info');
    }
    handleClick(point) {
        var app = this.manager.app;
        if (!app?.contours || app.contours.length === 0) { this.cmd?.log('Keine Konturen', 'error'); return; }
        var best = null, bestArea = Infinity;
        for (var i = 0; i < app.contours.length; i++) {
            var c = app.contours[i];
            if (!c.isClosed || c.isReference) continue;
            if (GeometryOps.pointInPolygon(point, c.points)) {
                var area = Math.abs(this._area(c.points));
                if (area < bestArea) { bestArea = area; best = c; }
            }
        }
        if (!best) { this.cmd?.log('Kein geschlossener Bereich gefunden', 'warning'); return; }

        var nc = new CamContour(best.points.map(function(p){return {x:p.x,y:p.y};}), { layer: 'DRAW', name: 'Boundary_' + best.name });
        nc.isClosed = true;
        var contours = app.contours;
        var rerender = function() { app.renderer?.setContours(app.contours); app.rebuildCutOrder?.(); app.updateContourPanel?.(); app.renderer?.render(); };
        var cmd = new FunctionCommand('Boundary Poly',
            function() { contours.push(nc); rerender(); },
            function() { var idx = contours.indexOf(nc); if (idx !== -1) contours.splice(idx, 1); rerender(); }
        );
        app.undoManager?.execute(cmd);
        this.cmd?.log('✔ Boundary erstellt (Strg+Z)', 'success');
        this.cmd?.setPrompt('BOUNDARY POLY — Nächster Bereich (ESC = Ende):');
    }
    _area(pts) {
        var a = 0, n = pts.length;
        for (var i = 0; i < n; i++) { var j = (i+1) % n; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
        return a / 2;
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  OVERKILL — Duplikate + überlappende Linien entfernen (OK)
// ════════════════════════════════════════════════════════════════════════════

class OverkillTool extends ModificationTool {
    getToolName() { return 'OVERKILL'; }

    start() {
        super.start();
    }

    _onSelectionComplete(contours) {
        this._showToleranceDialog().then(tolerance => {
            if (tolerance === null) {
                this.cmd?.log('OVERKILL abgebrochen', 'info');
                this.cancel();
                return;
            }
            this._executeOverkill(contours, tolerance);
        });
    }

    _executeOverkill(contours, tolerance) {
        const app = this.manager.app;
        const allContours = app.contours;
        const toDelete = new Set();
        let dupeCount = 0;

        // ── Phase 1: Exakte Duplikate ──
        for (let i = 0; i < contours.length; i++) {
            if (toDelete.has(contours[i])) continue;
            for (let j = i + 1; j < contours.length; j++) {
                if (toDelete.has(contours[j])) continue;
                const match = SplineUtils._contoursMatch(contours[i], contours[j], tolerance);
                if (match && match.match) {
                    toDelete.add(contours[j]);
                    dupeCount++;
                }
            }
        }

        // ── Phase 2: Teilüberlappende Linien mergen (nur 2-Punkt-Konturen) ──
        const mergeResult = this._findAndMergeOverlaps(contours, tolerance, toDelete);

        const deleteArr = [...toDelete];
        const mergedArr = mergeResult.merged;
        const mergeCount = mergeResult.mergeCount;

        if (deleteArr.length === 0 && mergedArr.length === 0) {
            this.cmd?.log('Keine Duplikate oder Überlappungen gefunden', 'info');
            app.showToast?.('Keine Duplikate gefunden', 'info');
            this.cancel();
            return;
        }

        // ── Phase 3: Undo-Gruppe ──
        const rerender = () => {
            app.renderer?.setContours(app.contours);
            app.rebuildCutOrder?.();
            app.updateContourPanel?.();
            app.renderer?.render();
        };

        app.undoManager.beginGroup('Overkill');

        if (deleteArr.length > 0) {
            app.undoManager.execute(new DeleteContoursCommand(allContours, deleteArr, rerender));
        }
        if (mergedArr.length > 0) {
            app.undoManager.execute(new AddContoursCommand(allContours, mergedArr, -1, rerender));
        }

        app.undoManager.endGroup();

        // Selektion aufheben
        allContours.forEach(c => c.isSelected = false);
        rerender();

        // ── Phase 4: Feedback ──
        const parts = [];
        if (dupeCount > 0) parts.push(`${dupeCount} Duplikat(e)`);
        if (mergeCount > 0) parts.push(`${mergeCount} Überlappung(en) gemergt`);
        const msg = `✔ Overkill: ${parts.join(', ')} entfernt (Strg+Z)`;
        this.cmd?.log(msg, 'success');
        app.showToast?.(msg, 'success');

        console.log(`[AdvancedTools V1.5] OVERKILL: ${dupeCount} Duplikate, ${mergeCount} Merges (Toleranz ${tolerance}mm)`);

        this.cancel();
    }

    _findAndMergeOverlaps(contours, tolerance, toDelete) {
        const merged = [];
        let mergeCount = 0;
        const consumed = new Set();

        // Nur 2-Punkt-Konturen (einzelne Liniensegmente)
        const lines = contours.filter(c => c.points && c.points.length === 2 && !toDelete.has(c));

        for (let i = 0; i < lines.length; i++) {
            if (consumed.has(lines[i])) continue;
            const a = lines[i];
            const p1 = a.points[0], p2 = a.points[1];

            for (let j = i + 1; j < lines.length; j++) {
                if (consumed.has(lines[j])) continue;
                const b = lines[j];
                const p3 = b.points[0], p4 = b.points[1];

                if (!SplineUtils._segmentsOverlap(p1, p2, p3, p4, tolerance)) continue;

                // Merge: Projiziere alle 4 Punkte auf Richtungsvektor → min/max
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy);
                if (len < tolerance) continue;

                const nx = dx / len, ny = dy / len;
                const pts = [p1, p2, p3, p4];
                const projections = pts.map(p => (p.x - p1.x) * nx + (p.y - p1.y) * ny);
                const minT = Math.min(...projections);
                const maxT = Math.max(...projections);

                const newP1 = { x: p1.x + nx * minT, y: p1.y + ny * minT };
                const newP2 = { x: p1.x + nx * maxT, y: p1.y + ny * maxT };

                const newContour = new CamContour([newP1, newP2], {
                    layer: a.layer || 'DRAW',
                    name: 'Merged_' + (a.name || 'Line')
                });
                newContour.isClosed = false;

                toDelete.add(a);
                toDelete.add(b);
                consumed.add(a);
                consumed.add(b);
                merged.push(newContour);
                mergeCount++;
                break; // a ist konsumiert, nächste
            }
        }

        return { merged, mergeCount };
    }

    _showToleranceDialog() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';
            overlay.innerHTML = `
                <div style="background:#1e1e1e;border:1px solid #555;border-radius:8px;width:320px;padding:20px;color:#ddd;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <h3 style="margin:0 0 12px;font-size:15px;color:#00aaff;">OVERKILL — Toleranz</h3>
                    <p style="margin:0 0 12px;font-size:12px;color:#aaa;">Maximaler Abstand (mm) für Duplikat-Erkennung:</p>
                    <input id="overkill-tol" type="number" value="0.01" min="0.001" max="10" step="0.001"
                        style="width:100%;padding:6px 10px;background:#2a2a2a;border:1px solid #555;border-radius:4px;color:#fff;font-size:14px;box-sizing:border-box;">
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                        <button id="ok-cancel" style="padding:6px 16px;background:#555;border:none;border-radius:4px;color:#ddd;cursor:pointer;">Abbrechen</button>
                        <button id="ok-proceed" style="padding:6px 16px;background:#00aaff;border:none;border-radius:4px;color:#000;cursor:pointer;font-weight:600;">OK</button>
                    </div>
                </div>`;

            document.body.appendChild(overlay);

            const input = overlay.querySelector('#overkill-tol');
            const cleanup = (val) => { overlay.remove(); resolve(val); };

            overlay.querySelector('#ok-cancel').addEventListener('click', () => cleanup(null));
            overlay.querySelector('#ok-proceed').addEventListener('click', () => {
                const val = parseFloat(input.value);
                cleanup(isNaN(val) || val <= 0 ? 0.01 : val);
            });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });

            // Enter = OK, ESC = Abbrechen
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') overlay.querySelector('#ok-proceed').click();
                if (e.key === 'Escape') cleanup(null);
            });

            setTimeout(() => { input.focus(); input.select(); }, 50);
        });
    }
}


// ════════════════════════════════════════════════════════════════════════════
//  REGISTRIERUNG — Lazy-Patch in DrawingToolManager
// ════════════════════════════════════════════════════════════════════════════

if (typeof DrawingToolManager !== 'undefined') {
    var _origStartToolAdv = DrawingToolManager.prototype.startTool;
    DrawingToolManager.prototype.startTool = function(shortcut) {
        if (!this.tools['F']) {
            // Tier 5: Advanced CAD Tools
            this.tools['F']       = () => new FilletTool(this);
            this.tools['FILLET']  = () => new FilletTool(this);
            this.tools['T']       = () => new TrimTool(this);
            this.tools['TRIM']    = () => new TrimTool(this);
            this.tools['EX']      = () => new ExtendTool(this);
            this.tools['EXTEND']  = () => new ExtendTool(this);
            this.tools['CH']      = () => new ChamferTool(this);
            this.tools['CHAMFER'] = () => new ChamferTool(this);
            this.tools['ZF']      = () => new ZeroFilletTool(this);
            this.tools['BO']      = () => new BooleanTool(this);
            this.tools['BOOLEAN'] = () => new BooleanTool(this);
            this.tools['NG']      = () => new NgonTool(this);
            this.tools['NGON']    = () => new NgonTool(this);
            this.tools['OB']      = () => new ObroundTool(this);
            this.tools['OBROUND'] = () => new ObroundTool(this);
            this.tools['AB']      = () => new ArabeskeTool(this);
            this.tools['ARABESKE']= () => new ArabeskeTool(this);
            this.tools['AR']      = () => new ArrayTool(this);
            this.tools['ARRAY']   = () => new ArrayTool(this);
            this.tools['LE']      = () => new LengthenTool(this);
            this.tools['LENGTHEN']= () => new LengthenTool(this);
            this.tools['BP']      = () => new BoundaryPolyTool(this);
            this.tools['OK']      = () => new OverkillTool(this);
            this.tools['OVERKILL']= () => new OverkillTool(this);

            // Offset-Stub ersetzen
            this.tools['O']       = () => new OffsetToolAdvanced(this);
            this.tools['OFFSET']  = () => new OffsetToolAdvanced(this);

            // Ribbon-Alias-Fix
            if (!this.tools['CO']) this.tools['CO'] = () => new CopyTool(this);
            if (!this.tools['RO']) this.tools['RO'] = () => new RotateTool(this);
            if (!this.tools['MI']) this.tools['MI'] = () => new MirrorTool(this);
            if (!this.tools['SC']) this.tools['SC'] = () => new ScaleTool(this);
            if (!this.tools['E'])  this.tools['E']  = () => new EraseTool(this);

            console.log('[AdvancedTools V1.5] ✅ 14 Tier 5 Tools + Overkill + Alias-Fix registriert');
        }

        // Auto-Apply Erweiterung
        var key = shortcut.toUpperCase();
        var modTools = ['F','FILLET','T','TRIM','EX','EXTEND','CH','CHAMFER','ZF','BO','BOOLEAN',
                        'AR','ARRAY','LE','LENGTHEN','BP','O','OFFSET','OK','OVERKILL'];
        if (modTools.indexOf(key) !== -1 && this.entities.length > 0) {
            this.commandLine?.log('Auto-Apply: ' + this.entities.length + ' Objekte übernommen', 'info');
            this.applyEntities();
        }

        return _origStartToolAdv.call(this, shortcut);
    };

    console.debug('[AdvancedTools V1.5] ✅ Lazy-Patch installiert');
}
