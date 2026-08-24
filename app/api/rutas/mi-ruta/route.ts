/**
 * GET /api/rutas/mi-ruta
 * Devuelve rutaHoy y rutaMañana consolidando TODAS las rutas del empleado
 * (puede haber rutas de múltiples empresas vinculadas el mismo día).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expandirDireccion } from '@/lib/maps'
import { nowBogota, inicioDiaBogota, finDiaBogota } from '@/lib/fechas'

const DELAY_MS = 1100
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function geocodificarCliente(clienteId: string, direccion: string | null | undefined, ciudad: string | null | undefined) {
  const mapsUrl = expandirDireccion(direccion, ciudad)
  if (!mapsUrl) return null
  const queryMatch = mapsUrl.match(/\?q=(.+)$/)
  if (!queryMatch) return null
  const query = decodeURIComponent(queryMatch[1])
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=co`,
      { headers: { 'User-Agent': 'TuAgentX/1.0' } }
    )
    const data = await res.json()
    if (data?.[0]?.lat && data?.[0]?.lon) {
      const latTmp = parseFloat(data[0].lat)
      const lngTmp = parseFloat(data[0].lon)
      await prisma.cliente.update({ where: { id: clienteId }, data: { latTmp, lngTmp } })
      return { latTmp, lngTmp }
    }
  } catch {}
  return null
}

const RC_SELECT = {
  id: true, clienteId: true, orden: true, notas: true,
  rezago: true, asignadoEn: true, posible_entrega: true,
  cliente: {
    select: {
      id: true, nombre: true, nombreComercial: true,
      direccion: true, ciudad: true, telefono: true,
      nit: true, lat: true, lng: true, latTmp: true, lngTmp: true
    }
  }
}

async function enrichRutaClientes(clientes: any[]) {
  const numerosNotas = clientes
    .filter((rc: any) => rc.notas?.startsWith('Bodega/'))
    .map((rc: any) => { const m = rc.notas!.match(/#(\d+)/); return m ? m[1] : null })
    .filter(Boolean) as string[]

  if (numerosNotas.length === 0) return clientes

  // Sin filtro empresaId — órdenes pueden ser de cualquier empresa vinculada
  const [porFactura, porOrden] = await Promise.all([
    prisma.ordenDespacho.findMany({
      where: { numeroFactura: { in: numerosNotas }, estado: { in: ['pendiente', 'alistado', 'en_entrega', 'entregado'] } },
      select: { id: true, numeroFactura: true, numeroOrden: true, empresaId: true, observacion: true, estado: true, entregadoEl: true,
        alistadoPor: { select: { nombre: true } },
        empresaVinculada: { select: { nombre: true } }, createdAt: true }
    }),
    prisma.ordenDespacho.findMany({
      where: { numeroOrden: { in: numerosNotas }, numeroFactura: null, estado: { in: ['pendiente', 'alistado', 'en_entrega', 'entregado'] } },
      select: { id: true, numeroFactura: true, numeroOrden: true, empresaId: true, observacion: true, estado: true, entregadoEl: true,
        alistadoPor: { select: { nombre: true } },
        empresaVinculada: { select: { nombre: true } }, createdAt: true }
    })
  ])

  const mapOrdenes = new Map<string, any>()
  for (const o of [...porFactura, ...porOrden]) {
    if (o.numeroFactura) mapOrdenes.set(o.numeroFactura, o)
    if (o.numeroOrden) mapOrdenes.set(o.numeroOrden, o)
  }

  return clientes.map((rc: any) => {
    if (!rc.notas?.startsWith('Bodega/')) return rc
    const m = rc.notas.match(/#(\d+)/)
    const num = m ? m[1] : rc.notas.split('/')[1]?.split(' ')[0]
    const empresaNota = rc.notas.replace('Bodega/', '').replace(/#\d+/, '').trim()
    const orden = mapOrdenes.get(num)
    return {
      ...rc,
      ordenDespachoId: orden?.id || null,
      observacion: orden?.observacion || null,
      ordenEstado: orden?.estado || null,
      entregadoEl: orden?.entregadoEl || null,
      numeroFactura: orden?.numeroFactura || null,
      empresaOrigen: orden?.empresaVinculada?.nombre || empresaNota || null,
      alistadoPor: orden?.alistadoPor?.nombre || null,
      ordenCreadaEl: orden?.createdAt || null,
    }
  })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json(null)
  const user = session.user as any

  const ahoraBog = nowBogota()
  const hoyInicio = inicioDiaBogota(ahoraBog)
  const mananaInicio = finDiaBogota(ahoraBog)
  const pasadoInicio = finDiaBogota(new Date(ahoraBog.getTime() + 24 * 60 * 60 * 1000))

  // ── Limpieza lazy: borrar RutaCliente ya entregados, auto-cerrar rutas vacías ──
  // Caso A (Bodega): señal = OrdenDespacho.estado = 'entregado'
  // Caso B (cliente manual): señal = Visita tipo 'entrega' del empleado para ese clienteId
  // Tras limpiar: rutas sin clientes pendientes → cerrada = true
  {
    const todosRcSinCerrar = await prisma.rutaCliente.findMany({
      where: { ruta: { cerrada: false, empleados: { some: { empleadoId: user.id } } } },
      select: { id: true, rutaId: true, notas: true, clienteId: true }
    })

    if (todosRcSinCerrar.length > 0) {
      // Caso A — Bodega: cruzar por numeroFactura con OrdenDespacho
      const rcBodega = todosRcSinCerrar.filter((rc: any) => rc.notas?.startsWith('Bodega/'))
      const numerosFactura = rcBodega
        .map((rc: any) => { const m = rc.notas?.match(/#(\d+)/); return m ? m[1] : null })
        .filter(Boolean) as string[]

      const facturasEntregadas = new Set(
        numerosFactura.length > 0
          ? (await (prisma as any).ordenDespacho.findMany({
              where: { numeroFactura: { in: numerosFactura }, estado: 'entregado' },
              select: { numeroFactura: true }
            })).map((o: any) => o.numeroFactura)
          : []
      )

      // Caso B — cliente manual: cruzar clienteId con Visita tipo entrega del empleado
      const rcManuales = todosRcSinCerrar.filter((rc: any) => !rc.notas?.startsWith('Bodega/'))
      const clienteIdsManuales = [...new Set(rcManuales.map((rc: any) => rc.clienteId))]

      const clientesConVisita = new Set(
        clienteIdsManuales.length > 0
          ? (await prisma.visita.findMany({
              where: { clienteId: { in: clienteIdsManuales }, empleadoId: user.id, tipo: 'entrega' },
              select: { clienteId: true }
            })).map((v: any) => v.clienteId)
          : []
      )

      const rcABorrar = todosRcSinCerrar.filter((rc: any) => {
        if (rc.notas?.startsWith('Bodega/')) {
          const m = rc.notas.match(/#(\d+)/)
          return m && facturasEntregadas.has(m[1])
        }
        return clientesConVisita.has(rc.clienteId)
      })

      if (rcABorrar.length > 0) {
        await prisma.rutaCliente.deleteMany({ where: { id: { in: rcABorrar.map((rc: any) => rc.id) } } })

        // Auto-cierre: rutas que quedaron sin clientes
        const rutaIdsAfectadas = [...new Set(rcABorrar.map((rc: any) => rc.rutaId))]
        const conteos = await prisma.rutaCliente.groupBy({
          by: ['rutaId'],
          where: { rutaId: { in: rutaIdsAfectadas } },
          _count: { id: true }
        })
        const rutasConClientes = new Set(conteos.map((c: any) => c.rutaId))
        const rutasAVaciar = rutaIdsAfectadas.filter(id => !rutasConClientes.has(id))
        if (rutasAVaciar.length > 0) {
          await prisma.ruta.updateMany({
            where: { id: { in: rutasAVaciar }, cerrada: false },
            data: { cerrada: true }
          })
        }
      }
    }
  }

  // Ajuste lazy: RutaCliente con posible_entrega < hoy y ruta no iniciada → actualizar a hoy
  // Esto permite que órdenes de días anteriores aparezcan como "de hoy" si no se inició la ruta
  const rezagosViejos = await prisma.rutaCliente.findMany({
    where: {
      OR: [{ posible_entrega: { lt: hoyInicio } }, { posible_entrega: null }],
      ruta: {
        cerrada: false,
        iniciada: false,
        empleados: { some: { empleadoId: user.id } }
      }
    },
    select: { id: true }
  })
  if (rezagosViejos.length > 0) {
    await prisma.rutaCliente.updateMany({
      where: { id: { in: rezagosViejos.map((r: any) => r.id) } },
      data: { posible_entrega: hoyInicio }
    })
  }

  // También actualizar fecha de la ruta si es de día anterior y no iniciada
  await prisma.ruta.updateMany({
    where: {
      cerrada: false,
      iniciada: false,
      fecha: { lt: hoyInicio },
      empleados: { some: { empleadoId: user.id } }
    },
    data: { fecha: hoyInicio }
  })

  // Todas las rutas del empleado — sin filtrar empresaId
  const rutasLinks = await prisma.rutaEmpleado.findMany({
    where: { empleadoId: user.id },
    select: {
      ruta: {
        select: {
          id: true, nombre: true, fecha: true, cerrada: true, iniciada: true, empresaId: true,
          clientes: { select: RC_SELECT, orderBy: { orden: 'asc' } }
        }
      }
    }
  })

  const todasRutas = rutasLinks.map((l: any) => l.ruta)

  // Rutas HOY — incluye cerradas para mostrar entregados del día completo
  const rutasHoy = todasRutas.filter((r: any) =>
    r.fecha &&
    new Date(r.fecha) >= hoyInicio &&
    new Date(r.fecha) < mananaInicio
  )

  // Rutas MAÑANA
  const rutasMañana = todasRutas.filter((r: any) =>
    !r.cerrada && // mañana sí filtramos cerradas — son pendientes reales
    r.fecha &&
    new Date(r.fecha) >= mananaInicio &&
    new Date(r.fecha) < pasadoInicio
  )

  // Consolidar clientes de todas las rutas hoy/mañana
  // Ordenar: rezagos primero, luego por orden
  const clientesHoyRaw = rutasHoy
    .flatMap((r: any) => r.clientes.map((rc: any) => ({ ...rc, _rutaId: r.id, _rutaIniciada: r.iniciada })))
    .sort((a: any, b: any) => {
      if (a.rezago && !b.rezago) return -1
      if (!a.rezago && b.rezago) return 1
      return a.orden - b.orden
    })

  const clientesMañanaRaw = rutasMañana
    .flatMap((r: any) => r.clientes.map((rc: any) => ({ ...rc, _rutaId: r.id })))
    .sort((a: any, b: any) => a.orden - b.orden)

  // Iniciada = true si alguna ruta hoy está iniciada y no cerrada
  const iniciada = rutasHoy.some((r: any) => r.iniciada && !r.cerrada)
  const cerrada = rutasHoy.length > 0 && rutasHoy.every((r: any) => r.cerrada)
  // Ruta principal = primera NO cerrada de hoy (para PATCH iniciar/cerrar)
  const rutaAbierta = rutasHoy.find((r: any) => !r.cerrada)

  const rutaPrincipal = rutaAbierta ?? rutasHoy[0] ?? null

  const [clientesHoy, clientesMañana] = await Promise.all([
    enrichRutaClientes(clientesHoyRaw),
    enrichRutaClientes(clientesMañanaRaw)
  ])

  // Geocodificación lazy en background
  if (user.role === 'entregas' && clientesHoyRaw.length > 0) {
    const sinCoords = clientesHoyRaw.filter((rc: any) =>
      !rc.cliente.lat && !rc.cliente.lng && !rc.cliente.latTmp && !rc.cliente.lngTmp
    )
    if (sinCoords.length > 0) {
      setImmediate(async () => {
        for (let i = 0; i < sinCoords.length; i++) {
          if (i > 0) await sleep(DELAY_MS)
          await geocodificarCliente(sinCoords[i].clienteId, sinCoords[i].cliente.direccion, sinCoords[i].cliente.ciudad)
        }
      })
    }
  }

  return NextResponse.json({
    rutaHoy: rutaPrincipal ? {
      ...rutaPrincipal,
      iniciada,
      cerrada,
      clientes: clientesHoy,
      _todasRutasHoyIds: rutasHoy.filter((r: any) => !r.cerrada).map((r: any) => r.id)
    } : null,
    rutaMañana: rutasMañana.length > 0 ? {
      ...rutasMañana[0],
      clientes: clientesMañana,
      _todasRutasMañanaIds: rutasMañana.map((r: any) => r.id)
    } : null,
  })
}
