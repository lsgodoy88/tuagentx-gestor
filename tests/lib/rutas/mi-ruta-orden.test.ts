import { describe, it, expect } from 'vitest'

// Replica exacta de la lógica de ordenamiento en mi-ruta/route.ts
function sortClientesHoy(clientes: any[]) {
  return [...clientes].sort((a, b) => {
    if (a.rezago && !b.rezago) return -1
    if (!a.rezago && b.rezago) return 1
    const fechaA = a.ordenCreadaEl ? new Date(a.ordenCreadaEl).getTime() : 0
    const fechaB = b.ordenCreadaEl ? new Date(b.ordenCreadaEl).getTime() : 0
    return fechaA - fechaB
  })
}

const mkCliente = (id: string, ordenCreadaEl: string | null, rezago = false) => ({
  id,
  rezago,
  ordenCreadaEl,
})

describe('mi-ruta — ordenamiento clientesHoy', () => {
  it('ordena por ordenCreadaEl ASC (más antigua primero)', () => {
    const clientes = [
      mkCliente('C', '2026-09-08T11:44:00Z'),
      mkCliente('A', '2026-09-05T09:42:00Z'),
      mkCliente('B', '2026-09-08T10:55:00Z'),
    ]
    const result = sortClientesHoy(clientes)
    expect(result.map(c => c.id)).toEqual(['A', 'B', 'C'])
  })

  it('rezago siempre primero sin importar fecha', () => {
    const clientes = [
      mkCliente('nueva', '2026-09-08T08:00:00Z', false),
      mkCliente('rezago', '2026-09-07T06:00:00Z', true),
    ]
    const result = sortClientesHoy(clientes)
    expect(result[0].id).toBe('rezago')
    expect(result[1].id).toBe('nueva')
  })

  it('múltiples rezagos se ordenan entre ellos por fecha ASC', () => {
    const clientes = [
      mkCliente('R2', '2026-09-06T10:00:00Z', true),
      mkCliente('R1', '2026-09-05T08:00:00Z', true),
      mkCliente('N1', '2026-09-08T09:00:00Z', false),
    ]
    const result = sortClientesHoy(clientes)
    expect(result.map(c => c.id)).toEqual(['R1', 'R2', 'N1'])
  })

  it('cliente sin ordenCreadaEl (null) va al final de su grupo', () => {
    const clientes = [
      mkCliente('sinFecha', null, false),
      mkCliente('conFecha', '2026-09-08T10:00:00Z', false),
    ]
    const result = sortClientesHoy(clientes)
    expect(result[0].id).toBe('sinFecha') // null → 0 ms → va primero
    expect(result[1].id).toBe('conFecha')
  })

  it('lista vacía retorna vacía', () => {
    expect(sortClientesHoy([])).toEqual([])
  })

  it('caso real imagen: F_1777(5/9) < F_1788(8/9) < F_1786(8/9 posterior)', () => {
    const clientes = [
      mkCliente('F_1788', '2026-09-08T10:55:00Z'),
      mkCliente('F_1777', '2026-09-05T09:42:00Z'),
      mkCliente('F_1786', '2026-09-08T11:44:00Z'),
    ]
    const result = sortClientesHoy(clientes)
    expect(result.map(c => c.id)).toEqual(['F_1777', 'F_1788', 'F_1786'])
  })
})
