import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { syncBodega } from '@/lib/bodega/sync'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const user = session.user as any
    if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const result = await syncBodega({
      empresaId: getEmpresaId(user),
      vinculadaId: body.vinculadaId || null,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    if (err.message === 'Empresa vinculada no encontrada') return NextResponse.json({ error: err.message }, { status: 400 })
    if (err.message === 'Sin integración activa') return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
