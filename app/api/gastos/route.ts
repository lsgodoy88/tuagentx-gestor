import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN, empleadoCampoScope } from '@/lib/auth-helpers'

const TIPOS_VALIDOS = ['Viaticos', 'Eventos', 'Papeleria', 'Otros'] as const

// GET — lista de gastos con scope por rol
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { permitido, empleadoIdForzado } = empleadoCampoScope(user)
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)

  const gastos = await (prisma as any).gasto.findMany({
    where: { empresaId, ...(empleadoIdForzado ? { empleadoId: empleadoIdForzado } : {}) },
    include: { empleado: { select: { id: true, nombre: true } } },
    orderBy: { fechaAgregacion: 'desc' },
  })

  return NextResponse.json({ gastos })
}

// POST — crear gasto (cualquier rol de campo crea el suyo; admin puede crear a nombre de cualquiera)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { permitido, empleadoIdForzado } = empleadoCampoScope(user)
  if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { concepto, valor, tipo, fechaDoc, evidenciaKey, datosIA, empleadoId } = body

  if (!concepto || !valor || !evidenciaKey) {
    return NextResponse.json({ error: 'concepto, valor y evidenciaKey requeridos' }, { status: 400 })
  }
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo requerido, debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  // empleadoIdForzado !== null => vendedor/impulsadora, SIEMPRE su propio id,
  // ignora cualquier empleadoId que venga en el body (evita suplantación).
  const empleadoIdFinal = empleadoIdForzado || empleadoId || user.id
  if (!empleadoIdForzado && !ROLES_ADMIN.includes(user.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const gasto = await (prisma as any).gasto.create({
    data: {
      empresaId,
      empleadoId: empleadoIdFinal,
      concepto,
      tipo,
      valor,
      fechaDoc: fechaDoc ? new Date(fechaDoc) : null,
      evidenciaKey,
      datosIA: datosIA || undefined,
    },
  })

  return NextResponse.json({ ok: true, gasto })
}

// PUT — editar gasto (SOLO admin; el dueño no puede editar su propio gasto)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const body = await req.json()
  const { id, concepto, valor, tipo, fechaDoc } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  // Verifica que el gasto pertenezca a la empresa del admin antes de editar
  const existente = await (prisma as any).gasto.findUnique({ where: { id } })
  if (!existente || existente.empresaId !== empresaId) {
    return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
  }

  const gasto = await (prisma as any).gasto.update({
    where: { id },
    data: {
      ...(concepto !== undefined ? { concepto } : {}),
      ...(valor !== undefined ? { valor } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(fechaDoc !== undefined ? { fechaDoc: fechaDoc ? new Date(fechaDoc) : null } : {}),
    },
  })

  return NextResponse.json({ ok: true, gasto })
}

// DELETE — eliminar gasto (SOLO admin)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!ROLES_ADMIN.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const existente = await (prisma as any).gasto.findUnique({ where: { id } })
  if (!existente || existente.empresaId !== empresaId) {
    return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
  }

  await (prisma as any).gasto.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
