import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const ROLES = ['empresa', 'supervisor', 'bodega']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { id } = await params

  const orden = await (prisma as any).ordenDespacho.findFirst({
    where: { id, empresaId },
    select: { fotoAlistamiento: true },
  })
  if (!orden?.fotoAlistamiento) return NextResponse.json({ error: 'Sin foto' }, { status: 404 })

  const key = orden.fotoAlistamiento
  const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }), { expiresIn: 300 })

  return NextResponse.redirect(url)
}
