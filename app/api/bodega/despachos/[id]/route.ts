import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { invalidatePattern } from '@/lib/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreateRutaHoy } from '@/lib/rutas/getOrCreateRutaHoy'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { subirR2, registrarDespachoLog, esDespachado } from '@/lib/bodega'
import { DB_SCHEMA } from '@/lib/prisma'

const ROLES = ROLES_ADMIN_BODEGA

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const empleadoId = user.role !== 'empresa' ? user.id : null
  const { id } = await params

  // FIX 2026-06-20: OrdenDespacho ya no se duplica por EmpresaVinculada — la
  // orden vive bajo el empresaId real de quien la generó en UpTres. Para que
  // Lumeli pueda operar (alistar/entregar) órdenes de una empresa vinculada
  // (ej. Leche), se busca primero sin filtrar empresaId, y luego se autoriza
  // explícitamente: o es de la propia empresa, o existe una EmpresaVinculada
  // activa de la empresa del usuario hacia la empresa dueña de la orden.
  const ordenRaw = await (prisma as any).ordenDespacho.findUnique({ where: { id } })
  if (!ordenRaw) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  let autorizado = ordenRaw.empresaId === empresaId
  if (!autorizado) {
    const vinculo = await (prisma as any).empresaVinculada.findFirst({
      where: { empresaId, empresaClienteId: ordenRaw.empresaId, activa: true },
      select: { id: true },
    })
    autorizado = !!vinculo
  }
  if (!autorizado) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const orden = ordenRaw
  const empresaIdOrden = orden.empresaId
  const empresa = await (prisma as any).empresa.findFirst({ where: { id: empresaId }, select: { nombre: true } })

  const body = await req.json()
  const { estado, fotoAlistamiento, repartidorId, guiaTransporte, transportadora, firmaBase64, num_cajas, observacion, clearFotos } = body

  const update: Record<string, unknown> = {}

  // Limpiar fotos (cancelar countdown)
  if (clearFotos) {
    update.fotosAlistamiento = []
    update.fotoAlistamiento = null
  }

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
  if (observacion !== undefined) update.observacion = observacion || null
  if (num_cajas !== undefined && Number.isInteger(num_cajas) && num_cajas >= 1) update.num_cajas = num_cajas
  if (guiaTransporte !== undefined) update.guiaTransporte = guiaTransporte
  if (transportadora !== undefined) update.transportadora = transportadora

  // Construir urlSeguimiento si hay guía y config de transportadora
  if (guiaTransporte) {
    const emp = await (prisma as any).empresa.findUnique({
      where: { id: empresaId }, select: { configDespachos: true }
    })
    const cfg: any = emp?.configDespachos ?? {}
    if (cfg.urlBase && guiaTransporte) {
      update.urlSeguimiento = cfg.urlBase.trim() + guiaTransporte.trim()
    }
  }

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
    // La ruta queda bajo la empresa DUEÑA de la orden (empresaIdOrden), no la
    // del usuario logueado — el repartidor puede ser de Lumeli operando sobre
    // un cliente/orden real de Leche.
    if (estado === 'en_entrega' && repartidorId && orden.clienteNit) {
      const cliente = await tx.cliente.findFirst({
        where: { nit: orden.clienteNit, empresaId: empresaIdOrden },
      })
      if (cliente) {
        // Obtener o crear ruta de hoy del repartidor (fuente única: getOrCreateRutaHoy)
        // Nota: getOrCreateRutaHoy no acepta tx de Prisma (corre fuera de la transacción)
        // Es aceptable: la asignación de ruta es idempotente y no es parte del core financiero
        const { rutaId, posible_entrega } = await getOrCreateRutaHoy(repartidorId, empresaIdOrden)

        // La clave de unicidad es la factura — mismo cliente puede tener N facturas distintas
        // o venir de Lumeli y de Leche el mismo día
        // Nombre = empresa DUEÑA de la orden (no quien despacha)
        const empresaOrden = empresaIdOrden !== empresaId
          ? await (prisma as any).empresa.findFirst({ where: { id: empresaIdOrden }, select: { nombre: true } })
          : empresa
        const notaOrden = `Bodega/${empresaOrden?.nombre || empresa?.nombre || 'Bodega'} #${orden.numeroFactura || orden.numeroOrden}`
        const yaEnRuta = await tx.rutaCliente.findFirst({
          where: { rutaId, notas: notaOrden }
        })
        if (!yaEnRuta) {
          await tx.rutaCliente.create({
            data: {
              rutaId,
              clienteId: cliente.id,
              orden: 999,
              notas: notaOrden,
              posible_entrega,
            },
          })
        }
      }
    }

    return ordenActualizada
  })

  // Registrar en DespachoLog — fire and forget
  if (esDespachado(updated.estado)) {
    const despachador = empleadoId
      ? await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { nombre: true } }).catch(() => null)
      : null
    // Heredar ciudadEntregaLocal de empresa propietaria si la propia está vacía
    const empresaMeta = await (prisma as any).$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(TRIM(e."ciudadEntregaLocal"),''), NULLIF(TRIM(ep."ciudadEntregaLocal"),'')) AS "ciudadEntregaLocal"
       FROM ${DB_SCHEMA}."Empresa" e
       LEFT JOIN ${DB_SCHEMA}."EmpresaVinculada" ev ON ev."empresaClienteId" = e.id
       LEFT JOIN ${DB_SCHEMA}."Empresa" ep ON ep.id = ev."empresaId"
       WHERE e.id = $1 LIMIT 1`,
      empresaId
    ).then((r: any[]) => r[0] ?? null).catch(() => null)
    // Si solo se actualiza guía, actualizar el log existente en vez de crear uno nuevo
    const soloGuia = guiaTransporte !== undefined && !estado
    if (soloGuia) {
      try {
        const updateResult = await (prisma as any).$queryRawUnsafe(
          `UPDATE ${DB_SCHEMA}."DespachoLog" SET "guiaTransporte" = $1 WHERE "empresaId" = $2 AND "numeroFactura" = $3 AND "despachadoEl" = (SELECT MAX("despachadoEl") FROM ${DB_SCHEMA}."DespachoLog" WHERE "empresaId" = $2 AND "numeroFactura" = $3) RETURNING id`,
          updated.guiaTransporte ?? null, empresaIdOrden, updated.numeroFactura
        )
        console.log('[guia update log] rows updated:', updateResult?.length ?? 0)
      } catch (e) { console.error('[guia update log] error', e) }
    } else {
      registrarDespachoLog({
        empresaId,
        ...updated,
        ciudadEntregaLocal: empresaMeta?.ciudadEntregaLocal ?? null,
        despachadoPorId: empleadoId ?? null,
        despachadoPorNombre: despachador?.nombre ?? (user.name ?? null),
      })
    }
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
    } catch {}
  }

  // Push notificaciones por tipo de despacho — fire and forget
  setImmediate(async () => {
    try {
      const { enviarPushEmpleados, enviarPushAdmin } = await import('@/lib/push')
      const { getRegla } = await import('@/lib/notif-reglas')
      const factura = updated.numeroFactura || updated.numeroOrden
      const cliente = updated.clienteNombre || 'Cliente'

      // Reglas por empresa dueña de la orden — bodega propia o vinculada, el evento pertenece a la empresa
      const empIdNotif = empresaIdOrden

      async function resolverDestinatarios(roles: string[]): Promise<string[]> {
        // Solo empleados propios de la empresa dueña de la orden — sin cruce entre empresas
        const propios = await prisma.empleado.findMany({
          where: { empresaId: empIdNotif, rol: { in: roles }, activo: true },
          select: { id: true }
        })
        return propios.map((e: any) => e.id)
      }

      if (updated.estado === 'en_transito') {
        const regla = await getRegla('despacho_guia', empIdNotif)
        if (regla.activa && regla.roles.length > 0) {
          const rolesEmpleados = regla.roles.filter((r: string) => r !== 'empresa')
          const destinatarios = rolesEmpleados.length > 0 ? await resolverDestinatarios(rolesEmpleados) : []
          const cajas = updated.num_cajas ? `${updated.num_cajas} caja${updated.num_cajas !== 1 ? 's' : ''}` : 'sin cajas'
          const obs = (updated as any).observacion ? ` · ${(updated as any).observacion}` : ''
          if (destinatarios.length > 0) await enviarPushEmpleados(destinatarios, `🚛 Guía: ${cliente}`, `${cajas}${obs}`, '/bodega')
          if (regla.roles.includes('empresa')) await enviarPushAdmin(empIdNotif, `🚛 Guía: ${cliente}`, `${cajas}${obs}`, '/bodega')
        }
      } else if (updated.estado === 'en_entrega') {
        const regla = await getRegla('despacho_local', empIdNotif)
        if (regla.activa && regla.roles.length > 0) {
          const rolesEmpleados = regla.roles.filter((r: string) => r !== 'empresa')
          const destinatarios = rolesEmpleados.length > 0 ? await resolverDestinatarios(rolesEmpleados) : []
          if (destinatarios.length > 0) await enviarPushEmpleados(destinatarios, '🏠 Nueva entrega local', `${cliente} · ${factura}`, '/inicio')
          if (regla.roles.includes('empresa')) await enviarPushAdmin(empIdNotif, '🏠 Nueva entrega local', `${cliente} · ${factura}`, '/inicio')
        }
      }
    } catch {}
  })

  // Invalidar cache de stats — una entrega afecta los contadores de órdenes
  await invalidatePattern(`g:${empresaId}:stats:*`)
  return NextResponse.json({ orden: updated, rutaAsignada, repartidorNombre })
}
