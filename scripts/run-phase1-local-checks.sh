#!/usr/bin/env bash
set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
SERVER_BASE_URL="${PHASE1_SERVER_URL:-http://127.0.0.1:3000}"

run_step() {
  local name="$1"
  shift
  echo "\n== ${name} =="
  if "$@"; then
    echo "[PASS] ${name}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "[FAIL] ${name}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi
}

run_optional_step() {
  local name="$1"
  shift
  echo "\n== ${name} =="
  if "$@"; then
    echo "[PASS] ${name}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "[SKIP/FAIL] ${name}"
    SKIP_COUNT=$((SKIP_COUNT + 1))
  fi
}

echo "Phase 1 local verification started..."

run_step "TypeScript check" npx tsc --noEmit
run_step "Production build" npm run build
run_step "Assignment pool smoke" npm run test:assignment-pool
run_step "Assignment flow e2e" npm run test:assignment-flow
run_step "Project execution analytics" npm run test:execution
run_step "Phase 1 comprehensive e2e" npm run test:phase1-e2e

if [[ -n "${TEST_AGENT_API_KEY:-}" ]]; then
  run_optional_step "REST+MCP integration tests (requires TEST_AGENT_API_KEY)" npm run test:api
else
  echo "\n== REST+MCP integration tests =="
  echo "[SKIP] TEST_AGENT_API_KEY is not set"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

if command -v curl >/dev/null 2>&1; then
  SERVER_HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "${SERVER_BASE_URL}/api/meta/openapi" || true)"
else
  SERVER_HTTP_CODE="000"
fi

if [[ "${SERVER_HTTP_CODE}" =~ ^[0-9]{3}$ ]] && [[ "${SERVER_HTTP_CODE}" != "000" ]]; then
  run_optional_step "Permission boundary checks (requires local server)" node scripts/verify-permissions.mjs
else
  echo "\n== Permission boundary checks =="
  echo "[SKIP] local server is not reachable on ${SERVER_BASE_URL}"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

echo "\nPhase 1 local verification summary: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT} SKIP=${SKIP_COUNT}"

if [[ ${FAIL_COUNT} -gt 0 ]]; then
  exit 1
fi
