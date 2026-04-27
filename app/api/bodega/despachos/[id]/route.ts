import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ROLES = ['empresa', 'supervisor', 'bodega']

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

async function subirFotoAlistamiento(base64: string, ordenId: string): Promise<string> {
  const data = base64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(data, 'base64')
  const key = `alistamiento/${ordenId}.jpg`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
  }))
  return key
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const empleadoId = user.role !== 'empresa' ? user.id : null
  const { id } = await params

  const orden = await (prisma as any).ordenDespacho.findFirst({ where: { id, empresaId } })
  const empresa = await (prisma as any).empresa.findFirst({ where: { id: empresaId }, select: { nombre: true } })
  if (!orden) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await req.json()
  const { estado, fotoAlistamiento, repartidorId, guiaTransporte, transportadora } = body

  const update: Record<string, unknown> = {}

  if (fotoAlistamiento && typeof fotoAlistamiento === 'string' && fotoAlistamiento.startsWith('data:')) {
    const idx = ((orden.fotosAlistamiento as string[]) || []).length
    const key = `alistamiento/${id}_${idx}.jpg`
    const data = fotoAlistamiento.replace(/^data:[^;]+;base64,/, '')
    await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: Buffer.from(data, 'base64'), ContentType: 'image/jpeg' }))
    const fotos = [...((orden.fotosAlistamiento as string[]) || []), key]
    update.fotosAlistamiento = fotos
    update.fotoAlistamiento = key // legacy
  }
  if (estado) {
    update.estado = estado
    if (estado === 'alistado' && !((orden.fotosAlistamiento as string[]) || []).length && !fotoAlistamiento) return NextResponse.json({ error: 'Se requiere al menos una foto para alistar' }, { status: 422 })
    if (estado === 'alistado') {
      update.alistadoEl = new Date()
      if (empleadoId) update.alistadoPorId = empleadoId
    }
    if (estado === 'entregado') {
      update.entregadoEl = new Date()
    }
  }

  if (repartidorId !== undefined) update.repartidorId = repartidorId || null
  if (guiaTransporte !== undefined) update.guiaTransporte = guiaTransporte
  if (transportadora !== undefined) update.transportadora = transportadora

  const updated = await (prisma as any).ordenDespacho.update({
    where: { id },
    data: update,
    include: {
      alistadoPor: { select: { id: true, nombre: true } },
      repartidor: { select: { id: true, nombre: true } },
    },
  })

  // Si se asigna repartidor → intentar agregar a su ruta activa
  if (estado === 'en_entrega' && repartidorId) {
    try {
      const rutaEmpleado = await prisma.rutaEmpleado.findFirst({
        where: { empleadoId: repartidorId, ruta: { cerrada: false } },
        include: { ruta: true },
      })
      if (rutaEmpleado && orden.clienteNit) {
        const cliente = await (prisma as any).cliente.findFirst({
          where: { nit: orden.clienteNit, empresaId },
        })
        if (cliente) {
          await (prisma as any).rutaCliente.create({
            data: {
              rutaId: rutaEmpleado.rutaId,
              clienteId: cliente.id,
              orden: 999,
              notas: `Bodega/${empresa?.nombre || 'Bodega'} #${orden.numeroOrden}`,
            },
          })
        }
      }
    } catch {
      // No bloquear el despacho si falla la asignación de ruta
    }
  }

  return NextResponse.json({ orden: updated })
}
