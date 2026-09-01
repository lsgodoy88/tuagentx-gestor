import { DIAS } from '@/lib/constants'
import { prisma } from '@/lib/prisma'

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

    // Fuente única: VentaMesCliente — acumulado real por mes, independiente
    // de cuándo se sincronizó UpTres. Reemplaza SyncDeuda.modificadoEn que
    // fallaba cuando la sincronización ocurría después del cierre del mes.
    const mesLabel = fecha.slice(0, 7) // '2026-07'
    const ventasMes = await (prisma as any).ventaMesCliente.findMany({
      where: { clienteId: { in: clienteIds }, mes: mesLabel },
      select: { clienteId: true, totalVenta: true }
    })
    for (const v of ventasMes) {
      ventasPorCliente[v.clienteId] = Number(v.totalVenta || 0)
    }

    // Fallback para clientes sin apiId que no tienen VentaMesCliente: usar Visita
    const conVentaMes = new Set(ventasMes.map((v: any) => v.clienteId))
    const sinVentaMes = clienteIds.filter((id: string) => !conVentaMes.has(id))
    const sinApiId = clientes.filter((c: any) => !c.apiId && sinVentaMes.includes(c.id))

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


/**
 * Fuente única para ventas del mes de impulsadoras.
 * Usada por: /api/vendedor/stats (Dashboard) y disponible para cualquier
 * consumidor que necesite totalVenta por impulsadora o por cliente.
 *
 * Devuelve:
 *   porCliente: Map clienteId → totalVenta del mes
 *   porImp:     Map empleadoId → { totalVenta, totalMeta }
 */
export async function getVentasMesImpulsadoras(
  impIds: string[],
  mesLabel: string // formato 'YYYY-MM'
): Promise<{
  porCliente: Map<string, number>
  porImp: Map<string, { totalVenta: number; totalMeta: number }>
}> {
  if (impIds.length === 0) {
    return { porCliente: new Map(), porImp: new Map() }
  }

  // Todas las rutas fijas de estas impulsadoras con sus clientes y metas
  const rutasFijas = await prisma.rutaFija.findMany({
    where: { empleados: { some: { empleadoId: { in: impIds } } } },
    select: {
      clientes: { select: { clienteId: true, metaVenta: true } },
      empleados: { select: { empleadoId: true } },
    },
  })

  const todosClienteIds = [...new Set(rutasFijas.flatMap((r: any) => r.clientes.map((c: any) => c.clienteId)))]

  // Una sola query a VentaMesCliente
  const ventasMes = await (prisma as any).ventaMesCliente.findMany({
    where: { clienteId: { in: todosClienteIds }, mes: mesLabel },
    select: { clienteId: true, totalVenta: true },
  })

  const porCliente = new Map<string, number>()
  for (const v of ventasMes) {
    porCliente.set(v.clienteId, Number(v.totalVenta || 0))
  }

  // Agregar por impulsadora con dedup de clientes compartidos
  const porImp = new Map<string, { totalVenta: number; totalMeta: number }>()
  const clientesYaPorImp = new Map<string, Set<string>>()

  for (const ruta of rutasFijas) {
    for (const emp of ruta.empleados) {
      const eid = emp.empleadoId
      if (!porImp.has(eid)) porImp.set(eid, { totalVenta: 0, totalMeta: 0 })
      if (!clientesYaPorImp.has(eid)) clientesYaPorImp.set(eid, new Set())
      const vistos = clientesYaPorImp.get(eid)!
      for (const rc of ruta.clientes) {
        if (vistos.has(rc.clienteId)) continue
        vistos.add(rc.clienteId)
        const imp = porImp.get(eid)!
        imp.totalVenta += porCliente.get(rc.clienteId) || 0
        imp.totalMeta  += rc.metaVenta || 0
      }
    }
  }

  return { porCliente, porImp }
}
