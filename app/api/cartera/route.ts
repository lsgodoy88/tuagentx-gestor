import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { checkPermiso } from '@/lib/permisos'
import { getListaCartera } from '@/lib/cartera/lista'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role === 'supervisor' && !checkPermiso(session, 'verCartera'))
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const result = await getListaCartera({
      empresaId: getEmpresaId(user),
      role: user.role,
      userId: user.id,
      userApiId: (user as any).apiId || null,
      q: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '15'),
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
