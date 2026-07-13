// app/api/sms/procesar/route.ts — job SMS facturas (llamado por Guardian)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enviarSMS, construirMensaje } from '@/lib/notificaciones/sms'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  
  const ahora = new Date()
  // Hora Bogotá (UTC-5)
  const horaBogota = ahora.getUTCHours() - 5
  const diaBogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000).getUTCDay() // 0=Dom

  // Validación CRC: solo 8-20h
  if (horaBogota < 8 || horaBogota >= 20) {
    return NextResponse.json({ skip: 'fuera_horario', hora: horaBogota })
  }

  // Leer configs activas
  const configs = await (prisma as any).smsConfig.findMany({
    where: { activo: true },
  })

  if (!configs.length) return NextResponse.json({ skip: 'sin_config_activa', enviados: 0 })

  let totalEnviados = 0
  let totalFallidos = 0

  for (const config of configs) {
    // Verificar día activo
    const diasActivos = config.dias.split(',').map(Number)
    if (!diasActivos.includes(diaBogota)) continue

    // Buscar órdenes pendientes de SMS para esta empresa
    const ordenes = await (prisma as any).ordenDespacho.findMany({
      where: {
        empresaId: config.empresaId,
        isFacturada: true,
        isActiva: true,
        smsEnviado: false,
        telefono: { not: null },
      },
      select: {
        id: true, telefono: true, clienteNombre: true,
        numeroFactura: true, totalOrden: true, clienteApiId: true,
      },
      take: 100,
    })

    if (!ordenes.length) continue

    // Buscar fechas de vencimiento en SyncDeuda (batch)
    const facturas = ordenes.map((o: any) => o.numeroFactura).filter(Boolean)
    const deudas = await (prisma as any).syncDeuda.findMany({
      where: {
        integracionId: { not: null },
        numeroFactura: { in: facturas.map(Number).filter(Boolean) },
        condition: true,
      },
      select: { numeroFactura: true, fechaVencimiento: true },
    })
    const vencMap = new Map(deudas.map((d: any) => [String(d.numeroFactura), d.fechaVencimiento]))

    for (const orden of ordenes) {
      const venc = vencMap.get(String(orden.numeroFactura))
      const vencStr = venc
        ? new Date(venc as string).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'por definir'

      const valorStr = orden.totalOrden
        ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(orden.totalOrden))
        : '$0'

      const mensaje = construirMensaje(config.plantilla, config.firma || '', {
        nombre: orden.clienteNombre || 'Cliente',
        factura: orden.numeroFactura || '—',
        valor: valorStr,
        vencimiento: vencStr,
      })

      const result = await enviarSMS(orden.telefono, mensaje)

      // Marcar enviado independientemente del resultado (evita reintento infinito en num inválido)
      // Solo reintenta si fue error de API (no de número)
      const esErrorNumero = result.errorCodigo === 1007 || result.errorCodigo === 1010
      if (result.ok || esErrorNumero) {
        await (prisma as any).ordenDespacho.update({
          where: { id: orden.id },
          data: { smsEnviado: true },
        })
      }

      await (prisma as any).smsLog.create({
        data: {
          id: crypto.randomUUID(),
          empresaId: config.empresaId,
          ordenId: orden.id,
          telefono: orden.telefono,
          onurixMsgId: result.msgId || null,
          estadoEnvio: result.ok ? 'ok' : (esErrorNumero ? 'error_num' : 'error_api'),
          estadoEntrega: result.ok ? 'pendiente' : 'fallido',
          errorCodigo: result.errorCodigo || null,
          errorMsg: result.errorMsg || null,
        },
      })

      result.ok ? totalEnviados++ : totalFallidos++
    }
  }

  return NextResponse.json({ ok: true, enviados: totalEnviados, fallidos: totalFallidos })
}
