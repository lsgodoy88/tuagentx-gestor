import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { eliminarMediaArchivo } from '@/lib/media/upload'

// DELETE — eliminar archivo individual (solo empresa)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const empresaId = (session.user as any).empresaId

  const archivo = await prisma.$queryRaw<{ id: string; key: string }[]>`
    SELECT a.id, a.key
    FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo" a
    JOIN ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" c ON c.id = a."carpetaId"
    WHERE a.id = ${id} AND c."empresaId" = ${empresaId}
  `
  if (!archivo.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await eliminarMediaArchivo(archivo[0].key)
  await prisma.$executeRaw`
    DELETE FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo" WHERE id = ${id}
  `

  return NextResponse.json({ ok: true })
}
