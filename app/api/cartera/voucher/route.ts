import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirVoucher } from '@/lib/r2'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EXTRACCION =
  'Eres un extractor de datos de comprobantes de pago colombianos. El comprobante puede ser digital (Nequi, Daviplata, PSE, transferencia bancaria) o físico (recibo de papel, corresponsal bancario, Wompi, etc.). ' +
  'Extrae: (1) valor numérico total consignado/transferido — IMPORTANTE: los puntos son separadores de miles en Colombia (ej: 1.240.000 = un millón doscientos cuarenta mil), devuelve el número completo sin truncar; ' +
  '(2) fecha y hora de la transacción en formato YYYY-MM-DD HH:mm:ss, si no hay hora usa 00:00:00; ' +
  '(3) origen: entidad o banco que envía el dinero; ' +
  '(4) destino: entidad, cuenta o titular que recibe el dinero; ' +
  '(5) número de referencia, recibo o transacción. ' +
  'Si no encuentras un campo devuelve null. Responde ÚNICAMENTE con JSON válido sin texto adicional: {"valor": number, "fecha": "YYYY-MM-DD HH:mm:ss", "banco": "string", "origen": "string", "destino": "string", "referencia": "string"}'

type DatosIA = { valor: number | null; fecha: string | null; banco: string | null; origen: string | null; destino: string | null; referencia: string | null }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { archivoBase64, mimeType, pagoId } = await req.json()
  if (!archivoBase64 || !mimeType || !pagoId) {
    return NextResponse.json({ error: 'archivoBase64, mimeType y pagoId requeridos' }, { status: 400 })
  }

  const base64Data = archivoBase64.replace(/^data:[^;]+;base64,/, '')

  // Convertir PDF a JPG antes de enviar a GPT y subir a R2
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

  let datosIA: DatosIA = { valor: null, fecha: null, banco: null, origen: null, destino: null, referencia: null }
  try {
    const dataUrl = `data:image/jpeg;base64,${imagenBase64}`
    const msg = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            { type: 'text', text: PROMPT_EXTRACCION },
          ],
        },
      ],
    })

    const text = msg.choices[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) datosIA = JSON.parse(match[0])
  } catch (e) {
    console.log('[voucher-error]', e)
  }

  const key = await subirVoucher(imagenBase64, pagoId)

  return NextResponse.json({ key, datosIA })
}
