import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { DIAS } from '@/lib/constants'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json([])
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  // Vendedor solo ve rutas de sus impulsadoras
  const esVendedor = user.role === 'vendedor'
  let whereRutas: any = { empresaId }
  if (esVendedor) {
    const misImpulsadoras = await prisma.empleado.findMany({
      where: { empresaId, rol: 'impulsadora', vendedorId: user.id }
    })
    const idsImpulsadoras = misImpulsadoras.map((e: any) => e.id)
    whereRutas = { empresaId, empleados: { some: { empleadoId: { in: idsImpulsadoras } } } }
  }

  const rutas = await prisma.rutaFija.findMany({
    where: whereRutas,
    include: {
      empleados: { include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } } },
      clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }
    },
    orderBy: { diaSemana: 'asc' }
  })
  return NextResponse.json(rutas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { diaSemana, empleadoIds, clienteIds, metas } = await req.json()
  // clienteIds: string[], metas: Record<string, number>
  if (diaSemana === undefined) return NextResponse.json({ error: 'Día requerido' }, { status: 400 })

  const nombre = DIAS[diaSemana]

  // Obtener ruta existente para bitácora
  const existente = await prisma.rutaFija.findFirst({
    where: { empresaId, diaSemana, empleados: { some: { empleadoId: empleadoIds[0] } } },
    include: { clientes: { include: { cliente: true } } }
  })

  // Bitácora de cambios
  const impulsadora = await prisma.empleado.findUnique({ where: { id: empleadoIds[0] } })
  const cambios: string[] = []
  if (existente) {
    const idsAnteriores = existente.clientes.map((c: any) => c.clienteId)
    const idsNuevos: string[] = clienteIds || []
    const agregados = idsNuevos.filter((id: string) => !idsAnteriores.includes(id))
    const quitados = idsAnteriores.filter((id: string) => !idsNuevos.includes(id))
    if (agregados.length > 0) cambios.push(`Clientes agregados: ${agregados.length}`)
    if (quitados.length > 0) cambios.push(`Clientes quitados: ${quitados.length}`)
    for (const rc of existente.clientes) {
      const metaAnterior = (rc as any).metaVenta || 0
      const metaNueva = metas?.[rc.clienteId] || 0
      if (metaAnterior !== metaNueva) {
        cambios.push(`Meta ${rc.cliente.nombre}: $${metaAnterior.toLocaleString('es-CO')} -> $${metaNueva.toLocaleString('es-CO')}`)
      }
    }
  } else {
    cambios.push(`Ruta creada: ${nombre} con ${(clienteIds||[]).length} clientes`)
  }

  if (cambios.length > 0) {
    await prisma.auditLog.create({
      data: {
        accion: 'RUTA_FIJA_MODIFICADA',
        usuario: user.email,
        detalle: `Impulsadora: ${impulsadora?.nombre || empleadoIds[0]} | Dia: ${nombre} | ${cambios.join(' | ')}`,
        empleadoId: user.id,
        empresaId,
      }
    })
  }

  // Eliminar ruta existente
  if (existente) {
    await prisma.rutaFijaEmpleado.deleteMany({ where: { rutaFijaId: existente.id } })
    await prisma.rutaFijaCliente.deleteMany({ where: { rutaFijaId: existente.id } })
    await prisma.rutaFija.delete({ where: { id: existente.id } })
  }

  const ruta = await prisma.rutaFija.create({
    data: {
      id: crypto.randomUUID(),
      nombre,
      diaSemana,
      empresaId,
      empleados: {
        create: (empleadoIds || []).map((id: string) => ({ id: crypto.randomUUID(), empleadoId: id }))
      },
      clientes: {
        create: (clienteIds || []).map((id: string, i: number) => ({
          id: crypto.randomUUID(),
          clienteId: id,
          orden: i,
          metaVenta: metas?.[id] || null
        }))
      }
    },
    include: {
      empleados: { include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } } },
      clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }
    }
  })
  return NextResponse.json({ ok: true, ruta })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  await prisma.rutaFijaEmpleado.deleteMany({ where: { rutaFijaId: id } })
  await prisma.rutaFijaCliente.deleteMany({ where: { rutaFijaId: id } })
  await prisma.rutaFija.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
