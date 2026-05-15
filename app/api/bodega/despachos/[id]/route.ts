import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ROLES = ROLES_ADMIN_BODEGA

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

async function subirR2(base64: string, key: string, contentType: string): Promise<string> {
  const data = base64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(data, 'base64')
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return key
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const empleadoId = user.role !== 'empresa' ? user.id : null
  const { id } = await params

  const orden = await (prisma as any).ordenDespacho.findFirst({ where: { id, empresaId } })
  const empresa = await (prisma as any).empresa.findFirst({ where: { id: empresaId }, select: { nombre: true } })
  if (!orden) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await req.json()
  const { estado, fotoAlistamiento, repartidorId, guiaTransporte, transportadora, firmaBase64 } = body

  const update: Record<string, unknown> = {}

  // Foto alistamiento
  if (fotoAlistamiento && typeof fotoAlistamiento === 'string' && fotoAlistamiento.startsWith('data:')) {
    const idx = ((orden.fotosAlistamiento as string[]) || []).length
    const key = `alistamiento/${id}_${idx}.jpg`
    await subirR2(fotoAlistamiento, key, 'image/jpeg')
    const fotos = [...((orden.fotosAlistamiento as string[]) || []), key]
    update.fotosAlistamiento = fotos
    update.fotoAlistamiento = key
  }

  // Estado
  if (estado) {
    update.estado = estado
    if (estado === 'alistado' && !((orden.fotosAlistamiento as string[]) || []).length && !fotoAlistamiento)
      return NextResponse.json({ error: 'Se requiere al menos una foto para alistar' }, { status: 422 })
    if (estado === 'alistado') {
      update.alistadoEl = new Date()
      if (empleadoId) update.alistadoPorId = empleadoId
    }
    if (estado === 'entregado') {
      update.entregadoEl = new Date()
    }
  }

  // Firma entrega personal desde bodega
  if (firmaBase64 && typeof firmaBase64 === 'string' && firmaBase64.startsWith('data:')) {
    const firmaKey = `firmas/${id}.png`
    await subirR2(firmaBase64, firmaKey, 'image/png')
    update.firmaEntrega = firmaKey
    update.estado = 'entregado'
    update.entregadoEl = new Date()


  }

  if (repartidorId !== undefined) update.repartidorId = repartidorId || null
  if (guiaTransporte !== undefined) update.guiaTransporte = guiaTransporte
  if (transportadora !== undefined) update.transportadora = transportadora

  // Todo lo de DB en una sola transacción — o todo o nada
  const updated = await prisma.$transaction(async (tx: any) => {
    const ordenActualizada = await tx.ordenDespacho.update({
      where: { id },
      data: update,
      include: {
        alistadoPor: { select: { id: true, nombre: true } },
        repartidor: { select: { id: true, nombre: true } },
      },
    })

    // Firma entrega → crear Visita dentro de la misma transacción
    if (firmaBase64 && empleadoId) {
      const cliente = await tx.cliente.findFirst({
        where: { nit: orden.clienteNit, empresaId }
      })
      if (cliente) {
        await tx.visita.create({
          data: {
            clienteId: cliente.id,
            empleadoId,
            empresaId,
            estado: 'ejecutado',
            fechaBogota: new Date().toISOString().split('T')[0],
            firma: update.firmaEntrega as string,
            ordenDespachoId: id,
            notas: `Entrega personal bodega #${orden.numeroFactura || orden.numeroOrden}`,
          }
        })
      }
    }

    // Asignar a ruta del repartidor — crear si no existe (lazy creation)
    if (estado === 'en_entrega' && repartidorId && orden.clienteNit) {
      const cliente = await tx.cliente.findFirst({
        where: { nit: orden.clienteNit, empresaId },
      })
      if (cliente) {
        // Buscar ruta activa del día
        let rutaEmpleado = await tx.rutaEmpleado.findFirst({
          where: { empleadoId: repartidorId, ruta: { cerrada: false } },
          select: { rutaId: true }
        })

        // Si no existe, crear ruta del día para el repartidor
        if (!rutaEmpleado) {
          const repartidor = await tx.empleado.findUnique({
            where: { id: repartidorId }, select: { nombre: true }
          })
          const hoy = new Date()
          const dd = String(hoy.getDate()).padStart(2,'0')
          const mm = String(hoy.getMonth()+1).padStart(2,'0')
          const yyyy = hoy.getFullYear()
          const rutaNueva = await tx.ruta.create({
            data: {
              nombre: `${repartidor?.nombre || 'Repartidor'}-${dd}-${mm}-${yyyy}`,
              fecha: new Date(new Date().toISOString().split('T')[0] + 'T05:00:00.000Z'),
              empresaId,
              empleados: { create: [{ empleadoId: repartidorId }] }
            }
          })
          rutaEmpleado = { rutaId: rutaNueva.id }
        }

        // Evitar duplicar si ya está en la ruta
        const yaEnRuta = await tx.rutaCliente.findFirst({
          where: { rutaId: rutaEmpleado.rutaId, clienteId: cliente.id }
        })
        if (!yaEnRuta) {
          await tx.rutaCliente.create({
            data: {
              rutaId: rutaEmpleado.rutaId,
              clienteId: cliente.id,
              orden: 999,
              notas: `Bodega/${empresa?.nombre || 'Bodega'} #${orden.numeroFactura || orden.numeroOrden}`,
            },
          })
        }
      }
    }

    return ordenActualizada
  })

  return NextResponse.json({ orden: updated })
}
