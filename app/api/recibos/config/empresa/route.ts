import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  if (!empresaId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  // Solo empresa o supervisor
  if (user.role !== 'empresa' && user.role !== 'supervisor') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { configRecibos: true },
  })

  const cfg: any = empresa?.configRecibos ?? {}
  return NextResponse.json({
    anchoPapel: cfg.anchoPapel ?? '80mm',
    prefijo: cfg.prefijo ?? 'REC',
    logo: cfg.logo ?? null,
    nit: cfg.nit ?? null,
    direccion: cfg.direccion ?? null,
    telefono: cfg.telefono ?? null,
    urlApi: cfg.urlApi ?? null,
    tokenApi: cfg.tokenApi ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  if (!empresaId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 })

  if (user.role !== 'empresa' && user.role !== 'supervisor') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json()
  const { anchoPapel, prefijo, logo, nit, direccion, telefono, urlApi, tokenApi } = body

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { configRecibos: true },
  })
  const cfg: any = empresa?.configRecibos ?? {}

  const newCfg = {
    ...cfg,
    ...(anchoPapel !== undefined && { anchoPapel }),
    ...(prefijo !== undefined && { prefijo }),
    ...(logo !== undefined && { logo }),
    ...(nit !== undefined && { nit }),
    ...(direccion !== undefined && { direccion }),
    ...(telefono !== undefined && { telefono }),
    ...(urlApi !== undefined && { urlApi }),
    ...(tokenApi !== undefined && { tokenApi }),
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { configRecibos: newCfg as any },
  })

  return NextResponse.json({ ok: true })
}
