import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

// PATCH /api/impulsadora/priorizable — toggle priorizableHoy en RutaFija
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const empresaId = getEmpresaId(user)

    const { rutaFijaId, priorizableHoy } = await req.json()
    if (!rutaFijaId || priorizableHoy === undefined) {
      return NextResponse.json({ error: 'Parámetros requeridos' }, { status: 400 })
    }

    // Validar que la ruta pertenece a la empresa
    const ruta = await prisma.rutaFija.findFirst({
      where: { id: rutaFijaId, empresaId }
    })
    if (!ruta) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    await prisma.rutaFija.update({
      where: { id: rutaFijaId },
      data: { priorizableHoy }
    })

    return NextResponse.json({ ok: true, priorizableHoy })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
