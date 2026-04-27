import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const body = await req.json()
  const { horaInicioRuta, horaFinRuta, autoCrearRuta, autoCerrarRuta, diasCrearRuta, diasCerrarRuta, ciudadEntregaLocal, diasHistorialBodega, bodegaPuedeEnviar } = body

  const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/
  if (horaInicioRuta && !horaRegex.test(horaInicioRuta)) {
    return NextResponse.json({ error: 'Formato de hora inválido (HH:MM)' }, { status: 400 })
  }
  if (horaFinRuta && !horaRegex.test(horaFinRuta)) {
    return NextResponse.json({ error: 'Formato de hora inválido (HH:MM)' }, { status: 400 })
  }
  if (diasHistorialBodega !== undefined) {
    const n = Number(diasHistorialBodega)
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      return NextResponse.json({ error: 'diasHistorialBodega debe ser entre 1 y 30' }, { status: 400 })
    }
  }

  const rows = await prisma.$queryRaw<[{
    horaInicioRuta: string; horaFinRuta: string; autoCrearRuta: boolean; autoCerrarRuta: boolean;
    diasCrearRuta: string; diasCerrarRuta: string; ciudadEntregaLocal: string | null;
    diasHistorialBodega: number; bodegaPuedeEnviar: boolean
  }]>`
    SELECT "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta",
           "diasCrearRuta", "diasCerrarRuta", "ciudadEntregaLocal", "diasHistorialBodega", "bodegaPuedeEnviar"
    FROM gestor."Empresa" WHERE id = ${user.id} LIMIT 1
  `
  const cur = rows[0] ?? { horaInicioRuta: '07:00', horaFinRuta: '21:00', autoCrearRuta: false, autoCerrarRuta: false, diasCrearRuta: '0,1,2,3,4', diasCerrarRuta: '0,1,2,3,4', ciudadEntregaLocal: null, diasHistorialBodega: 7, bodegaPuedeEnviar: false }

  const finalHoraInicio        = horaInicioRuta    !== undefined ? horaInicioRuta   : cur.horaInicioRuta
  const finalHoraFin           = horaFinRuta       !== undefined ? horaFinRuta      : cur.horaFinRuta
  const finalAutoCrear         = autoCrearRuta     !== undefined ? autoCrearRuta    : cur.autoCrearRuta
  const finalAutoCerrar        = autoCerrarRuta    !== undefined ? autoCerrarRuta   : cur.autoCerrarRuta
  const finalDiasCrear         = diasCrearRuta     !== undefined ? diasCrearRuta    : cur.diasCrearRuta
  const finalDiasCerrar        = diasCerrarRuta    !== undefined ? diasCerrarRuta   : cur.diasCerrarRuta
  const finalCiudad            = 'ciudadEntregaLocal'  in body  ? ciudadEntregaLocal   : cur.ciudadEntregaLocal
  const finalDiasBodega        = diasHistorialBodega !== undefined ? Number(diasHistorialBodega) : cur.diasHistorialBodega
  const finalBodegaPuedeEnviar = bodegaPuedeEnviar !== undefined ? Boolean(bodegaPuedeEnviar)   : cur.bodegaPuedeEnviar

  await prisma.$executeRaw`
    UPDATE gestor."Empresa"
    SET "horaInicioRuta"      = ${finalHoraInicio},
        "horaFinRuta"         = ${finalHoraFin},
        "autoCrearRuta"       = ${finalAutoCrear},
        "autoCerrarRuta"      = ${finalAutoCerrar},
        "diasCrearRuta"       = ${finalDiasCrear},
        "diasCerrarRuta"      = ${finalDiasCerrar},
        "ciudadEntregaLocal"  = ${finalCiudad},
        "diasHistorialBodega" = ${finalDiasBodega},
        "bodegaPuedeEnviar"   = ${finalBodegaPuedeEnviar}
    WHERE id = ${user.id}
  `

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  if (!empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<[{
    horaInicioRuta: string; horaFinRuta: string; autoCrearRuta: boolean; autoCerrarRuta: boolean;
    diasCrearRuta: string; diasCerrarRuta: string; ciudadEntregaLocal: string | null;
    diasHistorialBodega: number; bodegaPuedeEnviar: boolean
  }]>`
    SELECT "horaInicioRuta", "horaFinRuta", "autoCrearRuta", "autoCerrarRuta", "diasCrearRuta", "diasCerrarRuta",
           "ciudadEntregaLocal", "diasHistorialBodega", "bodegaPuedeEnviar"
    FROM gestor."Empresa" WHERE id = ${empresaId} LIMIT 1
  `
  return NextResponse.json(rows[0] ?? { horaInicioRuta: '07:00', horaFinRuta: '21:00', autoCrearRuta: false, autoCerrarRuta: false, diasCrearRuta: '0,1,2,3,4', diasCerrarRuta: '0,1,2,3,4', ciudadEntregaLocal: null, diasHistorialBodega: 7, bodegaPuedeEnviar: false })
}
