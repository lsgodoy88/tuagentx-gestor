import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

function slugify(n: string) {
  return n.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 30)
}

function generarPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

function generarId() {
  return randomBytes(12).toString('base64url').slice(0, 20)
}

const EVO_URL    = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVO_APIKEY = process.env.EVOLUTION_API_KEY!

export async function POST(req: NextRequest) {
  const isInternal = req.headers.get('x-internal') === 'master'
    && req.headers.get('Authorization') === `Bearer ${process.env.MASTER_API_SECRET}`

  if (!isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notifInstance = req.headers.get('x-notif-instance') || ''
  const { nombre, telefono, planDias } = await req.json()
  if (!nombre || !telefono) {
    return NextResponse.json({ error: 'Faltan campos: nombre, telefono' }, { status: 400 })
  }

  const slug = slugify(nombre)
  const email = `admin@${slug}`
  const dias = Number(planDias) || 30

  // Verificar si ya existe
  const existe = await prisma.empresa.findFirst({ where: { nombre } })
  if (existe) {
    return NextResponse.json({ ok: false, error: `Ya existe empresa: ${nombre}` }, { status: 409 })
  }

  const password = generarPassword()
  const hash = await bcrypt.hash(password, 10)
  const id = generarId()
  const planFinDate = new Date(Date.now() + dias * 86400000)

  await prisma.$executeRaw`
    INSERT INTO gestor."Empresa"
      (id, nombre, email, password, plan, activo, "maxSupervisores", "maxVendedores", "maxEntregas", "maxImpulsadoras", "createdAt", "planFin", telefono)
    VALUES
      (${id}, ${nombre}, ${email}, ${hash}, 'basico', true, 1, 1, 0, 0, NOW(), ${planFinDate}, ${telefono})
  `

  // Enviar WA de bienvenida con credenciales
  if (notifInstance && telefono) {
    const mensaje = `🎉 ¡Bienvenido a TuAgentX, ${nombre}!\n\nTu cuenta está lista:\n🔗 crm.tuagentx.com\n📧 ${email}\n🔑 ${password}\n\nPara comenzar, escribe *Soy nuevo* y te guiaremos en los primeros pasos. 🚀`
    fetch(`${EVO_URL}/message/sendText/${notifInstance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_APIKEY },
      body: JSON.stringify({ number: telefono, text: mensaje }),
    }).catch(err => console.error('[onboarding gestor] WA send error:', err))
  }

  console.log(`[onboarding gestor] Empresa creada: ${email}`)
  return NextResponse.json({ ok: true, data: { email, password } })
}
