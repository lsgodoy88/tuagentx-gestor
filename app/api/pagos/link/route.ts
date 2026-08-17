import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { monto, roles } = await req.json()
  if (!monto) return NextResponse.json({ error: 'monto requerido' }, { status: 400 })

  const empresaId = getEmpresaId(user)
  const secret = process.env.MASTER_API_SECRET

  const res = await fetch('https://master.tuagentx.com/api/pagos/crear-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({
      empresaId,
      empresaTipo: 'GESTOR',
      monto,
      esUpgrade: true,
      // roles = { vendedor: 1, supervisor: 0, ... } → serializado para webhook
      rolUpgrade: roles ? JSON.stringify(roles) : undefined,
    }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.ok ? 200 : res.status })
}
