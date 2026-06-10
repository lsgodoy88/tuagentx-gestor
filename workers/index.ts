/**
 * gestor-worker — ELIMINADO
 * Jobs migrados al Guardián (guardian-daemon.cjs) y cron OS.
 * BullMQ removido — causaba ejecuciones paralelas y schedulers duplicados.
 *
 * Jobs activos:
 *   sync-delta      → Guardián (watchdog SyncLog) + cron OS cada 30min
 *   sync-nocturno   → Guardián (2am Bogotá)
 *   integracion     → Guardián (5am Bogotá)
 *   rutas-dia       → Guardián (8am crear, 8pm cerrar)
 *   mantenimiento   → cron OS (7am Bogotá)
 *   audit + backup  → cron OS (6am Bogotá)
 */
export {}
