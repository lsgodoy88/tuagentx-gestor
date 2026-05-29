import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any

    if (user.role === 'empresa' || user.role === 'superadmin') {
      const empresa = await prisma.empresa.findUnique({
        where: { id: user.id },
        select: { id: true, nombre: true, email: true, plan: true, activo: true,
                  maxSupervisores: true, maxVendedores: true, maxEntregas: true,
                  maxImpulsadoras: true, createdAt: true },
      })
      return NextResponse.json(empresa || {})
    } else {
      const empleado = await prisma.empleado.findUnique({
        where: { id: user.id },
        select: { id: true, nombre: true, email: true, telefono: true, rol: true,
                  activo: true, vendedorId: true, puedeCapturarGps: true,
                  empresaId: true, createdAt: true, colorFondo: true },
      })
      return NextResponse.json(empleado || {})
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const body = await req.json()

    // Solo empleados pueden actualizar preferencias de tema
    if (user.role === 'empresa' || user.role === 'superadmin') {
      return NextResponse.json({ error: 'No disponible para empresa' }, { status: 400 })
    }

    const data: any = {}
    if (typeof body.colorFondo === 'string') {
      // Validar que sea un color hex válido o null
      const valid = /^#[0-9a-fA-F]{6}$/.test(body.colorFondo)
      if (!valid && body.colorFondo !== '') return NextResponse.json({ error: 'Color inválido' }, { status: 400 })
      data.colorFondo = body.colorFondo || null
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

    await prisma.empleado.update({ where: { id: user.id }, data })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
