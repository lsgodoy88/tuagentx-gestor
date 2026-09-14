import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = (session.user as any).empresaId
  const rows = await prisma.$queryRaw<{
    id: string; nombre: string; favorita: boolean;
    publicToken: string; createdAt: Date; total: number; primeraImagen: string | null
  }[]>`
    SELECT
      c.id, c.nombre, c.favorita, c."publicToken", c."createdAt",
      COUNT(a.id)::int AS total,
      (SELECT url FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo"
       WHERE "carpetaId" = c.id AND tipo = 'imagen'
       ORDER BY orden ASC, "createdAt" ASC LIMIT 1) AS "primeraImagen"
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" c
    LEFT JOIN ${Prisma.raw(DB_SCHEMA)}."MediaArchivo" a ON a."carpetaId" = c.id
    WHERE c."empresaId" = ${empresaId}
    GROUP BY c.id
    ORDER BY c.favorita DESC, c."createdAt" DESC
  `
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { nombre } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  // Validar que TaX-Link esté activado (MediaConfig existe)
  const empresaId = (session.user as any).empresaId
  const cfg = await prisma.$queryRaw<any[]>`
    SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."MediaConfig" WHERE "empresaId" = ${empresaId} LIMIT 1
  `
  if (!cfg.length) return NextResponse.json({ error: 'Activa TaX-Link primero' }, { status: 403 })

  const carpeta = await prisma.$queryRaw<any[]>`
    INSERT INTO ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" ("empresaId", nombre)
    VALUES (${(session.user as any).empresaId}, ${nombre.trim()})
    RETURNING id, nombre, favorita, "publicToken", "createdAt"
  `
  return NextResponse.json(carpeta[0], { status: 201 })
}
