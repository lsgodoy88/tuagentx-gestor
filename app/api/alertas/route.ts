import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { Prisma } from '@/app/generated/prisma'

export type Alerta = {
  id: string
  tipo: string
  icono: string
  mensaje: string
  url: string
  severidad: 'info' | 'advertencia' | 'critica'
  vistaPor: string | null
  createdAt: Date
}

type AlertaDetectada = Omit<Alerta, 'id' | 'vistaPor' | 'createdAt'>

async function detectarAlertas(empresaId: string, rol: string): Promise<AlertaDetectada[]> {
  const alertas: AlertaDetectada[] = []

  // 1. Almacenamiento
  try {
    const GB = 1024 * 1024 * 1024
    const [empRow, storageRow] = await Promise.all([
      prisma.$queryRaw<[{ limite_storage_gb: number }]>`
        SELECT limite_storage_gb FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaId} LIMIT 1`,
      prisma.$queryRaw<[{ bytes: bigint }]>`
        SELECT COALESCE(SUM(size_bytes),0)::bigint AS bytes
        FROM ${Prisma.raw(DB_SCHEMA)}."StorageLog" WHERE empresa_id = ${empresaId}`
    ])
    const limiteBytes = Number(empRow[0]?.limite_storage_gb ?? 1) * GB
    const totalBytes = Number(storageRow[0]?.bytes ?? 0)
    if (limiteBytes - totalBytes <= 200 * 1024 * 1024) {
      alertas.push({
        tipo: 'storage', icono: '☁️',
        mensaje: `Almacenamiento casi lleno — ${((limiteBytes - totalBytes) / 1024 / 1024).toFixed(0)} MB disponibles`,
        url: '/configuracion/almacenamiento', severidad: 'advertencia',
      })
    }
  } catch {}

  // 2. Billing — solo admin empresa
  if (rol === 'empresa') try {
    const planRows = await prisma.$queryRaw<[{ estado: string }]>`
      SELECT estado FROM ${Prisma.raw(DB_SCHEMA)}."PlanEmpresa"
      WHERE "empresaId" = ${empresaId}
        AND mes = TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM')
      LIMIT 1`
    const billingEstado = planRows[0]?.estado
    if (billingEstado === 'pendiente') {
      alertas.push({ tipo: 'billing_pendiente', icono: '', mensaje: 'Pago pendiente', url: '/configuracion', severidad: 'advertencia' })
    } else if (billingEstado === 'vencido') {
      alertas.push({ tipo: 'billing_mora', icono: '', mensaje: 'Pago en mora', url: '/configuracion', severidad: 'critica' })
    }
  } catch {}

  // 2b. Plan por vencer
  try {
    const emp = await prisma.$queryRaw<[{ planFin: Date | null }]>`
      SELECT "planFin" FROM ${Prisma.raw(DB_SCHEMA)}."Empresa" WHERE id = ${empresaId} LIMIT 1`
    const planFin = emp[0]?.planFin
    if (planFin) {
      const dias = Math.ceil((new Date(planFin).getTime() - Date.now()) / 86400000)
      if (dias <= 7 && dias >= 0) {
        alertas.push({
          tipo: 'plan', icono: '📅',
          mensaje: dias === 0 ? 'Tu plan vence hoy' : `Tu plan vence en ${dias} día${dias > 1 ? 's' : ''}`,
          url: '/configuracion', severidad: dias <= 2 ? 'critica' : 'advertencia',
        })
      }
    }
  } catch {}

  // 3. Pagos por revisar — SyncDeudas con discrepancia (misma lógica que tab Revisar)
  try {
    const rows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT pcd."syncDeudaId")::bigint as count
      FROM ${Prisma.raw(DB_SCHEMA)}."PagoCarteraDeuda" pcd
      JOIN ${Prisma.raw(DB_SCHEMA)}."SyncDeuda" sd ON sd.id = pcd."syncDeudaId"
      JOIN ${Prisma.raw(DB_SCHEMA)}."Integracion" i ON i.id = sd."integracionId"
      WHERE i."empresaId" = ${empresaId}
        AND pcd."envioEstado" = 'enviado'
        AND pcd."envioFecha" IS NOT NULL
        AND pcd."envioFecha" <= NOW() - INTERVAL '24 hours'
        AND sd.condition = true
        AND sd.saldo::numeric > 0`
    const count = Number(rows[0]?.count ?? 0)
    if (count > 0) {
      alertas.push({
        tipo: 'pagos_revisar', icono: '💵',
        mensaje: `${count} pago${count > 1 ? 's' : ''} por revisar`,
        url: '/recaudos?tab=revisar', severidad: count >= 5 ? 'advertencia' : 'info',
      })
    }
  } catch {}

  // 4. Novedades Transprensa — últimas 30 transportadora con NOVEDAD como último estado
  try {
    const rows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM (
        SELECT tr.id
        FROM ${Prisma.raw(DB_SCHEMA)}."TransprensaRemesa" tr
        WHERE tr."empresaId" = ${empresaId}
          AND tr.raw_estados IS NOT NULL
          AND (tr.raw_estados -> -1 ->> 'estado_nombre') ILIKE '%NOVEDAD%'
        ORDER BY tr."updatedAt" DESC
        LIMIT 30
      ) sub`
    const count = Number(rows[0]?.count ?? 0)
    if (count > 0) {
      alertas.push({
        tipo: 'novedad_transprensa', icono: '🔴',
        mensaje: `${count} envío${count > 1 ? 's' : ''} con novedad`,
        url: '/trazabilidad', severidad: 'advertencia',
      })
    }
  } catch {}

  // 5. Órdenes pendientes hace más de 10 días
  try {
    const rows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM ${Prisma.raw(DB_SCHEMA)}."OrdenDespacho"
      WHERE "empresaId" = ${empresaId}
        AND estado = 'pendiente'
        AND "createdAt" <= NOW() - INTERVAL '10 days'`
    const count = Number(rows[0]?.count ?? 0)
    if (count > 0) {
      alertas.push({
        tipo: 'ordenes_sin_despachar', icono: '🚚',
        mensaje: `${count} orden${count > 1 ? 'es' : ''} sin despachar`,
        url: '/bodega', severidad: count >= 3 ? 'advertencia' : 'info',
      })
    }
  } catch {}

  // 6. Inventario — pendiente implementación

  return alertas
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ alertas: [] })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role)) return NextResponse.json({ alertas: [] })
  const empresaId = getEmpresaId(user)

  const detectadas = await detectarAlertas(empresaId, user.role)
  const tiposActivos = new Set(detectadas.map(a => a.tipo))

  // Resolver alertas que ya no aplican
  if ([...tiposActivos].length > 0) {
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
      SET resuelta = TRUE, resuelta_el = NOW(), updated_at = NOW()
      WHERE empresa_id = ${empresaId}
        AND resuelta = FALSE
        AND tipo NOT IN (${Prisma.join([...tiposActivos])})`
      .catch(() => {})
  } else {
    // Sin alertas activas — resolver todas
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
      SET resuelta = TRUE, resuelta_el = NOW(), updated_at = NOW()
      WHERE empresa_id = ${empresaId}
        AND resuelta = FALSE`
      .catch(() => {})
  }

  // Upsert alertas activas
  for (const a of detectadas) {
    await prisma.$executeRaw`
      INSERT INTO ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
        (empresa_id, tipo, severidad, mensaje, updated_at)
      VALUES (${empresaId}, ${a.tipo}, ${a.severidad}, ${a.mensaje}, NOW())
      ON CONFLICT (empresa_id, tipo) WHERE resuelta = FALSE
      DO UPDATE SET mensaje = ${a.mensaje}, severidad = ${a.severidad}, updated_at = NOW()`
      .catch(() => {})
  }

  // Leer alertas activas con metadata
  const rows = await prisma.$queryRaw<Alerta[]>`
    SELECT id::text, tipo, severidad, mensaje, vista_por AS "vistaPor", created_at AS "createdAt"
    FROM ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
    WHERE empresa_id = ${empresaId} AND resuelta = FALSE
    ORDER BY created_at ASC`

  const ICONO: Record<string, string> = { storage: '☁️', plan: '📅', inventario: '📦', transprensa_conexion: '🚛', pagos_revisar: '💵', novedad_transprensa: '🔴', ordenes_sin_despachar: '🚚', billing_pendiente: '💳', billing_mora: '💳' }
  const URL_MAP: Record<string, string> = { storage: '/configuracion/almacenamiento', plan: '/configuracion', inventario: '/bodega', transprensa_conexion: '/configuracion' }

  const alertas = rows.map((r: any) => ({
    ...r,
    icono: ICONO[r.tipo] ?? '⚠️',
    url: URL_MAP[r.tipo] ?? '/inicio',
  }))

  return NextResponse.json({ alertas })
}

// PATCH — marcar como vista
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { id } = await req.json()

  await prisma.$executeRaw`
    UPDATE ${Prisma.raw(DB_SCHEMA)}."AlertaLog"
    SET vista_por = ${user.name ?? user.email ?? 'admin'}, vista_el = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}`

  return NextResponse.json({ ok: true })
}
