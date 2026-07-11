import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Clientes únicos de todas las rutas fijas de la impulsadora
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'impulsadora') {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }

    const rutasFijas = await prisma.rutaFija.findMany({
      where: { empleados: { some: { empleadoId: user.id } } },
      select: {
        clientes: {
          select: {
            clienteId: true,
            cliente: { select: { id: true, nombre: true, nombreComercial: true } }
          }
        }
      }
    })

    // Deduplicar por clienteId
    const seen = new Set<string>()
    const clientes: any[] = []
    for (const rf of rutasFijas) {
      for (const rc of rf.clientes) {
        if (!seen.has(rc.clienteId)) {
          seen.add(rc.clienteId)
          clientes.push(rc.cliente)
        }
      }
    }

    return NextResponse.json({ clientes }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err: any) {
    console.error('[api/impulsar/clientes] error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
