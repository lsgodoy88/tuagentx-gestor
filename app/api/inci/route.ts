/**
 * API InciGuardian — Registro y resolución de incidencias del Guardián
 *
 * GET  /api/inci          → listar incidencias (filtro: estado, modulo)
 * POST /api/inci          → crear nueva incidencia (desde el guardián)
 * PUT  /api/inci          → resolver incidencia (por codigo)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Mapa de módulo → prefijo de código
const PREFIJOS: Record<string, string> = {
  'Dashboard Vendedor': 'DASH-VND',
  'Turno':              'TURNO',
  'Infraestructura':    'INFRA',
  'Sync Bodega':        'SYNC-BOD',
  'Cartera':            'CARTERA',
  'Operación':          'OPER',
  'Base de Datos':      'BD',
}

// GET — listar incidencias
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado') || null
  const modulo = searchParams.get('modulo') || null
  const limite  = parseInt(searchParams.get('limite') || '50')

  // Query directo con condiciones opcionales
  let sql = `SELECT * FROM gestor."InciGuardian" WHERE 1=1`
  const params: any[] = []
  if (estado) { params.push(estado); sql += ` AND estado = $${params.length}` }
  if (modulo) { params.push(modulo); sql += ` AND modulo = $${params.length}` }
  sql += ` ORDER BY "fechaInicio" DESC LIMIT ${limite}`

  const incidencias = await prisma.$queryRawUnsafe<any[]>(sql, ...params).catch(() => [])
  return NextResponse.json({ ok: true, total: incidencias.length, data: incidencias })
}

// POST — crear incidencia
export async function POST(req: NextRequest) {
  // Validar que viene del guardián (CRON_SECRET o AUDIT_SECRET)
  const secret = req.headers.get('x-guardian-secret') || req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET && secret !== process.env.AUDIT_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { contrato, modulo, descripcion, obtenido, accionTomada, scoreAntes, empresaId } = body

  if (!contrato || !modulo) {
    return NextResponse.json({ error: 'contrato y modulo requeridos' }, { status: 400 })
  }

  // Verificar si ya existe incidencia ACTIVA para este contrato
  const existente = await prisma.$queryRaw<any[]>`
    SELECT codigo FROM gestor."InciGuardian"
    WHERE contrato = ${contrato} AND estado = 'ACTIVO'
    LIMIT 1
  `.catch(() => [])

  if (existente.length > 0) {
    return NextResponse.json({ ok: true, codigo: existente[0].codigo, nueva: false })
  }

  // Generar código secuencial: SYNC-BOD-0001
  const prefijo = PREFIJOS[modulo] || 'GUARD'
  const ultimaSeq = await prisma.$queryRaw<any[]>`
    SELECT codigo FROM gestor."InciGuardian"
    WHERE codigo LIKE ${prefijo + '-%'}
    ORDER BY "createdAt" DESC LIMIT 1
  `.catch(() => [])

  let seq = 1
  if (ultimaSeq.length > 0) {
    const ultimoNum = parseInt(ultimaSeq[0].codigo.split('-').pop() || '0')
    seq = ultimoNum + 1
  }
  const codigo = `${prefijo}-${String(seq).padStart(4, '0')}`

  // Insertar
  await prisma.$executeRaw`
    INSERT INTO gestor."InciGuardian"
      (id, codigo, contrato, modulo, descripcion, obtenido, estado, "accionTomada", "scoreAntes", "empresaId", "fechaInicio", "createdAt", "updatedAt")
    VALUES (
      concat('inci_', substr(md5(random()::text), 1, 20)),
      ${codigo}, ${contrato}, ${modulo}, ${descripcion || contrato},
      ${obtenido || ''}, 'ACTIVO',
      ${accionTomada || null}, ${scoreAntes || null},
      ${empresaId || null}, NOW(), NOW(), NOW()
    )
  `

  return NextResponse.json({ ok: true, codigo, nueva: true })
}

// PUT — resolver incidencia
export async function PUT(req: NextRequest) {
  const secret = req.headers.get('x-guardian-secret') || req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET && secret !== process.env.AUDIT_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { contrato, accionTomada, scoreDespues } = body

  if (!contrato) {
    return NextResponse.json({ error: 'contrato requerido' }, { status: 400 })
  }

  const resultado = await prisma.$executeRaw`
    UPDATE gestor."InciGuardian"
    SET estado = 'RESUELTO',
        "fechaResolucion" = NOW(),
        "accionTomada" = COALESCE(${accionTomada || null}, "accionTomada"),
        "scoreDespues" = ${scoreDespues || null},
        "updatedAt" = NOW()
    WHERE contrato = ${contrato} AND estado = 'ACTIVO'
  `

  if (resultado === 0) {
    return NextResponse.json({ ok: true, mensaje: 'Sin incidencia activa para ese contrato' })
  }

  // Leer el código para incluirlo en la respuesta
  const resuelta = await prisma.$queryRaw<any[]>`
    SELECT codigo, "fechaInicio", "fechaResolucion"
    FROM gestor."InciGuardian"
    WHERE contrato = ${contrato} AND estado = 'RESUELTO'
    ORDER BY "fechaResolucion" DESC LIMIT 1
  `.catch(() => [])

  const inci = resuelta[0] || {}
  let duracion = ''
  if (inci.fechaInicio && inci.fechaResolucion) {
    const ms = new Date(inci.fechaResolucion).getTime() - new Date(inci.fechaInicio).getTime()
    const min = Math.round(ms / 60000)
    duracion = min < 60 ? `${min} min` : `${Math.round(min/60)}h ${min%60}min`
  }

  return NextResponse.json({
    ok: true,
    resuelto: true,
    codigo: inci.codigo,
    duracion,
  })
}
