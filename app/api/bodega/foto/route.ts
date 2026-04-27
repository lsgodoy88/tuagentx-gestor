import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'

const ROLES = ['empresa', 'supervisor', 'bodega']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { ordenId, fotoBase64 } = await req.json()
  if (!ordenId || !fotoBase64) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const orden = await (prisma as any).ordenDespacho.findFirst({ where: { id: ordenId, empresaId } })
  if (!orden) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const fotosActuales = (orden.fotosAlistamiento as string[]) || []
  const idx = fotosActuales.length
  const filename = `${ordenId}_${idx}.jpg`
  const urlPublica = `/fotos/alistamiento/${filename}`
  const rutaFisica = path.join(process.cwd(), 'public', 'fotos', 'alistamiento', filename)

  const data = fotoBase64.replace(/^data:[^;]+;base64,/, '')
  await writeFile(rutaFisica, Buffer.from(data, 'base64'))

  const fotos = [...fotosActuales, urlPublica]
  const updated = await (prisma as any).ordenDespacho.update({
    where: { id: ordenId },
    data: {
      fotosAlistamiento: fotos,
      fotoAlistamiento: urlPublica,
    },
    include: {
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor: { select: { id: true, nombre: true } },
    },
  })

  return NextResponse.json({ url: urlPublica, orden: updated })
}
