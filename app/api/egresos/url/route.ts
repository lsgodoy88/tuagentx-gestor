import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { archivoUrl } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const key = new URL(req.url).searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })
  try {
    const url = await archivoUrl(key)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener URL' }, { status: 500 })
  }
}
