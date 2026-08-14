import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { subirR2, registrarDespachoLog, esDespachado } from '@/lib/bodega'
import { registrarStorage } from '@/lib/r2'
import { getOrCreateRutaHoy } from '@/lib/rutas/getOrCreateRutaHoy'
import { invalidatePattern } from '@/lib/cache'

export async function patchDespacho(params: {
  id: string
  empresaId: string
  empleadoId: string | null
  userName: string | null
  body: any
}) {
  const { id, empresaId, empleadoId, userName, body } = params

  // Buscar orden y autorizar
  const ordenRaw = await (prisma as any).ordenDespacho.findUnique({ where: { id } })
  if (!ordenRaw) throw Object.assign(new Error('No encontrada'), { status: 404 })

  let autorizado = ordenRaw.empresaId === empresaId
  if (!autorizado) {
    const vinculo = await (prisma as any).empresaVinculada.findFirst({
      where: { empresaId, empresaClienteId: ordenRaw.empresaId, activa: true },
      select: { id: true },
    })
    autorizado = !!vinculo
  }
  if (!autorizado) throw Object.assign(new Error('No encontrada'), { status: 404 })

  const orden = ordenRaw
  const empresaIdOrden = orden.empresaId
  const empresa = await (prisma as any).empresa.findFirst({ where: { id: empresaId }, select: { nombre: true } })

  const {
    estado, fotoAlistamiento, fotosAlistamiento: fotosAlistamientoBody,
    repartidorId, guiaTransporte, transportadora, firmaBase64,
    num_cajas, observacion, clearFotos,
  } = body

  const update: Record<string, unknown> = {}

  if (clearFotos) {
    update.fotosAlistamiento = []
    update.fotoAlistamiento = null
  }

  if (fotoAlistamiento && typeof fotoAlistamiento === 'string' && fotoAlistamiento.startsWith('data:')) {
    const idx = ((orden.fotosAlistamiento as string[]) || []).length
    const key = `alistamiento/${id}_${idx}.jpg`
    const fotoBuf = Buffer.from(fotoAlistamiento.replace(/^data:[^;]+;base64,/, ''), 'base64')
    await subirR2(fotoAlistamiento, key, 'image/jpeg')
    registrarStorage(empresaIdOrden, 'foto_alistamiento', key, fotoBuf.length)
    const fotos = [...((orden.fotosAlistamiento as string[]) || []), key]
    update.fotosAlistamiento = fotos
    update.fotoAlistamiento = key
  }

  if (estado) {
    update.estado = estado
    if (estado === 'alistado' && !fotosAlistamientoBody && !((orden.fotosAlistamiento as string[]) || []).length && !fotoAlistamiento && !firmaBase64)
      throw Object.assign(new Error('Se requiere al menos una foto para alistar'), { status: 422 })
    if (estado === 'alistado') {
      update.alistadoEl = new Date()
      if (empleadoId) update.alistadoPorId = empleadoId
    }
    if (estado === 'entregado') update.entregadoEl = new Date()
  }

  if (firmaBase64 && typeof firmaBase64 === 'string' && firmaBase64.startsWith('data:')) {
    const firmaKey = `firmas/${id}.png`
    const firmaBuf = Buffer.from(firmaBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
    await subirR2(firmaBase64, firmaKey, 'image/png')
    registrarStorage(empresaIdOrden, 'firma', firmaKey, firmaBuf.length)
    update.firmaEntrega = firmaKey
    update.estado = 'entregado'
    update.entregadoEl = new Date()
  }

  if (fotosAlistamientoBody !== undefined && Array.isArray(fotosAlistamientoBody)) {
    if (fotosAlistamientoBody.length === 0)
      throw Object.assign(new Error('Se requiere al menos una foto para alistar'), { status: 422 })
    update.fotosAlistamiento = fotosAlistamientoBody
    update.fotoAlistamiento = fotosAlistamientoBody[fotosAlistamientoBody.length - 1] ?? null
    update.estado = 'alistado'
    update.alistadoEl = new Date()
    if (empleadoId) update.alistadoPorId = empleadoId
  }

  if (repartidorId !== undefined) update.repartidorId = repartidorId || null

  if (estado === 'en_transito' || estado === 'en_entrega') {
    update.modo_despacho = repartidorId ? 'local' : 'transporte'
  }

  if (observacion !== undefined) update.observacion = observacion || null
  if (num_cajas !== undefined && Number.isInteger(num_cajas) && num_cajas >= 1) update.num_cajas = num_cajas
  if (guiaTransporte !== undefined) update.guiaTransporte = guiaTransporte
  if (transportadora !== undefined) update.transportadora = transportadora

  if (guiaTransporte) {
    const emp = await (prisma as any).empresa.findUnique({
      where: { id: empresaId }, select: { configDespachos: true },
    })
    const cfg: any = emp?.configDespachos ?? {}
    if (cfg.urlBase && guiaTransporte) {
      update.urlSeguimiento = cfg.urlBase.trim() + guiaTransporte.trim()
    }
  }

  const updated = await prisma.$transaction(async (tx: any) => {
    const ordenActualizada = await tx.ordenDespacho.update({
      where: { id },
      data: update,
      include: {
        alistadoPor: { select: { id: true, nombre: true } },
        repartidor: { select: { id: true, nombre: true } },
      },
    })

    if (estado === 'en_entrega' && repartidorId && orden.clienteNit) {
      const cliente = await tx.cliente.findFirst({
        where: { nit: orden.clienteNit, empresaId: empresaIdOrden },
      })
      if (cliente) {
        const { rutaId, posible_entrega } = await getOrCreateRutaHoy(repartidorId, empresaIdOrden)
        const empresaOrden = empresaIdOrden !== empresaId
          ? await (prisma as any).empresa.findFirst({ where: { id: empresaIdOrden }, select: { nombre: true } })
          : empresa
        const notaOrden = `Bodega/${empresaOrden?.nombre || empresa?.nombre || 'Bodega'} #${orden.numeroFactura || orden.numeroOrden}`
        const yaEnRuta = await tx.rutaCliente.findFirst({ where: { rutaId, notas: notaOrden } })
        if (!yaEnRuta) {
          await tx.rutaCliente.create({
            data: { rutaId, clienteId: cliente.id, orden: 999, notas: notaOrden, posible_entrega },
          })
        }
      }
    }

    return ordenActualizada
  })

  // DespachoLog — fire and forget
  if (esDespachado(updated.estado)) {
    const despachador = empleadoId
      ? await prisma.empleado.findUnique({ where: { id: empleadoId }, select: { nombre: true } }).catch(() => null)
      : null
    const empresaMeta = await (prisma as any).$queryRawUnsafe(
      `SELECT COALESCE(NULLIF(TRIM(e."ciudadEntregaLocal"),''), NULLIF(TRIM(ep."ciudadEntregaLocal"),'')) AS "ciudadEntregaLocal"
       FROM ${DB_SCHEMA}."Empresa" e
       LEFT JOIN ${DB_SCHEMA}."EmpresaVinculada" ev ON ev."empresaClienteId" = e.id
       LEFT JOIN ${DB_SCHEMA}."Empresa" ep ON ep.id = ev."empresaId"
       WHERE e.id = $1 LIMIT 1`,
      empresaId
    ).then((r: any[]) => r[0] ?? null).catch(() => null)

    const soloGuia = guiaTransporte !== undefined && !estado
    if (soloGuia) {
      try {
        await (prisma as any).$queryRawUnsafe(
          `UPDATE ${DB_SCHEMA}."DespachoLog" SET "guiaTransporte" = $1 WHERE "empresaId" = $2 AND "numeroFactura" = $3 AND "despachadoEl" = (SELECT MAX("despachadoEl") FROM ${DB_SCHEMA}."DespachoLog" WHERE "empresaId" = $2 AND "numeroFactura" = $3) RETURNING id`,
          updated.guiaTransporte ?? null, empresaIdOrden, updated.numeroFactura
        )
      } catch (e) { console.error('[guia update log] error', e) }
    } else {
      registrarDespachoLog({
        empresaId,
        ...updated,
        ciudadEntregaLocal: empresaMeta?.ciudadEntregaLocal ?? null,
        despachadoPorId: empleadoId ?? null,
        despachadoPorNombre: despachador?.nombre ?? (userName ?? null),
      })
    }
  }

  // Push notificaciones — fire and forget
  setImmediate(async () => {
    try {
      const { enviarPushEmpleados, enviarPushAdmin } = await import('@/lib/push')
      const { getRegla } = await import('@/lib/notif-reglas')
      const factura = updated.numeroFactura || updated.numeroOrden
      const cliente = updated.clienteNombre || 'Cliente'
      const empIdNotif = empresaIdOrden

      async function resolverDestinatarios(roles: string[]): Promise<string[]> {
        const propios = await prisma.empleado.findMany({
          where: { empresaId: empIdNotif, rol: { in: roles }, activo: true },
          select: { id: true },
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

  await invalidatePattern(`g:${empresaId}:stats:*`)

  let rutaAsignada = false
  let repartidorNombre: string | null = null
  if (estado === 'en_entrega' && repartidorId) {
    try {
      const rep = await prisma.empleado.findUnique({ where: { id: repartidorId }, select: { nombre: true } })
      repartidorNombre = rep?.nombre || null
      rutaAsignada = true
    } catch {}
  }

  return { orden: updated, rutaAsignada, repartidorNombre }
}
