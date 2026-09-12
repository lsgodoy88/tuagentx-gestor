/**
 * Tests del Guardián — sync-delta retry por customerId faltante
 *
 * Reglas protegidas:
 * 1. Orden sin cliente.uid → retry fetchOrdenCompletaPorId antes de crear
 * 2. Retry exitoso → orden entra al batch con datos completos
 * 3. Retry fallido (sin cliente) → orden omitida ese ciclo
 * 4. Orden con cliente.uid → pasa directo sin retry
 */

import { describe, it, expect, vi } from 'vitest'

// ── Lógica extraída de sync-delta.ts (pura, sin deps) ────────────

async function procesarOrdenesConRetry(
  nuevasOrdenes: any[],
  fetchOrdenCompletaPorId: (id: string) => Promise<any>
): Promise<any[]> {
  const nuevasOrdenesConDatos: any[] = []
  for (const orden of nuevasOrdenes) {
    if (!orden.cliente?.uid) {
      const origenId = String(orden.uid || orden._id)
      try {
        const completa = await fetchOrdenCompletaPorId(origenId)
        if (completa?.clienteApiId || completa?.clienteNit || completa?.clienteNombre) {
          nuevasOrdenesConDatos.push({
            ...orden,
            cliente: { uid: completa.clienteApiId },
            clienteNit: orden.clienteNit || completa.clienteNit,
            clienteNombreApi: orden.clienteNombreApi || completa.clienteNombre,
            ciudad: completa.ciudad,
            direccion: completa.direccion,
            telefono: orden.telefono || completa.telefono,
          })
        } else {
          // omitida
        }
      } catch { /* omitida */ }
    } else {
      nuevasOrdenesConDatos.push(orden)
    }
  }
  return nuevasOrdenesConDatos
}

// ── Helpers ───────────────────────────────────────────────────────

const makeOrden = (overrides: any = {}) => ({
  uid: 'origen-001',
  numeroFacturado: '1811',
  cliente: { uid: 'cliente-abc' },
  clienteNit: '1075230103',
  clienteNombreApi: 'LEIDY CAROLINA',
  cityId: '73001',
  ciudad: null,
  direccion: 'CR 5 76-10',
  telefono: '3138771499',
  ...overrides,
})

const makeCompleta = (overrides: any = {}) => ({
  clienteApiId: 'cliente-abc',
  clienteNit: '1075230103',
  clienteNombre: 'LEIDY CAROLINA',
  ciudad: 'NEIVA',
  direccion: 'CR 5 76-10',
  telefono: '3138771499',
  ...overrides,
})

// ── Tests ─────────────────────────────────────────────────────────

describe('sync-delta — retry por customerId faltante', () => {

  it('orden con cliente.uid pasa directo sin llamar retry', async () => {
    const fetch = vi.fn()
    const ordenes = [makeOrden()]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    expect(fetch).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].cliente.uid).toBe('cliente-abc')
  })

  it('orden sin cliente.uid → llama fetchOrdenCompletaPorId', async () => {
    const fetch = vi.fn().mockResolvedValue(makeCompleta())
    const ordenes = [makeOrden({ cliente: undefined })]
    await procesarOrdenesConRetry(ordenes, fetch)
    expect(fetch).toHaveBeenCalledWith('origen-001')
  })

  it('retry exitoso → orden incluida con datos completos', async () => {
    const fetch = vi.fn().mockResolvedValue(makeCompleta({ ciudad: 'NEIVA', direccion: 'CR 5 76-10' }))
    const ordenes = [makeOrden({ cliente: undefined, clienteNit: '', telefono: '' })]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    expect(result).toHaveLength(1)
    expect(result[0].cliente.uid).toBe('cliente-abc')
    expect(result[0].ciudad).toBe('NEIVA')
    expect(result[0].direccion).toBe('CR 5 76-10')
    expect(result[0].clienteNit).toBe('1075230103')
  })

  it('retry sin datos de cliente → orden omitida', async () => {
    const fetch = vi.fn().mockResolvedValue({ clienteApiId: null, clienteNit: null, clienteNombre: null })
    const ordenes = [makeOrden({ cliente: undefined })]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    expect(result).toHaveLength(0)
  })

  it('retry lanza excepción → orden omitida sin romper el batch', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('timeout'))
    const ordenes = [makeOrden({ cliente: undefined })]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    expect(result).toHaveLength(0)
  })

  it('mix: una con cliente y una sin → solo la incompleta hace retry', async () => {
    const fetch = vi.fn().mockResolvedValue(makeCompleta())
    const ordenes = [
      makeOrden({ uid: 'con-cliente' }),
      makeOrden({ uid: 'sin-cliente', cliente: undefined }),
    ]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('sin-cliente')
    expect(result).toHaveLength(2)
  })

  it('orden sin cliente.uid preserva datos originales que ya existían', async () => {
    const fetch = vi.fn().mockResolvedValue(makeCompleta({ telefono: '999' }))
    const ordenes = [makeOrden({ cliente: undefined, telefono: '3138771499' })]
    const result = await procesarOrdenesConRetry(ordenes, fetch)
    // telefono original tiene prioridad
    expect(result[0].telefono).toBe('3138771499')
  })

})
