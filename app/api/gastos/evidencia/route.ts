import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, empleadoCampoScope } from '@/lib/auth-helpers'
import { archivoUrl } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { permitido, empleadoIdForzado } = empleadoCampoScope(user)
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })

  // Verifica que el gasto exista, pertenezca a la empresa, y si es rol de
  // campo, que sea SU PROPIO gasto — evita ver evidencia de otro empleado
  // adivinando o probando keys ajenas.
  const gasto = await (prisma as any).gasto.findFirst({
    where: { evidenciaKey: key, empresaId, ...(empleadoIdForzado ? { empleadoId: empleadoIdForzado } : {}) },
  })
  if (!gasto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const url = await archivoUrl(key)
  return NextResponse.json({ url })
}
