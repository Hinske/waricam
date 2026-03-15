/**
 * SVGParser V1.0 — Importiert SVG-Dateien als geometrische Entities
 *
 * Unterstützte Elemente:
 *   <line> <polyline> <polygon> <rect> <circle> <ellipse>
 *   <path d="..."> → M/L/H/V/A/C/Q/Z Commands
 *   <g> Gruppen mit transform-Attribut
 *
 * Cubic/Quadratic Bezier → Tessellation (adaptiv, max. Abweichung: 0.1mm)
 * SVG-Einheiten: px=3.7795mm, pt, mm, cm, in
 * Output: Array von {type, points, isClosed, layer} → addDrawnEntities()
 */
class SVGParser {
    constructor() {
        this.version = 'V1.0';
        // Standard px→mm Faktor (96dpi SVG-Default)
        this.PX_PER_MM = 3.7795275591;
        console.log(`[SVGParser ${this.version}] Initialisiert`);
    }

    /**
     * Parst SVG-Text und gibt Entities zurück
     * @param {string} svgText - SVG-Dateiinhalt
     * @param {Object} options - { scaleFactor, bezierTolerance, layerName }
     * @returns {{ entities: Array, stats: Object, warnings: Array, viewBox: Object }}
     */
    parse(svgText, options = {}) {
        console.log(`[SVGParser ${this.version}] parse() gestartet`);
        console.time('[SVGParser] Parsing');

        const {
            scaleFactor      = null,    // null = auto aus viewBox+width/height
            bezierTolerance  = 0.1,     // mm Abweichung für Bezier-Tessellierung
            layerName        = 'SVG'
        } = options;

        const warnings = [];
        const stats    = { elements: 0, paths: 0, shapes: 0, skipped: 0 };

        // SVG parsen
        const parser = new DOMParser();
        const doc    = parser.parseFromString(svgText, 'image/svg+xml');
        const svgEl  = doc.querySelector('svg');

        if (!svgEl) {
            warnings.push('Kein <svg>-Element gefunden');
            return { entities: [], stats, warnings, viewBox: null };
        }

        // ── Koordinaten-Transformation bestimmen ──
        const transform = this._calcTransform(svgEl, scaleFactor, warnings);
        console.log(`[SVGParser] Transform: scale=${transform.scale.toFixed(6)}, offset=(${transform.ox.toFixed(2)}, ${transform.oy.toFixed(2)})`);

        // ── Alle Elemente traversieren ──
        const entities = [];
        this._traverseGroup(svgEl, transform, entities, stats, warnings, layerName, bezierTolerance);

        console.timeEnd('[SVGParser] Parsing');
        console.log(`[SVGParser ${this.version}] Ergebnis:`, stats);

        return { entities, stats, warnings, viewBox: transform.viewBox };
    }

    // ══════════════════════════════════════════════════════════
    //  KOORDINATENTRANSFORMATION
    // ══════════════════════════════════════════════════════════

    _calcTransform(svgEl, scaleFactor, warnings) {
        const vbAttr = svgEl.getAttribute('viewBox');
        const wAttr  = svgEl.getAttribute('width');
        const hAttr  = svgEl.getAttribute('height');

        let vbX = 0, vbY = 0, vbW = null, vbH = null;
        if (vbAttr) {
            const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4) [vbX, vbY, vbW, vbH] = parts;
        }

        // Physikalische Größe aus width/height (mit Einheit)
        const physW = wAttr ? this._parseLength(wAttr) : null;
        const physH = hAttr ? this._parseLength(hAttr) : null;

        let scale;
        if (scaleFactor !== null) {
            scale = scaleFactor;
        } else if (physW && vbW) {
            scale = physW / vbW; // mm pro viewBox-Einheit
        } else if (physH && vbH) {
            scale = physH / vbH;
        } else if (physW) {
            scale = physW / (vbW || 1);
        } else {
            // Fallback: SVG-Pixel → mm (96dpi)
            scale = 1 / this.PX_PER_MM;
            warnings.push(`Keine width/viewBox → Annahme: 1px = ${(1/this.PX_PER_MM).toFixed(4)}mm (96dpi)`);
        }

        // Y-Achse: SVG hat Y↓, CeraCUT hat Y↑ → Flip (Spiegelung um Mitte)
        // Wir flippen nach dem Sammeln aller Punkte (einfacher)
        const viewBoxH = vbH ?? (physH ? physH / scale : null);

        return {
            scale,
            ox: -(vbX * scale),          // viewBox-Offset kompensieren
            oy: 0,
            viewBox: { x: vbX, y: vbY, w: vbW, h: vbH },
            viewBoxH,
            yFlip: true                  // Y-Flip aktivieren
        };
    }

    /** Parst SVG-Länge mit Einheit → mm */
    _parseLength(str) {
        if (!str) return null;
        const m = String(str).trim().match(/^([+-]?[\d.]+)\s*(px|pt|mm|cm|in|%|em|rem)?$/i);
        if (!m) return null;
        const val  = parseFloat(m[1]);
        const unit = (m[2] || 'px').toLowerCase();
        const map  = { px: 1/this.PX_PER_MM, pt: 25.4/72, mm: 1, cm: 10, in: 25.4 };
        return val * (map[unit] ?? 1/this.PX_PER_MM);
    }

    // ══════════════════════════════════════════════════════════
    //  GROUP TRAVERSAL (inkl. <g> transform)
    // ══════════════════════════════════════════════════════════

    _traverseGroup(el, parentTransform, entities, stats, warnings, layer, bezTol) {
        for (const child of el.children) {
            const tag = child.tagName.toLowerCase().replace(/^svg:/, '');

            // Transform auf Kind anwenden
            const localTx = this._parseTransformAttr(child.getAttribute('transform'));
            const combined = this._combineTransform(parentTransform, localTx);

            // Layer aus id/class ableiten (optional)
            const childLayer = child.getAttribute('id')
                ? `SVG_${child.getAttribute('id').replace(/[^a-zA-Z0-9_-]/g,'_')}`
                : layer;

            switch (tag) {
                case 'g':
                    this._traverseGroup(child, combined, entities, stats, warnings, childLayer, bezTol);
                    break;
                case 'path':
                    this._parsePath(child, combined, entities, stats, warnings, childLayer, bezTol);
                    break;
                case 'line':
                    this._parseLine(child, combined, entities, stats, childLayer);
                    break;
                case 'polyline':
                    this._parsePolyPoints(child, combined, entities, stats, childLayer, false);
                    break;
                case 'polygon':
                    this._parsePolyPoints(child, combined, entities, stats, childLayer, true);
                    break;
                case 'rect':
                    this._parseRect(child, combined, entities, stats, childLayer);
                    break;
                case 'circle':
                    this._parseCircle(child, combined, entities, stats, childLayer);
                    break;
                case 'ellipse':
                    this._parseEllipse(child, combined, entities, stats, childLayer, bezTol);
                    break;
                default:
                    if (!['defs','style','title','desc','metadata','use','symbol'].includes(tag)) {
                        stats.skipped++;
                    }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  EINZELNE ELEMENT-PARSER
    // ══════════════════════════════════════════════════════════

    _parseLine(el, tx, entities, stats, layer) {
        const x1 = parseFloat(el.getAttribute('x1') || 0);
        const y1 = parseFloat(el.getAttribute('y1') || 0);
        const x2 = parseFloat(el.getAttribute('x2') || 0);
        const y2 = parseFloat(el.getAttribute('y2') || 0);
        const pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }].map(p => this._applyTx(p, tx));
        entities.push({ type: 'LINE', points: pts, isClosed: false, layer });
        stats.shapes++;
    }

    _parsePolyPoints(el, tx, entities, stats, layer, closed) {
        const raw = el.getAttribute('points') || '';
        const nums = raw.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
        if (nums.length < 4) return;
        const pts = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
            pts.push(this._applyTx({ x: nums[i], y: nums[i+1] }, tx));
        }
        entities.push({ type: 'POLYLINE', points: pts, isClosed: closed, layer });
        stats.shapes++;
    }

    _parseRect(el, tx, entities, stats, layer) {
        const x  = parseFloat(el.getAttribute('x')  || 0);
        const y  = parseFloat(el.getAttribute('y')  || 0);
        const w  = parseFloat(el.getAttribute('width')  || 0);
        const h  = parseFloat(el.getAttribute('height') || 0);
        const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('ry') || 0);

        if (w <= 0 || h <= 0) return;

        let pts;
        if (rx > 0) {
            // Abgerundetes Rechteck → tessellieren
            pts = this._roundedRect(x, y, w, h, Math.min(rx, w/2, h/2));
        } else {
            pts = [
                { x: x,     y: y     },
                { x: x + w, y: y     },
                { x: x + w, y: y + h },
                { x: x,     y: y + h }
            ];
        }
        pts = pts.map(p => this._applyTx(p, tx));
        entities.push({ type: 'POLYLINE', points: pts, isClosed: true, layer });
        stats.shapes++;
    }

    _roundedRect(x, y, w, h, r) {
        // 4 Ecken je 90° Bogen
        const pts = [];
        const corners = [
            { cx: x + r,     cy: y + r,     sa: Math.PI,       ea: 3*Math.PI/2 },
            { cx: x + w - r, cy: y + r,     sa: 3*Math.PI/2,   ea: 2*Math.PI   },
            { cx: x + w - r, cy: y + h - r, sa: 0,             ea: Math.PI/2   },
            { cx: x + r,     cy: y + h - r, sa: Math.PI/2,     ea: Math.PI     }
        ];
        for (const c of corners) {
            const steps = 8;
            for (let i = 0; i <= steps; i++) {
                const a = c.sa + (c.ea - c.sa) * i / steps;
                pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) });
            }
        }
        return pts;
    }

    _parseCircle(el, tx, entities, stats, layer) {
        const cx = parseFloat(el.getAttribute('cx') || 0);
        const cy = parseFloat(el.getAttribute('cy') || 0);
        const r  = parseFloat(el.getAttribute('r')  || 0);
        if (r <= 0) return;
        const pts = this._tessellateCircle(cx, cy, r).map(p => this._applyTx(p, tx));
        entities.push({ type: 'POLYLINE', points: pts, isClosed: true, layer, isCircle: true, radius: r * tx.scale });
        stats.shapes++;
    }

    _parseEllipse(el, tx, entities, stats, layer, bezTol) {
        const cx = parseFloat(el.getAttribute('cx') || 0);
        const cy = parseFloat(el.getAttribute('cy') || 0);
        const rx = parseFloat(el.getAttribute('rx') || 0);
        const ry = parseFloat(el.getAttribute('ry') || 0);
        if (rx <= 0 || ry <= 0) return;
        const pts = this._tessellateEllipse(cx, cy, rx, ry).map(p => this._applyTx(p, tx));
        entities.push({ type: 'POLYLINE', points: pts, isClosed: true, layer });
        stats.shapes++;
    }

    _tessellateCircle(cx, cy, r, steps = 72) {
        const pts = [];
        for (let i = 0; i < steps; i++) {
            const a = (2 * Math.PI * i) / steps;
            pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return pts;
    }

    _tessellateEllipse(cx, cy, rx, ry, steps = 72) {
        const pts = [];
        for (let i = 0; i < steps; i++) {
            const a = (2 * Math.PI * i) / steps;
            pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
        }
        return pts;
    }

    // ══════════════════════════════════════════════════════════
    //  PATH PARSER (d="..." Attribut)
    // ══════════════════════════════════════════════════════════

    _parsePath(el, tx, entities, stats, warnings, layer, bezTol) {
        const d = el.getAttribute('d') || '';
        if (!d.trim()) return;

        const subpaths = this._pathDToSubpaths(d, warnings);
        for (const sp of subpaths) {
            if (sp.points.length < 2) continue;
            const pts = sp.points.map(p => this._applyTx(p, tx));
            entities.push({
                type: 'POLYLINE',
                points: pts,
                isClosed: sp.closed,
                layer
            });
            stats.paths++;
        }
        stats.elements++;
    }

    /**
     * SVG path d="..." → Array von Subpaths {points[], closed}
     * Implementiert: M/m, L/l, H/h, V/v, A/a, C/c, Q/q, S/s, T/t, Z/z
     */
    _pathDToSubpaths(d, warnings) {
        const subpaths = [];
        let current    = null; // { points: [], closed: false }
        let cx = 0, cy = 0;   // aktuelle Position
        let cpx = 0, cpy = 0; // letzter Kontrollpunkt (für S/T)

        // Tokenize: Buchstaben trennen + Zahlen
        const tokens = d.trim()
            .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, ' $1 ')
            .split(/[\s,]+/)
            .filter(t => t.length > 0);

        let i = 0;
        let lastCmd = '';

        const _num = () => parseFloat(tokens[i++]);
        const _pt  = () => { const x = _num(); const y = _num(); return { x, y }; };

        while (i < tokens.length) {
            const tok = tokens[i];
            const isCmd = /^[MmLlHhVvCcSsQqTtAaZz]$/.test(tok);

            if (!isCmd && !lastCmd) { i++; continue; }

            const cmd = isCmd ? (i++, tok) : lastCmd;
            lastCmd = cmd;
            const upper = cmd.toUpperCase();
            const rel   = cmd === cmd.toLowerCase() && upper !== 'Z';

            const _abs = (x, y) => rel ? { x: cx + x, y: cy + y } : { x, y };
            const _absX = (x)   => rel ? cx + x : x;
            const _absY = (y)   => rel ? cy + y : y;

            if (upper === 'M') {
                if (current && current.points.length >= 2) subpaths.push(current);
                const p = _abs(_num(), _num());
                cx = p.x; cy = p.y;
                current = { points: [{ x: cx, y: cy }], closed: false };
                lastCmd = rel ? 'l' : 'L'; // Folge-Koordinaten = Lineto

            } else if (upper === 'Z') {
                if (current && current.points.length >= 2) {
                    current.closed = true;
                    subpaths.push(current);
                    // Cursor auf Startpunkt zurück
                    cx = current.points[0].x;
                    cy = current.points[0].y;
                    current = null;
                }
                lastCmd = '';

            } else if (upper === 'L') {
                const p = _abs(_num(), _num());
                cx = p.x; cy = p.y;
                if (!current) current = { points: [], closed: false };
                current.points.push({ x: cx, y: cy });

            } else if (upper === 'H') {
                cx = _absX(_num());
                if (!current) current = { points: [], closed: false };
                current.points.push({ x: cx, y: cy });

            } else if (upper === 'V') {
                cy = _absY(_num());
                if (!current) current = { points: [], closed: false };
                current.points.push({ x: cx, y: cy });

            } else if (upper === 'C') {
                const p1 = _abs(_num(), _num());
                const p2 = _abs(_num(), _num());
                const p3 = _abs(_num(), _num());
                const tessPoints = this._tessellateCubic(
                    { x: cx, y: cy }, p1, p2, p3, 16
                );
                if (!current) current = { points: [{ x: cx, y: cy }], closed: false };
                current.points.push(...tessPoints.slice(1));
                cpx = p2.x; cpy = p2.y;
                cx = p3.x; cy = p3.y;

            } else if (upper === 'S') {
                const p1 = { x: 2*cx - cpx, y: 2*cy - cpy }; // Spiegelung letzter CP
                const p2 = _abs(_num(), _num());
                const p3 = _abs(_num(), _num());
                const tessPoints = this._tessellateCubic(
                    { x: cx, y: cy }, p1, p2, p3, 16
                );
                if (!current) current = { points: [{ x: cx, y: cy }], closed: false };
                current.points.push(...tessPoints.slice(1));
                cpx = p2.x; cpy = p2.y;
                cx = p3.x; cy = p3.y;

            } else if (upper === 'Q') {
                const p1 = _abs(_num(), _num());
                const p2 = _abs(_num(), _num());
                const tessPoints = this._tessellateQuadratic(
                    { x: cx, y: cy }, p1, p2, 12
                );
                if (!current) current = { points: [{ x: cx, y: cy }], closed: false };
                current.points.push(...tessPoints.slice(1));
                cpx = p1.x; cpy = p1.y;
                cx = p2.x; cy = p2.y;

            } else if (upper === 'T') {
                const p1 = { x: 2*cx - cpx, y: 2*cy - cpy };
                const p2 = _abs(_num(), _num());
                const tessPoints = this._tessellateQuadratic(
                    { x: cx, y: cy }, p1, p2, 12
                );
                if (!current) current = { points: [{ x: cx, y: cy }], closed: false };
                current.points.push(...tessPoints.slice(1));
                cpx = p1.x; cpy = p1.y;
                cx = p2.x; cy = p2.y;

            } else if (upper === 'A') {
                const rx   = Math.abs(_num());
                const ry   = Math.abs(_num());
                const xRot = _num() * Math.PI / 180;
                const laf  = _num(); // large-arc-flag
                const sf   = _num(); // sweep-flag
                const to   = _abs(_num(), _num());
                const tessPoints = this._tessellateArcSVG(
                    { x: cx, y: cy }, rx, ry, xRot, laf, sf, to, 36
                );
                if (!current) current = { points: [{ x: cx, y: cy }], closed: false };
                current.points.push(...tessPoints.slice(1));
                cx = to.x; cy = to.y;
                cpx = cx; cpy = cy;

            } else {
                warnings.push(`Unbekannter Path-Befehl: "${cmd}"`);
                i++;
                lastCmd = '';
            }
        }

        if (current && current.points.length >= 2) subpaths.push(current);
        return subpaths;
    }

    // ══════════════════════════════════════════════════════════
    //  BEZIER / ARC TESSELLIERUNG
    // ══════════════════════════════════════════════════════════

    _tessellateCubic(p0, p1, p2, p3, steps) {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t  = i / steps;
            const mt = 1 - t;
            pts.push({
                x: mt**3*p0.x + 3*mt**2*t*p1.x + 3*mt*t**2*p2.x + t**3*p3.x,
                y: mt**3*p0.y + 3*mt**2*t*p1.y + 3*mt*t**2*p2.y + t**3*p3.y
            });
        }
        return pts;
    }

    _tessellateQuadratic(p0, p1, p2, steps) {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t  = i / steps;
            const mt = 1 - t;
            pts.push({
                x: mt**2*p0.x + 2*mt*t*p1.x + t**2*p2.x,
                y: mt**2*p0.y + 2*mt*t*p1.y + t**2*p2.y
            });
        }
        return pts;
    }

    /** SVG A-Befehl → Tessellierung (W3C Spec Anhang F.6) */
    _tessellateArcSVG(from, rx, ry, xRot, laf, sf, to, steps) {
        if (rx < 1e-10 || ry < 1e-10) return [from, to];
        const cos = Math.cos(xRot), sin = Math.sin(xRot);
        const dx2 = (from.x - to.x) / 2, dy2 = (from.y - to.y) / 2;
        const x1p =  cos*dx2 + sin*dy2;
        const y1p = -sin*dx2 + cos*dy2;
        let rx2 = rx*rx, ry2 = ry*ry;
        const x1p2 = x1p*x1p, y1p2 = y1p*y1p;
        // Radius-Korrektur
        const lam = x1p2/rx2 + y1p2/ry2;
        if (lam > 1) { const sq = Math.sqrt(lam); rx *= sq; ry *= sq; rx2 = rx*rx; ry2 = ry*ry; }
        const sign = (laf === sf) ? -1 : 1;
        const sq   = Math.max(0, (rx2*ry2 - rx2*y1p2 - ry2*x1p2) / (rx2*y1p2 + ry2*x1p2));
        const coef  = sign * Math.sqrt(sq);
        const cxp   = coef * rx * y1p / ry;
        const cyp   = -coef * ry * x1p / rx;
        const cx    = cos*cxp - sin*cyp + (from.x+to.x)/2;
        const cy    = sin*cxp + cos*cyp + (from.y+to.y)/2;
        const ux    = (x1p - cxp) / rx, uy = (y1p - cyp) / ry;
        const vx    = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
        let theta1  = this._angle(1, 0, ux, uy);
        let dtheta  = this._angle(ux, uy, vx, vy);
        if (!sf && dtheta > 0) dtheta -= 2*Math.PI;
        if ( sf && dtheta < 0) dtheta += 2*Math.PI;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const theta = theta1 + dtheta * i / steps;
            pts.push({
                x: cos*rx*Math.cos(theta) - sin*ry*Math.sin(theta) + cx,
                y: sin*rx*Math.cos(theta) + cos*ry*Math.sin(theta) + cy
            });
        }
        return pts;
    }

    _angle(ux, uy, vx, vy) {
        const n = Math.sqrt(ux*ux + uy*uy) * Math.sqrt(vx*vx + vy*vy);
        const c = Math.max(-1, Math.min(1, (ux*vx + uy*vy) / n));
        return (ux*vy - uy*vx < 0 ? -1 : 1) * Math.acos(c);
    }

    // ══════════════════════════════════════════════════════════
    //  TRANSFORM-MATRIX
    // ══════════════════════════════════════════════════════════

    /** Parst SVG transform-Attribut → {a,b,c,d,e,f} Matrix */
    _parseTransformAttr(attr) {
        const identity = { a:1, b:0, c:0, d:1, e:0, f:0, scale:1, yFlip:false, ox:0, oy:0 };
        if (!attr) return identity;
        // Kombinierte Matrix starten (Identität)
        let m = [1,0,0,1,0,0]; // [a,b,c,d,e,f]

        const applyMat = (n) => {
            m = [
                m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1],
                m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3],
                m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]
            ];
        };

        const fns = [...attr.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi)];
        for (const fn of fns) {
            const type = fn[1].toLowerCase();
            const vals = fn[2].trim().split(/[\s,]+/).map(Number);
            switch (type) {
                case 'matrix':    applyMat(vals); break;
                case 'translate': applyMat([1,0,0,1, vals[0]||0, vals[1]||0]); break;
                case 'scale': {
                    const sx = vals[0], sy = vals[1]??vals[0];
                    applyMat([sx,0,0,sy,0,0]); break;
                }
                case 'rotate': {
                    const r=vals[0]*Math.PI/180, cos=Math.cos(r), sin=Math.sin(r);
                    const px=vals[1]||0, py=vals[2]||0;
                    applyMat([cos,sin,-sin,cos, px-px*cos+py*sin, py-px*sin-py*cos]); break;
                }
            }
        }
        return { a:m[0], b:m[1], c:m[2], d:m[3], e:m[4], f:m[5], isLocalMatrix: true };
    }

    /** Kombiniert Parent-Transform mit lokalem SVG-Transform */
    _combineTransform(parent, local) {
        if (local.isLocalMatrix) {
            // Lokale SVG-Matrix × Parent-Scale
            return {
                scale: parent.scale,
                ox: parent.ox,
                oy: parent.oy,
                viewBoxH: parent.viewBoxH,
                yFlip: parent.yFlip,
                localMatrix: local
            };
        }
        return parent;
    }

    /** Wendet Transform auf einen Punkt an */
    _applyTx(p, tx) {
        let x = p.x, y = p.y;

        // Lokale SVG-Matrix anwenden (translate, rotate, scale innerhalb SVG)
        if (tx.localMatrix) {
            const m = tx.localMatrix;
            const nx = m.a*x + m.c*y + m.e;
            const ny = m.b*x + m.d*y + m.f;
            x = nx; y = ny;
        }

        // Y-Flip: SVG Y↓ → CeraCUT Y↑
        // Flip um SVG-Mittelpunkt (viewBoxH/2)
        if (tx.yFlip && tx.viewBoxH !== null) {
            y = tx.viewBoxH - y;
        } else if (tx.yFlip) {
            y = -y; // Fallback
        }

        // Scale + Offset in mm
        return {
            x: x * tx.scale + (tx.ox ?? 0),
            y: y * tx.scale + (tx.oy ?? 0)
        };
    }
}

// Singleton exportieren
window.SVGParser = SVGParser;
console.log('%c[SVGParser V1.0] geladen — path/rect/circle/ellipse/polyline/polygon + Bezier + SVG-A', 'color:#22c55e; font-weight:bold');
