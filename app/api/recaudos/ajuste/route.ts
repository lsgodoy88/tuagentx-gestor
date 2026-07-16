import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getEmpresaId } from '@/lib/auth-helpers'
import { invalidarCacheCliente } from '@/lib/cartera/saldoCliente'

/**
 * PATCH /api/recaudos/ajuste
 * Ajuste manual admin sobre una SyncDeuda en tab Revisar.
 * Write-once: no sobreescribe si ya tiene ajusteManual.
 * Body: { syncDeudaId: string, monto: number, nota: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const user = session.user as any
    if (!['empresa', 'superadmin'].includes(user.role)) {
      return NextResponse.json({ error: 'Solo administradores pueden aplicar ajustes' }, { status: 403 })
    }

    const empresaId = getEmpresaId(user)
    const { syncDeudaId, monto, nota } = await req.json()

    if (!syncDeudaId || !monto || !nota?.trim()) {
      return NextResponse.json({ error: 'syncDeudaId, monto y nota son requeridos' }, { status: 400 })
    }
    if (Number(monto) <= 0) {
      return NextResponse.json({ error: 'El monto debe ser positivo' }, { status: 400 })
    }

    const integracion = await (prisma as any).integracion.findFirst({
      where: { empresaId }, select: { id: true }
    })
    if (!integracion) return NextResponse.json({ error: 'Sin integración' }, { status: 400 })

    const deuda = await (prisma as any).syncDeuda.findFirst({
      where: { id: syncDeudaId, integracionId: integracion.id },
      select: { id: true, ajusteManual: true, clienteApiId: true }
    })
    if (!deuda) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })
    if (deuda.ajusteManual != null) {
      return NextResponse.json({ error: 'Esta deuda ya tiene un ajuste aplicado' }, { status: 409 })
    }

    await (prisma as any).syncDeuda.update({
      where: { id: syncDeudaId },
      data: {
        ajusteManual: Number(monto),
        ajusteNota: nota.trim(),
        ajusteFecha: new Date()
      }
    })

    await invalidarCacheCliente(empresaId, deuda.clienteApiId).catch(() => {})

    return NextResponse.json({ ok: true, monto: Number(monto), nota: nota.trim() })

  } catch (err: any) {
    console.error('[recaudos/ajuste]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
