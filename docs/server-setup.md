# CeraCUT Server-Einrichtung — Debian

Anleitung fuer den CNC-Rechner als CeraCUT-Webserver.
Alle Clients im Netzwerk greifen per Browser zu — kein Install noetig.

```
Dev-Rechner → git push → GitHub → git pull → CNC-Server (Debian)
                                                  ↓
                                          node server.js
                                                  ↓
                              Windows/Linux-Clients → http://cnc-ip:5000
                                                  ↓
                                          /mnt/dxf → DXF-Browse API
```

---

## 1. Grundpakete (als root)

```bash
apt update && apt install -y git nodejs npm curl ufw
```

---

## 2. Repo klonen (als User CNC)

```bash
cd /home/CNC
git clone https://github.com/Hinske/ceraCUT.git
cd ceraCUT
```

Falls privates Repo — SSH-Key einrichten:

```bash
ssh-keygen -t ed25519 -C "cnc@cerasell"
cat ~/.ssh/id_ed25519.pub
# → Key in GitHub unter Settings → SSH Keys einfuegen
git clone git@github.com:Hinske/ceraCUT.git
```

---

## 3. Webserver starten

Kein `npm install` noetig — `server.js` nutzt nur Node.js built-in Module.

HTTPS wird beim ersten Start automatisch eingerichtet (Self-Signed Zertifikat via openssl).
Das ist noetig damit die File System Access API (Workspace, Strg+S) im Browser funktioniert.

Testen:

```bash
cd /home/CNC/ceraCUT
node server.js
# → Generiert automatisch certs/server.crt + certs/server.key (10 Jahre gueltig)
# → Browser: https://localhost:5000
# → DXF-Browse API: https://localhost:5000/api/dxf/list
```

Beim ersten Zugriff im Browser: "Erweitert" → "Weiter zu ... (unsicher)" klicken.

Ohne HTTPS starten (Fallback, FSAPI funktioniert dann NICHT):

```bash
NO_HTTPS=1 node server.js
```

DXF-Netzlaufwerk mounten (optional, fuer Server-Browse):

```bash
# Windows-Freigabe mounten
apt install -y cifs-utils
mkdir -p /mnt/dxf
mount -t cifs //server/dxf /mnt/dxf -o username=user,password=pass,iocharset=utf8
# → Permanent: Eintrag in /etc/fstab
```

DXF_ROOT konfigurieren (default: `/mnt/dxf`):

```bash
DXF_ROOT=/pfad/zu/dxf node server.js
```

---

## 4. Systemd-Service (als root)

```bash
tee /etc/systemd/system/ceracut.service << 'EOF'
[Unit]
Description=CeraCUT Webserver
After=network.target

[Service]
Type=simple
User=CNC
WorkingDirectory=/home/CNC/ceraCUT
ExecStart=/usr/bin/node /home/CNC/ceraCUT/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=DXF_ROOT=/mnt/dxf
# HTTPS wird automatisch aktiviert (Self-Signed Cert in certs/)

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ceracut
systemctl start ceracut
systemctl status ceracut
```

---

## 5. Firewall (als root)

```bash
ufw allow 5000/tcp
ufw allow ssh
ufw enable
```

---

## 6. Auto-Update (als root)

Update-Script (restart bei server.js-Aenderung):

```bash
tee /usr/local/bin/ceracut-update << 'EOF'
#!/bin/bash
cd /home/CNC/ceraCUT

# Aktuellen Commit merken
OLD_HEAD=$(git rev-parse HEAD)

# Pullen
OUTPUT=$(git pull --ff-only origin main 2>&1)
echo "$OUTPUT" | logger -t ceracut-update

NEW_HEAD=$(git rev-parse HEAD)

# Nichts geaendert? → fertig
[ "$OLD_HEAD" = "$NEW_HEAD" ] && exit 0

# Prüfen ob server.js sich geaendert hat → Neustart
if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -q '^server\.js$'; then
    echo "server.js geaendert — Neustart" | logger -t ceracut-update
    systemctl restart ceracut
fi
EOF
chmod +x /usr/local/bin/ceracut-update
```

Cronjob — alle 5 Minuten (als root, da systemctl restart root braucht):

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/ceracut-update") | crontab -
```

Logs pruefen:

```bash
journalctl -t ceracut-update --since "1 hour ago"
```

---

## 7. Zugriff testen

```bash
# IP herausfinden:
ip addr show | grep "inet " | grep -v 127.0.0.1

# Von jedem Rechner im Netzwerk:
# Browser → https://192.168.x.x:5000
```

---

## 8. Client-Einrichtung

Kein Install noetig — nur Browser.

**Desktop-Shortcut (Chrome):**
Browser → `http://cnc-server-ip:5000` → Menu (⋮) → "Als App installieren"
→ Erstellt Desktop-Icon ohne Browser-UI.

**Manueller Bookmark:**

| Feld | Wert |
|------|------|
| Name | CeraCUT |
| URL | `http://192.168.x.x:5000` |

---

## Zusammenfassung

| Komponente | Details |
|------------|---------|
| Dev-Rechner | `git push` nach Aenderungen |
| CNC-Server | Zieht automatisch alle 5 Min per `git pull` |
| Clients | Browser → `http://cnc-server-ip:5000` |
| CNC-Export | Download-Dialog (oder FSAPI wenn direkt am Server) |
| Neustart | Automatisch via systemd nach Reboot |
| Logs | `journalctl -u ceracut` / `journalctl -t ceracut-update` |

---

## Troubleshooting

**Server laeuft nicht:**
```bash
systemctl status ceracut
journalctl -u ceracut -n 50
```

**Port blockiert:**
```bash
ufw status
ss -tlnp | grep 5000
```

**Git pull schlaegt fehl:**
```bash
cd /home/CNC/ceraCUT
git status
git stash  # Lokale Aenderungen sichern
git pull --ff-only origin main
```

**Falscher serve-Pfad:**
```bash
which serve
# Falls nicht /usr/local/bin/serve → ExecStart in ceracut.service anpassen
```
