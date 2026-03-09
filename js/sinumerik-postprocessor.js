/**
 * WARICAM/CeraCAM Sinumerik 840D Postprozessor V1.0
 *
 * Erzeugt CNC-Code im MPF-Format für Sinumerik 840D Steuerungen.
 * Format-Vorlage: 7 echte CNC-Referenzdateien (KERNKREIS, ERBEN, SCHWEDEN, etc.)
 *
 * Dateistruktur (3-in-1):
 *   %_N_{NAME}_MPF          - Hauptprogramm (Header, Plattendaten)
 *   %_N_PARAMETER_SPF       - Technologie (R-Parameter, dynamisch aus CeraJet-Engine)
 *   %_N_PART1_SPF           - Geometrie (alle Konturen)
 *
 * Kerf-Modus: "Calculated in Controller" (G41/G42)
 * Koordinaten = Teile-Geometrie (nicht offset)
 *
 * V1.1: Dynamische R-Parameter via CeraJetEngine.toRParameters()
 * V1.3: Multi-Head Support, Machine-Profile Integration
 *
 * Last Modified: 2026-03-09
 * Build: 20260309-multihead
 */

class SinumerikPostprocessor {

    static VERSION = '1.3';

    constructor(options = {}) {
        // ═══ Formatierung ═══
        this.coordDecimals = options.coordDecimals ?? 3;    // Koordinaten: 3 Nachkommastellen
        this.feedDecimals = options.feedDecimals ?? 0;      // Vorschub: ganzzahlig (mm/min)

        // ═══ Speed-Ramping ═══
        this.speedFactorNormal = options.speedFactorNormal ?? 0.69;
        this.speedFactorSmallHole = options.speedFactorSmallHole ?? 0.20;
        this.smallHoleThreshold = options.smallHoleThreshold ?? 15;  // mm Radius

        // ═══ Arc-Fitting ═══
        this.useArcFitting = options.useArcFitting ?? true;
        this.arcTolerance = options.arcTolerance ?? 0.01;   // mm

        // ═══ Multi-Head (V1.3) ═══
        this.headCount = options.headCount ?? 1;           // Anzahl Schneidköpfe
        this.headSpacing = options.headSpacing ?? 0;       // Abstand zwischen Köpfen (mm)
        this.headAxis = options.headAxis ?? 'Y';           // Achse für Kopfabstand (X oder Y)

        // ═══ Machine Profile (V1.3) ═══
        this.machineProfile = options.machineProfile ?? null;  // MachineProfiles Objekt

        // ═══ Interner State ═══
        this._lineNum = 0;
        this._warnings = [];
    }

    // ════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ════════════════════════════════════════════════════════════════

    /**
     * Erzeugt eine vollständige CNC-Datei.
     *
     * @param {CamContour[]} contours - Alle Konturen (inkl. Referenz)
     * @param {number[]} cutOrder - Indizes in contours[] (Schneidreihenfolge)
     * @param {Object} settings - Einstellungen
     * @param {string} settings.planName - Name des Schneidplans (z.B. 'KERNKREIS')
     * @param {string} [settings.material] - Materialbezeichnung
     * @param {string} [settings.tafelName] - Tafel/Kommission
     * @param {number} [settings.dicke] - Materialdicke in mm
     * @param {Object} [settings.technologyParams] - R-Parameter aus CeraJetEngine.toRParameters()
     * @returns {{ code: string, warnings: string[], stats: Object }}
     */
    generate(contours, cutOrder, settings = {}) {
        this._lineNum = 0;
        this._warnings = [];

        const planName = (settings.planName || 'UNNAMED').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const material = settings.material || 'AALLGEMEIN';
        const tafelName = settings.tafelName || planName;
        const dicke = settings.dicke || 8.0;
        const rp = settings.technologyParams || {};

        // Schneidbare Konturen in Reihenfolge sammeln
        const cuttable = cutOrder
            .map(idx => contours[idx])
            .filter(c => c && !c.isReference);

        if (cuttable.length === 0) {
            this._warnings.push('Keine schneidbaren Konturen gefunden');
            return { code: '', warnings: this._warnings, stats: {} };
        }

        // Plattengröße aus Referenzkontur oder Bounding-Box
        const plate = this._getPlateSize(contours);

        // Zusammenbauen
        let code = '';
        code += this._generateMPFHeader(planName, material, tafelName, plate, dicke);
        code += ' \n';
        code += this._generateParameterSPF(planName, rp);
        code += ' \n';
        code += this._generatePartSPF(planName, tafelName, cuttable);

        // Statistiken
        const stats = {
            contours: cuttable.length,
            planName,
            fileSize: code.length,
            warnings: this._warnings.length
        };

        console.log(`[PP V${SinumerikPostprocessor.VERSION}] Generiert: ${planName}.CNC — ${cuttable.length} Konturen, ${code.split('\n').length} Zeilen`);

        return { code, warnings: [...this._warnings], stats };
    }

    /**
     * Gibt den CNC-Code als Download-Blob zurück.
     */
    generateDownload(contours, cutOrder, settings = {}) {
        const result = this.generate(contours, cutOrder, settings);
        if (!result.code) return null;

        const planName = (settings.planName || 'UNNAMED').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const blob = new Blob([result.code], { type: 'text/plain;charset=utf-8' });
        const filename = `${planName}.CNC`;

        return { blob, filename, ...result };
    }

    // ════════════════════════════════════════════════════════════════
    // MPF HEADER (Hauptprogramm)
    // ════════════════════════════════════════════════════════════════

    _generateMPFHeader(planName, material, tafelName, plate, dicke) {
        const flaecheQM = ((plate.width * plate.height) / 1e6).toFixed(2);
        const maxVerfahrweg = Math.max(plate.width, plate.height).toFixed(2);

        return [
            `%_N_${planName}_MPF`,
            `;$PATH=/_N_WKS_DIR/_N_${planName}_WPD`,
            'DEF REAL VEND',
            'DEF REAL VAKT',
            'DEF INT  KOPF_ANZAHL',
            'DEF INT  KOPF_ABSTAND',
            `MSG("PLANNAME           :${planName}")`,
            `;MATERIAL           :${material}`,
            `;TAFELNAME          :${tafelName}`,
            `;LAENGE          MM :${plate.width.toFixed(2)}`,
            `;BREITE          MM :${plate.height.toFixed(2)}`,
            `;DICKE           MM :${dicke.toFixed(2)}`,
            `;PLATTENFLAECHE  QM :${flaecheQM}`,
            `;RESTPLATTENFLAECHE :0.00`,
            ' ',
            `R500=${maxVerfahrweg}`,
            `R501=${maxVerfahrweg}`,
            `R611=${plate.width.toFixed(2)}`,
            `R612=${plate.height.toFixed(2)}`,
            `R613=${dicke.toFixed(2)}`,
            'N1 $P_IFRAME=$P_UIFR[R910]',
            'N2 R200=0',
            'N3 G90 G00',
            'N4 L210',
            'N5 X0 Y0',
            'N6 $P_PFRAME=CSCALE(X,R911,Y,R911)',
            'N7 R915=4',
            'N8 PARAMETER',
            'R696=0',
            'IF R698>1 GOTOF "TEIL0"<<R698',
            'IF R699>1 GOTOF HPSTART',
            'N9 G90 G00 X0 Y0',
            'N10 HPSTART:',
            'TEIL01:',
            'STOPRE',
            'R696=R696+R698',
            'R698=1',
            'N11 R401=0.00                           ; Nullpunktverschiebung X',
            'N12 R402=0.00                           ; Nullpunktverschiebung Y',
            'N13 R403=0.00                           ; Winkel',
            'N14 R404=1                              ; Spiegelflag',
            'N15 PART1',
            'N16 L206',
            'N17 M30',
        ].join('\n') + '\n';
    }

    // ════════════════════════════════════════════════════════════════
    // PARAMETER_SPF (Technologie-Template)
    // ════════════════════════════════════════════════════════════════

    /**
     * Erzeugt PARAMETER_SPF mit dynamischen R-Parametern.
     * @param {string} planName
     * @param {Object} rp - R-Parameter aus CeraJetEngine.toRParameters() (Fallbacks auf Defaults)
     */
    _generateParameterSPF(planName, rp = {}) {
        // Helfer: R-Wert formatieren mit Fallback
        const r = (key, fallback, decimals = 2) => {
            const val = rp[key] !== undefined ? rp[key] : fallback;
            return decimals === 0 ? Math.round(val).toString() : val.toFixed(decimals);
        };

        const hasTech = Object.keys(rp).length > 0;
        const techComment = hasTech ? ';CeraJet-Engine V1.0 — dynamische Parameter' : ';Standard-Template (keine Technologie-Daten)';

        return [
            `%_N_PARAMETER_SPF`,
            `;$PATH=/_N_WKS_DIR/_N_${planName}_WPD`,
            techComment,
            'IF (R912==4) OR (R912==6)',
            'GOTOF ENDE',
            'ENDIF',
            `R911=${r('R911', 1.0)}                                ;Massstabsfaktor`,
            `R923=${r('R923', 9, 0)}                                  ;Anschussart 7=PUNKT, 8=BOHREN, 9=Rotation`,
            `R928=${r('R928', 0.80)}                               ;Rotationsradius`,
            `R917=${r('R917', 1000, 2)}                            ;Rotationsanschuss Vorschub mm/min`,
            `R929=${r('R929', 1.0)}                               ;Rotationsanschusszeit`,
            `R914=${r('R914', 0.0)}                               ;Punktanschusszeit`,
            `R913=${r('R913', 0.0)}                               ;Druckanstiegszeit`,
            `R959=${r('R959', 270, 2)}                             ;Abrasiv beim Anschuss`,
            `R935=${r('R935', 15, 0)}                                 ;Silovorwahl`,
            `R920=${r('R920', 0.0)}                               ;Abheben Z am Schnittende`,
            ';',
            `R946=${r('R946', 800, 0)}                                ;Freifahren X am Programmende / Messen`,
            ';',
            `R899=${r('R899', 1850, 0)}                               ;Vorschub Reihe 1 sehr gut`,
            `R938=${r('R938', 2000, 0)}                               ;Vorschub Reihe 2 gut`,
            `R939=${r('R939', 2400, 0)}                               ;Vorschub Reihe 3 mittelfein`,
            `R942=${r('R942', 100, 0)}                                ;Vorschub Reihe 4 mittel`,
            `R943=${r('R943', 100, 0)}                                ;Vorschub Reihe 5 grob`,
            ';',
            `R931=${r('R931', 1850, 0)}                               ;Vorschub in Ecken Reihe 1 sehr gut`,
            `R940=${r('R940', 2000, 0)}                               ;Vorschub in Ecken Reihe 2 gut`,
            `R941=${r('R941', 2400, 0)}                               ;Vorschub in Ecken Reihe 3 mittelfein`,
            `R944=${r('R944', 100, 0)}                                ;Vorschub in Ecken Reihe 4 mittel`,
            `R945=${r('R945', 100, 0)}                                ;Vorschub in Ecken Reihe 5 grob`,
            ';',
            `R932=${r('R932', 0.80)}                               ;Schnittspalt Reihe 1 sehr gut`,
            `R933=${r('R933', 0.80)}                               ;Schnittspalt Reihe 2 gut`,
            `R934=${r('R934', 0.80)}                               ;Schnittspalt Reihe 3 mittelfein`,
            `R958=${r('R958', 0.80)}                               ;Schnittspalt Reihe 4 mittel`,
            `R927=${r('R927', 0.80)}                               ;Schnittspalt Reihe 5 grob`,
            ';',
            `R947=${r('R947', 2900, 2)}                            ;Schneiddruck Reihe 1 sehr gut`,
            `R949=${r('R949', 2900, 2)}                            ;Schneiddruck Reihe 2 gut`,
            `R951=${r('R951', 2900, 2)}                            ;Schneiddruck Reihe 3 mittelfein`,
            `R953=${r('R953', 3500, 2)}                            ;Schneiddruck Reihe 4 mittel`,
            `R955=${r('R955', 3500, 2)}                            ;Schneiddruck Reihe 5 grob`,
            ';',
            `R948=${r('R948', 270, 2)}                             ;Abrasiv Reihe 1 sehr gut`,
            `R950=${r('R950', 270, 2)}                             ;Abrasiv Reihe 2 gut`,
            `R952=${r('R952', 250, 2)}                             ;Abrasiv Reihe 3 mittelfein`,
            `R954=${r('R954', 340, 2)}                             ;Abrasiv Reihe 4 mittel`,
            `R956=${r('R956', 340, 2)}                             ;Abrasiv Reihe 5 grob`,
            ';',
            `R967=${r('R967', 270, 2)}                             ;Abrasiv in Ecken Reihe 1 sehr gut`,
            `R968=${r('R968', 270, 2)}                             ;Abrasiv in Ecken Reihe 2 gut`,
            `R969=${r('R969', 250, 2)}                             ;Abrasiv in Ecken Reihe 3 mittelfein`,
            `R970=${r('R970', 340, 2)}                             ;Abrasiv in Ecken Reihe 4 mittel`,
            `R971=${r('R971', 340, 2)}                             ;Abrasiv in Ecken Reihe 5 grob`,
            ';',
            `R916=${r('R916', 2900, 2)}                            ;Anschussdruck`,
            ';',
            `R937=${r('R937', 500, 0)}                                ;Min. Druck Abrasiv ein`,
            ';',
            ';GRAVIER-PARAMETER Reihe 6',
            'R800=1000                               ;Vorschub',
            'R803=700.00                             ;Schneiddruck',
            'R804=50.00                              ;Abrasiv',
            ';',
            ';KOERN-PARAMETER Reihe 7',
            'R909=0.00                               ;Anschusszeit',
            'R811=700.00                             ;Schneiddruck',
            'R812=50.00                              ;Abrasiv',
            ';',
            ';BOHRPARAMETER',
            'R985=0.00                               ;Vorschub',
            'R986=0.00                               ;Tiefe gesamt',
            'R987=0.00                               ;Drehzahl',
            'R988=0.00                               ;Bohrtiefe 1',
            'R989=0.00                               ;Bohrtiefe 2',
            ';',
            ';BOHREN KLEINER LOECHER',
            'R571=1.00                               ;Rotationsvorschub',
            'R570=1.00                               ;Rotationsradius',
            'R572=0.00                               ;Rotationsanschusszeit',
            ';',
            ';',
            'R996=R916                               ;Sichern des CAD/CAM Anschussdruckes',
            'R997=R914                               ;Sichern der CAD/CAM Punktanschusszeit',
            'R998=R920                               ;Sichern der CAD/CAM Abhebehoehe Z',
            'ENDE:',
            'M17',
        ].join('\n') + '\n';
    }

    // ════════════════════════════════════════════════════════════════
    // PART1_SPF (Geometrie — alle Konturen)
    // ════════════════════════════════════════════════════════════════

    _generatePartSPF(planName, tafelName, cuttable) {
        const totalArea = cuttable.reduce((sum, c) => sum + (c.getArea?.() || 0), 0);
        const lines = [];

        lines.push(`%_N_PART1_SPF`);
        lines.push(`;$PATH=/_N_WKS_DIR/_N_${planName}_WPD`);
        lines.push(`;NEUES TEIL NR 1`);
        lines.push(`MSG(" BTIDENTNR  : ${planName}")`);
        lines.push(`;KOMMISSION : ${tafelName}`);
        lines.push(`;FLAECHE    : ${totalArea.toFixed(0)}.000`);
        lines.push(`R995=${cuttable.length.toFixed(2)}`);
        lines.push(`;KEINE AUFTRAGSDATEN`);

        // Koordinaten-Transformation
        lines.push('N1 TRANS X=R401 Y=R402');
        lines.push('N2 AROT RPL=R403');
        lines.push('N3 IF R404==1 GOTOF LABEL1');
        lines.push('N4 AMIRROR X0');
        lines.push('N5 LABEL1:');
        lines.push('R697=0');
        lines.push('IF R699>1 GOTOF "CONTOUR"<<R699');

        // Alle Konturen ausgeben
        this._lineNum = 6; // Nächste freie Satznummer
        for (let i = 0; i < cuttable.length; i++) {
            const contour = cuttable[i];
            const contourNum = i + 1;

            lines.push(...this._generateContourBlock(contour, contourNum));
        }

        // Footer
        lines.push(`N${this._lineNum++} MIRROR`);
        lines.push(`N${this._lineNum++} ROT`);
        lines.push(`N${this._lineNum++} R403=0`);
        lines.push(`N${this._lineNum++} R404=0`);
        lines.push(`N${this._lineNum++} G90`);
        lines.push('STOPRE');
        lines.push('R697=1');
        lines.push(`N${this._lineNum++} RET`);

        return lines.join('\n') + '\n';
    }

    // ════════════════════════════════════════════════════════════════
    // KONTUR-BLOCK (pro Kontur)
    // ════════════════════════════════════════════════════════════════

    _generateContourBlock(contour, contourNum) {
        if (!contour.isClosed && contour.cuttingMode === 'slit') {
            return this._generateSlitContour(contour, contourNum);
        }
        return this._generateClosedContour(contour, contourNum);
    }

    /**
     * Geschlossene Kontur (disc/hole):
     *   CONTOUR → STOPRE → G00 Pierce → L201 → G41/42 Lead-In →
     *   Kontur (G01/G02/G03) → Overcut → G40 Lead-Out → L205
     */
    _generateClosedContour(contour, contourNum) {
        const lines = [];
        const pts = contour.points;
        if (!pts || pts.length < 3) {
            this._warnings.push(`Kontur ${contourNum}: Zu wenig Punkte (${pts?.length})`);
            return lines;
        }

        // ── CONTOUR Header ──
        lines.push(`CONTOUR${contourNum}:`);
        lines.push('STOPRE');
        lines.push('R697=R697+R699');
        lines.push('R699=1');

        // ── Lead-In ──
        const leadIn = contour.getLeadInPath?.();
        const piercePoint = leadIn?.piercingPoint || pts[0];
        const entryPoint = leadIn?.entryPoint || pts[0];

        // G00: Eilgang zum Anstichpunkt
        lines.push(`N${this._lineNum++} G00 X${this._fc(piercePoint.x)} Y${this._fc(piercePoint.y)}`);

        // Schneidreihe (Qualität)
        const quality = contour.quality || 2;
        lines.push(`N${this._lineNum++} R957=${quality}                               ; Anwahl der Schneidreihe`);

        // Piercing-Typ (B.1) — dynamisch aus Kontur
        const r923 = contour.getPiercingR923?.() ?? 9;
        const piercingComment = {
            0: 'Luft-Start',
            1: 'Auto / Linearer Anschuss',
            2: 'Stationärer Anschuss',
            3: 'Kreisanschuss',
            4: 'Bohr-Anschuss',
            9: 'Rotationsanschuss'
        }[r923] || 'Anschuss';
        lines.push(`R923=${r923}                                  ; ${piercingComment}`);

        // R924 (Stationär-Zeit), R925 (Kreisradius), R926 (Kreiszeit) wenn nötig
        if (r923 === 2 && contour.piercingStationaryTime !== undefined) {
            lines.push(`R924=${contour.piercingStationaryTime.toFixed(2)}                             ; Stationäre Anschusszeit [s]`);
        }
        if (r923 === 3) {
            if (contour.piercingCircularRadius !== undefined) {
                lines.push(`R925=${contour.piercingCircularRadius.toFixed(2)}                            ; Kreisanschuss-Radius [mm]`);
            }
            if (contour.piercingCircularTime !== undefined) {
                lines.push(`R926=${contour.piercingCircularTime.toFixed(2)}                             ; Kreisanschuss-Zeit [s]`);
            }
        }

        // L201: Anschuss-Zyklus
        lines.push(`N${this._lineNum++} L201`);

        // Kerf-Kompensation: G41 (hole/links) oder G42 (disc/rechts)
        const kerfCode = this._getKerfCode(contour);

        // Speed-Ramping
        const speedFactor = this._getSpeedFactor(contour);
        const hasSpeedRamp = speedFactor !== null;

        // Lead-In Bewegung mit Kerf-Anwahl
        if (leadIn && leadIn.points && leadIn.points.length >= 2) {
            if (hasSpeedRamp) {
                lines.push(`N${this._lineNum++} VAKT=${this._getEckenVorschubParam(quality)}+${speedFactor.toFixed(2)}*(${this._getNormalVorschubParam(quality)}-${this._getEckenVorschubParam(quality)})`);
            }

            // Lead-In Segmente per Arc-Fitting oder direkt
            const leadSegments = this._processLeadPath(leadIn);

            for (let i = 0; i < leadSegments.length; i++) {
                const seg = leadSegments[i];
                const isFirst = (i === 0);

                if (seg.type === 'line') {
                    if (isFirst) {
                        const feedStr = hasSpeedRamp ? 'F=VAKT FLIN H1' : `F=${this._getEckenVorschubParam(quality)} FLIN H1`;
                        lines.push(`N${this._lineNum++} ${kerfCode} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)} ${feedStr}`);
                    } else {
                        lines.push(`N${this._lineNum++} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)}`);
                    }
                } else {
                    const arcCmd = seg.clockwise ? 'G02' : 'G03';
                    if (isFirst) {
                        const feedStr = hasSpeedRamp ? 'F=VAKT FLIN H1' : `F=${this._getEckenVorschubParam(quality)} FLIN H1`;
                        lines.push(`N${this._lineNum++} ${kerfCode} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)} ${feedStr}`);
                    } else {
                        lines.push(`N${this._lineNum++} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)}`);
                    }
                }
            }
        } else {
            const feedStr = hasSpeedRamp ? 'F=VAKT FLIN H1' : `F=${this._getEckenVorschubParam(quality)} FLIN H1`;
            lines.push(`N${this._lineNum++} ${kerfCode} G01 X${this._fc(pts[0].x)} Y${this._fc(pts[0].y)} ${feedStr}`);
        }

        // ── Kontur-Punkte (G01/G02/G03) ──
        const contourSegments = this._processContourPoints(pts);
        for (let i = 1; i < contourSegments.length; i++) {
            const seg = contourSegments[i];
            if (seg.type === 'line') {
                lines.push(`N${this._lineNum++} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)}`);
            } else {
                const arcCmd = seg.clockwise ? 'G02' : 'G03';
                lines.push(`N${this._lineNum++} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)}`);
            }
        }

        // ── Overcut ──
        const overcut = contour.getOvercutPath?.();
        if (overcut?.points?.length >= 2) {
            const overcutSegments = this._processContourPoints(overcut.points);
            for (let i = 1; i < overcutSegments.length; i++) {
                const seg = overcutSegments[i];
                if (seg.type === 'line') {
                    lines.push(`N${this._lineNum++} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)}`);
                } else {
                    const arcCmd = seg.clockwise ? 'G02' : 'G03';
                    lines.push(`N${this._lineNum++} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)}`);
                }
            }
        }

        // ── Lead-Out + Kerf abwählen ──
        const leadOut = contour.getLeadOutPath?.();
        if (leadOut?.points?.length >= 2) {
            const leadOutSegments = this._processLeadPath(leadOut);
            const lastSeg = leadOutSegments[leadOutSegments.length - 1];

            for (let i = 0; i < leadOutSegments.length - 1; i++) {
                const seg = leadOutSegments[i];
                if (seg.type === 'line') {
                    lines.push(`N${this._lineNum++} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)}`);
                } else {
                    const arcCmd = seg.clockwise ? 'G02' : 'G03';
                    lines.push(`N${this._lineNum++} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)}`);
                }
            }

            // Letztes Segment: G40 (Kerf abwählen)
            if (lastSeg.type === 'line') {
                lines.push(`N${this._lineNum++} G40 G01 X${this._fc(lastSeg.x)} Y${this._fc(lastSeg.y)}`);
            } else {
                const arcCmd = lastSeg.clockwise ? 'G02' : 'G03';
                lines.push(`N${this._lineNum++} G40 ${arcCmd} X${this._fc(lastSeg.x)} Y${this._fc(lastSeg.y)} I${this._fc(lastSeg.i)} J${this._fc(lastSeg.j)}`);
            }
        } else {
            const lastPt = overcut?.endPoint || pts[pts.length - 1];
            lines.push(`N${this._lineNum++} G40 G01 X${this._fc(lastPt.x)} Y${this._fc(lastPt.y)}`);
        }

        // L205: Jet-Off
        lines.push(`N${this._lineNum++} L205`);

        return lines;
    }

    /**
     * Slit-Kontur (offener Schnitt):
     *   G00 Start → L201 → G41/42 Lead → FLIN-Ramp → Schnitt → FLIN-Ramp →
     *   L205 → G91 G40 G01 X1.0 Y0.0 → G90
     */
    _generateSlitContour(contour, contourNum) {
        const lines = [];
        const pts = contour.points;
        if (!pts || pts.length < 2) {
            this._warnings.push(`Slit ${contourNum}: Zu wenig Punkte (${pts?.length})`);
            return lines;
        }

        // ── CONTOUR Header ──
        lines.push(`CONTOUR${contourNum}:`);
        lines.push('STOPRE');
        lines.push('R697=R697+R699');
        lines.push('R699=1');

        const leadIn = contour.getLeadInPath?.();
        const startPt = leadIn?.piercingPoint || pts[0];

        lines.push(`N${this._lineNum++} G00 X${this._fc(startPt.x)} Y${this._fc(startPt.y)}`);

        const quality = contour.quality || 2;
        lines.push(`N${this._lineNum++} R957=${quality}                               ; Anwahl der Schneidreihe`);
        const r923slit = contour.getPiercingR923?.() ?? 9;
        lines.push(`R923=${r923slit}                                  ; Anschussart`);

        lines.push(`N${this._lineNum++} L201`);

        const kerfCode = this._getKerfCode(contour);
        const eckenParam = this._getEckenVorschubParam(quality);
        const normalParam = this._getNormalVorschubParam(quality);

        const segments = this._processContourPoints(pts);

        if (segments.length === 0) return lines;

        // Erster Punkt: Kerf-Anwahl + Eckengeschwindigkeit
        const firstSeg = segments[0];
        lines.push(`N${this._lineNum++} ${kerfCode} G01 X${this._fc(firstSeg.x)} Y${this._fc(firstSeg.y)} F=${eckenParam} FLIN H1`);

        // Zweiter Punkt: Ramp-Up
        if (segments.length > 1) {
            const secondSeg = segments[1];
            lines.push(`N${this._lineNum++} G01 X${this._fc(secondSeg.x)} Y${this._fc(secondSeg.y)} F=${normalParam} FLIN`);
        }

        // Hauptschnitt
        for (let i = 2; i < segments.length - 1; i++) {
            const seg = segments[i];
            if (seg.type === 'line') {
                const suffix = (i === 2) ? ' H0' : '';
                lines.push(`N${this._lineNum++} G01 X${this._fc(seg.x)} Y${this._fc(seg.y)}${suffix}`);
            } else {
                const arcCmd = seg.clockwise ? 'G02' : 'G03';
                lines.push(`N${this._lineNum++} ${arcCmd} X${this._fc(seg.x)} Y${this._fc(seg.y)} I${this._fc(seg.i)} J${this._fc(seg.j)}`);
            }
        }

        // Letzter Punkt: Ramp-Down
        if (segments.length > 2) {
            const lastSeg = segments[segments.length - 1];
            lines.push(`N${this._lineNum++} G01 X${this._fc(lastSeg.x)} Y${this._fc(lastSeg.y)}  F=${eckenParam} FLIN H1`);
        }

        // L205: Jet-Off
        lines.push(`N${this._lineNum++} L205`);

        // Kerf abwählen: inkrementell (Slit-Spezialfall)
        lines.push(`N${this._lineNum++} G91 G40 G01 X1.0 Y0.0`);
        lines.push(`N${this._lineNum++} G90`);

        return lines;
    }

    // ════════════════════════════════════════════════════════════════
    // ARC-FITTING & SEGMENT-VERARBEITUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Verarbeitet Lead-In/Out-Pfade zu G-Code-Segmenten.
     */
    _processLeadPath(leadPath) {
        if (!leadPath?.points || leadPath.points.length < 2) return [];
        return this._processContourPoints(leadPath.points);
    }

    /**
     * Konvertiert Punkt-Array zu G-Code-Segmenten (Linien + Bögen).
     *
     * @param {Array<{x,y}>} points
     * @returns {Array<{type:'line'|'arc', x, y, i?, j?, clockwise?}>}
     */
    _processContourPoints(points) {
        if (!points || points.length < 2) return [];

        // Versuch Arc-Fitting
        if (this.useArcFitting && typeof ArcFitting !== 'undefined') {
            try {
                const fitted = ArcFitting.fitPolyline(points, {
                    chordTolerance: this.arcTolerance
                });

                if (fitted && fitted.length > 0) {
                    return fitted.map(seg => {
                        if (seg.type === 'line') {
                            return { type: 'line', x: seg.end.x, y: seg.end.y };
                        } else {
                            // I/J sind INKREMENTELL: Zentrum relativ zum Startpunkt
                            return {
                                type: 'arc',
                                x: seg.end.x,
                                y: seg.end.y,
                                i: seg.center.x - seg.start.x,
                                j: seg.center.y - seg.start.y,
                                clockwise: seg.clockwise
                            };
                        }
                    });
                }
            } catch (e) {
                this._warnings.push(`Arc-Fitting Fehler: ${e.message}`);
            }
        }

        // Fallback: Alles als G01-Linien
        return points.slice(1).map(pt => ({
            type: 'line',
            x: pt.x,
            y: pt.y
        }));
    }

    // ════════════════════════════════════════════════════════════════
    // KERF / SPEED / QUALITÄT
    // ════════════════════════════════════════════════════════════════

    /**
     * G41 = Werkzeug links (hole), G42 = Werkzeug rechts (disc)
     */
    _getKerfCode(contour) {
        const mode = contour.cuttingMode;
        const flipped = contour.kerfFlipped || false;

        if (mode === 'hole') {
            return flipped ? 'G42' : 'G41';
        } else if (mode === 'disc') {
            return flipped ? 'G41' : 'G42';
        } else if (mode === 'slit') {
            return flipped ? 'G41' : 'G42';
        }

        this._warnings.push(`Kontur ohne cuttingMode — kein Kerf`);
        return 'G41';
    }

    /**
     * Speed-Ramping-Faktor: 0.69 normal, 0.20 kleine Löcher
     */
    _getSpeedFactor(contour) {
        if (!contour.isClosed) return null;

        const area = contour.getArea?.() || 0;
        if (area < 0.01) return null;
        const effectiveRadius = Math.sqrt(area / Math.PI);

        if (effectiveRadius < this.smallHoleThreshold) {
            return this.speedFactorSmallHole;
        }
        return this.speedFactorNormal;
    }

    _getEckenVorschubParam(quality) {
        const map = { 1: 'R931', 2: 'R940', 3: 'R941', 4: 'R944', 5: 'R945' };
        return map[quality] || 'R940';
    }

    _getNormalVorschubParam(quality) {
        const map = { 1: 'R899', 2: 'R938', 3: 'R939', 4: 'R942', 5: 'R943' };
        return map[quality] || 'R938';
    }

    // ════════════════════════════════════════════════════════════════
    // PLATTENGRÖSSE
    // ════════════════════════════════════════════════════════════════

    _getPlateSize(contours) {
        const ref = contours.find(c => c.isReference);
        if (ref) {
            const bb = ref.getBoundingBox?.();
            if (bb) {
                return {
                    width: Math.abs(bb.maxX - bb.minX),
                    height: Math.abs(bb.maxY - bb.minY)
                };
            }
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of contours) {
            if (!c.points) continue;
            for (const p of c.points) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
        }

        if (minX === Infinity) return { width: 600, height: 400 };

        return {
            width: Math.ceil(maxX - minX + 20),
            height: Math.ceil(maxY - minY + 20)
        };
    }

    // ════════════════════════════════════════════════════════════════
    // FORMATIERUNG
    // ════════════════════════════════════════════════════════════════

    _fc(value) {
        return value.toFixed(this.coordDecimals);
    }

    _ff(value) {
        return value.toFixed(this.feedDecimals);
    }

    // ════════════════════════════════════════════════════════════════
    // MULTI-HEAD SUPPORT (V1.3)
    // ════════════════════════════════════════════════════════════════

    /**
     * Multi-Head: Generiert Code für mehrere Schneidköpfe.
     * Teilt Konturen gleichmäßig auf Köpfe auf, berücksichtigt Kopfabstand.
     * @param {CamContour[]} contours
     * @param {number[]} cutOrder
     * @param {Object} settings
     * @returns {{ code: string, warnings: string[], stats: Object }}
     */
    generateMultiHead(contours, cutOrder, settings = {}) {
        if (this.headCount <= 1) {
            return this.generate(contours, cutOrder, settings);
        }

        console.log(`[PP V${SinumerikPostprocessor.VERSION}] Multi-Head: ${this.headCount} Köpfe, Abstand ${this.headSpacing}mm`);

        const cuttable = cutOrder
            .map(idx => contours[idx])
            .filter(c => c && !c.isReference);

        if (cuttable.length === 0) {
            return { code: '', warnings: ['Keine schneidbaren Konturen'], stats: {} };
        }

        // Konturen auf Köpfe verteilen (Round-Robin oder Zonen)
        const headGroups = this._distributeToHeads(cuttable);

        // Einzelnen Code für jeden Kopf generieren, dann zusammenführen
        this._lineNum = 0;
        this._warnings = [];

        const planName = (settings.planName || 'UNNAMED').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const material = settings.material || 'AALLGEMEIN';
        const tafelName = settings.tafelName || planName;
        const dicke = settings.dicke || 8.0;
        const rp = settings.technologyParams || {};
        const plate = this._getPlateSize(contours);

        let code = '';
        code += this._generateMPFHeader(planName, material, tafelName, plate, dicke);
        code += `KOPF_ANZAHL=${this.headCount}\n`;
        code += `KOPF_ABSTAND=${this.headSpacing.toFixed(2)}\n`;
        code += ' \n';
        code += this._generateParameterSPF(planName, rp);
        code += ' \n';

        // Für jeden Kopf ein PART-Subprogramm
        for (let h = 0; h < this.headCount; h++) {
            const headContours = headGroups[h];
            if (headContours.length === 0) continue;

            const offset = h * this.headSpacing;
            const offsetAxis = this.headAxis === 'X' ? 'X' : 'Y';

            code += `%_N_PART${h + 1}_SPF\n`;
            code += `;$PATH=/_N_WKS_DIR/_N_${planName}_WPD\n`;
            code += `;KOPF ${h + 1} — ${headContours.length} Konturen, Offset ${offsetAxis}=${offset.toFixed(2)}mm\n`;

            if (offset > 0) {
                code += `; Kopf-Offset\n`;
                code += `TRANS ${offsetAxis}=${offset.toFixed(2)}\n`;
            }

            // Konturen dieses Kopfes
            this._lineNum = 1;
            for (let i = 0; i < headContours.length; i++) {
                const contourLines = this._generateContourBlock(headContours[i], i + 1);
                code += contourLines.join('\n') + '\n';
            }

            if (offset > 0) {
                code += `TRANS\n`; // Reset
            }
            code += `N${this._lineNum++} RET\n`;
            code += ' \n';
        }

        const stats = {
            contours: cuttable.length,
            heads: this.headCount,
            planName,
            fileSize: code.length,
            contoursPerHead: headGroups.map(g => g.length)
        };

        console.log(`[PP V${SinumerikPostprocessor.VERSION}] Multi-Head: ${this.headCount} Köpfe, ${stats.contoursPerHead.join('/')} Konturen`);
        return { code, warnings: [...this._warnings], stats };
    }

    /**
     * Verteilt Konturen auf Köpfe basierend auf Y-Position (Zonen).
     */
    _distributeToHeads(contours) {
        const groups = Array.from({ length: this.headCount }, () => []);

        if (this.headSpacing <= 0) {
            // Ohne Abstand: Round-Robin
            contours.forEach((c, i) => groups[i % this.headCount].push(c));
        } else {
            // Mit Abstand: Zonen-basiert auf Achse
            const isX = this.headAxis === 'X';
            const sorted = [...contours].sort((a, b) => {
                const ca = this._contourCenter(a);
                const cb = this._contourCenter(b);
                return isX ? ca.x - cb.x : ca.y - cb.y;
            });

            const perHead = Math.ceil(sorted.length / this.headCount);
            sorted.forEach((c, i) => {
                const headIdx = Math.min(Math.floor(i / perHead), this.headCount - 1);
                groups[headIdx].push(c);
            });
        }

        return groups;
    }

    _contourCenter(contour) {
        if (!contour.points || contour.points.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0;
        for (const p of contour.points) { sx += p.x; sy += p.y; }
        return { x: sx / contour.points.length, y: sy / contour.points.length };
    }

    /**
     * Wendet Machine-Profile-Einstellungen an (V1.3).
     */
    applyMachineProfile(profile) {
        if (!profile) return;
        this.machineProfile = profile;
        if (profile.coordDecimals !== undefined) this.coordDecimals = profile.coordDecimals;
        if (profile.feedDecimals !== undefined) this.feedDecimals = profile.feedDecimals;
        if (profile.speedFactorNormal !== undefined) this.speedFactorNormal = profile.speedFactorNormal;
        if (profile.speedFactorSmallHole !== undefined) this.speedFactorSmallHole = profile.speedFactorSmallHole;
        if (profile.headCount !== undefined) this.headCount = profile.headCount;
        if (profile.headSpacing !== undefined) this.headSpacing = profile.headSpacing;
        console.log(`[PP V${SinumerikPostprocessor.VERSION}] Machine-Profile angewendet: ${profile.name || 'unnamed'}`);
    }
}

// ════════════════════════════════════════════════════════════════
// Export
// ════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SinumerikPostprocessor;
}

console.log(`[PP V${SinumerikPostprocessor.VERSION}] Sinumerik 840D Postprozessor geladen`);
