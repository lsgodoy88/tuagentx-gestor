import { NextResponse } from 'next/server'
import { nowBogota, fechaHoyBogota, haceNDiasBogota, haceNMesesBogota, inicioDiaBogota, finDiaBogota, inicioMesBogota, inicioMesAnteriorBogota, mesBogota, anioBogota, mesAnteriorBogota, anioMesAnteriorBogota, esDelMesBogota, fmtFechaHora, fmtFechaMedia, fmtHora } from '@/lib/fechas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 2 * 60 * 1000  // 2 min

export async function GET() {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega'].includes(user.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const cached = cache.get(user.empresaId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data)

  const hoy = inicioDiaBogota()

  // Incluye órdenes propias + de empresas vinculadas activas (FIX 2026-06-20:
  // ya no hay copia física por vinculación, hay que sumar explícitamente)
  const vinculadas = await (prisma as any).empresaVinculada.findMany({
    where: { empresaId: user.empresaId, activa: true },
    select: { id: true, nombre: true, empresaClienteId: true },
  })

  // Empresa propia
  const propiaEmpresa = await (prisma as any).empresa.findUnique({
    where: { id: user.empresaId }, select: { nombre: true }
  })

  // Contadores por empresa
  const empresas = [
    { id: user.empresaId, nombre: propiaEmpresa?.nombre || 'Principal', slug: 'propia', clienteId: user.empresaId },
    ...vinculadas.map((v: any) => ({
      id: v.id, nombre: v.nombre,
      slug: v.nombre.toLowerCase().replace(/\s+/g, '-'),
      clienteId: v.empresaClienteId
    }))
  ]

  const contadores = await Promise.all(empresas.map(async e => {
    const [pendientes, alistados, entregados, agotados, stockBajo] = await Promise.all([
      prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: 'pendiente' } }),
      prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: 'alistado' } }),
      prisma.ordenDespacho.count({ where: { empresaId: e.clienteId, estado: { in: ['en_entrega', 'entregado'] }, entregadoEl: { gte: hoy } } }),
      // Agotados: últimos reportados via StockSnapshot
      (prisma as any).stockSnapshot.findMany({
        where: { empresaId: e.clienteId, estado: 'agotado' },
        select: { nombre: true, inventory: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      // Stock bajo: últimos reportados via StockSnapshot
      (prisma as any).stockSnapshot.findMany({
        where: { empresaId: e.clienteId, estado: 'stock_bajo' },
        select: { nombre: true, inventory: true, stockMinimo: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ])
    return { ...e, pendientes, alistados, entregados, agotados, stockBajo }
  }))

  const data = { empresas: contadores }
  cache.set(user.empresaId, { data, ts: Date.now() })
  return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
