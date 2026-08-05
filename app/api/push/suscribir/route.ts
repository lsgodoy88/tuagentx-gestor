import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'

function parseUserAgent(ua: string): string {
  const s = ua.toLowerCase()
  const isAndroid = s.includes('android')
  const isIphone  = s.includes('iphone') || s.includes('ipad')
  const isChrome  = s.includes('chrome') && !s.includes('edg')
  const isSafari  = s.includes('safari') && !s.includes('chrome')
  const isFirefox = s.includes('firefox')
  const isEdge    = s.includes('edg/')
  const os      = isAndroid ? 'Android' : isIphone ? 'iPhone' : 'PC'
  const browser = isEdge ? 'Edge' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : isChrome ? 'Chrome' : 'Browser'
  return `${os}/${browser}`
}

function esMovil(ua: string) {
  return ua.startsWith('Android') || ua.startsWith('iPhone')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['vendedor', 'impulsadora', 'supervisor', 'entregas', 'bodega', 'empresa'].includes(user.role)) {
    return NextResponse.json({ ok: true })
  }
  const { endpoint, keys } = await req.json()
  const ua = parseUserAgent(req.headers.get('user-agent') || '')
  const categoria = esMovil(ua) ? 'movil' : 'pc'

  try {
    if (user.role === 'empresa') {
      const empresaId = user.id
      // Contar suscripciones de esta categoría
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, "createdAt" FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin"
        WHERE "empresaId" = ${empresaId}
          AND CASE WHEN user_agent LIKE 'PC/%' OR user_agent LIKE 'Browser/%' OR user_agent IS NULL THEN 'pc' ELSE 'movil' END = ${categoria}
          AND endpoint != ${endpoint}
        ORDER BY "createdAt" ASC`
      // Si ya hay 2, borrar el más antiguo
      if (existing.length >= 2) {
        await prisma.$executeRaw`
          DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin" WHERE id = ${existing[0].id}`
      }
      await prisma.$executeRaw`
        INSERT INTO ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin" (id, "empresaId", endpoint, p256dh, auth, user_agent, "createdAt")
        VALUES (gen_random_uuid()::text, ${empresaId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${ua}, NOW())
        ON CONFLICT (endpoint) DO UPDATE SET "empresaId" = EXCLUDED."empresaId", user_agent = ${ua}, "createdAt" = NOW()`
    } else {
      const empleadoId = user.id
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, "createdAt" FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion"
        WHERE "empleadoId" = ${empleadoId}
          AND CASE WHEN user_agent LIKE 'PC/%' OR user_agent LIKE 'Browser/%' OR user_agent IS NULL THEN 'pc' ELSE 'movil' END = ${categoria}
          AND endpoint != ${endpoint}
        ORDER BY "createdAt" ASC`
      if (existing.length >= 2) {
        await prisma.$executeRaw`
          DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" WHERE id = ${existing[0].id}`
      }
      await prisma.$executeRaw`
        INSERT INTO ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" (id, "empleadoId", endpoint, p256dh, auth, user_agent, "createdAt")
        VALUES (gen_random_uuid()::text, ${empleadoId}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, ${ua}, NOW())
        ON CONFLICT (endpoint) DO UPDATE SET "empleadoId" = EXCLUDED."empleadoId", user_agent = ${ua}, "createdAt" = NOW()`
    }
  } catch (e) { console.error('Push suscribir error:', e) }
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = user.id

  const empleados = await prisma.$queryRaw<any[]>`
    SELECT p.id, p."empleadoId", p.user_agent, p."createdAt", e.nombre, e.rol
    FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" p
    INNER JOIN ${Prisma.raw(DB_SCHEMA)}."Empleado" e ON e.id = p."empleadoId"
    WHERE e."empresaId" = ${empresaId}
    ORDER BY e.rol, e.nombre`

  const admin = await prisma.$queryRaw<any[]>`
    SELECT id, user_agent, "createdAt"
    FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin"
    WHERE "empresaId" = ${empresaId}`

  return NextResponse.json({ empleados, admin })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = user.id

  const { id, tipo } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  if (tipo === 'admin') {
    await prisma.$executeRaw`
      DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin"
      WHERE id = ${id} AND "empresaId" = ${empresaId}`
  } else {
    await prisma.$executeRaw`
      DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" p
      USING ${Prisma.raw(DB_SCHEMA)}."Empleado" e
      WHERE p.id = ${id} AND p."empleadoId" = e.id AND e."empresaId" = ${empresaId}`
  }
  return NextResponse.json({ ok: true })
}
