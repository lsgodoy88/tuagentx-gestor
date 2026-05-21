import { NextRequest, NextResponse } from 'next/server'
import { enviarPushEmpleados } from '@/lib/push'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { subirR2, registrarDespachoLog, esDespachado } from '@/lib/bodega'

const ROLES = ROLES_ADMIN_BODEGA

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
    if (estado === 'alistado' && !((orden.fotosAlistamiento as string[]) || []).length && !fotoAlistamiento && !firmaBase64)
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

    // Firma entrega personal — solo guarda la firma en OrdenDespacho, sin Visita

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
          const hoy = new Date(Date.now() - 5*60*60*1000)
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

        // La clave de unicidad es la factura — mismo cliente puede tener N facturas distintas
        // o venir de Lumeli y de Leche el mismo día
        const notaOrden = `Bodega/${empresa?.nombre || 'Bodega'} #${orden.numeroFactura || orden.numeroOrden}`
        const yaEnRuta = await tx.rutaCliente.findFirst({
          where: { rutaId: rutaEmpleado.rutaId, notas: notaOrden }
        })
        if (!yaEnRuta) {
          await tx.rutaCliente.create({
            data: {
              rutaId: rutaEmpleado.rutaId,
              clienteId: cliente.id,
              orden: 999,
              notas: notaOrden,
            },
          })
        }
      }
    }

    return ordenActualizada
  })

  // Registrar en DespachoLog — fire and forget
  if (esDespachado(updated.estado)) {
    registrarDespachoLog({ empresaId, ...updated })
  }

  // Enviar push a repartidor si se asignó a su ruta
  let rutaAsignada = false
  let repartidorNombre: string | null = null
  if (estado === 'en_entrega' && repartidorId) {
    try {
      const rep = await prisma.empleado.findUnique({
        where: { id: repartidorId },
        select: { nombre: true }
      })
      repartidorNombre = rep?.nombre || null
      rutaAsignada = true
      // Push en background — no bloquear el response
      setImmediate(() => {
        const factura = updated.numeroFactura || updated.numeroOrden
        const cliente = updated.clienteNombre || 'Cliente'
        enviarPushEmpleados(
          [repartidorId],
          'Nueva entrega asignada',
          `${cliente} · Fac. ${factura}`,
          '/dashboard'
        ).catch(() => {})
      })
    } catch {}
  }

  return NextResponse.json({ orden: updated, rutaAsignada, repartidorNombre })
}
