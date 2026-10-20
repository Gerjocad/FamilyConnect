#!/usr/bin/env bash
# Nächtliches Update des FamilyConnect-Servers (aufgerufen von familyconnect-update.timer).
# Holt den neuesten Stand des installierten Branches; nur wenn es Änderungen gibt, wird neu gebaut,
# getestet und neu gestartet. Schlägt etwas fehl, bleibt die bisherige Version in Betrieb.
set -euo pipefail

APP_DIR=/opt/familyconnect
DATA_DIR=/var/lib/familyconnect
cd "$APP_DIR"
export HOME=/root

# Anforderung aus der App (familyconnect-update.path) gilt als erledigt, sobald das Update startet
rm -f "$DATA_DIR/update-request"

# Fortschritt für die App: Familie & Profil → Server
status() {
  [ -d "$DATA_DIR" ] || return 0
  printf '{"state":"%s","message":"%s","at":"%s","commit":"%s"}\n' \
    "$1" "$2" "$(date -Iseconds)" "$(git rev-parse HEAD 2>/dev/null || true)" > "$DATA_DIR/update-status.json.tmp"
  chown familyconnect: "$DATA_DIR/update-status.json.tmp" 2>/dev/null || true
  mv "$DATA_DIR/update-status.json.tmp" "$DATA_DIR/update-status.json"
}
trap 'rc=$?; [ $rc -eq 0 ] || status failed "Update fehlgeschlagen – die bisherige Version läuft weiter"' EXIT
status running "Update läuft"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
OLD="$(git rev-parse HEAD)"
git fetch --quiet --depth 1 origin "$BRANCH"
NEW="$(git rev-parse FETCH_HEAD)"

if [ "$OLD" = "$NEW" ]; then
  echo "Keine Änderungen ($BRANCH @ ${OLD:0:7})"
  status unchanged "Schon auf dem neuesten Stand"
  exit 0
fi

echo "Update $BRANCH: ${OLD:0:7} → ${NEW:0:7}"

# Hat sich das Installationsskript geändert (z. B. neue Dienst-Einstellungen), läuft die komplette Installation
if ! git diff --quiet "$OLD" "$NEW" -- deploy/install.sh 2>/dev/null; then
  echo "Installationsskript geändert – führe vollständige Installation aus"
  git checkout --quiet -B "$BRANCH" "$NEW"
  BRANCH="$BRANCH" bash deploy/install.sh
  status done "Aktualisiert"
  exit 0
fi

build() {
  npm ci --no-audit --no-fund --loglevel=error || return 1
  npm run build --silent || return 1
  local log
  log="$(mktemp)"
  if ! npm test --silent >"$log" 2>&1; then
    # Nur die fehlgeschlagenen Tests ins Protokoll – das ganze Testprotokoll ist sehr lang
    echo "Fehlgeschlagene Tests:" >&2
    grep -E -A12 '^\s*not ok' "$log" | grep -vE '^\s*(---|\.\.\.|duration_ms|type:)' >&2 || cat "$log" >&2
    rm -f "$log"
    return 1
  fi
  grep -E '^# (pass|fail)' "$log" || true
  rm -f "$log"
}

git checkout --quiet -B "$BRANCH" "$NEW"
if build; then
  status done "Aktualisiert"
  systemctl restart familyconnect
  echo "Aktualisiert auf ${NEW:0:7}"
else
  echo "Neue Version fehlerhaft – zurück auf ${OLD:0:7}" >&2
  git checkout --quiet -B "$BRANCH" "$OLD"
  build || true
  exit 1
fi
