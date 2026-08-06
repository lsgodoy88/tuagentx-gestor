import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { decrypt } from '@/lib/crypto-uptres'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'

/**
 * POST /api/vendedor/sync-inicial
 * Establece nSaldoBase + nSaldoBaseAt en SyncDeuda de los clientes del vendedor.
 * Write-once: solo toca deudas donde nSaldoBase IS NULL.
 * Consulta UpTres en tiempo real para obtener el saldo exacto de cada deuda.
 * Body: { empleadoId: string, syncInicioAt: string (ISO) }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'superadmin'].includes(user.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { empleadoId, syncInicioAt } = await req.json()
    if (!empleadoId || !syncInicioAt) {
      return NextResponse.json({ error: 'Faltan datos: empleadoId y syncInicioAt requeridos' }, { status: 400 })
    }

    const fechaInicio = new Date(syncInicioAt)
    if (isNaN(fechaInicio.getTime())) {
      return NextResponse.json({ error: 'Fecha invalida' }, { status: 400 })
    }

    // 1. Verificar empleado
    const empleado = await (prisma as any).empleado.findFirst({
      where: { id: empleadoId, empresaId },
      select: {
        id: true, nombre: true, apiId: true,
        listasAsignadas: { select: { listaId: true }, take: 1 }
      }
    })
    if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
    if (!empleado.apiId) return NextResponse.json({ error: 'Empleado sin API ID de UpTres' }, { status: 400 })

    const listaId = empleado.listasAsignadas?.[0]?.listaId
    if (!listaId) return NextResponse.json({ error: 'Empleado sin lista asignada' }, { status: 400 })

    // 2. Clientes de la lista
    const clientes = await (prisma as any).cliente.findMany({
      where: { listaId, empresaId },
      select: { apiId: true }
    })
    const clienteApiIds = clientes.map((c: any) => c.apiId).filter(Boolean)
    if (clienteApiIds.length === 0) {
      return NextResponse.json({ error: 'No hay clientes en la lista del empleado' }, { status: 400 })
    }

    // 3. Integracion + credenciales
    const integracion = await (prisma as any).integracion.findFirst({
      where: { empresaId },
      select: { id: true, config: true }
    })
    if (!integracion) return NextResponse.json({ error: 'Sin integracion configurada' }, { status: 400 })

    const config = integracion.config as any
    const apiSecret = decrypt(config.apiSecret, process.env.UPTRES_SECRET!)
    const adapter = new UpTresAdapter(config.apiKey, apiSecret)
    await adapter.login()

    // 4. Deudas activas sin nSaldoBase en Gestor BD
    const deudasBD = await (prisma as any).syncDeuda.findMany({
      where: {
        integracionId: integracion.id,
        clienteApiId: { in: clienteApiIds },
        condition: true,
        nSaldoBase: null
      },
      select: { id: true, externalId: true, saldo: true }
    })

    // 5. Siempre guardar syncInicioAt en empleado
    await (prisma as any).empleado.update({
      where: { id: empleadoId },
      data: { syncInicioAt: fechaInicio }
    })

    if (deudasBD.length === 0) {
      return NextResponse.json({ ok: true, actualizadas: 0, mensaje: 'Sin deudas pendientes de sincronizar' })
    }

    // 6. Consultar saldos reales en UpTres ahora mismo
    const deudasUptres = await (adapter as any).fetchDeudasEmpleado(empleado.apiId)
    const saldoMap: Record<string, number> = {}
    for (const d of deudasUptres) {
      const uid = String(d.uid || d._id || '')
      if (uid) saldoMap[uid] = parseFloat(d.vSaldo ?? '0')
    }

    // 7. nSaldoBaseAt igual para todas
    await (prisma as any).syncDeuda.updateMany({
      where: { id: { in: deudasBD.map((d: any) => d.id) } },
      data: { nSaldoBaseAt: fechaInicio }
    })

    // 8. nSaldoBase = saldo real UpTres, fallback a saldo BD si no viene en respuesta
    await Promise.all(
      deudasBD.map((d: any) => {
        const saldoReal = saldoMap[d.externalId] ?? Number(d.saldo)
        return (prisma as any).syncDeuda.update({
          where: { id: d.id },
          data: { nSaldoBase: saldoReal }
        })
      })
    )

    const totalBase = deudasBD.reduce((s: number, d: any) => {
      return s + (saldoMap[d.externalId] ?? Number(d.saldo))
    }, 0)

    return NextResponse.json({
      ok: true,
      actualizadas: deudasBD.length,
      clientes: clienteApiIds.length,
      totalBase: Math.round(totalBase),
      fechaInicio: fechaInicio.toISOString()
    })

  } catch (err: any) {
    console.error('[sync-inicial]', err)
    return NextResponse.json({ error: 'Error interno', detalle: err.message }, { status: 500 })
  }
}
