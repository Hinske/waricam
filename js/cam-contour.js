/**
 * CeraCUT CamContour V5.7 - IGEMS-konformes Lead-In/Out System
 * Small-Hole: Center-Pierce bei kleinen RUNDEN Bohrungen (Aspekt < 2.5:1)
 * Corner-Lead: linear bei Ecken, Arc bei Segmenten
 * Collision-Detection V2: Distance-based, Lead-In/Out-aware, Fallback
 * Kerf-Flip, Auto-Shorten bei Kontur-Schnitt
 * V4.5: Außen/Innen-Lead Differenzierung, clone(), IGEMS 4-Slot Fallback-Kette
 * V4.6: Alternativ-Lead Property-Rename (altLeadInLength/Angle/OutLength/Overcut)
 * V4.7: Multi-Kontur Collision Detection — Lead vs. ALLE Konturen
 * V4.8: Lead-Routing Strategien A (Rotation) + B (Dog-Leg), isRotated/isAlternative Flags
 * V5.0: leadManualOverride Property für Profil-Batch-Schutz
 * V5.1: Clearance-Scored Lead Placement — beste Position statt erste kollisionsfreie
 * V5.2: Corner-Penalty + Flat-Segment-Bonus
 * V5.3: autoPlace bevorzugt Flat-Segments, Arc-Degradierung nur >120°
 * V5.5: materialGroup + intarsiaRole für Multi-Material Intarsien
 * V5.4: Hatch-Property (Schraffur — reine Visualisierung) + clone()-Support
 * V5.6: Hatch als eigenständige CamContour (cuttingMode='none', isHatchContour)
 * V5.7: Gap Detection — gaps[], healedGaps[] Properties + hasGaps()/clearGapData()
 * Last Modified: 2026-03-16 UTC
 */

class CamContour {
    constructor(points, options = {}) {
        this.points = points || [];
        this.name = options.name || `Contour_${CamContour.nextId++}`;
        this.cuttingMode = options.cuttingMode || null;  // 'disc' | 'hole' | 'none' | null
        this.kerfWidth = options.kerfWidth ?? 0.8;
        this.kerfSide = 'left';
        this.quality = options.quality ?? 2;
        this.isClosed = this._detectClosed();
        this.layer = options.layer || '';
        this.isReference = options.isReference || false;
        this.type = options.type || null;

        // ═══ LEAD-IN Parameter (IGEMS-konform) ═══
        this.leadInType = options.leadInType || 'arc';       // 'arc' | 'linear' | 'tangent' | 'on_geometry'
        this.leadInLength = options.leadInLength ?? 4.0;
        this.leadInRadius = options.leadInRadius ?? 2.0;
        this.leadInAngle = options.leadInAngle ?? 90;

        // ═══ LEAD-OUT Parameter ═══
        this.leadOutType = options.leadOutType || 'arc';
        this.leadOutLength = options.leadOutLength ?? 4.0;
        this.leadOutRadius = options.leadOutRadius ?? 2.0;
        this.leadOutAngle = options.leadOutAngle ?? 90;

        // ═══ OVERCUT (kann auch negativ sein) ═══
        this.overcutLength = options.overcutLength ?? 1.0;

        // ═══ PIERCING (B.1 — IGEMS 6 Typen) ═══
        // Werte: 'auto'|'blind'|'pierce_linear'|'stationary'|'circular'|'drilling'|'air_start'
        // R923-Mapping: auto=1, blind=9, pierce_linear=1, stationary=2, circular=3, drilling=4, air_start=0
        this.piercingType = options.piercingType || 'auto';
        this.piercingStationaryTime  = options.piercingStationaryTime  ?? 1.5;  // R924 [s]
        this.piercingCircularRadius  = options.piercingCircularRadius  ?? 2.0;  // R925 [mm]
        this.piercingCircularTime    = options.piercingCircularTime    ?? 2.0;  // R926 [s]

        // ═══ DYNAMIC LEAD (B.2) ═══
        this.leadInDynamic   = options.leadInDynamic   ?? false;
        this.leadInLengthMin = options.leadInLengthMin ?? 1.0;   // mm
        this.leadInLengthMax = options.leadInLengthMax ?? 15.0;  // mm

        // ═══ FLÄCHENKLASSEN (B.3) ═══
        // Wird von außen als areaClassApplied gesetzt (kein eigenes Berechnen hier)
        this.areaClassApplied = false;  // true wenn Flächenklasse angewendet wurde

        // ═══ CORNER LEAD ═══
        this.preferCorners = options.preferCorners ?? true;
        this.cornerAngleThreshold = options.cornerAngleThreshold || 30;

        // ═══ ALTERNATIV-LEAD (IGEMS Slot 4 — Fallback bei Kollision) ═══
        this.altLeadEnabled   = options.altLeadEnabled ?? true;
        this.altLeadType      = options.altLeadType || 'linear';
        this.altLeadInLength  = options.altLeadInLength || 3.0;
        this.altLeadInAngle   = options.altLeadInAngle || 5;
        this.altLeadOutLength = options.altLeadOutLength || 2.0;
        this.altOvercutLength = options.altOvercutLength || 2.0;

        // ═══ LEAD MANUAL OVERRIDE (V5.0 — Batch-Schutz) ═══
        this.leadManualOverride = options.leadManualOverride ?? false;

        // ═══ HATCH (Schraffur — eigenständige Kontur mit cuttingMode='none') ═══
        this.hatch = options.hatch || null;
        // Format: { pattern: 'solid'|'lines'|'cross'|'dots', color: null|CSS, angle: 45, spacing: 3, opacity: 0.25 }
        this.isHatchContour = options.isHatchContour ?? false;  // true = Hatch-Entity (wird nie geschnitten)
        this.parentContourName = options.parentContourName || null;  // Name der Eltern-Kontur

        // ═══ MULTI-MATERIAL INTARSIEN (V5.5) ═══
        this.materialGroup = options.materialGroup ?? 0;       // 0-4 (Index in CeraCUT.INTARSIA_MATERIALS)
        this.intarsiaRole = options.intarsiaRole || null;      // 'base'|'insert'|null
        // Format: { pattern: 'solid'|'lines'|'cross'|'dots', color: null|CSS, angle: 45, spacing: 3, opacity: 0.25 }

        // ═══ GAP DETECTION (Offene Konturen) ═══
        this.gaps = [];           // [{x1,y1, x2,y2, distance, type:'open'|'healable'}]
        this.healedGaps = [];     // [{x1,y1, x2,y2, originalDistance}]

        // ═══ KERF FLIP (Kompensationsseite umkehren) ═══
        this.kerfFlipped = false;  // true = Kerf auf Gegenseite

        // ═══ Interne States ═══
        this.startPointIndex = 0;
        this._rotationCount = 0;  // Zähler für Cache-Invalidierung bei Startpunkt-Rotation
        this.cutOrder = null;
        this.isSelected = false;
        this.isHovered = false;
        this._cachedKerfPolyline = null;
        this._cacheKey = null;
        this._cachedLeadInPath = null;
        this._cachedLeadOutPath = null;
        this._cachedOvercutPath = null;
        this.compensationSkipped = false;
        this.tooSmall = false;
    }

    _detectClosed() {
        if (this.points.length < 3) return false;
        const first = this.points[0];
        const last = this.points[this.points.length - 1];
        return Geometry.distance(first, last) < 0.01;
    }

    // ═══ GAP DETECTION HELPERS ═══
    hasGaps() { return this.gaps.length > 0; }

    clearGapData() {
        this.gaps = [];
        this.healedGaps = [];
    }

    // ════════════════════════════════════════════════════════════════
    // KERF OFFSET
    // ════════════════════════════════════════════════════════════════

    getKerfOffsetPolyline() {
        const cacheKey = `${this.kerfWidth}_${this.kerfSide}_${this.cuttingMode}_${this.points.length}_${this._rotationCount}_${this.kerfFlipped}`;
        if (this._cachedKerfPolyline && this._cacheKey === cacheKey) {
            return this._cachedKerfPolyline;
        }

        const cacheResult = (result) => {
            this._cachedKerfPolyline = result;
            this._cacheKey = cacheKey;
            return result;
        };

        if (this.kerfSide === 'online' || this.kerfWidth <= 0) {
            return cacheResult({ points: this.points, flipped: false });
        }
        if (!this.points || this.points.length < 3) {
            return cacheResult({ points: this.points, flipped: false });
        }
        if (!this.isClosed) {
            this.compensationSkipped = true;
            return cacheResult({ points: this.points, flipped: false, isOpen: true });
        }
        if (!this.cuttingMode) {
            return cacheResult({ points: this.points, flipped: false });
        }

        const d = this.kerfWidth / 2;
        // kerfFlipped: Kompensation auf Gegenseite (Loch→außen, Scheibe→innen)
        const isHole = this.kerfFlipped
            ? (this.cuttingMode !== 'hole')
            : (this.cuttingMode === 'hole');
        const Area_Original = Math.abs(Geometry.getSignedArea(this.points));

        if (Area_Original < 0.01) {
            this.compensationSkipped = true;
            this.tooSmall = true;
            return cacheResult({ points: this.points, flipped: false });
        }

        let trialOffset = Geometry.offsetPolygon(this.points, d, this.isClosed);
        if (!trialOffset || trialOffset.length < 3) {
            this.compensationSkipped = true;
            return cacheResult({ points: this.points, flipped: false });
        }

        const Area_Trial = Math.abs(Geometry.getSignedArea(trialOffset));
        if (isNaN(Area_Trial) || Area_Trial < 1e-10) {
            this.compensationSkipped = true;
            return cacheResult({ points: this.points, flipped: false });
        }

        const areaTolerance = Area_Original * 0.001;
        let validationFailed = false;
        let finalOffset = trialOffset;
        let flipped = false;

        if (isHole) {
            if (Area_Trial >= Area_Original - areaTolerance) validationFailed = true;
        } else {
            if (Area_Trial <= Area_Original + areaTolerance) validationFailed = true;
        }

        if (validationFailed) {
            finalOffset = Geometry.offsetPolygon(this.points, -d, this.isClosed);
            if (!finalOffset || finalOffset.length < 3) {
                this.compensationSkipped = true;
                return cacheResult({ points: this.points, flipped: false });
            }
            const Area_Flipped = Math.abs(Geometry.getSignedArea(finalOffset));
            if (isNaN(Area_Flipped) || Area_Flipped === 0) {
                this.compensationSkipped = true;
                return cacheResult({ points: this.points, flipped: false });
            }
            if (isHole) {
                if (Area_Flipped >= Area_Original - areaTolerance) {
                    this.compensationSkipped = true;
                    return cacheResult({ points: this.points, flipped: false });
                }
            } else {
                if (Area_Flipped <= Area_Original + areaTolerance) {
                    this.compensationSkipped = true;
                    return cacheResult({ points: this.points, flipped: false });
                }
            }
            flipped = true;
        }

        const Area_Final = Math.abs(Geometry.getSignedArea(finalOffset));
        if (!isFinite(Area_Final) || Area_Original < 1e-10 || Area_Final / Area_Original < 0.01) {
            this.compensationSkipped = true;
            return cacheResult({ points: this.points, flipped: false });
        }

        this.compensationSkipped = false;
        return cacheResult({ points: finalOffset, flipped });
    }

    // ════════════════════════════════════════════════════════════════
    // WASTE-SIDE NORMAL (Centroid-basiert)
    // ════════════════════════════════════════════════════════════════

    /**
     * Bestimmt die Normale an einem Konturpunkt, die zur VERSCHNITTSEITE zeigt.
     * Disc: Verschnitt AUSSEN -> Normale weg vom Centroid
     * Hole: Verschnitt INNEN  -> Normale zum Centroid
     */
    _getWasteSideNormal(point, tangent) {
        // V5.3: Shoelace-basierte Windungsrichtung (robust, auch bei nicht-konvexen Konturen)
        // Links-Normale der Tangente: (-tangent.y, tangent.x)
        let nx = -tangent.y;
        let ny = tangent.x;

        const signedArea = Geometry.getSignedArea(this.points);
        const isCW = signedArea > 0;
        const isHole = this.cuttingMode === 'hole';

        // CW: Links-Normale zeigt EINWÄRTS, CCW: AUSWÄRTS
        // Disc (Waste=außen): Normale soll AUSWÄRTS → CW: flip
        // Hole (Waste=innen): Normale soll EINWÄRTS → CCW: flip
        if (isHole) {
            if (!isCW) { nx = -nx; ny = -ny; }
        } else {
            if (isCW) { nx = -nx; ny = -ny; }
        }

        return { x: nx, y: ny };
    }

    // ════════════════════════════════════════════════════════════════
    // CORNER DETECTION
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft ob der Startpunkt (Index 0) an einer Ecke liegt.
     * Gibt den Eckenwinkel in Grad zurück, oder 0 wenn keine Ecke.
     */
    _isAtCorner(pts) {
        if (!pts || pts.length < 4) return 0;
        const n = pts.length;
        const isClosed = Geometry.distance(pts[0], pts[n - 1]) < 0.01;
        if (!isClosed) return 0;

        // Vorgänger = vorletzter Punkt (da letzter = erster bei closed)
        const prev = pts[n - 2];
        const curr = pts[0];
        const next = pts[1];

        const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
        const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
        if (len1 < 0.001 || len2 < 0.001) return 0;

        const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const deviationDeg = (Math.PI - angle) * 180 / Math.PI;

        return deviationDeg > this.cornerAngleThreshold ? deviationDeg : 0;
    }

    // ════════════════════════════════════════════════════════════════
    // SMALL-HOLE DETECTION
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet den effektiven Radius einer geschlossenen Kontur.
     * Nutzt Fläche für Kreise: r = sqrt(A/π)
     * Fallback: halbe Bounding-Box-Diagonale.
     */
    _getEffectiveRadius(pts) {
        if (!pts || pts.length < 3) return Infinity;
        const area = Math.abs(Geometry.getSignedArea(pts));
        if (area < 0.001) return Infinity;
        // Flächenbasierter Radius (exakt für Kreise, konservativ für andere)
        return Math.sqrt(area / Math.PI);
    }

    /**
     * Prüft ob die Kontur ein "kleines Loch" ist.
     * Klein = Lead-Länge oder Arc-Radius größer als der effektive Radius.
     * NUR für annähernd kreisförmige Löcher (Aspekt-Ratio < 2.5:1).
     * Dünne/längliche Formen (Halbmonde, Blätter) werden NICHT als small-hole behandelt.
     */
    _isSmallHole(pts) {
        if (this.cuttingMode !== 'hole') return false;
        if (!pts || pts.length < 3) return false;

        // Aspekt-Ratio prüfen: nur annähernd kreisförmige Formen
        const bb = Geometry.boundingBox(pts);
        if (!bb) return false;
        const w = bb.maxX - bb.minX;
        const h = bb.maxY - bb.minY;
        const minDim = Math.min(w, h);
        const maxDim = Math.max(w, h);
        if (minDim < 0.001) return false;
        const aspectRatio = maxDim / minDim;

        // Längliche Formen (> 2.5:1) sind KEINE "kleinen Bohrungen"
        if (aspectRatio > 2.5) return false;

        const r = this._getEffectiveRadius(pts);
        // Klein wenn Lead-Länge > Radius ODER Arc-Radius > halber Radius
        return (this.leadInLength > r) || (this.leadInRadius > r * 0.5);
    }

    /**
     * CENTER-PIERCE Lead-In für kleine Bohrungen.
     * Pierce-Punkt = Centroid, gerader Weg zum Entry-Punkt.
     */
    _calcCenterPierceLeadIn(entry, pts) {
        const centroid = Geometry.centroid(pts);
        return {
            points: [
                { x: centroid.x, y: centroid.y },
                { x: entry.x, y: entry.y }
            ],
            piercingPoint: { x: centroid.x, y: centroid.y },
            entryPoint: { x: entry.x, y: entry.y },
            type: 'center_pierce'
        };
    }

    /**
     * CENTER-EXIT Lead-Out für kleine Bohrungen.
     * Kurze Gerade vom Exit-Punkt Richtung Zentrum (halber Radius).
     */
    _calcCenterExitLeadOut(exit, pts) {
        const centroid = Geometry.centroid(pts);
        const dx = centroid.x - exit.x, dy = centroid.y - exit.y;
        const dist = Math.hypot(dx, dy);
        // Maximal halber Weg zum Zentrum
        const t = dist > 0.001 ? 0.5 : 0; // Halber Weg zum Zentrum
        const endPoint = {
            x: exit.x + dx * t,
            y: exit.y + dy * t
        };
        return {
            points: [
                { x: exit.x, y: exit.y },
                endPoint
            ],
            endPoint,
            type: 'center_exit'
        };
    }

    // ════════════════════════════════════════════════════════════════
    // LEAD-IN
    // ════════════════════════════════════════════════════════════════

    getLeadInPath() {
        if (this._cachedLeadInPath) return this._cachedLeadInPath;

        // SLIT (offene Pfade): On-Geometry Piercing am Startpunkt (IGEMS Quick→Slit)
        if (!this.isClosed && this.cuttingMode === 'slit') {
            const pts = this.points;
            if (!pts || pts.length < 2) return null;
            const entry = pts[0];
            const next = pts[1];
            const dx = next.x - entry.x, dy = next.y - entry.y;
            const len = Math.hypot(dx, dy);
            const tangent = len > 0.0001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
            this._cachedLeadInPath = this._calcOnGeometryLead(entry, tangent);
            return this._cachedLeadInPath;
        }

        const offsetResult = this.getKerfOffsetPolyline();
        const pts = (offsetResult?.points?.length > 2 && !this.compensationSkipped)
            ? offsetResult.points : this.points;
        if (!pts || pts.length < 3) return null;

        // SMALL HOLE: Pierce im Zentrum der Bohrung
        if (this._isSmallHole(pts)) {
            const leadPath = this._calcCenterPierceLeadIn(pts[0], pts);
            this._cachedLeadInPath = leadPath;
            return leadPath;
        }

        const entry = pts[0];
        const next = pts[1];

        const dx = next.x - entry.x, dy = next.y - entry.y;
        const len = Math.hypot(dx, dy);
        const tangent = len > 0.0001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };

        const normal = this._getWasteSideNormal(entry, tangent);

        // DYNAMIC LEAD (B.2): effektive Länge berechnen
        // DYNAMIC LEAD (B.2): temporär effektive Länge setzen, nach Berechnung wiederherstellen
        const _origLeadInLength = this.leadInLength;
        if (this.leadInDynamic) {
            this.leadInLength = this._calcDynamicLeadLength(entry, tangent, normal, pts);
        }

        // CORNER DETECTION: Nur an sehr scharfen Ecken (>120°) Arc zu Linear degradieren
        // V5.3: Threshold von 90° auf 120° erhöht — Arc-Leads werden seltener degradiert
        const cornerAngle = this._isAtCorner(pts);
        let effectiveType = this.leadInType;
        if (cornerAngle > 120 && effectiveType === 'arc') {
            effectiveType = 'linear';
        }

        let leadPath;
        switch (effectiveType) {
            case 'linear':
                leadPath = this._calcLinearLeadIn(entry, tangent, normal);
                leadPath = this._shortenLeadIfCollision(leadPath, pts);
                break;
            case 'arc':
                leadPath = this._arcLeadInWithFallback(entry, tangent, normal, pts);
                break;
            case 'tangent':
                leadPath = this._calcTangentLeadIn(entry, tangent, normal);
                leadPath = this._shortenLeadIfCollision(leadPath, pts);
                break;
            case 'on_geometry':
                leadPath = this._calcOnGeometryLead(entry, tangent);
                break;
            default:
                leadPath = this._arcLeadInWithFallback(entry, tangent, normal, pts);
        }

        // V4.5: IGEMS Slot 4 — Alternativ-Lead Fallback bei starker Kollision
        if (leadPath?.shortened && this.altLeadEnabled) {
            const primaryLen = this._pathLength(leadPath.points);
            const requestedLen = this.leadInLength;
            // Fallback wenn Primary-Lead auf < 40% gekürzt wurde
            if (primaryLen < requestedLen * 0.4) {
                const altPath = this._tryAlternativeLeadIn(entry, tangent, normal, pts);
                if (altPath && (!altPath.shortened || this._pathLength(altPath.points) > primaryLen)) {
                    leadPath = altPath;
                    console.debug(`[CamContour V5.3] Alt-Lead: ${this.name} (${primaryLen.toFixed(1)}mm < 40% von ${requestedLen}mm)`);
                }
            }
        }

        // V4.5: Letzter Fallback — Center-Pierce wenn Lead immer noch stark kollidiert
        if (leadPath?.shortened && this.altLeadEnabled) {
            const finalLen = this._pathLength(leadPath.points);
            if (finalLen < 0.5) {
                leadPath = this._calcCenterPierceLeadIn(entry, pts);
                leadPath.isFallbackCenterPierce = true;
                console.debug(`[CamContour V5.3] Center-Pierce Fallback: ${this.name}`);
            }
        }

        // DYNAMIC LEAD: User-Wert wiederherstellen (wurde nur temporär geändert)
        if (this.leadInDynamic) {
            this.leadInLength = _origLeadInLength;
        }

        this._cachedLeadInPath = leadPath;
        return leadPath;
    }

    /**
     * LINEAR LEAD-IN - Gerade vom Pierce-Punkt zur Kontur
     */
    _calcLinearLeadIn(entry, tangent, normal) {
        const length = this.leadInLength;
        const angleRad = this.leadInAngle * Math.PI / 180;

        const approachX = normal.x * Math.sin(angleRad) - tangent.x * Math.cos(angleRad);
        const approachY = normal.y * Math.sin(angleRad) - tangent.y * Math.cos(angleRad);

        const pierce = {
            x: entry.x + approachX * length,
            y: entry.y + approachY * length
        };

        return {
            points: [pierce, { x: entry.x, y: entry.y }],
            piercingPoint: pierce,
            entryPoint: { x: entry.x, y: entry.y },
            type: 'linear'
        };
    }

    /**
     * ARC LEAD-IN (IGEMS Standard) - Kreisbogen tangential in die Kontur
     * 
     * Geometrie:
     * - Bogenzentrum auf der Verschnittseite (normal * radius)
     * - Am Entry-Punkt muss der Bogen tangential zur Schnittrichtung sein
     * - CCW-Tangente am Entry = (normal.y, -normal.x)
     * - CW-Tangente am Entry = (-normal.y, normal.x)
     * - Wir wählen die Richtung, die zur Schnitt-Tangente passt
     */
    _calcArcLeadIn(entry, tangent, normal) {
        const radius = this.leadInRadius;
        const totalLength = this.leadInLength;

        // Bogenzentrum auf der Verschnittseite
        const cx = entry.x + normal.x * radius;
        const cy = entry.y + normal.y * radius;

        // Entry-Winkel (Entry-Punkt relativ zum Zentrum)
        const entryAngle = Math.atan2(entry.y - cy, entry.x - cx);

        // Bogen-Richtung bestimmen: Tangente am Entry muss zur Schnittrichtung passen
        // CCW-Tangente am Entry-Punkt des Kreises: (normal.y, -normal.x)
        const ccwDot = normal.y * tangent.x + (-normal.x) * tangent.y;
        const sweepCCW = ccwDot > 0;

        const arcSpan = Math.PI / 2;  // 90°

        // Bogen-Startwinkel: Rückwärts vom Entry aus gesehen
        const arcStartAngle = sweepCCW
            ? entryAngle - arcSpan   // CCW: Start liegt bei kleinerem Winkel
            : entryAngle + arcSpan;  // CW: Start liegt bei größerem Winkel

        // Bogen-Startpunkt auf dem Kreis
        const arcStartX = cx + radius * Math.cos(arcStartAngle);
        const arcStartY = cy + radius * Math.sin(arcStartAngle);

        // Optionale Gerade VOR dem Bogen (Restlänge)
        const arcLength = radius * arcSpan;
        const lineLength = Math.max(0, totalLength - arcLength);

        const points = [];

        if (lineLength > 0.1) {
            // Tangente am Bogen-Start (Richtung des Bogens am Startpunkt)
            const tanAtStart = sweepCCW
                ? { x: -Math.sin(arcStartAngle), y: Math.cos(arcStartAngle) }   // CCW-Tangente
                : { x: Math.sin(arcStartAngle), y: -Math.cos(arcStartAngle) };  // CW-Tangente
            // Pierce-Punkt: Gerade RÜCKWÄRTS von der Bogen-Tangente
            const pierce = {
                x: arcStartX - tanAtStart.x * lineLength,
                y: arcStartY - tanAtStart.y * lineLength
            };
            points.push(pierce);
        }

        points.push({ x: arcStartX, y: arcStartY });

        // Bogen-Zwischenpunkte: von arcStart → entry
        const segments = 12;
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const angle = sweepCCW
                ? arcStartAngle + arcSpan * t    // CCW: Winkel steigt
                : arcStartAngle - arcSpan * t;   // CW: Winkel fällt
            points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }

        // Letzter Punkt = Entry exakt
        points[points.length - 1] = { x: entry.x, y: entry.y };

        return {
            points,
            piercingPoint: points[0],
            entryPoint: { x: entry.x, y: entry.y },
            arcCenter: { x: cx, y: cy },
            arcRadius: radius,
            arcStartAngle: arcStartAngle,
            arcEndAngle: entryAngle,
            arcSweepCCW: sweepCCW,
            hasLinePortion: lineLength > 0.1,
            type: 'arc'
        };
    }

    /**
     * TANGENTIAL LEAD-IN - Gerade entlang umgekehrter Schnittrichtung
     */
    _calcTangentLeadIn(entry, tangent, normal) {
        const length = this.leadInLength;
        const pierce = {
            x: entry.x - tangent.x * length,
            y: entry.y - tangent.y * length
        };
        return {
            points: [pierce, { x: entry.x, y: entry.y }],
            piercingPoint: pierce,
            entryPoint: { x: entry.x, y: entry.y },
            type: 'tangent'
        };
    }

    /**
     * ON-GEOMETRY LEAD (IGEMS Piercing Type 0) - Kein sichtbarer Lead-In
     */
    _calcOnGeometryLead(entry, tangent) {
        return {
            points: [{ x: entry.x, y: entry.y }],
            piercingPoint: { x: entry.x, y: entry.y },
            entryPoint: { x: entry.x, y: entry.y },
            type: 'on_geometry',
            linearPiercingLength: this.leadInLength
        };
    }

    /**
     * ARC LEAD-IN mit progressivem Fallback:
     * 1) Voller Arc → Collision-Check
     * 2) Wenn Lead zu kurz gekürzt → halber Radius
     * 3) Wenn immer noch Collision → Linear-Fallback
     */
    _arcLeadInWithFallback(entry, tangent, normal, contourPts) {
        const origRadius = this.leadInRadius;

        // 1) Voller Arc versuchen
        let leadPath = this._calcArcLeadIn(entry, tangent, normal);
        const fullLen = this._pathLength(leadPath.points);
        leadPath = this._shortenLeadIfCollision(leadPath, contourPts);
        if (!leadPath.shortened) return leadPath;  // Passt → fertig
        if (this._pathLength(leadPath.points) > fullLen * 0.5) return leadPath;  // Leicht gekürzt → OK

        // 2) Halber Radius versuchen
        this.leadInRadius = origRadius * 0.5;
        leadPath = this._calcArcLeadIn(entry, tangent, normal);
        this.leadInRadius = origRadius;
        const halfLen = this._pathLength(leadPath.points);
        leadPath = this._shortenLeadIfCollision(leadPath, contourPts);
        if (!leadPath.shortened) return leadPath;
        if (this._pathLength(leadPath.points) > halfLen * 0.5) return leadPath;

        // 3) Linear-Fallback
        leadPath = this._calcLinearLeadIn(entry, tangent, normal);
        return this._shortenLeadIfCollision(leadPath, contourPts);
    }

    /** Gesamtlänge eines Punkt-Pfads */
    _pathLength(pts) {
        if (!pts || pts.length < 2) return 0;
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
            len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        }
        return len;
    }

    /**
     * V5.2: Flat-Segment-Bonus — bevorzugt Startpunkte auf langen geraden Abschnitten.
     * Misst den Geradenlauf (Winkelabweichung < threshold) in beide Richtungen.
     * @returns {number} Bonus 0..0.5 (0 = keine Gerade, 0.5 = lange Gerade ≥40mm)
     */
    _calcFlatSegmentBonus(idx, points, n) {
        const threshold = 10 * Math.PI / 180; // 10° max Abweichung

        // Winkel am Kandidatenpunkt prüfen
        const pPrev = points[(idx - 1 + n) % n];
        const pCurr = points[idx];
        const pNext = points[(idx + 1) % n];
        const angleIn = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
        const angleOut = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
        let deviation = Math.abs(angleOut - angleIn);
        if (deviation > Math.PI) deviation = 2 * Math.PI - deviation;
        if (deviation > threshold) return 0;

        // Geradenlauf in beide Richtungen messen
        let runLength = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y);
        const maxSteps = 20;

        // Vorwärts
        for (let s = 1; s < maxSteps; s++) {
            const a = points[(idx + s) % n];
            const b = points[(idx + s + 1) % n];
            const segAngle = Math.atan2(b.y - a.y, b.x - a.x);
            let diff = Math.abs(segAngle - angleOut);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff > threshold) break;
            runLength += Math.hypot(b.x - a.x, b.y - a.y);
        }

        // Rückwärts
        for (let s = 1; s < maxSteps; s++) {
            const a = points[(idx - s + n) % n];
            const b = points[(idx - s - 1 + n) % n];
            const segAngle = Math.atan2(b.y - a.y, b.x - a.x);
            let diff = Math.abs(segAngle - angleIn);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff > threshold) break;
            runLength += Math.hypot(b.x - a.x, b.y - a.y);
        }

        return Math.min(0.5, runLength / 40);
    }

    /**
     * V4.5: IGEMS Slot 4 — Alternativ-Lead-In berechnen.
     * Sichert/restauriert Primär-Parameter, verwendet Alt-Parameter temporär.
     * Typisch: Linear, kurz (3mm), flacher Winkel (5°) — Blind-Lead-Stil.
     */
    _tryAlternativeLeadIn(entry, tangent, normal, contourPts) {
        // Primär-Werte sichern
        const orig = {
            type: this.leadInType,
            length: this.leadInLength,
            radius: this.leadInRadius,
            angle: this.leadInAngle
        };

        // Alt-Parameter einsetzen (V4.6: neue Property-Namen)
        this.leadInType = this.altLeadType;
        this.leadInLength = this.altLeadInLength;
        this.leadInRadius = this.altLeadInRadius ?? 0;  // IGEMS Blind Lead: kein Radius — arc wird unten zu linear degradiert
        this.leadInAngle = this.altLeadInAngle;

        let altPath;
        if (this.altLeadType === 'arc' && this.altLeadInLength > 0 && this.leadInRadius > 0) {
            altPath = this._arcLeadInWithFallback(entry, tangent, normal, contourPts);
        } else {
            altPath = this._calcLinearLeadIn(entry, tangent, normal);
            altPath = this._shortenLeadIfCollision(altPath, contourPts);
        }

        // Primär-Werte restaurieren
        this.leadInType = orig.type;
        this.leadInLength = orig.length;
        this.leadInRadius = orig.radius;
        this.leadInAngle = orig.angle;

        if (altPath) altPath.isAlternative = true;
        return altPath;
    }

    // ════════════════════════════════════════════════════════════════
    // OVERCUT - Entlang der Kontur
    // ════════════════════════════════════════════════════════════════

    getOvercutPath() {
        if (this._cachedOvercutPath) return this._cachedOvercutPath;

        // SLIT: Overcut = am Ende zurück entlang des Pfads (IGEMS: "cut two times")
        if (!this.isClosed && this.cuttingMode === 'slit') {
            const overcutLen = this.overcutLength;
            if (overcutLen <= 0) return null;
            const pts = this.points;
            if (!pts || pts.length < 2) return null;

            // Vom letzten Punkt rückwärts entlang des Pfads laufen
            const overcutPoints = [{ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }];
            let remaining = overcutLen;
            for (let i = pts.length - 1; i > 0 && remaining > 0; i--) {
                const p1 = pts[i];
                const p2 = pts[i - 1];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (segLen < 1e-10) continue;  // Skip zero-length segments
                if (segLen <= remaining) {
                    overcutPoints.push({ x: p2.x, y: p2.y });
                    remaining -= segLen;
                } else {
                    const t = remaining / segLen;
                    overcutPoints.push({
                        x: p1.x + t * (p2.x - p1.x),
                        y: p1.y + t * (p2.y - p1.y)
                    });
                    remaining = 0;
                }
            }
            this._cachedOvercutPath = {
                points: overcutPoints,
                endPoint: overcutPoints[overcutPoints.length - 1],
                type: 'slit_reverse'
            };
            return this._cachedOvercutPath;
        }

        if (!this.isClosed) return null;

        // Bei Ecken: kein Overcut (IGEMS-Verhalten)
        const offsetResult = this.getKerfOffsetPolyline();
        const checkPts = (offsetResult?.points?.length > 2 && !this.compensationSkipped)
            ? offsetResult.points : this.points;

        const overcutLen = this.overcutLength;
        if (overcutLen === 0) return null;

        const pts = checkPts;
        if (!pts || pts.length < 3) return null;

        if (overcutLen > 0) {
            // POSITIVER Overcut: Entlang der Kontur über Startpunkt hinaus
            const overcutPoints = [{ x: pts[0].x, y: pts[0].y }];
            let remaining = overcutLen;

            for (let i = 0; i < pts.length - 1 && remaining > 0; i++) {
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);

                if (segLen <= remaining) {
                    overcutPoints.push({ x: p2.x, y: p2.y });
                    remaining -= segLen;
                } else {
                    const t = remaining / segLen;
                    overcutPoints.push({
                        x: p1.x + t * (p2.x - p1.x),
                        y: p1.y + t * (p2.y - p1.y)
                    });
                    remaining = 0;
                }
            }

            this._cachedOvercutPath = {
                points: overcutPoints,
                endPoint: overcutPoints[overcutPoints.length - 1],
                type: 'positive'
            };
        } else {
            // NEGATIVER Overcut: Kontur wird nicht ganz geschlossen
            this._cachedOvercutPath = {
                points: [],
                shortenBy: Math.abs(overcutLen),
                type: 'negative'
            };
        }

        return this._cachedOvercutPath;
    }

    // ════════════════════════════════════════════════════════════════
    // LEAD-OUT - Ab Overcut-Ende
    // ════════════════════════════════════════════════════════════════

    getLeadOutPath() {
        if (this._cachedLeadOutPath) return this._cachedLeadOutPath;
        if (!this.isClosed) return null;

        const offsetResult = this.getKerfOffsetPolyline();
        const pts = (offsetResult?.points?.length > 2 && !this.compensationSkipped)
            ? offsetResult.points : this.points;
        if (!pts || pts.length < 3) return null;

        // SMALL HOLE: Lead-Out Richtung Zentrum
        if (this._isSmallHole(pts)) {
            const exitPt = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
            const leadPath = this._calcCenterExitLeadOut(exitPt, pts);
            this._cachedLeadOutPath = leadPath;
            return leadPath;
        }

        // 1. Overcut-Endpunkt bestimmen
        const overcut = this.getOvercutPath();
        let exitPoint, exitTangent;

        if (overcut?.points?.length >= 2) {
            const op = overcut.points;
            exitPoint = op[op.length - 1];
            const prev = op[op.length - 2];
            const dx = exitPoint.x - prev.x, dy = exitPoint.y - prev.y;
            const len = Math.hypot(dx, dy);
            exitTangent = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
        } else {
            exitPoint = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
            const prev = pts[pts.length - 2];
            const dx = exitPoint.x - prev.x, dy = exitPoint.y - prev.y;
            const len = Math.hypot(dx, dy);
            exitTangent = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
        }

        // 2. Normale zur Verschnittseite
        const normal = this._getWasteSideNormal(exitPoint, exitTangent);

        // 3. CORNER DETECTION: Nur an sehr scharfen Ecken (>120°) Linear erzwingen
        const cornerAngle = this._isAtCorner(pts);
        let effectiveType = this.leadOutType;
        if (cornerAngle > 120 && effectiveType === 'arc') {
            effectiveType = 'linear';
        }

        // 4. Lead-Out berechnen
        let leadPath;
        switch (effectiveType) {
            case 'arc':
                leadPath = this._arcLeadOutWithFallback(exitPoint, exitTangent, normal, pts);
                break;
            case 'linear':
            default:
                leadPath = this._calcLinearLeadOut(exitPoint, exitTangent, normal);
                leadPath = this._shortenLeadIfCollision(leadPath, pts);
                break;
        }

        this._cachedLeadOutPath = leadPath;
        return leadPath;
    }

    _calcLinearLeadOut(exit, tangent, normal) {
        const length = this.leadOutLength;
        const angleRad = this.leadOutAngle * Math.PI / 180;

        const departX = normal.x * Math.sin(angleRad) + tangent.x * Math.cos(angleRad);
        const departY = normal.y * Math.sin(angleRad) + tangent.y * Math.cos(angleRad);

        const endPoint = {
            x: exit.x + departX * length,
            y: exit.y + departY * length
        };

        return {
            points: [{ x: exit.x, y: exit.y }, endPoint],
            endPoint,
            type: 'linear'
        };
    }

    _calcArcLeadOut(exit, tangent, normal) {
        const radius = this.leadOutRadius;
        const totalLength = this.leadOutLength;

        // Bogenzentrum auf der Verschnittseite
        const cx = exit.x + normal.x * radius;
        const cy = exit.y + normal.y * radius;

        // Exit-Winkel (Exit-Punkt relativ zum Zentrum)
        const exitAngle = Math.atan2(exit.y - cy, exit.x - cx);

        // Bogen-Richtung: Tangente am Exit muss zur Schnittrichtung passen
        // Gleiche Logik wie Lead-In
        const ccwDot = normal.y * tangent.x + (-normal.x) * tangent.y;
        const sweepCCW = ccwDot > 0;

        const arcSpan = Math.PI / 2;
        const segments = 12;
        const points = [{ x: exit.x, y: exit.y }];

        // Bogen vom Exit-Punkt WEITER in Schnittrichtung, dann weg von Kontur
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const angle = sweepCCW
                ? exitAngle + arcSpan * t    // CCW: Winkel steigt (weiter in Schnittrichtung)
                : exitAngle - arcSpan * t;   // CW: Winkel fällt
            points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }

        // Optionale Gerade NACH dem Bogen
        const arcLength = radius * arcSpan;
        const lineLength = Math.max(0, totalLength - arcLength);
        if (lineLength > 0.1) {
            const endAngle = sweepCCW ? exitAngle + arcSpan : exitAngle - arcSpan;
            // Tangente am Bogen-Ende (Fortsetzungsrichtung)
            const tanAtEnd = sweepCCW
                ? { x: -Math.sin(endAngle), y: Math.cos(endAngle) }
                : { x: Math.sin(endAngle), y: -Math.cos(endAngle) };
            const endPoint = {
                x: points[points.length - 1].x + tanAtEnd.x * lineLength,
                y: points[points.length - 1].y + tanAtEnd.y * lineLength
            };
            points.push(endPoint);
        }

        const arcEndAngle = sweepCCW ? exitAngle + arcSpan : exitAngle - arcSpan;

        return {
            points,
            endPoint: points[points.length - 1],
            arcCenter: { x: cx, y: cy },
            arcRadius: radius,
            arcStartAngle: exitAngle,
            arcEndAngle: arcEndAngle,
            arcSweepCCW: sweepCCW,
            hasLinePortion: lineLength > 0.1,
            type: 'arc'
        };
    }

    /**
     * ARC LEAD-OUT mit progressivem Fallback (gleiche Logik wie Lead-In).
     */
    _arcLeadOutWithFallback(exit, tangent, normal, contourPts) {
        const origRadius = this.leadOutRadius;

        // 1) Voller Arc
        let leadPath = this._calcArcLeadOut(exit, tangent, normal);
        const fullLen = this._pathLength(leadPath.points);
        leadPath = this._shortenLeadIfCollision(leadPath, contourPts);
        if (!leadPath.shortened) return leadPath;
        if (this._pathLength(leadPath.points) > fullLen * 0.5) return leadPath;

        // 2) Halber Radius
        this.leadOutRadius = origRadius * 0.5;
        leadPath = this._calcArcLeadOut(exit, tangent, normal);
        this.leadOutRadius = origRadius;
        const halfLen = this._pathLength(leadPath.points);
        leadPath = this._shortenLeadIfCollision(leadPath, contourPts);
        if (!leadPath.shortened) return leadPath;
        if (this._pathLength(leadPath.points) > halfLen * 0.5) return leadPath;

        // 3) Linear-Fallback
        leadPath = this._calcLinearLeadOut(exit, tangent, normal);
        return this._shortenLeadIfCollision(leadPath, contourPts);
    }

    // ════════════════════════════════════════════════════════════════
    // COLLISION DETECTION & AUTO-SHORTEN (V4.4 - Robust)
    // ════════════════════════════════════════════════════════════════

    /**
     * Findet den Anschlusspunkt eines Lead-Pfades an die Kontur.
     * Lead-In: letzter Punkt liegt auf der Kontur
     * Lead-Out: erster Punkt liegt auf der Kontur
     * Erkennung: welcher Endpunkt liegt näher an einem Konturpunkt?
     */
    _findConnectionPoint(leadPts, contourPts) {
        const first = leadPts[0];
        const last = leadPts[leadPts.length - 1];

        // Distanz zum nächsten Konturpunkt messen
        let minDistFirst = Infinity, minDistLast = Infinity;
        for (let i = 0; i < Math.min(contourPts.length, 50); i++) {
            const cp = contourPts[i];
            const df = Math.hypot(first.x - cp.x, first.y - cp.y);
            const dl = Math.hypot(last.x - cp.x, last.y - cp.y);
            if (df < minDistFirst) minDistFirst = df;
            if (dl < minDistLast) minDistLast = dl;
        }
        // Auch letzten Bereich der Kontur prüfen (für geschlossene Konturen)
        for (let i = Math.max(0, contourPts.length - 50); i < contourPts.length; i++) {
            const cp = contourPts[i];
            const df = Math.hypot(first.x - cp.x, first.y - cp.y);
            const dl = Math.hypot(last.x - cp.x, last.y - cp.y);
            if (df < minDistFirst) minDistFirst = df;
            if (dl < minDistLast) minDistLast = dl;
        }

        return minDistFirst < minDistLast ? first : last;
    }

    /**
     * Prüft ob ein Lead-Pfad die eigene Kontur schneidet.
     * Distance-based: Skippt Kontur-Segmente geometrisch nah am
     * Anschlusspunkt. Findet den FRÜHESTEN Schnittpunkt.
     *
     * "Frühester" = am weitesten vom Kontur-Anschlusspunkt entfernt
     * entlang des Lead-Pfads (nächster zum Pierce/End-Punkt).
     */
    _shortenLeadIfCollision(leadPath, contourPts) {
        if (!leadPath?.points || leadPath.points.length < 2) return leadPath;
        if (!contourPts || contourPts.length < 4) return leadPath;

        const lPts = leadPath.points;
        const n = contourPts.length;

        // Anschlusspunkt automatisch erkennen (Lead-In vs Lead-Out)
        const connectionPt = this._findConnectionPoint(lPts, contourPts);
        const isLeadOut = (connectionPt === lPts[0]);

        // Skip-Radius: Kontursegmente näher als diese Distanz überspringen
        // Etwas größer für Arcs wegen Bogen-Tangente am Anschluss
        const maxParam = Math.max(this.leadInRadius, this.leadInLength,
                                  this.leadOutRadius || 0, this.leadOutLength || 0);
        const skipRadius = maxParam * 0.12;

        let bestHit = null;  // { li, t, point }

        for (let li = 0; li < lPts.length - 1; li++) {
            const la = lPts[li], lb = lPts[li + 1];

            for (let ci = 0; ci < n - 1; ci++) {
                const ca = contourPts[ci], cb = contourPts[ci + 1];

                // Distance-based Skip: beide Endpunkte nah am Anschluss?
                const distA = Math.hypot(ca.x - connectionPt.x, ca.y - connectionPt.y);
                const distB = Math.hypot(cb.x - connectionPt.x, cb.y - connectionPt.y);
                if (distA < skipRadius && distB < skipRadius) continue;

                const hit = this._segmentIntersect(la, lb, ca, cb);
                if (hit) {
                    // Frühester Treffer:
                    // Lead-In:  frühester = kleinster li, kleinster t (nächster zum Pierce)
                    // Lead-Out: frühester = größter li, größter t (nächster zum End-Punkt)
                    const isBetter = isLeadOut
                        ? (!bestHit || li > bestHit.li || (li === bestHit.li && hit.t > bestHit.t))
                        : (!bestHit || li < bestHit.li || (li === bestHit.li && hit.t < bestHit.t));

                    if (isBetter) {
                        bestHit = { li, t: hit.t, point: hit };
                    }
                }
            }
        }

        if (bestHit) {
            if (isLeadOut) {
                // Lead-Out: Behalte Anfang (Kontur-Anschluss) bis Schnittpunkt
                const newPoints = [];
                for (let i = 0; i <= bestHit.li; i++) {
                    newPoints.push(lPts[i]);
                }
                newPoints.push(bestHit.point);
                leadPath.points = newPoints;
                leadPath.endPoint = bestHit.point;
            } else {
                // Lead-In: Behalte Schnittpunkt bis Ende (Kontur-Anschluss)
                const newPoints = [bestHit.point];
                for (let i = bestHit.li + 1; i < lPts.length; i++) {
                    newPoints.push(lPts[i]);
                }
                leadPath.points = newPoints;
                leadPath.piercingPoint = bestHit.point;
            }
            leadPath.shortened = true;
        }

        return leadPath;
    }

    /**
     * Segment-Segment-Schnitt. Gibt Schnittpunkt mit t-Parameter zurück.
     */
    _segmentIntersect(a1, a2, b1, b2) {
        const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
        const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-10) return null;  // parallel

        const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
        const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

        if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
            return {
                x: a1.x + t * dx1,
                y: a1.y + t * dy1,
                t  // speichere t für Frühest-Vergleich
            };
        }
        return null;
    }

    // ════════════════════════════════════════════════════════════════
    // MULTI-KONTUR COLLISION DETECTION (V4.7)
    // Lead-In/Out gegen ALLE Nachbar-Konturen prüfen
    // ════════════════════════════════════════════════════════════════

    /**
     * Prüft Lead-In/Out gegen ALLE anderen Konturen (nicht nur eigene).
     * Kürzt Leads bei Kollision mit Nachbar-Konturen.
     * @param {CamContour[]} allContours - Alle Konturen im Arbeitsbereich
     * @param {number} [safetyMargin=0.5] - Mindestabstand zu Nachbar-Konturen (mm)
     */
    checkMultiContourCollision(allContours, safetyMargin = 0.5) {
        if (!allContours || allContours.length < 2) return false;

        // Nachbar-Konturen mit BBox vorfiltern (einmalig)
        const neighbors = this._getNeighborContours(allContours, safetyMargin);
        if (neighbors.length === 0) return false;

        // Lead-In prüfen — mit erweiterter Fallback-Kette
        let leadInModified = false;
        const leadIn = this.getLeadInPath();

        if (leadIn?.points?.length >= 2 && !leadIn.isFallbackCenterPierce) {
            const collision = this._checkLeadAgainstNeighbors(leadIn, neighbors, 'in', safetyMargin);
            if (collision) {
                // ── Strategy A: Startpunkt rotieren ──
                const rotated = this._tryRotateStartPoint(allContours, neighbors, safetyMargin);
                if (rotated) {
                    leadInModified = true;
                    // Lead-In nach Rotation neu holen und als rotiert markieren
                    const rotatedLead = this.getLeadInPath();
                    if (rotatedLead) rotatedLead.isRotated = true;
                    console.log(`[CamContour V5.3] Lead-Routing A: Startpunkt rotiert für ${this.name}`);
                } else {
                    // ── Strategy B: Dog-Leg Routing ──
                    const dogLeg = this._tryDogLegLeadIn(neighbors, safetyMargin);
                    if (dogLeg) {
                        this._cachedLeadInPath = dogLeg;
                        leadInModified = true;
                        console.log(`[CamContour V5.3] Lead-Routing B: Dog-Leg für ${this.name}`);
                    } else {
                        // Kein Routing möglich → konventionelles Shortening
                        for (const nb of neighbors) {
                            if (this._shortenLeadAgainstContour(leadIn, nb.pts, 'in', safetyMargin)) {
                                leadInModified = true;
                            }
                        }
                    }
                }
            }
        }

        // Lead-Out prüfen — nur konventionelles Shortening (kein Routing)
        let leadOutModified = false;
        const leadOut = this.getLeadOutPath();

        if (leadOut?.points?.length >= 2) {
            for (const nb of neighbors) {
                const leadBB = this._getBBox(leadOut.points);
                if (leadBB && this._bboxOverlap(leadBB, nb.bbox, safetyMargin)) {
                    if (this._shortenLeadAgainstContour(leadOut, nb.pts, 'out', safetyMargin)) {
                        leadOutModified = true;
                    }
                }
            }
        }

        const modified = leadInModified || leadOutModified;
        if (modified) {
            console.log(`[CamContour V5.3] Multi-Collision: Lead angepasst für ${this.name}`);
        }
        return modified;
    }

    // ════════════════════════════════════════════════════════════════
    // LEAD-ROUTING STRATEGIEN (V4.8)
    // ════════════════════════════════════════════════════════════════

    /**
     * Sammelt Nachbar-Konturen mit vorberechneter BBox + Kerf-Punkten.
     * BBox-Quick-Reject gegen eigene Kontur-BBox + Lead-Reichweite.
     */
    _getNeighborContours(allContours, margin) {
        const selfBB = this._getBBox(this.points);
        if (!selfBB) return [];

        // Suchradius: eigene BBox + maximale Lead-Länge + Margin
        const reach = Math.max(this.leadInLength, this.leadInRadius, this.leadOutLength, 10) + margin;
        const searchBB = {
            minX: selfBB.minX - reach, minY: selfBB.minY - reach,
            maxX: selfBB.maxX + reach, maxY: selfBB.maxY + reach
        };

        const neighbors = [];
        for (const other of allContours) {
            if (other === this || other.isReference) continue;
            const bbox = this._getBBox(other.points);
            if (!bbox) continue;
            if (!this._bboxOverlap(searchBB, bbox, 0)) continue;
            neighbors.push({
                contour: other,
                bbox,
                pts: other.getKerfOffsetPolyline()?.points || other.points
            });
        }
        return neighbors;
    }

    /**
     * Prüft ob ein Lead-Pfad mit irgendeiner Nachbar-Kontur kollidiert.
     * Gibt true zurück wenn Kollision gefunden.
     */
    _checkLeadAgainstNeighbors(leadPath, neighbors, direction, margin) {
        if (!leadPath?.points || leadPath.points.length < 2) return false;
        const leadBB = this._getBBox(leadPath.points);
        if (!leadBB) return false;

        for (const nb of neighbors) {
            if (!this._bboxOverlap(leadBB, nb.bbox, margin)) continue;
            if (this._leadIntersectsContour(leadPath.points, nb.pts, margin)) return true;
        }
        return false;
    }

    /**
     * Prüft ob Lead-Punkte eine Kontur schneiden oder zu nah kommen.
     * Wie _shortenLeadAgainstContour, aber ohne Mutation — nur Detection.
     */
    _leadIntersectsContour(leadPts, contourPts, margin) {
        // Intersection check
        for (let li = 0; li < leadPts.length - 1; li++) {
            const la = leadPts[li], lb = leadPts[li + 1];
            for (let ci = 0; ci < contourPts.length - 1; ci++) {
                if (this._segmentIntersect(la, lb, contourPts[ci], contourPts[ci + 1])) {
                    return true;
                }
            }
        }
        // Proximity check
        for (const p of leadPts) {
            for (let ci = 0; ci < contourPts.length - 1; ci++) {
                if (this._pointToSegDist(p, contourPts[ci], contourPts[ci + 1]) < margin) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Berechnet den minimalen Abstand aller Lead-Punkte zu allen Nachbar-Konturen.
     * Höherer Score = mehr Freiraum = bessere Position.
     * @param {Array} leadPts - Lead-In Punkte
     * @param {Array} neighbors - Nachbar-Konturen (aus _getNeighborContours)
     * @param {number} margin - Safety-Margin
     * @returns {number} Minimaler Abstand (Clearance-Score)
     */
    _calcClearanceScore(leadPts, neighbors, margin) {
        let minDist = Infinity;

        // Abstand zu allen Nachbar-Konturen
        for (const p of leadPts) {
            for (const nb of neighbors) {
                for (let i = 0; i < nb.pts.length - 1; i++) {
                    const d = this._pointToSegDist(p, nb.pts[i], nb.pts[i + 1]);
                    if (d < minDist) minDist = d;
                }
            }
        }

        // Selbst-Kollision: Lead vs. eigene Kontur (Skip nahe Startpunkt)
        const selfPts = this.getKerfOffsetPolyline()?.points || this.points;
        const skipRadius = Math.max(this.leadInLength, this.leadInRadius) * 0.15;
        const entry = leadPts[leadPts.length - 1]; // Letzter Punkt = Entry
        for (let i = 0; i < selfPts.length - 1; i++) {
            if (this._pointToSegDist(entry, selfPts[i], selfPts[i + 1]) < skipRadius) continue;
            for (const p of leadPts) {
                const d = this._pointToSegDist(p, selfPts[i], selfPts[i + 1]);
                if (d < minDist) minDist = d;
            }
        }

        return minDist;
    }

    /**
     * Strategy A: Startpunkt in 5°-Schritten rotieren.
     * Wählt die Position mit dem höchsten Clearance-Score (meister Freiraum).
     * Prüft zuerst Ecken (bevorzugte Positionen), dann gleichverteilt.
     */
    _tryRotateStartPoint(allContours, neighbors, margin) {
        if (!this.isClosed || !this.points || this.points.length < 4) return false;

        const n = this.points.length - 1; // Closed: letzter = erster
        const totalLen = this._pathLength(this.points);
        if (totalLen < 1) return false;

        // Originalzustand sichern
        const origPoints = this.points.map(p => ({ x: p.x, y: p.y }));
        const origRotation = this._rotationCount;

        // Kandidaten sammeln: erst Ecken, dann 5°-Schritte (= Umfangsanteile)
        const candidates = [];

        // Ecken als bevorzugte Kandidaten (Index > 0, da 0 = aktueller Startpunkt)
        const corners = typeof Geometry !== 'undefined' && Geometry.findCorners
            ? Geometry.findCorners(this.points, this.cornerAngleThreshold)
            : [];
        for (const c of corners) {
            if (c.index > 0 && c.index < n) candidates.push(c.index);
        }

        // Gleichverteilte Positionen (5°-Schritte → 72 Positionen)
        const step = Math.max(1, Math.round(n / 72));
        for (let i = step; i < n; i += step) {
            if (!candidates.includes(i)) candidates.push(i);
        }

        // Jeden Kandidaten testen — beste Position nach Clearance-Score wählen
        let bestIdx = -1;
        let bestScore = -Infinity;
        let bestPoints = null;
        let bestRotation = origRotation;

        for (const idx of candidates) {
            // Punkte rotieren
            const rotated = [];
            for (let i = 0; i < n; i++) {
                rotated.push(origPoints[(idx + i) % n]);
            }
            rotated.push({ x: rotated[0].x, y: rotated[0].y });
            this.points = rotated;
            this._rotationCount = origRotation + idx; // Eindeutiger Cache-Key
            this.invalidate();

            // Lead-In an neuer Position generieren und bewerten
            const testLead = this.getLeadInPath();
            if (testLead?.points?.length >= 2 && !testLead.isFallbackCenterPierce) {
                const score = this._calcClearanceScore(testLead.points, neighbors, margin);
                // Corner-Penalty + Flat-Segment-Bonus (V5.2)
                const isCorner = corners.some(c => c.index === idx);
                const flatBonus = this._calcFlatSegmentBonus(idx, origPoints, n);
                const adjustedScore = isCorner ? score * 0.4 : score * (1.0 + flatBonus);

                if (adjustedScore > bestScore && score > margin) {
                    bestScore = adjustedScore;
                    bestIdx = idx;
                    bestPoints = rotated.map(p => ({ x: p.x, y: p.y }));
                    bestRotation = this._rotationCount;
                }
            }
        }

        if (bestIdx >= 0) {
            this.points = bestPoints;
            this._rotationCount = bestRotation;
            this.invalidate();
            this.startPointIndex = 0;
            console.log(`[CamContour V5.3] Clearance-Scored: idx=${bestIdx}, score=${bestScore.toFixed(1)}mm`);
            return true;
        }

        // Keine Position mit ausreichendem Clearance → Original wiederherstellen
        this.points = origPoints;
        this._rotationCount = origRotation;
        this.invalidate();
        return false;
    }

    /**
     * Strategy B: Dog-Leg Lead-In mit Waypoint auf der Verschnittseite.
     * Erstellt einen geknickten Pfad: Pierce → Waypoint → Entry.
     * Der Waypoint liegt seitlich versetzt auf der Abfallseite.
     */
    _tryDogLegLeadIn(neighbors, margin) {
        if (!this.isClosed) return null;

        const pts = this.getKerfOffsetPolyline()?.points || this.points;
        if (!pts || pts.length < 3) return null;

        const entry = pts[0];
        const next = pts[1];
        const dx = next.x - entry.x, dy = next.y - entry.y;
        const tLen = Math.hypot(dx, dy);
        if (tLen < 1e-6) return null;
        const tangent = { x: dx / tLen, y: dy / tLen };
        const normal = this._getWasteSideNormal(entry, tangent);

        const leadLen = this.leadInLength;

        // Verschiedene Dog-Leg-Konfigurationen testen:
        // Winkel (15°, 30°, 45°, 60°) × Seite (links/rechts relativ zur Normalen)
        const angles = [30, 45, 15, 60];
        const sides = [1, -1]; // 1 = normal, -1 = gespiegelt

        for (const angleDeg of angles) {
            for (const side of sides) {
                const angleRad = angleDeg * Math.PI / 180;

                // Waypoint: Lead-Länge in Normalenrichtung + seitlicher Versatz
                const cosA = Math.cos(angleRad);
                const sinA = Math.sin(angleRad);

                // Richtung: Normale rotiert um angleDeg
                const dirX = normal.x * cosA + side * tangent.x * sinA;
                const dirY = normal.y * cosA + side * tangent.y * sinA;

                const waypoint = {
                    x: entry.x + dirX * leadLen * 0.6,
                    y: entry.y + dirY * leadLen * 0.6
                };

                // Pierce-Punkt: Von Waypoint weiter in Normalenrichtung
                const pierce = {
                    x: waypoint.x + normal.x * leadLen * 0.4,
                    y: waypoint.y + normal.y * leadLen * 0.4
                };

                const testPoints = [pierce, waypoint, entry];

                // Kollisionscheck gegen alle Nachbarn
                let collision = false;
                for (const nb of neighbors) {
                    if (this._leadIntersectsContour(testPoints, nb.pts, margin)) {
                        collision = true;
                        break;
                    }
                }

                // Auch gegen eigene Kontur prüfen
                if (!collision) {
                    collision = this._leadIntersectsContour(testPoints, pts, margin);
                }

                if (!collision) {
                    return {
                        points: testPoints,
                        piercingPoint: pierce,
                        entryPoint: entry,
                        type: 'dog_leg',
                        dogLegAngle: angleDeg,
                        shortened: false,
                        multiContourCollision: false,
                        isAlternative: true
                    };
                }
            }
        }
        return null; // Kein Dog-Leg möglich
    }

    /**
     * Kürzt einen Lead-Pfad bei Schnitt mit einer Nachbar-Kontur.
     */
    _shortenLeadAgainstContour(leadPath, contourPts, direction, margin) {
        if (!leadPath?.points || leadPath.points.length < 2) return false;
        if (!contourPts || contourPts.length < 3) return false;

        const lPts = leadPath.points;
        let bestHit = null;
        const isOut = (direction === 'out');

        for (let li = 0; li < lPts.length - 1; li++) {
            const la = lPts[li], lb = lPts[li + 1];

            for (let ci = 0; ci < contourPts.length - 1; ci++) {
                const ca = contourPts[ci], cb = contourPts[ci + 1];
                const hit = this._segmentIntersect(la, lb, ca, cb);
                if (hit) {
                    const isBetter = isOut
                        ? (!bestHit || li > bestHit.li || (li === bestHit.li && hit.t > bestHit.t))
                        : (!bestHit || li < bestHit.li || (li === bestHit.li && hit.t < bestHit.t));
                    if (isBetter) {
                        bestHit = { li, t: hit.t, point: hit };
                    }
                }
            }
        }

        if (!bestHit) {
            // Proximity Check: Lead-Punkt zu nah an Kontur?
            for (let i = 0; i < lPts.length; i++) {
                const p = lPts[i];
                for (let ci = 0; ci < contourPts.length - 1; ci++) {
                    const dist = this._pointToSegDist(p, contourPts[ci], contourPts[ci + 1]);
                    if (dist < margin) {
                        // Behandeln wie Kollision am nächsten Punkt
                        bestHit = { li: Math.max(0, i - 1), t: 0.5, point: { x: p.x, y: p.y } };
                        break;
                    }
                }
                if (bestHit) break;
            }
        }

        if (bestHit) {
            if (isOut) {
                const newPts = [];
                for (let i = 0; i <= bestHit.li; i++) newPts.push(lPts[i]);
                newPts.push(bestHit.point);
                leadPath.points = newPts;
                leadPath.endPoint = bestHit.point;
            } else {
                const newPts = [bestHit.point];
                for (let i = bestHit.li + 1; i < lPts.length; i++) newPts.push(lPts[i]);
                leadPath.points = newPts;
                leadPath.piercingPoint = bestHit.point;
            }
            leadPath.shortened = true;
            leadPath.multiContourCollision = true;
            return true;
        }
        return false;
    }

    /** Punkt-zu-Segment Distanz */
    _pointToSegDist(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-10) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    /** Bounding-Box eines Punkt-Arrays */
    _getBBox(pts) {
        if (!pts || pts.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    }

    /** BBox-Overlap mit Margin */
    _bboxOverlap(a, b, margin = 0) {
        return !(a.maxX + margin < b.minX || a.minX - margin > b.maxX ||
                 a.maxY + margin < b.minY || a.minY - margin > b.maxY);
    }

    /**
     * Statische Methode: Multi-Collision für ALLE Konturen auf einmal.
     * Aufrufen in Pipeline/App nach Kerf-Offset + Lead-Berechnung.
     */
    static checkAllCollisions(contours, safetyMargin = 0.5) {
        let totalModified = 0;
        for (const c of contours) {
            if (c.isReference) continue;
            if (c.checkMultiContourCollision(contours, safetyMargin)) {
                totalModified++;
            }
        }
        if (totalModified > 0) {
            console.log(`[CamContour V5.3] Lead-Routing: ${totalModified}/${contours.length} Leads angepasst`);
        }
        return totalModified;
    }

    // ════════════════════════════════════════════════════════════════
    // STARTPUNKT
    // ════════════════════════════════════════════════════════════════

    setStartPoint(worldPoint) {
        if (!this.isClosed || !this.points || this.points.length < 4) return;

        const result = Geometry.closestPointOnPolyline(worldPoint, this.points);
        if (!result) return;

        const n = this.points.length - 1; // Letzter = erster bei closed
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < n; i++) {
            const d = Math.hypot(
                this.points[i].x - result.point.x,
                this.points[i].y - result.point.y
            );
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        if (bestIdx === 0) return;

        const rotated = [];
        for (let i = 0; i < n; i++) {
            rotated.push(this.points[(bestIdx + i) % n]);
        }
        rotated.push({ x: rotated[0].x, y: rotated[0].y });
        this.points = rotated;
        this.startPointIndex = 0;
        this._rotationCount++;

        this.invalidate();
    }

    autoPlaceStartPoint(allContours) {
        if (!this.isClosed) return;

        const n = this.points.length - 1; // Closed: letzter = erster
        if (n < 4) return;

        const corners = Geometry.findCorners(this.points, this.cornerAngleThreshold);

        // Kandidaten sammeln: Ecken + gleichverteilte Positionen (alle 5°)
        const candidates = [];
        for (const c of corners) {
            if (c.index > 0 && c.index < n) candidates.push({ index: c.index, isCorner: true });
        }
        const step = Math.max(1, Math.round(n / 72));
        for (let i = step; i < n; i += step) {
            if (!candidates.some(c => c.index === i)) {
                candidates.push({ index: i, isCorner: false });
            }
        }

        if (candidates.length === 0) return;

        const origPoints = this.points.map(p => ({ x: p.x, y: p.y }));
        const origRotation = this._rotationCount;

        // Nachbarn für Clearance-Scoring (falls vorhanden)
        const neighbors = (allContours && allContours.length >= 2)
            ? this._getNeighborContours(allContours, 0.5)
            : [];

        let bestIdx = -1;
        let bestScore = -Infinity;
        let bestPoints = null;
        let bestRotation = origRotation;

        for (const cand of candidates) {
            // Punkte rotieren
            const rotated = [];
            for (let i = 0; i < n; i++) {
                rotated.push(origPoints[(cand.index + i) % n]);
            }
            rotated.push({ x: rotated[0].x, y: rotated[0].y });
            this.points = rotated;
            this._rotationCount = origRotation + cand.index;
            this.invalidate();

            const testLead = this.getLeadInPath();
            if (testLead?.points?.length >= 2 && !testLead.isFallbackCenterPierce) {
                // Clearance-Score (mit oder ohne Nachbarn)
                const clearance = neighbors.length > 0
                    ? this._calcClearanceScore(testLead.points, neighbors, 0.5)
                    : 100; // Ohne Nachbarn: kein Clearance-Limit

                // Flat-Segment-Bonus (V5.3): bevorzugt gerade Strecken
                const flatBonus = this._calcFlatSegmentBonus(cand.index, origPoints, n);

                // Corner-Penalty: Ecken werden abgewertet (×0.4)
                const adjustedScore = cand.isCorner
                    ? clearance * 0.4
                    : clearance * (1.0 + flatBonus);

                if (adjustedScore > bestScore) {
                    bestScore = adjustedScore;
                    bestIdx = cand.index;
                    bestPoints = rotated.map(p => ({ x: p.x, y: p.y }));
                    bestRotation = this._rotationCount;
                }
            }
        }

        if (bestIdx >= 0) {
            this.points = bestPoints;
            this._rotationCount = bestRotation;
            this.invalidate();
            this.startPointIndex = 0;
            console.debug(`[CamContour V5.3] autoPlace: idx=${bestIdx}, score=${bestScore.toFixed(1)}, flat-preferred`);
        } else {
            // Fallback: Original wiederherstellen
            this.points = origPoints;
            this._rotationCount = origRotation;
            this.invalidate();
        }
    }

    // ════════════════════════════════════════════════════════════════
    // CACHE + UTILS
    // ════════════════════════════════════════════════════════════════

    invalidate() {
        this._cachedKerfPolyline = null;
        this._cacheKey = null;
        this._cachedLeadInPath = null;
        this._cachedLeadOutPath = null;
        this._cachedOvercutPath = null;
        this.compensationSkipped = false;
    }

    get polyline() {
        const offsetResult = this.getKerfOffsetPolyline();
        if (!offsetResult || !offsetResult.points || offsetResult.points.length === 0) {
            return { points: this.points, isClockwise: Geometry.isClockwise(this.points) };
        }
        return { points: offsetResult.points, isClockwise: Geometry.isClockwise(offsetResult.points), flipped: offsetResult.flipped || false };
    }

    getCentroid() { return Geometry.centroid(this.points); }
    getBoundingBox() { return Geometry.boundingBox(this.points); }
    getArea() { return Math.abs(Geometry.getSignedArea(this.points)); }

    /** V4.5: Fläche in cm² (Vorbereitung Flächenklassen Phase 4) */
    getAreaCm2() { return this.getArea() / 100; }

    // ════════════════════════════════════════════════════════════════
    // PIERCING TYPE → R923-Wert (B.1)
    // ════════════════════════════════════════════════════════════════

    /** Gibt den R923-Wert für diesen Piercing-Typ zurück (Sinumerik 840D) */
    getPiercingR923() {
        const MAP = {
            'air_start':     0,
            'auto':          1,
            'pierce_linear': 1,
            'stationary':    2,
            'circular':      3,
            'drilling':      4,
            'blind':         9
        };
        return MAP[this.piercingType] ?? 1;
    }

    // ════════════════════════════════════════════════════════════════
    // FLÄCHENKLASSEN (B.3)
    // ════════════════════════════════════════════════════════════════

    /**
     * Gibt die passende Flächenklasse für diese Kontur zurück.
     * Nur für Innen-Konturen (hole). Scheiben = null.
     *
     * @param {Array} areaClasses - Array von 6 Klassen:
     *   { maxAreaCm2, leadType, leadLength, leadRadius, leadAngle,
     *     overcut, piercingType, enabled }
     * @returns {Object|null} Passende Klasse oder null
     */
    getMatchingAreaClass(areaClasses) {
        if (this.cuttingMode !== 'hole') return null;
        if (!areaClasses || !Array.isArray(areaClasses)) return null;
        const areaCm2 = this.getAreaCm2();

        // Klassen sind nach maxAreaCm2 aufsteigend sortiert
        // Die erste Klasse die passt (areaCm2 <= maxAreaCm2) wird verwendet
        for (const cls of areaClasses) {
            if (!cls.enabled) continue;
            if (areaCm2 <= cls.maxAreaCm2) return cls;
        }
        return null; // Keine Klasse passt (größer als alle Maxima)
    }

    /**
     * Wendet eine Flächenklasse auf diese Kontur an.
     * Setzt Lead-Parameter basierend auf Flächenklasse.
     * @param {Object} cls - Flächenklasse aus getMatchingAreaClass()
     */
    applyAreaClass(cls) {
        if (!cls) return false;
        console.log(`[CamContour B.3] Flächenklasse angewendet: ${this.name}, Fläche=${this.getAreaCm2().toFixed(2)}cm², maxArea=${cls.maxAreaCm2}cm²`);

        if (cls.leadType)   this.leadInType   = cls.leadType;
        if (cls.leadLength !== undefined) this.leadInLength  = cls.leadLength;
        if (cls.leadRadius !== undefined) this.leadInRadius  = cls.leadRadius;
        if (cls.leadAngle  !== undefined) this.leadInAngle   = cls.leadAngle;
        if (cls.overcut    !== undefined) this.overcutLength = cls.overcut;
        if (cls.piercingType) this.piercingType = cls.piercingType;

        this.areaClassApplied = true;
        this.invalidate();
        return true;
    }

    /**
     * Standard-Flächenklassen nach CeraCUT Kap. 6.2 / IGEMS Handbuch.
     * Kann überschrieben werden durch user-Einstellungen in settings.areaClasses.
     */
    static defaultAreaClasses() {
        return [
            { maxAreaCm2: 1,    enabled: true, leadType: 'linear', leadLength: 2.0, leadRadius: 0,   leadAngle: 90, overcut: 0.5, piercingType: 'blind',   label: '< 1 cm²' },
            { maxAreaCm2: 4,    enabled: true, leadType: 'linear', leadLength: 4.0, leadRadius: 0,   leadAngle: 90, overcut: 1.0, piercingType: 'auto',    label: '1–4 cm²' },
            { maxAreaCm2: 10,   enabled: true, leadType: 'arc',    leadLength: 5.0, leadRadius: 2.0, leadAngle: 90, overcut: 1.0, piercingType: 'auto',    label: '4–10 cm²' },
            { maxAreaCm2: 25,   enabled: true, leadType: 'arc',    leadLength: 8.0, leadRadius: 3.0, leadAngle: 90, overcut: 1.0, piercingType: 'auto',    label: '10–25 cm²' },
            { maxAreaCm2: 100,  enabled: true, leadType: 'arc',    leadLength: 12.0,leadRadius: 4.0, leadAngle: 90, overcut: 1.5, piercingType: 'auto',    label: '25–100 cm²' },
            { maxAreaCm2: 9999, enabled: true, leadType: 'arc',    leadLength: 15.0,leadRadius: 5.0, leadAngle: 90, overcut: 1.5, piercingType: 'auto',    label: '> 100 cm²' }
        ];
    }

    // ════════════════════════════════════════════════════════════════
    // DYNAMIC LEAD RESOLUTION (B.2)
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet die effektive Lead-In-Länge für Dynamic Lead (B.2).
     * Findet den maximalen Platz ab Entry-Punkt ohne Kollision (binomial search),
     * klemmt dann auf [leadInLengthMin, leadInLengthMax].
     *
     * Wird automatisch in getLeadInPath() gerufen wenn leadInDynamic=true.
     */
    _calcDynamicLeadLength(entry, tangent, normal, contourPts) {
        const MIN = this.leadInLengthMin;
        const MAX = this.leadInLengthMax;
        const origLen = this.leadInLength;

        // Binäre Suche: Maximal mögliche Länge ohne Kollision
        let lo = MIN, hi = MAX, best = MIN;
        for (let iter = 0; iter < 8; iter++) {  // 8 Iterationen = ~1% Genauigkeit
            const mid = (lo + hi) / 2;
            this.leadInLength = mid;
            const testPath = this.leadInType === 'arc'
                ? this._calcArcLeadIn(entry, tangent, normal)
                : this._calcLinearLeadIn(entry, tangent, normal);
            const shortened = this._shortenLeadIfCollision({ ...testPath, points: [...testPath.points] }, contourPts);
            if (!shortened.shortened) {
                best = mid;
                lo = mid;  // Vergrößern
            } else {
                hi = mid;  // Verkleinern
            }
        }

        this.leadInLength = origLen;  // Restore
        const dynamicLen = Math.max(MIN, Math.min(MAX, best));
        console.log(`[CamContour B.2] Dynamic Lead: ${this.name}, L=${dynamicLen.toFixed(2)}mm (min=${MIN}, max=${MAX})`);
        return dynamicLen;
    }

    /** V4.5: Gibt das aktive Lead-Set als Debug-Info zurück */
    getLeadSetInfo() {
        return {
            cuttingMode: this.cuttingMode,
            isInternal: this.cuttingMode === 'hole',
            leadInType: this.leadInType,
            leadInLength: this.leadInLength,
            leadInRadius: this.leadInRadius,
            leadInAngle: this.leadInAngle,
            leadOutLength: this.leadOutLength,
            overcutLength: this.overcutLength,
            piercingType: this.piercingType,
            piercingR923: this.getPiercingR923(),
            areaCm2: this.getAreaCm2(),
            areaClassApplied: this.areaClassApplied,
            leadInDynamic: this.leadInDynamic,
            altLeadEnabled:   this.altLeadEnabled,
            altLeadType:      this.altLeadType,
            altLeadInLength:  this.altLeadInLength,
            altLeadInAngle:   this.altLeadInAngle,
            altLeadOutLength: this.altLeadOutLength,
            altOvercutLength: this.altOvercutLength
        };
    }

    /** V4.5: Deep-Clone inkl. aller Lead-Properties */
    clone() {
        const pts = this.points.map(p => ({ ...p }));
        const c = new CamContour(pts, {
            name: this.name,
            cuttingMode: this.cuttingMode,
            kerfWidth: this.kerfWidth,
            quality: this.quality,
            layer: this.layer,
            isReference: this.isReference,
            type: this.type,
            leadInType: this.leadInType,
            leadInLength: this.leadInLength,
            leadInRadius: this.leadInRadius,
            leadInAngle: this.leadInAngle,
            leadOutType: this.leadOutType,
            leadOutLength: this.leadOutLength,
            leadOutRadius: this.leadOutRadius,
            leadOutAngle: this.leadOutAngle,
            overcutLength: this.overcutLength,
            piercingType: this.piercingType,
            preferCorners: this.preferCorners,
            cornerAngleThreshold: this.cornerAngleThreshold,
            altLeadEnabled:   this.altLeadEnabled,
            altLeadType:      this.altLeadType,
            altLeadInLength:  this.altLeadInLength,
            altLeadInAngle:   this.altLeadInAngle,
            altLeadOutLength: this.altLeadOutLength,
            altOvercutLength: this.altOvercutLength,
            // B.1 Piercing (piercingType bereits oben gesetzt)
            piercingStationaryTime:  this.piercingStationaryTime,
            piercingCircularRadius:  this.piercingCircularRadius,
            piercingCircularTime:    this.piercingCircularTime,
            // B.2 Dynamic Lead
            leadInDynamic:   this.leadInDynamic,
            leadInLengthMin: this.leadInLengthMin,
            leadInLengthMax: this.leadInLengthMax
        });
        c.kerfSide = this.kerfSide;
        c.leadManualOverride = this.leadManualOverride;
        c.areaClassApplied = this.areaClassApplied;
        c.kerfFlipped = this.kerfFlipped;
        c.isClosed = this.isClosed;
        c.isSelected = false;
        c.microjoints = this.microjoints ? this.microjoints.map(j => ({ ...j })) : [];
        c._rotationCount = this._rotationCount;
        c.nestingLevel = this.nestingLevel;  // V5.2: Intarsien braucht Nesting-Level
        c.hatch = this.hatch ? { ...this.hatch } : null;
        c.isHatchContour = this.isHatchContour;  // V5.6: Hatch-Entity
        c.parentContourName = this.parentContourName;
        c.materialGroup = this.materialGroup;    // V5.5: Multi-Material
        c.intarsiaRole = this.intarsiaRole;      // V5.5: base/insert
        c.gaps = this.gaps.map(g => ({ ...g }));           // V5.7: Gap Detection
        c.healedGaps = this.healedGaps.map(g => ({ ...g })); // V5.7: Gap Detection
        return c;
    }

    isNearPoint(point, tolerance = 5) {
        if (!point || !this.points || this.points.length < 2) return false;
        const result = Geometry.closestPointOnPolyline(point, this.points);
        return result && result.distance <= tolerance;
    }

    getCornersForLooping() { return []; }

    /**
     * Kerf-Seite umkehren (Kompensation flippen)
     * Loch: normalerweise innen -> flippt nach außen
     * Scheibe: normalerweise außen -> flippt nach innen
     */
    toggleKerfSide() {
        this.kerfFlipped = !this.kerfFlipped;
        this.invalidate();
    }
}

CamContour.nextId = 1;

if (typeof module !== 'undefined' && module.exports) { module.exports = CamContour; }
