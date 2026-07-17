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
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const rol = user.role
  const empresaId = getEmpresaId(user)
  const empleadoId = user.empleadoId ?? null
  const empleadoNombre = user.name ?? ''

  // Roles permitidos
  if (!['empresa', 'supervisor', 'vendedor'].includes(rol))
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { mensaje, historial } = await req.json()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })

  const ahoraBogota = fechaBogota()
  const hoy = new Date(Date.now() - 5*60*60*1000)
  const fechaHoyStr = hoy.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).split(' ')[0]
  const inicioDia = new Date(fechaHoyStr + 'T05:00:00.000Z')
  const inicioMes = new Date(fechaHoyStr.slice(0,7) + '-01T05:00:00.000Z')
  const msgLower   = mensaje.toLowerCase()

  // ── Intenciones ──
  const esEquipo    = /empleado|turno|vendedor|equipo|quien|activo|pausa/i.test(msgLower)
  const esClientes  = /cliente|ciudad|lista|base/i.test(msgLower)
  const esActividad = /visita|hoy|venta|cobro|actividad|día|hizo/i.test(msgLower)
  const esMes       = /mes|mensual|semana|período|rendimiento|ranking/i.test(msgLower)
  const esRutas     = /ruta|recorrido|zona/i.test(msgLower)
  const esCartera   = /cartera|deuda|saldo|cobrar|pendiente|mora|factura/i.test(msgLower)
  const esBodega    = /bodega|orden|despacho|pedido/i.test(msgLower)
  const esGeneral   = !esEquipo && !esClientes && !esActividad && !esMes && !esRutas && !esCartera && !esBodega

  // ══════════════════════════════════════════════════════════
  // ROL: VENDEDOR — solo lo suyo
  // ══════════════════════════════════════════════════════════
  if (rol === 'vendedor') {
    const [visitasHoyV, visitasMesV, carteraV, clientesV] = await Promise.all([
      prisma.visita.findMany({
        where: { empleadoId, fechaBogota: { gte: inicioDia } },
        select: { tipo: true, monto: true, cliente: { select: { nombre: true, ciudad: true } } },
      }).catch(() => []),
      prisma.visita.findMany({
        where: { empleadoId, fechaBogota: { gte: inicioMes } },
        select: { tipo: true, monto: true },
      }).catch(() => []),
      (prisma as any).carteraCache.findMany({
        where: { empresaId, empleadoNombre },
        select: { clienteNombre: true, saldoPendiente: true },
        orderBy: { saldoPendiente: 'desc' },
        take: 20,
      }).catch(() => []),
      prisma.cliente.findMany({
        where: { empresaId },
        select: { nombre: true, ciudad: true },
        take: 50,
      }).catch(() => []),
    ])

    const ventasHoy  = visitasHoyV.filter((v:any) => v.tipo === 'venta')
    const cobrosHoy  = visitasHoyV.filter((v:any) => v.tipo === 'cobro')
    const ventasMes  = visitasMesV.filter((v:any) => v.tipo === 'venta')
    const cobrosMes  = visitasMesV.filter((v:any) => v.tipo === 'cobro')
    const totalCartera = carteraV.reduce((s:number,c:any) => s + Number(c.saldoPendiente||0), 0)

    const systemPrompt = `Eres TaXBot, asistente personal de ${empleadoNombre} en ${(await prisma.empresa.findUnique({ where:{id:empresaId}, select:{nombre:true} }))?.nombre ?? ''}.
Fecha Bogotá: ${ahoraBogota}. Rol: vendedor.

━━ TU ACTIVIDAD HOY ━━
Visitas: ${visitasHoyV.length} | Ventas: ${ventasHoy.length} (${fmt(ventasHoy.reduce((s:number,v:any)=>s+Number(v.monto||0),0))}) | Cobros: ${cobrosHoy.length} (${fmt(cobrosHoy.reduce((s:number,v:any)=>s+Number(v.monto||0),0))})
Clientes visitados: ${visitasHoyV.map((v:any)=>v.cliente?.nombre).filter(Boolean).join(', ')||'Ninguno'}

━━ TU MES ━━
Ventas: ${ventasMes.length} (${fmt(ventasMes.reduce((s:number,v:any)=>s+Number(v.monto||0),0))}) | Cobros: ${cobrosMes.length} (${fmt(cobrosMes.reduce((s:number,v:any)=>s+Number(v.monto||0),0))})

━━ TU CARTERA (${carteraV.length} clientes · ${fmt(totalCartera)} pendiente) ━━
${carteraV.slice(0,10).map((c:any)=>`  ${c.clienteNombre}: ${fmt(Number(c.saldoPendiente||0))}`).join('\n')||'Sin cartera'}

━━ TUS CLIENTES (${clientesV.length}) ━━
${clientesV.slice(0,15).map((c:any)=>`${c.nombre}${c.ciudad?` (${c.ciudad})`:''}`) .join(', ')||'Sin clientes'}

━━ INSTRUCCIONES ━━
Responde en JSON: { "respuesta": "texto" }
Solo habla de los datos de ${empleadoNombre}. NUNCA menciones otros vendedores ni datos globales.
Español, tono amigable y directo. Máximo 120 palabras.`

    return await llamarClaude(systemPrompt, historial, mensaje, empresaId, empleadoId)
  }

  // ══════════════════════════════════════════════════════════
  // ROL: SUPERVISOR — su zona
  // ══════════════════════════════════════════════════════════
  if (rol === 'supervisor') {
    // Obtener empleados de su lista
    // Obtener listas del supervisor
    const listasSuper = await prisma.empleadoLista.findMany({
      where: { empleadoId: empleadoId! },
      select: { listaId: true },
    }).catch(() => [])
    const listaIds = listasSuper.map((l:any) => l.listaId)

    // Empleados en esas listas
    const empleadosEnListas = listaIds.length > 0
      ? await prisma.empleadoLista.findMany({
          where: { listaId: { in: listaIds } },
          select: { empleadoId: true },
        }).catch(() => [])
      : []
    const idsZonaInit = [...new Set((empleadosEnListas as any[]).map((e:any) => e.empleadoId))]

    const [empleadosZona, visitasHoyZ, visitasMesZ] = await Promise.all([
      prisma.empleado.findMany({
        where: { empresaId, activo: true, id: { in: idsZonaInit.length ? idsZonaInit : ['x'] } },
        select: { id: true, nombre: true, rol: true },
      }).catch(() => []),
      prisma.visita.findMany({
        where: { empleadoId: { in: idsZonaInit.length ? idsZonaInit : ['x'] }, fechaBogota: { gte: inicioDia } },
        select: { tipo: true, monto: true, empleado: { select: { nombre: true } }, cliente: { select: { nombre: true } } },
      }).catch(() => []),
      prisma.visita.findMany({
        where: { empleadoId: { in: idsZonaInit.length ? idsZonaInit : ['x'] }, fechaBogota: { gte: inicioMes } },
        select: { tipo: true, monto: true, empleado: { select: { nombre: true } } },
      }).catch(() => []),
    ])

    const idsZona = (empleadosZona as any[]).map((e:any) => e.id)
    const carteraZona = await (prisma as any).carteraCache.findMany({
      where: { empresaId, empleadoId: { in: idsZona.length ? idsZona : ['x'] } },
      select: { clienteNombre: true, saldoPendiente: true, empleadoNombre: true },
      orderBy: { saldoPendiente: 'desc' },
      take: 20,
    }).catch(() => [])

    // Agregar por empleado
    const empHoyZ: Record<string, any> = {}
    for (const v of visitasHoyZ as any[]) {
      const n = v.empleado?.nombre || '?'
      if (!empHoyZ[n]) empHoyZ[n] = { ventas: 0, cobros: 0, mV: 0, mC: 0 }
      if (v.tipo === 'venta') { empHoyZ[n].ventas++; empHoyZ[n].mV += Number(v.monto||0) }
      if (v.tipo === 'cobro') { empHoyZ[n].cobros++; empHoyZ[n].mC += Number(v.monto||0) }
    }
    const empMesZ: Record<string, any> = {}
    for (const v of visitasMesZ as any[]) {
      const n = v.empleado?.nombre || '?'
      if (!empMesZ[n]) empMesZ[n] = { mV: 0, mC: 0 }
      if (v.tipo === 'venta') empMesZ[n].mV += Number(v.monto||0)
      if (v.tipo === 'cobro') empMesZ[n].mC += Number(v.monto||0)
    }

    const totalCarteraZ = carteraZona.reduce((s:number,c:any) => s+Number(c.saldoPendiente||0), 0)

    const systemPrompt = `Eres TaXBot, asistente de ${empleadoNombre} (supervisor) en el Gestor.
Fecha Bogotá: ${ahoraBogota}. Solo ves tu zona.

━━ TU EQUIPO (${empleadosZona.length} activos) ━━
${(empleadosZona as any[]).map((e:any)=>`  ${e.nombre} — ${e.rol}`).join('\n')||'Sin equipo'}

━━ ACTIVIDAD HOY ━━
${Object.entries(empHoyZ).map(([n,s]:any)=>`  ${n}: ${s.ventas}v(${fmt(s.mV)}) ${s.cobros}c(${fmt(s.mC)})`).join('\n')||'Sin actividad'}

━━ MES ━━
${Object.entries(empMesZ).map(([n,s]:any)=>`  ${n}: ventas ${fmt(s.mV)} | cobros ${fmt(s.mC)}`).join('\n')||'Sin datos'}

━━ CARTERA ZONA (${fmt(totalCarteraZ)} pendiente) ━━
${(carteraZona as any[]).slice(0,10).map((c:any)=>`  ${c.clienteNombre}(${c.empleadoNombre}): ${fmt(Number(c.saldoPendiente||0))}`).join('\n')||'Sin cartera'}

━━ INSTRUCCIONES ━━
Responde en JSON: { "respuesta": "texto" }
Solo datos de tu zona. NUNCA datos globales de la empresa.
Español, tono profesional. Máximo 150 palabras.`

    return await llamarClaude(systemPrompt, historial, mensaje, empresaId, empleadoId)
  }

  // ══════════════════════════════════════════════════════════
  // ROL: EMPRESA — todo (lógica original)
  // ══════════════════════════════════════════════════════════
  const [
    empresa, empleados, totalClientes, clientesPorCiudad, clientesPorLista,
    visitasHoy, visitasMes, rutas, rutasFijas, turnosActivos,
    carteraResumen, carteraPorEmpleado, ventasPorMes, topDeudores, ordenesHoy,
  ] = await Promise.all([
    prisma.empresa.findUnique({ where:{id:empresaId}, select:{nombre:true,plan:true,ciudadEntregaLocal:true} }).catch(()=>null),
    prisma.empleado.findMany({ where:{empresaId,activo:true}, select:{nombre:true,rol:true}, orderBy:{nombre:'asc'} }).catch(()=>[]),
    prisma.cliente.count({ where:{empresaId} }).catch(()=>0),
    prisma.cliente.groupBy({ by:['ciudad'], where:{empresaId}, _count:{id:true}, orderBy:{_count:{id:'desc'}}, take:20 }).catch(()=>[]),
    (prisma as any).listaClientes.findMany({ where:{empresaId}, select:{nombre:true,_count:{select:{clientes:true}}}, orderBy:{nombre:'asc'} }).catch(()=>[]),
    prisma.visita.findMany({ where:{empleado:{empresaId},fechaBogota:{gte:inicioDia}}, select:{tipo:true,monto:true,empleado:{select:{nombre:true}},cliente:{select:{nombre:true,ciudad:true}}} }).catch(()=>[]),
    prisma.visita.findMany({ where:{empleado:{empresaId},fechaBogota:{gte:inicioMes}}, select:{tipo:true,monto:true,empleado:{select:{nombre:true}}} }).catch(()=>[]),
    prisma.ruta.findMany({ where:{empresaId}, orderBy:{fecha:'desc'}, take:10, select:{nombre:true,fecha:true,cerrada:true,_count:{select:{clientes:true,empleados:true}},empleados:{select:{empleado:{select:{nombre:true}}},take:5}} }).catch(()=>[]),
    prisma.rutaFija.findMany({ where:{empresaId}, select:{nombre:true,diaSemana:true,_count:{select:{clientes:true,empleados:true}}} }).catch(()=>[]),
    prisma.turno.findMany({ where:{empleado:{empresaId},fin:null,inicio:{gte:new Date(Date.now()-24*60*60*1000)}}, select:{empleado:{select:{nombre:true,rol:true}},inicio:true,pausado:true} }).catch(()=>[]),
    (prisma as any).carteraCache.aggregate({ where:{empresaId}, _count:{id:true}, _sum:{saldoPendiente:true} }).catch(()=>({_count:{id:0},_sum:{saldoPendiente:0}})),
    (prisma as any).carteraCache.groupBy({ by:['empleadoNombre'], where:{empresaId}, _count:{id:true}, _sum:{saldoPendiente:true}, orderBy:{_sum:{saldoPendiente:'desc'}}, take:10 }).catch(()=>[]),
    (prisma as any).ventaMesCliente.groupBy({ by:['mes'], where:{empresaId,mes:{gte:new Date(new Date().setMonth(new Date().getMonth()-3)).toISOString().slice(0,7)}}, _sum:{totalVenta:true}, orderBy:{mes:'desc'} }).catch(()=>[]),
    (prisma as any).carteraCache.findMany({ where:{empresaId,saldoPendiente:{gt:0}}, select:{clienteNombre:true,saldoPendiente:true,empleadoNombre:true}, orderBy:{saldoPendiente:'desc'}, take:5 }).catch(()=>[]),
    (prisma as any).ordenDespacho.groupBy({ by:['estado'], where:{empresaId,createdAt:{gte:inicioDia}}, _count:{id:true} }).catch(()=>[]),
  ])

  const empHoy: Record<string,any> = {}
  for (const v of visitasHoy as any[]) {
    const n = v.empleado?.nombre||'?'
    if (!empHoy[n]) empHoy[n] = { visitas:0,ventas:0,cobros:0,mV:0,mC:0 }
    empHoy[n].visitas++
    if (v.tipo==='venta') { empHoy[n].ventas++; empHoy[n].mV+=Number(v.monto||0) }
    if (v.tipo==='cobro') { empHoy[n].cobros++; empHoy[n].mC+=Number(v.monto||0) }
  }
  const empMes: Record<string,any> = {}
  for (const v of visitasMes as any[]) {
    const n = v.empleado?.nombre||'?'
    if (!empMes[n]) empMes[n] = { mV:0, mC:0 }
    if (v.tipo==='venta') empMes[n].mV+=Number(v.monto||0)
    if (v.tipo==='cobro') empMes[n].mC+=Number(v.monto||0)
  }
  const tVH = (visitasHoy as any[]).filter(v=>v.tipo==='venta').reduce((s:number,v:any)=>s+Number(v.monto||0),0)
  const tCH = (visitasHoy as any[]).filter(v=>v.tipo==='cobro').reduce((s:number,v:any)=>s+Number(v.monto||0),0)
  const tVM = (visitasMes as any[]).filter(v=>v.tipo==='venta').reduce((s:number,v:any)=>s+Number(v.monto||0),0)
  const tCM = (visitasMes as any[]).filter(v=>v.tipo==='cobro').reduce((s:number,v:any)=>s+Number(v.monto||0),0)
  const ordStats: Record<string,number> = {}
  for (const o of ordenesHoy as any[]) ordStats[o.estado] = o._count.id
  const empRol: Record<string,number> = {}
  for (const e of empleados as any[]) empRol[e.rol] = (empRol[e.rol]||0)+1

  const bloqueBase = `Eres TaXBot, asistente del Gestor de ${empresa?.nombre||'N/A'}.
Datos REALES de la BD. NUNCA inventes. Fecha Bogotá: ${ahoraBogota}
Usuario: empresa — ${user.name}`

  const bloques = [bloqueBase]
  if (esEquipo||esGeneral) bloques.push(`
━━ EQUIPO (${(empleados as any[]).length} activos) ━━
${Object.entries(empRol).map(([r,n])=>`${r}:${n}`).join(' | ')}
${(empleados as any[]).map((e:any)=>`  ${e.nombre} — ${e.rol}`).join('\n')}
En turno: ${(turnosActivos as any[]).map((t:any)=>`${t.empleado.nombre}${t.pausado?' [PAUSA]':''}`).join(', ')||'nadie'}`)

  if (esClientes||esGeneral) bloques.push(`
━━ CLIENTES (${totalClientes}) ━━
Ciudades: ${(clientesPorCiudad as any[]).slice(0,10).map((c:any)=>`${c.ciudad||'?'}:${c._count.id}`).join(', ')}
Listas: ${(clientesPorLista as any[]).map((l:any)=>`${l.nombre}:${l._count.clientes}`).join(', ')||'ninguna'}`)

  if (esActividad||esGeneral) bloques.push(`
━━ HOY (${fechaHoyStr}) ━━
Ventas:${fmt(tVH)} | Cobros:${fmt(tCH)}
${Object.entries(empHoy).map(([n,s]:any)=>`  ${n}: ${s.visitas}v ventas:${fmt(s.mV)} cobros:${fmt(s.mC)}`).join('\n')||'Sin actividad'}`)

  if (esMes||esGeneral) bloques.push(`
━━ MES ━━
Ventas:${fmt(tVM)} | Cobros:${fmt(tCM)}
${Object.entries(empMes).map(([n,s]:any)=>`  ${n}: ventas ${fmt(s.mV)} cobros ${fmt(s.mC)}`).join('\n')||'Sin datos'}
ERP: ${(ventasPorMes as any[]).map((v:any)=>`${v.mes}:${fmt(Number(v._sum.totalVenta||0))}`).join(' ')||'Sin datos'}`)

  if (esRutas||esGeneral) bloques.push(`
━━ RUTAS ━━
${(rutas as any[]).map((r:any)=>`${r.nombre}|${r._count.clientes}cli|${r.cerrada?'CERRADA':'ACTIVA'}`).join(' / ')||'ninguna'}
Fijas: ${(rutasFijas as any[]).map((r:any)=>`${r.nombre}(${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][r.diaSemana]})`).join(', ')||'ninguna'}`)

  if (esCartera||esGeneral) bloques.push(`
━━ CARTERA ━━
Total: ${(carteraResumen as any)._count?.id||0} clientes | ${fmt(Number((carteraResumen as any)._sum?.saldoPendiente||0))}
Por vendedor: ${(carteraPorEmpleado as any[]).map((e:any)=>`${e.empleadoNombre||'?'}:${fmt(Number(e._sum.saldoPendiente||0))}`).join(' | ')||'sin datos'}
Top deudores: ${(topDeudores as any[]).map((d:any)=>`${d.clienteNombre||'?'}:${fmt(Number(d.saldoPendiente||0))}`).join(' | ')||'ninguno'}`)

  if (esBodega||esGeneral) bloques.push(`
━━ BODEGA HOY ━━
Pendientes:${ordStats['pendiente']||0} | Alistados:${ordStats['alistado']||0} | Entregados:${ordStats['entregado']||0}`)

  const systemPrompt = bloques.join('\n') + `

━━ INSTRUCCIONES ━━
Responde en JSON: { "respuesta": "texto" }
Usa SOLO datos del contexto. Español profesional. Máx 150 palabras.`

  return await llamarClaude(systemPrompt, historial, mensaje, empresaId, empleadoId)
}

// ── Helper Claude ──
async function llamarClaude(
  systemPrompt: string,
  historial: any[],
  mensaje: string,
  empresaId: string,
  empleadoId: string | null,
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [
    ...(historial||[]).slice(-16).map((m:any) => ({
      role: (m.rol==='user'?'user':'assistant') as 'user'|'assistant',
      content: m.texto,
    })),
    { role: 'user', content: mensaje },
  ]
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: systemPrompt,
      messages,
    })
    const raw = (res.content[0] as Anthropic.TextBlock).text
    let respuesta = raw
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      respuesta = JSON.parse(match?match[0]:raw).respuesta ?? raw
    } catch {}

    // Guardar historial
    try {
      const hace5dias = new Date(Date.now()-5*24*60*60*1000)
      await prisma.asistenteChat.deleteMany({ where:{empresaId,creadoEn:{lt:hace5dias}} })
      await prisma.asistenteChat.createMany({
        data: [
          { id: crypto.randomUUID(), empresaId, rol:'user', texto:mensaje },
          { id: crypto.randomUUID(), empresaId, rol:'bot',  texto:respuesta },
        ]
      })
    } catch {}

    return NextResponse.json({ respuesta })
  } catch (err:any) {
    return NextResponse.json({ error:'Error IA: '+err.message }, { status:500 })
  }
}
