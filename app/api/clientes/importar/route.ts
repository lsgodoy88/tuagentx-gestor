import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermiso } from '@/lib/permisos'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa' && !checkPermiso(session, 'editarClientes')) {
    return NextResponse.json({ error: 'Sin permiso para importar clientes' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const body = await req.json()
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Se esperaba un array' }, { status: 400 })

  // Obtener NITs únicos del archivo para consultarlos en una sola query
  const nitsArchivo = [...new Set(body.map((c: any) => String(c.nit || '').trim()).filter(Boolean))]

  const existentes = await prisma.cliente.findMany({
    where: { empresaId, nit: { in: nitsArchivo } },
    select: { id: true, nit: true, apiId: true },
  })
  const existentesPorNit = new Map(existentes.map(c => [c.nit!, { id: c.id, apiId: c.apiId }]))

  const toCreate: any[] = []
  const toUpdate: { id: string; data: any }[] = []
  const errores: { nit: string; error: string }[] = []

  for (const c of body) {
    const nit = String(c.nit || '').trim()
    if (!nit || !c.nombre) {
      errores.push({ nit: nit || '(sin NIT)', error: 'Falta NIT o nombre' })
      continue
    }
    const apiIdEntrante = c.apiId ? String(c.apiId).trim() : null
    const campos: any = {
      nombre:         String(c.nombre).trim(),
      nombreComercial:c.nombreComercial ? String(c.nombreComercial).trim() : null,
      direccion:      c.direccion  ? String(c.direccion).trim()  : null,
      telefono:       c.telefono   ? String(c.telefono).trim()   : null,
      ciudad:         c.ciudad     ? String(c.ciudad).trim()     : null,
      listaId:        c.listaId    || null,
    }
    if (existentesPorNit.has(nit)) {
      const existente = existentesPorNit.get(nit)!
      // Solo actualizar apiId si el registro en BD no tiene uno ya
      if (!existente.apiId && apiIdEntrante) campos.apiId = apiIdEntrante
      toUpdate.push({ id: existente.id, data: campos })
    } else {
      toCreate.push({ id: crypto.randomUUID(), nit, empresaId, apiId: apiIdEntrante, ...campos })
    }
  }

  // Crear nuevos en bloque
  const created = await prisma.cliente.createMany({ data: toCreate, skipDuplicates: true })

  // Actualizar existentes individualmente
  let actualizados = 0
  for (const { id, data } of toUpdate) {
    try {
      await prisma.cliente.update({ where: { id }, data })
      actualizados++
    } catch (e: any) {
      errores.push({ nit: id, error: e.message })
    }
  }

  return NextResponse.json({
    ok: true,
    creados: created.count,
    actualizados,
    errores,
  })
}
