import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { getPdfCarteraAdmin } from '@/lib/cartera/pdfAdmin'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor'].includes(user.role)) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    }
    const result = await getPdfCarteraAdmin({ empresaId: getEmpresaId(user) })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 })
  }
}
