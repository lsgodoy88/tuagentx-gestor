import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_VENDEDOR, ROLES_ADMIN } from '@/lib/auth-helpers'
import { crearAdaptador, sincronizarDeudas, actualizarCache, marcarZombis, refrescarDeudasConPagosPendientes } from '@/lib/integracion/sync'
import { decrypt } from '@/lib/crypto-uptres'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'

function resolverConfig(config: any): Record<string, string> {
  return {
    apiKey: config.apiKey,
    apiSecret: decrypt(config.apiSecret, process.env.UPTRES_SECRET!),
  }
}

// ─── Lógica delta unificada — usada por cron y botón ───────────────────────
async function ejecutarDelta(integracion: any, logs: string[] = [], disparadoPor: string = 'cron', empleadoId?: string, incluirImpulsos: boolean = false): Promise<{
  clientes: number, empleados: number, deudas: number, zombis: number, confrontados: number, duracionMs: number
}> {
  const log = (m: string) => { logs.push(m); console.log('[sync-delta]', m) }
  const inicio = new Date()

  const config = resolverConfig(integracion.config)
  const adapter = crearAdaptador(integracion.tipo, config)
  await adapter.login()

  const empresaId = integracion.empresaId
  const desde = integracion.ultimaSync ? new Date(integracion.ultimaSync) : undefined

  const T = (label: string, t0: number) => log(`⏱ ${label}: ${((Date.now()-t0)/1000).toFixed(2)}s`)

  // ── Clientes delta ────────────────────────────────────────────────────────
  let _t = Date.now()
  const clientesExt = await adapter.fetchClientes(desde)
  T(`fetchClientes (${clientesExt.length})`, _t)
  let clientesActualizados = 0
  const toUpdateCli: any[] = []
  const toCreateCli: any[] = []
  const nits = clientesExt.map((c: any) => (c.doc as string)?.trim()).filter(Boolean)
  const existentesCli = await (prisma as any).cliente.findMany({
    where: { nit: { in: nits }, empresaId },
    select: { id: true, nit: true, apiId: true, ciudad: true, departamento: true, direccion: true, telefono: true, email: true, nombre: true, listaId: true }
  })
  const mapaExistentes: Record<string, any> = {}
  existentesCli.forEach((e: any) => { mapaExistentes[e.nit] = e })

  // Log diagnóstico — ver si UpTres devuelve employeeId
  const sinEmployeeId = clientesExt.filter((c: any) => !c.employeeId).length
  const conEmployeeId = clientesExt.filter((c: any) => c.employeeId).length
  log(`employeeId: ${conEmployeeId} con, ${sinEmployeeId} sin`)

  // Mapa apiId-empleado → listaId local (para asignar lista al cliente)
  const empleadosLocales = await (prisma as any).empleado.findMany({
    where: { empresaId },
    select: { apiId: true, listasAsignadas: { select: { listaId: true }, take: 1 } }
  })
  const mapaEmpleadoLista: Record<string, string> = {}
  for (const emp of empleadosLocales) {
    if (emp.apiId && emp.listasAsignadas?.[0]?.listaId) {
      mapaEmpleadoLista[emp.apiId] = emp.listasAsignadas[0].listaId
    }
  }

  let skipped = 0
  for (const c of clientesExt) {
    const doc = (c as any).doc?.trim()
    const uid = (c as any).uid?.trim() || (c as any)._id?.trim()
    if (!doc || !uid) continue
    const nombre = `${(c as any).name || ''} ${(c as any).lastName || ''}`.trim() || 'Sin nombre'
    const ex = mapaExistentes[doc]
    if (ex) {
      // Solo actualizar direccion, telefono y listaId (si está vacío)
      const cambio: any = {}
      const dir = (c as any).dir || undefined
      const tel = (c as any).nCel || undefined
      const empId = (c as any).employeeId || null
      if (dir && dir !== (ex.direccion || undefined)) cambio.direccion = dir
      if (tel && tel !== (ex.telefono || undefined)) cambio.telefono = tel
      // Si no tiene lista asignada localmente, buscar por employeeId de UpTres
      if (!ex.listaId && empId && mapaEmpleadoLista[empId]) cambio.listaId = mapaEmpleadoLista[empId]
      if (Object.keys(cambio).length === 0) { skipped++; continue }
      toUpdateCli.push({ id: ex.id, data: cambio })
    } else {
      const empId = (c as any).employeeId || null
      toCreateCli.push({
        nombre, nit: doc, empresaId,
        apiId: uid,
        ciudad: (c as any).ciudad || undefined,
        departamento: (c as any).departamento || undefined,
        direccion: (c as any).dir || undefined,
        telefono: (c as any).nCel || undefined,
        email: (c as any).email || undefined,
        listaId: (empId && mapaEmpleadoLista[empId]) ? mapaEmpleadoLista[empId] : undefined,
      })
    }
  }
  await prisma.$transaction(async (tx: any) => {
    if (toCreateCli.length > 0) await tx.cliente.createMany({ data: toCreateCli, skipDuplicates: true })
    for (const u of toUpdateCli) {
      await tx.cliente.update({ where: { id: u.id }, data: u.data })
    }
  }, { timeout: 60000 })
  clientesActualizados = toCreateCli.length + toUpdateCli.length
  T(`upsert clientes`, _t)
  log(`Clientes delta: ${clientesActualizados} (saltados ${skipped})`)

  // ── Empleados delta ───────────────────────────────────────────────────────
  _t = Date.now()
  const empleadosExt = await adapter.fetchEmpleados(desde)
  for (const e of empleadosExt) {
    const uid = ((e as any).uid || (e as any)._id)?.trim()
    if (!uid) continue
    const nombre = `${(e as any).name || ''} ${(e as any).lastName || ''}`.trim() || 'Sin nombre'
    await (prisma as any).empleado.updateMany({ where: { apiId: uid, empresaId }, data: { nombre } })
    await (prisma as any).syncEmpleado.upsert({
      where: { integracionId_externalId: { integracionId: integracion.id, externalId: uid } },
      create: { integracionId: integracion.id, externalId: uid, nombre, data: e },
      update: { nombre } // solo nombre — el resto se congela
    })
  }
  T(`empleados (${empleadosExt.length})`, _t)
  log(`Empleados delta: ${empleadosExt.length}`)

  // ── Deudas: toda la cartera activa ────────────────────────────────────────
  _t = Date.now()
  const deudas = await adapter.fetchDeudas() // sin filtro de fecha — detecta zombis
  T(`fetchDeudas (${deudas.length})`, _t)
  log(`Deudas activas en UpTres: ${deudas.length}`)
  _t = Date.now()
  const afectados = await sincronizarDeudas(deudas, integracion.id, empresaId)
  T(`sincronizarDeudas (afectados ${afectados.size})`, _t)

  // Marcar zombis — deudas que ya no aparecen en UpTres
  _t = Date.now()
  const externalIdsVivas = new Set(deudas.map((d: any) => d.externalId || d.uid).filter(Boolean))
  const zombis = await marcarZombis(externalIdsVivas as Set<string>, integracion.id, empresaId)
  T(`marcarZombis (${zombis})`, _t)
  log(`Deudas cerradas en UpTres (zombis): ${zombis}`)

  // Refrescar pagos locales pendientes de confrontación
  _t = Date.now()
  const refresco = await refrescarDeudasConPagosPendientes(adapter as any, integracion.id, empresaId)
  T(`refrescarPagos (${refresco.confrontados} conf)`, _t)
  log(`Refresco: ${refresco.clientes} clientes, ${refresco.deudasActualizadas} deudas, ${refresco.confrontados} pagos`)

  // Repoblar clientes sin cache
  const sinCache = await (prisma as any).syncDeuda.findMany({
    where: { integracionId: integracion.id, saldo: { gt: 0 } },
    select: { clienteApiId: true }, distinct: ['clienteApiId']
  })
  const conCache = new Set(
    (await (prisma as any).carteraCache.findMany({
      where: { integracionId: integracion.id },
      select: { clienteApiId: true }
    })).map((c: any) => c.clienteApiId)
  )
  const faltantes = new Set<string>(
    sinCache.map((d: any) => d.clienteApiId).filter((id: string) => id && !conCache.has(id))
  )
  const todosAfectados = new Set([...afectados, ...faltantes])
  _t = Date.now()
  await actualizarCache(todosAfectados, integracion.id, empresaId)
  T(`actualizarCache (${todosAfectados.size})`, _t)
  log(`Cache actualizado: ${todosAfectados.size} clientes`)

  // Actualizar ultimaSync
  await (prisma as any).integracion.update({
    where: { id: integracion.id },
    data: { ultimaSync: new Date() }
  })

  // Recalcular ventas-mes (solo cuando viene del cron diario)
  if (incluirImpulsos) {
    try {
      await recalcularVentasMesImpulsos(empresaId, adapter, empleadoId)
    } catch (err: any) {
      log(`[ventaMes] Error: ${err.message}`)
    }
  }

  const fin = new Date()
  const duracionMs = fin.getTime() - inicio.getTime()

  // Guardar bitácora
  try {
    await (prisma as any).syncLog.create({
      data: {
        integracionId: integracion.id,
        inicio,
        fin,
        duracionMs,
        clientesActualizados,
        empleadosSincronizados: empleadosExt.length,
        deudasSincronizadas: deudas.length,
        zombis,
        pagosConfrontados: refresco.confrontados,
        disparadoPor,
        estado: 'ok',
      }
    })
  } catch (err: any) {
    log(`[syncLog] Error guardando bitácora: ${err.message}`)
  }

  return {
    clientes: clientesActualizados,
    empleados: empleadosExt.length,
    deudas: deudas.length,
    zombis,
    confrontados: refresco.confrontados,
    duracionMs,
  }
}

// ─── Lógica vendedor — sólo sus deudas vía /cartera/empleado/{id} ─────────
async function ejecutarDeltaVendedor(integracion: any, empleadoApiId: string, logs: string[] = []): Promise<{
  clientes: number, empleados: number, deudas: number, zombis: number, confrontados: number, duracionMs: number
}> {
  const log = (m: string) => { logs.push(m); console.log('[sync-vendedor]', m) }
  const inicio = new Date()

  const config = resolverConfig(integracion.config)
  const adapter = crearAdaptador(integracion.tipo, config)
  await adapter.login()

  const empresaId = integracion.empresaId
  const T = (label: string, t0: number) => log(`⏱ ${label}: ${((Date.now()-t0)/1000).toFixed(2)}s`)

  // Solo las deudas del empleado
  let _t = Date.now()
  const deudas = await (adapter as any).fetchDeudasEmpleado(empleadoApiId)
  T(`fetchDeudasEmpleado (${deudas.length})`, _t)

  _t = Date.now()
  const afectados = await sincronizarDeudas(deudas, integracion.id, empresaId)
  T(`sincronizarDeudas (${afectados.size})`, _t)

  // Refrescar pagos pendientes del vendedor
  _t = Date.now()
  const refresco = await refrescarDeudasConPagosPendientes(adapter as any, integracion.id, empresaId)
  T(`refrescarPagos (${refresco.confrontados})`, _t)

  _t = Date.now()
  await actualizarCache(afectados, integracion.id, empresaId)
  T(`actualizarCache (${afectados.size})`, _t)

  const fin = new Date()
  const duracionMs = fin.getTime() - inicio.getTime()

  try {
    await (prisma as any).syncLog.create({
      data: {
        integracionId: integracion.id,
        inicio, fin, duracionMs,
        clientesActualizados: 0,
        empleadosSincronizados: 0,
        deudasSincronizadas: deudas.length,
        zombis: 0,
        pagosConfrontados: refresco.confrontados,
        disparadoPor: 'vendedor',
        estado: 'ok',
      }
    })
  } catch {}

  return { clientes: 0, empleados: 0, deudas: deudas.length, zombis: 0, confrontados: refresco.confrontados, duracionMs }
}

// ─── Lógica inicial ─────────────────────────────────────────────────────────
async function ejecutarInicial(integracion: any, adapter: any, empresaId: string, logs: string[]): Promise<{
  clientes: number, empleados: number, deudas: number
}> {
  const log = (m: string) => { logs.push(m); console.log('[sync-inicial]', m) }

  // Clientes
  log('Sincronizando clientes...')
  const clientes = await adapter.fetchClientes()
  log(`Clientes obtenidos: ${clientes.length}`)
  const nits = clientes.map((c: any) => (c.doc as string)?.trim()).filter(Boolean)
  const existentesCli = await (prisma as any).cliente.findMany({
    where: { nit: { in: nits }, empresaId },
    select: { id: true, nit: true }
  })
  const mapaExistentes: Record<string, string> = {}
  existentesCli.forEach((e: any) => { mapaExistentes[e.nit] = e.id })
  const toCreate: any[] = []
  const toUpdate: any[] = []
  for (const c of clientes) {
    const doc = (c.doc as string)?.trim()
    const uid = ((c._id as string) || (c.uid as string))?.trim()
    if (!doc || !uid) continue
    const nombre = (((c as any).name || '') + ' ' + ((c as any).lastName || '')).trim() || 'Sin nombre'
    const data = {
      apiId: uid,
      ciudad: (c as any).ciudad || undefined,
      departamento: (c as any).departamento || undefined,
      direccion: (c as any).dir || undefined,
      telefono: (c as any).nCel || undefined,
      email: (c as any).email || undefined,
    }
    if (mapaExistentes[doc]) {
      // Solo actualizar direccion y telefono — el resto se congela
      const cambio: any = {}
      const dir = (c as any).dir || undefined
      const tel = (c as any).nCel || undefined
      if (dir) cambio.direccion = dir
      if (tel) cambio.telefono = tel
      if (Object.keys(cambio).length > 0) toUpdate.push({ id: mapaExistentes[doc], data: cambio })
    } else {
      toCreate.push({ nombre, nit: doc, empresaId, nombreComercial: (c as any).nombreComercial || undefined, ...data })
    }
  }
  await prisma.$transaction(async (tx: any) => {
    if (toCreate.length > 0) await tx.cliente.createMany({ data: toCreate, skipDuplicates: true })
    for (const u of toUpdate) {
      await tx.cliente.update({ where: { id: u.id }, data: u.data })
    }
  }, { timeout: 60000 })
  log(`Clientes actualizados: ${toCreate.length + toUpdate.length}`)

  // Empleados
  log('Sincronizando empleados...')
  const empleadosExt = await adapter.fetchEmpleados()
  for (const e of empleadosExt) {
    const uid = ((e as any)._id || (e as any).uid)?.trim()
    if (!uid) continue
    const nombre = `${(e as any).name || ''} ${(e as any).lastName || ''}`.trim() || 'Sin nombre'
    await (prisma as any).empleado.updateMany({ where: { apiId: uid, empresaId }, data: { nombre } })
    await (prisma as any).syncEmpleado.upsert({
      where: { integracionId_externalId: { integracionId: integracion.id, externalId: uid } },
      create: { integracionId: integracion.id, externalId: uid, nombre, data: e, modificadoEn: (e as any).fModificado ? new Date((e as any).fModificado) : null },
      update: { nombre } // solo nombre — el resto se congela
    })
  }
  log(`Empleados: ${empleadosExt.length}`)

  // Deudas
  log('Sincronizando deudas...')
  const deudas = await adapter.fetchDeudas()
  log(`Deudas obtenidas: ${deudas.length}`)
  const afectados = await sincronizarDeudas(deudas, integracion.id, empresaId)

  // Zombis — deudas en BD que no vinieron del API
  const externalIdsVivas = new Set(deudas.map((d: any) => d.externalId || d.uid).filter(Boolean))
  const zombis = await marcarZombis(externalIdsVivas as Set<string>, integracion.id, empresaId)
  if (zombis > 0) log(`Deudas cerradas (zombis): ${zombis}`)

  await actualizarCache(afectados, integracion.id, empresaId)
  log(`Cache actualizado: ${afectados.size} clientes`)

  await (prisma as any).integracion.update({
    where: { id: integracion.id },
    data: { syncInicial: true, ultimaSync: new Date(), updatedAt: new Date() }
  })
  await prisma.empresa.update({ where: { id: empresaId }, data: { bodegaPuedeEnviar: true } })

  return { clientes: toCreate.length + toUpdate.length, empleados: empleadosExt.length, deudas: deudas.length }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET
  const body = await req.json()
  const { tipo } = body

  // ── Cron — delta automático sobre todas las integraciones ──
  if (isCron) {
    if (tipo !== 'delta') return NextResponse.json({ error: 'Cron solo acepta tipo delta' }, { status: 400 })
    const integraciones = await (prisma as any).integracion.findMany({
      where: { tipo: 'uptres', activa: true }
    })
    const resultados = []
    for (const integ of integraciones) {
      const logs: string[] = []
      try {
        const r = await ejecutarDelta(integ, logs, 'cron', undefined, true)
        resultados.push({ empresaId: integ.empresaId, ok: true, ...r })
      } catch (err: any) {
        resultados.push({ empresaId: integ.empresaId, ok: false, error: err.message })
      }
    }
    return NextResponse.json({ ok: true, resultados })
  }

  // ── Sesión ──
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN_VENDEDOR.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const empresaId = getEmpresaId(user)

  const integracion = await (prisma as any).integracion.findFirst({
    where: { empresaId, tipo: 'uptres', activa: true }, orderBy: { updatedAt: 'desc' }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const logs: string[] = []

  try {
    if (tipo === 'delta') {
      const esAdminUser = ROLES_ADMIN.includes(user.role)
      if (!esAdminUser) {
        // Vendedor: solo sus deudas vía /cartera/empleado/{apiId}
        const empleado = await (prisma as any).empleado.findFirst({
          where: { id: user.id, empresaId },
          select: { apiId: true }
        })
        if (!empleado?.apiId) {
          // Sin apiId, no podemos pedir a UpTres por empleado — caer a delta normal
          const r = await ejecutarDelta(integracion, logs, 'manual', user.id)
          return NextResponse.json({ ok: true, logs, ...r })
        }
        const r = await ejecutarDeltaVendedor(integracion, empleado.apiId, logs)
        return NextResponse.json({ ok: true, logs, ...r })
      }
      const r = await ejecutarDelta(integracion, logs, 'manual', undefined)
      return NextResponse.json({ ok: true, logs, ...r })

    } else if (tipo === 'inicial') {
      if (integracion.syncInicial) return NextResponse.json({ error: 'Sync inicial ya ejecutado' }, { status: 400 })
      const config = resolverConfig(integracion.config)
      const adapter = crearAdaptador(integracion.tipo, config)
      await adapter.login()
      const r = await ejecutarInicial(integracion, adapter, empresaId, logs)
      return NextResponse.json({ ok: true, logs, ...r })

    } else {
      return NextResponse.json({ error: 'Tipo no válido. Usar: delta | inicial' }, { status: 400 })
    }
  } catch (err: any) {
    logs.push(`ERROR: ${err.message}`)
    // Intentar guardar error en bitácora
    try {
      const integ = await (prisma as any).integracion.findFirst({ where: { empresaId, tipo: 'uptres', activa: true } })
      if (integ) {
        await (prisma as any).syncLog.create({
          data: {
            integracionId: integ.id,
            inicio: new Date(),
            fin: new Date(),
            duracionMs: 0,
            disparadoPor: tipo === 'inicial' ? 'manual-inicial' : 'manual',
            estado: 'error',
            errores: { message: err.message },
          }
        })
      }
    } catch {}
    return NextResponse.json({ ok: false, error: err.message, logs }, { status: 500 })
  }
}
