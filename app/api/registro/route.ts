import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

function slugify(nombre: string) {
  return nombre.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
}

export async function POST(req: NextRequest) {
  const { nombre, password, plan } = await req.json()
  if (!nombre || !password) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const slug = slugify(nombre)
  const email = `admin@${slug}`

  // Verificar que no existe
  const existe = await prisma.empresa.findUnique({ where: { email } })
  if (existe) {
    return NextResponse.json({ error: 'Ya existe una empresa con ese nombre' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)
  const empresa = await prisma.empresa.create({
    data: {
      nombre,
      email,
      password: hash,
      plan: plan || 'basico',
    }
  })

  return NextResponse.json({ ok: true, email, empresa: empresa.nombre })
}
