import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

const DB_SCHEMA = process.env.DB_SCHEMA || 'gestor'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  const role = user?.role
  if (!session || !['empresa', 'supervisor'].includes(role))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = getEmpresaId(user)
  if (!empresaId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT mes, empleado_id, entidad_nombre, datos
     FROM ${DB_SCHEMA}."SnapshotMes"
     WHERE empresa_id = $1 AND tipo = 'recaudo'
     ORDER BY mes DESC`,
    empresaId
  )

  // Agrupar por mes
  const mesMap = new Map<string, { mes: string; totalRecaudo: number; vendedores: Record<string, any> }>()
  for (const r of rows) {
    if (!mesMap.has(r.mes)) mesMap.set(r.mes, { mes: r.mes, totalRecaudo: 0, vendedores: {} })
    const e = mesMap.get(r.mes)!
    const k = r.empleado_id
    if (!e.vendedores[k]) e.vendedores[k] = { nombre: r.entidad_nombre, recaudo: 0, cobros: 0, meta: 0 }
    e.vendedores[k].recaudo += r.datos.total ?? 0
    e.vendedores[k].cobros += r.datos.cobros ?? 0
    if (r.datos.meta) e.vendedores[k].meta = r.datos.meta
    e.totalRecaudo += r.datos.total ?? 0
  }

  const meses = Array.from(mesMap.values())
    .map(m => ({ ...m, vendedores: Object.values(m.vendedores).sort((a: any, b: any) => b.recaudo - a.recaudo) }))
    .sort((a, b) => b.mes.localeCompare(a.mes))

  return NextResponse.json({ meses })
}
