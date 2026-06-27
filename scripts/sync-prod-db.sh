#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-prod-db.sh  —  Dump production DB and restore into local Docker Postgres
#
# Usage:
#   ./scripts/sync-prod-db.sh          # dump prod → restore to local docker
#   ./scripts/sync-prod-db.sh dump-only # only dump, don't restore
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_URL="postgresql://amc_user:g1fb8GblaOI4feUcObfk0fvuWsESDjRP@dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com:5432/amc_cupw"
LOCAL_URL="postgresql://amc_user:amc_password@localhost:5432/amc"
DUMP_FILE="docker/prod-dump.sql"
CMD="${1:-restore}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check docker is available
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Please install Docker Desktop."
  exit 1
fi

echo "📦 Dumping production database via Docker (postgres:18)..."
echo "   Source: dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com"
mkdir -p "$REPO_ROOT/docker"

docker run --rm \
  -e PGPASSWORD="g1fb8GblaOI4feUcObfk0fvuWsESDjRP" \
  -v "$REPO_ROOT/docker:/dump" \
  postgres:18 \
  pg_dump \
    --host=dpg-d7v9ec7aqgkc73915tcg-a.oregon-postgres.render.com \
    --port=5432 \
    --username=amc_user \
    --dbname=amc_cupw \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    -f /dump/prod-dump.sql

echo "✅ Dump saved to $DUMP_FILE ($(du -sh $DUMP_FILE | cut -f1))"

if [[ "$CMD" == "dump-only" ]]; then
  echo "Done (dump-only mode)."
  exit 0
fi

# Check local docker postgres is running
if ! docker ps --format '{{.Names}}' | grep -q "amc_local_db"; then
  echo ""
  echo "🐳 Starting local database container first..."
  docker compose -f docker-compose.local.yml up -d db
  echo "⏳ Waiting for Postgres to be ready..."
  sleep 5
fi

echo ""
echo "🔄 Restoring dump to local database..."
PGPASSWORD="amc_password" psql \
  --host=localhost \
  --port=5432 \
  --username=amc_user \
  --dbname=amc \
  -f "$DUMP_FILE" \
  --quiet 2>&1 | grep -v "^NOTICE\|^$" || true

echo ""
echo "✅ Production data restored to local Docker Postgres."
echo "   Connect: psql '$LOCAL_URL'"
