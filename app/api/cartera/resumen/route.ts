import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId, vendedorScope } from '@/lib/auth-helpers'
import { getResumenCartera } from '@/lib/cartera/resumen'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any

    const { permitido, empleadoIdForzado } = vendedorScope(user)
    if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const data = await getResumenCartera({
      empresaId: getEmpresaId(user),
      empleadoIdForzado,
    })

    const res = NextResponse.json(data)
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
