import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { subirMediaArchivo, eliminarMediaArchivo } from '@/lib/media/upload'

// GET — obtener config de la empresa
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = (session.user as any).empresaId

  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
    WHERE "empresaId" = ${empresaId}
  `

  // Devolver null si no existe — la creación es explícita via PATCH (Activar TaX-Link)
  if (!rows.length) return NextResponse.json(null)

  return NextResponse.json(rows[0])
}

// PATCH — actualizar campos de texto (nombre, descripcion, whatsapp)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const { nombre, descripcion, whatsapp, tema } = await req.json()

  // Upsert — crea si no existe (primer uso: Activar TaX-Link), actualiza si ya existe
  await prisma.$executeRaw`
    INSERT INTO ${Prisma.raw(DB_SCHEMA)}."MediaConfig" (id, "empresaId", nombre, descripcion, whatsapp, tema, "updatedAt")
    VALUES (gen_random_uuid()::text, ${empresaId}, ${nombre ?? null}, ${descripcion ?? null}, ${whatsapp ?? null}, ${tema ?? 'oceano'}, now())
    ON CONFLICT ("empresaId") DO UPDATE SET
      nombre      = COALESCE(EXCLUDED.nombre, ${Prisma.raw(DB_SCHEMA)}."MediaConfig".nombre),
      descripcion = COALESCE(EXCLUDED.descripcion, ${Prisma.raw(DB_SCHEMA)}."MediaConfig".descripcion),
      whatsapp    = COALESCE(EXCLUDED.whatsapp, ${Prisma.raw(DB_SCHEMA)}."MediaConfig".whatsapp),
      tema        = COALESCE(EXCLUDED.tema, ${Prisma.raw(DB_SCHEMA)}."MediaConfig".tema),
      "updatedAt" = now()
  `

  return NextResponse.json({ ok: true })
}

// POST — subir logo o portafolio (multipart via base64)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const { tipo, nombre, base64 } = await req.json() // tipo: 'logo' | 'portafolio'

  if (!['logo', 'portafolio'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  // Obtener config actual para borrar key anterior
  const rows = await prisma.$queryRaw<any[]>`
    SELECT "logoKey", "portafolioKey" FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
    WHERE "empresaId" = ${empresaId}
  `
  const config = rows[0]

  // Borrar anterior si existe
  const keyAnterior = tipo === 'logo' ? config?.logoKey : config?.portafolioKey
  if (keyAnterior) await eliminarMediaArchivo(keyAnterior).catch(() => {})

  // Subir nuevo — logo como imagen, portafolio como pdf
  const { key, url, tamano_byte } = await subirMediaArchivo(
    base64, empresaId, `_config_${tipo}`, nombre
  )

  // UPDATE en BD — si falla, revertir R2
  try {
    if (tipo === 'logo') {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
        SET "logoKey" = ${key}, "logoUrl" = ${url}, "updatedAt" = now()
        WHERE "empresaId" = ${empresaId}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
        SET "portafolioKey" = ${key}, "portafolioUrl" = ${url},
            "portafolioNombre" = ${nombre}, "updatedAt" = now()
        WHERE "empresaId" = ${empresaId}
      `
    }
  } catch (dbErr) {
    await eliminarMediaArchivo(key).catch(() => {})
    console.error('[media/config] BD update falló, R2 revertido:', dbErr)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  return NextResponse.json({ key, url, tamano_byte })
}
