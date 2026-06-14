import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { subirVoucher } from '@/lib/r2'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'

const execFileAsync = promisify(execFile)
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

async function pdfPrimerarPaginaAJpg(pdfBase64: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tmpPdf = join(tmpdir(), `voucher_${tag}.pdf`)
  const tmpBase = join(tmpdir(), `voucher_img_${tag}`)

  try {
    writeFileSync(tmpPdf, Buffer.from(pdfBase64, 'base64'))

    // -jpeg genera archivos .jpg; -f 1 -l 1 procesa solo la primera página
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '150', '-f', '1', '-l', '1', tmpPdf, tmpBase])

    const archivos = readdirSync(tmpdir()).filter(
      (f) => f.startsWith(basename(tmpBase)) && f.endsWith('.jpg')
    )
    if (archivos.length === 0) throw new Error('pdftoppm no generó archivo de imagen')

    const imgBuffer = readFileSync(join(tmpdir(), archivos[0]))

    const compressed: Buffer = await sharp(imgBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer()

    return compressed.toString('base64')
  } finally {
    try { unlinkSync(tmpPdf) } catch {}
    try {
      readdirSync(tmpdir())
        .filter((f) => f.startsWith(basename(tmpBase)))
        .forEach((f) => { try { unlinkSync(join(tmpdir(), f)) } catch {} })
    } catch {}
  }
}

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
