import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import bcrypt from 'bcryptjs'

function slugify(n: string) {
  return n.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const rolFiltro = searchParams.get('rol')
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  // Supervisor: solo ve sus vendedores + impulsadoras de esos vendedores
  if (user.role === 'supervisor') {
    const asignados = await prisma.supervisorVendedor.findMany({ where: { supervisorId: user.id }, select: { vendedorId: true } })
    const vendedorIds = asignados.map((a: any) => a.vendedorId)
    const empleados = await prisma.empleado.findMany({
      where: { empresaId, activo: true, OR: [ { id: { in: vendedorIds } }, { rol: 'impulsadora', vendedorId: { in: vendedorIds } } ] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, telefono: true, vendedorId: true, empresaId: true, createdAt: true, puedeCapturarGps: true, ciudades: true, listasAsignadas: { select: { listaId: true, lista: { select: { nombre: true } } } } }
    })
    return NextResponse.json({ empleados, limites: {} })
  }

  const [empleados, empresa] = await Promise.all([
    prisma.empleado.findMany({ where: rolFiltro ? { empresaId, rol: rolFiltro } : { empresaId }, orderBy: { createdAt: 'desc' }, select: { id: true, nombre: true, email: true, rol: true, activo: true, telefono: true, vendedorId: true, empresaId: true, createdAt: true, puedeCapturarGps: true, ciudades: true, permisos: true, etiqueta: true, listasAsignadas: { select: { listaId: true, lista: { select: { nombre: true } } } }, vendedoresAsignados: { select: { vendedorId: true } } } }),
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { maxSupervisores: true, maxVendedores: true, maxEntregas: true, maxImpulsadoras: true, maxBodega: true } })
  ])
  return NextResponse.json({ empleados, limites: empresa })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const empresaId = user.role === 'empresa' ? user.id : user.empresaId
  const { nombre, rol, telefono, password, vendedorId, puedeCapturarGps, ciudades, listaIds, vendedorIds, permisos, etiqueta, apiId } = await req.json()
  if (!nombre || !rol || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  // Obtener slug de la empresa
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } })
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  // Validar limite de rol
  const limiteMap: any = { supervisor: 'maxSupervisores', vendedor: 'maxVendedores', entregas: 'maxEntregas', impulsadora: 'maxImpulsadoras', bodega: 'maxBodega' }
  const limiteKey = limiteMap[rol]
  if (limiteKey) {
    const max = (empresa as any)[limiteKey] || 0
    const actual = await prisma.empleado.count({ where: { empresaId, rol, activo: true } })
    if (actual >= max) return NextResponse.json({ error: `Limite de ${rol}s alcanzado (${max})` }, { status: 400 })
  }

  const slugEmpresa = slugify(empresa.nombre)
  const slugNombre = slugify(nombre)
  const email = `${slugNombre}@${slugEmpresa}`

  const existe = await prisma.empleado.findUnique({ where: { email } })
  if (existe) return NextResponse.json({ error: 'Ya existe un empleado con ese nombre' }, { status: 400 })

  const hash = await bcrypt.hash(password, 10)
  const empleado = await prisma.empleado.create({
    data: {
      nombre,
      email,
      password: hash,
      rol,
      telefono: telefono || null,
      vendedorId: vendedorId || null,
      puedeCapturarGps: puedeCapturarGps ?? false,
      ciudades: ciudades || [],
      permisos: permisos ?? {},
      etiqueta: etiqueta || null,
      apiId: apiId || null,
      empresaId,
      ...(listaIds?.length ? { listasAsignadas: { create: (listaIds as string[]).map((listaId: string) => ({ listaId })) } } : {})
    }
  })

  // Supervisor: guardar vendedores asignados
  if (rol === 'supervisor' && Array.isArray(vendedorIds) && vendedorIds.length > 0) {
    await prisma.supervisorVendedor.createMany({
      data: (vendedorIds as string[]).map((vid: string) => ({ supervisorId: empleado.id, vendedorId: vid })),
      skipDuplicates: true,
    })
  }

  await audit('EMPLEADO_CREADO', user.email, `Empleado: ${nombre} | Rol: ${rol}`, empleado.id, empresaId)
  return NextResponse.json({ ok: true, email, empleado })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const { id, nombre, email, telefono, password, vendedorId, puedeCapturarGps, listaIds, vendedorIds, permisos, ciudades, etiqueta } = await req.json()
  const data: any = { nombre, telefono: telefono || null, vendedorId: vendedorId !== undefined ? vendedorId : undefined, puedeCapturarGps: puedeCapturarGps !== undefined ? puedeCapturarGps : undefined }
  if (email) data.email = email
  if (password) data.password = await bcrypt.hash(password, 10)
  if (ciudades !== undefined) data.ciudades = ciudades
  if (permisos !== undefined) data.permisos = permisos
  if (etiqueta !== undefined) data.etiqueta = etiqueta || null
  if (apiId !== undefined) data.apiId = apiId || null
  if (listaIds !== undefined) {
    data.listasAsignadas = {
      deleteMany: {},
      create: (listaIds as string[]).map((listaId: string) => ({ listaId }))
    }
  }
  const empleado = await prisma.empleado.update({ where: { id }, data })

  // Supervisor: reemplazar vendedores asignados
  if (vendedorIds !== undefined) {
    await prisma.supervisorVendedor.deleteMany({ where: { supervisorId: id } })
    if (Array.isArray(vendedorIds) && vendedorIds.length > 0) {
      await prisma.supervisorVendedor.createMany({
        data: (vendedorIds as string[]).map((vid: string) => ({ supervisorId: id, vendedorId: vid })),
        skipDuplicates: true,
      })
    }
  }

  await audit('EMPLEADO_ACTUALIZADO', user.email, `Empleado: ${id}`, id, user.empresaId)
  return NextResponse.json({ ok: true, empleado })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  await prisma.empleado.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
