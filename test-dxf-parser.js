/**
 * WARICAM DXF Parser Test Suite
 * Testet alle DXF-Dateien im Examples-Verzeichnis
 * 
 * Ausführen: node test-dxf-parser.js
 */

const fs = require('fs');
const path = require('path');

// Module laden
const geometryCode = fs.readFileSync(path.join(__dirname, 'js/geometry.js'), 'utf8');
const parserCode = fs.readFileSync(path.join(__dirname, 'js/dxf-parser.js'), 'utf8');

// Module evaluieren (Browser-Globals simulieren)
eval(geometryCode);
eval(parserCode);

// Test-Verzeichnis
const EXAMPLES_DIR = path.join(__dirname, 'Examples');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  WARICAM DXF Parser Test Suite V2.8                          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// Alle DXF-Dateien finden
const dxfFiles = fs.readdirSync(EXAMPLES_DIR)
    .filter(f => f.toLowerCase().endsWith('.dxf'))
    .map(f => path.join(EXAMPLES_DIR, f));

if (dxfFiles.length === 0) {
    console.log('❌ Keine DXF-Dateien im Examples-Verzeichnis gefunden!');
    console.log(`   Pfad: ${EXAMPLES_DIR}`);
    process.exit(1);
}

console.log(`📁 Gefunden: ${dxfFiles.length} DXF-Datei(en)\n`);

// Ergebnisse sammeln
const results = [];

for (const filePath of dxfFiles) {
    const fileName = path.basename(filePath);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 ${fileName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileSize = (content.length / 1024).toFixed(1);
        
        console.log(`   Größe: ${fileSize} KB`);
        
        // Parsen
        const startTime = Date.now();
        const result = DXFParser.parse(content);
        const parseTime = Date.now() - startTime;
        
        if (result.success) {
            console.log(`   ✅ Parsing erfolgreich in ${parseTime}ms`);
            console.log(`   📊 Entities: ${result.stats?.totalEntities || 0}`);
            console.log(`   📊 Konturen: ${result.stats?.totalContours || 0} (${result.stats?.closedContours || 0} geschlossen, ${result.stats?.openContours || 0} offen)`);
            console.log(`   📊 Layer: ${result.stats?.layerCount || 0}`);
            
            // Entity-Statistik
            if (result.stats) {
                const entityTypes = Object.entries(result.stats)
                    .filter(([k, v]) => typeof v === 'number' && !['totalEntities', 'totalContours', 'closedContours', 'openContours', 'layerCount', 'parseTime'].includes(k))
                    .map(([k, v]) => `${k}:${v}`)
                    .join(', ');
                if (entityTypes) {
                    console.log(`   📊 Entity-Typen: ${entityTypes}`);
                }
            }
            
            // Warnungen
            if (result.warnings && result.warnings.length > 0) {
                console.log(`   ⚠️  Warnungen: ${result.warnings.length}`);
                for (const warn of result.warnings) {
                    console.log(`      - ${warn.message}`);
                }
            }
            
            // Ignorierte Entities
            if (result.ignoredCount > 0) {
                console.log(`   ⚠️  Ignoriert: ${result.ignoredCount} (${result.ignoredTypes.join(', ')})`);
            }
            
            results.push({
                file: fileName,
                success: true,
                entities: result.stats?.totalEntities || 0,
                contours: result.stats?.totalContours || 0,
                closed: result.stats?.closedContours || 0,
                open: result.stats?.openContours || 0,
                ignored: result.ignoredCount || 0,
                parseTime
            });
            
        } else {
            console.log(`   ❌ Parsing fehlgeschlagen: ${result.error}`);
            results.push({
                file: fileName,
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        console.log(`   ❌ Fehler: ${error.message}`);
        results.push({
            file: fileName,
            success: false,
            error: error.message
        });
    }
    
    console.log('');
}

// Zusammenfassung
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  ZUSAMMENFASSUNG                                             ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

console.log(`\n✅ Erfolgreich: ${successful.length}/${results.length}`);
if (failed.length > 0) {
    console.log(`❌ Fehlgeschlagen: ${failed.length}`);
    for (const f of failed) {
        console.log(`   - ${f.file}: ${f.error}`);
    }
}

// Statistik-Tabelle
if (successful.length > 0) {
    console.log('\n┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('│ Datei                       │ Entities │ Konturen │ Geschl.  │ Offen    │ Zeit     │');
    console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');
    for (const r of successful) {
        const name = r.file.substring(0, 27).padEnd(27);
        const ent = String(r.entities).padStart(8);
        const cont = String(r.contours).padStart(8);
        const closed = String(r.closed).padStart(8);
        const open = String(r.open).padStart(8);
        const time = `${r.parseTime}ms`.padStart(8);
        console.log(`│ ${name} │ ${ent} │ ${cont} │ ${closed} │ ${open} │ ${time} │`);
    }
    console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
}

// Totale
const totalEntities = successful.reduce((sum, r) => sum + r.entities, 0);
const totalContours = successful.reduce((sum, r) => sum + r.contours, 0);
const totalIgnored = successful.reduce((sum, r) => sum + r.ignored, 0);

console.log(`\n📈 Gesamt: ${totalEntities} Entities → ${totalContours} Konturen`);
if (totalIgnored > 0) {
    console.log(`⚠️  Gesamt ignoriert: ${totalIgnored}`);
}

console.log('\n✨ Test abgeschlossen!');
