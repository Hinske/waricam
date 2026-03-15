/**
 * CeraJet Engine V1.0 — Technologie-Berechnung für Wasserstrahlschneiden
 *
 * Reine Berechnungslogik, kein DOM. Liefert Vorschübe, Anschussparameter
 * und R-Parameter für den Sinumerik 840D Postprozessor.
 *
 * Basis: CeraCUT-kalibrierte Referenzwerte + physikalische Skalierung.
 * Formel: v = refQ4 × (P/P_ref)^1.6 × (d_a/d_a_ref)^1.21 × (m_a/m_a_ref)^0.4 / (h/h_ref)^1.15
 *
 * Referenzbedingungen: 10mm, 2900bar, 0.25W/0.80A, 200 g/min
 *
 * Last Modified: 2026-02-17
 */

class CeraJetEngine {

    static VERSION = '1.0';

    // ════════════════════════════════════════════════════════════════
    // MATERIALDATENBANK
    // Ref-Vorschübe bei Standardbedingungen (Q4 = Mittel)
    // ✓ = CeraCUT-bestätigt, sonst geschätzt
    // ════════════════════════════════════════════════════════════════

    static MATERIALS = [
        { id:1,  name:"Stahl",                    bkz:115, akz:170, refQ4:85.4,   v:true,  cat:"Stahl" },
        { id:2,  name:"Stahl (A36HR)",             bkz:115, akz:100, refQ4:85.4,   v:false, cat:"Stahl" },
        { id:3,  name:"Stahl (M2 Tool)",           bkz:185, akz:100, refQ4:53.0,   v:false, cat:"Stahl" },
        { id:4,  name:"Edelstahl (304-HR)",        bkz:108, akz:100, refQ4:84.1,   v:true,  cat:"Stahl" },
        { id:7,  name:"Stahl (Inconel 600)",       bkz:120, akz:100, refQ4:76.0,   v:false, cat:"Stahl" },
        { id:10, name:"Nilo (36)",                 bkz:200, akz:100, refQ4:49.0,   v:false, cat:"Stahl" },
        { id:16, name:"Hardox 600",                bkz:57,  akz:120, refQ4:42.0,   v:false, cat:"Stahl" },
        { id:18, name:"ATI AL-6XN",                bkz:80,  akz:83,  refQ4:91.0,   v:false, cat:"Stahl" },
        { id:5,  name:"Aluminium (6061-T6)",       bkz:91,  akz:300, refQ4:207.4,  v:true,  cat:"Buntmetall" },
        { id:6,  name:"Titanium",                  bkz:91,  akz:150, refQ4:73.0,   v:false, cat:"Buntmetall" },
        { id:8,  name:"Kupfer (10100CR)",          bkz:91,  akz:130, refQ4:176.0,  v:false, cat:"Buntmetall" },
        { id:9,  name:"Bronze (63000A1)",          bkz:91,  akz:100, refQ4:156.0,  v:false, cat:"Buntmetall" },
        { id:17, name:"Titan Grade 5",             bkz:94,  akz:57,  refQ4:73.0,   v:false, cat:"Buntmetall" },
        { id:11, name:"Glas",                      bkz:91,  akz:350, refQ4:713.0,  v:false, cat:"Stein" },
        { id:12, name:"Marmor",                    bkz:91,  akz:250, refQ4:611.0,  v:false, cat:"Stein" },
        { id:13, name:"Granit",                    bkz:91,  akz:91,  refQ4:509.1,  v:true,  cat:"Stein" },
        { id:19, name:"SIC",                       bkz:25,  akz:100, refQ4:59.0,   v:false, cat:"Stein" },
        { id:20, name:"Fliesen (Keramik)",         bkz:91,  akz:280, refQ4:600.0,  v:false, cat:"Stein" },
        { id:21, name:"Fliesen (Feinsteinzeug)",   bkz:75,  akz:200, refQ4:975.0,  v:false, cat:"Stein" },
        { id:22, name:"Fliesen (Naturstein)",      bkz:88,  akz:180, refQ4:450.0,  v:false, cat:"Stein" },
        { id:14, name:"Plexiglas",                 bkz:91,  akz:110, refQ4:300.0,  v:false, cat:"Sonstige" },
        { id:15, name:"Graphit (EDM 200)",         bkz:91,  akz:200, refQ4:400.0,  v:false, cat:"Sonstige" },
    ];

    // ════════════════════════════════════════════════════════════════
    // DÜSENKOMBINATIONEN
    // ════════════════════════════════════════════════════════════════

    static NOZZLES = [
        { id:0, water:0.12, abr:0.30, label:"0.12 / 0.30" },
        { id:1, water:0.15, abr:0.30, label:"0.15 / 0.30" },
        { id:2, water:0.20, abr:0.54, label:"0.20 / 0.54" },
        { id:3, water:0.25, abr:0.80, label:"0.25 / 0.80" },
        { id:4, water:0.30, abr:0.80, label:"0.30 / 0.80" },
        { id:5, water:0.30, abr:1.00, label:"0.30 / 1.00" },
        { id:6, water:0.35, abr:1.00, label:"0.35 / 1.00" },
    ];

    // ════════════════════════════════════════════════════════════════
    // KONSTANTEN
    // ════════════════════════════════════════════════════════════════

    // Qualitätsfaktoren relativ zu Q4 (Mittel = 1.0)
    // Verifiziert identisch über Stahl, Edelstahl, Alu, Granit
    static Q_FACTORS = [0.3454, 0.4508, 0.6300, 1.0, 1.4005];
    static Q_NAMES   = ['Sehr Gut', 'Gut', 'Mittelfein', 'Mittel', 'Grob'];
    static Q_SHORT   = ['S.Gut', 'Gut', 'M.fein', 'Mittel', 'Grob'];

    // Ecken-Vorschub = 1/3 des Geraden-Vorschubs (exakt aus CeraCUT)
    static CORNER_FACTOR = 1 / 3;

    // Referenzbedingungen für refQ4
    static REF = { h: 10, P: 2900, d_a: 0.80, m_a: 200 };

    // Abrasiv-Tabelle nach Wasserdüse und Optimierungsmodus
    static WATER_IDX = { 0.12:0, 0.15:1, 0.20:2, 0.25:3, 0.30:4, 0.35:5 };
    static ABR_TABLE = {
        minKosten:        [100, 110, 170, 250, 300, 340],
        kostenProduktion: [150, 170, 280, 340, 400, 450],
        maxProduktion:    [180, 230, 300, 450, 510, 570],
    };

    // Optimierungsmodi für UI
    static OPT_MODES = [
        { id: 'minKosten',        name: 'Min. Kosten',  desc: 'Wenig Abrasiv' },
        { id: 'kostenProduktion', name: 'Kosten/Prod.', desc: 'Ausgewogen' },
        { id: 'maxProduktion',    name: 'Max. Prod.',   desc: 'Max. Durchsatz' },
    ];

    // ════════════════════════════════════════════════════════════════
    // LOOKUP-HELPERS
    // ════════════════════════════════════════════════════════════════

    static getMaterial(id) {
        return this.MATERIALS.find(m => m.id === id) || this.MATERIALS[0];
    }

    static getNozzle(id) {
        return this.NOZZLES.find(n => n.id === id) || this.NOZZLES[3];
    }

    static getAbrasive(nozzle, optMode, override) {
        if (override !== null && override !== undefined) return override;
        const wIdx = this.WATER_IDX[nozzle.water];
        return (this.ABR_TABLE[optMode] || this.ABR_TABLE.minKosten)[wIdx] || 250;
    }

    // ════════════════════════════════════════════════════════════════
    // KERNFORMELN
    // ════════════════════════════════════════════════════════════════

    /**
     * Skaliert den Referenz-Vorschub Q4 auf aktuelle Bedingungen.
     * v = refQ4 × (P/P_ref)^1.6 × (d_a/d_a_ref)^1.21 × (m_a/m_a_ref)^0.4 / (h/h_ref)^1.15
     */
    static scaleQ4(refQ4, h, P, d_a, m_a) {
        if (h <= 0 || P <= 0) return 0;
        return refQ4 *
            Math.pow(P / this.REF.P, 1.6) *
            Math.pow(d_a / this.REF.d_a, 1.21) *
            Math.pow(m_a / this.REF.m_a, 0.4) /
            Math.pow(h / this.REF.h, 1.15);
    }

    /**
     * Anschusszeit in Sekunden.
     * Empirisch aus CeraCUT-Datenpunkten:
     *   Stahl(AKZ=170)=4.3s, Granit(91)=1.0s, Alu(300)=2.9s, Edst(100)=2.4s @ 10mm
     */
    static calcPierceTime(akz, h, refQ4) {
        const base = 2.0 * Math.pow(h / 10, 1.6);
        const matFactor = Math.pow(100 / Math.max(refQ4, 10), 0.5);
        return Math.max(0.3, base * matFactor);
    }

    /**
     * Rotationsanschuss-Vorschub (mm/min).
     */
    static calcRotVorschub(refQ4, h, P, d_a, m_a) {
        const q5 = this.scaleQ4(refQ4, h, P, d_a, m_a) * this.Q_FACTORS[4];
        return Math.round(Math.max(q5 * 2, 42));
    }

    /**
     * Kritischer Eckenradius (mm).
     * Unter diesem Radius → Ecken-Vorschub erforderlich.
     */
    static calcCritRadius(h) {
        return Math.round(0.6 * Math.pow(h, 0.88) * 10) / 10;
    }

    /**
     * Anschussart: ≤5mm → Punkt, >5mm → Rotation
     */
    static getPierceType(h) {
        return h <= 5 ? 'Punkt' : 'Rotation';
    }

    // ════════════════════════════════════════════════════════════════
    // HAUPTBERECHNUNG
    // ════════════════════════════════════════════════════════════════

    /**
     * Berechnet alle Technologie-Parameter.
     *
     * @param {Object} config
     * @param {number} config.materialId       - Material-ID
     * @param {number} config.nozzleId         - Düsen-ID
     * @param {number} config.thickness        - Materialdicke in mm
     * @param {number} config.pressure         - Schneiddruck in bar
     * @param {string} config.optMode          - 'minKosten'|'kostenProduktion'|'maxProduktion'
     * @param {number|null} config.abrasiveOverride - g/min oder null für Auto
     * @returns {TechnologyResult}
     */
    static calculate(config) {
        console.time('[CeraJet V1.0] calculate');

        const mat = this.getMaterial(config.materialId);
        const noz = this.getNozzle(config.nozzleId);
        const h = config.thickness || 10;
        const P = config.pressure || 2900;
        const optMode = config.optMode || 'minKosten';
        const abr = this.getAbrasive(noz, optMode, config.abrasiveOverride);

        console.log(`[CeraJet V1.0] calculate: ${mat.name}, ${h}mm, ${P}bar, ${noz.label}, ${abr}g/min (${optMode})`);

        // Q4-Vorschub skaliert
        const q4 = this.scaleQ4(mat.refQ4, h, P, noz.abr, abr);

        // Alle 5 Qualitätsstufen
        const feeds = this.Q_FACTORS.map(f => Math.round(q4 * f * 10) / 10);
        const corners = feeds.map(f => Math.round(f * this.CORNER_FACTOR * 10) / 10);

        // Anschuss-Parameter
        const pierceTime = this.calcPierceTime(mat.akz, h, mat.refQ4);
        const pierceType = this.getPierceType(h);
        const rotVorschub = this.calcRotVorschub(mat.refQ4, h, P, noz.abr, abr);
        const critRadius = this.calcCritRadius(h);

        const result = {
            // Material-Info
            material: mat,
            nozzle: noz,
            thickness: h,
            pressure: P,
            abrasive: abr,
            optMode,
            kerf: noz.abr,   // Schnittspalt ≈ Abrasivdüsen-Ø

            // 5 Qualitätsstufen [0]=SehrGut ... [4]=Grob
            feeds,
            corners,

            // Anschuss
            pierceType,
            pierceTime: Math.round(pierceTime * 10) / 10,
            rotVorschub,
            critRadius,

            // Meta
            verified: mat.v,
        };

        console.timeEnd('[CeraJet V1.0] calculate');
        return result;
    }

    // ════════════════════════════════════════════════════════════════
    // R-PARAMETER MAPPING FÜR SINUMERIK 840D
    // ════════════════════════════════════════════════════════════════

    /**
     * Konvertiert TechnologyResult in R-Parameter-Objekt.
     * Jeder Key = R-Register, Wert = Zahl.
     * Direkt verwendbar in _generateParameterSPF().
     */
    static toRParameters(tech) {
        return {
            // Massstabsfaktor (immer 1.0)
            R911: 1.0,

            // ── Anschuss ──
            R923: tech.pierceType === 'Rotation' ? 9 : 7,
            R928: 0.80,                               // Rotationsradius
            R917: tech.pierceType === 'Rotation' ? tech.rotVorschub : 1000,
            R929: tech.pierceType === 'Rotation' ? tech.pierceTime : 1.0,
            R914: tech.pierceType === 'Punkt' ? tech.pierceTime : 0.0,
            R913: 0.0,                                // Druckanstiegszeit
            R959: tech.abrasive,                      // Abrasiv beim Anschuss

            // Silovorwahl, Abheben Z
            R935: 15,
            R920: 0.0,

            // Freifahren
            R946: 800,

            // ── Vorschübe (5 Reihen) ──
            R899: Math.round(feeds5(tech, 0)),        // Reihe 1 Sehr Gut
            R938: Math.round(feeds5(tech, 1)),        // Reihe 2 Gut
            R939: Math.round(feeds5(tech, 2)),        // Reihe 3 Mittelfein
            R942: Math.round(feeds5(tech, 3)),        // Reihe 4 Mittel
            R943: Math.round(feeds5(tech, 4)),        // Reihe 5 Grob

            // ── Ecken-Vorschübe (5 Reihen) ──
            R931: Math.round(corners5(tech, 0)),
            R940: Math.round(corners5(tech, 1)),
            R941: Math.round(corners5(tech, 2)),
            R944: Math.round(corners5(tech, 3)),
            R945: Math.round(corners5(tech, 4)),

            // ── Schnittspalt (5 Reihen, identisch = Düsen-Ø) ──
            R932: tech.kerf, R933: tech.kerf, R934: tech.kerf,
            R958: tech.kerf, R927: tech.kerf,

            // ── Schneiddruck (5 Reihen) ──
            R947: tech.pressure, R949: tech.pressure,
            R951: tech.pressure, R953: tech.pressure, R955: tech.pressure,

            // ── Abrasiv (5 Reihen) ──
            R948: tech.abrasive, R950: tech.abrasive, R952: tech.abrasive,
            R954: tech.abrasive, R956: tech.abrasive,

            // ── Abrasiv Ecken (5 Reihen) ──
            R967: tech.abrasive, R968: tech.abrasive, R969: tech.abrasive,
            R970: tech.abrasive, R971: tech.abrasive,

            // ── Anschussdruck ──
            R916: tech.pressure,

            // ── Min. Druck Abrasiv ein ──
            R937: 500,
        };
    }
}

// Interne Helfer (außerhalb der Klasse um toRParameters lesbar zu halten)
function feeds5(tech, idx)   { return tech.feeds[idx]   || 100; }
function corners5(tech, idx) { return tech.corners[idx] || 100; }

// ════════════════════════════════════════════════════════════════
// Export
// ════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CeraJetEngine;
}

console.log(`[CeraJet V${CeraJetEngine.VERSION}] Engine geladen — ${CeraJetEngine.MATERIALS.length} Materialien, ${CeraJetEngine.NOZZLES.length} Düsen`);
