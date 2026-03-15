#!/usr/bin/env node
/**
 * sync-versions.js — Synchronisiert Modul-Versionen aus build-info.js in CLAUDE.md
 *
 * Liest CERACUT_BUILD.modules aus build-info.js und aktualisiert:
 *   1. Header (Version, Build, Datum)
 *   2. Modul-Tabelle (## Module & Versionen)
 *   3. Dateistruktur-Baum (Versions-Kommentare)
 *   4. Sync-Prüfung (Console-Ausgabe-Block)
 *
 * Usage:  node scripts/sync-versions.js [--check]
 *   --check: Nur prüfen, nicht schreiben (Exit 1 bei Abweichungen)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_INFO = path.join(ROOT, 'js', 'build-info.js');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const INDEX_HTML = path.join(ROOT, 'index.html');

// ── build-info.js laden ──
function loadBuildInfo() {
    const src = fs.readFileSync(BUILD_INFO, 'utf-8');

    // Version + Build aus Top-Level
    const version = src.match(/version:\s*'([^']+)'/)?.[1];
    const build = src.match(/build:\s*'([^']+)'/)?.[1];
    const date = src.match(/date:\s*'([^']+)'/)?.[1];

    // Module extrahieren
    const modules = {};
    const moduleBlock = src.match(/modules:\s*\{([\s\S]*?)\n    \}/)?.[1];
    if (moduleBlock) {
        const re = /'([^']+)':\s*\{\s*version:\s*'([^']+)',\s*build:\s*'([^']+)'\s*\}/g;
        let m;
        while ((m = re.exec(moduleBlock)) !== null) {
            modules[m[1]] = { version: m[2], build: m[3] };
        }
    }

    return { version, build, date, modules };
}

// ── Mapping: build-info Modul-Key → CLAUDE.md Dateiname ──
const MODULE_TO_FILE = {
    'dxf-parser':         'dxf-parser.js',
    'geometry':           'geometry.js',
    'geometry-ops':       'geometry-ops.js',
    'pipeline':           'ceracut-pipeline.js',
    'cam-contour':        'cam-contour.js',
    'canvas-renderer':    'canvas-renderer.js',
    'undo-manager':       'undo-manager.js',
    'sinumerik-pp':       'sinumerik-postprocessor.js',
    'command-line':       'command-line.js',
    'snap-manager':       'snap-manager.js',
    'drawing-tools':      'drawing-tools.js',
    'drawing-tools-ext':  'drawing-tools-ext.js',
    'dynamic-input':      'dynamic-input.js',
    'tool-manager':       'tool-manager.js',
    'layer-manager':      'layer-manager.js',
    'text-tool':          'text-tool.js',
    'dxf-writer':         'dxf-writer.js',
    'app':                'app.js',
    'project-manager':    'project-manager.js',
    'properties-panel':   'properties-panel.js',
    'debug-monitor':      'debug-monitor.js',
    'nesting':            'nesting.js',
    'toolpath-simulator': 'toolpath-simulator.js',
    'cost-calculator':    'cost-calculator.js',
    'machine-profiles':   'machine-profiles.js',
    'bridge-cutting':     'bridge-cutting.js',
    'quality-zones':      'quality-zones.js',
    'advanced-tools':     'advanced-tools.js',
    'arc-fitting':        'arc-fitting.js',
};

function syncClaudeMd(info, checkOnly) {
    let md = fs.readFileSync(CLAUDE_MD, 'utf-8');
    const original = md;
    let changes = [];

    // 1. Header: Version, Build, Datum
    md = md.replace(
        /> \*\*Letzte Aktualisierung:\*\* .+/,
        `> **Letzte Aktualisierung:** ${info.date}`
    );
    md = md.replace(
        /> \*\*Version:\*\* V[\d.]+/,
        `> **Version:** V${info.version}`
    );
    md = md.replace(
        /> \*\*Build:\*\* .+/,
        `> **Build:** ${info.build}`
    );

    // 2. Modul-Tabelle: Zeilen mit `| ... | `datei.js` | V... |` aktualisieren
    for (const [key, mod] of Object.entries(info.modules)) {
        const file = MODULE_TO_FILE[key];
        if (!file) continue;

        // Suche Zeile mit diesem Dateinamen in der Tabelle
        const escapedFile = file.replace('.', '\\.');
        const tableRe = new RegExp(
            `(\\|[^|]+\\|\\s*\`${escapedFile}\`\\s*\\|)\\s*\\**V?[\\d.]+\\**\\s*(\\|)`,
        );
        const match = md.match(tableRe);
        if (match) {
            const oldLine = match[0];
            const newLine = `${match[1]} **V${mod.version}** ${match[2]}`;
            if (oldLine !== newLine) {
                md = md.replace(oldLine, newLine);
                changes.push(`  Tabelle: ${file} → V${mod.version}`);
            }
        }
    }

    // 3. Modul-Tabelle Stand-Datum
    md = md.replace(
        /## Module & Versionen \(Stand [\d-]+\)/,
        `## Module & Versionen (Stand ${info.date})`
    );

    // 4. Build-Info Zeile in Tabelle
    const buildInfoRe = /(\|\s*\*\*Build-Info\*\*\s*\|\s*`build-info\.js`\s*\|)\s*\**V?[\d.]+\**\s*(\|)/;
    const biMatch = md.match(buildInfoRe);
    if (biMatch) {
        const oldLine = biMatch[0];
        const newLine = `${biMatch[1]} **V${info.version}** ${biMatch[2]}`;
        if (oldLine !== newLine) {
            md = md.replace(oldLine, newLine);
            changes.push(`  Tabelle: build-info.js → V${info.version}`);
        }
    }

    // 5. Dateistruktur-Baum: `├── datei.js  ← Beschreibung Vx.y`
    for (const [key, mod] of Object.entries(info.modules)) {
        const file = MODULE_TO_FILE[key];
        if (!file) continue;

        const escapedFile = file.replace('.', '\\.');
        const treeRe = new RegExp(
            `(│\\s+├── ${escapedFile}\\s+← .+?)V[\\d.]+(.*)$`,
            'm'
        );
        const treeMatch = md.match(treeRe);
        if (treeMatch) {
            const oldLine = treeMatch[0];
            const newLine = `${treeMatch[1]}V${mod.version}${treeMatch[2]}`;
            if (oldLine !== newLine) {
                md = md.replace(oldLine, newLine);
                changes.push(`  Baum: ${file} → V${mod.version}`);
            }
        }
    }
    // build-info.js im Baum
    {
        const treeRe = /(│\s+├── build-info\.js\s+← .+?)V[\d.]+(.*?)$/m;
        const treeMatch = md.match(treeRe);
        if (treeMatch) {
            const oldLine = treeMatch[0];
            const newLine = `${treeMatch[1]}V${info.version}${treeMatch[2]}`;
            if (oldLine !== newLine) {
                md = md.replace(oldLine, newLine);
                changes.push(`  Baum: build-info.js → V${info.version}`);
            }
        }
    }
    // app.js im Baum
    {
        const treeRe = /(│\s+├── app\.js\s+← .+?)V[\d.]+(.*?)$/m;
        const treeMatch = md.match(treeRe);
        if (treeMatch) {
            const oldLine = treeMatch[0];
            const newLine = `${treeMatch[1]}V${info.version}${treeMatch[2]}`;
            if (oldLine !== newLine) {
                md = md.replace(oldLine, newLine);
                changes.push(`  Baum: app.js → V${info.version}`);
            }
        }
    }

    // 6. Sync-Prüfung: Console-Block aktualisieren
    md = md.replace(
        /CeraCUT\/CeraCUT V[\d.]+ - Build [\w-]+/,
        `CeraCUT/CeraCUT V${info.version} - Build ${info.build}`
    );

    // Einzelne Modul-Zeilen im Sync-Block
    for (const [key, mod] of Object.entries(info.modules)) {
        const syncRe = new RegExp(
            `(  ${key.replace('-', '\\-')}:\\s*)V[\\d.]+\\s*\\([\\w-]+\\)`,
        );
        const syncMatch = md.match(syncRe);
        if (syncMatch) {
            const oldLine = syncMatch[0];
            const newLine = `${syncMatch[1]}V${mod.version} (${mod.build})`;
            if (oldLine !== newLine) {
                md = md.replace(oldLine, newLine);
                changes.push(`  Sync: ${key} → V${mod.version}`);
            }
        }
    }

    // Ergebnis
    if (md === original) {
        console.log('[sync-versions] ✅ CLAUDE.md ist aktuell — keine Änderungen');
        return 0;
    }

    if (checkOnly) {
        console.log('[sync-versions] ❌ CLAUDE.md hat Abweichungen:');
        changes.forEach(c => console.log(c));
        return 1;
    }

    fs.writeFileSync(CLAUDE_MD, md, 'utf-8');
    console.log(`[sync-versions] ✅ CLAUDE.md aktualisiert (${changes.length} Änderungen):`);
    changes.forEach(c => console.log(c));
    return 0;
}

// ── index.html synchronisieren ──
function syncIndexHtml(info, checkOnly) {
    let html = fs.readFileSync(INDEX_HTML, 'utf-8');
    const original = html;
    let changes = [];

    // <title>CeraCUT Vx.y — Wasserstrahl CAM</title>
    html = html.replace(
        /(<title>CeraCUT V)[\d.]+( — Wasserstrahl CAM<\/title>)/,
        `$1${info.version}$2`
    );

    // Header-Zeile: "Keine Datei geladen" — CeraCUT Vx.y
    html = html.replace(
        /(— CeraCUT V)[\d.]+/,
        `$1${info.version}`
    );

    // Cache-Busting: build-info.js
    html = html.replace(
        /(build-info\.js\?v=)[\w-]+/,
        `$1${info.build}`
    );

    if (html === original) {
        console.log('[sync-versions] ✅ index.html ist aktuell');
        return 0;
    }

    // Diff zählen
    const origLines = original.split('\n');
    const newLines = html.split('\n');
    for (let i = 0; i < origLines.length; i++) {
        if (origLines[i] !== newLines[i]) changes.push(`  index.html:${i + 1}`);
    }

    if (checkOnly) {
        console.log(`[sync-versions] ❌ index.html hat Abweichungen (${changes.length} Zeilen)`);
        return 1;
    }

    fs.writeFileSync(INDEX_HTML, html, 'utf-8');
    console.log(`[sync-versions] ✅ index.html aktualisiert (${changes.length} Zeilen)`);
    return 0;
}

// ── Main ──
const checkOnly = process.argv.includes('--check');
const info = loadBuildInfo();

if (!info.version || !info.build) {
    console.error('[sync-versions] ❌ Konnte build-info.js nicht parsen');
    process.exit(1);
}

console.log(`[sync-versions] build-info.js: V${info.version} (${info.build}), ${Object.keys(info.modules).length} Module`);
const rc1 = syncClaudeMd(info, checkOnly);
const rc2 = syncIndexHtml(info, checkOnly);
process.exit(rc1 || rc2);
