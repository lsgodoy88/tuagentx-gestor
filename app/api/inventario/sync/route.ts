import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'
import { syncProductosEmpresa } from '@/lib/jobs/sync-delta'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const intg = await (prisma as any).integracion.findFirst({
      where: { empresaId, tipo: 'uptres', activa: true },
    })
    if (!intg) return NextResponse.json({ error: 'Sin integración activa' }, { status: 404 })

    const config = intg.config as any
    const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
    const result = await syncProductosEmpresa(empresaId, intg.id, config.apiKey, apiSecret)

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[api/inventario/sync] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
