import { NextRequest, NextResponse } from 'next/server'
import { generarPlanMes } from '@/lib/billing/generarPlan'
import { enviarRecordatorioPago, activarBannerPago } from '@/lib/billing/notificaciones'

// POST — ejecutado por cron en días específicos del mes
// Body: { accion: 'generar' | 'recordatorio' | 'alerta' | 'banner', mes?: 'YYYY-MM' }
export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { accion, mes } = body

  const ahora = new Date()
  const dia = ahora.getDate()

  switch (accion) {
    case 'generar':
      // Día 1 — generar plan del mes con empleados activos y precios fijos
      return NextResponse.json(await generarPlanMes(mes))

    case 'recordatorio':
      // Día 3 — push a admin: recordatorio de pago
      return NextResponse.json(await enviarRecordatorioPago(3))

    case 'alerta':
      // Días 6 y 7 — push a admin: aviso de vencimiento
      return NextResponse.json(await enviarRecordatorioPago(dia >= 7 ? 7 : 6))

    case 'banner':
      // Día 10+ — activar banner para todos los roles
      return NextResponse.json(await activarBannerPago())

    default:
      return NextResponse.json({ error: 'accion requerida: generar | recordatorio | alerta | banner' }, { status: 400 })
  }
}
