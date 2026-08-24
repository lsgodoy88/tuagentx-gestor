import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { prisma, DB_SCHEMA } from './prisma'
import { Prisma } from '@/app/generated/prisma'

export async function registrarStorage(empresaId: string, tipo: string, key: string, sizeBytes: number) {
  try {
    await prisma.$executeRaw`
      INSERT INTO ${Prisma.raw(DB_SCHEMA)}."StorageLog" (empresa_id, tipo, key, size_bytes)
      VALUES (${empresaId}, ${tipo}, ${key}, ${sizeBytes})`
  } catch (e) {
    console.error('[StorageLog] error:', e)
  }
}

export const R2_BUCKET = process.env.R2_BUCKET!
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function subirFirma(firmaBase64: string, visitaId: string, empresaId?: string): Promise<string> {
  const base64Data = firmaBase64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const key = `firmas/${visitaId}.jpg`

  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
  }))

  if (empresaId) registrarStorage(empresaId, 'firma', key, buffer.length)
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
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: compressed,
    ContentType: 'image/jpeg',
  }))
  return key
}

export async function subirVoucherConEmpresa(imagenBase64: string, pagoId: string, empresaId: string): Promise<string> {
  const { key, size } = await subirVoucherConSize(imagenBase64, pagoId)
  registrarStorage(empresaId, 'voucher_pago', key, size)
  return key
}

export async function subirVoucherConSize(imagenBase64: string, pagoId: string): Promise<{key: string, size: number}> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const base64Data = imagenBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const compressed: Buffer = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
  const key = `vouchers/${pagoId}.jpg`
  const { PutObjectCommand: POC } = await import('@aws-sdk/client-s3')
  await r2Client.send(new POC({ Bucket: process.env.R2_BUCKET!, Key: key, Body: compressed, ContentType: 'image/jpeg' }))
  return { key, size: compressed.length }
}

export async function subirEvidenciaGasto(imagenBase64: string, gastoId: string, empresaId?: string, tipo: 'factura_egreso' | 'evidencia_abono' = 'factura_egreso'): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const base64Data = imagenBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const compressed: Buffer = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()

  const key = `gastos/${gastoId}.jpg`
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: compressed,
    ContentType: 'image/jpeg',
  }))
  if (empresaId) registrarStorage(empresaId, tipo, key, compressed.length)
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

  return getSignedUrl(r2Client, command, { expiresIn: 30 }) // 5 minutos
}

export async function subirFotoAlistamiento(imagenBase64: string, ordenId: string, idx: number, empresaId?: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp')
  const base64Data = imagenBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const compressed: Buffer = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
  const key = `alistamiento/${ordenId}_${idx}.jpg`
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: compressed,
    ContentType: 'image/jpeg',
  }))
  if (empresaId) registrarStorage(empresaId, 'foto_alistamiento', key, compressed.length)
  return key
}

/** URL firmada para cualquier archivo en R2 (5 minutos) */
export async function subirFotoEvento(imagenBase64: string, eventoId: string, fotoIdx: number, empresaId: string): Promise<string> {
  const sharp = require('sharp')
  const base64Data = imagenBase64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const compressed: Buffer = await sharp(buffer)
    .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  const key = `eventos/${eventoId}_${fotoIdx}.jpg`
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: compressed,
    ContentType: 'image/jpeg',
  }))
  registrarStorage(empresaId, 'foto_evento', key, compressed.length)
  return key
}

export async function archivoUrl(key: string): Promise<string> {
  if (key.startsWith('data:')) return key
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
  })
  return getSignedUrl(r2Client, command, { expiresIn: 300 })
}
