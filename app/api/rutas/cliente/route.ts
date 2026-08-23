import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role))
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json().catch(() => ({}))
  const { rutaClienteId } = body
  if (!rutaClienteId) return NextResponse.json({ error: 'Falta rutaClienteId' }, { status: 400 })

  const rc = await prisma.rutaCliente.findUnique({
    where: { id: rutaClienteId },
    include: { ruta: { select: { cerrada: true, empresaId: true } } }
  })
  if (!rc || rc.ruta.empresaId !== empresaId)
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (rc.ruta.cerrada)
    return NextResponse.json({ error: 'Ruta ya cerrada' }, { status: 400 })

  await prisma.rutaCliente.delete({ where: { id: rutaClienteId } })
  return NextResponse.json({ ok: true })
}
