import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { r2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

const R2_BUCKET_PUBLIC = process.env.R2_BUCKET_PUBLIC!
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const nombre = searchParams.get('nombre') || 'portafolio.pdf'
  const size = parseInt(searchParams.get('size') || '0')

  // Validaciones
  if (tipo !== 'portafolio') return NextResponse.json({ error: 'Solo portafolio PDF' }, { status: 400 })
  if (size > MAX_SIZE) return NextResponse.json({ error: `PDF máximo 10MB (recibido ${(size/1024/1024).toFixed(1)}MB)` }, { status: 400 })
  if (size <= 0) return NextResponse.json({ error: 'Tamaño inválido' }, { status: 400 })

  const uuid = crypto.randomUUID()
  const key = `media/${empresaId}/_config_portafolio/${uuid}.pdf`
  const url = `${R2_PUBLIC_URL}/${key}`

  // Presigned URL directa al endpoint S3 — CORS configurado via Wrangler CLI
  const presignedUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({
      Bucket: R2_BUCKET_PUBLIC,
      Key: key,
      ContentType: 'application/pdf',
      ContentLength: size,
    }),
    { expiresIn: 300 }
  )

  return NextResponse.json({ presignedUrl, key, url })
}
