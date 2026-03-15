/**
 * CeraCUT Server
 *
 * Statischer Dateiserver + DXF-Browse-API für Netzlaufwerk-Zugriff.
 * Ersetzt `npx serve .` und stellt zusätzlich /api/dxf/* Endpunkte bereit.
 *
 * HTTPS wird automatisch aktiviert wenn Zertifikate unter certs/ vorhanden sind.
 * Beim ersten Start ohne Zertifikate werden Self-Signed Certs automatisch generiert
 * (erfordert `openssl` im PATH).
 *
 * Umgebungsvariablen:
 *   PORT      — Server-Port (default: 5000)
 *   DXF_ROOT  — Wurzelverzeichnis für DXF-Dateien (default: /mnt/dxf)
 *   TLS_CERT  — Pfad zum Zertifikat (default: certs/server.crt)
 *   TLS_KEY   — Pfad zum privaten Schlüssel (default: certs/server.key)
 *   NO_HTTPS  — auf "1" setzen um HTTPS zu deaktivieren
 *
 * Starten:
 *   node server.js                              # HTTPS (auto-generierte Certs)
 *   NO_HTTPS=1 node server.js                   # nur HTTP
 *   PORT=3000 DXF_ROOT=/pfad/zu/dxf node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execSync } = require('child_process');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const DXF_ROOT = path.resolve(process.env.DXF_ROOT || '/mnt/dxf');
const STATIC_ROOT = __dirname;
const NO_HTTPS = process.env.NO_HTTPS === '1';

const CERT_DIR = path.join(__dirname, 'certs');
const CERT_PATH = process.env.TLS_CERT || path.join(CERT_DIR, 'server.crt');
const KEY_PATH = process.env.TLS_KEY || path.join(CERT_DIR, 'server.key');

// MIME-Types für statische Dateien
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.otf':  'font/otf',
    '.dxf':  'application/octet-stream',
    '.mpf':  'text/plain; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
};

// ── TLS / Self-Signed Cert ──────────────────────────────────────────

/**
 * Ermittelt alle lokalen IPv4-Adressen (nicht-loopback).
 */
function getLocalIPs() {
    const os = require('os');
    const ips = [];
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) {
                ips.push(addr.address);
            }
        }
    }
    return ips;
}

/**
 * Generiert ein Self-Signed Zertifikat via openssl.
 * Gültig für localhost + private IP-Bereiche (SAN).
 */
function generateSelfSignedCert() {
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR, { recursive: true });
    }

    console.log('[CeraCUT Server] Generiere Self-Signed Zertifikat...');

    // Eigene IP-Adressen ermitteln für SAN
    const ipAddresses = getLocalIPs();
    let altNames = 'DNS.1 = localhost\nIP.1 = 127.0.0.1\n';
    ipAddresses.forEach((ip, i) => {
        altNames += `IP.${i + 2} = ${ip}\n`;
    });

    // OpenSSL-Config mit SAN für lokale Netzwerke
    const opensslConf = path.join(CERT_DIR, 'openssl.cnf');
    fs.writeFileSync(opensslConf, `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = DE
O = Cerasell GmbH
CN = CeraCUT Server

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
${altNames}`);

    try {
        execSync(
            `openssl req -x509 -nodes -newkey rsa:2048 ` +
            `-keyout "${KEY_PATH}" -out "${CERT_PATH}" ` +
            `-days 3650 -config "${opensslConf}"`,
            { stdio: 'pipe' }
        );
        // Config aufräumen
        fs.unlinkSync(opensslConf);
        console.log('[CeraCUT Server] Zertifikat generiert: certs/server.crt + certs/server.key');
        console.log('[CeraCUT Server] Gültig für 10 Jahre.');
        console.log('[CeraCUT Server] HINWEIS: Browser wird beim ersten Zugriff eine Sicherheitswarnung zeigen.');
        console.log('[CeraCUT Server]          → "Erweitert" → "Weiter zu ... (unsicher)" klicken.');
        return true;
    } catch (err) {
        console.error('[CeraCUT Server] openssl nicht gefunden oder fehlgeschlagen:', err.message);
        console.error('[CeraCUT Server] Fallback auf HTTP.');
        return false;
    }
}

/**
 * Prüft ob TLS-Zertifikate vorhanden sind, generiert sie bei Bedarf.
 * @returns {{ cert, key } | null}
 */
function loadTLSCredentials() {
    if (NO_HTTPS) return null;

    // Zertifikate vorhanden?
    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
        if (!generateSelfSignedCert()) return null;
    }

    try {
        return {
            cert: fs.readFileSync(CERT_PATH),
            key: fs.readFileSync(KEY_PATH),
        };
    } catch (err) {
        console.error('[CeraCUT Server] TLS-Zertifikate nicht lesbar:', err.message);
        return null;
    }
}

// ── Hilfsfunktionen ─────────────────────────────────────────────────

/**
 * Path-Traversal-Schutz: Prüft ob der aufgelöste Pfad innerhalb von root liegt.
 */
function safePath(root, userPath) {
    const resolved = path.resolve(root, userPath || '');
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return null;
    }
    return resolved;
}

/**
 * JSON-Antwort senden
 */
function sendJSON(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

// ── API-Handler ─────────────────────────────────────────────────────

/**
 * API: GET /api/dxf/list?path=
 * Listet Verzeichnisinhalt (nur .dxf-Dateien und Unterordner).
 */
function handleDXFList(res, queryPath) {
    const dirPath = safePath(DXF_ROOT, queryPath);
    if (!dirPath) {
        return sendJSON(res, 403, { error: 'Zugriff verweigert' });
    }

    fs.stat(dirPath, (err, stats) => {
        if (err || !stats.isDirectory()) {
            return sendJSON(res, 404, { error: 'Verzeichnis nicht gefunden' });
        }

        fs.readdir(dirPath, { withFileTypes: true }, (err2, entries) => {
            if (err2) {
                return sendJSON(res, 500, { error: 'Lesefehler' });
            }

            const items = [];
            for (const entry of entries) {
                // Versteckte Dateien überspringen
                if (entry.name.startsWith('.')) continue;

                if (entry.isDirectory()) {
                    items.push({ name: entry.name, type: 'directory' });
                } else if (entry.name.toLowerCase().endsWith('.dxf')) {
                    // Dateigröße ermitteln
                    try {
                        const stat = fs.statSync(path.join(dirPath, entry.name));
                        items.push({
                            name: entry.name,
                            type: 'file',
                            size: stat.size,
                        });
                    } catch {
                        items.push({ name: entry.name, type: 'file', size: 0 });
                    }
                }
            }

            // Ordner zuerst, dann Dateien, jeweils alphabetisch
            items.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name, 'de');
            });

            sendJSON(res, 200, {
                path: queryPath || '',
                items: items,
            });
        });
    });
}

/**
 * API: GET /api/dxf/file?path=
 * Liefert DXF-Dateiinhalt (ISO-8859-1 raw bytes).
 */
function handleDXFFile(res, queryPath) {
    if (!queryPath) {
        return sendJSON(res, 400, { error: 'Pfad fehlt' });
    }

    const filePath = safePath(DXF_ROOT, queryPath);
    if (!filePath) {
        return sendJSON(res, 403, { error: 'Zugriff verweigert' });
    }

    if (!filePath.toLowerCase().endsWith('.dxf')) {
        return sendJSON(res, 403, { error: 'Nur DXF-Dateien erlaubt' });
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return sendJSON(res, 404, { error: 'Datei nicht gefunden' });
        }

        // DXF als binary lesen (ISO-8859-1 kompatibel)
        fs.readFile(filePath, (err2, buffer) => {
            if (err2) {
                return sendJSON(res, 500, { error: 'Lesefehler' });
            }

            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': buffer.length,
                'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
            });
            res.end(buffer);
        });
    });
}

/**
 * Statische Dateien aus dem Projektverzeichnis ausliefern.
 */
function handleStatic(req, res, pathname) {
    // Default: index.html
    let filePath = path.join(STATIC_ROOT, pathname === '/' ? 'index.html' : pathname);

    // Path-Traversal-Schutz für statische Dateien
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(STATIC_ROOT + path.sep) && resolved !== STATIC_ROOT) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(resolved, (err, stats) => {
        if (err || !stats.isFile()) {
            // Versuche index.html im Verzeichnis
            if (!err && stats && stats.isDirectory()) {
                const indexPath = path.join(resolved, 'index.html');
                return fs.readFile(indexPath, (err2, data) => {
                    if (err2) {
                        res.writeHead(404);
                        return res.end('Not Found');
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(data);
                });
            }
            res.writeHead(404);
            return res.end('Not Found');
        }

        const ext = path.extname(resolved).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(resolved, (err2, data) => {
            if (err2) {
                res.writeHead(500);
                return res.end('Internal Server Error');
            }
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': data.length,
                'Cache-Control': 'no-cache',
            });
            res.end(data);
        });
    });
}

// ── Request-Handler ─────────────────────────────────────────────────

function requestHandler(req, res) {
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    // API-Routen
    if (pathname === '/api/dxf/list' && req.method === 'GET') {
        return handleDXFList(res, parsed.query.path || '');
    }

    if (pathname === '/api/dxf/file' && req.method === 'GET') {
        return handleDXFFile(res, parsed.query.path || '');
    }

    // Health-Check
    if (pathname === '/api/health') {
        return sendJSON(res, 200, { status: 'ok', dxfRoot: DXF_ROOT, https: !!tlsCreds });
    }

    // Statische Dateien
    handleStatic(req, res, pathname);
}

// ── Server erstellen ────────────────────────────────────────────────

const tlsCreds = loadTLSCredentials();

let server;
let protocol;

if (tlsCreds) {
    // HTTPS-Server
    server = https.createServer(tlsCreds, requestHandler);
    protocol = 'https';

    // HTTP → HTTPS Redirect auf Port 80 (falls verfügbar)
    const redirectPort = PORT === 443 ? 80 : PORT + 1000;
    try {
        const redirectServer = http.createServer((req, res) => {
            const host = (req.headers.host || '').replace(/:\d+$/, '');
            const target = `https://${host}:${PORT}${req.url}`;
            res.writeHead(301, { Location: target });
            res.end();
        });
        redirectServer.listen(redirectPort, () => {
            console.log(`[CeraCUT Server] HTTP→HTTPS Redirect auf Port ${redirectPort}`);
        });
        redirectServer.on('error', () => {
            // Port belegt — kein Redirect, kein Problem
        });
    } catch {
        // Redirect optional — ignorieren
    }
} else {
    // HTTP-Server (Fallback)
    server = http.createServer(requestHandler);
    protocol = 'http';
}

server.listen(PORT, () => {
    console.log(`[CeraCUT Server] Gestartet: ${protocol}://localhost:${PORT}`);
    console.log(`[CeraCUT Server] Statische Dateien: ${STATIC_ROOT}`);
    console.log(`[CeraCUT Server] DXF-Root: ${DXF_ROOT}`);

    if (protocol === 'https') {
        console.log(`[CeraCUT Server] HTTPS aktiv — File System Access API verfügbar`);
    } else {
        console.warn(`[CeraCUT Server] WARNUNG: Nur HTTP — File System Access API wird im Browser NICHT funktionieren!`);
        console.warn(`[CeraCUT Server] Starte ohne NO_HTTPS=1 für automatische Zertifikat-Generierung.`);
    }

    // Prüfen ob DXF_ROOT existiert
    if (!fs.existsSync(DXF_ROOT)) {
        console.warn(`[CeraCUT Server] WARNUNG: DXF-Root "${DXF_ROOT}" existiert nicht!`);
        console.warn(`[CeraCUT Server] Server-DXF-Browse wird nicht funktionieren.`);
        console.warn(`[CeraCUT Server] Setze DXF_ROOT auf ein gültiges Verzeichnis.`);
    }
});
