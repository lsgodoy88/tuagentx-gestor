import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const body = await req.json().catch(() => ({}))
  const vinculadaId: string | null = body.vinculadaId || null
  console.log('[bodega/sync] vinculadaId:', vinculadaId, 'empresaId:', empresaId)
  let integracionEmpresaId = empresaId
  let origenVinculadaId: string | null = null
  if (vinculadaId) {
    const vinculada = await (prisma as any).empresaVinculada.findFirst({
      where: { id: vinculadaId, empresaId, activa: true },
      select: { id: true, empresaClienteId: true }
    })
    if (!vinculada || !vinculada.empresaClienteId) return NextResponse.json({ error: 'Empresa vinculada no encontrada' }, { status: 400 })
    integracionEmpresaId = vinculada.empresaClienteId
  console.log('[bodega/sync] integracionEmpresaId:', integracionEmpresaId)
    origenVinculadaId = vinculadaId
  }

  // Obtener integración activa
  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId: integracionEmpresaId, tipo: 'uptres', activa: true }
  })
  console.log('[bodega/sync] integracion encontrada:', integracion?.id)
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  // Obtener días historial
  const rows = await prisma.$queryRaw<[{ diasHistorialBodega: number }]>`
    SELECT "diasHistorialBodega" FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  const dias = rows[0]?.diasHistorialBodega ?? 7
  const desde = new Date()
  desde.setDate(desde.getDate() - dias)

  // Fetch órdenes
  const ordenes = await adapter.fetchVentas(desde)

  // Filtrar por fCreado >= desde
  const desdeTs = desde.getTime()
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado).getTime() : 0
    return fc >= desdeTs
  })

  // Bulk load clientes por apiId
  const customerIds = [...new Set(ordenesFiltradas.map((o: any) => o.cliente?.uid).filter(Boolean))] as string[]
  const clientes = await prisma.cliente.findMany({
    where: { apiId: { in: customerIds }, empresaId: integracionEmpresaId },
    select: { apiId: true, nombre: true, nit: true, ciudad: true, direccion: true, telefono: true }
  })
  const mapaClientes = Object.fromEntries(clientes.map((c: any) => [c.apiId, c]))

  // Buscar órdenes existentes
  const origenIds = ordenesFiltradas.map((o: any) => o.uid).filter(Boolean) as string[]
  const existentes = await prisma.ordenDespacho.findMany({
    where: { empresaId, origenId: { in: origenIds } },
    select: { id: true, origenId: true, estado: true }
  })
  const existentesMap = Object.fromEntries(existentes.map((e: any) => [e.origenId, e]))

  const toCreate: any[] = []
  const toUpdate: any[] = []

  for (const o of ordenesFiltradas) {
    const origenId = o.uid as string
    if (!origenId) continue
    const clienteData = mapaClientes[o.cliente?.uid ?? ''] || {}
    const ciudadRaw: string | null = clienteData.ciudad || null
    const ciudad = ciudadRaw ? ciudadRaw.split('/').pop()?.trim() ?? ciudadRaw : null
    const data = {
      numeroOrden: String(o.numeroFacturado || ''),
      clienteNombre: clienteData.nombre || 'Sin nombre',
      clienteNit: clienteData.nit || null,
      ciudad,
      direccion: clienteData.direccion || null,
      telefono: clienteData.telefono || null,
      fechaOrden: o.fCreado ? new Date(o.fCreado) : null,
    }
    const existente = existentesMap[origenId]
    if (existente) {
      toUpdate.push({ id: existente.id, data })
    } else {
      toCreate.push({ empresaId, origen: 'uptres', origenId, estado: 'pendiente', origenVinculadaId, ...data })
    }
  }

  await prisma.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
  await Promise.all(toUpdate.map((u: any) => prisma.ordenDespacho.update({ where: { id: u.id }, data: u.data })))

  await (prisma as any).empresa.update({ where: { id: empresaId }, data: { ultimaSyncBodega: new Date() } })

  return NextResponse.json({
    ok: true,
    sincronizados: toCreate.length + toUpdate.length,
    nuevas: toCreate.length,
    actualizadas: toUpdate.length
  })
}
