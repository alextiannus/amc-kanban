#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# local-dev.sh  —  AMC Local Docker Dev Environment
#
# Usage:
#   ./scripts/local-dev.sh          # start (build if needed)
#   ./scripts/local-dev.sh build    # force rebuild all images
#   ./scripts/local-dev.sh stop     # stop containers
#   ./scripts/local-dev.sh logs     # tail all logs
#   ./scripts/local-dev.sh clean    # stop + remove volumes (wipes DB)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE="docker compose -f docker-compose.local.yml"
CMD="${1:-start}"

case "$CMD" in
  start)
    echo "🚀 Starting AMC local stack..."
    $COMPOSE up -d --remove-orphans
    echo ""
    echo "✅ Services running:"
    echo "   http://localhost:3000          → amc-kanban (direct)"
    echo "   http://amc-kanban.localhost    → amc-kanban (via nginx)"
    echo ""
    echo "💡 Add to /etc/hosts if subdomain routing isn't working:"
    echo "   127.0.0.1  amc-kanban.localhost"
    echo ""
    echo "ℹ️  amc-mm now lives in its own repository. Run it separately on port 3001."
    ;;
  build)
    echo "🔨 Rebuilding all images..."
    $COMPOSE build --no-cache
    $COMPOSE up -d --remove-orphans
    ;;
  stop)
    echo "🛑 Stopping containers..."
    $COMPOSE stop
    ;;
  logs)
    $COMPOSE logs -f --tail=100
    ;;
  clean)
    echo "⚠️  This will delete the local database. Continue? (y/N)"
    read -r confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
      $COMPOSE down -v
      echo "✅ Cleaned up."
    else
      echo "Aborted."
    fi
    ;;
  *)
    echo "Usage: $0 [start|build|stop|logs|clean]"
    exit 1
    ;;
esac
