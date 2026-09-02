import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirEvidenciaGasto } from '@/lib/r2'
import { getEmpresaId } from '@/lib/auth-helpers'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EGRESO =
  'Eres un extractor de datos de facturas y recibos de egreso empresarial colombiano. Tu única tarea es extraer campos específicos con máxima precisión. ' +
  'REGLAS CRÍTICAS antes de extraer: ' +
  '- En Colombia los puntos (.) son separadores de miles: 482.400 = 482400, NO 482.4 ' +
  '- IVA, ICA, impuestos NO son retención. Retención = "RETE FUENTE" o "Retención en la fuente" únicamente. ' +
  '- Si RETE FUENTE aparece como 0.00 o no aparece, retencion = null (NO uses IVA como retención). ' +
  '- Copia la fecha EXACTAMENTE como está escrita sin calcular zonas horarias ni restar días. ' +
  'CAMPOS A EXTRAER: ' +
  '(1) valor: TOTAL A PAGAR del documento (campo "Total a pagar", "Total", o el monto final). En Colombia puntos=miles. ' +
  '(2) retencion: solo si existe "RETE FUENTE" o "Retención en la fuente" con valor mayor a 0. Si dice 0.00 o no existe → null. NUNCA uses IVA como retención. ' +
  '(3) fecha: fecha de generación/emisión en YYYY-MM-DD. La hora no afecta el día. ' +
  '(4) concepto: nombre del proveedor/empresa emisora + descripción breve (ej: "Dewars Cosmetique - Productos cosméticos"). ' +
  '(5) proveedor: nombre exacto de la empresa o persona que emite la factura (ej: "DEWARS COSMETIQUE SAS"). ' +
  '(6) medioPago: uno de BANCO, NEQUI, DAVIPLATA, EFECTIVO, TRANSFERENCIA, PSE según "Medio de Pago" o "Forma de Pago" del documento. null si no se determina. ' +
  'Responde ÚNICAMENTE con JSON válido sin texto adicional: {"valor": number|null, "retencion": number|null, "fecha": "YYYY-MM-DD"|null, "concepto": string|null, "proveedor": string|null, "medioPago": string|null}'

type DatosIA = { valor: number | null; retencion: number | null; fecha: string | null; concepto: string | null; proveedor: string | null; medioPago: string | null }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = getEmpresaId(user)

  const { archivoBase64, mimeType, egresoId } = await req.json()
  if (!archivoBase64 || !mimeType) {
    return NextResponse.json({ error: 'archivoBase64 y mimeType requeridos' }, { status: 400 })
  }

  const base64Data = archivoBase64.replace(/^data:[^;]+;base64,/, '')

  let imagenBase64: string
  if (mimeType === 'application/pdf') {
    try {
      imagenBase64 = await pdfPrimerarPaginaAJpg(base64Data)
    } catch {
      return NextResponse.json({ error: 'No se pudo convertir el PDF' }, { status: 422 })
    }
  } else {
    imagenBase64 = base64Data
  }

  let datosIA: DatosIA = { valor: null, retencion: null, fecha: null, concepto: null, proveedor: null, medioPago: null }
  try {
    const msg = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imagenBase64}`, detail: 'high' } },
          { type: 'text', text: PROMPT_EGRESO },
        ],
      }],
    })
    const text = msg.choices[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) datosIA = JSON.parse(match[0])
  } catch (e) {
    console.error('[egresos/voucher]', e)
  }

  const key = await subirEvidenciaGasto(imagenBase64, egresoId || crypto.randomUUID(), empresaId, 'factura_egreso')

  return NextResponse.json({ key, datosIA })
}
