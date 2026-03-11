/**
 * WARICAM DXF Parser V3.5
 * Last Modified: 2026-03-09 MEZ
 * Build: 20260309
 *
 * V3.5 Änderungen:
 *   - TEXT/MTEXT Support: Bounding-Box oder Glyph-Konvertierung (via TextTool)
 *   - HATCH Support: Boundary-Pfad Extraktion
 *
 * V3.3 FIXES:
 *   - CRITICAL: _parseLWPolyline 1000-Zeilen-Limit entfernt (schnitt große Polylinien ab!)
 *   - _endIndex für korrekte Entity-Überspringung im Outer-Loop
 *   - FIX: _endIndex - 2 damit Outer-Loop nach i+=2 auf nächster Entity landet
 *   - Vertex-Count-Validierung (Code 90 Prüfung)
 *   - Verbesserte Diagnostik: Entity-Typ-Breakdown, Kontur-Details
 *
 * V3.2 Änderungen:
 * - SPLINE Flags Fix: Bit 8 = Planar (nicht Periodic!)
 *   DXF Spec: Bit 1=closed, Bit 2=periodic, Bit 3=rational, Bit 4=planar
 *   Bug: flags & 8 als isPeriodic → alle planaren Splines fälschlich geschlossen
 *   Fix: flags & 2 = isPeriodic → korrektes Chaining (z.B. Gut_e.dxf)
 *
 * V3.1 Änderungen:
 * - CRITICAL FIX: Alle Entity-Parser und Haupt-Schleifen auf i += 2 umgestellt
 *   (DXF-Format hat strikt Code/Value-Paare; i++ verursachte dass Wert "0"
 *    als Group-Code "0" interpretiert wurde → Layer "0" brach Parser ab)
 * - _splineData Durchreichung in chainContours/_createContour
 *
 * V3.0 Änderungen:
 * - CRITICAL: LWPOLYLINE/POLYLINE Bulge-Verarbeitung (Bogensegmente)
 * - Adaptive Tessellierung für Circle/Arc/Ellipse/Bulge (maxDeviation=0.01mm)
 * - Grid-basierte Chaining-Optimierung O(n³) → O(n)
 * - Block-Section: POLYLINE/SPLINE/ELLIPSE Support
 *
 * V2.9 Änderungen:
 * - CRITICAL FIX: Spline-Parser brach bei Wert "0" ab (z.B. 74=0 für 0 Fit-Points)
 * - Korrekte Code/Value-Paar Iteration (i += 2) [nur Spline-Parser, jetzt global]
 * - Entity-Ende nur wenn Code "0" UND Value Buchstaben enthält
 *
 * V2.8 Änderungen:
 * - Vollständige B-Spline Interpolation via De Boor Algorithmus
 * - Parsing von Grad, Knoten, Gewichten (NURBS)
 * - Fit-Point Unterstützung für interpolierende Splines
 * - Integration mit SplineUtils aus geometry.js
 *
 * V2.7 Änderungen:
 * - Entity-Tracking für ignorierte Elemente
 * - Größen-Warnung für große Dateien
 * - Entity-Statistik im Result
 * - Verbesserte Error-Reports
 */

const DXFParser = {
    TOLERANCES: {
        SNAP: 0.001,
        CHAIN: 0.1,
        CLOSE: 0.01,
        MIN_SEGMENT: 1.0,
        AUTO_CLOSE: 0.5
    },

    NORMALIZATION_THRESHOLD: 1000000,
    CIRCLE_SEGMENTS: 32,
    ARC_SEGMENTS: 16,
    
    // Bekannte Entity-Typen die wir parsen können
    SUPPORTED_ENTITIES: ['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'SPLINE', 'ELLIPSE', 'INSERT', 'TEXT', 'MTEXT'],
    
    _blockDefinitions: {},
    _ignoredEntities: [],
    _entityStats: {},

    parse(dxfContent, options = {}) {
        console.log('[DXF Parser V3.5] Starting parse...');
        const startTime = performance.now();
        
        try {
            // Reset tracking
            this._blockDefinitions = {};
            this._ignoredEntities = [];
            this._entityStats = {};
            
            this._parseBlocksSection(dxfContent);

            // V3.5: Layer-Definitionen aus TABLES-Sektion lesen
            const layerDefs = this._parseLayerTable(dxfContent);

            let entities = this._extractEntitiesFromSection(dxfContent);
            
            // Größen-Warnung
            if (entities.length > 5000) {
                console.warn(`[DXF Parser] ⚠️ LARGE FILE: ${entities.length} entities`);
            }
            
            const normResult = this._autoNormalizeEntities(entities);
            if (normResult.normalized) {
                entities = normResult.entities;
                console.log(`[DXF V3.5] Normalized by offset (${normResult.offsetX.toFixed(3)}, ${normResult.offsetY.toFixed(3)})`);
            }

            // Layer: Entity-Layer + TABLES-Layer zusammenführen
            const layers = new Set(entities.map(e => e.layer).filter(l => l));
            // V3.5: Layer aus TABLES hinzufügen (auch wenn keine Entities existieren)
            for (const name of layerDefs.names) {
                layers.add(name);
            }
            const contours = this.chainContours(entities, options.chainingTolerance || this.TOLERANCES.CHAIN);
            
            const parseTime = Math.round(performance.now() - startTime);
            
            // Statistik berechnen
            const closedCount = contours.filter(c => c.isClosed).length;
            const openCount = contours.length - closedCount;
            
            // V3.3: Detaillierte Entity-Typ-Statistik
            const typeBreakdown = Object.entries(this._entityStats).map(([t,c]) => `${c}\u00d7${t}`).join(', ');
            console.log(`[DXF V3.5] ${entities.length} entities (${typeBreakdown}) → ${contours.length} contours (${closedCount} closed, ${openCount} open) in ${parseTime}ms`);
            
            // V3.3: Kontur-Details loggen
            contours.forEach((c, i) => {
                console.log(`[DXF V3.5]   Kontur #${i}: ${c.points?.length || 0} Punkte, ${c.isClosed ? 'geschlossen' : 'offen'}, Layer="${c.layer || '0'}", Typ=${c.sourceType || '?'}`);
            });

            // Ignorierte Entities loggen
            if (this._ignoredEntities.length > 0) {
                const ignoredTypes = [...new Set(this._ignoredEntities.map(e => e.type))];
                console.warn(`[DXF Parser] ⚠️ Ignored ${this._ignoredEntities.length} entities: ${ignoredTypes.join(', ')}`);
            }

            return {
                success: true,
                contours: contours,
                layers: layers,
                layerDefs: layerDefs,  // V3.5: Layer-Definitionen aus TABLES (mit ACI-Farben)
                entities: entities,
                bounds: this._calculateBounds(contours),
                
                // NEU: Erweiterte Statistik
                stats: {
                    ...this._entityStats,
                    totalEntities: entities.length,
                    totalContours: contours.length,
                    closedContours: closedCount,
                    openContours: openCount,
                    layerCount: layers.size,
                    parseTime: parseTime
                },
                
                // NEU: Ignorierte Entities
                ignoredEntities: this._ignoredEntities,
                ignoredCount: this._ignoredEntities.length,
                ignoredTypes: [...new Set(this._ignoredEntities.map(e => e.type))],
                
                // NEU: Warnungen
                warnings: this._generateWarnings(contours, entities)
            };
        } catch (error) {
            console.error('[DXF Parser V3.5] Error:', error);
            return { 
                success: false, 
                error: error.message, 
                stack: error.stack,
                contours: [], 
                layers: new Set(), 
                entities: [],
                ignoredEntities: this._ignoredEntities,
                ignoredCount: this._ignoredEntities.length
            };
        }
    },
    
    _generateWarnings(contours, entities) {
        const warnings = [];
        
        // Offene Konturen
        const openCount = contours.filter(c => !c.isClosed).length;
        if (openCount > 0) {
            warnings.push({
                type: 'OPEN_CONTOURS',
                message: `${openCount} offene Kontur(en) gefunden`,
                count: openCount
            });
        }
        
        // Keine Konturen
        if (contours.length === 0 && entities.length > 0) {
            warnings.push({
                type: 'NO_CONTOURS',
                message: `Keine Konturen aus ${entities.length} Entities gebildet`,
                count: entities.length
            });
        }
        
        // Ignorierte Entities
        if (this._ignoredEntities.length > 0) {
            const types = [...new Set(this._ignoredEntities.map(e => e.type))];
            warnings.push({
                type: 'IGNORED_ENTITIES',
                message: `${this._ignoredEntities.length} Element(e) ignoriert: ${types.join(', ')}`,
                count: this._ignoredEntities.length,
                types: types
            });
        }
        
        // Große Datei
        if (entities.length > 5000) {
            warnings.push({
                type: 'LARGE_FILE',
                message: `Große Datei mit ${entities.length} Elementen`,
                count: entities.length
            });
        }
        
        return warnings;
    },

    _parseBlocksSection(dxfContent) {
        const lines = dxfContent.split(/\r?\n/);
        let inBlocksSection = false, sectionStart = -1, sectionEnd = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '2' && i > 0 && lines[i - 1].trim() === 'SECTION') {
                if (lines[i + 1]?.trim() === 'BLOCKS') { inBlocksSection = true; sectionStart = i + 2; }
            }
            if (inBlocksSection && line === 'ENDSEC') { sectionEnd = i; break; }
        }
        
        if (sectionStart === -1) return;
        
        let currentBlockName = null, currentBlockEntities = [], currentBlockBasePoint = { x: 0, y: 0 }, currentLayer = '0';
        let basePointSet = false;

        for (let i = sectionStart; i < sectionEnd; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();

            if (code === '0' && value === 'BLOCK') {
                currentBlockName = null; currentBlockEntities = []; currentBlockBasePoint = { x: 0, y: 0 };
                basePointSet = false;
            }
            if (code === '2' && currentBlockName === null) currentBlockName = value;
            if (!basePointSet) {
                if (code === '10') currentBlockBasePoint.x = parseFloat(value) || 0;
                if (code === '20') currentBlockBasePoint.y = parseFloat(value) || 0;
            }
            if (code === '8') currentLayer = value || '0';

            if (code === '0' && value === 'ENDBLK') {
                if (currentBlockName && currentBlockEntities.length > 0) {
                    this._blockDefinitions[currentBlockName] = { entities: currentBlockEntities, basePoint: currentBlockBasePoint };
                }
                currentBlockName = null;
            }

            if (code === '0' && currentBlockName !== null) {
                if (value !== 'BLOCK' && value !== 'ENDBLK') basePointSet = true;
                let entity = null;
                switch (value) {
                    case 'LINE': entity = this._parseLine(lines, i); break;
                    case 'LWPOLYLINE': entity = this._parseLWPolyline(lines, i); break;
                    case 'POLYLINE': entity = this._parsePolylineWithVertex(lines, i); break;
                    case 'CIRCLE': entity = this._parseCircle(lines, i); break;
                    case 'ARC': entity = this._parseArc(lines, i); break;
                    case 'SPLINE': entity = this._parseSpline(lines, i); break;
                    case 'ELLIPSE': entity = this._parseEllipse(lines, i); break;
                }
                if (entity && entity.points && entity.points.length >= 2) {
                    entity.layer = entity._layer || currentLayer;
                    delete entity._layer;
                    currentBlockEntities.push(entity);
                    if (entity._endIndex && entity._endIndex > i) {
                        i = entity._endIndex - 2;  // V3.3 FIX: -2 weil Outer-Loop i+=2 macht
                    }
                    delete entity._endIndex;
                }
            }
        }
    },

    /**
     * TABLES-Sektion: Layer-Definitionen mit ACI-Farben extrahieren
     * @returns {{ names: string[], colors: Object<string, number> }}
     */
    _parseLayerTable(dxfContent) {
        const lines = dxfContent.split(/\r?\n/);
        const layerDefs = { names: [], colors: {} };
        let inLayerTable = false;
        let i = 0;

        // Finde TABLE ... LAYER ... ENDTAB
        while (i < lines.length) {
            const line = lines[i]?.trim();

            // Start der LAYER-Tabelle
            if (line === 'TABLE' && lines[i + 2]?.trim() === 'LAYER') {
                inLayerTable = true;
                i += 3;
                continue;
            }

            // Ende der LAYER-Tabelle
            if (inLayerTable && line === 'ENDTAB') break;

            // Einzelner LAYER-Record
            if (inLayerTable && line === 'AcDbLayerTableRecord') {
                let name = null, aci = 7;
                let j = i + 1;
                while (j < lines.length) {
                    const code = lines[j]?.trim();
                    const val = lines[j + 1]?.trim();
                    if (code === '0') break; // Nächster Record
                    if (code === '2') name = val;
                    if (code === '62') aci = parseInt(val) || 7;
                    j += 2;
                }
                if (name !== null) {
                    layerDefs.names.push(name);
                    layerDefs.colors[name] = Math.abs(aci); // Negativ = Layer OFF
                }
                i = j;
                continue;
            }
            i++;
        }

        if (layerDefs.names.length > 0) {
            console.log(`[DXF V3.5] TABLES: ${layerDefs.names.length} Layer gefunden:`,
                layerDefs.names.map(n => `${n}(ACI ${layerDefs.colors[n]})`).join(', '));
        }
        return layerDefs;
    },

    _extractEntitiesFromSection(dxfContent) {
        const lines = dxfContent.split(/\r?\n/);
        const entities = [];
        let inEntitiesSection = false, sectionStart = -1, sectionEnd = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '2' && i > 0 && lines[i - 1].trim() === 'SECTION') {
                if (lines[i + 1]?.trim() === 'ENTITIES') { inEntitiesSection = true; sectionStart = i + 2; }
            }
            if (inEntitiesSection && line === 'ENDSEC') { sectionEnd = i; break; }
        }

        if (sectionStart === -1) return this._extractEntitiesLegacy(dxfContent);

        let currentLayer = '0';
        for (let i = sectionStart; i < sectionEnd; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();

            if (code === '8') { currentLayer = value || '0'; continue; }

            if (code === '0') {
                let entity = null;
                let entityType = value;
                
                switch (value) {
                    case 'LINE': 
                        entity = this._parseLine(lines, i); 
                        break;
                    case 'LWPOLYLINE': 
                        entity = this._parseLWPolyline(lines, i); 
                        break;
                    case 'POLYLINE': 
                        entity = this._parsePolylineWithVertex(lines, i); 
                        break;
                    case 'CIRCLE': 
                        entity = this._parseCircle(lines, i); 
                        break;
                    case 'ARC': 
                        entity = this._parseArc(lines, i); 
                        break;
                    case 'SPLINE': 
                        entity = this._parseSpline(lines, i); 
                        break;
                    case 'ELLIPSE': 
                        entity = this._parseEllipse(lines, i); 
                        break;
                    case 'INSERT':
                        const insertEntities = this._parseInsert(lines, i, currentLayer);
                        if (insertEntities && insertEntities.length > 0) {
                            entities.push(...insertEntities);
                            this._trackEntity('INSERT', insertEntities.length);
                        }
                        entityType = null; // Schon getracked
                        break;
                    case 'TEXT':
                    case 'MTEXT':
                        entity = this._parseText(lines, i);
                        break;
                    case 'HATCH':
                        entity = this._parseHatch(lines, i);
                        break;
                    default:
                        // Unbekannte Entity tracken
                        if (value && !['ENDSEC', 'SEQEND', 'VERTEX', 'ATTRIB', 'ATTDEF'].includes(value)) {
                            this._trackIgnoredEntity(value, currentLayer, i);
                        }
                        entityType = null;
                }
                
                if (entity && entity.points && entity.points.length >= 2) {
                    entity.layer = entity._layer || currentLayer;
                    delete entity._layer;
                    entity.sourceType = entityType;
                    entities.push(entity);
                    this._trackEntity(entityType);
                    // Index vorspulen wenn Sub-Parser endIndex zurückgibt
                    if (entity._endIndex && entity._endIndex > i) {
                        i = entity._endIndex - 2;  // V3.3 FIX: -2 weil Outer-Loop i+=2 macht
                    }
                    delete entity._endIndex;
                }
            }
        }
        return entities;
    },
    
    _trackEntity(type, count = 1) {
        if (!type) return;
        this._entityStats[type] = (this._entityStats[type] || 0) + count;
    },
    
    _trackIgnoredEntity(type, layer, lineNumber) {
        // V2.8: Nur echte Entity-Typen tracken (müssen Buchstaben enthalten)
        // Filtert numerische Group Codes wie "42" (Bulge), "100" (Subclass) etc.
        if (!type || !/[A-Z]/i.test(type)) return;
        
        this._ignoredEntities.push({
            type: type,
            layer: layer,
            lineNumber: lineNumber
        });
    },

    _parseInsert(lines, startIndex, layerOverride) {
        let blockName = null, insertX = 0, insertY = 0, scaleX = 1, scaleY = 1, rotation = 0, insertLayer = layerOverride;
        
        for (let i = startIndex; i < Math.min(startIndex + 50, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '0' && i > startIndex) break;
            switch (code) {
                case '2': blockName = value; break;
                case '8': insertLayer = value; break;
                case '10': insertX = parseFloat(value) || 0; break;
                case '20': insertY = parseFloat(value) || 0; break;
                case '41': scaleX = parseFloat(value) || 1; break;
                case '42': scaleY = parseFloat(value) || 1; break;
                case '50': rotation = parseFloat(value) || 0; break;
            }
        }
        
        if (!blockName || !this._blockDefinitions[blockName]) return [];
        
        const blockDef = this._blockDefinitions[blockName];
        const transformedEntities = [];
        const rotRad = rotation * Math.PI / 180;
        const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
        
        for (const blockEntity of blockDef.entities) {
            transformedEntities.push({
                type: blockEntity.type,
                layer: insertLayer || blockEntity.layer,
                isClosed: blockEntity.isClosed,
                points: blockEntity.points.map(p => {
                    let x = (p.x - blockDef.basePoint.x) * scaleX;
                    let y = (p.y - blockDef.basePoint.y) * scaleY;
                    return { x: x * cos - y * sin + insertX, y: x * sin + y * cos + insertY };
                })
            });
        }
        return transformedEntities;
    },

    _extractEntitiesLegacy(dxfContent) {
        const entities = [];
        const lines = dxfContent.split(/\r?\n/);
        let currentLayer = '0';

        for (let i = 0; i < lines.length; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') currentLayer = value || '0';
            if (code === '0') {
                let entity = null;
                switch (value) {
                    case 'LINE': entity = this._parseLine(lines, i); break;
                    case 'LWPOLYLINE': entity = this._parseLWPolyline(lines, i); break;
                    case 'POLYLINE': entity = this._parsePolylineWithVertex(lines, i); break;
                    case 'CIRCLE': entity = this._parseCircle(lines, i); break;
                    case 'ARC': entity = this._parseArc(lines, i); break;
                    case 'SPLINE': entity = this._parseSpline(lines, i); break;
                    case 'ELLIPSE': entity = this._parseEllipse(lines, i); break;
                    case 'INSERT':
                        const insertEntities2 = this._parseInsert(lines, i, currentLayer);
                        if (insertEntities2) entities.push(...insertEntities2);
                        break;
                    case 'TEXT':
                    case 'MTEXT':
                        entity = this._parseText(lines, i);
                        break;
                    case 'HATCH':
                        entity = this._parseHatch(lines, i);
                        break;
                    default:
                        if (value && !['ENDSEC', 'SEQEND', 'SECTION', 'EOF'].includes(value)) {
                            this._trackIgnoredEntity(value, currentLayer, i);
                        }
                }
                if (entity && entity.points && entity.points.length >= 2) {
                    entity.layer = entity._layer || currentLayer;
                    delete entity._layer;
                    entities.push(entity);
                    this._trackEntity(value);
                    if (entity._endIndex && entity._endIndex > i) {
                        i = entity._endIndex - 2;  // V3.3 FIX: -2 weil Outer-Loop i+=2 macht
                    }
                    delete entity._endIndex;
                }
            }
        }
        return entities;
    },

    _parseLine(lines, startIndex) {
        let x1, y1, x2, y2;
        let layer = null;
        for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') layer = value;
            if (code === '10') x1 = this._snap(parseFloat(value));
            if (code === '20') y1 = this._snap(parseFloat(value));
            if (code === '11') x2 = this._snap(parseFloat(value));
            if (code === '21') y2 = this._snap(parseFloat(value));
            if (code === '0' && i > startIndex + 1) break;
        }
        if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
            const result = { type: 'LINE', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], isClosed: false };
            result._layer = layer;
            return result;
        }
        return null;
    },

    _parseLWPolyline(lines, startIndex) {
        const vertices = [];
        let x, y, flags = 0, expectedCount = 0;
        let layer = null;
        let endIndex = startIndex;

        // V3.3: Kein hartes Zeilen-Limit mehr! Abbruch nur bei nächster Entity (code 0).
        // Vorher: startIndex + 1000 → schnitt große Polylinien ab (z.B. 277 Vertices = 1126 Zeilen)
        for (let i = startIndex; i < lines.length; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') layer = value;
            if (code === '70') flags = parseInt(value, 10) || 0;
            if (code === '90') expectedCount = parseInt(value, 10) || 0;
            if (code === '10') x = this._snap(parseFloat(value));
            if (code === '20') {
                y = this._snap(parseFloat(value));
                if (x !== undefined && y !== undefined) {
                    vertices.push({ x, y, bulge: 0 });
                    x = undefined; y = undefined;
                }
            }
            if (code === '42') {
                const b = parseFloat(value);
                if (vertices.length > 0 && !isNaN(b)) {
                    vertices[vertices.length - 1].bulge = b;
                }
            }
            if (code === '0' && i > startIndex + 1) {
                endIndex = i;  // Position der nächsten Entity merken
                break;
            }
        }

        if (vertices.length < 2) return null;

        // V3.3: Warnung wenn Vertices nicht der erwarteten Anzahl entsprechen
        if (expectedCount > 0 && vertices.length !== expectedCount) {
            console.warn(`[DXF V3.5] LWPOLYLINE: erwartet ${expectedCount} Vertices, gelesen ${vertices.length}`);
        }

        const isClosed = (flags & 1) === 1;
        const points = this._expandBulgeVertices(vertices, isClosed);
        if (isClosed && points.length >= 2) {
            const first = points[0], last = points[points.length - 1];
            if (Math.hypot(last.x - first.x, last.y - first.y) > this.TOLERANCES.CLOSE) {
                points.push({ x: first.x, y: first.y });
            }
        }
        if (points.length < 2) return null;
        const result = { type: 'LWPOLYLINE', points, isClosed, flags };
        result._layer = layer;
        result._endIndex = endIndex;  // V3.3: Outer-Loop kann Entity-Daten überspringen
        return result;
    },

    _parsePolylineWithVertex(lines, startIndex) {
        const vertices = [];
        let flags = 0, inVertex = false, vx, vy, vBulge = 0;
        let layer = null;
        let endIndex = startIndex;
        for (let i = startIndex; i < lines.length; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8' && !inVertex) layer = value;
            if (code === '70' && !inVertex) flags = parseInt(value, 10) || 0;
            if (code === '0' && value === 'VERTEX') {
                // Vorherigen Vertex speichern
                if (inVertex && vx !== undefined && vy !== undefined) {
                    vertices.push({ x: vx, y: vy, bulge: vBulge || 0 });
                }
                inVertex = true; vx = undefined; vy = undefined; vBulge = 0;
            }
            if (code === '0' && value === 'SEQEND') {
                // Letzten Vertex speichern
                if (inVertex && vx !== undefined && vy !== undefined) {
                    vertices.push({ x: vx, y: vy, bulge: vBulge || 0 });
                }
                endIndex = i;
                break;
            }
            if (inVertex) {
                if (code === '10') vx = this._snap(parseFloat(value));
                if (code === '20') vy = this._snap(parseFloat(value));
                if (code === '42') vBulge = parseFloat(value) || 0;
            }
        }
        if (vertices.length < 2) return null;
        const isClosed = (flags & 1) === 1;
        console.log(`[DXF] POLYLINE: ${vertices.length} vertices, closed=${isClosed}`);
        const points = this._expandBulgeVertices(vertices, isClosed);
        if (isClosed && points.length >= 2) {
            const first = points[0], last = points[points.length - 1];
            if (Math.hypot(last.x - first.x, last.y - first.y) > this.TOLERANCES.CLOSE) {
                points.push({ x: first.x, y: first.y });
            }
        }
        if (points.length < 2) return null;
        const result = { type: 'POLYLINE', points, isClosed, flags };
        result._endIndex = endIndex;
        result._layer = layer;
        return result;
    },

    _parseCircle(lines, startIndex) {
        let cx, cy, radius;
        let layer = null;
        for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') layer = value;
            if (code === '10') cx = this._snap(parseFloat(value));
            if (code === '20') cy = this._snap(parseFloat(value));
            if (code === '40') radius = parseFloat(value);
            if (code === '0' && i > startIndex + 1) break;
        }
        if (cx === undefined || cy === undefined || radius === undefined) return null;
        const numSegments = this._adaptiveArcSegments(radius, 2 * Math.PI);
        const points = [];
        for (let j = 0; j <= numSegments; j++) {
            const angle = (j / numSegments) * 2 * Math.PI;
            points.push({ x: this._snap(cx + radius * Math.cos(angle)), y: this._snap(cy + radius * Math.sin(angle)) });
        }
        const result = { type: 'CIRCLE', points, isClosed: true, center: { x: cx, y: cy }, radius };
        result._layer = layer;
        return result;
    },

    _parseArc(lines, startIndex) {
        let cx, cy, radius, startAngle, endAngle;
        let layer = null;
        for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') layer = value;
            if (code === '10') cx = this._snap(parseFloat(value));
            if (code === '20') cy = this._snap(parseFloat(value));
            if (code === '40') radius = parseFloat(value);
            if (code === '50') startAngle = parseFloat(value) * Math.PI / 180;
            if (code === '51') endAngle = parseFloat(value) * Math.PI / 180;
            if (code === '0' && i > startIndex + 1) break;
        }
        if (cx === undefined || cy === undefined || radius === undefined || startAngle === undefined || endAngle === undefined) return null;
        if (endAngle < startAngle) endAngle += 2 * Math.PI;
        const angleSpan = endAngle - startAngle;
        const numSegments = this._adaptiveArcSegments(radius, angleSpan);
        const points = [];
        for (let j = 0; j <= numSegments; j++) {
            const angle = startAngle + (j / numSegments) * angleSpan;
            points.push({ x: this._snap(cx + radius * Math.cos(angle)), y: this._snap(cy + radius * Math.sin(angle)) });
        }
        const result = { type: 'ARC', points, isClosed: false, center: { x: cx, y: cy }, radius, startAngle, endAngle };
        result._layer = layer;
        return result;
    },

    /**
     * SPLINE Parser V2.9 - CRITICAL FIX für Code/Value-Paar Iteration
     * 
     * BUG V2.8: Parser brach ab wenn ein WERT "0" war (z.B. "74 = 0" für 0 Fit-Points)
     *           weil er "0" als neuen Entity-Start interpretierte.
     * 
     * FIX V2.9: Entity-Ende nur wenn Code "0" UND Value ein Entity-Name ist (Buchstaben enthält)
     * 
     * DXF Group Codes:
     *   70 = Flags (1=closed, 8=periodic)
     *   71 = Degree
     *   72 = Number of knots
     *   73 = Number of control points
     *   74 = Number of fit points
     *   40 = Knot values (multiple)
     *   10/20/30 = Control point X/Y/Z (multiple)
     *   11/21/31 = Fit point X/Y/Z (multiple)
     *   41 = Weights for NURBS (multiple)
     */
    _parseSpline(lines, startIndex) {
        const controlPoints = [];
        const fitPoints = [];
        const knots = [];
        const weights = [];
        let x, y, fitX, fitY;
        let flags = 0, degree = 3;
        let numKnots = 0, numControlPoints = 0, numFitPoints = 0;
        let layer = null;
        let endIndex = startIndex;

        // V2.9: Iteriere durch alle Zeilen, aber prüfe Entity-Ende korrekt
        for (let i = startIndex; i < lines.length - 1; i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();

            // V2.9 CRITICAL FIX: Entity-Ende nur wenn Code "0" UND Value ein Entity-Typ ist
            // Das unterscheidet "0\nSPLINE" (neue Entity) von "74\n0" (0 Fit-Points als Wert)
            // Entity-Namen enthalten immer Buchstaben, Werte sind rein numerisch
            if (code === '0' && i > startIndex && /[A-Z]/i.test(value)) {
                endIndex = i - 2;
                break;
            }

            if (code === '8') { layer = value; continue; }
            
            switch (code) {
                case '70': flags = parseInt(value, 10) || 0; break;
                case '71': degree = parseInt(value, 10) || 3; break;
                case '72': numKnots = parseInt(value, 10) || 0; break;
                case '73': numControlPoints = parseInt(value, 10) || 0; break;
                case '74': numFitPoints = parseInt(value, 10) || 0; break;
                
                // Knotenwerte
                case '40':
                    knots.push(parseFloat(value) || 0);
                    break;
                
                // Kontrollpunkte (X)
                case '10':
                    x = this._snap(parseFloat(value));
                    break;
                
                // Kontrollpunkte (Y) - triggert Speicherung
                case '20':
                    y = this._snap(parseFloat(value));
                    if (x !== undefined && y !== undefined) {
                        controlPoints.push({ x, y });
                        x = undefined;
                        y = undefined;
                    }
                    break;
                
                // Kontrollpunkte (Z) - ignorieren für 2D CAM
                case '30':
                    break;
                
                // Fit Points (X)
                case '11':
                    fitX = this._snap(parseFloat(value));
                    break;
                
                // Fit Points (Y) - triggert Speicherung
                case '21':
                    fitY = this._snap(parseFloat(value));
                    if (fitX !== undefined && fitY !== undefined) {
                        fitPoints.push({ x: fitX, y: fitY });
                        fitX = undefined;
                        fitY = undefined;
                    }
                    break;
                
                // Fit Points (Z) - ignorieren für 2D CAM
                case '31':
                    break;
                
                // NURBS Gewichte
                case '41':
                    weights.push(parseFloat(value) || 1);
                    break;
            }
        }
        
        // Debug-Log bei Problemen
        if (controlPoints.length < 2 && fitPoints.length < 2) {
            console.warn(`[DXF SPLINE] Keine gültigen Punkte. Erwartet: ${numControlPoints} CP, ${numFitPoints} FP. Gefunden: ${controlPoints.length} CP, ${fitPoints.length} FP`);
            return null;
        }
        
        const isClosed = (flags & 1) === 1;
        const isPeriodic = (flags & 2) === 2;  // DXF Spec: Bit 1=closed, Bit 2=periodic, Bit 3=rational, Bit 4=planar
        
        // Tessellation mit SplineUtils
        let tessellatedPoints;

        if (typeof SplineUtils !== 'undefined') {
            // Versuche B-Spline mit Kontrollpunkten wenn genug vorhanden
            if (controlPoints.length > degree) {
                tessellatedPoints = SplineUtils.tessellate(
                    controlPoints,
                    Math.min(degree, controlPoints.length - 1),
                    knots.length > 0 ? knots : null,
                    weights.length > 0 ? weights : null,
                    isClosed || isPeriodic
                );
            }
            // Fallback auf Fit-Points wenn B-Spline fehlgeschlagen oder nicht möglich
            if ((!tessellatedPoints || tessellatedPoints.length < 2) && fitPoints.length >= 2) {
                tessellatedPoints = SplineUtils.interpolate(fitPoints, degree);
            }
        } else {
            // Fallback: Kontrollpunkte als Polygon
            tessellatedPoints = controlPoints.length >= 2 ? controlPoints : fitPoints;
        }
        
        if (!tessellatedPoints || tessellatedPoints.length < 2) {
            return null;
        }
        
        const result = {
            type: 'SPLINE',
            points: tessellatedPoints,
            isClosed: isClosed || isPeriodic,
            flags,
            degree,
            _splineData: { controlPoints, fitPoints, knots, weights, degree, numKnots, numControlPoints, numFitPoints }
        };
        result._endIndex = endIndex;
        result._layer = layer;
        return result;
    },

    _parseEllipse(lines, startIndex) {
        let cx, cy, majorX, majorY, ratio, startAngle, endAngle;
        let layer = null;
        for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '8') layer = value;
            if (code === '10') cx = this._snap(parseFloat(value));
            if (code === '20') cy = this._snap(parseFloat(value));
            if (code === '11') majorX = parseFloat(value);
            if (code === '21') majorY = parseFloat(value);
            if (code === '40') ratio = parseFloat(value);
            if (code === '41') startAngle = parseFloat(value);
            if (code === '42') endAngle = parseFloat(value);
            if (code === '0' && i > startIndex + 1) break;
        }
        if (cx === undefined || cy === undefined || majorX === undefined || majorY === undefined) return null;
        ratio = ratio || 1; startAngle = startAngle || 0; endAngle = endAngle || 2 * Math.PI;
        const majorRadius = Math.hypot(majorX, majorY);
        const minorRadius = majorRadius * ratio;
        const rotation = Math.atan2(majorY, majorX);
        const points = [];
        const angleSpan = endAngle - startAngle;
        const effectiveRadius = Math.max(majorRadius, minorRadius);
        const numSegments = this._adaptiveArcSegments(effectiveRadius, Math.abs(angleSpan));
        for (let j = 0; j <= numSegments; j++) {
            const t = startAngle + (j / numSegments) * angleSpan;
            const localX = majorRadius * Math.cos(t);
            const localY = minorRadius * Math.sin(t);
            points.push({
                x: this._snap(cx + localX * Math.cos(rotation) - localY * Math.sin(rotation)),
                y: this._snap(cy + localX * Math.sin(rotation) + localY * Math.cos(rotation))
            });
        }
        const result = { type: 'ELLIPSE', points, isClosed: Math.abs(angleSpan - 2 * Math.PI) < 0.01, center: { x: cx, y: cy }, majorRadius, minorRadius };
        result._layer = layer;
        return result;
    },

    chainContours(entities, tolerance = 0.1) {
        if (!entities || entities.length === 0) return [];
        const segments = entities.map((e, idx) => ({
            points: e.points || [], used: false, layer: e.layer || '', isClosed: e.isClosed || false, type: e.type, originalIndex: idx,
            _splineData: e._splineData || null,
            _center: e.center || null, _radius: e.radius || null
        })).filter(s => s.points.length >= 2);
        const result = [];
        const cellSize = tolerance;

        // Geschlossene Segmente zuerst verarbeiten
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].isClosed) {
                segments[i].used = true;
                result.push(this._createContour(segments[i].points, segments[i].layer, true, segments[i].type, segments[i]._splineData, segments[i]._center, segments[i]._radius));
            }
        }

        // Grid für offene Segmente aufbauen
        const grid = this._buildEndpointGrid(segments, cellSize);

        for (let i = 0; i < segments.length; i++) {
            if (segments[i].used) continue;
            segments[i].used = true;
            this._removeFromGrid(grid, i, segments[i], cellSize);
            let chain = [...segments[i].points];
            // V3.3: Layer-aware Chaining — nur innerhalb gleichen Layers verketten
            const chainLayer = segments[i].layer || '';
            let changed = true;

            while (changed) {
                changed = false;

                // Ketten-Ende verlängern
                const endMatch = this._findGridMatch(grid, chain[chain.length - 1], segments, cellSize, tolerance, chainLayer);
                if (endMatch) {
                    const seg = segments[endMatch.segIdx];
                    segments[endMatch.segIdx].used = true;
                    this._removeFromGrid(grid, endMatch.segIdx, seg, cellSize);
                    if (endMatch.isStart) {
                        chain.push(...seg.points.slice(1));
                    } else {
                        chain.push(...[...seg.points].reverse().slice(1));
                    }
                    changed = true;
                    continue;
                }

                // Ketten-Anfang verlängern
                const startMatch = this._findGridMatch(grid, chain[0], segments, cellSize, tolerance, chainLayer);
                if (startMatch) {
                    const seg = segments[startMatch.segIdx];
                    segments[startMatch.segIdx].used = true;
                    this._removeFromGrid(grid, startMatch.segIdx, seg, cellSize);
                    if (startMatch.isStart) {
                        chain = [...[...seg.points].reverse().slice(0, -1), ...chain];
                    } else {
                        chain = [...seg.points.slice(0, -1), ...chain];
                    }
                    changed = true;
                    continue;
                }
            }

            const isClosed = this._dist(chain[0], chain[chain.length - 1]) < tolerance;
            if (isClosed && chain.length > 2) chain[chain.length - 1] = { x: chain[0].x, y: chain[0].y };
            result.push(this._createContour(chain, segments[i].layer, isClosed, segments[i].type, segments[i]._splineData));
        }

        // V3.3: Diagnostik — unverkettete Segmente warnen
        const unusedSegs = segments.filter(s => !s.used);
        if (unusedSegs.length > 0) {
            console.warn(`[DXF V3.5] ⚠ ${unusedSegs.length} unverkettete Segmente (Layer: ${[...new Set(unusedSegs.map(s=>s.layer))].join(',')}`);
        }

        return result;
    },

    _createContour(points, layer, isClosed, sourceType, splineData, center, radius) {
        const name = `Contour_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        if (typeof CamContour !== 'undefined') {
            const contour = new CamContour(points, { name, layer, isClosed });
            contour.sourceType = sourceType;
            if (splineData) contour._splineData = splineData;
            if (center) contour._center = center;
            if (radius) contour._radius = radius;
            return contour;
        }
        const result = { points, layer, isClosed, name, sourceType };
        if (splineData) result._splineData = splineData;
        if (center) result._center = center;
        if (radius) result._radius = radius;
        return result;
    },

    // --- V3.0: Adaptive Tessellierung ---
    _adaptiveArcSegments(radius, angleSpan) {
        const absAngle = Math.abs(angleSpan);
        if (absAngle < 1e-10 || radius < 1e-10) return 4;
        const maxDeviation = 0.01; // mm, consistent with SplineUtils.TOLERANCES.DEVIATION
        const ratio = Math.max(-1, Math.min(1, 1 - maxDeviation / radius));
        const maxAnglePerSeg = 2 * Math.acos(ratio);
        if (maxAnglePerSeg < 1e-10) return 128;
        return Math.max(4, Math.min(128, Math.ceil(absAngle / maxAnglePerSeg)));
    },

    // --- V3.0: Bulge-zu-Bogen Konvertierung ---
    _bulgeToArcPoints(p1, p2, bulge) {
        const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (chord < 1e-10) return []; // degeneriert
        const absBulge = Math.abs(bulge);
        const sagitta = absBulge * chord / 2;
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);
        const includedAngle = 4 * Math.atan(absBulge);

        // Mittelpunkt der Sehne
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        // Senkrechte zur Sehne (90° CCW rotiert)
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const px = -dy / chord;
        const py = dx / chord;

        // Abstand Mittelpunkt → Zentrum (Apothem)
        const d = radius - sagitta;

        // Zentrum: positiver Bulge = CCW (links), negativer = CW (rechts)
        const sign = bulge > 0 ? 1 : -1;
        const cx = mx + sign * d * px;
        const cy = my + sign * d * py;

        // Start-/Endwinkel vom Zentrum aus
        const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
        let endAngle = Math.atan2(p2.y - cy, p2.x - cx);

        // Winkel für Richtung anpassen
        if (bulge > 0) {
            while (endAngle <= startAngle) endAngle += 2 * Math.PI;
        } else {
            while (endAngle >= startAngle) endAngle -= 2 * Math.PI;
        }

        const numSegments = this._adaptiveArcSegments(radius, includedAngle);
        const points = [];
        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const angle = startAngle + t * (endAngle - startAngle);
            points.push({
                x: this._snap(cx + radius * Math.cos(angle)),
                y: this._snap(cy + radius * Math.sin(angle))
            });
        }
        return points;
    },

    // --- V3.0: Bulge-Vertices expandieren ---
    _expandBulgeVertices(vertices, isClosed) {
        if (!vertices || vertices.length < 2) return vertices.map(v => ({ x: v.x, y: v.y }));
        const result = [];
        const n = vertices.length;
        const segCount = isClosed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
            const v1 = vertices[i];
            const v2 = vertices[(i + 1) % n];
            result.push({ x: v1.x, y: v1.y });
            if (v1.bulge && Math.abs(v1.bulge) > 1e-10) {
                const arcPoints = this._bulgeToArcPoints(v1, v2, v1.bulge);
                result.push(...arcPoints);
            }
        }
        if (!isClosed) {
            result.push({ x: vertices[n - 1].x, y: vertices[n - 1].y });
        }
        return result;
    },

    // --- V3.0: Grid-basierte räumliche Indexierung für Chaining ---
    _gridKey(x, y, cellSize) {
        return Math.floor(x / cellSize) + ',' + Math.floor(y / cellSize);
    },

    _addToGrid(grid, x, y, cellSize, entry) {
        const key = this._gridKey(x, y, cellSize);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(entry);
    },

    _buildEndpointGrid(segments, cellSize) {
        const grid = new Map();
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].used || segments[i].isClosed) continue;
            const pts = segments[i].points;
            this._addToGrid(grid, pts[0].x, pts[0].y, cellSize, { segIdx: i, isStart: true });
            this._addToGrid(grid, pts[pts.length - 1].x, pts[pts.length - 1].y, cellSize, { segIdx: i, isStart: false });
        }
        return grid;
    },

    _removeFromGrid(grid, segIdx, segment, cellSize) {
        const pts = segment.points;
        const remove = (x, y) => {
            const key = this._gridKey(x, y, cellSize);
            const bucket = grid.get(key);
            if (!bucket) return;
            const filtered = bucket.filter(e => e.segIdx !== segIdx);
            if (filtered.length === 0) grid.delete(key);
            else grid.set(key, filtered);
        };
        remove(pts[0].x, pts[0].y);
        remove(pts[pts.length - 1].x, pts[pts.length - 1].y);
    },

    _findGridMatch(grid, point, segments, cellSize, tolerance, chainLayer) {
        const cx = Math.floor(point.x / cellSize);
        const cy = Math.floor(point.y / cellSize);
        let bestDist = tolerance;
        let bestMatch = null;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = grid.get((cx + dx) + ',' + (cy + dy));
                if (!bucket) continue;
                for (const entry of bucket) {
                    if (segments[entry.segIdx].used) continue;
                    // V3.3: Layer-Filter — nur Segmente gleichen Layers verketten
                    if (chainLayer !== undefined && segments[entry.segIdx].layer !== chainLayer) continue;
                    const pts = segments[entry.segIdx].points;
                    const ep = entry.isStart ? pts[0] : pts[pts.length - 1];
                    const dist = Math.hypot(point.x - ep.x, point.y - ep.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestMatch = { segIdx: entry.segIdx, isStart: entry.isStart, dist };
                    }
                }
            }
        }
        return bestMatch;
    },

    _snap(value) { return isNaN(value) ? 0 : Math.round(value / this.TOLERANCES.SNAP) * this.TOLERANCES.SNAP; },
    _dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); },

    _autoNormalizeEntities(entities) {
        if (!entities || entities.length === 0) return { entities, normalized: false, offsetX: 0, offsetY: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const entity of entities) {
            if (!entity.points) continue;
            for (const p of entity.points) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
            }
        }
        if (Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY)) < this.NORMALIZATION_THRESHOLD) {
            return { entities, normalized: false, offsetX: 0, offsetY: 0 };
        }
        const offsetX = minX, offsetY = minY;
        const normalizedEntities = entities.map(entity => ({
            ...entity, points: entity.points ? entity.points.map(p => ({ x: this._snap(p.x - offsetX), y: this._snap(p.y - offsetY) })) : entity.points
        }));
        return { entities: normalizedEntities, normalized: true, offsetX, offsetY };
    },

    // ════════════════════════════════════════════════════════════════
    // TEXT / MTEXT PARSER (V3.5)
    // Konvertiert Text-Entities zu Polylinien-Rechtecken (Bounding-Box)
    // Volle Glyph-Konvertierung über TextTool wenn opentype.js verfügbar
    // ════════════════════════════════════════════════════════════════

    _parseText(lines, startIndex) {
        let x = 0, y = 0, height = 10, rotation = 0, text = '', layer = null;
        let endIndex = startIndex;

        for (let i = startIndex + 2; i < Math.min(startIndex + 100, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '0' && i > startIndex + 2) { endIndex = i; break; }
            endIndex = i + 2;
            switch (code) {
                case '8': layer = value; break;
                case '10': x = parseFloat(value) || 0; break;
                case '20': y = parseFloat(value) || 0; break;
                case '40': height = parseFloat(value) || 10; break;
                case '50': rotation = parseFloat(value) || 0; break;
                case '1': text = value || ''; break;
            }
        }

        if (!text) return null;

        // Versuche opentype.js Glyph-Konvertierung wenn TextTool verfügbar
        if (typeof TextTool !== 'undefined' && TextTool.textToContours) {
            try {
                const contourData = TextTool.textToContours(text, x, y, height);
                if (contourData && contourData.points && contourData.points.length >= 2) {
                    contourData._layer = layer;
                    contourData._endIndex = endIndex;
                    contourData.sourceText = text;
                    return contourData;
                }
            } catch (e) {
                // Fallback zu Bounding-Box
            }
        }

        // Fallback: Bounding-Box Rechteck
        const approxWidth = text.length * height * 0.6;
        const rotRad = rotation * Math.PI / 180;
        const cos = Math.cos(rotRad), sin = Math.sin(rotRad);

        const corners = [
            { dx: 0, dy: 0 },
            { dx: approxWidth, dy: 0 },
            { dx: approxWidth, dy: height },
            { dx: 0, dy: height }
        ];

        const points = corners.map(c => ({
            x: this._snap(x + c.dx * cos - c.dy * sin),
            y: this._snap(y + c.dx * sin + c.dy * cos)
        }));
        points.push({ ...points[0] }); // Schließen

        console.log(`[DXF Parser V3.5] TEXT: "${text}" at (${x.toFixed(1)}, ${y.toFixed(1)}) h=${height}`);

        return {
            type: 'TEXT',
            points,
            isClosed: true,
            _layer: layer,
            _endIndex: endIndex,
            sourceText: text
        };
    },

    // ════════════════════════════════════════════════════════════════
    // HATCH PARSER (V3.5)
    // Extrahiert Boundary-Pfade aus HATCH-Entities
    // ════════════════════════════════════════════════════════════════

    _parseHatch(lines, startIndex) {
        let layer = null;
        let endIndex = startIndex;
        const boundaryPoints = [];
        let inBoundary = false;
        let pathType = 0;

        for (let i = startIndex + 2; i < Math.min(startIndex + 2000, lines.length); i += 2) {
            const code = lines[i]?.trim();
            const value = lines[i + 1]?.trim();
            if (code === '0') { endIndex = i; break; }
            endIndex = i + 2;

            switch (code) {
                case '8': layer = value; break;
                case '91': // Anzahl Boundary-Pfade
                    inBoundary = true;
                    break;
                case '92': // Boundary-Typ
                    pathType = parseInt(value) || 0;
                    break;
                case '10':
                    if (inBoundary) {
                        const px = parseFloat(value) || 0;
                        // Nächste Zeile sollte Code 20 sein
                        const nextCode = lines[i + 2]?.trim();
                        const nextVal = lines[i + 3]?.trim();
                        if (nextCode === '20') {
                            const py = parseFloat(nextVal) || 0;
                            boundaryPoints.push({ x: this._snap(px), y: this._snap(py) });
                        }
                    }
                    break;
            }
        }

        if (boundaryPoints.length < 3) return null;

        // Schließen
        const first = boundaryPoints[0];
        const last = boundaryPoints[boundaryPoints.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > 0.01) {
            boundaryPoints.push({ ...first });
        }

        console.log(`[DXF Parser V3.5] HATCH: ${boundaryPoints.length} boundary points`);

        return {
            type: 'HATCH',
            points: boundaryPoints,
            isClosed: true,
            _layer: layer,
            _endIndex: endIndex
        };
    },

    _calculateBounds(contours) {
        if (!contours || contours.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const contour of contours) {
            const pts = contour.points || contour;
            for (const p of pts) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
            }
        }
        return { minX, minY, maxX, maxY };
    }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = DXFParser; }
