import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function getPdfCarteraAdmin(params: { empresaId: string }) {
  const { empresaId } = params

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })
  if (!integracion) throw Object.assign(new Error('Sin integración'), { status: 400 })

  // Todas las deudas con saldo > 0
  const deudas: any[] = await prisma.$queryRaw`
    SELECT sd.id, sd.valor, sd."numeroFactura", sd."numeroOrden", sd.saldo, sd."nSaldo",
           sd."nSaldoBase", sd."nSaldoBaseAt", sd."ajusteManual",
           sd."fechaVencimiento", sd."clienteApiId", sd."externalId",
           sd."empleadoExternalId", sd.data
    FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
    WHERE sd."integracionId" = ${integracion.id}
      AND sd.condition = true
      AND sd."clienteApiId" IS NOT NULL
      AND sd.saldo::numeric > 0`

  const empresa = await (prisma as any).empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })

  if (deudas.length === 0) {
    return { empresa: empresa?.nombre || '', generadoEn: new Date().toISOString(), filas: [], totalSaldo: 0 }
  }

  // Mapa empleadoExternalId → nombre
  const apiIds = [...new Set(deudas.map((d: any) => d.empleadoExternalId).filter(Boolean))]
  const empleados: any[] = apiIds.length > 0
    ? await (prisma as any).empleado.findMany({
        where: { apiId: { in: apiIds }, empresaId },
        select: { apiId: true, nombre: true },
      })
    : []
  const empleadoMap = new Map(empleados.map((e: any) => [e.apiId, e.nombre]))

  const deudaIds = deudas.map((d: any) => d.id)
  const aplicaciones: any[] = await prisma.$queryRaw`
    SELECT pcd."syncDeudaId", pcd."montoAplicado", pcd."createdAt"
    FROM ${Prisma.raw(DB_SCHEMA)}."PagoCarteraDeuda" pcd
    WHERE pcd."syncDeudaId" = ANY(${deudaIds})`

  const nSaldos = calcularNSaldoBatch(deudas, aplicaciones)

  const clienteIds = [...new Set(deudas.map((d: any) => d.clienteApiId).filter(Boolean))]
  const caches: any[] = clienteIds.length > 0
    ? await (prisma as any).carteraCache.findMany({
        where: { integracionId: integracion.id, clienteApiId: { in: clienteIds } },
        select: { clienteApiId: true, nombre: true, telefono: true, ciudad: true },
      })
    : []
  const clienteMap = new Map(caches.map((c: any) => [c.clienteApiId, c]))

  const externalIds = deudas.map((d: any) => d.externalId).filter(Boolean)
  const ordenes: any[] = externalIds.length > 0
    ? await (prisma as any).ordenDespacho.findMany({
        where: { origenId: { in: externalIds }, empresaId },
        select: { origenId: true, direccion: true },
      })
    : []
  const ordenMap = new Map(ordenes.map((o: any) => [o.origenId, o]))

  const clientes: any[] = clienteIds.length > 0
    ? await (prisma as any).cliente.findMany({
        where: { apiId: { in: clienteIds }, empresaId },
        select: { apiId: true, nombre: true, telefono: true, ciudad: true, direccion: true },
      })
    : []
  const clienteFullMap = new Map(clientes.map((c: any) => [c.apiId, c]))

  const filas = deudas.map((d: any) => {
    const { nSaldo } = nSaldos[d.id] ?? { nSaldo: 0 }
    if (nSaldo <= 0) return null
    const c = clienteMap.get(d.clienteApiId)
    const o = ordenMap.get(d.externalId)
    const raw = d.data as any
    const toDate = (v: any) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' }) : ''
    const venceDate = d.fechaVencimiento || (raw?.fPago ? new Date(raw.fPago) : null)
    const diasv = calcularDiasV(venceDate)
    return {
      orden: d.numeroOrden ?? '',
      factura: d.numeroFactura ?? '',
      electronica: 0,
      fechaFactura: toDate(raw?.fCreado),
      cliente: c?.nombre || clienteFullMap.get(d.clienteApiId)?.nombre || '',
      direccion: o?.direccion || clienteFullMap.get(d.clienteApiId)?.direccion || '',
      celular: c?.telefono || clienteFullMap.get(d.clienteApiId)?.telefono || '',
      ciudad: c?.ciudad || clienteFullMap.get(d.clienteApiId)?.ciudad || '',
      vendedor: empleadoMap.get(d.empleadoExternalId) || '',
      venta: Math.round(parseFloat(d.valor ?? raw?.vTotal ?? '0')),
      saldo: Math.round(nSaldo),
      fechaVence: toDate(venceDate),
      diasv,
      edadcartera: calcularEdadCartera(diasv),
    }
  }).filter(Boolean)

  // Ordenar por vendedor
  filas.sort((a: any, b: any) => a.vendedor.localeCompare(b.vendedor))

  return {
    empresa: empresa?.nombre || '',
    generadoEn: new Date().toISOString(),
    filas,
    totalSaldo: filas.reduce((s: number, f: any) => s + f.saldo, 0),
  }
}
