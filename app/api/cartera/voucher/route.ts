import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirVoucher } from '@/lib/r2'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EXTRACCION = `Analiza esta imagen. Puede contener UNO o VARIOS recibos/comprobantes de pago.

IMPORTANTE: Si ves múltiples recibos (aunque estén lado a lado o superpuestos), devuelve UN objeto por cada recibo.

Para cada recibo extrae:
- valor: número total pagado (en Colombia los puntos son miles: 2.000.000 = dos millones)
- fecha: formato YYYY-MM-DD HH:mm:ss
- banco: entidad o red de pago
- referencia: número de recibo, transacción o aprobación

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, sin backticks:
[{"valor": 2000000, "fecha": "2026-07-02 13:00:00", "banco": "Redeban", "referencia": "202503"}, {"valor": 1753950, "fecha": "2026-07-02 13:00:25", "banco": "Redeban", "referencia": "202504"}]

Si solo hay un recibo, igual devuelve array con un elemento.`

export type DatosIAPago = {
  valor: number | null
  fecha: string | null
  banco: string | null
  referencia: string | null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { archivoBase64, mimeType, pagoId } = await req.json()
  if (!archivoBase64 || !mimeType || !pagoId) {
    return NextResponse.json({ error: 'archivoBase64, mimeType y pagoId requeridos' }, { status: 400 })
  }

  const base64Data = archivoBase64.replace(/^data:[^;]+;base64,/, '')

  let imagenBase64: string
  if (mimeType === 'application/pdf') {
    try {
      imagenBase64 = await pdfPrimerarPaginaAJpg(base64Data)
    } catch (e) {
      console.error('[voucher] error convirtiendo PDF:', e)
      return NextResponse.json({ error: 'No se pudo convertir el PDF a imagen' }, { status: 422 })
    }
  } else {
    imagenBase64 = base64Data
  }

  let pagos: DatosIAPago[] = []
  const t0 = Date.now()
  let tIA = 0

  // Paralelizar: IA + upload R2 simultáneos
  const dataUrl = `data:image/jpeg;base64,${imagenBase64}`
  const [msgResult, key] = await Promise.allSettled([
    openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          { type: 'text', text: PROMPT_EXTRACCION },
        ],
      }],
    }),
    subirVoucher(imagenBase64, pagoId)
  ])

  tIA = Date.now() - t0

  // Procesar respuesta IA
  if (msgResult.status === 'fulfilled') {
    try {
      const text = (msgResult.value.choices[0]?.message?.content ?? '').trim()
      console.log('[voucher-ia-raw]', text)
      const clean = text.replace(/```json|```/g, '').trim()
      const match = clean.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed) && parsed.length > 0) pagos = parsed
      }
    } catch (e) {
      console.error('[voucher-parse-error]', e)
    }
  } else {
    console.error('[voucher-ia-error]', msgResult.reason)
  }

  if (pagos.length === 0) pagos = [{ valor: null, fecha: null, banco: null, referencia: null }]

  const uploadKey = key.status === 'fulfilled' ? key.value : await subirVoucher(imagenBase64, pagoId)
  console.log(`[voucher-timing] total: ${Date.now()-t0}ms | pagos: ${pagos.length}`)
  return NextResponse.json({ key: uploadKey, datosIA: pagos[0], pagos })
}
