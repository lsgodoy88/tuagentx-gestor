import { describe, it, expect } from 'vitest'

function filtrarClientes(clientes: { listaId: string | null }[], tieneVinculadas: boolean) {
  if (!tieneVinculadas) return clientes
  return clientes.filter(c => c.listaId !== null)
}

describe('filtro clientes — empresas con vinculadas', () => {
  const clientes = [
    { listaId: 'lista-1' },
    { listaId: null },
    { listaId: 'lista-2' },
    { listaId: null },
  ]
  it('sin vinculadas — devuelve todos', () => expect(filtrarClientes(clientes, false)).toHaveLength(4))
  it('con vinculadas — excluye sin lista', () => {
    const r = filtrarClientes(clientes, true)
    expect(r).toHaveLength(2)
    expect(r.every(c => c.listaId !== null)).toBe(true)
  })
  it('todos sin lista con vinculadas — vacío', () => expect(filtrarClientes([{listaId:null},{listaId:null}], true)).toHaveLength(0))
  it('todos con lista con vinculadas — devuelve todos', () => expect(filtrarClientes([{listaId:'a'},{listaId:'b'}], true)).toHaveLength(2))
})
