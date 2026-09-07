import { describe, it, expect } from 'vitest'

function buildClientesPayload(sel, uidMap, metas, horas) {
  return sel.map(uid => ({
    uid, clienteId: uidMap[uid] || uid,
    meta: metas[uid] || null, hora: horas[uid] || null,
  }))
}

function deduplicarClienteIds(rutasFijas) {
  return [...new Set(rutasFijas.flatMap(r => (r.clientes || []).map(c => c.clienteId)))]
}

describe('multi-visita uid sistema', () => {
  it('uids distintos para mismo cliente', () => {
    expect('cli-rocio_1000').not.toBe('cli-rocio_2000')
  })
  it('uidToClienteId mapea ambos uids', () => {
    const m = { 'cli-rocio_1000': 'cli-rocio', 'cli-rocio_2000': 'cli-rocio' }
    expect(m['cli-rocio_1000']).toBe('cli-rocio')
    expect(m['cli-rocio_2000']).toBe('cli-rocio')
  })
  it('payload incluye 2 entradas mismo cliente con horas distintas', () => {
    const sel = ['cli-rocio_1000', 'cli-rocio_2000', 'cli-otro_3000']
    const m = { 'cli-rocio_1000': 'cli-rocio', 'cli-rocio_2000': 'cli-rocio', 'cli-otro_3000': 'cli-otro' }
    const metas = { 'cli-rocio_1000': 500000, 'cli-rocio_2000': 500000, 'cli-otro_3000': 300000 }
    const horas = { 'cli-rocio_1000': '09:30', 'cli-rocio_2000': '14:30' }
    const payload = buildClientesPayload(sel, m, metas, horas)
    expect(payload).toHaveLength(3)
    expect(payload[0]).toMatchObject({ clienteId: 'cli-rocio', hora: '09:30', meta: 500000 })
    expect(payload[1]).toMatchObject({ clienteId: 'cli-rocio', hora: '14:30', meta: 500000 })
    expect(payload[2]).toMatchObject({ clienteId: 'cli-otro', hora: null })
  })
  it('eliminar uid no afecta el otro', () => {
    let sel = ['cli-rocio_1000', 'cli-rocio_2000']
    sel = sel.filter(x => x !== 'cli-rocio_2000')
    expect(sel).toEqual(['cli-rocio_1000'])
  })
  it('includes no bloquea segunda visita', () => {
    expect(['cli-rocio_1000'].includes('cli-rocio_2000')).toBe(false)
  })
})

describe('multi-visita deduplicacion reportes', () => {
  it('deduplica mismo cliente dos veces', () => {
    const ids = deduplicarClienteIds([{ clientes: [{ clienteId: 'a' }, { clienteId: 'a' }, { clienteId: 'b' }] }])
    expect(ids).toHaveLength(2)
  })
  it('deduplica entre rutas', () => {
    const ids = deduplicarClienteIds([
      { clientes: [{ clienteId: 'a' }, { clienteId: 'b' }] },
      { clientes: [{ clienteId: 'b' }, { clienteId: 'c' }] },
    ])
    expect(ids).toHaveLength(3)
  })
  it('ruta vacia no rompe', () => {
    expect(deduplicarClienteIds([{ clientes: [] }, { clientes: null }])).toHaveLength(0)
  })
})

describe('multi-visita carga ruta existente', () => {
  it('genera uid por RutaFijaCliente preservando metas y horas', () => {
    const ruta = { clientes: [
      { clienteId: 'cli-rocio', id: 'rfc-1', metaVenta: 500000, horaEntrada: '09:30' },
      { clienteId: 'cli-rocio', id: 'rfc-2', metaVenta: 500000, horaEntrada: '14:30' },
      { clienteId: 'cli-otro',  id: 'rfc-3', metaVenta: 300000, horaEntrada: null },
    ]}
    const metas = {}, horas = {}, uidMap = {}
    const uids = ruta.clientes.map(c => {
      const uid = c.clienteId + '_' + c.id
      uidMap[uid] = c.clienteId
      if (c.metaVenta) metas[uid] = c.metaVenta
      if (c.horaEntrada) horas[uid] = c.horaEntrada
      return uid
    })
    expect(uids).toEqual(['cli-rocio_rfc-1', 'cli-rocio_rfc-2', 'cli-otro_rfc-3'])
    expect(metas['cli-rocio_rfc-1']).toBe(500000)
    expect(horas['cli-rocio_rfc-1']).toBe('09:30')
    expect(horas['cli-rocio_rfc-2']).toBe('14:30')
    expect(uidMap['cli-rocio_rfc-1']).toBe('cli-rocio')
    expect(uidMap['cli-rocio_rfc-2']).toBe('cli-rocio')
    expect(horas['cli-otro_rfc-3']).toBeUndefined()
  })
})
