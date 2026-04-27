import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import https from 'https'

const UPTRES_URL = 'https://www.uptres.top'
const agent = new https.Agent({ rejectUnauthorized: false })

async function fetchOrdenes(token: string, desdeTs: number): Promise<any[]> {
  const headers = { 'x-token': token }
  const base = `${UPTRES_URL}/ordenventa?desde=${desdeTs}&size=50&sort=numeroOrden&order=desc&search=&tipobusqueda=todos`

  // 1. Fetch página 0 para conocer lastPage
  const first = await fetch(`${base}&page=0`, { headers, ...(agent as any) }).then(r => r.json())
  if (!first.ok) return []
  const items = first.dataDBArray || []
  const lastPage = first.pagination?.lastPage ?? 0
  if (lastPage === 0) return items

  // 2. Fetch resto de páginas en paralelo
  const pages = await Promise.all(
    Array.from({ length: lastPage }, (_, i) => i + 1).map(p =>
      fetch(`${base}&page=${p}`, { headers, ...(agent as any) }).then(r => r.json())
    )
  )

  return [...items, ...pages.flatMap(d => d.dataDBArray || [])]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const rows = await prisma.$queryRaw<[{ diasHistorialBodega: number }]>`
    SELECT "diasHistorialBodega" FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  const dias = rows[0]?.diasHistorialBodega ?? 7

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true },
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración UpTres activa' }, { status: 400 })

  const config = integracion.config as any
  const password = config.token ? '' : decrypt(config.password, process.env.UPTRES_SECRET!)
  const adapter = config.token
    ? new UpTresAdapter('', '', config.token)
    : new UpTresAdapter(config.email, password)

  await adapter.login()
  const token = adapter.getToken()

  const desde = new Date()
  desde.setDate(desde.getDate() - dias)
  const desdeTs = Math.floor(desde.getTime() / 1000)

  const ordenes = await fetchOrdenes(token, desdeTs)
  const ordenesFiltradas = ordenes.filter((o: any) => {
    const fc = o.fCreado ? new Date(o.fCreado).getTime() / 1000 : 0
    return fc >= desdeTs
  })

  // 2. Extraer apiIds únicos de clientes
  const clienteApiIds = [...new Set(ordenesFiltradas.map((o: any) => o.cliente?.uid).filter(Boolean))]

  // 3. Una sola query — bulk load clientes
  const clientes = await prisma.cliente.findMany({
    where: { apiId: { in: clienteApiIds }, empresaId },
    select: { apiId: true, ciudad: true }
  })
  const mapaCiudades = Object.fromEntries(clientes.map(c => [c.apiId, c.ciudad]))

  // 4. Preparar todos los datos en memoria
  const ahora = new Date()
  const toUpsert = ordenesFiltradas.map((o: any) => {
    const clienteApiId = o.cliente?.uid || null
    const ciudadRaw = mapaCiudades[clienteApiId] || o.nameciudad || o.ciudad || null
    const ciudad = ciudadRaw ? ciudadRaw.split('/').pop()?.trim() ?? ciudadRaw : null
    const nombreCompleto = (() => {
      const n = o.cliente?.name || ''
      const l = o.cliente?.lastName?.trim() || ''
      return (n + ' ' + l).trim() || 'Sin nombre'
    })()
    return {
      origenId: o.uid || o._id,
      numeroOrden: String(o.numeroOrden || ''),
      clienteNombre: nombreCompleto,
      clienteNit: o.cliente?.doc || null,
      ciudad,
      direccion: o.cliente?.dir || null,
      telefono: o.cliente?.nCel || null,
      fechaOrden: o.fCreado ? new Date(o.fCreado) : null,
    }
  })

  // 5. Bulk upsert — verificar existentes en una query
  const origenIds = toUpsert.map(o => o.origenId).filter(Boolean)
  const existentes = await prisma.ordenDespacho.findMany({
    where: { empresaId, origenId: { in: origenIds } },
    select: { id: true, origenId: true, estado: true }
  })
  const existentesMap = Object.fromEntries(existentes.map(e => [e.origenId, e]))

  // 6. Separar creates y updates
  const toCreate = []
  const toUpdate = []
  for (const o of toUpsert) {
    if (!o.origenId) continue
    const existente = existentesMap[o.origenId]
    if (existente) {
      toUpdate.push({ id: existente.id, data: { numeroOrden: o.numeroOrden, clienteNombre: o.clienteNombre, clienteNit: o.clienteNit, ciudad: o.ciudad, direccion: o.direccion, telefono: o.telefono, fechaOrden: o.fechaOrden } })
    } else {
      toCreate.push({ empresaId, origen: 'uptres', ...o })
    }
  }

  // 7. Batch create + parallel updates
  await prisma.ordenDespacho.createMany({ data: toCreate, skipDuplicates: true })
  await Promise.all(toUpdate.map(u => prisma.ordenDespacho.update({ where: { id: u.id }, data: u.data })))

  return NextResponse.json({ ok: true, sincronizados: toCreate.length + toUpdate.length, nuevas: toCreate.length, actualizadas: toUpdate.length })
}
