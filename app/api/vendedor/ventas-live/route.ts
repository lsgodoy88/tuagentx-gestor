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

  const misOrdenes = ordenes.filter((o: any) => {
    const esMio = o.empleado?.uid === miApiId
    const fc = o.fCreado ? new Date(o.fCreado as string) : null
    const esMes = fc ? fc >= inicioMes && fc.getFullYear() === anio && (fc.getMonth() + 1) === mes : true
    const facturada = !!(o.numeroFacturado || o.invoiceNumber)
    return esMio && esMes && facturada
  })

  const montoMes = misOrdenes.reduce((s: number, o: any) =>
    s + parseFloat(String(o.vTotal || o.total || 0)), 0
  )

  return NextResponse.json({
    ok: true,
    montoMes: Math.round(montoMes),
    ordenes: misOrdenes.length,
    mes, anio,
    fuente: 'uptres-live',
  })
}
