import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirEvidenciaGasto } from '@/lib/r2'
import { getEmpresaId } from '@/lib/auth-helpers'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EGRESO =
  'Eres un extractor de datos de facturas y comprobantes de egreso empresarial colombiano. ' +
  'Extrae: ' +
  '(1) valor: valor total del documento — los puntos son separadores de miles en Colombia (45.000 = 45000); ' +
  '(2) retencion: valor de retención en la fuente si aparece explícitamente en el documento, si no aparece devuelve null; ' +
  '(3) fecha: fecha del documento en formato YYYY-MM-DD — IMPORTANTE: copia la fecha EXACTAMENTE como aparece escrita en el documento, sin restar ni sumar días, sin hacer ningún cálculo de zona horaria. Si el documento dice "16 diciembre 2024 22:07:19", la fecha es 2024-12-16, NO 2024-12-15. La hora no afecta el día. Si no hay fecha usa null; ' +
  '(4) concepto: descripción breve del egreso (ej: "Arriendo oficina", "Factura proveedor papelería", "Servicio internet"); ' +
  '(5) medioPago: uno de BANCO, NEQUI, DAVIPLATA, EFECTIVO, TRANSFERENCIA, PSE — o null si no se puede determinar. ' +
  'Si no encuentras un campo devuelve null. Responde ÚNICAMENTE con JSON válido: {"valor": number, "retencion": number|null, "fecha": "YYYY-MM-DD", "concepto": "string", "medioPago": "string|null"}'

type DatosIA = { valor: number | null; retencion: number | null; fecha: string | null; concepto: string | null; medioPago: string | null }

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

  let datosIA: DatosIA = { valor: null, retencion: null, fecha: null, concepto: null, medioPago: null }
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
