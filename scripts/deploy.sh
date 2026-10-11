#!/usr/bin/env bash
# deploy.sh — deploy origin/master to the production server.
#
#   scripts/deploy.sh            deploy the current master (must be pushed)
#   scripts/deploy.sh --force    deploy even if an auction/pick-ban is in progress
#
# The server-side steps live in scripts/server-deploy.sh and are copied over SSH
# from the commit being deployed, so they always match the code they ship. (It is
# uploaded to a temp file rather than piped into `bash -s`, so commands it runs
# cannot swallow the rest of the script from stdin.)
set -euo pipefail

HOST="${DEPLOY_HOST:-aesten@3550h}"
BRANCH="master"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "Not on $BRANCH" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Uncommitted changes" >&2; exit 1; }

FORCE=""
case "${1:-}" in
  "")      ;;
  --force) FORCE="--force" ;;
  *)       echo "usage: scripts/deploy.sh [--force]" >&2; exit 1 ;;
esac

git fetch -q origin "$BRANCH"
SHA="$(git rev-parse HEAD)"
if [ "$SHA" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "HEAD ($(git rev-parse --short HEAD)) is not origin/$BRANCH — push first (git push origin $BRANCH)" >&2
  exit 1
fi

echo "Deploying $(git log -1 --format='%h %s') to $HOST"
# SHA is hex and FORCE is a fixed word, so splicing them into the remote command is safe.
git show "$SHA:scripts/server-deploy.sh" | ssh "$HOST" \
  "f=\$(mktemp) && cat > \"\$f\" && bash \"\$f\" $SHA $FORCE </dev/null; rc=\$?; rm -f \"\$f\"; exit \$rc"
