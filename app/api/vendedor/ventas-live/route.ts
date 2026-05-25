import type { VentasLiveResult } from '@/lib/types/vendedor'
import type { VentaExterna } from '@/lib/integracion/types'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { decrypt } from '@/lib/crypto-uptres'
import { inicioMesBogota, mesBogota, anioBogota } from '@/lib/fechas'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const empleado = await prisma.empleado.findUnique({
    where: { id: user.id },
    select: { apiId: true }
  })
  const miApiId = empleado?.apiId
  if (!miApiId) return NextResponse.json({ error: 'Vendedor sin apiId' }, { status: 400 })

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const config = integracion.config as any
  const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
  const adapter = new UpTresAdapter(config.apiKey, apiSecret)
  await adapter.login()

  const mes   = mesBogota()
  const anio  = anioBogota()
  const inicioMes = inicioMesBogota()

  const ordenes = await adapter.fetchVentas(inicioMes)

  const misOrdenes = (ordenes as VentaExterna[]).filter((o) => {
    const esMio = o.empleado?.uid === miApiId
    const facturada = o.isInvoiced === true
    if (!esMio || !facturada) return false

    // Usar invoicedAt (fecha de facturación) para el filtro del mes
    // UpTres devuelve fechas en UTC — convertir a Bogotá (UTC-5) para comparar
    // Una orden con invoicedAt="2026-04-30T05:30:00Z" = 30 abr 0:30 Bogotá → no es de mayo
    const fechaRef = o.invoicedAt || o.fCreado
    if (!fechaRef) return true
    const fechaUTC = new Date(fechaRef as string)
    // Ajustar a Bogotá: restar 5 horas para obtener la fecha local real
    const fechaBogota = new Date(fechaUTC.getTime() - 5 * 60 * 60 * 1000)
    const esMes = fechaBogota.getUTCFullYear() === anio &&
                  (fechaBogota.getUTCMonth() + 1) === mes
    return esMes
  })

  const montoMes = misOrdenes.reduce((s: number, o: any) =>
    s + parseFloat(String(o.vTotal || o.total || 0)), 0
  )

  const result: VentasLiveResult = {
    ok: true,
    montoMes: Math.round(montoMes),
    ordenes: misOrdenes.length,
    mes, anio,
    fuente: 'uptres-live',
  }
  return NextResponse.json(result)
}
