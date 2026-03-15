# WARICAM Server-Einrichtung — Debian

Anleitung fuer den CNC-Rechner als WARICAM-Webserver.
Alle Clients im Netzwerk greifen per Browser zu — kein Install noetig.

```
Dev-Rechner → git push → GitHub → git pull → CNC-Server (Debian)
                                                  ↓
                                          serve . -p 5000
                                                  ↓
                              Windows/Linux-Clients → http://cnc-ip:5000
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
git clone https://github.com/EUER-REPO/waterjet_v2.git
cd waterjet_v2
```

Falls privates Repo — SSH-Key einrichten:

```bash
ssh-keygen -t ed25519 -C "cnc@cerasell"
cat ~/.ssh/id_ed25519.pub
# → Key in GitHub unter Settings → SSH Keys einfuegen
git clone git@github.com:EUER-REPO/waterjet_v2.git
```

---

## 3. Webserver installieren

```bash
npm install -g serve
```

Testen:

```bash
cd /home/CNC/waterjet_v2
serve . -p 5000
# → Browser: http://localhost:5000
```

---

## 4. Systemd-Service (als root)

```bash
tee /etc/systemd/system/waricam.service << 'EOF'
[Unit]
Description=WARICAM CeraCAM Webserver
After=network.target

[Service]
Type=simple
User=CNC
WorkingDirectory=/home/CNC/waterjet_v2
ExecStart=/usr/local/bin/serve . -p 5000 -s
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable waricam
systemctl start waricam
systemctl status waricam
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

Update-Script:

```bash
tee /usr/local/bin/waricam-update << 'EOF'
#!/bin/bash
cd /home/CNC/waterjet_v2
git pull --ff-only origin main 2>&1 | logger -t waricam-update
EOF
chmod +x /usr/local/bin/waricam-update
```

Cronjob — alle 5 Minuten (als User CNC):

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/waricam-update") | crontab -
```

Logs pruefen:

```bash
journalctl -t waricam-update --since "1 hour ago"
```

---

## 7. Zugriff testen

```bash
# IP herausfinden:
ip addr show | grep "inet " | grep -v 127.0.0.1

# Von jedem Rechner im Netzwerk:
# Browser → http://192.168.x.x:5000
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
| Name | WARICAM CeraCAM |
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
| Logs | `journalctl -u waricam` / `journalctl -t waricam-update` |

---

## Troubleshooting

**Server laeuft nicht:**
```bash
systemctl status waricam
journalctl -u waricam -n 50
```

**Port blockiert:**
```bash
ufw status
ss -tlnp | grep 5000
```

**Git pull schlaegt fehl:**
```bash
cd /home/CNC/waterjet_v2
git status
git stash  # Lokale Aenderungen sichern
git pull --ff-only origin main
```

**Falscher serve-Pfad:**
```bash
which serve
# Falls nicht /usr/local/bin/serve → ExecStart in waricam.service anpassen
```
