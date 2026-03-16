/**
 * CNCReader V1.2 — Importiert CNC/MPF-Dateien als geometrische Entities
 * IGEMS Kap. 9.2 "NC reader" equivalent
 *
 * Unterstützt: G00/G01 (Linien), G02/G03 (Bögen)
 * Dialekte: Sinumerik 840D MPF + generisches G-Code
 * Output: Array von {type, points, isClosed, isRapid} → addDrawnEntities()
 *
 * V1.2 — Fix B: G41/G42/G40 Lead-Tracking
 *   PROBLEM: Sinumerik CNC-Dateien enthalten Lead-in (G41/G42) und Lead-out (G40)
 *   Bewegungen als Teil der Werkzeugbahn. Diese verschieben Start-/Endpunkt
 *   der Geometrie um den Kerf-Radius (~0.4mm), sodass die Kontur als offen
 *   erkannt wurde (closingDist > tolerance×10).
 *
 *   LÖSUNG: Entity-basiertes Chaining mit Lead-Metadaten:
 *   1. G41/G42 → Entity wird als isLeadIn markiert
 *   2. G40     → Entity wird als isLeadOut markiert
 *   3. Schließ-Check zwischen END des Lead-in und START des Lead-out
 *      mit CLOSE_TOL = 1.0mm (toleriert Kerf-Versatz ~0.4mm)
 *   4. Bei geschlossener Kontur: Lead-Punkte werden aus der Punktkette entfernt
 *
 *   ERGEBNIS (SCHWEDEN.CNC):
 *   - Kontur 1 (Kreis):      closingDist=0.40mm → isClosed=true → disc ✅
 *   - Kontur 2 (Silhouette): closingDist=0.40mm → isClosed=true → disc ✅
 *
 * BEKANNTE EINSCHRÄNKUNGEN:
 * - Keine Subroutinen-Auflösung (L201/L205/L206)
 * - Kein FRAME/TRANS/ROT Support
 * - R-Parameter >= 500 werden als Sinumerik-Maschinenparameter ignoriert
 */
class CNCReader {
    constructor() {
        this.version = 'V1.2';
        console.log(`[CNCReader ${this.version}] Initialisiert`);
    }

    /**
     * Parst eine CNC/MPF-Datei und gibt Entities zurück
     * @param {string} content - Dateiinhalt
     * @param {Object} options - { zeroPoint: {x,y}, showRapid: boolean, tolerance: number }
     * @returns {{ entities: Array, stats: Object, warnings: Array }}
     */
    parse(content, options = {}) {
        console.log(`[CNCReader ${this.version}] parse() gestartet`);
        console.time('[CNCReader] Parsing');

        const {
            zeroPoint  = { x: 0, y: 0 },
            showRapid  = false,
            tolerance  = 0.01
        } = options;

        const lines    = content.split(/\r?\n/);
        const rawCuts  = []; // Roh-Entities vor dem Join
        const warnings = [];

        // ── State Machine ──
        let posX = 0, posY = 0;   // aktuelle Maschinenposition (ohne zeroPoint)
        let mode = 0;              // 0=Rapid G00, 1=Linear G01, 2=CW G02, 3=CCW G03
        let absMode     = true;    // G90 absolut (default)
        let kerfActive  = false;   // V1.2: true zwischen G41/G42 und G40
        let lineNum     = 0;
        const stats  = { inputLines: 0, moves: 0, arcs: 0, rapids: 0, skipped: 0 };

        for (const rawLine of lines) {
            lineNum++;
            // Kommentare entfernen: (…) Klammerkommentare und ; Zeilenkommentare
            const line = rawLine
                .replace(/\(.*?\)/g, '')
                .replace(/;.*$/, '')
                .trim()
                .toUpperCase();
            if (!line) continue;
            stats.inputLines++;

            // G-Codes dieser Zeile sammeln
            const gCodes = [];
            for (const m of line.matchAll(/G(\d+)/g)) gCodes.push(parseInt(m[1]));

            // Koordinaten-Token extrahieren
            const xMatch = line.match(/X([+-]?[\d.]+)/);
            const yMatch = line.match(/Y([+-]?[\d.]+)/);
            const iMatch = line.match(/I([+-]?[\d.]+)/);
            const jMatch = line.match(/J([+-]?[\d.]+)/);

            // R-Wert: nur wenn < 500 (sonst Sinumerik R-Parameter!)
            let rVal = null;
            const rMatch = line.match(/(?<![A-Z])R([+-]?[\d.]+)/);
            if (rMatch) {
                const rv = parseFloat(rMatch[1]);
                if (rv < 500) rVal = rv;
            }

            // V1.2: Kerf-Kompensation erkennen (VOR Moduswechsel)
            // G41/G42 = Lead-in (Kerf Links/Rechts einschalten)
            // G40     = Lead-out (Kerf ausschalten)
            const isLeadIn  = gCodes.includes(41) || gCodes.includes(42);
            const isLeadOut = gCodes.includes(40);
            if (isLeadIn) {
                kerfActive = true;
                console.log(`[CNCReader V1.2] L${lineNum}: Lead-in erkannt (G${gCodes.includes(41)?'41':'42'})`);
            }
            if (isLeadOut) {
                kerfActive = false;
                console.log(`[CNCReader V1.2] L${lineNum}: Lead-out erkannt (G40)`);
            }

            // Moduswechsel verarbeiten
            if (gCodes.includes(90)) absMode = true;
            if (gCodes.includes(91)) absMode = false;
            for (const g of gCodes) {
                if (g === 0) mode = 0;
                else if (g === 1) mode = 1;
                else if (g === 2) mode = 2;
                else if (g === 3) mode = 3;
            }

            // Keine Koordinaten → nächste Zeile
            if (!xMatch && !yMatch) continue;

            // Zielposition berechnen
            let toX, toY;
            if (absMode) {
                toX = xMatch ? parseFloat(xMatch[1]) : posX;
                toY = yMatch ? parseFloat(yMatch[1]) : posY;
            } else {
                toX = posX + (xMatch ? parseFloat(xMatch[1]) : 0);
                toY = posY + (yMatch ? parseFloat(yMatch[1]) : 0);
            }

            // Nullbewegungen überspringen
            if (Math.abs(toX - posX) < 1e-8 && Math.abs(toY - posY) < 1e-8) {
                posX = toX; posY = toY;
                continue;
            }

            // Weltkoordinaten (mit Nullpunkt-Offset)
            const fromWX = posX + zeroPoint.x;
            const fromWY = posY + zeroPoint.y;
            const toWX   = toX  + zeroPoint.x;
            const toWY   = toY  + zeroPoint.y;

            if (mode === 0) {
                // ── Rapid ──
                if (showRapid) {
                    rawCuts.push({
                        type: 'LINE',
                        points: [{ x: fromWX, y: fromWY }, { x: toWX, y: toWY }],
                        isClosed: false,
                        isRapid:  true,
                        isLeadIn:  false,
                        isLeadOut: false,
                        layer: 'CNC_RAPID'
                    });
                }
                stats.rapids++;

            } else if (mode === 1) {
                // ── Linearschnitt ──
                rawCuts.push({
                    type: 'LINE',
                    points: [{ x: fromWX, y: fromWY }, { x: toWX, y: toWY }],
                    isClosed: false,
                    isRapid:   false,
                    isLeadIn,   // V1.2
                    isLeadOut,  // V1.2
                    layer: 'CNC_CUT'
                });
                stats.moves++;

            } else if (mode === 2 || mode === 3) {
                // ── Bogenschnitt ──
                const arcEnt = this._parseArc(
                    { x: fromWX, y: fromWY },
                    { x: toWX,   y: toWY   },
                    iMatch ? parseFloat(iMatch[1]) : null,
                    jMatch ? parseFloat(jMatch[1]) : null,
                    rVal,
                    mode === 2 ? 'CW' : 'CCW',
                    warnings,
                    lineNum
                );
                if (arcEnt) {
                    arcEnt.layer    = 'CNC_CUT';
                    arcEnt.isLeadIn  = isLeadIn;   // V1.2
                    arcEnt.isLeadOut = isLeadOut;   // V1.2
                    rawCuts.push(arcEnt);
                    stats.arcs++;
                } else {
                    stats.skipped++;
                }
            }

            posX = toX;
            posY = toY;
        }

        console.timeEnd('[CNCReader] Parsing');

        // ── Entities zu Konturen zusammenfügen ──
        const entities = this._joinEntities(rawCuts, tolerance, showRapid);

        const finalStats = {
            ...stats,
            rawEntities:  rawCuts.length,
            totalContours: entities.length
        };
        console.log(`[CNCReader ${this.version}] Ergebnis:`, finalStats);
        if (warnings.length) console.warn('[CNCReader] Warnungen:', warnings);

        return { entities, stats: finalStats, warnings };
    }

    // ──────────────────────────────────────────────────────────
    //  ARC PARSING
    // ──────────────────────────────────────────────────────────

    /**
     * Erstellt ein Bogen-Entity aus G02/G03-Parametern.
     * Unterstützt I/J (Mittelpunkt-Offset) und R (Radius).
     */
    _parseArc(from, to, I, J, R, direction, warnings, lineNum) {
        let cx, cy, radius;

        if (I !== null || J !== null) {
            // I/J: Mittelpunkt relativ zum Startpunkt
            cx = from.x + (I ?? 0);
            cy = from.y + (J ?? 0);
            radius = Math.hypot(cx - from.x, cy - from.y);
            if (radius < 1e-8) {
                warnings.push(`L${lineNum}: Bogen-Radius ≈ 0 (I/J), übersprungen`);
                return null;
            }
        } else if (R !== null) {
            // R: Radius-Bogen (SVG-kompatible Berechnung)
            const dx   = to.x - from.x;
            const dy   = to.y - from.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1e-8) {
                warnings.push(`L${lineNum}: Nulllängen-Bogen (R), übersprungen`);
                return null;
            }
            const absR = Math.abs(R);
            if (absR < dist / 2 - 1e-6) {
                warnings.push(`L${lineNum}: R=${R} zu klein (chord/2=${(dist/2).toFixed(3)}), geklammert`);
            }
            radius = Math.max(absR, dist / 2);
            const h  = Math.sqrt(Math.max(0, radius * radius - (dist / 2) ** 2));
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            // Normalvektor (senkrecht zur Sehne)
            const nx = -dy / dist;
            const ny =  dx / dist;
            // R > 0 → kleiner Bogen, R < 0 → großer Bogen
            const sign = (R > 0)
                ? (direction === 'CW' ? -1 : 1)
                : (direction === 'CW' ?  1 : -1);
            cx = mx + sign * h * nx;
            cy = my + sign * h * ny;
        } else {
            warnings.push(`L${lineNum}: Bogen ohne I/J/R, übersprungen`);
            return null;
        }

        // Winkel
        const startAngle = Math.atan2(from.y - cy, from.x - cx);
        const endAngle   = Math.atan2(to.y   - cy, to.x   - cx);

        // Tessellierung
        const points = this._tessellateArc(cx, cy, radius, startAngle, endAngle, direction === 'CW');
        if (points.length < 2) {
            warnings.push(`L${lineNum}: Tessellierung leer`);
            return null;
        }

        // KRITISCH: Exakte G-Code-Koordinaten als Start-/Endpunkt setzen.
        // Die trigonometrische Neuberechnung (cx + r·cos(atan2(...))) weicht bei
        // großen Radien um bis zu ±0.01mm ab → Chain-Bruch in _joinEntities.
        // Mit diesem Override sind aufeinanderfolgende Arcs immer exakt verbunden.
        points[0] = { x: from.x, y: from.y };
        points[points.length - 1] = { x: to.x, y: to.y };

        return {
            type: 'POLYLINE',
            points,
            isClosed: false,
            isRapid:  false,
            isArc:    true,
            arcCenter: { x: cx, y: cy },
            arcRadius: radius
        };
    }

    /**
     * Tesselliert einen Kreisbogen in Polylinie-Punkte.
     * Max. Winkelschritt: 5° (ausreichend für CNC-Zwecke)
     */
    _tessellateArc(cx, cy, radius, startAngle, endAngle, clockwise) {
        const MAX_STEP = Math.PI / 36; // 5° pro Schritt
        let deltaAngle;

        if (clockwise) {
            deltaAngle = startAngle - endAngle;
            if (deltaAngle <= 0) deltaAngle += Math.PI * 2;
        } else {
            deltaAngle = endAngle - startAngle;
            if (deltaAngle <= 0) deltaAngle += Math.PI * 2;
        }

        const steps = Math.max(3, Math.ceil(Math.abs(deltaAngle) / MAX_STEP));
        const sign  = clockwise ? -1 : 1;
        const points = [];

        for (let i = 0; i <= steps; i++) {
            const angle = startAngle + sign * (deltaAngle * i / steps);
            points.push({
                x: cx + radius * Math.cos(angle),
                y: cy + radius * Math.sin(angle)
            });
        }
        return points;
    }

    // ──────────────────────────────────────────────────────────
    //  ENTITY JOINING (aufeinanderfolgende Moves → Konturen)
    // ──────────────────────────────────────────────────────────

    /**
     * V1.2: Entity-basiertes Chaining mit Lead-In/Out-Erkennung.
     *
     * Verbindet aufeinanderfolgende Entities zu geschlossenen/offenen Konturen.
     * Rapid-Moves werden nicht überbrückt — erzeugen immer neue Kontur.
     *
     * NEU V1.2: Entity-Indices werden mitgeführt, sodass isLeadIn/isLeadOut-Flags
     * erhalten bleiben. Nach dem Chaining:
     *   - Schließ-Check zwischen END des Lead-in und START des Lead-out
     *     mit CLOSE_TOL = 1.0mm (toleriert Kerf-Versatz ~0.4mm)
     *   - Bei geschlossener Kontur: Lead-Punkte werden aus der Kette entfernt
     *
     * @param {Array} entities - rawCuts aus parse()
     * @param {number} tolerance - Punkt-Verkettungstoleranz (default 0.01mm)
     * @param {boolean} includeRapid - Rapid-Entities einschließen
     */
    _joinEntities(entities, tolerance, includeRapid) {
        console.log(`[CNCReader] _joinEntities(): ${entities.length} Roh-Entities, tol=${tolerance}`);
        console.time('[CNCReader] joinEntities');

        // V1.2: Großzügige Schließtoleranz für Kerf-kompensierten G-Code.
        // Zwischen Lead-in-Ende und Lead-out-Start beträgt der typische
        // Versatz ~Kerf-Radius (0.3–0.5mm) → 1.0mm deckt alle Standard-Konfigurationen.
        const CLOSE_TOL = 1.0;

        if (entities.length === 0) return [];

        const result = [];
        const used   = new Set();

        for (let i = 0; i < entities.length; i++) {
            if (used.has(i)) continue;
            used.add(i);

            // V1.2: Entity-Kette als Index-Array aufbauen (nicht nur Punkte)
            // → Lead-Flags der ersten/letzten Entity bleiben erhalten
            const entityChain = [i];
            const isRapid     = entities[i].isRapid;
            let lastPt        = entities[i].points[entities[i].points.length - 1];
            let extended      = true;

            // Rapid-Moves immer einzeln lassen (kein Join über Rapid-Grenze)
            if (!isRapid) {
                while (extended) {
                    extended = false;
                    for (let j = i + 1; j < entities.length; j++) {
                        if (used.has(j)) continue;
                        if (entities[j].isRapid) continue; // Rapid-Grenze = Konturbruch
                        const startPt = entities[j].points[0];
                        const dist = Math.hypot(lastPt.x - startPt.x, lastPt.y - startPt.y);
                        if (dist <= tolerance) {
                            entityChain.push(j);
                            lastPt = entities[j].points[entities[j].points.length - 1];
                            used.add(j);
                            extended = true;
                            break;
                        }
                    }
                }
            }

            // ── Punktkette aus Entity-Kette aufbauen ──
            const chain = [...entities[entityChain[0]].points];
            for (let k = 1; k < entityChain.length; k++) {
                chain.push(...entities[entityChain[k]].points.slice(1));
            }

            // ── V1.2: Lead-aware Schließ-Check ──
            const firstEnt = entities[entityChain[0]];
            const lastEnt  = entities[entityChain[entityChain.length - 1]];

            let isClosed = false;

            if (!isRapid) {
                if (firstEnt.isLeadIn && lastEnt.isLeadOut) {
                    // Lead-Modus: Schließ-Check zwischen Geometrie-Grenzen
                    // closureStart = Ende des Lead-in (= erster Geometrie-Punkt)
                    const closureStart = firstEnt.points[firstEnt.points.length - 1];
                    // closureEnd = Anfang des Lead-out (= letzter Geometrie-Punkt)
                    const closureEnd   = lastEnt.points[0];
                    const closingDist  = Math.hypot(
                        closureEnd.x - closureStart.x,
                        closureEnd.y - closureStart.y
                    );
                    isClosed = closingDist <= CLOSE_TOL;
                    console.log(
                        `[CNCReader V1.2] Lead-Schließ-Check: ${closingDist.toFixed(3)}mm ` +
                        `(CLOSE_TOL=${CLOSE_TOL}mm) → ${isClosed ? 'GESCHLOSSEN' : 'OFFEN'}`
                    );
                } else {
                    // Kein Lead: klassischer Schließ-Check
                    const firstPt = chain[0];
                    const lastPt2 = chain[chain.length - 1];
                    isClosed = Math.hypot(lastPt2.x - firstPt.x, lastPt2.y - firstPt.y) <= tolerance * 10;
                }
            }

            // ── V1.2: Lead-Punkte bei geschlossener Kontur entfernen ──
            let finalPoints;
            if (isClosed && firstEnt.isLeadIn && lastEnt.isLeadOut) {
                // Punkte des Lead-in (außer dem letzten = erster Geometriepunkt)
                const leadInPtCount  = firstEnt.points.length - 1;
                // Punkte des Lead-out (außer dem ersten = letzter Geometriepunkt)
                const leadOutPtCount = lastEnt.points.length - 1;
                // Geometrische Punkte: ohne Lead-in-Führung und ohne Lead-out-Führung
                const geoStart = leadInPtCount;
                const geoEnd   = chain.length - leadOutPtCount; // exklusiv
                finalPoints = chain.slice(geoStart, geoEnd);
                console.log(
                    `[CNCReader V1.2] Lead-Trimming: ${chain.length} → ${finalPoints.length} Punkte ` +
                    `(Lead-in: ${leadInPtCount}pt, Lead-out: ${leadOutPtCount}pt entfernt)`
                );
                // Kontur explizit schließen (letzter Punkt = erster Punkt)
                if (finalPoints.length > 0) {
                    finalPoints.push({ x: finalPoints[0].x, y: finalPoints[0].y });
                }
            } else {
                finalPoints = chain;
            }

            result.push({
                type: 'POLYLINE',
                // Bei geschlossenen Konturen: letzter Punkt (= Duplikat des ersten) entfernen
                // → addDrawnEntities() / CamContour erwartet einmalige Punkte ohne Schlusspunkt
                points: isClosed ? finalPoints.slice(0, -1) : finalPoints,
                isClosed,
                isRapid,
                layer: entities[entityChain[0]].layer ?? (isRapid ? 'CNC_RAPID' : 'CNC_CUT')
            });
        }

        console.timeEnd('[CNCReader] joinEntities');
        console.log(`[CNCReader] joinEntities: ${entities.length} → ${result.length} Konturen`);
        return result;
    }

    /**
     * V1.3: Statische Methode — liest Tafeldimensionen aus MPF-Header
     * Sucht nach R611/R612 (Länge/Breite) oder Fallback ;LAENGE / ;BREITE Kommentare
     * @param {string} content - Roher CNC-Dateiinhalt
     * @returns {{ width: number|null, height: number|null, source: string }}
     */
    static extractPlateSize(content) {
        console.log('[CNCReader V1.3] extractPlateSize() gestartet');
        console.time('[CNCReader] extractPlateSize');

        let width  = null;
        let height = null;
        let source = 'nicht erkannt';

        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();

            // Primär: R611=xxx (Länge) und R612=xxx (Breite)
            const r611 = trimmed.match(/^R611\s*=\s*([\d.]+)/);
            if (r611) { width  = parseFloat(r611[1]); }

            const r612 = trimmed.match(/^R612\s*=\s*([\d.]+)/);
            if (r612) { height = parseFloat(r612[1]); }

            // Fallback: ;LAENGE          MM :600.00
            const laenge = trimmed.match(/^;LAENGE\s+MM\s*:([\d.]+)/i);
            if (laenge && width === null) { width  = parseFloat(laenge[1]); }

            const breite = trimmed.match(/^;BREITE\s+MM\s*:([\d.]+)/i);
            if (breite && height === null) { height = parseFloat(breite[1]); }
        }

        if (width !== null && height !== null) {
            source = (width === null || height === null) ? 'Kommentar' : 'R611/R612';
        }

        console.timeEnd('[CNCReader] extractPlateSize');
        console.log(`[CNCReader V1.3] Tafeldimensionen: ${width} × ${height} mm (${source})`);
        return { width, height, source };
    }
}

// Singleton exportieren
window.CNCReader = CNCReader;
console.debug('%c[CNCReader V1.3] geladen — G41/G42/G40 Lead-Tracking + Referenzrahmen aus R611/R612', 'color:#e8a020; font-weight:bold');
