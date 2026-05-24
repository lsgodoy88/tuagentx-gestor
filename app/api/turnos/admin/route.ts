import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'

function formatHora(d: Date) {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
}
function formatFecha(d: Date) {
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
}
function calcDuracion(inicio: Date, fin: Date | null, pausaMin: number = 0) {
  const ms = (fin ? fin.getTime() : Date.now()) - inicio.getTime()
  const total = Math.max(0, ms - pausaMin * 60000)
  const h = Math.floor(total / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  return h + "h " + String(m).padStart(2,"0") + "m"
}

export async function GET(req: NextRequest) {
  try {

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const user = session.user as any
  const esAdmin = user.role === "empresa" || user.role === "supervisor"
  if (!esAdmin) return NextResponse.json({ error: "Sin acceso" }, { status: 403 })
  const empresaId = getEmpresaId(user)

  const { searchParams } = new URL(req.url)
  const modo = searchParams.get("modo") || "hoy"
  const rol = searchParams.get("rol") || ""
  const page = parseInt(searchParams.get("page") || "1")
  const LIMIT = 15

  const fechaHoy = new Date().toLocaleString("sv-SE", { timeZone: "America/Bogota" }).split(" ")[0]
  const inicioDia = new Date(fechaHoy + "T00:00:00")
  const finDia = new Date(fechaHoy + "T23:59:59")

  const whereBase: any = {
    empleado: { empresaId, ...(rol ? { rol } : {}) },
  }

  if (modo === "hoy") {
    whereBase.inicio = { gte: inicioDia, lte: finDia }
  } else {
    const hace30 = new Date(Date.now() - 5*60*60*1000)
    hace30.setDate(hace30.getDate() - 30)
    whereBase.inicio = { gte: hace30 }
    whereBase.fin = { not: null }
  }

  const [turnos, total] = await Promise.all([
    prisma.turno.findMany({
      where: whereBase,
      orderBy: { inicio: "desc" },
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      include: {
        empleado: { select: { nombre: true, rol: true } }
      }
    }),
    prisma.turno.count({ where: whereBase })
  ])

  const data = (turnos as any[]).map((t: any) => {
    const ini = new Date(t.inicio)
    const fin = t.fin ? new Date(t.fin) : null
    const pausaIni = t.pausaInicio ? new Date(t.pausaInicio) : null
    const durTotal = fin ? Math.floor((fin.getTime() - ini.getTime()) / 60000) : Math.floor((Date.now() - ini.getTime()) / 60000)
    const pausaMin = t.pausaDuracionMin || 0
    const durEfectivo = Math.max(0, durTotal - pausaMin)
    const fmtMin = (m: number) => Math.floor(m/60) + "h " + String(m%60).padStart(2,"0") + "m"
    return {
      id: t.id,
      empleado: t.empleado.nombre,
      rol: t.empleado.rol,
      fecha: formatFecha(ini),
      inicio: formatHora(ini),
      fin: fin ? formatHora(fin) : null,
      activo: !fin,
      pausado: t.pausado,
      pausaMotivo: t.pausaMotivo || null,
      pausaInicio: pausaIni ? formatHora(pausaIni) : null,
      pausaDuracionMin: pausaMin,
      duracionTotal: fmtMin(durTotal),
      duracionEfectiva: fmtMin(durEfectivo),
      latInicio: t.latInicio || null,
      lngInicio: t.lngInicio || null,
      latFin: t.latFin || null,
      lngFin: t.lngFin || null,
    }
  })

  return NextResponse.json({ turnos: data, total, page, pages: Math.ceil(total / LIMIT) })
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
