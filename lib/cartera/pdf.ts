import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { calcularDiasV, calcularEdadCartera } from '@/lib/cartera'
import { calcularNSaldoBatch } from '@/lib/cartera/calcularSaldo'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function getPdfCartera(params: {
  empresaId: string
  role: string
  userId: string
  userName: string
  userApiId?: string | null
  vendedorApiIdParam?: string | null
}) {
  const { empresaId, role, userId, userName, userApiId, vendedorApiIdParam } = params

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })
  if (!integracion) throw Object.assign(new Error('Sin integración'), { status: 400 })

  let empleadoApiId: string | null = userApiId || null
  let empleadoNombre: string = userName || ''

  if (!empleadoApiId && role === 'vendedor') {
    const emp = await (prisma as any).empleado.findUnique({
      where: { id: userId }, select: { apiId: true, nombre: true },
    })
    empleadoApiId = emp?.apiId || null
    if (emp?.nombre) empleadoNombre = emp.nombre
  }

  if ((role === 'empresa' || role === 'supervisor') && vendedorApiIdParam) {
    empleadoApiId = vendedorApiIdParam
    const emp = await (prisma as any).empleado.findFirst({
      where: { apiId: vendedorApiIdParam, empresaId }, select: { nombre: true },
    })
    if (emp?.nombre) empleadoNombre = emp.nombre
  }

  if (!empleadoApiId) throw Object.assign(new Error('Sin apiId de vendedor'), { status: 400 })

  const deudas: any[] = await prisma.$queryRaw`
    SELECT sd.id, sd.valor, sd."numeroFactura", sd."numeroOrden", sd.saldo, sd."nSaldo",
           sd."nSaldoBase", sd."nSaldoBaseAt", sd."ajusteManual",
           sd."fechaVencimiento", sd."clienteApiId", sd."externalId", sd.data
    FROM ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd
    WHERE sd."integracionId" = ${integracion.id}
      AND sd."empleadoExternalId" = ${empleadoApiId}
      AND sd.condition = true
      AND sd."clienteApiId" IS NOT NULL
      AND sd.saldo::numeric > 0`

  const empresa = await (prisma as any).empresa.findUnique({ where: { id: empresaId }, select: { nombre: true } })

  if (deudas.length === 0) {
    return { empresa: empresa?.nombre || '', vendedor: empleadoNombre, generadoEn: new Date().toISOString(), filas: [], totalSaldo: 0 }
  }

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
      venta: Math.round(parseFloat(d.valor ?? raw?.vTotal ?? '0')),
      saldo: Math.round(nSaldo),
      fechaVence: toDate(venceDate),
      diasv,
      edadcartera: calcularEdadCartera(diasv),
    }
  }).filter(Boolean)

  return {
    empresa: empresa?.nombre || '',
    vendedor: empleadoNombre,
    generadoEn: new Date().toISOString(),
    filas,
    totalSaldo: filas.reduce((s: number, f: any) => s + f.saldo, 0),
  }
}
