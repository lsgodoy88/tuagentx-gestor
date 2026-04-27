import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379')

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return NextResponse.json(null)
  const user = session.user as any
  const key = 'ruta-optimizada:' + user.id
  const data = await redis.get(key)
  if (!data) return NextResponse.json(null)
  return NextResponse.json({ orden: JSON.parse(data) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const userPost = session.user as any

  const { clientes, latInicio, lngInicio } = await req.json()

  if (!clientes || clientes.length === 0) {
    return NextResponse.json({ error: 'Sin clientes' }, { status: 400 })
  }

  const clientesConGps = clientes.filter((c: any) => c.lat && c.lng)
  if (clientesConGps.length < 2) {
    return NextResponse.json({ error: 'Se necesitan al menos 2 clientes con GPS' }, { status: 400 })
  }

  const listaClientes = clientesConGps.map((c: any, i: number) =>
    `${i + 1}. ${c.nombre} (lat: ${c.lat}, lng: ${c.lng})`
  ).join('\n')

  const prompt = `Eres un optimizador de rutas. Dado un punto de inicio y una lista de clientes con coordenadas GPS, devuelve el orden óptimo para visitarlos minimizando la distancia total recorrida (algoritmo del vecino más cercano).

Punto de inicio: lat ${latInicio}, lng ${lngInicio}

Clientes a visitar:
${listaClientes}

Responde SOLO con un JSON array con los números de los clientes en el orden óptimo. Ejemplo: [3,1,5,2,4]
No incluyas explicación ni texto adicional, solo el JSON array.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  const data = await response.json()
  console.log('IA response status:', response.status)
  console.log('IA response data:', JSON.stringify(data).slice(0, 300))
  const texto = data.content?.[0]?.text?.trim()

  try {
    // Extraer array JSON aunque venga con texto extra o backticks
    const match = texto.match(/\[[\s\S]*?\]/)
    if (!match) throw new Error('No array found')
    const orden = JSON.parse(match[0])
    const clientesOrdenados = orden.map((idx: number) => clientesConGps[idx - 1]).filter(Boolean)
    const sinGps = clientes.filter((c: any) => !c.lat || !c.lng)
    const resultado = [...clientesOrdenados, ...sinGps]
    // Guardar en Redis 2 horas
    const key = 'ruta-optimizada:' + userPost.id
    await redis.setex(key, 7200, JSON.stringify(resultado))
    return NextResponse.json({ orden: resultado })
  } catch (e: any) {
    console.log('Error IA optimizar:', e.message, 'Respuesta:', texto)
    return NextResponse.json({ error: 'Error al procesar respuesta IA' }, { status: 500 })
  }
}
