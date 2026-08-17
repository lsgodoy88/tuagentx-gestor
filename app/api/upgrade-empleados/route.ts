import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ROL_MAX_KEY: Record<string, string> = {
  vendedor:    'maxVendedores',
  supervisor:  'maxSupervisores',
  bodega:      'maxBodega',
  entregas:    'maxEntregas',
  impulsadora: 'maxImpulsadoras',
}

export async function POST(req: NextRequest) {
  const secret = process.env.MASTER_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { empresaId, roles } = await req.json()
  if (!empresaId || !roles) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  // Leer empresa actual
  const empresa = await (prisma as any).empresa.findUnique({
    where: { id: empresaId },
    select: {
      maxVendedores: true, maxSupervisores: true, maxBodega: true,
      maxEntregas: true, maxImpulsadoras: true, montoNegociado: true,
    },
  })
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  // Leer precios actuales
  const preciosRaw = await (prisma as any).precioRol.findMany({ select: { rol: true, precio: true } })
  const precios: Record<string, number> = {}
  for (const p of preciosRaw) precios[p.rol] = p.precio

  // Calcular incrementos y delta de monto
  const updates: Record<string, number> = {}
  let deltaMonto = 0

  for (const [rol, cantidad] of Object.entries(roles) as [string, number][]) {
    if (!cantidad || cantidad <= 0) continue
    const maxKey = ROL_MAX_KEY[rol]
    if (!maxKey) continue
    updates[maxKey] = (empresa[maxKey] ?? 0) + cantidad
    deltaMonto += cantidad * (precios[rol] ?? 0)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: 'Sin cambios' })
  }

  // Si tiene negociación activa → actualizar montoNegociado sumando el delta
  if (empresa.montoNegociado != null) {
    updates['montoNegociado'] = empresa.montoNegociado + deltaMonto
    updates['negociadoAt'] = new Date().toISOString() as any
  }

  // Construir SET dinámico con type-safe raw
  const setClauses = Object.keys(updates)
    .map((k, i) => `"${k}" = $${i + 2}`)
    .join(', ')
  const values = [empresaId, ...Object.values(updates)]

  await (prisma as any).$executeRawUnsafe(
    `UPDATE gestor."Empresa" SET ${setClauses} WHERE id = $1`,
    ...values
  )

  console.log(`[upgrade-empleados] ${empresaId} roles:`, roles, '→ deltaMonto:', deltaMonto, 'nuevoNegociado:', updates['montoNegociado'] ?? 'sin negociación')

  return NextResponse.json({ ok: true, updates, deltaMonto })
}
