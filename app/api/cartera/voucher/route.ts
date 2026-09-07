import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirVoucher, subirVoucherConEmpresa } from '@/lib/r2'
import { getEmpresaId } from '@/lib/auth-helpers'
import { pdfPrimerarPaginaAJpg } from '@/lib/pdfAJpg'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_EXTRACCION = `Analiza esta imagen de comprobante(s) de pago colombiano(s). IMPORTANTE: la imagen puede estar rotada 90°, 180° o en cualquier orientación — analiza el contenido independientemente de la rotación.

REGLAS CRITICAS:
- valor: busca el monto mas destacado (VALOR, TOTAL, MONTO). En Colombia los puntos son miles: $300.000 = 300000, $2.000.000 = 2000000. NUNCA devuelvas null si hay numero visible.
- fecha: busca el campo "Fecha", "Fecha Transaccion" o cualquier fecha visible en el comprobante. Puede venir como: "AGO 31 2026 17:05:32", "04 Sept 2026 - 08:54 a.m.", "04/09/2026 08:54", "2026-09-04". Convierte siempre a "YYYY-MM-DD HH:mm:ss". Los meses abreviados en español: Ene=01 Feb=02 Mar=03 Abr=04 May=05 Jun=06 Jul=07 Ago=08 Sept/Sep=09 Oct=10 Nov=11 Dic=12. CONTEXTO: año siempre 2026 — si lees otro año verifica dos veces.
- banco: extrae la red o entidad destino (Redeban, Bancolombia, Nequi, Daviplata, PSE, Efecty, etc.). Para Corresponsal Bancario incluye ambas: "Redeban / Bancolombia"
- numero_cuenta: numero de cuenta o celular DESTINO donde se recibio el dinero. Busca campos como "Cuenta Ahorros", "Cuenta Corriente", "Cuenta destino", "No. cuenta", "Numero celular destino", "A la cuenta", "Destino". Extrae SOLO el numero, sin texto. Si no puedes leer el numero, devuelve null.
- titular: nombre completo de la persona que recibio el dinero. En comprobantes Wompi/Bancolombia aparece como "Titular" seguido del nombre en la misma linea o la siguiente (ejemplo: "Titular HECTOR DURAN G" o "Titular:\nHECTOR DURAN G"). Tambien busca "A nombre de:", "Beneficiario:". Extrae SOLO el nombre en mayusculas, sin otros datos. Si no aparece, devuelve null.
- referencia: prioridad RECIBO > RRN > APRO > No. transaccion

Si hay VARIOS recibos FISICAMENTE SEPARADOS devuelve UN objeto por cada uno. Si solo hay uno, array de un elemento. CRITICO: si el monto total es uno solo (un solo MONTO o TOTAL visible), devuelve UN SOLO objeto aunque haya varios numeros de referencia — RRN, APRO, CHEQ, No. son datos internos de UNA sola transaccion, no recibos distintos. Si hay varios recibos, cada uno DEBE tener su propia fecha visible — NUNCA inventes ni reutilices la fecha de otro recibo. Si no puedes leer la fecha de un recibo especifico, devuelve fecha: null para ese recibo.

Responde UNICAMENTE con array JSON valido, sin texto, sin backticks:
[{"valor": 300000, "fecha": "2026-07-22 14:18:12", "banco": "Redeban / Bancolombia", "numero_cuenta": "86982430994", "titular": "HECTOR DURAN G", "referencia": "017706"}]`

export type DatosIAPago = {
  valor: number | null
  fecha: string | null
  banco: string | null
  numero_cuenta?: string | null
  titular?: string | null
  referencia: string | null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const user = session.user as any
  const empresaId = getEmpresaId(user)
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
    subirVoucherConEmpresa(imagenBase64, pagoId, empresaId)
  ])

  tIA = Date.now() - t0

  // Procesar respuesta IA
  if (msgResult.status === 'fulfilled') {
    try {
      const text = (msgResult.value.choices[0]?.message?.content ?? '').trim()
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

  // Corrección post-extracción: si el año es anterior a 2024, reemplazar con el año actual
  const anioActual = new Date().getFullYear()
  pagos = pagos.map((p: any) => {
    if (!p.fecha) return p
    const anioMatch = p.fecha.match(/^(\d{4})/)
    if (anioMatch) {
      const anio = parseInt(anioMatch[1])
      if (anio < anioActual - 1) {
        console.warn(`[voucher] año corregido: ${anio} → ${anioActual} en fecha "${p.fecha}"`)
        p.fecha = p.fecha.replace(/^\d{4}/, String(anioActual))
      }
    }
    return p
  })

  const uploadKey = key.status === 'fulfilled' ? key.value : await subirVoucherConEmpresa(imagenBase64, pagoId, empresaId)
  console.log(`[voucher-timing] total: ${Date.now()-t0}ms | pagos: ${pagos.length}`)
  return NextResponse.json({ key: uploadKey, datosIA: pagos[0], pagos })
}
