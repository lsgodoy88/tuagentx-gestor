import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { DIAS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const { semanaInicio } = await req.json()
  const inicio = new Date(semanaInicio)

  const rutasFijas = await prisma.rutaFija.findMany({
    where: { empresaId },
    include: {
      empleados: true,
      clientes: { orderBy: { orden: 'asc' } }
    }
  })

  const rutasCreadas = []

  for (const rf of rutasFijas) {
    // Calcular fecha del día de la semana
    const fecha = new Date(inicio)
    fecha.setDate(inicio.getDate() + rf.diaSemana)

    const dd = String(fecha.getDate()).padStart(2,'0')
    const mm = String(fecha.getMonth()+1).padStart(2,'0')
    const yy = String(fecha.getFullYear()).slice(2)
    const nombre = `${DIAS[rf.diaSemana]} ${dd}-${mm}-${yy}`

    const ruta = await prisma.ruta.create({
      data: {
        id: crypto.randomUUID(),
        nombre,
        fecha,
        empresaId,
        empleados: {
          create: rf.empleados.map(e => ({ id: crypto.randomUUID(), empleadoId: e.empleadoId }))
        },
        clientes: {
          create: rf.clientes.map(c => ({ id: crypto.randomUUID(), clienteId: c.clienteId, orden: c.orden }))
        }
      }
    })
    rutasCreadas.push(ruta)
  }

  return NextResponse.json({ ok: true, count: rutasCreadas.length })
}
