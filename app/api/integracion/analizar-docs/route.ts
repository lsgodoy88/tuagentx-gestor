import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const { documentacion, url } = await req.json()
  if (!documentacion?.trim()) return NextResponse.json({ error: 'Documentación requerida' }, { status: 400 })

  const prompt = `Analiza esta documentación de API${url ? ` (base URL: ${url})` : ''} y detecta:
1) Endpoints para clientes, cartera, empleados, recaudos con su método HTTP y path relativo.
2) Mapeo de campos externos a internos: saldoPendiente, clienteId, fechaVencimiento, valor, nombre, nit.

Documentación:
${documentacion.slice(0, 6000)}

Responde SOLO con JSON válido, sin texto adicional, en este formato exacto:
{
  "endpoints": {
    "clientes":  {"method": "GET",  "path": "/clientes"},
    "cartera":   {"method": "GET",  "path": "/cartera"},
    "empleados": {"method": "GET",  "path": "/empleados"},
    "recaudos":  {"method": "POST", "path": "/recaudos"}
  },
  "mapeo": {
    "saldoPendiente":   "campo_externo",
    "clienteId":        "campo_externo",
    "fechaVencimiento": "campo_externo",
    "valor":            "campo_externo",
    "nombre":           "campo_externo",
    "nit":              "campo_externo"
  }
}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    return NextResponse.json(JSON.parse(text))
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { return NextResponse.json(JSON.parse(match[0])) } catch {}
    }
    return NextResponse.json({ error: 'No se pudo parsear la respuesta', raw: text }, { status: 500 })
  }
}
