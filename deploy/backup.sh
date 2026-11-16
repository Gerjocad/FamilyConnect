#!/usr/bin/env bash
# Tägliche Sicherung von FamilyConnect (aufgerufen von familyconnect-backup.timer oder aus der App).
#  1. Datenbank lokal sichern (/var/backups/familyconnect, 14 Tage)
#  2. Ist Google Drive eingerichtet (/etc/familyconnect/rclone.conf, Ziel „gdrive:“), dorthin hochladen:
#     FamilyConnect-Sicherung/datenbank/  – gepackte Datenbank je Tag, älter als 30 Tage wird gelöscht
#     FamilyConnect-Sicherung/fotos/      – hochgeladene Bilder (nur neue kommen dazu, nichts wird gelöscht)
# Anleitung: deploy/BACKUP.md. Ergebnis für die App: $DATA_DIR/backup-status.json
set -uo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/familyconnect}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/familyconnect}"
RCLONE_CONF="${RCLONE_CONF:-/etc/familyconnect/rclone.conf}"
REMOTE="${BACKUP_REMOTE:-gdrive:FamilyConnect-Sicherung}"
KEEP_DAYS_LOCAL=14
KEEP_DAYS_REMOTE=30

rm -f "$DATA_DIR/backup-request"
STATUS_FILE="$DATA_DIR/backup-status.json"
last_ok="$(sed -n 's/.*"last_ok":"\([^"]*\)".*/\1/p' "$STATUS_FILE" 2>/dev/null || true)"

status() {
  [ -d "$DATA_DIR" ] || return 0
  printf '{"state":"%s","message":"%s","at":"%s","last_ok":"%s","size":%s}\n' \
    "$1" "$2" "$(date -Iseconds)" "$last_ok" "${3:-0}" > "$STATUS_FILE.tmp"
  chown familyconnect: "$STATUS_FILE.tmp" 2>/dev/null || true
  mv "$STATUS_FILE.tmp" "$STATUS_FILE"
}

[ -f "$DATA_DIR/familyconnect.db" ] || { echo "Keine Datenbank"; exit 0; }
status running "Sicherung läuft"

# --- 1. lokal -----------------------------------------------------------------
mkdir -p "$BACKUP_DIR"
DAY="$(date +%F)"
DB_COPY="$BACKUP_DIR/familyconnect-$DAY.db"
if ! sqlite3 "$DATA_DIR/familyconnect.db" ".backup '$DB_COPY'"; then
  status failed "Datenbank konnte nicht gesichert werden"
  exit 1
fi
find "$BACKUP_DIR" -name 'familyconnect-*.db' -mtime +$KEEP_DAYS_LOCAL -delete
find "$BACKUP_DIR" -name 'familyconnect-*.db.gz' -mtime +2 -delete

# --- 2. Google Drive ------------------------------------------------------------
if [ ! -s "$RCLONE_CONF" ] || ! command -v rclone >/dev/null; then
  status off "Nur auf dem Server gesichert – Google Drive ist nicht eingerichtet (deploy/BACKUP.md)"
  exit 0
fi

rc() { rclone --config "$RCLONE_CONF" --retries 3 --low-level-retries 5 "$@"; }
GZ="$DB_COPY.gz"
gzip -c "$DB_COPY" > "$GZ"
SIZE="$(stat -c %s "$GZ")"
if ! rc copyto "$GZ" "$REMOTE/datenbank/familyconnect-$DAY.db.gz"; then
  status failed "Hochladen zu Google Drive fehlgeschlagen" "$SIZE"
  exit 1
fi
if [ -d "$DATA_DIR/uploads" ] && ! rc copy "$DATA_DIR/uploads" "$REMOTE/fotos"; then
  status failed "Datenbank gesichert, Fotos aber nicht hochgeladen" "$SIZE"
  exit 1
fi
rc delete --min-age "${KEEP_DAYS_REMOTE}d" "$REMOTE/datenbank" || true
last_ok="$(date -Iseconds)"
status ok "In Google Drive gesichert" "$SIZE"
echo "Sicherung fertig: $REMOTE/datenbank/familyconnect-$DAY.db.gz ($SIZE Bytes)"
