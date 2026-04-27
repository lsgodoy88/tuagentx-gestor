import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const precios = await prisma.precioRol.findMany()

  // Calcular resumen por empresa
  const empresas = await prisma.empresa.findMany({
    where: { activo: true, email: { not: 'admin@tuagentx' } },
    include: {
      empleados: { where: { activo: true }, select: { rol: true } }
    }
  })

  const preciosMap: Record<string, number> = {}
  for (const p of precios) preciosMap[p.rol] = p.precio

  const resumenEmpresas = empresas.map(e => {
    const conteo: Record<string, number> = {}
    for (const emp of e.empleados) {
      conteo[emp.rol] = (conteo[emp.rol] || 0) + 1
    }
    const total = Object.entries(conteo).reduce((sum, [rol, cant]) => sum + (preciosMap[rol] || 0) * cant, 0)
    return { id: e.id, nombre: e.nombre, plan: e.plan, conteo, total }
  })

  return NextResponse.json({ precios, resumenEmpresas })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { rol, precio } = await req.json()
  if (!rol || precio === undefined) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const updated = await prisma.precioRol.update({
    where: { rol },
    data: { precio: Number(precio) }
  })

  return NextResponse.json({ ok: true, updated })
}
