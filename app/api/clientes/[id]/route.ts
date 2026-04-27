import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expandirDireccion } from '@/lib/maps'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  // Ruta rápida: solo actualizar coordenadas temporales
  if ('latTmp' in body || 'lngTmp' in body) {
    const existing = await prisma.cliente.findUnique({ where: { id }, select: { lat: true, lng: true } })
    // Solo actualizar si el cliente NO tiene coordenadas definitivas
    if (existing?.lat && existing?.lng) {
      return NextResponse.json({ skipped: true })
    }
    const cliente = await prisma.cliente.update({
      where: { id },
      data: { latTmp: body.latTmp ?? null, lngTmp: body.lngTmp ?? null }
    })
    return NextResponse.json(cliente)
  }

  const { nit, nombre, nombreComercial, direccion, telefono, ciudad, listaId, apiId, maps: mapsManual } = body

  // Nunca sobreescribir apiId si ya tiene valor en BD
  const existing = await prisma.cliente.findUnique({ where: { id }, select: { apiId: true, maps: true } })
  const nuevoApiId = existing?.apiId ? undefined : (apiId || null)

  // Auto-generate maps if not manually provided and not already set
  let mapsUrl = mapsManual || null
  if (!mapsUrl && !existing?.maps) {
    mapsUrl = expandirDireccion(direccion, ciudad)
  } else if (!mapsManual && existing?.maps) {
    mapsUrl = existing.maps
  }

  const cliente = await prisma.cliente.update({
    where: { id },
    data: {
      nit: nit || null,
      nombre: nombre || undefined,
      nombreComercial: nombreComercial || null,
      direccion: direccion || null,
      telefono: telefono || null,
      ciudad: ciudad || null,
      listaId: listaId !== undefined ? (listaId || null) : undefined,
      maps: mapsUrl,
      ...(nuevoApiId !== undefined ? { apiId: nuevoApiId } : {}),
    }
  })
  return NextResponse.json(cliente)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
