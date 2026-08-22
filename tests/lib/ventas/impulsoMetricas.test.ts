import { describe, it, expect } from 'vitest'
import { buildSemana } from '@/lib/impulsoMetricas'

// Helpers para no repetir
function ruta(diaSemana: number, clientes: Array<{ clienteId: string, nombre: string, metaVenta?: number }>): any {
  return {
    diaSemana,
    clientes: clientes.map(c => ({
      clienteId: c.clienteId,
      metaVenta: c.metaVenta ?? 0,
      cliente: { nombre: c.nombre, nombreComercial: null },
    })),
  }
}

describe('lib/impulsoMetricas — buildSemana', () => {
  describe('orden de la semana: lun→sáb→dom', () => {
    it('siempre devuelve 7 slots (ORDEN = [1,2,3,4,5,6,0])', () => {
      const result = buildSemana([], {})
      expect(result.length).toBe(7)
    })

    it('días sin ruta son null', () => {
      const result = buildSemana([ruta(1, [{ clienteId: 'c1', nombre: 'Cliente 1' }])], {})
      expect(result[0]).not.toBeNull() // lunes (índice 0 en ORDEN)
      expect(result[1]).toBeNull()     // martes
    })

    it('nombre del día es correcto (DIAS)', () => {
      const r = buildSemana([ruta(1, [{ clienteId: 'c1', nombre: 'X' }])], {})
      expect(r[0]?.nombre).toBe('Lunes')
      const dom = buildSemana([ruta(0, [{ clienteId: 'c1', nombre: 'X' }])], {})
      expect(dom[6]?.nombre).toBe('Domingo')
    })
  })

  describe('semáforo por cliente', () => {
    const semana = (meta: number, monto: number) => buildSemana(
      [ruta(1, [{ clienteId: 'c1', nombre: 'Cliente 1', metaVenta: meta }])],
      { c1: monto }
    )

    it('cumplimiento >= 80% → verde', () => {
      expect(semana(100, 80)[0]?.puntos[0].semaforo).toBe('verde')
      expect(semana(100, 150)[0]?.puntos[0].semaforo).toBe('verde')
    })

    it('cumplimiento 50-79% → amarillo', () => {
      expect(semana(100, 50)[0]?.puntos[0].semaforo).toBe('amarillo')
      expect(semana(100, 79)[0]?.puntos[0].semaforo).toBe('amarillo')
    })

    it('cumplimiento < 50% → rojo', () => {
      expect(semana(100, 49)[0]?.puntos[0].semaforo).toBe('rojo')
      expect(semana(100, 0)[0]?.puntos[0].semaforo).toBe('rojo')
    })

    it('meta=0 → gris (no se evalúa)', () => {
      const r = semana(0, 5000)
      expect(r[0]?.puntos[0].semaforo).toBe('gris')
      expect(r[0]?.puntos[0].pct).toBeNull()
    })
  })

  describe('deduplicación con esPrimero', () => {
    it('cliente que aparece lunes Y martes: cuenta SOLO el lunes', () => {
      const result = buildSemana(
        [
          ruta(1, [{ clienteId: 'c1', nombre: 'Repe', metaVenta: 100 }]),
          ruta(2, [{ clienteId: 'c1', nombre: 'Repe', metaVenta: 100 }]),
        ],
        { c1: 80 }
      )
      // Lunes (índice 0): primera vez → cuenta completo
      expect(result[0]?.puntos[0].esPrimero).toBe(true)
      expect(result[0]?.puntos[0].meta).toBe(100)
      expect(result[0]?.puntos[0].montoMes).toBe(80)
      expect(result[0]?.puntos[0].semaforo).toBe('verde')

      // Martes (índice 1): repetido → meta/monto en 0, semáforo gris
      expect(result[1]?.puntos[0].esPrimero).toBe(false)
      expect(result[1]?.puntos[0].meta).toBe(0)
      expect(result[1]?.puntos[0].montoMes).toBe(0)
      expect(result[1]?.puntos[0].semaforo).toBe('gris')
    })

    it('cliente único en domingo: el ORDEN lo evalúa al final', () => {
      // Si está SOLO el domingo, no hay "ya vistos" antes
      const r = buildSemana([ruta(0, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }])], { c1: 90 })
      expect(r[6]?.puntos[0].esPrimero).toBe(true)
    })

    it('mismo cliente en domingo + lunes: el LUNES gana (porque viene antes en ORDEN)', () => {
      const r = buildSemana(
        [
          ruta(0, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }]), // domingo
          ruta(1, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }]), // lunes
        ],
        { c1: 90 }
      )
      // Lunes (índice 0 en ORDEN) → esPrimero
      expect(r[0]?.puntos[0].esPrimero).toBe(true)
      // Domingo (índice 6) → ya visto, gris
      expect(r[6]?.puntos[0].esPrimero).toBe(false)
    })
  })

  describe('totales por día', () => {
    it('suma meta y monto de todos los puntos primeros', () => {
      const r = buildSemana(
        [ruta(1, [
          { clienteId: 'c1', nombre: 'A', metaVenta: 100 },
          { clienteId: 'c2', nombre: 'B', metaVenta: 200 },
          { clienteId: 'c3', nombre: 'C', metaVenta: 50 },
        ])],
        { c1: 80, c2: 200, c3: 25 }
      )
      const dia = r[0]!
      expect(dia.totalMeta).toBe(350)
      expect(dia.totalMes).toBe(305)
      // pctTotal = round(305/350 * 100) = round(87.14) = 87
      expect(dia.pctTotal).toBe(87)
    })

    it('totalMeta=0 → pctTotal=null', () => {
      const r = buildSemana([ruta(1, [{ clienteId: 'c1', nombre: 'X' }])], { c1: 500 })
      expect(r[0]?.totalMeta).toBe(0)
      expect(r[0]?.pctTotal).toBeNull()
    })

    it('cliente repetido NO duplica el total', () => {
      const r = buildSemana(
        [
          ruta(1, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }]),
          ruta(2, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }]),
        ],
        { c1: 80 }
      )
      // Lunes cuenta 100/80, martes cuenta 0/0
      expect(r[0]?.totalMeta).toBe(100)
      expect(r[0]?.totalMes).toBe(80)
      expect(r[1]?.totalMeta).toBe(0)
      expect(r[1]?.totalMes).toBe(0)
    })
  })

  describe('ventas no presentes', () => {
    it('cliente sin entrada en ventasPorCliente → monto 0', () => {
      const r = buildSemana(
        [ruta(1, [{ clienteId: 'c1', nombre: 'X', metaVenta: 100 }])],
        {} // sin ventas
      )
      expect(r[0]?.puntos[0].montoMes).toBe(0)
      expect(r[0]?.puntos[0].semaforo).toBe('rojo')
    })
  })
})
