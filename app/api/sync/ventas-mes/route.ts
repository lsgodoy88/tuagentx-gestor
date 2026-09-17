import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcularVentasMesImpulsos } from '@/lib/integracion/venta-mes'

// Job horario — recalcula VentaMesCliente sin adapter (solo BD local)
// Liviano: no hace HTTP a UpTres, usa OrdenDespacho local
export async function POST(req: NextRequest) {
  const isCron = req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!isCron) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const inicio = Date.now()
  const empresas = await prisma.empresa.findMany({
    where: { activo: true },
    select: { id: true, nombre: true }
  })

  const resultados: any[] = []
  for (const empresa of empresas) {
    try {
      const t = Date.now()
      await recalcularVentasMesImpulsos(empresa.id)
      resultados.push({ empresaId: empresa.id, nombre: empresa.nombre, ms: Date.now() - t })
      console.log(`[ventas-mes-cron] ${empresa.nombre} OK ${Date.now() - t}ms`)
    } catch (e: any) {
      console.error(`[ventas-mes-cron] ${empresa.nombre} error:`, e.message)
      resultados.push({ empresaId: empresa.id, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, totalMs: Date.now() - inicio, resultados })
}
