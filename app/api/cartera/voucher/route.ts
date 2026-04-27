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
  'Extrae del comprobante de pago: valor numérico total transferido (sin símbolos), fecha de la transacción (formato YYYY-MM-DD), nombre del banco o entidad emisora, y número de referencia o transacción. ' +
  'Responde ÚNICAMENTE con JSON válido, sin texto adicional: {"valor": number, "fecha": "YYYY-MM-DD", "banco": "string", "referencia": "string"}'

type DatosIA = { valor: number | null; fecha: string | null; banco: string | null; referencia: string | null }

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
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
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

  let datosIA: DatosIA = { valor: null, fecha: null, banco: null, referencia: null }
  try {
    const dataUrl = `data:image/jpeg;base64,${imagenBase64}`
    const msg = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: PROMPT_EXTRACCION },
          ],
        },
      ],
    })

    const text = msg.choices[0]?.message?.content ?? ''
    console.log('[voucher] text:', text.slice(0, 200))
    const match = text.match(/\{[\s\S]*\}/)
    if (match) datosIA = JSON.parse(match[0])
  } catch (e) {
    console.log('[voucher-error]', e)
  }

  const key = await subirVoucher(imagenBase64, pagoId)

  return NextResponse.json({ key, datosIA })
}
