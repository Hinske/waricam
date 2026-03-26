/**
 * CeraCUT DXF Writer V1.6
 * Export von Konturen als AutoCAD DXF R2000 (AC1015) — vollständig konform
 *
 * Unterstützte Entity-Typen:
 * - LINE, POLYLINE/VERTEX/SEQEND, CIRCLE, ARC, SPLINE
 *
 * AC1015-Konformität:
 * - Hex-Handles (Code 5) für alle Table-Entries und Entities
 * - Alle Pflicht-Tables: VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD
 * - *MODEL_SPACE / *PAPER_SPACE Blocks
 * - Root-Dictionary in OBJECTS
 * - $HANDSEED im Header
 *
 * Encoding: ANSI_1252 (Windows Western) — korrekte Umlaute in Layer-Namen
 *
 * V1.6: AC1015 mit Handles, Pflicht-Tables, MODEL_SPACE, Root-Dict (AutoCAD-konform)
 * V1.5: Downgrade AC1015→AC1009 (zu simpel für Splines)
 * V1.4: AC1015 ohne Handles (crashte AutoCAD)
 *
 * Created: 2026-02-15 MEZ
 * Last Modified: 2026-03-26 MEZ
 * Build: 20260326-ac1015fix
 */

class DXFWriter {

    constructor() {
        this.lines = [];
        this.precision = 6;
        this._handleCounter = 1; // Handle-Zähler (hex)
        this._modelSpaceHandle = null;
        this._paperSpaceHandle = null;
    }

    /** Nächsten Handle als Hex-String vergeben */
    _nextHandle() {
        return (this._handleCounter++).toString(16).toUpperCase();
    }

    // ═══ ÖFFENTLICHE API ═══

    generate(contours, layerManager, options = {}) {
        this.lines = [];
        this._handleCounter = 1;

        const stats = { entities: 0, layers: 0, lines: 0, polylines: 0, circles: 0, arcs: 0, splines: 0, images: 0 };

        // Handles für feste Objekte vorab vergeben
        this._modelSpaceHandle = this._nextHandle();  // 1
        this._paperSpaceHandle = this._nextHandle();   // 2

        // ── HEADER ──
        this._writeHeader();

        // ── CLASSES (leer, aber vorhanden) ──
        this._writeSectionStart('CLASSES');
        this._writeSectionEnd();

        // ── TABLES ──
        this._writeSectionStart('TABLES');
        this._writeVportTable();
        this._writeLineTypeTable();
        this._writeLayerTable(layerManager, stats);
        this._writeStyleTable();
        this._writeViewTable();
        this._writeUcsTable();
        this._writeAppIdTable();
        this._writeDimStyleTable();
        this._writeBlockRecordTable();
        this._writeSectionEnd();

        // ── BLOCKS ──
        this._writeBlocks();

        // ── ENTITIES ──
        this._writeSectionStart('ENTITIES');

        for (const contour of contours) {
            if (!contour.points || contour.points.length < 2) continue;
            const layerName = contour.layer || '0';
            if (layerManager && !layerManager.isVisible(layerName)) continue;

            const sourceType = (contour.sourceType || '').toUpperCase();

            if (sourceType === 'CIRCLE' && contour.isClosed) {
                this._writeCircle(contour, stats);
            } else if (sourceType === 'SPLINE' && (contour._fitPoints || contour._splineData)) {
                this._writeSpline(contour, stats);
            } else if (contour.points.length === 2 && !contour.isClosed) {
                this._writeLine(contour.points[0], contour.points[1], layerName, stats);
            } else {
                this._writePolyline(contour, stats);
            }
        }

        if (options.imageUnderlayManager?.underlays?.length > 0) {
            const imgLines = options.imageUnderlayManager.getDXFEntities();
            for (const line of imgLines) this.lines.push(line.trim());
            stats.images = options.imageUnderlayManager.underlays.length;
            stats.entities += stats.images;
        }

        this._writeSectionEnd();

        // ── OBJECTS ──
        this._writeObjects();

        // ── EOF ──
        this._write(0, 'EOF');

        // $HANDSEED nachträglich patchen
        const content = this.lines.join('\r\n')
            .replace('$HANDSEED_PLACEHOLDER', (this._handleCounter + 1).toString(16).toUpperCase());

        return {
            content,
            filename: options.filename || 'export.dxf',
            stats: { ...stats, totalLines: this.lines.length, fileSize: content.length }
        };
    }

    generateDownload(contours, layerManager, options = {}) {
        const result = this.generate(contours, layerManager, options);
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

    _encodeAnsi1252(str) {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 128) {
                bytes[i] = code;
            } else {
                bytes[i] = DXFWriter._ANSI1252_MAP[code] || 0x3F;
            }
        }
        return bytes;
    }

    // ═══ HEADER ═══

    _writeHeader() {
        this._writeSectionStart('HEADER');
        this._write(9, '$ACADVER');
        this._write(1, 'AC1015');
        this._write(9, '$DWGCODEPAGE');
        this._write(3, 'ANSI_1252');
        this._write(9, '$HANDSEED');
        this._write(5, '$HANDSEED_PLACEHOLDER');
        this._write(9, '$INSBASE');
        this._write(10, '0.0'); this._write(20, '0.0'); this._write(30, '0.0');
        this._write(9, '$EXTMIN');
        this._write(10, '0.0'); this._write(20, '0.0'); this._write(30, '0.0');
        this._write(9, '$EXTMAX');
        this._write(10, '1000.0'); this._write(20, '1000.0'); this._write(30, '0.0');
        this._write(9, '$INSUNITS');
        this._write(70, '4');
        this._writeSectionEnd();
    }

    // ═══ TABLES ═══

    _writeEmptyTable(name) {
        this._write(0, 'TABLE');
        this._write(2, name);
        this._write(5, this._nextHandle());
        this._write(100, 'AcDbSymbolTable');
        this._write(70, '0');
        this._write(0, 'ENDTAB');
    }

    _writeVportTable()    { this._writeEmptyTable('VPORT'); }
    _writeStyleTable()    { this._writeEmptyTable('STYLE'); }
    _writeViewTable()     { this._writeEmptyTable('VIEW'); }
    _writeUcsTable()      { this._writeEmptyTable('UCS'); }
    _writeDimStyleTable() { this._writeEmptyTable('DIMSTYLE'); }

    _writeAppIdTable() {
        const tableH = this._nextHandle();
        this._write(0, 'TABLE');
        this._write(2, 'APPID');
        this._write(5, tableH);
        this._write(100, 'AcDbSymbolTable');
        this._write(70, '1');
        // ACAD AppId
        this._write(0, 'APPID');
        this._write(5, this._nextHandle());
        this._write(330, tableH);
        this._write(100, 'AcDbSymbolTableRecord');
        this._write(100, 'AcDbRegAppTableRecord');
        this._write(2, 'ACAD');
        this._write(70, '0');
        this._write(0, 'ENDTAB');
    }

    _writeLineTypeTable() {
        const tableH = this._nextHandle();
        this._write(0, 'TABLE');
        this._write(2, 'LTYPE');
        this._write(5, tableH);
        this._write(100, 'AcDbSymbolTable');
        this._write(70, '4');

        const ltypes = [
            { name: 'CONTINUOUS', desc: 'Solid line', count: 0, len: 0, dashes: [] },
            { name: 'DASHED', desc: 'Dashed __ __ __', count: 2, len: 6, dashes: [4, -2] },
            { name: 'DASHDOT', desc: 'Dash dot __.__.__', count: 4, len: 8, dashes: [4, -1, 0, -1] },
            { name: 'DOT', desc: 'Dot . . . .', count: 2, len: 2, dashes: [0, -2] }
        ];
        for (const lt of ltypes) {
            this._write(0, 'LTYPE');
            this._write(5, this._nextHandle());
            this._write(330, tableH);
            this._write(100, 'AcDbSymbolTableRecord');
            this._write(100, 'AcDbLinetypeTableRecord');
            this._write(2, lt.name);
            this._write(70, '0');
            this._write(3, lt.desc);
            this._write(72, '65');
            this._write(73, lt.count.toString());
            this._write(40, lt.len.toFixed(1));
            for (const d of lt.dashes) this._write(49, d.toFixed(1));
        }
        this._write(0, 'ENDTAB');
    }

    _writeLayerTable(layerManager, stats) {
        const layers = layerManager ? layerManager.getAllLayers() : [{ name: '0', color: '#ffffff', lineType: 'Continuous' }];
        const tableH = this._nextHandle();

        this._write(0, 'TABLE');
        this._write(2, 'LAYER');
        this._write(5, tableH);
        this._write(100, 'AcDbSymbolTable');
        this._write(70, layers.length.toString());

        for (const layer of layers) {
            this._write(0, 'LAYER');
            this._write(5, this._nextHandle());
            this._write(330, tableH);
            this._write(100, 'AcDbSymbolTableRecord');
            this._write(100, 'AcDbLayerTableRecord');
            this._write(2, layer.name);
            this._write(70, layer.locked ? '4' : '0');
            const aci = (typeof hexToACI === 'function') ? hexToACI(layer.color) : 7;
            this._write(62, aci.toString());
            this._write(6, this._mapLineType(layer.lineType));
            stats.layers++;
        }
        this._write(0, 'ENDTAB');
    }

    _writeBlockRecordTable() {
        const tableH = this._nextHandle();
        this._write(0, 'TABLE');
        this._write(2, 'BLOCK_RECORD');
        this._write(5, tableH);
        this._write(100, 'AcDbSymbolTable');
        this._write(70, '2');

        // *MODEL_SPACE
        this._write(0, 'BLOCK_RECORD');
        this._write(5, this._modelSpaceHandle);
        this._write(330, tableH);
        this._write(100, 'AcDbSymbolTableRecord');
        this._write(100, 'AcDbBlockTableRecord');
        this._write(2, '*MODEL_SPACE');

        // *PAPER_SPACE
        this._write(0, 'BLOCK_RECORD');
        this._write(5, this._paperSpaceHandle);
        this._write(330, tableH);
        this._write(100, 'AcDbSymbolTableRecord');
        this._write(100, 'AcDbBlockTableRecord');
        this._write(2, '*PAPER_SPACE');

        this._write(0, 'ENDTAB');
    }

    // ═══ BLOCKS ═══

    _writeBlocks() {
        this._writeSectionStart('BLOCKS');

        for (const name of ['*MODEL_SPACE', '*PAPER_SPACE']) {
            this._write(0, 'BLOCK');
            this._write(5, this._nextHandle());
            this._write(100, 'AcDbEntity');
            this._write(8, '0');
            this._write(100, 'AcDbBlockBegin');
            this._write(2, name);
            this._write(70, '0');
            this._write(10, '0.0'); this._write(20, '0.0'); this._write(30, '0.0');
            this._write(3, name);
            this._write(1, '');
            this._write(0, 'ENDBLK');
            this._write(5, this._nextHandle());
            this._write(100, 'AcDbEntity');
            this._write(8, '0');
            this._write(100, 'AcDbBlockEnd');
        }

        this._writeSectionEnd();
    }

    // ═══ OBJECTS ═══

    _writeObjects() {
        this._writeSectionStart('OBJECTS');
        this._write(0, 'DICTIONARY');
        this._write(5, this._nextHandle());
        this._write(100, 'AcDbDictionary');
        this._writeSectionEnd();
    }

    // ═══ ENTITIES ═══

    /** Entity-Header: Handle + AcDbEntity + Layer */
    _writeEntityHeader(type, layer) {
        this._write(0, type);
        this._write(5, this._nextHandle());
        this._write(330, this._modelSpaceHandle);
        this._write(100, 'AcDbEntity');
        this._write(8, layer || '0');
    }

    _writeLine(p1, p2, layer, stats) {
        this._writeEntityHeader('LINE', layer);
        this._write(100, 'AcDbLine');
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

        this._writeEntityHeader('POLYLINE', layer);
        this._write(100, 'AcDb2dPolyline');
        this._write(66, '1');
        this._write(70, isClosed ? '1' : '0');

        let count = points.length;
        if (isClosed && points.length > 1) {
            const first = points[0], last = points[points.length - 1];
            if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
                count = points.length - 1;
            }
        }
        for (let i = 0; i < count; i++) {
            this._writeEntityHeader('VERTEX', layer);
            this._write(100, 'AcDb2dVertex');
            this._write(10, this._fmt(points[i].x));
            this._write(20, this._fmt(points[i].y));
            this._write(30, '0.0');
            if (points[i].bulge) {
                this._write(42, this._fmt(points[i].bulge));
            }
        }

        this._writeEntityHeader('SEQEND', layer);
        stats.polylines++;
        stats.entities++;
    }

    _writeCircle(contour, stats) {
        const layer = contour.layer || '0';
        let cx, cy, radius;

        if (contour._center && contour._radius) {
            cx = contour._center.x;
            cy = contour._center.y;
            radius = contour._radius;
        } else {
            const fit = this._fitCircle(contour.points);
            if (fit) { cx = fit.cx; cy = fit.cy; radius = fit.radius; }
            else {
                console.warn('[DXF-Writer V1.6] Kreis-Validierung fehlgeschlagen → Polyline');
                this._writePolyline(contour, stats);
                return;
            }
        }

        this._writeEntityHeader('CIRCLE', layer);
        this._write(100, 'AcDbCircle');
        this._write(10, this._fmt(cx));
        this._write(20, this._fmt(cy));
        this._write(30, '0.0');
        this._write(40, this._fmt(radius));
        stats.circles++;
        stats.entities++;
    }

    _writeSpline(contour, stats) {
        const layer = contour.layer || '0';
        const sd = contour._splineData;
        const fp = contour._fitPoints;

        const hasCP = sd && sd.controlPoints && sd.controlPoints.length >= 2;
        const hasFP = (sd && sd.fitPoints && sd.fitPoints.length >= 2) || (fp && fp.length >= 2);

        if (!hasCP && !hasFP) {
            this._writePolyline(contour, stats);
            return;
        }

        const degree = (sd && sd.degree) ? sd.degree : 3;
        const isClosed = contour.isClosed || contour._splineClosed || false;
        let flags = 8; // planar
        if (isClosed) flags |= 1;

        const controlPoints = hasCP ? sd.controlPoints : [];
        const knots = (sd && sd.knots && sd.knots.length > 0) ? sd.knots : [];
        const weights = (sd && sd.weights && sd.weights.length > 0) ? sd.weights : [];
        const fitPoints = hasFP
            ? (sd && sd.fitPoints && sd.fitPoints.length >= 2 ? sd.fitPoints : fp)
            : [];

        this._writeEntityHeader('SPLINE', layer);
        this._write(100, 'AcDbSpline');
        this._write(70, flags.toString());
        this._write(71, degree.toString());
        this._write(72, knots.length.toString());
        this._write(73, controlPoints.length.toString());
        this._write(74, fitPoints.length.toString());

        for (const k of knots) this._write(40, this._fmt(k));
        if (weights.length > 0) {
            for (const w of weights) this._write(41, this._fmt(w));
        }
        for (const cp of controlPoints) {
            this._write(10, this._fmt(cp.x));
            this._write(20, this._fmt(cp.y));
            this._write(30, '0.0');
        }
        for (const f of fitPoints) {
            this._write(11, this._fmt(f.x));
            this._write(21, this._fmt(f.y));
            this._write(31, '0.0');
        }

        stats.splines++;
        stats.entities++;
    }

    // ═══ HELFER ═══

    _fitCircle(points) {
        if (!points || points.length < 3) return null;
        const n = points.length;
        const p1 = points[0], p2 = points[Math.floor(n / 3)], p3 = points[Math.floor(2 * n / 3)];
        const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
        const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(D) < 1e-10) return null;
        const ux = ((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by)) / D;
        const uy = ((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax)) / D;
        const r = Math.hypot(p1.x - ux, p1.y - uy);
        if (r < 1e-10) return null;
        const tol = r * 0.01;
        for (const p of points) {
            if (Math.abs(Math.hypot(p.x - ux, p.y - uy) - r) > tol) return null;
        }
        return { cx: ux, cy: uy, radius: r };
    }

    _writeSectionStart(name) { this._write(0, 'SECTION'); this._write(2, name); }
    _writeSectionEnd() { this._write(0, 'ENDSEC'); }
    _write(gc, val) { this.lines.push(gc.toString()); this.lines.push(val.toString()); }
    _fmt(num) { return Number(num).toFixed(this.precision); }

    _mapLineType(lineType) {
        switch ((lineType || '').toLowerCase()) {
            case 'dashed':  return 'DASHED';
            case 'dashdot': return 'DASHDOT';
            case 'dotted': case 'dot': return 'DOT';
            default: return 'CONTINUOUS';
        }
    }
}

// Unicode → ANSI_1252 Mapping
DXFWriter._ANSI1252_MAP = {
    0xC4: 0xC4, 0xD6: 0xD6, 0xDC: 0xDC,  // Ä Ö Ü
    0xE4: 0xE4, 0xF6: 0xF6, 0xFC: 0xFC,  // ä ö ü
    0xDF: 0xDF, 0xB0: 0xB0, 0xB5: 0xB5,  // ß ° µ
    0xD8: 0xD8, 0xF8: 0xF8,               // Ø ø
    0xC9: 0xC9, 0xE9: 0xE9, 0xE8: 0xE8, 0xEA: 0xEA, 0xE0: 0xE0, 0xE2: 0xE2,
    0x2013: 0x96, 0x2014: 0x97,            // – —
    0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, // '' ""
    0x20AC: 0x80,                           // €
};
