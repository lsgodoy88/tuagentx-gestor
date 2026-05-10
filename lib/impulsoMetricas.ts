import { DIAS } from './constants'

export interface PuntoMetrica {
  clienteId: string
  nombre: string
  nombreComercial: string | null
  meta: number
  montoMes: number
  ventasMes: number
  pct: number | null
  semaforo: string
  esPrimero: boolean
}

export interface DiaMetrica {
  dia: number
  nombre: string
  puntos: PuntoMetrica[]
  totalMeta: number
  totalMes: number
  pctTotal: number | null
}

const ORDEN = [1, 2, 3, 4, 5, 6, 0]

/**
 * ventasPorCliente: mapa clienteId -> monto total del mes
 * Puede venir de SyncDeuda (ERP) o Visita (manual)
 */
export function buildSemana(
  rutasFijas: any[],
  ventasPorCliente: Record<string, number>
): (DiaMetrica | null)[] {
  return ORDEN.map(dia => {
    const ruta = rutasFijas.find((r: any) => r.diaSemana === dia)
    if (!ruta) return null

    const yaVistos = new Set(
      ORDEN.slice(0, ORDEN.indexOf(dia)).flatMap((d: number) => {
        const r = rutasFijas.find((rf: any) => rf.diaSemana === d)
        return r ? r.clientes.map((c: any) => c.clienteId) : []
      })
    )

    const puntos: PuntoMetrica[] = ruta.clientes.map((rc: any) => {
      const montoMes = ventasPorCliente[rc.clienteId] || 0
      const meta = rc.metaVenta || 0
      const pct = meta > 0 ? Math.round((montoMes / meta) * 100) : null
      const semaforo = pct === null ? 'gris' : pct >= 80 ? 'verde' : pct >= 50 ? 'amarillo' : 'rojo'
      const esPrimero = !yaVistos.has(rc.clienteId)
      return {
        clienteId: rc.clienteId,
        nombre: rc.cliente.nombre,
        nombreComercial: rc.cliente.nombreComercial || null,
        meta: esPrimero ? meta : 0,
        montoMes: esPrimero ? montoMes : 0,
        ventasMes: esPrimero ? (montoMes > 0 ? 1 : 0) : 0,
        pct: esPrimero ? pct : null,
        semaforo: esPrimero ? semaforo : 'gris',
        esPrimero,
      }
    })

    const totalMeta = puntos.reduce((a, p) => a + p.meta, 0)
    const totalMes = puntos.reduce((a, p) => a + p.montoMes, 0)
    const pctTotal = totalMeta > 0 ? Math.round((totalMes / totalMeta) * 100) : null

    return { dia, nombre: DIAS[dia], puntos, totalMeta, totalMes, pctTotal }
  })
}
