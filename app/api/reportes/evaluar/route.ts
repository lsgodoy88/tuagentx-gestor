import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'supervisor', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const { tipo, empleado, datos, equipo, mes, anio } = await req.json()

    let prompt = ''
    if (tipo === 'vendedor') {
      const cartera = Math.max(0, datos.ventas - datos.recaudos)
      const carteraPct = datos.ventas > 0 ? Math.round(cartera / datos.ventas * 100) : 0
      const recaudoPct = datos.ventas > 0 ? Math.round(datos.recaudos / datos.ventas * 100) : 0
      const gastoPctV = datos.ventas > 0 ? Math.round(datos.gastos / datos.ventas * 100) : 0
      const gastoPctR = datos.recaudos > 0 ? Math.round(datos.gastos / datos.recaudos * 100) : 0
      const metaVentaPct = datos.metaVenta > 0 ? Math.round(datos.ventas / datos.metaVenta * 100) : null
      const promedioVentas = equipo?.length > 0 ? equipo.reduce((s: number, e: any) => s + e.ventas, 0) / equipo.length : 0
      prompt = `Analiza al vendedor "${empleado}" mes ${mes}/${anio}:
- Ventas: $${datos.ventas.toLocaleString('es-CO')}${metaVentaPct !== null ? ` (${metaVentaPct}% de meta)` : ''}
- Recaudos: $${datos.recaudos.toLocaleString('es-CO')} (${recaudoPct}% de ventas)
- Cartera sin cobrar: $${cartera.toLocaleString('es-CO')} (${carteraPct}%)
- Gastos: $${datos.gastos.toLocaleString('es-CO')} (${gastoPctV}% ventas / ${gastoPctR}% recaudos)
- Promedio ventas equipo: $${Math.round(promedioVentas).toLocaleString('es-CO')}
Máximo 50 palabras. Español colombiano, sin saludos. Evalúa venta vs recaudo vs gasto. Destaca lo positivo y lo que debe mejorar.`

    } else if (tipo === 'empresa') {
      const carteraPct = datos.ventas > 0 ? Math.round((datos.ventas - datos.recaudos) / datos.ventas * 100) : 0
      const gastoPct = datos.ventas > 0 ? Math.round(datos.gastos / datos.ventas * 100) : 0
      const recaudoPct = datos.ventas > 0 ? Math.round(datos.recaudos / datos.ventas * 100) : 0
      prompt = `Analiza la empresa mes ${mes}/${anio}:
- Ventas: $${datos.ventas.toLocaleString('es-CO')}
- Recaudos: $${datos.recaudos.toLocaleString('es-CO')} (${recaudoPct}% cobrado)
- Cartera sin cobrar: ${carteraPct}%
- Gastos empleados: $${datos.gastos.toLocaleString('es-CO')} (${gastoPct}% sobre ventas)
- Ventas impulsos: $${datos.ventasI.toLocaleString('es-CO')}
- Gastos impulsos: $${datos.gastosI.toLocaleString('es-CO')}
Máximo 50 palabras. Español colombiano, sin saludos. Evalúa salud financiera, cartera, gastos vs ingresos y da una recomendación.`

    } else if (tipo === 'impulsadora') {
      const gastoPct = datos.ventas > 0 ? Math.round(datos.gastos / datos.ventas * 100) : 0
      const metaPct = datos.meta > 0 ? Math.round(datos.ventas / datos.meta * 100) : 0
      const promedioVisitas = equipo?.length > 0 ? equipo.reduce((s: number, e: any) => s + e.visitas, 0) / equipo.length : 0
      prompt = `Analiza a la impulsadora "${empleado}" mes ${mes}/${anio}:
- Ventas: $${datos.ventas.toLocaleString('es-CO')} (${metaPct}% de meta $${datos.meta.toLocaleString('es-CO')})
- Gastos: $${datos.gastos.toLocaleString('es-CO')} (${gastoPct}% sobre ventas)
- Visitas: ${datos.visitas} (promedio equipo: ${Math.round(promedioVisitas)})
Máximo 50 palabras. Español colombiano, sin saludos. Evalúa cumplimiento de meta, gastos vs ventas y visitas.`
    } else if (tipo === 'equipo_vendedor') {
      const resumen = (equipo || []).map((e: any) => {
        const n = `${e.nombre?.split(' ')[0]} ${e.nombre?.split(' ')[2] || ''}`.trim()
        const pctVenta = e.metaVenta > 0 ? Math.round(e.ventas / e.metaVenta * 100) : null
        const pctRecaudo = e.metaRecaudo > 0 ? Math.round(e.recaudos / e.metaRecaudo * 100) : null
        const pctGasto = e.recaudos > 0 ? Math.round(e.gastos / e.recaudos * 100) : null
        return `${n}: ventas $${Math.round(e.ventas/1000)}k${pctVenta !== null ? ` (${pctVenta}% meta venta $${Math.round(e.metaVenta/1000)}k)` : ''} | recaudo $${Math.round(e.recaudos/1000)}k${pctRecaudo !== null ? ` (${pctRecaudo}% meta recaudo $${Math.round(e.metaRecaudo/1000)}k)` : ''} | gasto $${Math.round(e.gastos/1000)}k${pctGasto !== null ? ` (${pctGasto}% s/recaudo)` : ''}`
      }).join(' || ')
      prompt = `Datos equipo vendedores ${mes}/${anio}: ${resumen}. Máximo 40 palabras. Español colombiano, tono profesional. Con base en ventas vs meta, recaudo vs meta y gasto vs recaudo, nombra únicamente al de mayor rendimiento y al de menor rendimiento con sus cifras clave.`
    } else if (tipo === 'equipo_impulsadora') {
      const resumen = (equipo || []).map((e: any) => {
        const n = `${e.nombre?.split(' ')[0]} ${e.nombre?.split(' ')[2] || ''}`.trim()
        const pctMeta = e.meta > 0 ? Math.round(e.ventas / e.meta * 100) : null
        const pctGasto = e.ventas > 0 ? Math.round(e.gastos / e.ventas * 100) : null
        return `${n}: ventas $${Math.round(e.ventas/1000)}k${pctMeta !== null ? ` (${pctMeta}% meta $${Math.round(e.meta/1000)}k)` : ''} | gasto $${Math.round(e.gastos/1000)}k${pctGasto !== null ? ` (${pctGasto}% s/ventas)` : ''} | clientes ${e.clientesRuta || 0}`
      }).join(' || ')
      prompt = `Datos equipo impulsos ${mes}/${anio}: ${resumen}. Máximo 40 palabras. Español colombiano, tono profesional. Con base en ventas vs meta y gasto vs ventas, nombra únicamente a la de mayor rendimiento y a la de menor rendimiento con sus cifras clave.`
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    const texto = data.content?.[0]?.text || 'No se pudo generar el análisis.'
    return NextResponse.json({ ok: true, texto })
  } catch (e: any) {
    console.error('[reportes/evaluar]', e.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
