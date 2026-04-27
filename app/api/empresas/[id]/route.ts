import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  if (body.accion === 'reset_password') {
    if (!body.password || body.password.length < 6)
      return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })
    const hash = await bcrypt.hash(body.password, 10)
    await prisma.empresa.update({ where: { id }, data: { password: hash } })
    return NextResponse.json({ ok: true })
  }

  if (typeof body.activo === 'boolean') {
    const empresa = await prisma.empresa.update({ where: { id }, data: { activo: body.activo } })
    return NextResponse.json({ ok: true, empresa })
  }

  const { maxSupervisores, maxVendedores, maxEntregas, maxImpulsadoras } = body
  const empresa = await prisma.empresa.update({
    where: { id },
    data: { maxSupervisores, maxVendedores, maxEntregas, maxImpulsadoras }
  })
  return NextResponse.json({ ok: true, empresa })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params

  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM gestor."Visita"
      WHERE "empleadoId" IN (SELECT id FROM gestor."Empleado" WHERE "empresaId" = ${id})
         OR "clienteId"  IN (SELECT id FROM gestor."Cliente"  WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."Turno"
      WHERE "empleadoId" IN (SELECT id FROM gestor."Empleado" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."RutaEmpleado"
      WHERE "rutaId" IN (SELECT id FROM gestor."Ruta" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."RutaCliente"
      WHERE "rutaId" IN (SELECT id FROM gestor."Ruta" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."RutaFijaEmpleado"
      WHERE "rutaFijaId" IN (SELECT id FROM gestor."RutaFija" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."RutaFijaCliente"
      WHERE "rutaFijaId" IN (SELECT id FROM gestor."RutaFija" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM gestor."Ruta"     WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM gestor."RutaFija" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM gestor."Empleado" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM gestor."Cliente"  WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM gestor."AuditLog" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM gestor."Empresa"  WHERE id = ${id}`,
  ])

  return NextResponse.json({ ok: true })
}
