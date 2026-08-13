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

async function detectarAlertas(empresaId: string): Promise<AlertaDetectada[]> {
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

  // 2. Plan por vencer
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

  // 3. Inventario — pendiente implementación

  return alertas
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ alertas: [] })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role)) return NextResponse.json({ alertas: [] })
  const empresaId = getEmpresaId(user)

  const detectadas = await detectarAlertas(empresaId)
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

  const ICONO: Record<string, string> = { storage: '☁️', plan: '📅', inventario: '📦' }
  const URL_MAP: Record<string, string> = { storage: '/configuracion/almacenamiento', plan: '/configuracion', inventario: '/bodega' }

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
