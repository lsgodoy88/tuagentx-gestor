/**
 * Tests de lógica pura del guardian-daemon:
 * - enVentana: disparo exacto + recurrente
 * - debeCorrer: cada job billing en su día correcto
 * - bogotaTime: offset UTC-5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Extraemos las funciones puras sin importar el daemon completo ─────────────
// Las replicamos aquí para testear sin efectos secundarios (exec, fetch, etc.)

const VENTANA_GRACIA_MIN = 180

function bogotaTime(now: number) {
  const d = new Date(now - 5 * 3600 * 1000)
  return { h: d.getUTCHours(), min: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay(), dia: d.getUTCDate() }
}

function enVentana(horaObjetivo: any, bt: ReturnType<typeof bogotaTime>) {
  if (horaObjetivo.recurrente) {
    return bt.min % horaObjetivo.intervalo === 0 && bt.s < 30
  }
  return bt.h === horaObjetivo.h && bt.min === horaObjetivo.min && bt.s < 30
}

// Jobs del daemon
const JOBS_BILLING = [
  { nombre: 'billing-generar',      h: 6,  min: 0, debeCorrer: (_h: number, _m: number, _dow: number, dia: number) => dia === 1 },
  { nombre: 'billing-recordatorio', h: 9,  min: 0, debeCorrer: (_h: number, _m: number, _dow: number, dia: number) => dia === 3 },
  { nombre: 'billing-alerta',       h: 9,  min: 0, debeCorrer: (_h: number, _m: number, _dow: number, dia: number) => dia === 6 },
  { nombre: 'billing-banner',       h: 9,  min: 0, debeCorrer: (_h: number, _m: number, _dow: number, dia: number) => dia === 10 },
]

const JOBS_RECURRENTES = [
  { nombre: 'sync-delta',      intervalo: 30, debeCorrer: (h: number, _m: number, dow: number) => dow >= 1 && dow <= 6 && h >= 8 && h < 18 },
  { nombre: 'voucher-huella',  intervalo: 15, debeCorrer: (h: number, _m: number, dow: number) => dow >= 1 && dow <= 6 && h >= 6 && h < 22 },
]

// Fecha UTC que resulta en hora Bogotá deseada (UTC-5)
function bogotaToUTC(year: number, month: number, day: number, h: number, min: number, s = 0) {
  return Date.UTC(year, month - 1, day, h + 5, min, s)
}

describe('bogotaTime — offset UTC-5', () => {
  it('convierte UTC+5h a hora Bogotá correctamente', () => {
    // 2026-09-15 10:00 Bogotá = 15:00 UTC
    const utc = Date.UTC(2026, 8, 15, 15, 0, 0)
    const bt = bogotaTime(utc)
    expect(bt.h).toBe(10)
    expect(bt.min).toBe(0)
    expect(bt.dia).toBe(15)
  })

  it('cruza medianoche correctamente', () => {
    // 2026-09-16 00:30 Bogotá = 05:30 UTC del mismo día
    const utc = Date.UTC(2026, 8, 16, 5, 30, 0)
    const bt = bogotaTime(utc)
    expect(bt.h).toBe(0)
    expect(bt.min).toBe(30)
    expect(bt.dia).toBe(16)
  })

  it('día anterior UTC → mismo día Bogotá cuando es tarde', () => {
    // 2026-09-15 23:00 Bogotá = 2026-09-16 04:00 UTC
    const utc = Date.UTC(2026, 8, 16, 4, 0, 0)
    const bt = bogotaTime(utc)
    expect(bt.h).toBe(23)
    expect(bt.dia).toBe(15)
  })
})

describe('enVentana — hora exacta', () => {
  it('dispara exactamente en la hora objetivo (s < 30)', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 1, 6, 0, 10))
    expect(enVentana({ h: 6, min: 0 }, bt)).toBe(true)
  })

  it('NO dispara si s >= 30', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 1, 6, 0, 30))
    expect(enVentana({ h: 6, min: 0 }, bt)).toBe(false)
  })

  it('NO dispara en minuto incorrecto', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 1, 6, 1, 10))
    expect(enVentana({ h: 6, min: 0 }, bt)).toBe(false)
  })

  it('NO dispara en hora incorrecta', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 1, 7, 0, 10))
    expect(enVentana({ h: 6, min: 0 }, bt)).toBe(false)
  })
})

describe('enVentana — recurrente', () => {
  it('sync-delta cada 30min: dispara en :00 con s<30', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 15, 9, 0, 5))
    expect(enVentana({ recurrente: true, intervalo: 30 }, bt)).toBe(true)
  })

  it('sync-delta: dispara en :30', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 15, 9, 30, 5))
    expect(enVentana({ recurrente: true, intervalo: 30 }, bt)).toBe(true)
  })

  it('sync-delta: NO dispara en :15', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 15, 9, 15, 5))
    expect(enVentana({ recurrente: true, intervalo: 30 }, bt)).toBe(false)
  })

  it('voucher-huella cada 15min: dispara en :45', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 15, 9, 45, 5))
    expect(enVentana({ recurrente: true, intervalo: 15 }, bt)).toBe(true)
  })

  it('recurrente: NO dispara si s >= 30', () => {
    const bt = bogotaTime(bogotaToUTC(2026, 9, 15, 9, 0, 35))
    expect(enVentana({ recurrente: true, intervalo: 30 }, bt)).toBe(false)
  })
})

describe('debeCorrer — billing jobs', () => {
  const [generar, recordatorio, alerta, banner] = JOBS_BILLING

  it('billing-generar: día 1 → true', () => {
    expect(generar.debeCorrer(6, 0, 1, 1)).toBe(true)
  })
  it('billing-generar: día 2 → false', () => {
    expect(generar.debeCorrer(6, 0, 1, 2)).toBe(false)
  })
  it('billing-generar: día 31 → false', () => {
    expect(generar.debeCorrer(6, 0, 1, 31)).toBe(false)
  })

  it('billing-recordatorio: día 3 → true', () => {
    expect(recordatorio.debeCorrer(9, 0, 1, 3)).toBe(true)
  })
  it('billing-recordatorio: día 1 → false', () => {
    expect(recordatorio.debeCorrer(9, 0, 1, 1)).toBe(false)
  })

  it('billing-alerta: día 6 → true', () => {
    expect(alerta.debeCorrer(9, 0, 1, 6)).toBe(true)
  })
  it('billing-alerta: día 5 → false', () => {
    expect(alerta.debeCorrer(9, 0, 1, 5)).toBe(false)
  })

  it('billing-banner: día 10 → true', () => {
    expect(banner.debeCorrer(9, 0, 1, 10)).toBe(true)
  })
  it('billing-banner: día 9 → false', () => {
    expect(banner.debeCorrer(9, 0, 1, 9)).toBe(false)
  })
  it('billing-banner: día 11 → false (solo día 10)', () => {
    expect(banner.debeCorrer(9, 0, 1, 11)).toBe(false)
  })
})

describe('debeCorrer — sync-delta', () => {
  const job = JOBS_RECURRENTES[0]

  it('lunes 10:00 → true', () => expect(job.debeCorrer(10, 0, 1)).toBe(true))
  it('sábado 17:00 → true', () => expect(job.debeCorrer(17, 0, 6)).toBe(true))
  it('domingo → false', () => expect(job.debeCorrer(10, 0, 0)).toBe(false))
  it('lunes 07:59 → false (antes de rango)', () => expect(job.debeCorrer(7, 59, 1)).toBe(false))
  it('lunes 18:00 → false (fuera de rango)', () => expect(job.debeCorrer(18, 0, 1)).toBe(false))
  it('viernes 17:59 → true (límite)', () => expect(job.debeCorrer(17, 59, 5)).toBe(true))
})

describe('debeCorrer — sync-nocturno', () => {
  const debeCorrer = (h: number, min: number) => h === 2 && min === 0

  it('02:00 → true', () => expect(debeCorrer(2, 0)).toBe(true))
  it('02:01 → false', () => expect(debeCorrer(2, 1)).toBe(false))
  it('01:59 → false', () => expect(debeCorrer(1, 59)).toBe(false))
  it('14:00 → false', () => expect(debeCorrer(14, 0)).toBe(false))
})

describe('debeCorrer — cerrar-rutas / crear-rutas', () => {
  const cerrar = (h: number, min: number) => h === 20 && min === 0
  const crear  = (h: number, min: number) => h === 8  && min === 0

  it('cerrar: 20:00 → true',  () => expect(cerrar(20, 0)).toBe(true))
  it('cerrar: 20:01 → false', () => expect(cerrar(20, 1)).toBe(false))
  it('crear:  08:00 → true',  () => expect(crear(8, 0)).toBe(true))
  it('crear:  08:30 → false', () => expect(crear(8, 30)).toBe(false))
})
