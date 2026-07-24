import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

const MASTER_URL = process.env.TAXBOT_MASTER_URL ?? 'http://localhost:3020'
const MASTER_KEY = process.env.TAXBOT_INTERNAL_KEY ?? ''

// ── Ejecutor de acciones (solo empresaId propio) ──
async function ejecutarAccion(accion: string, empresaId: string, params: any = {}) {
  switch (accion) {

    case 'invalida_cache': {
      const keys = await redis.keys(`g:${empresaId}:*`)
      if (keys.length) await redis.del(...keys)
      return { ok: true, keys: keys.length, msg: `✅ Caché invalidado: ${keys.length} keys eliminadas.` }
    }

    case 'stats_empresa': {
      const hoy = new Date()
      const inicioDia  = new Date(hoy.toISOString().slice(0,10) + 'T05:00:00.000Z')
      const inicioMes  = new Date(hoy.toISOString().slice(0,7)  + '-01T05:00:00.000Z')
      const [ventasMes, recaudoHoy, empleadosActivos, clientesTotal] = await Promise.all([
        prisma.ordenDespacho.aggregate({ where: { empresaId, createdAt: { gte: inicioMes } }, _sum: { totalOrden: true } }).catch(() => ({ _sum: { totalOrden: 0 } })),
        prisma.visita.aggregate({ where: { empleado: { empresaId }, tipo: 'cobro', fechaBogota: { gte: inicioDia } }, _sum: { monto: true } }).catch(() => ({ _sum: { monto: 0 } })),
        prisma.empleado.count({ where: { empresaId, activo: true } }).catch(() => 0),
        prisma.cliente.count({ where: { empresaId } }).catch(() => 0),
      ])
      return {
        ok: true,
        data: {
          ventasMes: Number(ventasMes._sum.totalOrden ?? 0),
          recaudoHoy: Number(recaudoHoy._sum.monto ?? 0),
          empleadosActivos, clientesTotal,
        }
      }
    }

    case 'sync_logs': {
      const logs = await prisma.syncLog.findMany({
        where: { empresaId },
        orderBy: { inicio: 'desc' },
        take: 5,
        select: { tipo: true, estado: true, inicio: true, fin: true },
      }).catch(() => [])
      return { ok: true, logs }
    }

    case 'empleados_activos': {
      const empleados = await prisma.empleado.findMany({
        where: { empresaId, activo: true },
        select: { nombre: true, rol: true, telefono: true },
        orderBy: { nombre: 'asc' },
      }).catch(() => [])
      return { ok: true, empleados }
    }

    case 'crear_reclamo': {
      // Escala a Master vía API interna
      await fetch(`${MASTER_URL}/api/taxbot/reclamos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-taxbot-internal': MASTER_KEY },
        body: JSON.stringify({
          tipo: params.tipo ?? 'reclamo',
          descripcion: params.descripcion,
          empresaId, empresaNombre: params.empresaNombre,
          telefono: params.telefono ?? 'app',
          nombre: params.nombre,
        }),
      }).catch(() => {})
      return { ok: true, msg: '✅ Reclamo creado. El equipo TuAgentX lo revisará pronto.' }
    }

    default:
      return { ok: false, msg: 'Acción no reconocida.' }
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const rol = user.role

  // empresa, supervisor y empleados de campo pueden usar TaXBot
  if (!['empresa', 'supervisor', 'vendedor', 'entregas', 'impulsadora'].includes(rol))
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { mensaje, historial, accionDirecta, accionParams, reset } = await req.json()

  // Empleados de campo no pueden ejecutar acciones directas de empresa
  const esEmpleadoCampo = ['vendedor', 'entregas', 'impulsadora'].includes(rol)
  if (esEmpleadoCampo && accionDirecta && !['sync_logs'].includes(accionDirecta))
    return NextResponse.json({ error: 'Sin acceso a esta acción' }, { status: 403 })

  // Acción directa desde el frontend (confirmación previa)
  if (accionDirecta) {
    const resultado = await ejecutarAccion(accionDirecta, empresaId, accionParams ?? {})
    return NextResponse.json({ accionResultado: resultado })
  }

  // Llamar al daemon TaXBot
  const TAXBOT_URL = process.env.TAXBOT_DAEMON_URL ?? 'http://localhost:3025'
  const cerebroRes = await fetch(`${TAXBOT_URL}/cerebro-interno`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-taxbot-internal': process.env.TAXBOT_INTERNAL_KEY ?? '' },
    body: JSON.stringify({
      empresaId,
      empresaNombre: user.empresaNombre ?? '',
      rol,
      empleadoId: user.id ?? null,
      mensaje,
      reset: reset ?? false,
      // historial manejado por el daemon en Redis
    }),
  })

  if (!cerebroRes.ok) {
    return NextResponse.json({ error: 'Error al conectar con TaXBot' }, { status: 500 })
  }

  const data = await cerebroRes.json()
  return NextResponse.json(data)
}
