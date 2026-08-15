import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEmpresaId } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

const ROL_A_MAX: Record<string, string> = {
  vendedor:    'maxVendedores',
  supervisor:  'maxSupervisores',
  bodega:      'maxBodega',
  entregas:    'maxEntregas',
  impulsadora: 'maxImpulsadoras',
}

// DELETE — eliminar slot vacío de un rol
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const empresaId = getEmpresaId(user)
  const { rol } = await req.json()
  const maxKey = ROL_A_MAX[rol]
  if (!maxKey) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { [maxKey]: true } as any,
  })
  const maxActual = (empresa as any)?.[maxKey] ?? 0
  if (maxActual <= 0) return NextResponse.json({ error: 'Sin slots para eliminar' }, { status: 400 })

  // Contar empleados (activos e inactivos) con ese rol — si hay alguno, no se puede eliminar
  const totalEmpleados = await prisma.empleado.count({
    where: { empresaId, rol },
  })
  if (totalEmpleados >= maxActual) {
    return NextResponse.json({ error: 'Todos los slots tienen empleados asignados' }, { status: 400 })
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { [maxKey]: maxActual - 1 } as any,
  })

  return NextResponse.json({ ok: true, [maxKey]: maxActual - 1 })
}
