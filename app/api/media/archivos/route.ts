import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { subirMediaArchivo, eliminarMediaArchivo } from '@/lib/media/upload'

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB base64 input máximo

// GET — archivos de una carpeta
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const carpetaId = req.nextUrl.searchParams.get('carpetaId')
  if (!carpetaId) return NextResponse.json({ error: 'carpetaId requerido' }, { status: 400 })

  // Verificar carpeta pertenece a empresa
  const carpeta = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
    WHERE id = ${carpetaId} AND "empresaId" = ${(session.user as any).empresaId}
  `
  if (!carpeta.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const archivos = await prisma.$queryRaw<{
    id: string; nombre: string; url: string; tipo: string; orden: number; tamano_byte: number; createdAt: Date
  }[]>`
    SELECT id, nombre, url, tipo, orden, tamano_byte, "createdAt"
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
    WHERE "carpetaId" = ${carpetaId}
    ORDER BY orden ASC, "createdAt" ASC
  `
  return NextResponse.json(archivos)
}

// POST — subir archivo a carpeta (solo empresa)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const body = await req.json()
  const { carpetaId, nombre, base64 } = body

  if (!carpetaId || !nombre || !base64) {
    return NextResponse.json({ error: 'carpetaId, nombre y base64 son requeridos' }, { status: 400 })
  }

  // Validar tamaño aproximado
  const sizeEstimado = Math.ceil((base64.length * 3) / 4)
  if (sizeEstimado > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Archivo demasiado grande. Máximo 10MB.' }, { status: 413 })
  }

  const empresaId = (session.user as any).empresaId

  // Verificar carpeta pertenece a empresa
  const carpeta = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
    WHERE id = ${carpetaId} AND "empresaId" = ${empresaId}
  `
  if (!carpeta.length) return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 })

  // Subir a R2
  const { key, url, tipo, tamano_byte } = await subirMediaArchivo(base64, empresaId, carpetaId, nombre)

  // Orden = max actual + 1
  const maxOrden = await prisma.$queryRaw<{ max: number }[]>`
    SELECT COALESCE(MAX(orden), -1) AS max
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
    WHERE "carpetaId" = ${carpetaId}
  `
  const orden = (maxOrden[0]?.max ?? -1) + 1

  // INSERT en BD — si falla, revertir R2 para evitar huérfanos
  let archivo: { id: string; nombre: string; url: string; tipo: string; orden: number; tamano_byte: number }[]
  try {
    archivo = await prisma.$queryRaw`
      INSERT INTO ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
        ("carpetaId", "empresaId", nombre, key, url, tipo, orden, tamano_byte)
      VALUES (${carpetaId}, ${empresaId}, ${nombre}, ${key}, ${url}, ${tipo}, ${orden}, ${tamano_byte})
      RETURNING id, nombre, url, tipo, orden, tamano_byte
    `
  } catch (dbErr) {
    // Revertir: eliminar archivo de R2 para no dejar huérfano
    await eliminarMediaArchivo(key).catch(() => {})
    console.error('[media/archivos] BD insert falló, R2 revertido:', dbErr)
    return NextResponse.json({ error: 'Error al guardar archivo' }, { status: 500 })
  }

  return NextResponse.json(archivo[0], { status: 201 })
}
