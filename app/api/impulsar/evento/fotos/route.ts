import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { subirFotoEvento } from '@/lib/r2'
import { getEmpresaId } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

// POST — sube una foto de evento a R2, retorna key
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (user.role !== 'impulsadora') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

    const empresaId = getEmpresaId(user)
    const { archivoBase64, eventoId, fotoIdx } = await req.json()

    if (!archivoBase64 || !eventoId || fotoIdx == null) {
      return NextResponse.json({ error: 'archivoBase64, eventoId y fotoIdx requeridos' }, { status: 400 })
    }

    const key = await subirFotoEvento(archivoBase64, eventoId, fotoIdx, empresaId)
    return NextResponse.json({ ok: true, key })
  } catch (err: any) {
    console.error('[api/impulsar/evento/fotos] POST error:', err.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
