import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'

const execFileAsync = promisify(execFile)

/**
 * Convierte la primera página de un PDF (base64) a JPG (base64), comprimido.
 * Usa pdftoppm (poppler-utils) + sharp. Limpia los archivos temporales
 * siempre, incluso si falla.
 */
export async function pdfPrimerarPaginaAJpg(pdfBase64: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tmpPdf = join(tmpdir(), `pdfconv_${tag}.pdf`)
  const tmpBase = join(tmpdir(), `pdfconv_img_${tag}`)

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
