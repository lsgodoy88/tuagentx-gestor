import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { Prisma } from '@/app/generated/prisma'

const GB = 1024 * 1024 * 1024
const ALERTA_BYTES = 200 * 1024 * 1024 // alerta cuando faltan 200 MB

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const empresaId = getEmpresaId(user)

  // Límite dinámico por empresa
  const emp = await prisma.$queryRaw<[{ limite_storage_gb: number }]>`
    SELECT limite_storage_gb FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaId} LIMIT 1`
  const limiteGb = Number(emp[0]?.limite_storage_gb ?? 1)
  const limiteBytes = limiteGb * GB

  const rows = await prisma.$queryRaw<{ tipo: string; archivos: bigint; bytes: bigint }[]>`
    SELECT tipo, COUNT(*)::bigint AS archivos, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
    FROM ${Prisma.raw(DB_SCHEMA)}."StorageLog"
    WHERE empresa_id = ${empresaId}
    GROUP BY tipo
    ORDER BY bytes DESC`

  const tipos = rows.map(r => ({
    tipo: r.tipo,
    archivos: Number(r.archivos),
    bytes: Number(r.bytes),
    mb: Math.round(Number(r.bytes) / 1024 / 1024 * 100) / 100,
  }))

  const totalBytes = tipos.reduce((acc, t) => acc + t.bytes, 0)
  const bytesRestantes = limiteBytes - totalBytes
  const alerta = bytesRestantes <= ALERTA_BYTES && bytesRestantes >= 0

  // Precio por GB desde PrecioRol
  const precioRow = await prisma.$queryRaw<[{ precio: number }]>`
    SELECT precio FROM ${Prisma.raw(DB_SCHEMA)}."PrecioRol" WHERE rol = 'storage_gb' LIMIT 1`
  const precioGb = Number(precioRow[0]?.precio ?? 20000)

  return NextResponse.json({
    tipos,
    totalBytes,
    totalMb: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
    limiteBytes,
    limiteGb,
    limiteMb: limiteBytes / 1024 / 1024,
    porcentaje: Math.round(totalBytes / limiteBytes * 10000) / 100,
    bytesRestantes,
    alerta,
    precioGb,
  })
}
