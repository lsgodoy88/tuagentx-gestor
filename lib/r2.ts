import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function subirFirma(firmaBase64: string, visitaId: string): Promise<string> {
  const base64Data = firmaBase64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const key = `firmas/${visitaId}.jpg`

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
  }))

  // Guardar solo el key, no la URL completa
  return key
}

// imagenBase64 debe ser siempre una imagen ya procesada (JPG); la conversión de PDF ocurre en el caller
export async function subirVoucher(imagenBase64: string, pagoId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const base64Data = imagenBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const compressed: Buffer = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()

  const key = `vouchers/${pagoId}.jpg`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: compressed,
    ContentType: 'image/jpeg',
  }))
  return key
}

export async function firmaUrl(key: string): Promise<string> {
  // Si es base64 legacy, devolverlo tal cual
  if (key.startsWith('data:')) return key

  // Si es URL completa legacy, extraer el key
  const keyLimpio = key.includes('/firmas/') ? 'firmas/' + key.split('/firmas/')[1] : key

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: keyLimpio,
  })

  return getSignedUrl(r2, command, { expiresIn: 30 }) // 5 minutos
}
