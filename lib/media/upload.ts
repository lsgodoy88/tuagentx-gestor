import { r2Client, registrarStorage } from '@/lib/r2'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'


const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!
const R2_BUCKET_PUBLIC = process.env.R2_BUCKET_PUBLIC!

export type TipoMedia = 'imagen' | 'pdf'

export interface SubidaResult {
  key: string
  url: string
  tipo: TipoMedia
  tamano_byte: number
}

/**
 * Sube imagen o PDF a R2 bajo media/{empresaId}/{carpetaId}/
 * Imágenes: comprime con sharp (1200x1200, jpeg q82) — igual a subirFotoAlistamiento
 * PDFs: upload raw sin modificar
 */
export async function subirMediaArchivo(
  base64: string,
  empresaId: string,
  carpetaId: string,
  nombreOriginal: string,
): Promise<SubidaResult> {
  const esImagen = /^data:image\//i.test(base64)
  const esPdf = /^data:application\/pdf/i.test(base64)

  if (!esImagen && !esPdf) {
    throw new Error('Tipo de archivo no soportado. Solo imágenes y PDF.')
  }

  const tipo: TipoMedia = esPdf ? 'pdf' : 'imagen'
  const ext = esPdf ? 'pdf' : 'jpg'
  const uuid = crypto.randomUUID()
  const key = `media/${empresaId}/${carpetaId}/${uuid}.${ext}`

  const base64Data = base64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  let body: Buffer
  let contentType: string
  let tamano_byte: number

  if (tipo === 'imagen') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    body = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
    contentType = 'image/jpeg'
    tamano_byte = body.length
  } else {
    body = buffer
    contentType = 'application/pdf'
    tamano_byte = buffer.length
  }

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_PUBLIC,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))

  registrarStorage(empresaId, `media_${tipo}`, key, tamano_byte)

  const url = `${R2_PUBLIC_URL}/${key}`
  return { key, url, tipo, tamano_byte }
}

export async function eliminarMediaArchivo(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_PUBLIC,
    Key: key,
  }))
}
