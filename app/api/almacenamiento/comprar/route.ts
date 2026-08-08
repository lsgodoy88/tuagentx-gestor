import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'

const MASTER_URL = process.env.MASTER_URL ?? 'https://master.tuagentx.com'
const MASTER_SECRET = process.env.MASTER_API_SECRET ?? ''

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)

  const { monto } = await req.json()
  if (!monto) return NextResponse.json({ error: 'Falta monto' }, { status: 400 })

  const res = await fetch(`${MASTER_URL}/api/pagos/crear-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MASTER_SECRET}`,
    },
    body: JSON.stringify({
      empresaId,
      empresaTipo: 'GESTOR',
      monto,
      planDias: 0,
      esUpgrade: true,
      rolUpgrade: 'storage_gb',
      cantidadUpgrade: 1,
    }),
  })

  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data.error ?? 'Error creando link' }, { status: 500 })
  return NextResponse.json({ linkPago: data.linkPago })
}
