import { NextRequest, NextResponse } from 'next/server'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'

// GET público — biolink por slug de empresa (nombre normalizado)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const configs = await prisma.$queryRaw<any[]>`
    SELECT mc.*, e.nombre AS empresa_nombre
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig" mc
    JOIN ${Prisma.raw(DB_SCHEMA)}."Empresa" e ON e.id = mc."empresaId"
    WHERE LOWER(REGEXP_REPLACE(e.nombre, '[^a-zA-Z0-9]', '', 'g')) = ${slug.toLowerCase()}
  `
  if (!configs.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const config = configs[0]

  const carpetasFav = await prisma.$queryRaw<any[]>`
    SELECT
      c.id, c.nombre,
      (SELECT url FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
       WHERE "carpetaId" = c.id AND tipo = 'imagen'
       ORDER BY orden ASC, "createdAt" ASC LIMIT 1) AS "primeraImagen"
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" c
    WHERE c."empresaId" = ${config.empresaId} AND c.favorita = true
    ORDER BY c."createdAt" ASC
    LIMIT 3
  `

  const todasCarpetas = await prisma.$queryRaw<any[]>`
    SELECT c.id, c.nombre
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" c
    WHERE c."empresaId" = ${config.empresaId}
    ORDER BY c.favorita DESC, c."createdAt" ASC
  `

  const carpetasConImagenes = await Promise.all(
    todasCarpetas.map(async (c) => {
      const imagenes = await prisma.$queryRaw<any[]>`
        SELECT id, nombre, url, orden
        FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
        WHERE "carpetaId" = ${c.id} AND tipo = 'imagen'
        ORDER BY orden ASC, "createdAt" ASC
      `
      return { ...c, imagenes }
    })
  )

  return NextResponse.json({
    config: {
      nombre: config.nombre,
      descripcion: config.descripcion,
      logoUrl: config.logoUrl,
      whatsapp: config.whatsapp,
      portafolioUrl: config.portafolioUrl,
      portafolioNombre: config.portafolioNombre,
      tema: config.tema ?? 'oceano',
    },
    carpetasFav: carpetasFav.filter(c => c.primeraImagen),
    todasCarpetas: carpetasConImagenes.filter(c => c.imagenes.length > 0),
  })
}
