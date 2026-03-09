/**
 * WARICAM CamContour V4.6 - IGEMS-konformes Lead-In/Out System
 * Small-Hole: Center-Pierce bei kleinen RUNDEN Bohrungen (Aspekt < 2.5:1)
 * Corner-Lead: linear bei Ecken, Arc bei Segmenten
 * Collision-Detection V2: Distance-based, Lead-In/Out-aware, Fallback
 * Kerf-Flip, Auto-Shorten bei Kontur-Schnitt
 * V4.5: Außen/Innen-Lead Differenzierung, clone(), IGEMS 4-Slot Fallback-Kette
 * V4.6: Alternativ-Lead Property-Rename (altLeadInLength/Angle/OutLength/Overcut)
 * Last Modified: 2026-02-17 UTC
 */

class CamContour {
    constructor(points, options = {}) {
        this.points = points || [];
        this.name = options.name || `Contour_${CamContour.nextId++}`;
        this.cuttingMode = options.cuttingMode || null;  // 'disc' | 'hole' | null
        this.kerfWidth = options.kerfWidth || 0.8;
        this.kerfSide = 'left';
        this.quality = options.quality || 2;
        this.isClosed = this._detectClosed();
        this.layer = options.layer || '';
        this.isReference = options.isReference || false;
        this.type = options.type || null;

        // ═══ LEAD-IN Parameter (IGEMS-konform) ═══
        this.leadInType = options.leadInType || 'arc';       // 'arc' | 'linear' | 'tangent' | 'on_geometry'
        this.leadInLength = options.leadInLength || 4.0;
        this.leadInRadius = options.leadInRadius || 2.0;
        this.leadInAngle = options.leadInAngle || 90;

        // ═══ LEAD-OUT Parameter ═══
        this.leadOutType = options.leadOutType || 'arc';
        this.leadOutLength = options.leadOutLength || 4.0;
        this.leadOutRadius = options.leadOutRadius || 2.0;
        this.leadOutAngle = options.leadOutAngle || 90;

        // ═══ OVERCUT (kann auch negativ sein) ═══
        this.overcutLength = options.overcutLength || 1.0;

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
        if (isNaN(Area_Trial) || Area_Trial === 0) {
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
        if (Area_Final / Area_Original < 0.01) {
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
        let nx = -tangent.y;
        let ny = tangent.x;

        const centroid = Geometry.centroid(this.points);
        const toCenterX = centroid.x - point.x;
        const toCenterY = centroid.y - point.y;
        const dot = nx * toCenterX + ny * toCenterY;

        const isHole = this.cuttingMode === 'hole';

        if (isHole) {
            if (dot < 0) { nx = -nx; ny = -ny; }
        } else {
            if (dot > 0) { nx = -nx; ny = -ny; }
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
        const t = dist > 0.001 ? Math.min(1.0, (dist * 0.5) / dist) : 0;
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
        if (this.leadInDynamic) {
            const dynLen = this._calcDynamicLeadLength(entry, tangent, normal, pts);
            this.leadInLength = dynLen;  // temporär setzen — wird nach getLeadInPath() nicht gecacht
        }

        // CORNER DETECTION: An Ecken immer Linear, kein Arc
        const cornerAngle = this._isAtCorner(pts);
        let effectiveType = this.leadInType;
        if (cornerAngle > 0 && effectiveType === 'arc') {
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
                    console.log(`[CamContour V4.5] Alternativ-Lead verwendet: ${this.name} (primary=${primaryLen.toFixed(1)}mm < 40% von ${requestedLen}mm)`);
                }
            }
        }

        // V4.5: Letzter Fallback — Center-Pierce wenn Lead immer noch stark kollidiert
        if (leadPath?.shortened && this.altLeadEnabled) {
            const finalLen = this._pathLength(leadPath.points);
            if (finalLen < 0.5) {
                leadPath = this._calcCenterPierceLeadIn(entry, pts);
                leadPath.isFallbackCenterPierce = true;
                console.log(`[CamContour V4.5] Center-Pierce Fallback: ${this.name} (kein Lead passt)`);
            }
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
     * V4.5: IGEMS Slot 4 — Alternativ-Lead-In berechnen.
     * Sichert/restauriert Primär-Parameter, verwendet Alt-Parameter temporär.
     * Typisch: Linear, kurz (3mm), flacher Winkel (5°) — Blind-Lead-Stil.
     */
    _tryAlternativeLeadIn(entry, tangent, normal, contourPts) {
        console.time('[CamContour V4.5] _tryAlternativeLeadIn');
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
        this.leadInRadius = 0;  // IGEMS Blind Lead: kein Radius
        this.leadInAngle = this.altLeadInAngle;

        let altPath;
        if (this.altLeadType === 'arc' && this.altLeadInLength > 0) {
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
        console.timeEnd('[CamContour V4.5] _tryAlternativeLeadIn');
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

        // SMALL HOLE: Kein Overcut bei kleinen Bohrungen
        if (this._isSmallHole(checkPts)) return null;

        const atCorner = this._isAtCorner(checkPts) > 0;

        const overcutLen = atCorner ? 0 : this.overcutLength;
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

        // 3. CORNER DETECTION: An Ecken Linear erzwingen
        const cornerAngle = this._isAtCorner(pts);
        let effectiveType = this.leadOutType;
        if (cornerAngle > 0 && effectiveType === 'arc') {
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

    autoPlaceStartPoint() {
        if (!this.isClosed || !this.preferCorners) return;

        const corners = Geometry.findCorners(this.points, this.cornerAngleThreshold);
        if (corners.length === 0) return;

        // Schärfste Ecke wählen
        corners.sort((a, b) => b.angle - a.angle);
        const best = corners[0];

        if (best.index > 0) {
            this.setStartPoint(best.point);
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
        if (!cls) return;
        console.log(`[CamContour B.3] Flächenklasse angewendet: ${this.name}, Fläche=${this.getAreaCm2().toFixed(2)}cm², maxArea=${cls.maxAreaCm2}cm²`);

        if (cls.leadType)   this.leadInType   = cls.leadType;
        if (cls.leadLength !== undefined) this.leadInLength  = cls.leadLength;
        if (cls.leadRadius !== undefined) this.leadInRadius  = cls.leadRadius;
        if (cls.leadAngle  !== undefined) this.leadInAngle   = cls.leadAngle;
        if (cls.overcut    !== undefined) this.overcutLength = cls.overcut;
        if (cls.piercingType) this.piercingType = cls.piercingType;

        this.areaClassApplied = true;
        this.invalidate();
    }

    /**
     * Standard-Flächenklassen nach WARICAM Kap. 6.2 / IGEMS Handbuch.
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
        console.time('[CamContour B.2] _calcDynamicLeadLength');
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
        console.timeEnd('[CamContour B.2] _calcDynamicLeadLength');
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
            // B.1 Piercing
            piercingType:            this.piercingType,
            piercingStationaryTime:  this.piercingStationaryTime,
            piercingCircularRadius:  this.piercingCircularRadius,
            piercingCircularTime:    this.piercingCircularTime,
            // B.2 Dynamic Lead
            leadInDynamic:   this.leadInDynamic,
            leadInLengthMin: this.leadInLengthMin,
            leadInLengthMax: this.leadInLengthMax
        });
        c.kerfSide = this.kerfSide;
        c.areaClassApplied = this.areaClassApplied;
        c.kerfFlipped = this.kerfFlipped;
        c.isClosed = this.isClosed;
        c.isSelected = false;
        c.microjoints = this.microjoints ? this.microjoints.map(j => ({ ...j })) : [];
        c._rotationCount = this._rotationCount;
        c.nestingLevel = this.nestingLevel;  // V5.2: Intarsien braucht Nesting-Level
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
