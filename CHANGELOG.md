# Changelog

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
