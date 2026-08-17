import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

// POST — llamado por Master webhook tras pago aprobado de cliente nuevo (origenPublico)
export async function POST(req: NextRequest) {
  const secret = process.env.MASTER_API_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { nombre, telefono, planDias, pagoId } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  // Generar email único a partir del nombre + random
  const slug = nombre.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
  const suffix = randomBytes(3).toString('hex')
  const email = `${slug}${suffix}@gestor.tuagentx.com`

  // Generar password legible
  const password = randomBytes(4).toString('hex').toUpperCase()
  const hash = await bcrypt.hash(password, 10)

  // planFin = hoy + planDias
  const dias = planDias ?? 30
  // planFin = 1er día del mes siguiente al pago (UTC) — billing mensual
  const ahora = new Date()
  const planFin = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1))

  // Idempotencia por pagoId — si ya se procesó este pago, retornar email sin recrear
  if (pagoId) {
    const existente = await prisma.empresa.findFirst({
      where: { nombre, createdAt: { gte: new Date(Date.now() - 86400000) } },
      select: { id: true, email: true },
    })
    if (existente) {
      console.log(`[onboarding] Idempotencia pagoId ${pagoId}: empresa ${existente.id} ya existe`)
      return NextResponse.json({ ok: true, idempotente: true, data: { email: existente.email, password: null } })
    }
  }

  // Crear empresa
  const empresa = await prisma.empresa.create({
    data: {
      nombre,
      email,
      password: hash,
      telefono: telefono ?? null,
      planFin,
      activo: true,
      plan: 'basico',
      maxVendedores: 1,
      maxSupervisores: 1,
    },
  })

  console.log(`[onboarding] Empresa creada: ${empresa.id} (${nombre}) email: ${email}`)

  return NextResponse.json({
    ok: true,
    data: { empresaId: empresa.id, email, password },
  })
}
