import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { invalidateKeys } from '@/lib/cache'
import { fechaHoyBogota } from '@/lib/fechas'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'
import { recalcularEnvioEstadoPago } from '@/lib/jobs/sync-nocturno'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pagoId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!ROLES_ADMIN.includes(user.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { pagoId } = await params
  const body = await req.json()
  const { accion } = body

  if (accion !== 'enviar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  }

  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: {
      Cartera: { select: { empresaId: true } },
      Empleado: { select: { empresaId: true } },
    },
  })
  if (!pago) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const empresaId = getEmpresaId(user)
  const pagoEmpresaId = pago.Cartera?.empresaId ?? pago.Empleado?.empresaId
  if (pagoEmpresaId !== empresaId) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  // Capturar saldo UpTres AL MOMENTO del envío — base fresca para el descuento.
  // Multi-factura: cada Aplicacion puede tener saldoBaseEnvio distinto (facturas
  // diferentes), se guarda como mapa syncDeudaId -> saldo en envioVariacion.
  const aplicaciones = await (prisma as any).pagoCarteraDeuda.findMany({
    where: { pagoId, envioEstado: 'pendiente' },
    select: { id: true, syncDeudaId: true }
  })
  const syncDeudaIds = aplicaciones.length > 0
    ? aplicaciones.map((a: any) => a.syncDeudaId)
    : (pago.syncDeudaId ? [pago.syncDeudaId] : [])
  const deudas = syncDeudaIds.length > 0
    ? await (prisma as any).syncDeuda.findMany({ where: { id: { in: syncDeudaIds } }, select: { id: true, saldo: true } })
    : []
  const saldoBaseEnvioPorDeuda: Record<string, number> = {}
  for (const d of deudas) saldoBaseEnvioPorDeuda[d.id] = Number(d.saldo)

  const envioRef = `REF-${Date.now()}`
  const envioEstado = 'enviado'
  const ahora = new Date()

  if (aplicaciones.length > 0) {
    // Recibo con Aplicaciones reales — marcar cada factura, luego derivar el padre.
    // Fuente única de verdad: PagoCarteraDeuda.envioEstado (ver sync-nocturno.ts).
    await (prisma as any).pagoCarteraDeuda.updateMany({
      where: { id: { in: aplicaciones.map((a: any) => a.id) } },
      data: { envioEstado: 'enviado', envioFecha: ahora }
    })
    await recalcularEnvioEstadoPago(pagoId)
    await prisma.pagoCartera.update({
      where: { id: pagoId },
      data: { envioRef, envioVariacion: { saldoBaseEnvioPorDeuda } },
    })
  } else {
    // Recibo legacy sin Aplicaciones (pagos previos a esta migración) —
    // fallback directo sobre el padre, comportamiento idéntico al anterior.
    await prisma.pagoCartera.update({
      where: { id: pagoId },
      data: { envioEstado, envioFecha: ahora, envioRef, envioVariacion: { saldoBaseEnvioPorDeuda } },
    })
  }

  await invalidateKeys(
    `g:${empresaId}:stats:${fechaHoyBogota()}`,
    `g:${empresaId}:cartera:resumen:${fechaHoyBogota()}`,
    `g:v:${pago.empleadoId ?? ''}:${fechaHoyBogota()}`
  )
  return NextResponse.json({ ok: true, envioEstado, envioRef })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pagoId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (!ROLES_ADMIN.includes(user.role)) {
    return NextResponse.json({ error: 'Solo administradores pueden eliminar recibos' }, { status: 403 })
  }

  const { pagoId } = await params

  const pago = await prisma.pagoCartera.findUnique({
    where: { id: pagoId },
    include: {
      Cartera: { select: { empresaId: true } },
      Empleado: { select: { id: true, empresaId: true, configRecibos: true } },
      Aplicaciones: { select: { syncDeudaId: true, montoAplicado: true } },
    },
  })
  if (!pago) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const empresaId = getEmpresaId(user)
  const pagoEmpresaId = pago.Cartera?.empresaId ?? pago.Empleado?.empresaId
  if (pagoEmpresaId !== empresaId) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const numeroRecibo = pago.numeroRecibo
  const yaRecibido = pago.envioEstado === 'recibido'
  const clientesApiIdAfectados: Set<string> = new Set()
  let integracionIdAfectada: string | null = null

  // Multi-factura: revertir CADA aplicación contra su propia SyncDeuda — antes
  // solo se revertía pago.syncDeudaId (la primera factura), perdiendo la reversión
  // de las facturas 2+ del mismo recibo (mismo bug de fondo corregido 24/06).
  const aplicacionesARevertir = pago.Aplicaciones.length > 0
    ? pago.Aplicaciones.map((a: any) => ({ syncDeudaId: a.syncDeudaId, montoAplicado: Number(a.montoAplicado) }))
    : (pago.syncDeudaId ? [{ syncDeudaId: pago.syncDeudaId, montoAplicado: Number(pago.monto) }] : [])

  await prisma.$transaction(async (tx) => {
    for (const a of aplicacionesARevertir) {
      const sd = await tx.syncDeuda.findUnique({
        where: { id: a.syncDeudaId },
        select: { saldo: true, nSaldo: true, valor: true, clienteApiId: true, integracionId: true }
      })
      if (!sd) continue
      const saldoRevertido = Math.min(Number(sd.valor), Number(sd.saldo) + a.montoAplicado)
      // nSaldo también se revierte — es la fuente que ve el vendedor
      const nSaldoRevertido = Math.min(Number(sd.valor), Number(sd.nSaldo ?? sd.saldo) + a.montoAplicado)
      await tx.syncDeuda.update({
        where: { id: a.syncDeudaId },
        data: { saldo: saldoRevertido, nSaldo: nSaldoRevertido, condition: saldoRevertido > 0 }
      })
      clientesApiIdAfectados.add(sd.clienteApiId)
      integracionIdAfectada = sd.integracionId
    }

    await tx.pagoCartera.delete({ where: { id: pagoId } })

    // Si el recibo eliminado es el último consecutivo generado del empleado en el mes
    // actual, decrementar el contador para que el siguiente pago reutilice el número.
    if (pago.empleadoId && numeroRecibo) {
      const emp = await tx.empleado.findUnique({
        where: { id: pago.empleadoId },
        select: { configRecibos: true }
      })
      const cfg: any = emp?.configRecibos ?? {}
      // Extraer mmaa del recibo eliminado (no del mes actual) — permite
      // decrementar consecutivos de meses anteriores si se elimina el último.
      // Formato real: CL + AAMM + NNN (ej. CL2606144 → mmaa='0626')
      const matchFecha = numeroRecibo.match(/^[A-Z]+(\d{2})(\d{2})\d/)
      const mmaaRecibo = matchFecha ? `${matchFecha[2]}${matchFecha[1]}` : null

      if (mmaaRecibo && cfg.consecutivoMes === mmaaRecibo) {
        // El sufijo numérico del recibo eliminado
        const match = numeroRecibo.match(/(\d{3})$/)
        const numEliminado = match ? parseInt(match[1], 10) : null
        if (numEliminado !== null && numEliminado === Number(cfg.consecutivoActual)) {
          await tx.empleado.update({
            where: { id: pago.empleadoId },
            data: {
              configRecibos: { ...cfg, consecutivoActual: numEliminado - 1 } as any
            }
          })
        }
      }
    }
  })

  // Mismo patron que pago-sync al crear: refrescar CarteraCache puntual de
  // CADA cliente afectado (multi-factura puede tocar distintos clientes en
  // EmpresaVinculada), para que el dashboard del vendedor refleje la reversion
  // sin esperar al ciclo nocturno.
  if (clientesApiIdAfectados.size > 0 && integracionIdAfectada) {
    try {
      const { actualizarCache } = await import('@/lib/integracion/sync')
      await actualizarCache(clientesApiIdAfectados, integracionIdAfectada, empresaId)
    } catch (eCache: any) {
      console.error('[recaudos DELETE] actualizarCache fallo (no critico):', eCache.message)
    }
  }

  await invalidateKeys(
    `g:${empresaId}:stats:${fechaHoyBogota()}`,
    `g:${empresaId}:cartera:resumen:${fechaHoyBogota()}`,
    `g:v:${pago.empleadoId ?? ''}:${fechaHoyBogota()}`
  )

  return NextResponse.json({
    ok: true,
    eliminado: numeroRecibo,
    ...(yaRecibido ? { advertencia: 'Este pago ya estaba confirmado por UpTres. El saldo se revirtio en el sistema local, pero debes corregirlo tambien directamente en UpTres.' } : {})
  })
}
