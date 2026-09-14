import { NextRequest, NextResponse } from 'next/server'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'

// GET público — sin sesión, busca solo por token (único global)
// El slug en la URL es decorativo/SEO — no se valida para no romper links con caracteres especiales
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const carpeta = await prisma.$queryRaw<{
    id: string; nombre: string; descripcion: string | null;
    empresa_nombre: string
  }[]>`
    SELECT c.id, c.nombre, c.descripcion, e.nombre AS empresa_nombre
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" c
    JOIN ${Prisma.raw(DB_SCHEMA)}."Empresa" e ON e.id = c."empresaId"
    WHERE c."publicToken" = ${token}
  `

  if (!carpeta.length) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const archivos = await prisma.$queryRaw<{
    id: string; nombre: string; url: string; tipo: string; orden: number
  }[]>`
    SELECT id, nombre, url, tipo, orden
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
    WHERE "carpetaId" = ${carpeta[0].id}
    ORDER BY orden ASC, "createdAt" ASC
  `

  return NextResponse.json({ carpeta: carpeta[0], archivos })
}
