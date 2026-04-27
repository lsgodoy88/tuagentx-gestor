import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = (session.user as any).id
  const listas = await prisma.listaClientes.findMany({
    where: { empresaId },
    include: { vendedores: { include: { empleado: { select: { id: true, nombre: true } } } }, _count: { select: { clientes: true } } },
    orderBy: { nombre: 'asc' }
  })
  return NextResponse.json(listas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = (session.user as any).id
  const { nombre } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  const lista = await prisma.listaClientes.create({ data: { id: crypto.randomUUID(), nombre, empresaId } })
  return NextResponse.json(lista)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, nombre, vendedorIds } = await req.json()

  const data: any = {}
  if (nombre) data.nombre = nombre
  if (vendedorIds !== undefined) {
    data.vendedores = {
      deleteMany: {},
      create: (vendedorIds as string[]).map((empleadoId: string) => ({ empleadoId }))
    }
  }

  const lista = await prisma.listaClientes.update({ where: { id }, data })
  return NextResponse.json(lista)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  await prisma.listaClientes.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
