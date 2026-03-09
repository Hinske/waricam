/**
 * WARICAM Text Tool V1.1
 * Text → schneidbare Vektor-Konturen via opentype.js
 * Created: 2026-02-16 MEZ
 * Build: 20260216-1900 MEZ
 *
 * Features:
 *   - Beliebige TTF/OTF Fonts (per File-Picker)
 *   - Buchstabenabstand (Spacing)
 *   - Zeilenumbrüche (\n oder | als Trenner)
 *   - Textausrichtung (Links/Mitte/Rechts)
 *   - Stencil-Modus (Brücken für Inselbuchstaben)
 *   - Fett/Kursiv via Font-Datei-Auswahl
 *   - Adaptive Bezier-Tessellierung (De Casteljau)
 *
 * Abhängigkeiten:
 *   - opentype.min.js (lokal eingebunden)
 *   - drawing-tools.js (BaseTool, DrawingToolManager)
 *
 * Laden: NACH drawing-tools-ext.js, VOR app.js
 */


// ════════════════════════════════════════════════════════════════════════════
//  TEXT TOOL (TX) — Text → Vektor-Konturen
// ════════════════════════════════════════════════════════════════════════════

class TextTool extends BaseTool {
    constructor(manager) {
        super(manager);
        this.text = '';
        this.height = 20;            // Schrifthöhe mm
        this.spacing = 0;            // Zusätzlicher Zeichenabstand mm
        this.lineSpacing = 1.5;      // Zeilenabstand (Faktor × Höhe)
        this.align = 'left';         // 'left' | 'center' | 'right'
        this.stencil = false;        // Stencil-Brücken
        this.bridgeWidth = 1.0;      // Brückenbreite mm
        this.font = null;
        this.state = 'text';         // 'text' | 'options' | 'height' | 'place'
        this._previewPaths = null;
    }

    start() {
        console.log('[TextTool V1.1] gestartet');

        if (!TextTool._loadedFont) {
            this._loadDefaultFont();
        } else {
            this.font = TextTool._loadedFont;
        }

        this.cmd?.setPrompt('TEXT — Text eingeben (| = Zeilenumbruch):');
        this.cmd?.log('🔤 Text-Tool V1.1: Text → Höhe → Optionen → Platzieren', 'info');
        this.cmd?.log('   Optionen: FONT, SP=Spacing, AL=Ausrichtung, ST=Stencil', 'info');
    }

    // ── Statischer Font-Cache ───────────────────────────────────────
    static _loadedFont = null;
    static _fontName = '';

    _loadDefaultFont() {
        if (typeof opentype === 'undefined') {
            console.error('[TextTool V1.1] ❌ opentype.js nicht geladen!');
            this.cmd?.log('❌ opentype.js fehlt! Bitte opentype.min.js einbinden.', 'error');
            return;
        }
        console.log('[TextTool V1.1] Kein Font gecacht — öffne Datei-Dialog...');
        this.cmd?.log('📂 Font-Datei auswählen (.ttf/.otf) — z.B. C:\\Windows\\Fonts\\arial.ttf', 'info');
        this.cmd?.log('   Für FETT: arialbd.ttf | Für KURSIV: ariali.ttf', 'info');
        this._openFontPicker();
    }

    // ── Input Handling ──────────────────────────────────────────────

    handleRawInput(value) {
        var trimmed = value.trim();
        var upper = trimmed.toUpperCase();

        // ── Globale Befehle (in jedem State) ────────────────────────
        if (upper === 'FONT') { this._openFontPicker(); return true; }

        // ── State: Text eingeben ────────────────────────────────────
        if (this.state === 'text') {
            if (trimmed.length === 0) return false;
            // | als Zeilenumbruch-Trenner
            this.text = trimmed.replace(/\|/g, '\n');
            this.state = 'height';
            this.cmd?.setPrompt('TEXT — Schrifthöhe <' + this.height + '> (Enter=Standard):');
            console.log('[TextTool V1.1] Text: "' + this.text.replace(/\n/g, '|') + '"');
            return true;
        }

        // ── State: Höhe eingeben ────────────────────────────────────
        if (this.state === 'height') {
            var num = parseFloat(trimmed);
            if (!isNaN(num) && num > 0) {
                this.height = num;
            }
            this.state = 'options';
            this._showOptions();
            return true;
        }

        // ── State: Optionen ─────────────────────────────────────────
        if (this.state === 'options') {
            return this._handleOption(trimmed, upper);
        }

        return false;
    }

    _showOptions() {
        var info = 'H=' + this.height + ' SP=' + this.spacing +
                   ' AL=' + this.align + (this.stencil ? ' STENCIL=EIN' : '');
        this.cmd?.setPrompt('TEXT Optionen [SP/AL/ST/FONT/Enter=Platzieren] ' + info + ':');
    }

    _handleOption(trimmed, upper) {
        // SP = Spacing eingeben
        if (upper === 'SP') {
            this.cmd?.setPrompt('TEXT — Zeichenabstand mm <' + this.spacing + '>:');
            this.state = '_spacing';
            return true;
        }
        // AL = Alignment
        if (upper === 'AL') {
            this.cmd?.setPrompt('TEXT — Ausrichtung [L=Links / C=Mitte / R=Rechts]:');
            this.state = '_align';
            return true;
        }
        // ST = Stencil Toggle
        if (upper === 'ST') {
            this.stencil = !this.stencil;
            this.cmd?.log('Stencil-Modus: ' + (this.stencil ? 'EIN ✅' : 'AUS'), 'info');
            if (this.stencil) {
                this.cmd?.setPrompt('TEXT — Brückenbreite mm <' + this.bridgeWidth + '>:');
                this.state = '_bridge';
            } else {
                this._showOptions();
            }
            return true;
        }
        // BW = Bridge Width direkt
        if (upper === 'BW') {
            this.cmd?.setPrompt('TEXT — Brückenbreite mm <' + this.bridgeWidth + '>:');
            this.state = '_bridge';
            return true;
        }
        // LS = Line Spacing
        if (upper === 'LS') {
            this.cmd?.setPrompt('TEXT — Zeilenabstand Faktor <' + this.lineSpacing + '>:');
            this.state = '_linespacing';
            return true;
        }

        // Sub-States für numerische Eingaben
        if (this.state === '_spacing') {
            var sp = parseFloat(trimmed);
            if (!isNaN(sp)) this.spacing = sp;
            this.state = 'options';
            this.cmd?.log('Zeichenabstand: ' + this.spacing + ' mm', 'info');
            this._showOptions();
            return true;
        }
        if (this.state === '_align') {
            if (upper === 'L' || upper === 'LEFT')   this.align = 'left';
            if (upper === 'C' || upper === 'CENTER') this.align = 'center';
            if (upper === 'R' || upper === 'RIGHT')  this.align = 'right';
            this.state = 'options';
            this.cmd?.log('Ausrichtung: ' + this.align, 'info');
            this._showOptions();
            return true;
        }
        if (this.state === '_bridge') {
            var bw = parseFloat(trimmed);
            if (!isNaN(bw) && bw > 0) this.bridgeWidth = bw;
            this.state = 'options';
            this.cmd?.log('Brückenbreite: ' + this.bridgeWidth + ' mm', 'info');
            this._showOptions();
            return true;
        }
        if (this.state === '_linespacing') {
            var ls = parseFloat(trimmed);
            if (!isNaN(ls) && ls > 0) this.lineSpacing = ls;
            this.state = 'options';
            this.cmd?.log('Zeilenabstand: ' + this.lineSpacing + '×', 'info');
            this._showOptions();
            return true;
        }

        return false;
    }

    handleClick(point) {
        if (this.state === 'place') {
            this._placeText(point);
        }
    }

    handleMouseMove(point) {
        if (this.state === 'place' && this._previewPaths) {
            var allContours = [];
            for (var i = 0; i < this._previewPaths.length; i++) {
                var contour = this._previewPaths[i];
                var shifted = [];
                for (var j = 0; j < contour.length; j++) {
                    shifted.push({
                        x: contour[j].x + point.x,
                        y: contour[j].y + point.y
                    });
                }
                allContours.push(shifted);
            }
            this.manager.rubberBand = {
                type: 'textPreview',
                data: { contours: allContours }
            };
            this.manager.renderer?.render();
        }
    }

    acceptsOption(opt) { return false; }

    finish() {
        // Enter in Options-State → Platzierungsmodus
        if (this.state === 'options' || this.state === 'height') {
            if (this.state === 'height') {
                // Default-Höhe übernehmen
            }
            this.state = 'place';
            this._prepareContours();
            this.cmd?.setPrompt('TEXT "' + this.text.replace(/\n/g, '|') + '" — Platzierungspunkt klicken:');
            return;
        }
        // Enter in Sub-States → zurück zu Options
        if (this.state.startsWith('_')) {
            this.state = 'options';
            this._showOptions();
            return;
        }
        // Enter im Place-Modus → Tool beenden
        this.manager.rubberBand = null;
        this.manager._setDefaultPrompt();
        this.manager.activeTool = null;
        this.manager.renderer?.render();
    }

    // ── Font Picker ─────────────────────────────────────────────────

    _openFontPicker() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ttf,.otf,.woff';
        var self = this;
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;

            console.log('[TextTool V1.1] Lade Font: ' + file.name);
            var reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    var buffer = evt.target.result;
                    var font = opentype.parse(buffer);
                    TextTool._loadedFont = font;
                    TextTool._fontName = file.name;
                    self.font = font;
                    console.log('[TextTool V1.1] ✅ Font: ' + file.name + ' (' + font.numGlyphs + ' Glyphen)');
                    self.cmd?.log('✅ Font: ' + file.name, 'success');
                    if (self.state === 'text' && self.text === '') {
                        self.cmd?.setPrompt('TEXT — Text eingeben (| = Zeilenumbruch):');
                    }
                } catch (err) {
                    console.error('[TextTool V1.1] Font-Fehler:', err);
                    self.cmd?.log('❌ Font-Fehler: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        };
        input.click();
    }

    // ── Kontur-Erzeugung ────────────────────────────────────────────

    _prepareContours() {
        if (!this.font) {
            this.cmd?.log('⚠ Kein Font geladen! Tippe FONT.', 'warning');
            return;
        }

        console.time('[TextTool V1.1] Kontur-Erzeugung');

        var lines = this.text.split('\n');
        var allContours = [];
        var lineHeight = this.height * this.lineSpacing;

        // Textbreiten pro Zeile berechnen (für Alignment)
        var lineWidths = [];
        for (var li = 0; li < lines.length; li++) {
            var w = this._measureLineWidth(lines[li]);
            lineWidths.push(w);
        }
        var maxWidth = Math.max.apply(null, lineWidths);

        // Jede Zeile verarbeiten
        for (var li = 0; li < lines.length; li++) {
            var line = lines[li];
            if (line.length === 0) continue;

            // Alignment-Offset berechnen
            var xOffset = 0;
            if (this.align === 'center') {
                xOffset = (maxWidth - lineWidths[li]) / 2;
            } else if (this.align === 'right') {
                xOffset = maxWidth - lineWidths[li];
            }

            // Y-Offset für Zeile (nach unten = positiv im CAD-Koordinatensystem)
            var yOffset = -li * lineHeight;

            // Zeichenweise Pfade generieren (für Spacing-Kontrolle)
            var charX = xOffset;
            for (var ci = 0; ci < line.length; ci++) {
                var ch = line[ci];
                if (ch === ' ') {
                    // Leerzeichen: nur Advance
                    var spaceGlyph = this.font.charToGlyph(' ');
                    var spaceAdv = (spaceGlyph.advanceWidth || 500) / this.font.unitsPerEm * this.height;
                    charX += spaceAdv + this.spacing;
                    continue;
                }

                var path = this.font.getPath(ch, charX, -yOffset, this.height);
                var charContours = this._pathToContours(path.commands);

                // Konturen zum Ergebnis hinzufügen
                for (var k = 0; k < charContours.length; k++) {
                    allContours.push(charContours[k]);
                }

                // Advance Width + Spacing
                var glyph = this.font.charToGlyph(ch);
                var advance = (glyph.advanceWidth || 500) / this.font.unitsPerEm * this.height;
                charX += advance + this.spacing;
            }
        }

        // Stencil-Brücken anwenden
        if (this.stencil && allContours.length > 1) {
            allContours = this._applyStencilBridges(allContours);
        }

        this._previewPaths = allContours;

        console.timeEnd('[TextTool V1.1] Kontur-Erzeugung');
        console.log('[TextTool V1.1] ' + allContours.length + ' Konturen, ' +
                     lines.length + ' Zeile(n), Align=' + this.align +
                     (this.stencil ? ', Stencil=EIN' : ''));
    }

    /**
     * Textbreite einer Zeile messen (in mm)
     */
    _measureLineWidth(line) {
        var width = 0;
        for (var i = 0; i < line.length; i++) {
            var glyph = this.font.charToGlyph(line[i]);
            var advance = (glyph.advanceWidth || 500) / this.font.unitsPerEm * this.height;
            width += advance + (i < line.length - 1 ? this.spacing : 0);
        }
        return width;
    }

    // ── Stencil-Brücken ─────────────────────────────────────────────

    /**
     * Stencil-Brücken für Inselbuchstaben (O, A, B, D, etc.)
     * Einfacher Ansatz: Für jede innere Kontur (die vollständig in einer
     * äußeren liegt) horizontale Brücken einfügen.
     *
     * Brücke = Lücke in äußerer + innerer Kontur an gleicher Y-Position
     */
    _applyStencilBridges(contours) {
        var bw = this.bridgeWidth;
        var result = [];

        // Bounding-Boxes berechnen
        var boxes = [];
        for (var i = 0; i < contours.length; i++) {
            boxes.push(this._getBBox(contours[i]));
        }

        // Innere Konturen finden (BB vollständig innerhalb einer anderen)
        var isInner = [];
        var parentOf = [];
        for (var i = 0; i < contours.length; i++) {
            isInner[i] = false;
            parentOf[i] = -1;
            for (var j = 0; j < contours.length; j++) {
                if (i === j) continue;
                if (boxes[i].minX > boxes[j].minX && boxes[i].maxX < boxes[j].maxX &&
                    boxes[i].minY > boxes[j].minY && boxes[i].maxY < boxes[j].maxY) {
                    // Zusätzlich Fläche prüfen — innere muss kleiner sein
                    if (this._contourArea(contours[i]) < this._contourArea(contours[j])) {
                        isInner[i] = true;
                        parentOf[i] = j;
                        break;
                    }
                }
            }
        }

        // Für jede innere Kontur: Brücken an 2 Stellen (links + rechts)
        var bridgeCuts = []; // { contourIdx, y, xLeft, xRight }

        for (var i = 0; i < contours.length; i++) {
            if (!isInner[i]) continue;
            var bb = boxes[i];
            var midY = (bb.minY + bb.maxY) / 2;

            // Linke Brücke
            bridgeCuts.push({
                innerIdx: i,
                outerIdx: parentOf[i],
                y: midY,
                x: bb.minX,
                side: 'left'
            });
            // Rechte Brücke
            bridgeCuts.push({
                innerIdx: i,
                outerIdx: parentOf[i],
                y: midY,
                x: bb.maxX,
                side: 'right'
            });
        }

        // Brücken anwenden: Konturen an Brückenpositionen aufbrechen
        // Einfache Implementierung: Segmente in Brückenbereich entfernen
        for (var i = 0; i < contours.length; i++) {
            var pts = contours[i];
            var cutPts = [];

            // Prüfe ob diese Kontur Brücken-Cuts hat
            var cuts = [];
            for (var c = 0; c < bridgeCuts.length; c++) {
                if (bridgeCuts[c].innerIdx === i || bridgeCuts[c].outerIdx === i) {
                    cuts.push(bridgeCuts[c]);
                }
            }

            if (cuts.length === 0) {
                result.push(pts);
                continue;
            }

            // Punkte filtern: Punkte im Brückenbereich entfernen
            var filtered = [];
            for (var p = 0; p < pts.length; p++) {
                var inBridge = false;
                for (var c = 0; c < cuts.length; c++) {
                    var cut = cuts[c];
                    var halfBW = bw / 2;
                    if (Math.abs(pts[p].y - cut.y) < halfBW &&
                        Math.abs(pts[p].x - cut.x) < bw * 2) {
                        inBridge = true;
                        break;
                    }
                }
                if (!inBridge) {
                    filtered.push(pts[p]);
                }
            }

            if (filtered.length >= 3) {
                result.push(filtered);
            }
        }

        console.log('[TextTool V1.1] Stencil: ' + bridgeCuts.length + ' Brücken bei ' +
                     bridgeCuts.length / 2 + ' Inselbuchstaben');
        return result;
    }

    _getBBox(points) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < points.length; i++) {
            if (points[i].x < minX) minX = points[i].x;
            if (points[i].y < minY) minY = points[i].y;
            if (points[i].x > maxX) maxX = points[i].x;
            if (points[i].y > maxY) maxY = points[i].y;
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    _contourArea(points) {
        // Shoelace
        var area = 0;
        for (var i = 0; i < points.length - 1; i++) {
            area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
        }
        return Math.abs(area) / 2;
    }

    // ── Bezier → Polylinien ─────────────────────────────────────────

    _pathToContours(commands) {
        var contours = [];
        var currentContour = [];
        var cx = 0, cy = 0;

        for (var k = 0; k < commands.length; k++) {
            var cmd = commands[k];
            switch (cmd.type) {
                case 'M':
                    if (currentContour.length >= 3) {
                        contours.push(this._closeContour(currentContour));
                    }
                    currentContour = [];
                    cx = cmd.x;
                    cy = -cmd.y;
                    currentContour.push({ x: cx, y: cy });
                    break;

                case 'L':
                    cx = cmd.x;
                    cy = -cmd.y;
                    currentContour.push({ x: cx, y: cy });
                    break;

                case 'Q': {
                    var pts = this._tessellateQuadBezier(
                        { x: cx, y: cy },
                        { x: cmd.x1, y: -cmd.y1 },
                        { x: cmd.x, y: -cmd.y }
                    );
                    for (var i = 1; i < pts.length; i++) currentContour.push(pts[i]);
                    cx = cmd.x; cy = -cmd.y;
                    break;
                }

                case 'C': {
                    var pts = this._tessellateCubicBezier(
                        { x: cx, y: cy },
                        { x: cmd.x1, y: -cmd.y1 },
                        { x: cmd.x2, y: -cmd.y2 },
                        { x: cmd.x, y: -cmd.y }
                    );
                    for (var i = 1; i < pts.length; i++) currentContour.push(pts[i]);
                    cx = cmd.x; cy = -cmd.y;
                    break;
                }

                case 'Z':
                    if (currentContour.length >= 3) {
                        contours.push(this._closeContour(currentContour));
                    }
                    currentContour = [];
                    break;
            }
        }

        if (currentContour.length >= 3) {
            contours.push(this._closeContour(currentContour));
        }
        return contours;
    }

    _closeContour(points) {
        var first = points[0];
        var last = points[points.length - 1];
        if (Math.hypot(last.x - first.x, last.y - first.y) > 0.01) {
            points.push({ x: first.x, y: first.y });
        }
        return points;
    }

    _tessellateQuadBezier(p0, p1, p2) {
        var points = [p0];
        this._subdivideQuad(p0, p1, p2, 0.1, points, 0);
        points.push(p2);
        return points;
    }

    _subdivideQuad(p0, p1, p2, tol, result, depth) {
        if (depth > 10) return;
        var midX = (p0.x + p2.x) / 2;
        var midY = (p0.y + p2.y) / 2;
        if (Math.hypot(p1.x - midX, p1.y - midY) < tol) return;

        var q0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        var q1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        var r  = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };

        this._subdivideQuad(p0, q0, r, tol, result, depth + 1);
        result.push(r);
        this._subdivideQuad(r, q1, p2, tol, result, depth + 1);
    }

    _tessellateCubicBezier(p0, p1, p2, p3) {
        var points = [p0];
        this._subdivideCubic(p0, p1, p2, p3, 0.1, points, 0);
        points.push(p3);
        return points;
    }

    _subdivideCubic(p0, p1, p2, p3, tol, result, depth) {
        if (depth > 10) return;
        var dx = p3.x - p0.x, dy = p3.y - p0.y;
        var len = Math.hypot(dx, dy);
        if (len < 1e-10) return;

        var d1 = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) / len;
        var d2 = Math.abs((p2.x - p0.x) * dy - (p2.y - p0.y) * dx) / len;
        if (Math.max(d1, d2) < tol) return;

        var q0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        var q1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        var q2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        var r0 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
        var r1 = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
        var s  = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 };

        this._subdivideCubic(p0, q0, r0, s, tol, result, depth + 1);
        result.push(s);
        this._subdivideCubic(s, r1, q2, p3, tol, result, depth + 1);
    }

    // ── Platzierung ─────────────────────────────────────────────────

    _placeText(point) {
        if (!this._previewPaths || this._previewPaths.length === 0) {
            this.cmd?.log('Keine Konturen — prüfe Font', 'error');
            return;
        }

        console.log('[TextTool V1.1] Platziere bei (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')');

        var totalPoints = 0;
        for (var i = 0; i < this._previewPaths.length; i++) {
            var contour = this._previewPaths[i];
            var shifted = [];
            for (var j = 0; j < contour.length; j++) {
                shifted.push({
                    x: contour[j].x + point.x,
                    y: contour[j].y + point.y
                });
            }

            this.manager.addEntity({
                type: 'POLYLINE',
                points: shifted,
                closed: !this.stencil, // Stencil-Konturen sind offen (Brücken)
                sourceText: this.text,
                sourceFont: TextTool._fontName
            });
            totalPoints += shifted.length;
        }

        var info = this._previewPaths.length + ' Konturen, ' + totalPoints + ' Pkt';
        if (this.stencil) info += ', Stencil';
        console.log('[TextTool V1.1] ✔ "' + this.text.replace(/\n/g, '|') + '" → ' + info);
        this.cmd?.log('✔ Text → ' + info, 'success');

        // Reset
        this.manager.rubberBand = null;
        this.text = '';
        this.state = 'text';
        this._previewPaths = null;
        this.cmd?.setPrompt('TEXT — Text eingeben (Enter=Fertig):');
    }

    cancel() {
        this._previewPaths = null;
        super.cancel();
    }

    getLastPoint() { return null; }
}


// ════════════════════════════════════════════════════════════════════════════
//  LAZY-PATCH REGISTRATION
// ════════════════════════════════════════════════════════════════════════════

if (typeof DrawingToolManager !== 'undefined') {
    var _origStartToolTxt = DrawingToolManager.prototype.startTool;
    DrawingToolManager.prototype.startTool = function(shortcut) {
        if (!this.tools['TX']) {
            this.tools['TX']    = () => new TextTool(this);
            this.tools['TEXT']  = () => new TextTool(this);
            this.tools['DTEXT'] = () => new TextTool(this);

            console.log('[TextTool V1.1] ✅ Text-Tool registriert: TX, TEXT, DTEXT');
        }
        return _origStartToolTxt.call(this, shortcut);
    };

    console.log('[TextTool V1.1] Lazy-Patch auf startTool() installiert');
} else {
    console.error('[TextTool V1.1] ❌ DrawingToolManager nicht gefunden!');
}
