#!/usr/bin/env bash
# One-command deploy for the PartPilot subpath stack.
# Usage on the VPS:  bash ~/partpilot/deploy.sh
#
# Pulls the latest committed code from GitHub (force-syncs, so it never hits a
# merge conflict), then rebuilds and restarts the containers. Your .env and the
# database volume are untouched.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Syncing to latest from GitHub…"
git config core.autocrlf false
git fetch origin
git reset --hard origin/main

echo "==> Rebuilding and restarting containers…"
docker compose -f docker-compose.subpath.yml up -d --build

echo "==> Recent API logs (watch for 'Server listening'):"
sleep 3
docker compose -f docker-compose.subpath.yml logs --tail=8 api

echo "==> Done. Open https://ikiousa.tech/partpilot/ (hard-refresh with Ctrl+Shift+R)."
