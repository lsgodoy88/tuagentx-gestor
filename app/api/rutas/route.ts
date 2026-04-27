import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { fechaBogotaStr, inicioDiaBogota, finDiaBogota } from '@/lib/fecha'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const rutas = await prisma.ruta.findMany({
    where: { empresaId },
    include: {
      empleados: { include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } } },
      clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  })
  // Batch: un solo query de visitas para todas las rutas
  const rutasConFecha = rutas.filter((r: any) => r.fecha)
  let todasVisitasBatch: any[] = []
  if (rutasConFecha.length > 0) {
    const allEmpIds = [...new Set(rutasConFecha.flatMap((r: any) => r.empleados.map((e: any) => e.empleadoId)))]
    const allCliIds = [...new Set(rutasConFecha.flatMap((r: any) => r.clientes.map((c: any) => c.clienteId)))]
    const rutasDates = rutasConFecha.map((r: any) => new Date(r.fecha).getTime())
    const minDate = new Date(Math.min(...rutasDates)); minDate.setHours(0, 0, 0, 0)
    const maxDate = new Date(Math.max(...rutasDates)); maxDate.setHours(23, 59, 59, 999)
    todasVisitasBatch = await prisma.visita.findMany({
      where: {
        empleadoId: { in: allEmpIds },
        clienteId: { in: allCliIds },
        fechaBogota: { gte: minDate, lte: maxDate }
      },
      include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: 2000
    })
  }
  const rutasConVisitas = rutas.map((ruta: any) => {
    const fechaRuta = ruta.fecha ? new Date(ruta.fecha) : null
    if (!fechaRuta) return { ...ruta, visitas: [] }
    const fechaStr = fechaBogotaStr(fechaRuta)
    const inicio = inicioDiaBogota(fechaStr)
    const fin = finDiaBogota(fechaStr)
    const empSet = new Set(ruta.empleados.map((e: any) => e.empleadoId))
    const cliSet = new Set(ruta.clientes.map((c: any) => c.clienteId))
    const visitas = todasVisitasBatch.filter((v: any) =>
      empSet.has(v.empleadoId) && cliSet.has(v.clienteId) &&
      new Date(v.fechaBogota) >= inicio && new Date(v.fechaBogota) <= fin
    )
    return { ...ruta, visitas }
  })
  return NextResponse.json(rutasConVisitas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { nombre, fecha, empleadoIds, clienteIds } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  // Nombre unico: si ya existe agregar (1), (2), etc.
  let nombreFinal = nombre
  let contador = 1
  while (true) {
    const existe = await prisma.ruta.findFirst({ where: { empresaId, nombre: nombreFinal } })
    if (!existe) break
    nombreFinal = `${nombre} (${contador})`
    contador++
  }

  // Detectar rezagos: clientes pendientes de rutas anteriores (batch paralelo)
  const rezagos: { clienteId: string, orden: number }[] = []
  const empIdsRezago = empleadoIds || []
  if (empIdsRezago.length > 0) {
    const [rutasAnteriores, visitasEmpArray] = await Promise.all([
      Promise.all(empIdsRezago.map((empId: string) =>
        prisma.ruta.findFirst({
          where: { empresaId, empleados: { some: { empleadoId: empId } } },
          include: { clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } } },
          orderBy: { createdAt: 'desc' }
        })
      )),
      Promise.all(empIdsRezago.map((empId: string) =>
        prisma.visita.findMany({ where: { empleadoId: empId }, take: 200, orderBy: { createdAt: 'desc' } })
      ))
    ])
    for (let idx = 0; idx < empIdsRezago.length; idx++) {
      const rutaAnterior = rutasAnteriores[idx]
      const visitasRuta = visitasEmpArray[idx]
      if (!rutaAnterior) continue
      const fechaRuta = rutaAnterior.fecha
        ? new Date(rutaAnterior.fecha).toISOString().split('T')[0]
        : new Date(new Date(rutaAnterior.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
      for (const rc of rutaAnterior.clientes) {
        const tieneVisita = visitasRuta.some((v: any) => {
          if (v.clienteId !== rc.clienteId) return false
          const fv = v.fechaBogota
            ? new Date(v.fechaBogota).toISOString().split('T')[0]
            : new Date(new Date(v.createdAt).getTime() - 5*60*60*1000).toISOString().split('T')[0]
          return fv === fechaRuta
        })
        if (!tieneVisita && !rezagos.find(r => r.clienteId === rc.clienteId)) {
          rezagos.push({ clienteId: rc.clienteId, orden: rc.orden })
        }
      }
    }
  }

  // Deduplicar: no agregar clientes que ya vienen como rezago
  const rezagoIds = new Set(rezagos.map(r => r.clienteId))
  const clientesNuevos = (clienteIds || []).filter((id: string) => !rezagoIds.has(id))
  const supData = user.role === 'supervisor' ? { supervisorId: user.id, supervisorEtiqueta: (user as any).etiqueta || null } : {}
  const clientesFinales = [
    ...rezagos.map((r, i) => ({ id: crypto.randomUUID(), clienteId: r.clienteId, orden: i, rezago: true, ...supData })),
    ...clientesNuevos.map((id: string, i: number) => ({ id: crypto.randomUUID(), clienteId: id, orden: rezagos.length + i, rezago: false, ...supData }))
  ]

  const ruta = await prisma.ruta.create({
    data: {
      id: crypto.randomUUID(),
      nombre: nombreFinal,
      fecha: fecha ? new Date(fecha + 'T05:00:00.000Z') : null,
      empresaId,
      empleados: {
        create: (empleadoIds || []).map((id: string) => ({
          id: crypto.randomUUID(),
          empleadoId: id
        }))
      },
      clientes: {
        create: clientesFinales
      }
    },
    include: {
      empleados: { include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } } },
      clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }
    }
  })
  await audit('RUTA_CREADA', user.email, `Ruta: ${ruta.nombre}`, user.id, user.id)
  return NextResponse.json({ ok: true, ruta })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No se pueden eliminar rutas. El historial debe preservarse.' }, { status: 403 })
  }
  const { id } = await req.json()
  await prisma.rutaEmpleado.deleteMany({ where: { rutaId: id } })
  await prisma.rutaCliente.deleteMany({ where: { rutaId: id } })
  await prisma.ruta.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { id, nombre, fecha, empleadoIds, clienteIds } = await req.json()
  const supData = user.role === 'supervisor' ? { supervisorId: user.id, supervisorEtiqueta: (user as any).etiqueta || null } : {}

  // Eliminar relaciones actuales
  await prisma.rutaEmpleado.deleteMany({ where: { rutaId: id } })
  await prisma.rutaCliente.deleteMany({ where: { rutaId: id } })

  // Recrear
  const ruta = await prisma.ruta.update({
    where: { id },
    data: {
      nombre,
      fecha: fecha ? new Date(fecha + 'T05:00:00.000Z') : null,
      empleados: {
        create: (empleadoIds || []).map((eid: string) => ({
          id: crypto.randomUUID(),
          empleadoId: eid
        }))
      },
      clientes: {
        create: (clienteIds || []).map((cid: string, i: number) => ({
          id: crypto.randomUUID(),
          clienteId: cid,
          orden: i,
          ...supData
        }))
      }
    },
    include: {
      empleados: { include: { empleado: { select: { id: true, nombre: true, email: true, telefono: true, rol: true, activo: true, vendedorId: true, puedeCapturarGps: true, empresaId: true, createdAt: true } } } },
      clientes: { include: { cliente: true }, orderBy: { orden: 'asc' } }
    }
  })

  // Notificar empleados
  const { enviarPushEmpleados } = await import('@/lib/push')
  await enviarPushEmpleados(
    empleadoIds,
    '🗺️ Ruta actualizada',
    `Tu ruta "${nombre}" ha sido actualizada`,
    '/dashboard/mi-ruta'
  )

  return NextResponse.json({ ok: true, ruta })
}
