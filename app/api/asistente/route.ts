import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import Anthropic from '@anthropic-ai/sdk'

function fechaBogota() {
  return new Date(Date.now() - 5*60*60*1000).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function fechaCorta(d: Date) {
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)
  const { mensaje, historial } = await req.json()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })

  // Fecha actual Bogotá
  const ahoraBogota = fechaBogota()
  const hoy = new Date(Date.now() - 5*60*60*1000)
  const fechaHoyStr = hoy.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).split(' ')[0]
  const inicioDia = new Date(fechaHoyStr + 'T05:00:00.000Z') // 00:00 Bogotá = 05:00 UTC
  const inicioMes = new Date(fechaHoyStr.slice(0, 7) + '-01T05:00:00.000Z') // 00:00 Bogotá

  // ── Queries paralelas con datos AGREGADOS ──────────────────────────────────
  const [
    empresa,
    empleados,
    totalClientes,
    clientesPorCiudad,
    clientesPorLista,
    visitasHoy,
    visitasMes,
    statsPorEmpleadoHoy,
    statsPorEmpleadoMes,
    rutas,
    rutasFijas,
    turnosActivos,
    carteraResumen,
    carteraPorEmpleado,
    ventasPorMes,
    topDeudores,
    ordenesHoy,
  ] = await Promise.all([

    // Empresa
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nombre: true, plan: true, ciudadEntregaLocal: true }
    }).catch(() => null),

    // Empleados activos
    prisma.empleado.findMany({
      where: { empresaId, activo: true },
      select: { nombre: true, rol: true },
      orderBy: { nombre: 'asc' }
    }).catch(() => []),

    // Total clientes
    prisma.cliente.count({ where: { empresaId } }).catch(() => 0),

    // Clientes por ciudad (top 20)
    prisma.cliente.groupBy({
      by: ['ciudad'],
      where: { empresaId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    }).catch(() => []),

    // Clientes por lista
    (prisma as any).listaClientes.findMany({
      where: { empresaId },
      select: { nombre: true, _count: { select: { clientes: true } } },
      orderBy: { nombre: 'asc' }
    }).catch(() => []),

    // Visitas HOY — raw para agregar
    prisma.visita.findMany({
      where: { empleado: { empresaId }, fechaBogota: { gte: inicioDia } },
      select: { tipo: true, monto: true, empleado: { select: { nombre: true } }, cliente: { select: { nombre: true, ciudad: true } } }
    }).catch(() => []),

    // Visitas MES — raw para agregar
    prisma.visita.findMany({
      where: { empleado: { empresaId }, fechaBogota: { gte: inicioMes } },
      select: { tipo: true, monto: true, empleado: { select: { nombre: true } } }
    }).catch(() => []),

    // Stats por empleado HOY via groupBy
    prisma.visita.groupBy({
      by: ['tipo'],
      where: { empleado: { empresaId }, fechaBogota: { gte: inicioDia } },
      _count: { id: true },
      _sum: { monto: true },
    }).catch(() => []),

    // Stats por empleado MES via groupBy
    prisma.visita.groupBy({
      by: ['tipo'],
      where: { empleado: { empresaId }, fechaBogota: { gte: inicioMes } },
      _count: { id: true },
      _sum: { monto: true },
    }).catch(() => []),

    // Rutas recientes
    prisma.ruta.findMany({
      where: { empresaId },
      orderBy: { fecha: 'desc' },
      take: 10,
      select: {
        nombre: true, fecha: true, cerrada: true,
        _count: { select: { clientes: true, empleados: true } },
        empleados: { select: { empleado: { select: { nombre: true } } }, take: 5 }
      }
    }).catch(() => []),

    // Rutas fijas
    prisma.rutaFija.findMany({
      where: { empresaId },
      select: { nombre: true, diaSemana: true, _count: { select: { clientes: true, empleados: true } } }
    }).catch(() => []),

    // Turnos activos ahora (iniciados en las últimas 24h para evitar zombis)
    prisma.turno.findMany({
      where: { empleado: { empresaId }, fin: null, inicio: { gte: new Date(Date.now() - 24*60*60*1000) } },
      select: { empleado: { select: { nombre: true, rol: true } }, inicio: true, pausado: true }
    }).catch(() => []),

    // Cartera resumen
    (prisma as any).carteraCache.aggregate({
      where: { empresaId },
      _count: { id: true },
      _sum: { saldoPendiente: true },
    }).catch(() => ({ _count: { id: 0 }, _sum: { saldoPendiente: 0 } })),

    // Cartera por empleado top 10
    (prisma as any).carteraCache.groupBy({
      by: ['empleadoNombre'],
      where: { empresaId },
      _count: { id: true },
      _sum: { saldoPendiente: true },
      orderBy: { _sum: { saldoPendiente: 'desc' } },
      take: 10,
    }).catch(() => []),

    // Ventas por mes últimos 3 meses (VentaMesCliente)
    (prisma as any).ventaMesCliente.groupBy({
      by: ['mes'],
      where: { empresaId, mes: { gte: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().slice(0, 7) } },
      _sum: { totalVenta: true, cantidadVisitas: true },
      orderBy: { mes: 'desc' },
    }).catch(() => []),

    // Top 5 clientes con mayor deuda
    (prisma as any).carteraCache.findMany({
      where: { empresaId, saldoPendiente: { gt: 0 } },
      select: { clienteNombre: true, saldoPendiente: true, empleadoNombre: true },
      orderBy: { saldoPendiente: 'desc' },
      take: 5,
    }).catch(() => []),

    // Órdenes bodega hoy
    (prisma as any).ordenDespacho.groupBy({
      by: ['estado'],
      where: { empresaId, createdAt: { gte: inicioDia } },
      _count: { id: true },
    }).catch(() => []),
  ])

  // ── Agregaciones en memoria ────────────────────────────────────────────────

  // Stats por empleado HOY
  const empHoy: Record<string, any> = {}
  for (const v of visitasHoy as any[]) {
    const nom = v.empleado?.nombre || 'Sin nombre'
    if (!empHoy[nom]) empHoy[nom] = { visitas: 0, ventas: 0, cobros: 0, montoVentas: 0, montoCobros: 0, clientes: new Set() }
    empHoy[nom].visitas++
    empHoy[nom].clientes.add(v.cliente?.nombre)
    if (v.tipo === 'venta') { empHoy[nom].ventas++; empHoy[nom].montoVentas += Number(v.monto || 0) }
    if (v.tipo === 'cobro') { empHoy[nom].cobros++; empHoy[nom].montoCobros += Number(v.monto || 0) }
  }

  // Stats por empleado MES
  const empMes: Record<string, any> = {}
  for (const v of visitasMes as any[]) {
    const nom = v.empleado?.nombre || 'Sin nombre'
    if (!empMes[nom]) empMes[nom] = { ventas: 0, cobros: 0, montoVentas: 0, montoCobros: 0 }
    if (v.tipo === 'venta') { empMes[nom].ventas++; empMes[nom].montoVentas += Number(v.monto || 0) }
    if (v.tipo === 'cobro') { empMes[nom].cobros++; empMes[nom].montoCobros += Number(v.monto || 0) }
  }

  const totalVentasHoy = visitasHoy.filter((v:any) => v.tipo === 'venta').reduce((a:number,v:any) => a+Number(v.monto||0), 0)
  const totalCobrosHoy = visitasHoy.filter((v:any) => v.tipo === 'cobro').reduce((a:number,v:any) => a+Number(v.monto||0), 0)
  const totalVentasMes = visitasMes.filter((v:any) => v.tipo === 'venta').reduce((a:number,v:any) => a+Number(v.monto||0), 0)
  const totalCobrosMes = visitasMes.filter((v:any) => v.tipo === 'cobro').reduce((a:number,v:any) => a+Number(v.monto||0), 0)

  const ordenesStats: Record<string, number> = {}
  for (const o of ordenesHoy as any[]) ordenesStats[o.estado] = o._count.id

  const empleadosPorRol: Record<string, number> = {}
  for (const e of empleados as any[]) empleadosPorRol[e.rol] = (empleadosPorRol[e.rol] || 0) + 1

  // ── System Prompt con datos REALES agregados ───────────────────────────────
  // ── Detectar intención para contexto selectivo ────────────────────────────
  const msgLower = mensaje.toLowerCase()
  const esEquipo     = /empleado|turno|vendedor|equipo|quien|staff|trabajo|activo|pausa/i.test(msgLower)
  const esClientes   = /cliente|ciudad|lista|registro|base/i.test(msgLower)
  const esActividad  = /visita|hoy|venta|cobro|actividad|día|hizo|realizó|ejecutó/i.test(msgLower)
  const esMes        = /mes|mensual|semana|período|rendimiento|ranking/i.test(msgLower)
  const esRutas      = /ruta|recorrido|itinerario|zona/i.test(msgLower)
  const esCartera    = /cartera|deuda|saldo|cobrar|pendiente|mora|vencid|pago|factura/i.test(msgLower)
  const esBodega     = /bodega|orden|despacho|alistado|entregado|pedido/i.test(msgLower)
  const esGeneral    = !esEquipo && !esClientes && !esActividad && !esMes && !esRutas && !esCartera && !esBodega

  // Bloques de contexto
  const bloqueBase = `Eres TuAgentX, asistente del Gestor de ${empresa?.nombre || 'N/A'}.
Datos REALES de la BD. NUNCA inventes. Fecha Bogotá: ${ahoraBogota}
Usuario: ${user.role} — ${user.name} | Empresa: ${empresa?.nombre || 'N/A'}`

  const bloqueEquipo = `
━━ EQUIPO (${empleados.length} activos) ━━
Roles: ${Object.entries(empleadosPorRol).map(([r,n]) => `${r}:${n}`).join(' | ')}
${(empleados as any[]).map((e:any) => `  ${e.nombre} — ${e.rol}`).join('\n')}

En turno ahora (${turnosActivos.length}):
${(turnosActivos as any[]).map((t:any) => `  ${t.empleado.nombre} (${t.empleado.rol})${t.pausado ? ' [PAUSA]' : ''}`).join('\n') || '  Nadie'}`

  const bloqueClientes = `
━━ CLIENTES (${totalClientes} total) ━━
Por ciudad: ${(clientesPorCiudad as any[]).slice(0,10).map((c:any) => `${c.ciudad||'?'}:${c._count.id}`).join(', ')}
Por lista: ${(clientesPorLista as any[]).map((l:any) => `${l.nombre}:${l._count.clientes}`).join(', ') || 'sin listas'}`

  const bloqueActividad = `
━━ ACTIVIDAD HOY (${fechaHoyStr}) ━━
Total: ${visitasHoy.length} visitas | Ventas: ${fmt(totalVentasHoy)} | Cobros: ${fmt(totalCobrosHoy)}
${Object.entries(empHoy).map(([n,s]:any) =>
  `  ${n}: ${s.visitas}v | ventas:${fmt(s.montoVentas)} | cobros:${fmt(s.montoCobros)}`).join('\n') || '  Sin actividad'}`

  const bloqueMes = `
━━ ACTIVIDAD DEL MES ━━
Total: Ventas ${fmt(totalVentasMes)} | Cobros ${fmt(totalCobrosMes)}
${Object.entries(empMes).map(([n,s]:any) =>
  `  ${n}: ${s.ventas} ventas (${fmt(s.montoVentas)}) | ${s.cobros} cobros (${fmt(s.montoCobros)})`).join('\n') || '  Sin actividad'}

Ventas últimos 3 meses (ERP):
${(ventasPorMes as any[]).map((v:any) => `  ${v.mes}: ${fmt(Number(v._sum.totalVenta||0))}`).join('\n') || '  Sin datos'}`

  const bloqueRutas = `
━━ RUTAS ━━
Recientes: ${(rutas as any[]).map((r:any) => `${r.nombre}|${r._count.clientes}cli|${r.cerrada?'CERRADA':'ACTIVA'}`).join(' / ') || 'ninguna'}
Fijas: ${(rutasFijas as any[]).map((r:any) => `${r.nombre}(${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][r.diaSemana]})`).join(', ') || 'ninguna'}`

  const bloqueCartera = `
━━ CARTERA ━━
Total: ${(carteraResumen as any)._count?.id || 0} clientes | Saldo: ${fmt(Number((carteraResumen as any)._sum?.saldoPendiente || 0))}
Por vendedor: ${(carteraPorEmpleado as any[]).map((e:any) => `${e.empleadoNombre||'?'}:${fmt(Number(e._sum.saldoPendiente||0))}`).join(' | ') || 'sin datos'}
Top deudores: ${(topDeudores as any[]).map((d:any) => `${d.clienteNombre||'?'}:${fmt(Number(d.saldoPendiente||0))}`).join(' | ') || 'ninguno'}`

  const bloqueBodega = `
━━ BODEGA HOY ━━
Pendientes: ${ordenesStats['pendiente']||0} | Alistados: ${ordenesStats['alistado']||0} | Entregados: ${ordenesStats['entregado']||0}`

  // Armar contexto solo con bloques relevantes
  const bloques: string[] = [bloqueBase]
  if (esEquipo || esGeneral)   bloques.push(bloqueEquipo)
  if (esClientes || esGeneral) bloques.push(bloqueClientes)
  if (esActividad || esGeneral) bloques.push(bloqueActividad)
  if (esMes || esGeneral)      bloques.push(bloqueMes)
  if (esRutas || esGeneral)    bloques.push(bloqueRutas)
  if (esCartera || esGeneral)  bloques.push(bloqueCartera)
  if (esBodega || esGeneral)   bloques.push(bloqueBodega)

  const systemPrompt = bloques.join('\n') + `

━━ INSTRUCCIONES ━━
Responde SIEMPRE en JSON exacto: { "respuesta": "texto" }
- Usa SOLO los datos del contexto, nunca inventes
- Fecha/hora del contexto, no de tu entrenamiento  
- Español, tono profesional y directo
- Máximo 150 palabras salvo que pidan listado`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages: Anthropic.MessageParam[] = [
    ...(historial || []).slice(-20).map((m: { rol: string; texto: string }) => ({
      role: (m.rol === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.texto,
    })),
    { role: 'user', content: mensaje },
  ]

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const raw = (response.content[0] as Anthropic.TextBlock).text
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(match ? match[0] : raw)

      // Guardar historial (5 días de retención)
      try {
        const hace5dias = new Date(Date.now() - 5*60*60*1000)
        hace5dias.setDate(hace5dias.getDate() - 5)
        await prisma.asistenteChat.deleteMany({ where: { empresaId, creadoEn: { lt: hace5dias } } })
        await prisma.asistenteChat.createMany({
          data: [
            { id: crypto.randomUUID(), empresaId, rol: 'user', texto: mensaje },
            { id: crypto.randomUUID(), empresaId, rol: 'bot', texto: parsed.respuesta },
          ]
        })
      } catch(_e: any) {}

      return NextResponse.json({ respuesta: parsed.respuesta })
    } catch {
      return NextResponse.json({ respuesta: raw })
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al conectar: ' + err.message }, { status: 500 })
  }
}
