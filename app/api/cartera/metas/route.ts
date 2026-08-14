import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { mesBogota, anioBogota } from '@/lib/fechas'
import { getMetasCartera, upsertMetaCartera } from '@/lib/cartera/metas'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const { searchParams } = new URL(req.url)
    const result = await getMetasCartera({
      empresaId: getEmpresaId(user),
      role: user.role,
      userId: user.id,
      mes: parseInt(searchParams.get('mes') || String(mesBogota())),
      anio: parseInt(searchParams.get('anio') || String(anioBogota())),
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role === 'vendedor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const { empleadoId, mes, anio, metaPesos, metaPct } = await req.json()
    if (!empleadoId || !mes || !anio || !metaPesos)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const result = await upsertMetaCartera({
      empresaId: getEmpresaId(user),
      empleadoId, mes, anio, metaPesos, metaPct,
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
