import { describe, it, expect } from 'vitest'

// ─── Lógica extraída de sync-delta: sync ClienteLista ────────────────────────
// Dado un set de clienteIds que UpTres dice que están en la lista,
// retorna cuáles insertar (nuevos) y cuáles eliminar (salieron de la lista)
function calcularDiffClienteLista(
  clienteIdsUpTres: string[],
  clienteIdsExistentes: string[],
): { insertar: string[]; eliminar: string[] } {
  const setUpTres = new Set(clienteIdsUpTres)
  const setExistentes = new Set(clienteIdsExistentes)
  return {
    insertar: clienteIdsUpTres.filter(id => !setExistentes.has(id)),
    eliminar: clienteIdsExistentes.filter(id => !setUpTres.has(id)),
  }
}

// ─── Lógica extraída de clientes/route: resolución de clienteIds por listas ──
// Dado clienteLista rows, retorna ids únicos de clientes
function resolverClienteIds(rows: { clienteId: string }[]): string[] {
  return [...new Set(rows.map(r => r.clienteId))]
}

// ─── Lógica extraída: vendedor de un cliente con N listas ────────────────────
function resolverVendedorCliente(cliente: {
  clienteListas?: { lista?: { vendedores?: { empleado?: { nombre: string } }[] } }[]
  lista?: { vendedores?: { empleado?: { nombre: string } }[] }
}): string {
  return (
    cliente.clienteListas?.[0]?.lista?.vendedores?.[0]?.empleado?.nombre?.split(' ')[0] ||
    cliente.lista?.vendedores?.[0]?.empleado?.nombre?.split(' ')[0] ||
    '—'
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calcularDiffClienteLista — sync delta', () => {
  it('cliente nuevo en lista → insertar, nada eliminar', () => {
    const r = calcularDiffClienteLista(['c1', 'c2'], ['c1'])
    expect(r.insertar).toEqual(['c2'])
    expect(r.eliminar).toHaveLength(0)
  })

  it('cliente salió de lista → eliminar, nada insertar', () => {
    const r = calcularDiffClienteLista(['c1'], ['c1', 'c2'])
    expect(r.insertar).toHaveLength(0)
    expect(r.eliminar).toEqual(['c2'])
  })

  it('lista sin cambios → nada insertar ni eliminar', () => {
    const r = calcularDiffClienteLista(['c1', 'c2'], ['c1', 'c2'])
    expect(r.insertar).toHaveLength(0)
    expect(r.eliminar).toHaveLength(0)
  })

  it('lista vacía en UpTres → eliminar todos los existentes', () => {
    const r = calcularDiffClienteLista([], ['c1', 'c2'])
    expect(r.insertar).toHaveLength(0)
    expect(r.eliminar).toEqual(['c1', 'c2'])
  })

  it('lista nueva (sin existentes) → insertar todos', () => {
    const r = calcularDiffClienteLista(['c1', 'c2', 'c3'], [])
    expect(r.insertar).toEqual(['c1', 'c2', 'c3'])
    expect(r.eliminar).toHaveLength(0)
  })

  it('cliente en 2 listas — cada lista calcula su diff independiente', () => {
    // lista A: c1, c2. lista B: c1, c3
    const diffA = calcularDiffClienteLista(['c1', 'c2'], ['c1'])
    const diffB = calcularDiffClienteLista(['c1', 'c3'], [])
    expect(diffA.insertar).toEqual(['c2'])
    expect(diffB.insertar).toEqual(['c1', 'c3'])
    // c1 aparece en ambas — no se elimina de ninguna
    expect(diffA.eliminar).toHaveLength(0)
    expect(diffB.eliminar).toHaveLength(0)
  })
})

describe('resolverClienteIds — filtro vendedor/supervisor', () => {
  it('cliente en 1 lista → id único', () => {
    expect(resolverClienteIds([{ clienteId: 'c1' }])).toEqual(['c1'])
  })

  it('cliente en 2 listas → id deduplicado', () => {
    const rows = [{ clienteId: 'c1' }, { clienteId: 'c1' }, { clienteId: 'c2' }]
    const ids = resolverClienteIds(rows)
    expect(ids).toHaveLength(2)
    expect(ids).toContain('c1')
    expect(ids).toContain('c2')
  })

  it('sin clientes → array vacío', () => {
    expect(resolverClienteIds([])).toHaveLength(0)
  })

  it('supervisor con 2 vendedores — clientes de ambas listas deduplicados', () => {
    // vendedor A tiene lista L1: c1, c2. vendedor B tiene lista L2: c2, c3
    const rows = [
      { clienteId: 'c1' }, { clienteId: 'c2' }, // lista L1
      { clienteId: 'c2' }, { clienteId: 'c3' }, // lista L2
    ]
    const ids = resolverClienteIds(rows)
    expect(ids).toHaveLength(3)
    expect(ids).toContain('c2') // deduplicado
  })
})

describe('resolverVendedorCliente — columna tabla UI', () => {
  it('con clienteListas N:N — retorna nombre del vendedor de primera lista', () => {
    const cliente = {
      clienteListas: [{
        lista: { vendedores: [{ empleado: { nombre: 'HEIDY GONZALEZ' } }] }
      }]
    }
    expect(resolverVendedorCliente(cliente)).toBe('HEIDY')
  })

  it('sin clienteListas pero con lista legacy — fallback correcto', () => {
    const cliente = {
      clienteListas: [],
      lista: { vendedores: [{ empleado: { nombre: 'PEDRO LOPEZ' } }] }
    }
    expect(resolverVendedorCliente(cliente)).toBe('PEDRO')
  })

  it('sin listas — retorna —', () => {
    expect(resolverVendedorCliente({ clienteListas: [], lista: undefined })).toBe('—')
  })

  it('cliente en 2 listas — muestra vendedor de primera lista', () => {
    const cliente = {
      clienteListas: [
        { lista: { vendedores: [{ empleado: { nombre: 'HEIDY GONZALEZ' } }] } },
        { lista: { vendedores: [{ empleado: { nombre: 'CARLOS RUIZ' } }] } },
      ]
    }
    expect(resolverVendedorCliente(cliente)).toBe('HEIDY')
  })

  it('lista sin vendedor asignado — retorna —', () => {
    const cliente = {
      clienteListas: [{ lista: { vendedores: [] } }],
      lista: undefined
    }
    expect(resolverVendedorCliente(cliente)).toBe('—')
  })
})
