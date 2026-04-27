import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { entregasQueue } from '@/lib/queues'

// POST — crear entrega desde empresa vinculada
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey) return NextResponse.json({ error: 'x-api-key requerida' }, { status: 401 })

  const vinculada = await prisma.empresaVinculada.findUnique({
    where: { apiKey },
  })
  if (!vinculada || !vinculada.activa) {
    return NextResponse.json({ error: 'API key inválida o empresa inactiva' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const { clienteNit, clienteNombre, direccion, lat, lng, telefono, items, observaciones } = body

  if (!clienteNit || !clienteNombre) {
    return NextResponse.json({ error: 'clienteNit y clienteNombre son requeridos' }, { status: 422 })
  }

  // Buscar o crear cliente en la empresa principal
  let cliente = await prisma.cliente.findFirst({
    where: { empresaId: vinculada.empresaId, nit: String(clienteNit) },
  })
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        empresaId: vinculada.empresaId,
        nombre: clienteNombre,
        nit: String(clienteNit),
        direccion: direccion ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        telefono: telefono ?? null,
      },
    })
  }

  // Buscar ruta activa del día en la empresa principal
  const hoy = new Date()
  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 5, 0, 0) // 5am UTC = medianoche Bogotá
  const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000)

  const rutaActiva = await prisma.ruta.findFirst({
    where: {
      empresaId: vinculada.empresaId,
      cerrada: false,
      empresaVinculadaId: null,
      empleados: { some: { empleado: { rol: 'entregas', activo: true } } },
    },
    include: { clientes: { select: { orden: true } } },
  })

  const numeroOrden = `${vinculada.nombre.slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`

  const orden = await (prisma as any).ordenDespacho.create({
    data: {
      empresaId: vinculada.empresaId,
      origen: 'vinculada',
      origenVinculadaId: vinculada.id,
      numeroOrden,
      clienteNombre: cliente.nombre,
      clienteNit: cliente.nit ?? null,
      ciudad: cliente.ciudad ?? null,
      direccion: cliente.direccion ?? null,
      telefono: cliente.telefono ?? null,
      fechaOrden: new Date(),
    },
  })

  if (rutaActiva) {
    const maxOrden = Math.max(0, ...rutaActiva.clientes.map(c => c.orden))
    await prisma.rutaCliente.create({
      data: {
        rutaId: rutaActiva.id,
        clienteId: cliente.id,
        orden: maxOrden + 1,
        supervisorEtiqueta: JSON.stringify({ observaciones, items, empresaVinculadaId: vinculada.id, color: vinculada.color }),
      },
    })
    if (!cliente.lat && !cliente.lng && cliente.direccion) {
      await entregasQueue.add('geocodificar', { clienteId: cliente.id })
    }
    return NextResponse.json({ id: rutaActiva.id, ordenId: orden.id, clienteId: cliente.id, estado: 'asignado' }, { status: 201 })
  }

  // Sin ruta activa — crear ruta pendiente
  const ruta = await prisma.ruta.create({
    data: {
      nombre: `Entrega ${vinculada.nombre} — ${clienteNombre}`,
      empresaId: vinculada.empresaId,
      empresaVinculadaId: vinculada.id,
      clientes: {
        create: {
          clienteId: cliente.id,
          orden: 0,
          ...(observaciones || items ? {
            supervisorEtiqueta: JSON.stringify({ observaciones, items }),
          } : {}),
        },
      },
    },
  })

  if (!cliente.lat && !cliente.lng && cliente.direccion) {
    await entregasQueue.add('geocodificar', { clienteId: cliente.id })
  }

  return NextResponse.json({ id: ruta.id, ordenId: orden.id, estado: 'pendiente' }, { status: 201 })
}

// GET ?id=xxx&apiKey=xxx — consultar estado
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  const apiKey = searchParams.get('apiKey')

  if (!id || !apiKey) {
    return NextResponse.json({ error: 'id y apiKey requeridos' }, { status: 400 })
  }

  const vinculada = await prisma.empresaVinculada.findUnique({ where: { apiKey } })
  if (!vinculada || !vinculada.activa) {
    return NextResponse.json({ error: 'API key inválida' }, { status: 403 })
  }

  const ruta = await prisma.ruta.findFirst({
    where: { id, empresaVinculadaId: vinculada.id },
    select: {
      id: true,
      nombre: true,
      cerrada: true,
      cerradaEl: true,
      createdAt: true,
      clientes: {
        select: {
          cliente: { select: { nombre: true, nit: true } },
          supervisorEtiqueta: true,
        },
      },
    },
  })

  if (!ruta) return NextResponse.json({ error: 'Entrega no encontrada' }, { status: 404 })

  return NextResponse.json({
    id: ruta.id,
    estado: ruta.cerrada ? 'entregada' : 'pendiente',
    cerradaEl: ruta.cerradaEl,
    createdAt: ruta.createdAt,
    cliente: ruta.clientes[0]?.cliente ?? null,
  })
}
