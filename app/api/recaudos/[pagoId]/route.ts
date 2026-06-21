import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { invalidateKeys } from '@/lib/cache'
import { fechaHoyBogota } from '@/lib/fechas'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN } from '@/lib/auth-helpers'

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

  // Capturar saldo UpTres AL MOMENTO del envío — base fresca para el descuento
  let saldoBaseEnvio: number | null = null
  if (pago.syncDeudaId) {
    const deuda = await (prisma as any).syncDeuda.findUnique({
      where: { id: pago.syncDeudaId },
      select: { saldo: true }
    })
    if (deuda) saldoBaseEnvio = Number(deuda.saldo)
  }

  const envioRef = `REF-${Date.now()}`
  const envioEstado = 'enviado'

  await prisma.pagoCartera.update({
    where: { id: pagoId },
    data: {
      envioEstado,
      envioFecha: new Date(),
      envioRef,
      envioVariacion: { saldoBaseEnvio },
    },
  })

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

  await prisma.$transaction(async (tx) => {
    // Revertir el monto en SyncDeuda — el pago deja de existir, su descuento tambien.
    // Si ya estaba 'recibido' (UpTres lo certifico), se revierte igual en local
    // pero requiere correccion manual en UpTres tambien (advertencia en la respuesta).
    if (pago.syncDeudaId) {
      const sd = await tx.syncDeuda.findUnique({
        where: { id: pago.syncDeudaId },
        select: { saldo: true, valor: true }
      })
      if (sd) {
        const saldoRevertido = Math.min(Number(sd.valor), Number(sd.saldo) + Number(pago.monto))
        await tx.syncDeuda.update({
          where: { id: pago.syncDeudaId },
          data: { saldo: saldoRevertido, condition: saldoRevertido > 0 }
        })
      }
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
      const now = new Date()
      const mes = String(now.getMonth() + 1).padStart(2, '0')
      const anio = String(now.getFullYear()).slice(-2)
      const mmaa = `${mes}${anio}`

      if (cfg.consecutivoMes === mmaa) {
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
