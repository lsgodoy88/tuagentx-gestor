/**
 * POST /api/sync/ventas-historico
 * Endpoint manual para admin/vendedor — usa la misma lib que el auto-sync.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId, ROLES_ADMIN, ROLES_VENDEDOR_RUTAS } from '@/lib/auth-helpers'
import { syncVentasHistorico } from '@/lib/sync/ventas-historico'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (![...ROLES_ADMIN, ...ROLES_VENDEDOR_RUTAS].includes(user.role)) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const empresaId = getEmpresaId(user)
  const { clienteIds } = await req.json() as { clienteIds: string[] }

  if (!clienteIds?.length) return NextResponse.json({ error: 'clienteIds requerido' }, { status: 400 })

  const result = await syncVentasHistorico({ clienteIds, empresaId })
  return NextResponse.json({ ok: true, ...result })
}
