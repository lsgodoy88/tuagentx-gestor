import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { nowBogota } from '@/lib/fechas'

// Smoke test interno post-deploy
// Valida: auth real, BD queries criticas, Redis, fechas
// Solo accesible con CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const results: Record<string, { ok: boolean; ms: number; detalle?: string }> = {}
  const start = Date.now()
  let empresaId: string | null = null

  // 1. Auth real contra BD
  try {
    const t = Date.now()
    const email = process.env.SMOKE_TEST_EMAIL
    const password = process.env.SMOKE_TEST_PASSWORD
    if (!email || !password) throw new Error('Sin credenciales SMOKE_TEST en .env')

    const empresa = await prisma.empresa.findUnique({ where: { email } })
    if (!empresa) throw new Error('Empresa smoke no encontrada')

    const match = await bcrypt.compare(password, empresa.password)
    if (!match) throw new Error('Password no coincide — actualizar SMOKE_TEST_PASSWORD')

    empresaId = empresa.id
    results['auth_bd'] = { ok: true, ms: Date.now() - t, detalle: empresa.nombre }
  } catch (e: any) {
    results['auth_bd'] = { ok: false, ms: 0, detalle: e.message }
  }

  // 2. Query cartera (endpoint mas pesado)
  if (empresaId) {
    try {
      const t = Date.now()
      const count = await prisma.cartera.count({ where: { empresaId } })
      results['bd_cartera'] = { ok: true, ms: Date.now() - t, detalle: count + ' registros' }
    } catch (e: any) {
      results['bd_cartera'] = { ok: false, ms: 0, detalle: e.message }
    }
  }

  // 3. Query empleados
  if (empresaId) {
    try {
      const t = Date.now()
      const count = await prisma.empleado.count({ where: { empresaId, activo: true } })
      results['bd_empleados'] = { ok: true, ms: Date.now() - t, detalle: count + ' activos' }
    } catch (e: any) {
      results['bd_empleados'] = { ok: false, ms: 0, detalle: e.message }
    }
  }

  // 4. Redis ping
  try {
    const t = Date.now()
    const { createClient } = await import('redis')
    const client = createClient({ url: process.env.REDIS_URL })
    await client.connect()
    await client.ping()
    await client.disconnect()
    results['redis'] = { ok: true, ms: Date.now() - t }
  } catch (e: any) {
    results['redis'] = { ok: false, ms: 0, detalle: e.message }
  }

  // 5. Helper fechas Bogota
  try {
    const t = Date.now()
    const now = nowBogota()
    results['fechas'] = { ok: !!now, ms: Date.now() - t, detalle: now.toISOString() }
  } catch (e: any) {
    results['fechas'] = { ok: false, ms: 0, detalle: e.message }
  }

  const totalMs = Date.now() - start
  const allOk = Object.values(results).every(r => r.ok)

  return NextResponse.json({
    ok: allOk,
    totalMs,
    timestamp: new Date().toISOString(),
    checks: results,
  }, { status: allOk ? 200 : 500 })
}
