import { describe, it, expect } from 'vitest'

function buildVendedorMap(empleados: { apiId: string | null; vendedorId: string | null; nombre: string }[]) {
  const map: Record<string, string> = {}
  empleados.forEach(e => {
    if (e.apiId)      map[e.apiId]      = e.nombre
    if (e.vendedorId) map[e.vendedorId] = e.nombre
  })
  return map
}

describe('vendedor nombre map — stats dashboard', () => {
  it('mapea por apiId (Prokpil)', () => expect(buildVendedorMap([{apiId:'api-1',vendedorId:null,nombre:'Yenny'}])['api-1']).toBe('Yenny'))
  it('mapea por vendedorId (Lumeli/Leche)', () => expect(buildVendedorMap([{apiId:null,vendedorId:'vnd-1',nombre:'Carlos'}])['vnd-1']).toBe('Carlos'))
  it('mapea por ambos', () => {
    const m = buildVendedorMap([{apiId:'api-2',vendedorId:'vnd-2',nombre:'Pedro'}])
    expect(m['api-2']).toBe('Pedro')
    expect(m['vnd-2']).toBe('Pedro')
  })
  it('sin match → undefined', () => expect(buildVendedorMap([{apiId:'api-3',vendedorId:null,nombre:'Ana'}])['api-999']).toBeUndefined())
  it('múltiples vendedores', () => {
    const m = buildVendedorMap([{apiId:'a1',vendedorId:null,nombre:'A'},{apiId:'a2',vendedorId:null,nombre:'B'}])
    expect(m['a1']).toBe('A')
    expect(m['a2']).toBe('B')
  })
})
