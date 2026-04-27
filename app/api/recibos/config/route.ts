import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any

  if (user.role === 'empresa') {
    const empresa = await prisma.empresa.findUnique({
      where: { id: user.id },
      select: { configRecibos: true },
    })
    const cfg: any = empresa?.configRecibos ?? {}
    return NextResponse.json({
      usarConfigEmpresa: true,
      prefijo: cfg.prefijo ?? 'REC',
      anchoPapel: cfg.anchoPapel ?? '80mm',
      consecutivoActual: 0,
    })
  }

  const empleado = await prisma.empleado.findUnique({
    where: { id: user.id },
    select: {
      configRecibos: true,
      empresa: { select: { configRecibos: true } },
    },
  })
  if (!empleado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const cfg: any = empleado.configRecibos ?? {}
  const empCfg: any = (empleado.empresa as any)?.configRecibos ?? {}
  const usarEmpresa = cfg.usarConfigEmpresa !== false

  return NextResponse.json({
    usarConfigEmpresa: usarEmpresa,
    prefijo: usarEmpresa ? (empCfg.prefijo ?? 'REC') : (cfg.prefijo ?? 'REC'),
    anchoPapel: usarEmpresa ? (empCfg.anchoPapel ?? '80mm') : (cfg.anchoPapel ?? '80mm'),
    consecutivoActual: Number(cfg.consecutivoActual ?? 0),
    consecutivoMes: cfg.consecutivoMes ?? null,
    prefijoPersonal: cfg.prefijo ?? null,
    anchoPapelPersonal: cfg.anchoPapel ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role === 'empresa') return NextResponse.json({ error: 'Usar endpoint de empresa' }, { status: 400 })

  const body = await req.json()
  const { usarConfigEmpresa, prefijo, anchoPapel } = body

  const empleado = await prisma.empleado.findUnique({
    where: { id: user.id },
    select: { configRecibos: true },
  })
  const cfg: any = empleado?.configRecibos ?? {}

  const newCfg = {
    ...cfg,
    ...(usarConfigEmpresa !== undefined && { usarConfigEmpresa }),
    ...(prefijo !== undefined && { prefijo }),
    ...(anchoPapel !== undefined && { anchoPapel }),
  }

  await prisma.empleado.update({
    where: { id: user.id },
    data: { configRecibos: newCfg as any },
  })

  return NextResponse.json({ ok: true })
}
