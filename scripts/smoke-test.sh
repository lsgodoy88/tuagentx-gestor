#!/bin/bash
# Smoke tests post-deploy
BASE="http://localhost:3010"
PASS=0; FAIL=0; ERRORS=""

check() {
  local name="$1" url="$2" expect_codes="$3" expect_body="$4"
  local resp http_code body
  resp=$(curl -s --max-time 8 -w "\n%{http_code}" "$BASE$url" 2>/dev/null)
  http_code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -n -1)

  # Verificar código HTTP
  local code_ok=false
  for code in $expect_codes; do
    [ "$http_code" = "$code" ] && code_ok=true && break
  done

  if ! $code_ok; then
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS\n  ❌ $name → HTTP $http_code (esperado: $expect_codes)"
    return
  fi

  # Verificar body si se especificó
  if [ -n "$expect_body" ] && ! echo "$body" | grep -qi "$expect_body"; then
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS\n  ❌ $name → HTTP $http_code OK pero sin '$expect_body' en body"
    return
  fi

  PASS=$((PASS+1))
  echo "  ✅ $name (HTTP $http_code)"
}

echo "=== Smoke Tests TuAgentX Gestor ==="
echo ""

# Públicos — deben responder 200
check "Health"          "/api/health"    "200"         "healthy"
check "Version"         "/api/version"   "200"         "commit"

# Protegidos — sin token deben dar 401, no 500
check "Auth stats"      "/api/stats"                   "401"  "error\|autori"
check "Auth vendedor"   "/api/vendedor/stats"          "401"  "error\|autori"
check "Auth cartera"    "/api/cartera/resumen"         "401"  "error\|autori"
check "Auth recaudos"   "/api/recaudos"                "401"  "error\|autori"
check "Auth comisiones" "/api/comisiones"              "401"  "error\|autori"

# Token inválido — debe dar 4xx, no 500
check "Recibo inválido" "/api/cartera/recibo-publico?token=invalido" "400 404" ""
check "OSRM sin params" "/api/osrm-route"              "400 401 405" ""

echo ""
echo "Resultado: $PASS OK | $FAIL FALLIDOS"
if [ $FAIL -gt 0 ]; then
  echo -e "$ERRORS"
  echo ""
  echo "❌ Smoke tests fallaron"
  exit 1
fi
echo "✅ Todos los smoke tests pasaron"
exit 0
