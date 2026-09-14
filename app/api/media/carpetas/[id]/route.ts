import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'
import { eliminarMediaArchivo } from '@/lib/media/upload'

// DELETE — eliminar carpeta + archivos R2 (solo empresa)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const empresaId = (session.user as any).empresaId

  const carpeta = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
    WHERE id = ${id} AND "empresaId" = ${empresaId}
  `
  if (!carpeta.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const archivos = await prisma.$queryRaw<{ key: string }[]>`
    SELECT key FROM ${Prisma.raw(DB_SCHEMA)}."MediaArchivo" WHERE "carpetaId" = ${id}
  `
  await Promise.allSettled(archivos.map(a => eliminarMediaArchivo(a.key)))
  await prisma.$executeRaw`DELETE FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta" WHERE id = ${id}`

  return NextResponse.json({ ok: true })
}

// PATCH — renombrar o toggle favorita
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { id } = await params
  const empresaId = (session.user as any).empresaId
  const body = await req.json()

  // Toggle favorita
  if ('favorita' in body) {
    const activar = body.favorita === true

    if (activar) {
      // Verificar límite 3
      const count = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
        WHERE "empresaId" = ${empresaId} AND favorita = true
      `
      if ((count[0]?.n ?? 0) >= 3) {
        return NextResponse.json({ error: 'Máximo 3 carpetas favoritas en el TaX-Link' }, { status: 400 })
      }
    }

    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
      SET favorita = ${activar}
      WHERE id = ${id} AND "empresaId" = ${empresaId}
    `
    return NextResponse.json({ ok: true })
  }

  // Renombrar
  const { nombre } = body
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  await prisma.$executeRaw`
    UPDATE ${Prisma.raw(DB_SCHEMA)}."MediaCarpeta"
    SET nombre = ${nombre.trim()}
    WHERE id = ${id} AND "empresaId" = ${empresaId}
  `
  return NextResponse.json({ ok: true })
}
