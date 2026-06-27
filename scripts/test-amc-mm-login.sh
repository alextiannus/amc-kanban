#!/usr/bin/env bash
# amc-mm 完整登录链路测试
# Usage: bash test-amc-mm-login.sh <email> <password>

EMAIL="${1:-}"
PASSWORD="${2:-}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: bash test-amc-mm-login.sh <email> <password>"
  exit 1
fi

BASE="https://amc-mm.immedi.ai"
COOKIE_JAR="/tmp/amc-mm-test-cookies.txt"
rm -f "$COOKIE_JAR"

echo "================================================"
echo " amc-mm 端到端登录测试"
echo " Base URL: $BASE"
echo " Email:    $EMAIL"
echo "================================================"
echo ""

# STEP 1: 登录
echo "▶ STEP 1: POST /api/auth/login"
LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -w "\n__STATUS__:%{http_code}")

LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '/__STATUS__/d')
LOGIN_STATUS=$(echo "$LOGIN_RESP" | grep "__STATUS__" | cut -d: -f2)

echo "  HTTP Status: $LOGIN_STATUS"
echo "  Response:    $LOGIN_BODY"

if [ "$LOGIN_STATUS" != "200" ]; then
  echo ""
  echo "❌ 登录失败 (HTTP $LOGIN_STATUS)"
  echo "   Cookies saved to: $COOKIE_JAR"
  cat "$COOKIE_JAR" 2>/dev/null
  exit 1
fi

echo "  ✅ 登录成功"
echo ""

# STEP 2: 检查 cookie
echo "▶ STEP 2: 检查 Session Cookie"
if grep -q "session" "$COOKIE_JAR" 2>/dev/null; then
  echo "  ✅ session cookie 已设置"
  grep "session" "$COOKIE_JAR"
else
  echo "  ⚠️  未发现 session cookie（可能 Set-Cookie 没有被正确转发）"
  echo "     Cookie jar 内容:"
  cat "$COOKIE_JAR" 2>/dev/null
fi
echo ""

# STEP 3: 获取品牌列表
echo "▶ STEP 3: GET /api/brands"
BRANDS_RESP=$(curl -s -b "$COOKIE_JAR" "$BASE/api/brands" \
  -w "\n__STATUS__:%{http_code}")

BRANDS_BODY=$(echo "$BRANDS_RESP" | sed '/__STATUS__/d')
BRANDS_STATUS=$(echo "$BRANDS_RESP" | grep "__STATUS__" | cut -d: -f2)

echo "  HTTP Status: $BRANDS_STATUS"
echo "  Response:    $(echo "$BRANDS_BODY" | head -c 500)"

if [ "$BRANDS_STATUS" = "200" ]; then
  echo "  ✅ 品牌信息获取成功"
  BRAND_COUNT=$(echo "$BRANDS_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('brands',d) if isinstance(d,dict) else d))" 2>/dev/null || echo "?")
  echo "  📦 品牌数量: $BRAND_COUNT"
elif [ "$BRANDS_STATUS" = "401" ]; then
  echo "  ❌ 未授权 (401) — session cookie 未被正确传递到 amc-kanban"
else
  echo "  ❌ 获取品牌失败 (HTTP $BRANDS_STATUS)"
fi

echo ""
echo "================================================"
echo " 测试完成"
echo " Cookie jar: $COOKIE_JAR"
echo "================================================"

# 清理
rm -f "$COOKIE_JAR"
