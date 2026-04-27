import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { mensaje, historial } = await req.json()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })

  // Contexto completo de la empresa
  const [empresa, empleados, clientes, visitas, rutas, rutasFijas] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, email: true, plan: true } }).catch(() => null),
    prisma.empleado.findMany({ where: { empresaId, activo: true }, select: { nombre: true, rol: true, telefono: true }, take: 50 }).catch(() => []),
    prisma.cliente.findMany({ where: { empresaId }, select: { nombre: true, nombreComercial: true, ciudad: true, telefono: true, metaVenta: true }, take: 100, orderBy: { nombre: 'asc' } }).catch(() => []),
    prisma.visita.findMany({
      where: { empleado: { empresaId } },
      orderBy: { fechaBogota: 'desc' },
      take: 50,
      select: { fechaBogota: true, tipo: true, nota: true, monto: true, cliente: { select: { nombre: true } }, empleado: { select: { nombre: true, rol: true } } }
    }).catch(() => []),
    prisma.ruta.findMany({ where: { empresaId }, orderBy: { fecha: 'desc' }, take: 10, select: { nombre: true, fecha: true, cerrada: true, _count: { select: { clientes: true, empleados: true } } } }).catch(() => []),
    prisma.rutaFija.findMany({ where: { empresaId }, select: { nombre: true, diaSemana: true, _count: { select: { clientes: true, empleados: true } } } }).catch(() => []),
  ])

  // Formatear contexto
  const empleadosPorRol = empleados.reduce((acc: any, e: any) => {
    acc[e.rol] = (acc[e.rol] || 0) + 1
    return acc
  }, {})

  const visitasPorTipo = visitas.reduce((acc: any, v: any) => {
    acc[v.tipo] = (acc[v.tipo] || 0) + 1
    return acc
  }, {})

  const totalVentasRecientes = visitas.filter((v:any) => v.tipo === 'venta').reduce((acc:number, v:any) => acc + (v.monto || 0), 0)
  const totalCobrosRecientes = visitas.filter((v:any) => v.tipo === 'cobro').reduce((acc:number, v:any) => acc + (v.monto || 0), 0)

  const systemPrompt = `Eres TuAgentX, asistente inteligente del Gestor de Rutas y Ventas. Tienes acceso completo a la información de la empresa y puedes responder preguntas sobre empleados, clientes, visitas y rutas.

EMPRESA: ${empresa?.nombre || 'N/A'} | Plan: ${empresa?.plan || 'N/A'}
ROL DEL USUARIO: ${user.role} | Nombre: ${user.name}

EQUIPO (${empleados.length} activos):
${Object.entries(empleadosPorRol).map(([rol, cant]) => `- ${rol}: ${cant}`).join('\n') || 'Sin empleados'}

EMPLEADOS:
${empleados.map((e: any) => `- ${e.nombre} (${e.rol})`).join('\n') || 'Sin empleados'}

CLIENTES (${clientes.length} registrados):
${clientes.slice(0, 20).map((c: any) => `- ${c.nombre}${c.nombreComercial ? ' / ' + c.nombreComercial : ''} | ${c.ciudad || 'sin ciudad'}`).join('\n') || 'Sin clientes'}

VISITAS RECIENTES (${visitas.length}):
Por tipo: ventas=$${totalVentasRecientes.toLocaleString('es-CO')} | cobros=$${totalCobrosRecientes.toLocaleString('es-CO')}
Distribucion: ${JSON.stringify(visitasPorTipo)}
${visitas.slice(0, 10).map((v: any) => `- ${v.fechaBogota ? new Date(v.fechaBogota).toLocaleDateString('es-CO') : 'sin fecha'} | ${v.cliente?.nombre} | ${v.empleado?.nombre} | ${v.tipo}`).join('\n') || 'Sin visitas'}

RUTAS RECIENTES:
${rutas.map((r: any) => `- ${r.nombre} | ${r.fecha ? new Date(r.fecha).toLocaleDateString('es-CO') : 'sin fecha'} | ${r._count.clientes} clientes | ${r.cerrada ? 'cerrada' : 'abierta'}`).join('\n') || 'Sin rutas'}

RUTAS FIJAS:
${rutasFijas.map((r: any) => `- ${r.nombre} | Día: ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][r.diaSemana] || r.diaSemana} | ${r._count.clientes} clientes`).join('\n') || 'Sin rutas fijas'}

Responde SIEMPRE en JSON con este formato exacto:
{
  "respuesta": "Tu mensaje al usuario (texto amigable, max 200 palabras)"
}
No incluyas nada fuera del JSON. No uses acciones ni herramientas.
Reglas:
- Usa los datos del contexto para responder directamente
- Tono profesional y amigable
- Sé CONCISO y DIRECTO: responde exactamente lo que se pregunta, sin agregar contexto ni información extra no solicitada
- Máximo 2-3 líneas salvo que pidan un listado o detalle extenso
- Si no tienes el dato exacto, usa lo que tienes disponible
- Responde en español`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [
    ...(historial || []).map((m: { rol: string; texto: string }) => ({
      role: (m.rol === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.texto,
    })),
    { role: 'user', content: mensaje },
  ]

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    })
    const raw = (response.content[0] as Anthropic.TextBlock).text
    console.log('ASISTENTE RAW:', raw.substring(0, 200))
    console.log('ASISTENTE RAW:', raw.substring(0, 200))
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(match ? match[0] : raw)
      // Guardar en BD
      try {
        const hace5dias = new Date()
        hace5dias.setDate(hace5dias.getDate() - 5)
        await prisma.asistenteChat.deleteMany({ where: { empresaId, creadoEn: { lt: hace5dias } } })
        await prisma.asistenteChat.createMany({
          data: [
            { id: crypto.randomUUID(), empresaId, rol: 'user', texto: mensaje },
            { id: crypto.randomUUID(), empresaId, rol: 'bot', texto: parsed.respuesta },
          ]
        })
      } catch(e: any) { console.log('Error guardando:', e.message) }
      // Guardar en BD
      try {
        const hace5dias = new Date()
        hace5dias.setDate(hace5dias.getDate() - 5)
        await prisma.asistenteChat.deleteMany({ where: { empresaId, creadoEn: { lt: hace5dias } } })
        await prisma.asistenteChat.createMany({
          data: [
            { id: crypto.randomUUID(), empresaId, rol: 'user', texto: mensaje },
            { id: crypto.randomUUID(), empresaId, rol: 'bot', texto: parsed.respuesta },
          ]
        })
      } catch(e: any) { console.log('Error guardando:', e.message) }
      // Guardar en BD
      try {
        const hace5dias = new Date()
        hace5dias.setDate(hace5dias.getDate() - 5)
        await prisma.asistenteChat.deleteMany({ where: { empresaId, creadoEn: { lt: hace5dias } } })
        await prisma.asistenteChat.createMany({
          data: [
            { id: crypto.randomUUID(), empresaId, rol: 'user', texto: mensaje },
            { id: crypto.randomUUID(), empresaId, rol: 'bot', texto: parsed.respuesta },
          ]
        })
      } catch(e: any) { console.log('Error guardando:', e.message) }
      return NextResponse.json({ respuesta: parsed.respuesta })
    } catch {
      return NextResponse.json({ respuesta: raw })
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Error al conectar: ' + err.message }, { status: 500 })
  }
}
