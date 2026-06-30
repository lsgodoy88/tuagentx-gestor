import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirEvidenciaGasto } from '@/lib/r2'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EXTRACCION_GASTO =
  'Eres un extractor de datos de facturas, recibos y comprobantes de gasto colombianos (transporte, peajes, papelería, combustible, viáticos, alimentación, etc.). ' +
  'Extrae: (1) valor numérico total a pagar — IMPORTANTE: los puntos son separadores de miles en Colombia (ej: 45.000 = cuarenta y cinco mil), devuelve el número completo sin truncar; ' +
  '(2) fecha del documento en formato YYYY-MM-DD — IMPORTANTE: copia la fecha EXACTAMENTE como aparece escrita en el documento (día, mes, año), sin restar ni sumar días, sin hacer ningún cálculo o conversión de zona horaria. Si el documento dice "16 diciembre 2024 22:07:19", la fecha es 2024-12-16, NO 2024-12-15. La hora (si aparece) no afecta el día de la fecha. Si no hay fecha usa null; ' +
  '(3) concepto breve y descriptivo del gasto (ej: "Combustible", "Peaje autopista norte", "Almuerzo cliente", "Papelería oficina") basado en el establecimiento o ítems visibles en el documento. ' +
  'Si no encuentras un campo devuelve null. Responde ÚNICAMENTE con JSON válido sin texto adicional: {"valor": number, "fecha": "YYYY-MM-DD", "concepto": "string"}'

type DatosIAGasto = { valor: number | null; fecha: string | null; concepto: string | null }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { archivoBase64, mimeType, gastoId } = await req.json()
  if (!archivoBase64 || !mimeType || !gastoId) {
    return NextResponse.json({ error: 'archivoBase64, mimeType y gastoId requeridos' }, { status: 400 })
  }

  const base64Data = archivoBase64.replace(/^data:[^;]+;base64,/, '')

  let imagenBase64: string
  if (mimeType === 'application/pdf') {
    try {
      imagenBase64 = await pdfPrimerarPaginaAJpg(base64Data)
    } catch (e) {
      console.error('[gastos/voucher] error convirtiendo PDF:', e)
      return NextResponse.json({ error: 'No se pudo convertir el PDF a imagen' }, { status: 422 })
    }
  } else {
    imagenBase64 = base64Data
  }

  let datosIA: DatosIAGasto = { valor: null, fecha: null, concepto: null }
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
            { type: 'text', text: PROMPT_EXTRACCION_GASTO },
          ],
        },
      ],
    })

    const text = msg.choices[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) datosIA = JSON.parse(match[0])
  } catch (e) {
    console.log('[gastos/voucher-error]', e)
  }

  const key = await subirEvidenciaGasto(imagenBase64, gastoId)

  return NextResponse.json({ key, datosIA })
}
