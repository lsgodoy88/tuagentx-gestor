# Changelog

## [1.3.3] - 2026-05-12 (Orquestador sync + consecutivo)

### Added
- 37 tests sobre el endpoint más complejo del sistema y el helper de numeroRecibo:
  - `POST /api/integracion/sync` orchestrator (20) — dispatching cron vs manual, auth/autorización, tipo dispatch, error handling con SyncLog, empleadoId scope
  - `lib/consecutivo.getConsecutivo` (17) — formato CL2605001, iniciales con filtro de conectivos castellanos, reset por mes, prefijo manual override

### Documentado por tests
- `getConsecutivo` filtra 'Y' como conectivo (afecta iniciales tipo 'PEDRO Y CARMEN' → 'PC')
- Fallback `'XX'` en consecutivo es dead code: cuando nombre vacío, cae en `'X'` single
- Orchestrator: cron NO requiere sesión cuando x-cron-secret matches
- Orchestrator: falla en una integración del batch cron NO rompe a las demás
- Orchestrator: rol vendedor scope su recalcularVentasMesImpulsos a sus rutas; supervisor a todas

### Notes
- Total: 380 tests pasando en CI
- `/api/integracion/sync` cubierto sin necesidad de re-testear helpers (mockeados): aislamiento limpio entre orchestrator y unidades
- Único endpoint complejo restante: `/api/cartera/voucher` (OCR con OpenAI + sharp + PDF conversion)
- Único módulo lib/ restante: `lib/integracion/adapters/uptres.ts` (245 líneas HTTP, requiere mock de fetch)

## [1.3.2] - 2026-05-12 (Integración completa + consecutivo)

### Added
- 42 tests sobre helpers críticos previamente sin cobertura:
  - `lib/integracion/sync.refrescarDeudasConPagosPendientes` (13) — confronta pagos locales con UpTres por cliente, resiliente a falla por cliente
  - `lib/integracion/venta-mes.recalcularVentasMesImpulsos` (12) — fuente dual (ERP UpTres + Visita.tipo='venta'), batch en $transaction
  - `lib/consecutivo.getConsecutivo` (17) — generador de numeroRecibo con iniciales del vendedor, reset por mes, prefijo manual override

### Documentado por tests
- `getConsecutivo` filtra 'Y' como conectivo castellano (afecta iniciales como 'PEDRO Y CARMEN' → 'PC')
- El fallback `'XX'` para nombre vacío es dead code: primera siempre = 'X' default, jamás llega al fallback. Resultado real es `'X'` no `'XX'`
- `recalcularVentasMesImpulsos` ignora fechas inválidas y ventas con cliente.uid distinto del solicitado

### Notes
- Total: 360 tests pasando en CI
- `lib/integracion/sync.ts` 100% cubierto (4/4 helpers exportados)
- Queda sin cobertura: `lib/integracion/adapters/uptres.ts` (245 líneas, HTTP-based, requiere mock fetch)

## [1.3.1] - 2026-05-12 (Cartera + integracion completas)

### Added
- 46 tests nuevos cubriendo el resto del módulo cartera + helpers de integracion:
  - `/api/cartera/pago` POST (24) — variante con Cartera/DetalleCartera, distribución proporcional, fechaPago cascada
  - `/api/cartera/recibo-token` POST (7) — renovación de token 15min
  - `/api/cartera/recibo/[pagoId]` GET (10) — recibo autenticado con hidratación de cliente en cascada (incluye fallback cuando cliente fue borrado de BD)
  - `lib/integracion/sync.sincronizarDeudas` (12) — upsert desde fetch UpTres con cascada fPago/fCreado+dias/null
  - `lib/integracion/sync.marcarZombis` (5) — cierre de deudas que UpTres ya no devuelve
  - `lib/integracion/sync.actualizarCache` (12) — reconstrucción de CarteraCache con saldoReal=saldoSync-pagosLocalNoConfrontados

### Notes
- Total: 318 tests pasando en CI
- Cartera completamente cubierto: pago, pago-sync, recibo-publico, recibo-token, recibo/[pagoId]
- Helpers críticos de integracion cubiertos: queda solo el orchestrator (/api/integracion/sync route) y el adapter UpTres

## [1.3.0] - 2026-05-12 (Endpoint tests + Prisma mocking)

### Added
- Patrón de testing de endpoints con mock de Prisma (`vi.mock('@/lib/prisma')`) + `next-auth` + `lib/auth`
- Helper `mockTx()` para mockear `prisma.$transaction(async (tx) => { ... })` — invoca el callback con un `tx` mock customizable por test
- 92 tests nuevos sobre 6 endpoints críticos:
  - `/api/health` (8) — BD + sync<26h drive el monitor
  - `/api/clientes/[id]/promedio` (10) — fuente erp vs app, fallback, multitenant
  - `/api/clientes/[id]/gps` (13) — protección de GPS confirmado, override admin
  - `/api/clientes/[id]/meta` (7) — null/0/string numéricos
  - `/api/turnos` (15) — pausa real vs solicitada (fix del bug histórico)
  - `/api/cartera/pago-sync` (25) — Serializable transaction, FIFO, anti race-condition
  - `/api/cartera/recibo-publico` (15) — token expirado, modo Cartera vs sync con datos congelados

### Notes
- Total: 248 tests pasando en CI cada PR
- 100% coverage de líneas en `lib/`: auth-helpers, cartera, crypto-uptres, fechas, fecha (legacy), impulsoMetricas, maps, permisos, recibos
- Patrón documentado para futuros endpoints: copia esqueleto de cualquier test existente, ajusta tablas y mocks

## [1.2.2] - 2026-05-12 (Lock de deploy concurrente)

### Fixed
- `scripts/deploy.sh` ahora toma un `flock` exclusivo por entorno (`/tmp/tuagentx-deploy-{env}.lock`). Dos deploys concurrentes del mismo entorno (típicamente shell timeout + retry) peleaban por `HEAD`/`node_modules`/`.next` y el rollback de uno terminaba moviendo el commit del otro. Ahora el segundo intento espera o sale con código 10.

## [1.2.1] - 2026-05-12 (Tests + CI)

### Added
- GitHub Actions workflow `.github/workflows/ci.yml` con 3 jobs (build, lint, test) en cada PR a main y push a ramas feature/*
- Vitest setup completo (`vitest.config.ts`, scripts test/test:watch/test:coverage)
- 156 tests cubriendo el código puro de `lib/`:
  - `fechas` (13), `fecha` legacy (12), `recibos` (8)
  - `auth-helpers` (19), `permisos` (10)
  - `crypto-uptres` (10) — encriptación AES-256-CBC de API keys
  - `cartera` (22) — estados pagada/vencida/mora/crítica con bordes
  - `impulsoMetricas` (15) — semáforo + deduplicación esPrimero
  - `gps.distanciaMetros` (8) — Haversine
  - `maps.expandirDireccion` (31) — abreviaturas colombianas + URL Google Maps

### Notes
- Build de CI usa env stubs (OPENAI/R2/VAPID/etc) — varios endpoints instancian clientes a top-level
- Tests de endpoints requieren mocking de Prisma (próxima iteración)

## [1.2.0] - 2026-05-12 (Versionado + Staging)

### Added
- Sistema de versionado: `scripts/gen-version.js` autogenera `lib/version.ts` en prebuild (commit, branch, tag, env, buildDate)
- Endpoint público `/api/version` (sin BD, cache 60s)
- `components/VersionFooter` con badge ámbar `STAGING` en `/dashboard/*`
- Staging environment completo: `staging.tuagentx.com` (puerto 3011, PM2 `gestor-staging`, BD compartida con prod, sin worker)
- `scripts/deploy.sh production|staging [ref]` con rollback automático, log y short-circuit por build commit
- `CONTRIBUTING.md` documentando GitHub Flow + ciclo de release + reglas duras
- Monitor (`/srv/panel/scripts/monitor.js`) ahora vigila `gestor-staging` cada 5min con auto-restart

### Changed
- Nginx: `sites-enabled/tuagentx` ahora es symlink a `sites-available/tuagentx` (una sola fuente de verdad). Backup en `/root/`.
- Middleware: bypass de geo-block para `/api/version`

### Fixed
- `deploy.sh` short-circuit comparaba PREV_COMMIT vs HEAD post-pull (siempre igual si `git pull` corrió antes). Ahora compara contra `fullCommit` en `lib/version.ts` (lo que realmente refleja el build). `FORCE=1` para forzar.

## [1.1.0] - 2026-05-12 (Hardening sesión)

### Added
- Bitácora de sync (SyncLog) con zombis, pagos confrontados, duración
- Reporte de recaudos con filtros mes/vendedor/método + export CSV
- Pagos congelados en `PagoCartera` (clienteApiId, clienteNombre, valorFactura, vendedorNombre, fechaPago, saldoAnterior, numeroFactura)
- Helpers compartidos: `lib/auth-helpers`, `lib/fechas`, `lib/recibos`, `lib/prisma-selects`
- Geo-bloqueo Colombia + US (middleware Cloudflare)
- Headers seguridad: HSTS, X-Frame-Options, CSP, Referrer-Policy
- Health check `/api/health` (BD, Redis, última sync)
- Workers con retry 3x backoff exponencial
- Transacciones Serializable en pagos (anti race condition)
- Validación de input en monto/descuento/notas
- DEPLOY.md (runbook DR completo)

### Fixed
- Worker cron 5am llamaba tipo='completo' inexistente → unificado a delta
- fetchVentas solo traía condition=false → ahora true+false (Julia Otaya orden 2890)
- Adapter UpTres mapeaba customer.name null → ahora firstName+lastName
- Trazabilidad capa 2 confundía resultados → eliminada
- Sync ventas no filtraba por empleado individual
- Impulso/promedio leían SyncDeuda.valor (deuda) → ahora VentaMesCliente
- Cron backup no logueaba (permisos /var/log) → logs en /home/luis/logs
- Recibo expirado renovado para admin (15 min)
- NODE_TLS_REJECT_UNAUTHORIZED=0 eliminado
- Cache Cloudflare 1 año en _next/static (vendedores ~30x más rápido)

### Security
- npm audit fix → 3 high resueltas (fast-uri, fast-xml-builder, Next 13 CVEs)
- Eliminado .env.bak con permisos abiertos
- Geo-bloqueo activo (CO+US)
- Headers de seguridad globales

### Refactor
- 45 endpoints usan helpers (0 duplicación de empresaId/UTC-5/randomBytes)
- 9 archivos .bak eliminados del repo
- Trazabilidad usa solo OrdenDespacho
- impulso, promedio, recibo público desacoplados de SyncDeuda
