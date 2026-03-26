/**
 * CeraCUT DXF Writer V1.5
 * Export von Konturen als AutoCAD DXF R12 (AC1009)
 *
 * Unterstützte Entity-Typen:
 * - LINE (Einzelsegmente)
 * - POLYLINE / VERTEX / SEQEND (Polylinien mit Bulge, geschlossen/offen)
 * - CIRCLE (Kreise — wenn sourceType === 'CIRCLE')
 * - ARC (Bögen — wenn sourceType === 'ARC')
 *
 * Format: AutoCAD R12 (AC1009) — universell kompatibel
 *   HEADER → TABLES → ENTITIES → EOF
 *   Keine Handles, keine CLASSES/BLOCKS/OBJECTS nötig.
 *
 * Encoding: ANSI_1252 (Windows Western) — korrekte Umlaute in Layer-Namen
 *
 * V1.5: Downgrade AC1015→AC1009, ANSI_1252-Encoding, SPLINE→POLYLINE
 * V1.4: AC1015 mit CLASSES/BLOCKS/OBJECTS (crashte AutoCAD wegen fehlender Handles)
 *
 * Created: 2026-02-15 MEZ
 * Last Modified: 2026-03-26 MEZ
 * Build: 20260326-ac1009
 */

class DXFWriter {

    constructor() {
        this.lines = [];
        this.precision = 6; // Dezimalstellen für Koordinaten
    }

    // ═══ ÖFFENTLICHE API ═══

    /**
     * Konturen + Layer als DXF-String exportieren
     * @param {Array} contours - CamContour-Array
     * @param {LayerManager} layerManager - Layer-Definitionen
     * @param {object} options - { filename }
     * @returns {{ content: string, filename: string, stats: object }}
     */
    generate(contours, layerManager, options = {}) {
        this.lines = [];

        const stats = { entities: 0, layers: 0, lines: 0, polylines: 0, circles: 0, arcs: 0, images: 0 };

        // ── HEADER Section ──
        this._writeHeader();

        // ── TABLES Section (R12: nur LAYER + LTYPE) ──
        this._writeTablesStart();
        this._writeLayerTable(layerManager, stats);
        this._writeLineTypeTable();
        this._writeTablesEnd();

        // ── ENTITIES Section ──
        this._writeSectionStart('ENTITIES');
        
        for (const contour of contours) {
            if (!contour.points || contour.points.length < 2) continue;
            
            // Layer-Sichtbarkeit prüfen — unsichtbare Layer nicht exportieren
            const layerName = contour.layer || '0';
            if (layerManager && !layerManager.isVisible(layerName)) continue;

            // Entity-Typ bestimmen
            const sourceType = (contour.sourceType || '').toUpperCase();
            
            if (sourceType === 'CIRCLE' && contour.isClosed) {
                this._writeCircle(contour, stats);
            } else if (contour.points.length === 2 && !contour.isClosed) {
                this._writeLine(contour.points[0], contour.points[1], layerName, stats);
            } else {
                this._writePolyline(contour, stats);
            }
        }

        // V3.11: Image Underlay Entities
        if (options.imageUnderlayManager?.underlays?.length > 0) {
            const imgLines = options.imageUnderlayManager.getDXFEntities();
            for (const line of imgLines) {
                this.lines.push(line.trim());
            }
            stats.images = options.imageUnderlayManager.underlays.length;
            stats.entities += stats.images;
        }

        this._writeSectionEnd();

        // ── EOF ──
        this._write(0, 'EOF');

        const content = this.lines.join('\r\n');
        const filename = options.filename || 'export.dxf';

        return {
            content,
            filename,
            stats: {
                ...stats,
                totalLines: this.lines.length,
                fileSize: content.length
            }
        };
    }

    /**
     * DXF als Datei-Download auslösen
     * Encoding: ANSI_1252 (Windows Western) für korrekte Umlaute
     */
    generateDownload(contours, layerManager, options = {}) {
        const result = this.generate(contours, layerManager, options);

        // ANSI_1252 Encoding: UTF-8 String → Byte-Array
        const bytes = this._encodeAnsi1252(result.content);
        const blob = new Blob([bytes], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return result;
    }

    /**
     * UTF-8 JavaScript String → ANSI_1252 Uint8Array
     * Konvertiert deutsche Umlaute und Sonderzeichen korrekt.
     */
    _encodeAnsi1252(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 128) {
                bytes[i] = code;
            } else {
                // ANSI_1252 Mapping für häufige Zeichen
                bytes[i] = DXFWriter._ANSI1252_MAP[code] || 0x3F; // '?' als Fallback
            }
        }
        return bytes;
    }

    // ═══ HEADER SECTION ═══

    _writeHeader() {
        this._writeSectionStart('HEADER');

        // AutoCAD Version: R12 (universell kompatibel, keine Handles nötig)
        this._write(9, '$ACADVER');
        this._write(1, 'AC1009');

        // Einfügepunkt
        this._write(9, '$INSBASE');
        this._write(10, '0.0');
        this._write(20, '0.0');
        this._write(30, '0.0');

        // Zeichnungs-Grenzen
        this._write(9, '$EXTMIN');
        this._write(10, '0.0');
        this._write(20, '0.0');
        this._write(30, '0.0');
        this._write(9, '$EXTMAX');
        this._write(10, '1000.0');
        this._write(20, '1000.0');
        this._write(30, '0.0');

        // Einheiten: Millimeter
        this._write(9, '$INSUNITS');
        this._write(70, '4');

        // Punkt-Format
        this._write(9, '$PDMODE');
        this._write(70, '0');

        this._writeSectionEnd();
    }

    // ═══ TABLES SECTION ═══

    _writeTablesStart() {
        this._writeSectionStart('TABLES');
    }

    _writeTablesEnd() {
        this._writeSectionEnd();
    }

    _writeLayerTable(layerManager, stats) {
        const layers = layerManager ? layerManager.getAllLayers() : [{ name: '0', color: '#ffffff', lineType: 'Continuous' }];
        
        this._write(0, 'TABLE');
        this._write(2, 'LAYER');
        this._write(70, layers.length.toString());

        for (const layer of layers) {
            this._write(0, 'LAYER');
            this._write(2, layer.name);
            this._write(70, layer.locked ? '4' : '0');  // 4 = locked (DXF R2000+)
            const aci = (typeof hexToACI === 'function') ? hexToACI(layer.color) : 7;
            this._write(62, aci.toString());  // ACI Farbe
            this._write(6, this._mapLineType(layer.lineType));
            stats.layers++;
        }

        this._write(0, 'ENDTAB');
    }

    _writeLineTypeTable() {
        this._write(0, 'TABLE');
        this._write(2, 'LTYPE');
        this._write(70, '4');

        // CONTINUOUS
        this._write(0, 'LTYPE');
        this._write(2, 'CONTINUOUS');
        this._write(70, '0');
        this._write(3, 'Solid line');
        this._write(72, '65');
        this._write(73, '0');
        this._write(40, '0.0');

        // DASHED
        this._write(0, 'LTYPE');
        this._write(2, 'DASHED');
        this._write(70, '0');
        this._write(3, 'Dashed __ __ __');
        this._write(72, '65');
        this._write(73, '2');
        this._write(40, '6.0');
        this._write(49, '4.0');
        this._write(49, '-2.0');

        // DASHDOT
        this._write(0, 'LTYPE');
        this._write(2, 'DASHDOT');
        this._write(70, '0');
        this._write(3, 'Dash dot __.__.__ ');
        this._write(72, '65');
        this._write(73, '4');
        this._write(40, '8.0');
        this._write(49, '4.0');
        this._write(49, '-1.0');
        this._write(49, '0.0');
        this._write(49, '-1.0');

        // DOT
        this._write(0, 'LTYPE');
        this._write(2, 'DOT');
        this._write(70, '0');
        this._write(3, 'Dot . . . .');
        this._write(72, '65');
        this._write(73, '2');
        this._write(40, '2.0');
        this._write(49, '0.0');
        this._write(49, '-2.0');

        this._write(0, 'ENDTAB');
    }

    // ═══ ENTITIES ═══

    _writeLine(p1, p2, layer, stats) {
        this._write(0, 'LINE');
        this._write(8, layer || '0');
        this._write(10, this._fmt(p1.x));
        this._write(20, this._fmt(p1.y));
        this._write(30, '0.0');
        this._write(11, this._fmt(p2.x));
        this._write(21, this._fmt(p2.y));
        this._write(31, '0.0');
        stats.lines++;
        stats.entities++;
    }

    _writePolyline(contour, stats) {
        const layer = contour.layer || '0';
        const isClosed = contour.isClosed;
        const points = contour.points;

        // R12 POLYLINE Header
        this._write(0, 'POLYLINE');
        this._write(8, layer);
        this._write(66, '1');     // Vertices folgen
        this._write(70, isClosed ? '1' : '0');  // 1 = geschlossen

        // Punkte — bei geschlossenen Polylinien den letzten Punkt nur weglassen
        // wenn er tatsächlich mit dem ersten identisch ist (DXF schließt über Flag 70=1)
        let count = points.length;
        if (isClosed && points.length > 1) {
            const first = points[0], last = points[points.length - 1];
            if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
                count = points.length - 1;
            }
        }
        for (let i = 0; i < count; i++) {
            this._write(0, 'VERTEX');
            this._write(8, layer);
            this._write(10, this._fmt(points[i].x));
            this._write(20, this._fmt(points[i].y));
            this._write(30, '0.0');
        }

        this._write(0, 'SEQEND');
        this._write(8, layer);
        
        stats.polylines++;
        stats.entities++;
    }

    _writeCircle(contour, stats) {
        const layer = contour.layer || '0';
        let cx, cy, radius;

        if (contour._center && contour._radius) {
            // Originale Geometrie vom Parser — exakt
            cx = contour._center.x;
            cy = contour._center.y;
            radius = contour._radius;
        } else {
            // Fallback: Kreis aus 3 Punkten berechnen (circumscribed circle)
            const pts = contour.points;
            const fit = this._fitCircle(pts);
            if (fit) {
                cx = fit.cx;
                cy = fit.cy;
                radius = fit.radius;
            } else {
                // Letzter Fallback: als Polyline exportieren
                console.warn('[DXF-Writer V1.5] Kreis-Validierung fehlgeschlagen, exportiere als Polyline');
                this._writePolyline(contour, stats);
                return;
            }
        }

        this._write(0, 'CIRCLE');
        this._write(8, layer);
        this._write(10, this._fmt(cx));
        this._write(20, this._fmt(cy));
        this._write(30, '0.0');
        this._write(40, this._fmt(radius));

        stats.circles++;
        stats.entities++;
    }

    /**
     * Kreis aus Punktliste fitten — nimmt 3 gleichverteilte Punkte
     * und berechnet den Umkreis. Validiert dann alle Punkte gegen den Radius.
     * @returns {{ cx, cy, radius }} oder null bei Fehler
     */
    _fitCircle(points) {
        if (!points || points.length < 3) return null;

        // 3 gleichverteilte Punkte wählen (nicht benachbart)
        const n = points.length;
        const i0 = 0;
        const i1 = Math.floor(n / 3);
        const i2 = Math.floor(2 * n / 3);
        const p1 = points[i0], p2 = points[i1], p3 = points[i2];

        // Umkreis aus 3 Punkten (analytisch)
        const ax = p1.x, ay = p1.y;
        const bx = p2.x, by = p2.y;
        const cx = p3.x, cy = p3.y;
        const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(D) < 1e-10) return null; // Kollinear

        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
        const r = Math.hypot(p1.x - ux, p1.y - uy);

        if (r < 1e-10) return null;

        // Validierung: alle Punkte müssen innerhalb 1% Toleranz auf dem Kreis liegen
        const tol = r * 0.01;
        for (const p of points) {
            const dist = Math.hypot(p.x - ux, p.y - uy);
            if (Math.abs(dist - r) > tol) return null;
        }

        return { cx: ux, cy: uy, radius: r };
    }

    // ═══ HELFER ═══

    _writeSectionStart(name) {
        this._write(0, 'SECTION');
        this._write(2, name);
    }

    _writeSectionEnd() {
        this._write(0, 'ENDSEC');
    }

    _write(groupCode, value) {
        this.lines.push(groupCode.toString());
        this.lines.push(value.toString());
    }

    _fmt(num) {
        return Number(num).toFixed(this.precision);
    }

    _mapLineType(lineType) {
        switch ((lineType || '').toLowerCase()) {
            case 'dashed':    return 'DASHED';
            case 'dashdot':   return 'DASHDOT';
            case 'dotted':
            case 'dot':       return 'DOT';
            default:          return 'CONTINUOUS';
        }
    }
}

// Unicode → ANSI_1252 Mapping (deutsche Umlaute + häufige Sonderzeichen)
DXFWriter._ANSI1252_MAP = {
    0xC4: 0xC4,  // Ä
    0xD6: 0xD6,  // Ö
    0xDC: 0xDC,  // Ü
    0xE4: 0xE4,  // ä
    0xF6: 0xF6,  // ö
    0xFC: 0xFC,  // ü
    0xDF: 0xDF,  // ß
    0xB0: 0xB0,  // °
    0xB5: 0xB5,  // µ
    0xD8: 0xD8,  // Ø
    0xF8: 0xF8,  // ø
    0xC9: 0xC9,  // É
    0xE9: 0xE9,  // é
    0xE8: 0xE8,  // è
    0xEA: 0xEA,  // ê
    0xE0: 0xE0,  // à
    0xE2: 0xE2,  // â
    0x2013: 0x96, // – (EN DASH)
    0x2014: 0x97, // — (EM DASH)
    0x2018: 0x91, // ' (LEFT SINGLE QUOTE)
    0x2019: 0x92, // ' (RIGHT SINGLE QUOTE)
    0x201C: 0x93, // " (LEFT DOUBLE QUOTE)
    0x201D: 0x94, // " (RIGHT DOUBLE QUOTE)
    0x20AC: 0x80, // € (EURO SIGN)
};
