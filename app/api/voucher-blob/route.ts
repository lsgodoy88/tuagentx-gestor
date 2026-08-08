import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { r2Client } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })
  const obj = await r2Client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }))
  const bytes = await obj.Body?.transformToByteArray()
  if (!bytes) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': obj.ContentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=60',
    },
  })
}
