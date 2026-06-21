import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
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
  // FIX 2026-06-20: faltaba verificar rol — cualquier sesión autenticada podía
  // borrar cualquier empresa completa (en cascada: visitas, rutas, empleados,
  // clientes). Restringido a superadmin.
  const user = session.user as any
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const { id } = await params

  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Visita"
      WHERE "empleadoId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."Empleado" WHERE "empresaId" = ${id})
         OR "clienteId"  IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."Cliente"  WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Turno"
      WHERE "empleadoId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."Empleado" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."RutaEmpleado"
      WHERE "rutaId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."Ruta" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."RutaCliente"
      WHERE "rutaId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."Ruta" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."RutaFijaEmpleado"
      WHERE "rutaFijaId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."RutaFija" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."RutaFijaCliente"
      WHERE "rutaFijaId" IN (SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."RutaFija" WHERE "empresaId" = ${id})`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Ruta"     WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."RutaFija" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Empleado" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Cliente"  WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."AuditLog" WHERE "empresaId" = ${id}`,
    prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."Empresa"  WHERE id = ${id}`,
  ])

  return NextResponse.json({ ok: true })
}
