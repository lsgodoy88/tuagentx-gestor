import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  // Get a sample vendedor email
  const vendedor = await prisma.empleado.findFirst({
    where: { empresaId, activo: true, rol: 'vendedor' },
    select: { email: true },
  })
  const vendedorEmail = vendedor?.email ?? 'vendedor@empresa.com'

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Cartera')

  ws.columns = [
    { header: 'nit', key: 'nit', width: 15 },
    { header: 'nombre_cliente', key: 'nombre_cliente', width: 28 },
    { header: 'celular', key: 'celular', width: 15 },
    { header: 'vendedor_email', key: 'vendedor_email', width: 28 },
    { header: 'numero_factura', key: 'numero_factura', width: 18 },
    { header: 'concepto', key: 'concepto', width: 30 },
    { header: 'valor_factura', key: 'valor_factura', width: 16 },
    { header: 'abonos', key: 'abonos', width: 14 },
    { header: 'fecha_vencimiento', key: 'fecha_vencimiento', width: 20 },
  ]

  // Style header row
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.getRow(1).height = 22

  ws.addRow({ nit: '900123456', nombre_cliente: 'Distribuidora ABC', celular: '3001234567', vendedor_email: vendedorEmail, numero_factura: 'FAC-001', concepto: 'Venta productos', valor_factura: 500000, abonos: 0, fecha_vencimiento: '2026-05-15' })
  ws.addRow({ nit: '900123456', nombre_cliente: 'Distribuidora ABC', celular: '3001234567', vendedor_email: vendedorEmail, numero_factura: 'FAC-002', concepto: 'Venta servicios', valor_factura: 250000, abonos: 50000, fecha_vencimiento: '2026-04-30' })
  ws.addRow({ nit: '800456789', nombre_cliente: 'Comercial XYZ', celular: '3109876543', vendedor_email: vendedorEmail, numero_factura: 'FAC-101', concepto: 'Pedido mensual', valor_factura: 1200000, abonos: 0, fecha_vencimiento: '2026-05-01' })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-cartera.xlsx"',
    },
  })
}
