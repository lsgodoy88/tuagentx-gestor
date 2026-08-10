import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function fmt(v: any) { return parseFloat(String(v ?? 0)) }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const modo = searchParams.get('modo') || 'pendientes'

  if (modo === 'todos') {
    const proveedores = await (prisma as any).proveedor.findMany({
      where: {
        empresaId: user.empresaId, condition: true,
        ...(q ? { OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { document: { contains: q } },
        ]} : {}),
      },
      orderBy: { firstName: 'asc' },
      take: 50,
      select: { id: true, firstName: true, lastName: true, document: true, api_id: true },
    })
    return NextResponse.json({ proveedores })
  }

  // Modo pendientes — agrega por proveedor, solo con saldo > 0
  const rows: any[] = await (prisma as any).$queryRaw`
    SELECT
      p.id, p."firstName", p."lastName", p.document, p.api_id,
      p.aplica_retencion, p.porcentaje_retencion,
      p.banco, p.numero_cuenta, p.whatsapp, p.phone, p.address,
      COALESCE(SUM(e.valor), 0)           AS deuda,
      COALESCE(SUM(e.valor - e.saldo), 0) AS pagos,
      COALESCE(SUM(e.saldo), 0)           AS saldo
    FROM "Proveedor" p
    INNER JOIN "Egreso" e
      ON e."proveedorId" = p.id
      AND e."empresaId" = ${user.empresaId}
      AND e.saldo > 0
    WHERE p."empresaId" = ${user.empresaId}
      AND p.condition = true
    GROUP BY p.id, p."firstName", p."lastName", p.document, p.api_id,
             p.aplica_retencion, p.porcentaje_retencion,
             p.banco, p.numero_cuenta, p.whatsapp, p.phone, p.address
    HAVING COALESCE(SUM(e.saldo), 0) > 0
    ORDER BY SUM(e.saldo) DESC
  `

  const proveedores = rows
    .map(r => ({ ...r, deuda: fmt(r.deuda), pagos: fmt(r.pagos), saldo: fmt(r.saldo) }))
    .filter(r => !q || r.firstName?.toLowerCase().includes(q.toLowerCase()) || r.lastName?.toLowerCase().includes(q.toLowerCase()))

  return NextResponse.json({ proveedores })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  if (!body.firstName?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const proveedor = await (prisma as any).proveedor.create({
    data: {
      empresaId: user.empresaId,
      firstName: body.firstName.trim().toUpperCase(),
      lastName: body.lastName?.trim().toUpperCase() || null,
      document: body.document?.trim() || null,
      documentType: body.documentType?.trim() || null,
      verificationDigit: body.verificationDigit?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim().toUpperCase() || null,
      neighborhood: body.neighborhood?.trim().toUpperCase() || null,
      note: body.note?.trim() || null,
      condition: true,
      aplica_retencion: body.aplica_retencion ?? false,
      porcentaje_retencion: body.porcentaje_retencion ? parseFloat(body.porcentaje_retencion) : null,
      banco: body.banco?.trim() || null,
      numero_cuenta: body.numero_cuenta?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
    },
  })
  return NextResponse.json({ ok: true, proveedor })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.empresaId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (user.role !== 'empresa' && user.role !== 'supervisor') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json()
  const { id, ...campos } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const data: any = {}
  const str = (v: any) => v?.trim() || null
  if (campos.firstName !== undefined) data.firstName = campos.firstName.trim().toUpperCase()
  if (campos.lastName !== undefined) data.lastName = str(campos.lastName)?.toUpperCase()
  if (campos.document !== undefined) data.document = str(campos.document)
  if (campos.email !== undefined) data.email = str(campos.email)?.toLowerCase()
  if (campos.phone !== undefined) data.phone = str(campos.phone)
  if (campos.address !== undefined) data.address = str(campos.address)?.toUpperCase()
  if (campos.condition !== undefined) data.condition = campos.condition
  if (campos.aplica_retencion !== undefined) data.aplica_retencion = campos.aplica_retencion
  if (campos.porcentaje_retencion !== undefined) data.porcentaje_retencion = campos.porcentaje_retencion ? parseFloat(campos.porcentaje_retencion) : null
  if (campos.banco !== undefined) data.banco = str(campos.banco)
  if (campos.numero_cuenta !== undefined) data.numero_cuenta = str(campos.numero_cuenta)
  if (campos.whatsapp !== undefined) data.whatsapp = str(campos.whatsapp)
  // Asociar egreso a proveedor desde fila egreso
  if (campos.proveedorId !== undefined) data.proveedorId = campos.proveedorId || null

  const proveedor = await (prisma as any).proveedor.update({
    where: { id, empresaId: user.empresaId }, data,
  })
  return NextResponse.json({ ok: true, proveedor })
}
