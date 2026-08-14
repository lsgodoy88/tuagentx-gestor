import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { patchDespacho } from '@/lib/bodega/despacho-patch'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN_BODEGA.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  try {
    const result = await patchDespacho({
      id,
      empresaId: getEmpresaId(user),
      empleadoId: user.role !== 'empresa' ? user.id : null,
      userName: user.name ?? null,
      body,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status ?? 500
    return NextResponse.json({ error: err.message || 'Error interno' }, { status })
  }
}
