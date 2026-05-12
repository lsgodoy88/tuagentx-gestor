# Changelog

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
