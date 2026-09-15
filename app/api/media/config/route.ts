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

  // Verificar si ya existía antes del upsert
  const existe = await prisma.$queryRaw<any[]>`
    SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig" WHERE "empresaId" = ${empresaId} LIMIT 1
  `
  const esPrimera = existe.length === 0

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

  // Primera activación — crear carpetas favoritas por defecto
  if (esPrimera) {
    for (const nombre of ['Más Vendidos🔥', 'Productos💚']) {
      await prisma.$executeRaw`
        INSERT INTO ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" ("empresaId", nombre, favorita)
        VALUES (${empresaId}, ${nombre}, true)
      `
    }
  }

  return NextResponse.json({ ok: true })
}

// POST — dos modos:
// 1. Logo: JSON { tipo:'logo', nombre, base64 }
// 2. Portafolio: FormData { tipo:'portafolio', nombre, file } — sube desde servidor, sin CORS
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const contentType = req.headers.get('content-type') || ''

  // Portafolio via FormData — servidor sube a R2 (sin CORS)
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const tipo = formData.get('tipo') as string
    const nombre = (formData.get('nombre') as string) || 'portafolio.pdf'
    const file = formData.get('file') as File | null

    if (tipo !== 'portafolio' || !file) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'PDF máximo 10MB' }, { status: 400 })
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Solo PDF' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // Borrar portafolio anterior
    const rows = await prisma.$queryRaw<any[]>`
      SELECT "portafolioKey" FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig" WHERE "empresaId" = ${empresaId}
    `
    if (rows[0]?.portafolioKey) await eliminarMediaArchivo(rows[0].portafolioKey).catch(() => {})

    let key: string, url: string
    try {
      const res = await subirMediaArchivo(buffer, empresaId, '_config_portafolio', nombre)
      key = res.key; url = res.url
    } catch (uploadErr: any) {
      console.error('[media/config POST] subirMediaArchivo error:', uploadErr?.message || uploadErr)
      return NextResponse.json({ error: 'Error al subir archivo: ' + (uploadErr?.message || 'desconocido') }, { status: 500 })
    }
    try {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
        SET "portafolioKey" = ${key}, "portafolioUrl" = ${url},
            "portafolioNombre" = ${nombre}, "updatedAt" = now()
        WHERE "empresaId" = ${empresaId}
      `
      return NextResponse.json({ ok: true, key, url })
    } catch (dbErr: any) {
      console.error('[media/config POST] db error:', dbErr?.message || dbErr)
      await eliminarMediaArchivo(key).catch(() => {})
      return NextResponse.json({ error: 'Error al guardar en BD: ' + (dbErr?.message || 'desconocido') }, { status: 500 })
    }
  }

  // Logo — JSON con base64 comprimido en cliente
  const body = await req.json()
  const { tipo, nombre, base64 } = body

  if (!['logo', 'portafolio'].includes(tipo)) return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })

  const rows = await prisma.$queryRaw<any[]>`
    SELECT "logoKey" FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig" WHERE "empresaId" = ${empresaId}
  `
  if (rows[0]?.logoKey) await eliminarMediaArchivo(rows[0].logoKey).catch(() => {})

  const { key, url, tamano_byte } = await subirMediaArchivo(base64, empresaId, `_config_${tipo}`, nombre)
  try {
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaConfig"
      SET "logoKey" = ${key}, "logoUrl" = ${url}, "updatedAt" = now()
      WHERE "empresaId" = ${empresaId}
    `
    return NextResponse.json({ key, url, tamano_byte })
  } catch {
    await eliminarMediaArchivo(key).catch(() => {})
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }
}

