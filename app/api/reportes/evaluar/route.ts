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
      const cartera = datos.ventas - datos.recaudos
      const carteraPct = datos.ventas > 0 ? Math.round(cartera / datos.ventas * 100) : 0
      const gastoPct = datos.recaudos > 0 ? Math.round(datos.gastos / datos.recaudos * 100) : 0
      const promedioVentas = equipo?.length > 0 ? equipo.reduce((s: number, e: any) => s + e.ventas, 0) / equipo.length : 0
      prompt = `Eres un analista de ventas. Evalúa el desempeño del vendedor "${empleado}" en el mes ${mes}/${anio}.

Datos:
- Ventas: $${datos.ventas.toLocaleString('es-CO')}
- Recaudos: $${datos.recaudos.toLocaleString('es-CO')} (${100 - carteraPct}% cobrado)
- Cartera sin cobrar: $${cartera.toLocaleString('es-CO')} (${carteraPct}%)
- Gastos: $${datos.gastos.toLocaleString('es-CO')} (${gastoPct}% sobre recaudos)
- Promedio ventas equipo: $${Math.round(promedioVentas).toLocaleString('es-CO')}

Genera un análisis breve (3-4 líneas) en español colombiano, directo y útil para el gerente. Sin saludos ni despedidas. Menciona: si está por encima o debajo del equipo, el nivel de cartera, y la eficiencia de gastos.`
    } else if (tipo === 'empresa') {
      const carteraPct = datos.ventas > 0 ? Math.round(datos.cartera / datos.ventas * 100) : 0
      const gastoPct = datos.ventas > 0 ? Math.round(datos.gastos / datos.ventas * 100) : 0
      const recaudoPct = datos.ventas > 0 ? Math.round(datos.recaudos / datos.ventas * 100) : 0
      prompt = `Eres un analista financiero. Evalúa el desempeño general de la empresa en el mes ${mes}/${anio}.

Datos consolidados:
- Ventas vendedores: $${datos.ventas.toLocaleString('es-CO')}
- Recaudos: $${datos.recaudos.toLocaleString('es-CO')} (${recaudoPct}% cobrado)
- Cartera sin cobrar: $${datos.cartera.toLocaleString('es-CO')} (${carteraPct}%)
- Gastos vendedores: $${datos.gastos.toLocaleString('es-CO')} (${gastoPct}% sobre ventas)
- Ventas impulsos: $${datos.ventasI.toLocaleString('es-CO')}
- Gastos impulsos: $${datos.gastosI.toLocaleString('es-CO')}

Genera un análisis ejecutivo breve (4-5 líneas) en español colombiano para el gerente. Sin saludos. Menciona: salud financiera general, nivel de cartera, eficiencia de gastos y una recomendación concreta.`
    } else if (tipo === 'impulsadora') {
      const gastoPct = datos.ventas > 0 ? Math.round(datos.gastos / datos.ventas * 100) : 0
      const metaPct = datos.meta > 0 ? Math.round(datos.ventas / datos.meta * 100) : 0
      const promedioVisitas = equipo?.length > 0 ? equipo.reduce((s: number, e: any) => s + e.visitas, 0) / equipo.length : 0
      prompt = `Eres un analista de ventas. Evalúa el desempeño de la impulsadora "${empleado}" en el mes ${mes}/${anio}.

Datos:
- Ventas: $${datos.ventas.toLocaleString('es-CO')} (${metaPct}% de la meta)
- Meta: $${datos.meta.toLocaleString('es-CO')}
- Visitas realizadas: ${datos.visitas} (promedio equipo: ${Math.round(promedioVisitas)})
- Gastos: $${datos.gastos.toLocaleString('es-CO')} (${gastoPct}% sobre ventas)

Genera un análisis breve (3-4 líneas) en español colombiano, directo y útil para el gerente. Sin saludos ni despedidas. Menciona cumplimiento de meta, visitas vs promedio, y eficiencia de gastos.`
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
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
