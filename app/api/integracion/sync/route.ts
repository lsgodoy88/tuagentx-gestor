import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { crearAdaptador, sincronizarDeudas, actualizarCache } from '@/lib/integracion/sync'
import { decrypt } from '@/lib/crypto-uptres'


function resolverConfig(tipo: string, config: any): Record<string, string> {
  return {
    apiKey: config.apiKey,
    apiSecret: decrypt(config.apiSecret, process.env.UPTRES_SECRET!),
  }
}

async function runDelta(integracion: any): Promise<{ deudas: number; clientes: number }> {
  const config = resolverConfig(integracion.tipo, integracion.config)
  const adapter = crearAdaptador(integracion.tipo, config)
  await adapter.login()
  const desde = integracion.ultimaSync ? new Date(integracion.ultimaSync) : undefined
  const deudas = await adapter.fetchDeudas(desde)
  const afectados = await sincronizarDeudas(deudas, integracion.id, integracion.empresaId)
  await actualizarCache(afectados, integracion.id, integracion.empresaId)
  await (prisma as any).integracion.update({
    where: { id: integracion.id },
    data: { ultimaSync: new Date() }
  })
  return { deudas: deudas.length, clientes: afectados.size }
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET

  const body = await req.json()
  const { tipo } = body

  // ── Modo cron — delta sobre todas las integraciones activas ──
  if (isCron) {
    if (tipo !== 'delta') return NextResponse.json({ error: 'Cron solo acepta tipo delta' }, { status: 400 })
    const integraciones = await (prisma as any).integracion.findMany({
      where: { tipo: 'uptres', activa: true }
    })
    const resultados = []
    for (const integ of integraciones) {
      try {
        const r = await runDelta(integ)
        resultados.push({ empresaId: integ.empresaId, ok: true, ...r })
      } catch (err: any) {
        resultados.push({ empresaId: integ.empresaId, ok: false, error: err.message })
      }
    }
    return NextResponse.json({ ok: true, resultados })
  }

  // ── Modo sesión ──
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })
  const empresaId = user.id

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }, orderBy: { updatedAt: 'desc' }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const config = resolverConfig(integracion.tipo, integracion.config as any)
  const adapter = crearAdaptador(integracion.tipo, config)
  await adapter.login()

  const logs: string[] = []
  let clientesActualizados = 0
  let deudasInsertadas = 0

  try {
    if (tipo === 'delta') {
      const desde = integracion.ultimaSync ?? undefined
      const desdeDate = desde ? new Date(desde) : null
      logs.push(`Delta sync desde: ${desde ?? 'inicio'}`)

      const clientesExt = await adapter.fetchClientes()
      const clientesFiltrados = desdeDate
        ? clientesExt.filter((c: any) => c.fModificado && new Date(c.fModificado) > desdeDate)
        : clientesExt
      for (const c of clientesFiltrados) {
        const doc = (c as any).doc?.trim()
        const uid = (c as any).uid?.trim() || (c as any)._id?.trim()
        if (!doc || !uid) continue
        const nombre = `${(c as any).name || ''} ${(c as any).lastName || ''}`.trim() || 'Sin nombre'
        const dataCliente = { ciudad: (c as any).ciudad || undefined, direccion: (c as any).dir || undefined, telefono: (c as any).nCel || undefined, email: (c as any).email || undefined }
        try {
          const existing = await (prisma as any).cliente.findFirst({ where: { nit: doc, empresaId } })
          if (existing) {
            await (prisma as any).cliente.update({ where: { id: existing.id }, data: { apiId: uid, ...dataCliente } })
          } else {
            await (prisma as any).cliente.create({ data: { nombre, nit: doc, apiId: uid, empresaId, ...dataCliente } })
          }
          clientesActualizados++
        } catch(e: any) {
          console.error('[DELTA] Error cliente', doc, e.message)
        }
      }
      logs.push(`Clientes delta: ${clientesActualizados}`)

      const empleadosExt = await adapter.fetchEmpleados()
      const empleadosFiltrados = desdeDate
        ? empleadosExt.filter((e: any) => e.fModificado && new Date(e.fModificado) > desdeDate)
        : empleadosExt
      for (const e of empleadosFiltrados) {
        const uid = (e as any).uid?.trim() || (e as any)._id?.trim()
        if (!uid) continue
        await (prisma as any).empleado.updateMany({
          where: { apiId: uid, empresaId },
          data: { nombre: `${(e as any).name || ''} ${(e as any).lastName || ''}`.trim() }
        })
      }
      logs.push(`Empleados delta: ${empleadosFiltrados.length}`)

      const deudas = await adapter.fetchDeudas(desde ? new Date(desde) : undefined)
      logs.push(`Deudas obtenidas: ${deudas.length}`)
      const afectados = await sincronizarDeudas(deudas, integracion.id, empresaId)
      await actualizarCache(afectados, integracion.id, empresaId)
      await (prisma as any).integracion.update({
        where: { id: integracion.id },
        data: { ultimaSync: new Date() }
      })
      deudasInsertadas = deudas.length
      logs.push(`Delta completado. Clientes afectados: ${afectados.size}`)

    } else if (tipo === 'inicial') {
      logs.push('Sincronizando clientes...')
      const clientes = await adapter.fetchClientes()
      logs.push(`Clientes obtenidos del API: ${clientes.length}`)
      // Bulk load clientes existentes por nit
      const nits = clientes.map((c: any) => (c.doc as string)?.trim()).filter(Boolean)
      const existentes = await (prisma as any).cliente.findMany({
        where: { nit: { in: nits }, empresaId },
        select: { id: true, nit: true }
      })
      const mapaExistentes: Record<string, string> = {}
      existentes.forEach((e: any) => { mapaExistentes[e.nit] = e.id })
      // Preparar creates y updates
      const toCreate: any[] = []
      const toUpdate: any[] = []
      for (const c of clientes) {
        const doc = (c.doc as string)?.trim()
        const uid = ((c._id as string) || (c.uid as string))?.trim()
        if (!doc || !uid) continue
        const nombre = ((c as any).name || '') + ' ' + ((c as any).lastName || '').trim() || 'Sin nombre'
        const dataCliente = { apiId: uid, ciudad: (c as any).ciudad || undefined, direccion: (c as any).dir || undefined, telefono: (c as any).nCel || undefined, email: (c as any).email || undefined }
        if (mapaExistentes[doc]) {
          toUpdate.push({ id: mapaExistentes[doc], data: dataCliente })
        } else {
          toCreate.push({ nombre, nit: doc, empresaId, ...dataCliente })
        }
      }
      // Batch create + parallel updates
      if (toCreate.length > 0) await (prisma as any).cliente.createMany({ data: toCreate, skipDuplicates: true })
      await Promise.all(toUpdate.map((u: any) => (prisma as any).cliente.update({ where: { id: u.id }, data: u.data })))
      clientesActualizados = toCreate.length + toUpdate.length
      logs.push(`Clientes actualizados: ${clientesActualizados}`)

      // Sincronizar empleados
      logs.push('Sincronizando empleados...')
      const empleadosExt = await adapter.fetchEmpleados()
      for (const e of empleadosExt) {
        const uid = ((e as any)._id || (e as any).uid)?.trim()
        if (!uid) continue
        const nombre = `${(e as any).name || ''} ${(e as any).lastName || ''}`.trim() || 'Sin nombre'
        await (prisma as any).empleado.updateMany({
          where: { apiId: uid, empresaId },
          data: { nombre }
        })
      }
      logs.push(`Empleados sincronizados: ${empleadosExt.length}`)
      logs.push('Sincronizando deudas...')
      const deudas = await adapter.fetchDeudas()
      const afectados = await sincronizarDeudas(deudas, integracion.id, empresaId)
      await actualizarCache(afectados, integracion.id, empresaId)
      deudasInsertadas = deudas.length
      logs.push(`Deudas sincronizadas: ${deudasInsertadas}`)

      await (prisma as any).integracion.update({
        where: { id: integracion.id },
        data: { syncInicial: true, ultimaSync: new Date(), updatedAt: new Date() }
      })
    }

    return NextResponse.json({ ok: true, logs, clientesActualizados, deudasInsertadas })
  } catch (err: any) {
    logs.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, error: err.message, logs }, { status: 500 })
  }
}
