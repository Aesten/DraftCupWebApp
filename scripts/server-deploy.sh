#!/usr/bin/env bash
# server-deploy.sh — deploy a commit on the production server.
#
# Normally invoked by scripts/deploy.sh from a dev machine, which streams this
# file (as of the commit being deployed) over SSH:
#
#   bash server-deploy.sh <commit-sha> [--force]
#
# Steps: refuse if an auction/pick-ban is live → back up the database → fast-
# forward the checkout → install deps → build the client beside the live one →
# dry-run the migrations on the backup → swap the build in → restart → health
# check. Any failure rolls the code back; the live database is only touched by
# the restarted server itself, after the migration dry-run has passed.
set -euo pipefail

SHA="${1:?usage: server-deploy.sh <commit-sha> [--force]}"
FORCE="${2:-}"

APP_DIR="${APP_DIR:-$HOME/web/bdc-webapp}"
SERVICE="${SERVICE:-bdc-webapp.service}"
DB="data/draftcup.db"
BACKUP_DIR="data-backup"
KEEP_BACKUPS=20
export PATH="$HOME/.bun/bin:$PATH"

log()  { echo "[deploy] $*"; }
die()  { echo "[deploy] ERROR: $*" >&2; exit 1; }

cd "$APP_DIR"
PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''[:space:]')"
PORT="${PORT:-3000}"

# ── Preflight ─────────────────────────────────────────────────────────────────
[ -z "$(git status --porcelain --untracked-files=no)" ] \
  || die "tracked files have local changes on the server; resolve them first:
$(git status --short --untracked-files=no)"
sudo -n -l systemctl restart "$SERVICE" >/dev/null 2>&1 \
  || die "cannot run 'sudo systemctl restart $SERVICE' without a password (see readme.md → Deployment)"

log "Fetching origin"
git fetch -q origin
git cat-file -e "$SHA^{commit}" 2>/dev/null || die "commit $SHA not found on origin — did you push?"
PREV="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "$SHA^{commit}")"
[ "$PREV" != "$TARGET" ] || { log "Already at $(git log -1 --format='%h %s')"; exit 0; }
git merge-base --is-ancestor "$PREV" "$TARGET" \
  || die "$TARGET is not a fast-forward of the deployed $PREV"

# Database tooling comes from the target commit, so it also works on the first
# deploy that introduces it.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git show "$TARGET:scripts/db-ops.ts" > "$TMP/db-ops.ts"

if ! bun "$TMP/db-ops.ts" busy "$DB"; then
  [ "$FORCE" = "--force" ] || die "something is in progress (above); retry later or pass --force"
  log "--force given, continuing anyway"
fi

mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ)-${PREV:0:7}.db"
bun "$TMP/db-ops.ts" backup "$DB" "$BACKUP"

# ── Update code (rolled back on any failure from here on) ─────────────────────
STAGE="checkout"
SWAPPED=""
rollback() {
  local code=$?
  trap - ERR
  set +e
  echo "[deploy] FAILED during '$STAGE' — rolling back to ${PREV:0:7}" >&2
  git reset -q --hard "$PREV"
  bun install --frozen-lockfile >/dev/null
  (cd client && bun install --frozen-lockfile >/dev/null)
  rm -rf dist/client.next
  if [ -n "$SWAPPED" ]; then
    rm -rf dist/client && mv dist/client.prev dist/client
  fi
  if [ "$STAGE" = "restart" ] || [ "$STAGE" = "health" ]; then
    sudo -n systemctl restart "$SERVICE"
    echo "[deploy] Restarted on ${PREV:0:7}. The database may already be migrated;" >&2
    echo "[deploy] the pre-deploy copy is $APP_DIR/$BACKUP" >&2
  fi
  exit "$code"
}
trap rollback ERR

log "Updating ${PREV:0:7} → ${TARGET:0:7}"
git log --oneline "$PREV..$TARGET" | sed 's/^/[deploy]   /'
git merge -q --ff-only "$TARGET"

STAGE="install"
log "Installing dependencies"
bun install --frozen-lockfile
(cd client && bun install --frozen-lockfile)

STAGE="build"
log "Building client"
rm -rf dist/client.next
(cd client && bunx --bun tsc -b && bunx --bun vite build --outDir ../dist/client.next --emptyOutDir)

STAGE="migrate-check"
bun scripts/db-ops.ts migrate-check "$BACKUP"

STAGE="swap"
rm -rf dist/client.prev
mkdir -p dist/client
mv dist/client dist/client.prev
SWAPPED=1
mv dist/client.next dist/client

STAGE="restart"
log "Restarting $SERVICE"
sudo -n systemctl restart "$SERVICE"

STAGE="health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null
systemctl is-active --quiet "$SERVICE"
trap - ERR

# ── Housekeeping ──────────────────────────────────────────────────────────────
ls -1t "$BACKUP_DIR"/deploy-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
log "Deployed $(git log -1 --format='%h %s')"
log "Database backup: $APP_DIR/$BACKUP"
