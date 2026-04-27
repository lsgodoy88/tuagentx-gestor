import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

function slugify(nombre: string) {
  return nombre.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const empresas = await prisma.empresa.findMany({
    where: { plan: { not: 'superadmin' } },
    include: { _count: { select: { empleados: true, clientes: true } } },
    orderBy: { createdAt: 'desc' }
  })
  return NextResponse.json(empresas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'superadmin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, password, plan, maxSupervisores, maxVendedores, maxEntregas, maxImpulsadoras } = await req.json()
  if (!nombre || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const slug = slugify(nombre)
  const email = `admin@${slug}`

  const existe = await prisma.empresa.findUnique({ where: { email } })
  if (existe) return NextResponse.json({ error: 'Ya existe una empresa con ese nombre' }, { status: 400 })

  const hash = await bcrypt.hash(password, 10)
  const empresa = await prisma.empresa.create({
    data: { nombre, email, password: hash, plan: plan || 'basico', maxSupervisores: maxSupervisores || 1, maxVendedores: maxVendedores || 1, maxEntregas: maxEntregas || 0, maxImpulsadoras: maxImpulsadoras || 0 }
  })

  return NextResponse.json({ ok: true, email, empresa: empresa.nombre })
}
