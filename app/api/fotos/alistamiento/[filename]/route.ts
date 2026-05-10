import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  // Verificar sesión o token interno
  const { getToken } = await import('next-auth/jwt')
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { filename } = await params
    if (!filename || filename.includes('..')) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    const filePath = path.join(process.cwd(), 'public', 'fotos', 'alistamiento', filename)
    const data = await readFile(filePath)
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      }
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
