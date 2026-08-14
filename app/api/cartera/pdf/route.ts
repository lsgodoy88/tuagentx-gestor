import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { getPdfCartera } from '@/lib/cartera/pdf'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    const { searchParams } = new URL(req.url)

    const result = await getPdfCartera({
      empresaId: getEmpresaId(user),
      role: user.role,
      userId: user.id,
      userName: user.name || '',
      userApiId: (user as any).apiId || null,
      vendedorApiIdParam: searchParams.get('vendedorApiId'),
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 })
  }
}
