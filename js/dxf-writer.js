/**
 * WARICAM DXF Writer V1.0
 * Export von Konturen als AutoCAD DXF R12 (AC1009)
 * 
 * Unterstützte Entity-Typen:
 * - LINE (Einzelsegmente)
 * - POLYLINE / VERTEX / SEQEND (Polylinien, geschlossen/offen)
 * - CIRCLE (Kreise — wenn sourceType === 'CIRCLE')
 * - ARC (Bögen — wenn sourceType === 'ARC')
 * 
 * Format: AutoCAD R12 (AC1009) — breiteste Kompatibilität
 * 
 * Created: 2026-02-15 MEZ
 * Build: 20260215-2000 MEZ
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

        // ── TABLES Section ──
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
            
            if (sourceType === 'CIRCLE' && contour.isClosed && contour._radius) {
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
     */
    generateDownload(contours, layerManager, options = {}) {
        const result = this.generate(contours, layerManager, options);
        
        const blob = new Blob([result.content], { type: 'application/dxf' });
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

    // ═══ HEADER SECTION ═══

    _writeHeader() {
        this._writeSectionStart('HEADER');
        
        // AutoCAD Version: R12
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
            this._write(70, layer.locked ? '4' : '0');  // 4 = frozen/locked
            this._write(62, hexToACI(layer.color).toString());  // ACI Farbe
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

        // Punkte — bei geschlossenen Polylinien den letzten Punkt weglassen
        // (er ist identisch mit dem ersten, DXF schließt über Flag 70=1)
        const count = isClosed ? points.length - 1 : points.length;
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
        
        // Mittelpunkt berechnen (Centroid der Punkte)
        let cx = 0, cy = 0;
        for (const p of contour.points) { cx += p.x; cy += p.y; }
        cx /= contour.points.length;
        cy /= contour.points.length;

        // Radius (Abstand vom Centroid zum ersten Punkt)
        const radius = contour._radius || Math.hypot(contour.points[0].x - cx, contour.points[0].y - cy);

        this._write(0, 'CIRCLE');
        this._write(8, layer);
        this._write(10, this._fmt(cx));
        this._write(20, this._fmt(cy));
        this._write(30, '0.0');
        this._write(40, this._fmt(radius));

        stats.circles++;
        stats.entities++;
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
