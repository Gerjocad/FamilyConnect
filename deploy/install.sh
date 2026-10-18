#!/usr/bin/env bash
# FamilyConnect auf einem Ubuntu-Server (z. B. Oracle Cloud Always Free) installieren oder aktualisieren.
#
#   curl -fsSL https://raw.githubusercontent.com/Gerjocad/FamilyConnect/ccr-8a2b35be-ngz4x8/deploy/install.sh | sudo bash
#
# Optional über Umgebungsvariablen:
#   DOMAIN=familie.duckdns.org   eigene Domain statt <ip>.sslip.io
#   BRANCH=…                     welcher Git-Branch installiert wird
#   TIMEZONE=Europe/Berlin       Zeitzone für Fälligkeitsdaten von Aufgaben
#
# Das Skript kann gefahrlos mehrfach ausgeführt werden – so wird auch aktualisiert.
set -euo pipefail

REPO="${REPO:-https://github.com/Gerjocad/FamilyConnect.git}"
BRANCH="${BRANCH:-ccr-8a2b35be-ngz4x8}"
APP_DIR=/opt/familyconnect
DATA_DIR=/var/lib/familyconnect
BACKUP_DIR=/var/backups/familyconnect
APP_USER=familyconnect
PORT=3001

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausführen."
command -v apt-get >/dev/null || die "Dieses Skript ist für Ubuntu/Debian gedacht."
export DEBIAN_FRONTEND=noninteractive

# --- Domain bestimmen --------------------------------------------------------
if [ -z "${DOMAIN:-}" ]; then
  PUBLIC_IP="$(curl -fsS -4 --max-time 10 https://api.ipify.org || curl -fsS -4 --max-time 10 https://ifconfig.me)" \
    || die "Öffentliche IP-Adresse konnte nicht ermittelt werden. Bitte DOMAIN=… angeben."
  # sslip.io löst 1-2-3-4.sslip.io kostenlos auf 1.2.3.4 auf – so gibt es ohne eigene Domain ein HTTPS-Zertifikat
  DOMAIN="${PUBLIC_IP//./-}.sslip.io"
fi
say "Installiere FamilyConnect für https://$DOMAIN"

# --- Auslagerungsspeicher (die kleinen Gratis-Server haben nur 1 GB RAM) -------
if [ "$(swapon --noheadings | wc -l)" -eq 0 ] && [ ! -f /swapfile ]; then
  say "Lege 2 GB Auslagerungsspeicher an"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Pakete ------------------------------------------------------------------
say "Installiere Systempakete"
apt-get update -q
apt-get install -y -q curl git sqlite3 ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  say "Installiere Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi

if ! command -v caddy >/dev/null; then
  say "Installiere Caddy (Webserver mit automatischem HTTPS)"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy >/dev/null
fi

# --- Code holen und bauen ----------------------------------------------------
say "Lade FamilyConnect ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

say "Baue die App (dauert auf kleinen Servern ein paar Minuten)"
cd "$APP_DIR"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent

# --- Dienst einrichten -------------------------------------------------------
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR"
install -d -m 750 "$BACKUP_DIR"
install -d -o root -g "$APP_USER" -m 750 /etc/familyconnect
[ -f /etc/familyconnect/firebase.json ] && chown root:"$APP_USER" /etc/familyconnect/firebase.json && chmod 640 /etc/familyconnect/firebase.json

cat > /etc/systemd/system/familyconnect.service <<UNIT
[Unit]
Description=FamilyConnect
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOST=127.0.0.1
Environment=DATABASE_FILE=$DATA_DIR/familyconnect.db
Environment=TZ=${TIMEZONE:-Europe/Berlin}
# Für Push-Benachrichtigungen (optional, siehe deploy/FIREBASE.md)
Environment=FIREBASE_SERVICE_ACCOUNT=/etc/familyconnect/firebase.json
ExecStart=/usr/bin/node --no-warnings=ExperimentalWarning server/src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
CADDY

# --- Nächtliches automatisches Update -----------------------------------------
cat > /etc/systemd/system/familyconnect-update.service <<UNIT
[Unit]
Description=FamilyConnect aktualisieren
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash $APP_DIR/deploy/update.sh
UNIT

cat > /etc/systemd/system/familyconnect-update.timer <<UNIT
[Unit]
Description=FamilyConnect jede Nacht aktualisieren

[Timer]
OnCalendar=*-*-* 03:30:00 Europe/Berlin
RandomizedDelaySec=20min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# --- Tägliches Backup (14 Tage aufbewahren) -----------------------------------
cat > /etc/cron.daily/familyconnect-backup <<BACKUP
#!/bin/sh
[ -f $DATA_DIR/familyconnect.db ] || exit 0
sqlite3 $DATA_DIR/familyconnect.db ".backup '$BACKUP_DIR/familyconnect-\$(date +%F).db'"
find $BACKUP_DIR -name 'familyconnect-*.db' -mtime +14 -delete
BACKUP
chmod 755 /etc/cron.daily/familyconnect-backup

# --- Firewall: Ports 80/443 öffnen --------------------------------------------
# Die Oracle-Ubuntu-Images blockieren per iptables alles außer SSH.
say "Öffne Ports 80 und 443 in der Firewall des Servers"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
elif command -v iptables >/dev/null; then
  for p in 80 443; do
    if ! iptables -C INPUT -p tcp --dport "$p" -m state --state NEW -j ACCEPT 2>/dev/null; then
      # vor der ersten REJECT-Regel einfügen, sonst greift sie nie
      pos="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
      iptables -I INPUT "${pos:-1}" -p tcp --dport "$p" -m state --state NEW -j ACCEPT
    fi
  done
  if command -v netfilter-persistent >/dev/null; then
    netfilter-persistent save >/dev/null 2>&1 || true
  else
    apt-get install -y -q iptables-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
  fi
fi

# --- Starten -----------------------------------------------------------------
say "Starte Dienste"
systemctl daemon-reload
systemctl enable -q familyconnect caddy
systemctl enable -q --now familyconnect-update.timer
systemctl restart familyconnect
systemctl reload caddy 2>/dev/null || systemctl restart caddy

for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || die "Die App startet nicht. Details: journalctl -u familyconnect -n 50"

say "Fertig!"
cat <<DONE

  FamilyConnect läuft unter:   https://$DOMAIN

  - Im Browser öffnen oder in der Android-App als Server-Adresse eintragen.
  - Das HTTPS-Zertifikat holt Caddy beim ersten Aufruf automatisch (kann 1–2 Minuten dauern).
    Klappt das nicht, sind in der Oracle-Konsole die Ports 80 und 443 noch nicht freigegeben.
  - Updates: jede Nacht um ca. 3:30 Uhr automatisch (Protokoll: journalctl -u familyconnect-update)
    Sofort aktualisieren: sudo systemctl start familyconnect-update
  - Backups liegen täglich in $BACKUP_DIR
  - Protokoll ansehen: journalctl -u familyconnect -f

DONE
