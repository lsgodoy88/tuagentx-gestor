import { DIAS } from './constants'
import { prisma } from './prisma'

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


/**
 * Calcula el reporte completo de impulsadoras para un mes dado (mismo cálculo
 * usado en vivo por /api/impulso/pdf y en el snapshot mensual congelado).
 * whereImpExtra permite acotar a un vendedor/impulsadora específico (scope
 * por rol), sin duplicar la lógica de cálculo.
 */
export async function calcularImpulsadorasMes(
  empresaId: string,
  fecha: string,
  whereImpExtra: any = {}
) {
  const inicioMes = new Date(fecha.slice(0, 7) + '-01T00:00:00.000Z')
  const finMes = new Date(new Date(inicioMes).setMonth(inicioMes.getMonth() + 1) - 1)
  const mesLabel = inicioMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  const whereImp: any = { empresaId, rol: 'impulsadora', activo: true, ...whereImpExtra }

  const impulsadoras = await prisma.empleado.findMany({
    where: whereImp,
    orderBy: { nombre: 'asc' }
  })

  const resultados = await Promise.all(impulsadoras.map(async (imp: any) => { try {
    const rutasFijas = await prisma.rutaFija.findMany({
      where: { empleados: { some: { empleadoId: imp.id } } },
      include: { clientes: { select: { id: true, clienteId: true, orden: true, metaVenta: true, cliente: { select: { id: true, nombre: true, nombreComercial: true } } }, orderBy: { orden: 'asc' } } }
    })

    if (rutasFijas.length === 0) return null

    const clienteIds = [...new Set(rutasFijas.flatMap((r: any) => r.clientes.map((c: any) => c.clienteId)))]

    const clientes = await prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, apiId: true }
    })

    const ventasPorCliente: Record<string, number> = {}

    const conApiId = clientes.filter((c: any) => c.apiId)
    const sinApiId = clientes.filter((c: any) => !c.apiId)

    if (conApiId.length > 0) {
      const apiIds = conApiId.map((c: any) => c.apiId)
      const apiIdToClienteId = Object.fromEntries(conApiId.map((c: any) => [c.apiId, c.id]))

      const deudas = await (prisma as any).syncDeuda.findMany({
        where: {
          clienteApiId: { in: apiIds },
          modificadoEn: { gte: inicioMes, lte: finMes },
          condition: true,
        },
        select: { clienteApiId: true, valor: true }
      })

      for (const d of deudas) {
        const cid = apiIdToClienteId[d.clienteApiId]
        if (!cid) continue
        ventasPorCliente[cid] = (ventasPorCliente[cid] || 0) + Number(d.valor)
      }
    }

    if (sinApiId.length > 0) {
      const ids = sinApiId.map((c: any) => c.id)
      const visitas = await prisma.visita.findMany({
        where: {
          clienteId: { in: ids },
          empleadoId: imp.id,
          tipo: { in: ['venta', 'cobro'] },
          fechaBogota: { gte: inicioMes, lte: finMes }
        },
        select: { clienteId: true, monto: true }
      })
      for (const v of visitas) {
        ventasPorCliente[v.clienteId] = (ventasPorCliente[v.clienteId] || 0) + Number(v.monto || 0)
      }
    }

    const semana = buildSemana(rutasFijas, ventasPorCliente).filter(Boolean)
    const totalMeta = semana.reduce((a: number, d: any) => a + d.totalMeta, 0)
    const totalMes = semana.reduce((a: number, d: any) => a + d.totalMes, 0)
    const pctTotal = totalMeta > 0 ? Math.round((totalMes / totalMeta) * 100) : null

    return { id: imp.id, nombre: imp.nombre, vendedorId: imp.vendedorId || null, semana, totalMeta, totalMes, pctTotal }
  } catch (e: any) { console.error('[calcularImpulsadorasMes]', imp.nombre, e.message); return null } }))

  return {
    mes: mesLabel,
    fecha,
    impulsadoras: resultados.filter(Boolean),
  }
}
