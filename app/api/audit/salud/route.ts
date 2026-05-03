import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const AUDIT_SECRET = process.env.AUDIT_SECRET

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-audit-secret')
  if (secret !== AUDIT_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo metricas tecnicas — sin datos de negocio
  const t1 = Date.now()
  const [
    total_empresas,
    total_empleados,
    total_clientes,
    total_rutas,
    total_visitas,
    total_cartera,
  ] = await Promise.all([
    prisma.empresa.count(),
    prisma.empleado.count(),
    prisma.cliente.count(),
    prisma.ruta.count(),
    prisma.visita.count(),
    prisma.cartera.count(),
  ])
  const db_ms = Date.now() - t1

  // BullMQ jobs via Redis
  let bullmq: any = { disponible: false }
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const { stdout } = await execAsync("docker exec redis redis-cli keys 'bull:*' 2>/dev/null | wc -l")
    bullmq = { disponible: true, keys_activas: parseInt(stdout.trim()) || 0 }
  } catch { }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    proyecto: 'gestor',
    db: {
      response_ms: db_ms,
      estado: db_ms < 200 ? 'OPTIMO' : db_ms < 500 ? 'ACEPTABLE' : 'CRITICO',
      tablas: {
        empresas: total_empresas,
        empleados: total_empleados,
        clientes: total_clientes,
        rutas: total_rutas,
        visitas: total_visitas,
        cartera: total_cartera,
      }
    },
    bullmq,
    alertas: [
      ...(db_ms > 500 ? [`DB gestor lenta: ${db_ms}ms`] : []),
      ...(bullmq.disponible && bullmq.keys_activas > 100 ? [`BullMQ con ${bullmq.keys_activas} keys — posible acumulacion de jobs`] : []),
    ]
  })
}
