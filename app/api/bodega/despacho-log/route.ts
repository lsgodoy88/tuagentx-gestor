import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { getDespachoLog } from '@/lib/bodega/despacho-log'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor', 'bodega', 'vendedor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const data = await getDespachoLog({
    empresaId: getEmpresaId(user),
    origenId: sp.get('origenId') ?? 'propia',
    cursor: sp.get('cursor'),
    role: user.role,
    apiId: user.apiId,
  })

  return NextResponse.json(data)
}
