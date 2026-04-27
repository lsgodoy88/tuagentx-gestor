import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UpTresAdapter } from '@/lib/integracion/adapters/uptres'
import { sincronizarDeudas, actualizarCache } from '@/lib/integracion/sync'

const UPTRES_URL = 'https://www.uptres.top'

async function runDelta(integracion: any): Promise<{ deudas: number; clientes: number }> {
  const config = integracion.config as any
  const adapter = new UpTresAdapter(config.token)
  const desde = integracion.ultimaSync ?? undefined
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
    where: { empresaId, tipo: 'uptres', activa: true }
  })
  if (!integracion) return NextResponse.json({ error: 'Sin integración activa' }, { status: 400 })

  const config = integracion.config as any
  const adapter = new UpTresAdapter(config.token)

  const logs: string[] = []
  let clientesActualizados = 0
  let deudasInsertadas = 0
  let comprasInsertadas = 0

  try {
    if (tipo === 'delta') {
      const desde = integracion.ultimaSync ?? undefined
      const desdeDate = desde ? new Date(desde) : null
      logs.push(`Delta sync desde: ${desde ?? 'inicio'}`)
      // 1. Clientes modificados
      const clientesExt = await adapter.fetchClientes()
      const clientesFiltrados = desdeDate
        ? clientesExt.filter((c: any) => c.fModificado && new Date(c.fModificado) > desdeDate)
        : clientesExt
      for (const c of clientesFiltrados) {
        const doc = (c as any).doc?.trim()
        const uid = (c as any).uid?.trim() || (c as any)._id?.trim()
        if (!doc || !uid) continue
        await (prisma as any).cliente.updateMany({
          where: { nit: doc, empresaId },
          data: { apiId: uid }
        })
        clientesActualizados++
      }
      logs.push(`Clientes delta: ${clientesActualizados}`)
      // 2. Empleados modificados
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
      // 3. Deudas modificadas
      const deudas = await adapter.fetchDeudas(desde)
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
      // ── 1. Clientes — actualizar apiId por nit=doc ──
      logs.push('Sincronizando clientes...')
      const clientes = await adapter.fetchClientes()
      for (const c of clientes) {
        const doc = (c.doc as string)?.trim()
        const uid = ((c._id as string) || (c.uid as string))?.trim()
        if (!doc || !uid) continue
        const updated = await (prisma as any).cliente.updateMany({
          where: { nit: doc, empresaId, apiId: null },
          data: { apiId: uid }
        })
        if (updated.count > 0) clientesActualizados++
      }
      logs.push(`Clientes actualizados: ${clientesActualizados}`)

      // ── 2. Deudas — todas con vSaldo > 0 ──
      logs.push('Sincronizando deudas...')
      const deudas = await adapter.fetchDeudas()
      await sincronizarDeudas(deudas, integracion.id, empresaId)
      deudasInsertadas = deudas.length
      logs.push(`Deudas sincronizadas: ${deudasInsertadas}`)

      // ── 3. Compras impulso — clientes en rutas fijas ──
      logs.push('Sincronizando compras impulso...')
      const ahora = new Date()
      const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString()
      const clientesRuta = await (prisma as any).cliente.findMany({
        where: { apiId: { not: null }, empresaId, rutasFijas: { some: {} } },
        select: { id: true, apiId: true, nit: true }
      })
      logs.push(`Clientes en rutas fijas: ${clientesRuta.length}`)
      const rawToken = adapter.getToken()
      for (const c of clientesRuta) {
        let pag = 0
        while (true) {
          const res = await fetch(
            `${UPTRES_URL}/ordenventa?desde=0&page=${pag}&size=50&sort=numeroOrden&order=desc&search=${encodeURIComponent(c.nit || '')}&tipobusqueda=todos`,
            { headers: { 'x-token': rawToken } }
          )
          const d = await res.json()
          if (!d.ok) break
          const ordenes = d.dataDBArray || []
          if (!ordenes.length) break
          let salir = false
          for (const o of ordenes) {
            if (o.fCreado < inicioMesAnterior) { salir = true; break }
            const externalId = o.uid || o._id
            await (prisma as any).syncCompra.upsert({
              where: { integracionId_externalId: { integracionId: integracion.id, externalId } },
              create: {
                id: `sc-${externalId}`,
                integracionId: integracion.id,
                externalId,
                clienteApiId: o.cliente?.uid || c.apiId,
                empleadoExternalId: o.empleado?.uid || null,
                numeroOrden: o.numeroOrden || 0,
                numeroFactura: o.numeroFacturado || 0,
                valor: parseFloat(o.vTotal || 0),
                saldo: parseFloat(o.vSaldo || 0),
                abono: parseFloat(o.vAbono || 0),
                tipo: o.tipo || 'contado',
                diasCredito: parseInt(o.dias || 0),
                facturado: o.facturado || false,
                fecha: o.fCreado ? new Date(o.fCreado) : null,
                condition: o.condition ?? true,
                modificadoEn: o.fModificado ? new Date(o.fModificado) : null,
                data: o,
              },
              update: { saldo: parseFloat(o.vSaldo || 0), modificadoEn: o.fModificado ? new Date(o.fModificado) : null }
            })
            comprasInsertadas++
          }
          const lastPage = d.pagination?.lastPage ?? 0
          if (salir || pag >= lastPage) break
          pag++
        }
      }
      logs.push(`Compras impulso: ${comprasInsertadas}`)

      await (prisma as any).integracion.update({
        where: { id: integracion.id },
        data: { syncInicial: true, ultimaSync: ahora, updatedAt: ahora }
      })
    }

    return NextResponse.json({ ok: true, logs, clientesActualizados, deudasInsertadas, comprasInsertadas })
  } catch (err: any) {
    logs.push(`ERROR: ${err.message}`)
    return NextResponse.json({ ok: false, error: err.message, logs }, { status: 500 })
  }
}
