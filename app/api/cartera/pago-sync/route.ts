import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { procesarPagoSync } from '@/lib/cartera/pago-sync'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const body = await req.json()
  const { response, status } = await procesarPagoSync({
    empresaId: getEmpresaId(user),
    empleadoId: user.role === 'empresa' ? null : user.id,
    idempotencyKey: req.headers.get('X-Idempotency-Key') || null,
    body: { ...body, userRole: user.role, userApiId: (user as any).apiId || null },
  })

  return NextResponse.json(response, { status: status ?? 200 })
}
