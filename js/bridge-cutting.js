/**
 * CeraCUT Bridge Cutting V1.0 — Micro-Joint / Steg-Modul
 *
 * Verwaltet Bridges (Stege/Micro-Joints) zwischen Teilen und Restmaterial.
 * Bridges halten Teile während des Schneidvorgangs in Position.
 *
 * Funktionen:
 *   - Auto-Platzierung: gleichmäßig verteilt entlang Kontur-Umfang
 *   - Manuelle Platzierung: parametrische Position (0–1) entlang Kontur
 *   - Pfad-Splitting: Konturpfad in Schnitt-/Überspring-Segmente aufteilen
 *   - Visualisierung: Daten für Canvas-Renderer (orange Marker)
 *   - Postprozessor-Support: G-Code-Segmente mit Kopf-Anheben an Bridge-Positionen
 *
 * Speichert Bridges auf contour.bridges = [{position, width, segIndex, param}]
 *
 * Last Modified: 2026-03-09 MEZ
 * Build: 20260309
 */

const BridgeCutting = (() => {
    'use strict';

    const VERSION = 'V1.0';
    const LOG_PREFIX = `[Bridge ${VERSION}]`;

    // ════════════════════════════════════════════════════════════════════════
    //  HILFSFUNKTIONEN
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Berechnet den Gesamtumfang einer Kontur (Summe aller Segment-Längen)
     * @param {Array<{x: number, y: number}>} points
     * @returns {number} Umfang in mm
     */
    function _computePerimeter(points) {
        if (!points || points.length < 2) return 0;
        let len = 0;
        for (let i = 1; i < points.length; i++) {
            len += Math.hypot(
                points[i].x - points[i - 1].x,
                points[i].y - points[i - 1].y
            );
        }
        return len;
    }

    /**
     * Berechnet kumulative Distanzen für jeden Punkt
     * @param {Array<{x: number, y: number}>} points
     * @returns {number[]} Kumulative Distanzen, Index 0 = 0
     */
    function _cumulativeDistances(points) {
        const distances = [0];
        for (let i = 1; i < points.length; i++) {
            distances.push(distances[i - 1] + Math.hypot(
                points[i].x - points[i - 1].x,
                points[i].y - points[i - 1].y
            ));
        }
        return distances;
    }

    /**
     * Findet Segment-Index und Parameter für eine absolute Position (mm) entlang der Kontur
     * @param {number[]} distances - Kumulative Distanzen
     * @param {number} position - Absolute Position in mm
     * @returns {{segIndex: number, param: number}} Segment-Index und Param (0–1 innerhalb Segment)
     */
    function _resolvePosition(distances, position) {
        const totalLength = distances[distances.length - 1];
        if (totalLength < 1e-10) return { segIndex: 0, param: 0 };

        // Position auf [0, totalLength) normieren
        let pos = position % totalLength;
        if (pos < 0) pos += totalLength;

        for (let i = 1; i < distances.length; i++) {
            if (pos <= distances[i] + 1e-10) {
                const segLen = distances[i] - distances[i - 1];
                const param = segLen > 1e-10 ? (pos - distances[i - 1]) / segLen : 0;
                return { segIndex: i - 1, param: Math.max(0, Math.min(1, param)) };
            }
        }

        // Fallback: letztes Segment
        return { segIndex: Math.max(0, distances.length - 2), param: 1.0 };
    }

    /**
     * Interpoliert einen Punkt auf dem Segment zwischen points[segIndex] und points[segIndex+1]
     * @param {Array<{x: number, y: number}>} points
     * @param {number} segIndex
     * @param {number} param - 0–1
     * @returns {{x: number, y: number}}
     */
    function _interpolatePoint(points, segIndex, param) {
        const p0 = points[segIndex];
        const p1 = points[segIndex + 1] || points[segIndex];
        return {
            x: p0.x + (p1.x - p0.x) * param,
            y: p0.y + (p1.y - p0.y) * param
        };
    }

    /**
     * Berechnet den Winkel (Richtung) eines Segments
     * @param {Array<{x: number, y: number}>} points
     * @param {number} segIndex
     * @returns {number} Winkel in Radiant
     */
    function _segmentAngle(points, segIndex) {
        const p0 = points[segIndex];
        const p1 = points[segIndex + 1] || points[segIndex];
        return Math.atan2(p1.y - p0.y, p1.x - p0.x);
    }

    /**
     * Erzeugt eine initiale bridges-Array auf der Kontur falls nicht vorhanden
     * @param {CamContour} contour
     */
    function _ensureBridgesArray(contour) {
        if (!contour.bridges) {
            contour.bridges = [];
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  ÖFFENTLICHE API
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Auto-Platzierung: verteilt Bridges gleichmäßig entlang des Kontur-Umfangs.
     * Bestehende Bridges werden ersetzt.
     *
     * @param {CamContour} contour - Zielkontur
     * @param {number} count - Anzahl Bridges (>= 1)
     * @param {number} width - Bridge-Breite in mm (> 0)
     * @returns {Array<{position: number, width: number, segIndex: number, param: number}>} Erzeugte Bridges
     */
    function autoBridges(contour, count, width) {
        if (!contour || !contour.points || contour.points.length < 2) {
            console.warn(LOG_PREFIX, 'autoBridges: Ungültige Kontur (keine Punkte)');
            return [];
        }

        count = Math.max(1, Math.round(count));
        width = Math.max(0.1, width);

        const perimeter = _computePerimeter(contour.points);
        if (perimeter < 1e-6) {
            console.warn(LOG_PREFIX, 'autoBridges: Kontur hat keinen Umfang');
            return [];
        }

        // Prüfen ob Bridges in den Umfang passen
        const totalBridgeWidth = count * width;
        if (totalBridgeWidth >= perimeter) {
            console.warn(LOG_PREFIX, `autoBridges: Gesamt-Stegbreite (${totalBridgeWidth.toFixed(2)} mm) >= Umfang (${perimeter.toFixed(2)} mm)`);
            return [];
        }

        const distances = _cumulativeDistances(contour.points);
        const spacing = perimeter / count;
        const bridges = [];

        for (let i = 0; i < count; i++) {
            // Position: Mitte jedes Segments (offset um halbe Spacing)
            const position = spacing * (i + 0.5);
            const resolved = _resolvePosition(distances, position);

            bridges.push({
                position: position,
                width: width,
                segIndex: resolved.segIndex,
                param: resolved.param
            });
        }

        contour.bridges = bridges;

        console.log(LOG_PREFIX, `Auto: ${count} Bridges (${width} mm) auf "${contour.name}" — Umfang ${perimeter.toFixed(1)} mm, Abstand ${spacing.toFixed(1)} mm`);
        return bridges.map(b => ({ ...b }));
    }

    /**
     * Fügt eine einzelne Bridge an einer parametrischen Position hinzu.
     *
     * @param {CamContour} contour - Zielkontur
     * @param {number} position - Parametrische Position (0–1 entlang Kontur, wird auf mm umgerechnet)
     * @param {number} width - Bridge-Breite in mm
     * @returns {{position: number, width: number, segIndex: number, param: number}|null} Bridge-Objekt oder null
     */
    function addBridge(contour, position, width) {
        if (!contour || !contour.points || contour.points.length < 2) {
            console.warn(LOG_PREFIX, 'addBridge: Ungültige Kontur');
            return null;
        }

        width = Math.max(0.1, width || 0.5);
        position = Math.max(0, Math.min(1, position));

        const perimeter = _computePerimeter(contour.points);
        if (perimeter < 1e-6) {
            console.warn(LOG_PREFIX, 'addBridge: Kontur hat keinen Umfang');
            return null;
        }

        const absPosition = position * perimeter;
        const distances = _cumulativeDistances(contour.points);
        const resolved = _resolvePosition(distances, absPosition);

        const bridge = {
            position: absPosition,
            width: width,
            segIndex: resolved.segIndex,
            param: resolved.param
        };

        _ensureBridgesArray(contour);
        contour.bridges.push(bridge);

        // Nach Position sortieren
        contour.bridges.sort((a, b) => a.position - b.position);

        const index = contour.bridges.indexOf(bridge);
        console.log(LOG_PREFIX, `Bridge hinzugefügt: pos=${absPosition.toFixed(2)} mm (${(position * 100).toFixed(1)}%), width=${width} mm, Index=${index}`);

        return { ...bridge };
    }

    /**
     * Entfernt eine Bridge an einem Index.
     *
     * @param {CamContour} contour - Zielkontur
     * @param {number} bridgeIndex - Index in contour.bridges[]
     * @returns {boolean} true wenn erfolgreich entfernt
     */
    function removeBridge(contour, bridgeIndex) {
        if (!contour || !contour.bridges) {
            console.warn(LOG_PREFIX, 'removeBridge: Keine Bridges vorhanden');
            return false;
        }

        if (bridgeIndex < 0 || bridgeIndex >= contour.bridges.length) {
            console.warn(LOG_PREFIX, `removeBridge: Index ${bridgeIndex} außerhalb Bereich (0–${contour.bridges.length - 1})`);
            return false;
        }

        const removed = contour.bridges.splice(bridgeIndex, 1)[0];
        console.log(LOG_PREFIX, `Bridge entfernt: pos=${removed.position.toFixed(2)} mm, width=${removed.width} mm`);
        return true;
    }

    /**
     * Erzeugt den aufgeteilten Pfad: abwechselnd Schnitt- und Überspring-Segmente.
     *
     * Jedes Segment enthält:
     *   - type: 'cut' oder 'skip'
     *   - points: Array von {x, y} Punkten für dieses Segment
     *   - startDist / endDist: absolute Distanz entlang der Kontur
     *
     * @param {CamContour} contour - Kontur mit contour.bridges[]
     * @returns {Array<{type: string, points: Array<{x: number, y: number}>, startDist: number, endDist: number}>}
     */
    function getBridgedPath(contour) {
        if (!contour || !contour.points || contour.points.length < 2) {
            return [];
        }

        const points = contour.points;
        const bridges = contour.bridges;

        // Ohne Bridges: gesamter Pfad ist ein Schnitt-Segment
        if (!bridges || bridges.length === 0) {
            const perimeter = _computePerimeter(points);
            return [{
                type: 'cut',
                points: points.map(p => ({ x: p.x, y: p.y })),
                startDist: 0,
                endDist: perimeter
            }];
        }

        const distances = _cumulativeDistances(points);
        const totalLength = distances[distances.length - 1];

        if (totalLength < 1e-6) return [];

        // Bridge-Intervalle berechnen: [startDist, endDist]
        const intervals = bridges.map(b => {
            const halfW = b.width / 2;
            let start = b.position - halfW;
            let end = b.position + halfW;
            // Clamp auf [0, totalLength]
            start = Math.max(0, start);
            end = Math.min(totalLength, end);
            return { start, end };
        }).sort((a, b) => a.start - b.start);

        // Intervalle zusammenführen (falls überlappend)
        const merged = [];
        for (const iv of intervals) {
            if (merged.length > 0 && iv.start <= merged[merged.length - 1].end + 1e-6) {
                merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
            } else {
                merged.push({ start: iv.start, end: iv.end });
            }
        }

        // Split-Punkte sammeln: cut- und skip-Intervalle
        const segments = [];
        let cursor = 0;

        for (const iv of merged) {
            if (iv.start > cursor + 1e-6) {
                // cut-Segment vor der Bridge
                segments.push({ type: 'cut', startDist: cursor, endDist: iv.start });
            }
            // skip-Segment (Bridge)
            segments.push({ type: 'skip', startDist: iv.start, endDist: iv.end });
            cursor = iv.end;
        }

        // Rest nach letzter Bridge
        if (cursor < totalLength - 1e-6) {
            segments.push({ type: 'cut', startDist: cursor, endDist: totalLength });
        }

        // Punkte für jedes Segment extrahieren
        return segments.map(seg => {
            const segPoints = _extractSubpath(points, distances, seg.startDist, seg.endDist);
            return {
                type: seg.type,
                points: segPoints,
                startDist: seg.startDist,
                endDist: seg.endDist
            };
        });
    }

    /**
     * Extrahiert eine Teilstrecke aus dem Punktepfad zwischen startDist und endDist
     * @param {Array<{x: number, y: number}>} points
     * @param {number[]} distances - Kumulative Distanzen
     * @param {number} startDist
     * @param {number} endDist
     * @returns {Array<{x: number, y: number}>}
     */
    function _extractSubpath(points, distances, startDist, endDist) {
        const result = [];
        const totalLength = distances[distances.length - 1];

        // Start-Punkt interpolieren
        const startResolved = _resolvePosition(distances, startDist);
        result.push(_interpolatePoint(points, startResolved.segIndex, startResolved.param));

        // Alle Punkte zwischen start und end einfügen
        for (let i = 1; i < points.length; i++) {
            if (distances[i] > startDist + 1e-6 && distances[i] < endDist - 1e-6) {
                result.push({ x: points[i].x, y: points[i].y });
            }
        }

        // End-Punkt interpolieren (wenn nicht identisch mit letztem Punkt)
        const endResolved = _resolvePosition(distances, endDist);
        const endPt = _interpolatePoint(points, endResolved.segIndex, endResolved.param);

        if (result.length === 0 || Math.hypot(endPt.x - result[result.length - 1].x, endPt.y - result[result.length - 1].y) > 1e-6) {
            result.push(endPt);
        }

        return result;
    }

    /**
     * Gibt Visualisierungsdaten für alle Bridges einer Kontur zurück.
     * Für den Canvas-Renderer: orange Marker an Bridge-Positionen.
     *
     * @param {CamContour} contour - Kontur mit contour.bridges[]
     * @returns {Array<{x: number, y: number, width: number, angle: number}>}
     */
    function getBridgePoints(contour) {
        if (!contour || !contour.points || contour.points.length < 2) {
            return [];
        }
        if (!contour.bridges || contour.bridges.length === 0) {
            return [];
        }

        const points = contour.points;
        const distances = _cumulativeDistances(points);

        return contour.bridges.map(bridge => {
            const resolved = _resolvePosition(distances, bridge.position);
            const pt = _interpolatePoint(points, resolved.segIndex, resolved.param);
            const angle = _segmentAngle(points, resolved.segIndex);

            return {
                x: pt.x,
                y: pt.y,
                width: bridge.width,
                angle: angle
            };
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  POSTPROZESSOR-HILFSFUNKTIONEN
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Erzeugt G-Code-Anweisungen für den Bridged-Pfad.
     * Schnitt-Segmente → G01/G02/G03, Bridge-Segmente → Kopf anheben + Rapid + Absenken.
     *
     * @param {CamContour} contour - Kontur mit Bridges
     * @param {object} [options] - Optionale Parameter
     * @param {number} [options.retractHeight=5.0] - Z-Höhe für Rückzug über Bridge (mm)
     * @param {number} [options.feedRate=1000] - Vorschub für Schnitt (mm/min)
     * @returns {Array<{type: string, gcode: string[], points?: Array}>} G-Code-Segmente
     */
    function generateBridgeGCode(contour, options = {}) {
        const retractHeight = options.retractHeight ?? 5.0;
        const feedRate = options.feedRate ?? 1000;

        const segments = getBridgedPath(contour);
        if (segments.length === 0) return [];

        const gcodeSegments = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];

            if (seg.type === 'cut') {
                // Schnitt-Segment: Linearbewegungen
                const lines = [];
                if (i > 0 && segments[i - 1].type === 'skip') {
                    // Nach Bridge: Absenken und Piercing
                    lines.push(`; --- Bridge-Ende: Absenken ---`);
                    lines.push(`G01 Z0 F${feedRate}`);
                }
                for (let j = 1; j < seg.points.length; j++) {
                    const p = seg.points[j];
                    lines.push(`G01 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F${feedRate}`);
                }
                gcodeSegments.push({
                    type: 'cut',
                    gcode: lines,
                    points: seg.points
                });

            } else if (seg.type === 'skip') {
                // Bridge-Segment: Kopf anheben, Eilgang über Bridge, Absenken
                const lines = [];
                const bridgeSpan = (seg.endDist - seg.startDist).toFixed(1);
                lines.push(`; --- Bridge: Kopf anheben (${bridgeSpan} mm) ---`);
                lines.push(`G01 Z${retractHeight.toFixed(1)} F${feedRate}`);

                // Rapid zum Ende der Bridge
                if (seg.points.length > 0) {
                    const endPt = seg.points[seg.points.length - 1];
                    lines.push(`G00 X${endPt.x.toFixed(3)} Y${endPt.y.toFixed(3)}`);
                }

                gcodeSegments.push({
                    type: 'skip',
                    gcode: lines,
                    points: seg.points
                });
            }
        }

        console.log(LOG_PREFIX, `G-Code generiert: ${gcodeSegments.filter(s => s.type === 'cut').length} Schnitt- + ${gcodeSegments.filter(s => s.type === 'skip').length} Bridge-Segmente`);
        return gcodeSegments;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  UTILITY
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Entfernt alle Bridges von einer Kontur
     * @param {CamContour} contour
     * @returns {number} Anzahl entfernter Bridges
     */
    function clearBridges(contour) {
        if (!contour || !contour.bridges) return 0;
        const count = contour.bridges.length;
        contour.bridges = [];
        if (count > 0) {
            console.log(LOG_PREFIX, `${count} Bridges von "${contour.name}" entfernt`);
        }
        return count;
    }

    /**
     * Gibt die Anzahl der Bridges einer Kontur zurück
     * @param {CamContour} contour
     * @returns {number}
     */
    function getBridgeCount(contour) {
        return (contour && contour.bridges) ? contour.bridges.length : 0;
    }

    /**
     * Validiert Bridge-Positionen und aktualisiert segIndex/param
     * (z.B. nach Kontur-Modifikation)
     * @param {CamContour} contour
     */
    function revalidateBridges(contour) {
        if (!contour || !contour.bridges || contour.bridges.length === 0) return;
        if (!contour.points || contour.points.length < 2) {
            contour.bridges = [];
            return;
        }

        const distances = _cumulativeDistances(contour.points);
        const totalLength = distances[distances.length - 1];

        contour.bridges = contour.bridges.filter(b => {
            if (b.position >= totalLength) {
                console.log(LOG_PREFIX, `Bridge bei ${b.position.toFixed(2)} mm entfernt (außerhalb neuer Umfang ${totalLength.toFixed(2)} mm)`);
                return false;
            }
            // segIndex/param aktualisieren
            const resolved = _resolvePosition(distances, b.position);
            b.segIndex = resolved.segIndex;
            b.param = resolved.param;
            return true;
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    //  EXPORT
    // ════════════════════════════════════════════════════════════════════════

    console.log(`${LOG_PREFIX} Modul geladen — Build 20260309`);

    return {
        // Kern-API
        autoBridges,
        addBridge,
        removeBridge,
        getBridgedPath,
        getBridgePoints,

        // Postprozessor
        generateBridgeGCode,

        // Utility
        clearBridges,
        getBridgeCount,
        revalidateBridges,

        // Version
        VERSION
    };
})();
