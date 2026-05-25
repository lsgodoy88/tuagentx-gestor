/**
 * Testigo — Log estructurado de eventos críticos
 *
 * UN solo archivo. UNA línea por evento. Solo lo que importa.
 * Sin PII. Sin datos de personas. Solo métricas del sistema.
 *
 * Archivo: /home/luis/logs/guardian-testigo.jsonl
 * Permisos: 600 (solo luis puede leerlo)
 * Rotación: automática cuando supera 10MB
 */

import { appendFile, stat, rename } from 'fs/promises'
import { existsSync } from 'fs'

const TESTIGO_PATH = '/home/luis/logs/guardian-testigo.jsonl'
const MAX_SIZE_MB = 10

// ── Tipos de eventos permitidos ───────────────────────────────────────────────

export type EventoTestigo =
  | { evento: 'sync_bodega';          ok: boolean; ordenes_nuevas: number; total: number; ms: number; empresaId?: string }
  | { evento: 'contrato_fallo';       contrato: string; modulo: string; obtenido: string; score_antes?: number }
  | { evento: 'contrato_ok';          contrato: string; modulo: string; resuelto_en_ms?: number }
  | { evento: 'accion_emergencia';    accion: string; ok: boolean; ms: number; detalle?: string }
  | { evento: 'deploy';               commit: string; ok: boolean; via?: string; duracion_s?: number }
  | { evento: 'proceso_reinicio';     proceso: string; motivo: string; reinicio_num?: number }
  | { evento: 'guardian_run';         score: number; contratos_ok: number; contratos_fail: number; acciones: number; ms: number }
  | { evento: 'redis_noauth';         proceso: string; accion: 'detectado' | 'resuelto'; ms?: number }
  | { evento: 'turno_inicio';         ok: boolean; es_futuro?: boolean }
  | { evento: 'alerta';               nivel: 'info' | 'warn' | 'critico'; mensaje: string }

// ── Escritura ─────────────────────────────────────────────────────────────────

export async function testigo(payload: EventoTestigo): Promise<void> {
  try {
    // Rotar si supera 10MB
    if (existsSync(TESTIGO_PATH)) {
      const s = await stat(TESTIGO_PATH)
      if (s.size > MAX_SIZE_MB * 1024 * 1024) {
        const fecha = new Date().toISOString().split('T')[0]
        await rename(TESTIGO_PATH, `${TESTIGO_PATH}.${fecha}.bak`)
      }
    }

    const linea = JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    }) + '\n'

    await appendFile(TESTIGO_PATH, linea, { mode: 0o600 })
  } catch {
    // El testigo nunca rompe el flujo principal
  }
}
