import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularEstado } from '@/lib/cartera'
import ExcelJS from 'exceljs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  if (!['empresa', 'supervisor'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const contentType = req.headers.get('content-type') || ''

  let rows: any[] = []

  if (contentType.includes('multipart/form-data')) {
    // Archivo xlsx o csv
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se envió archivo' }, { status: 400 })

    const arrayBuf = await file.arrayBuffer()
    const nombre = file.name.toLowerCase()

    if (nombre.endsWith('.csv') || file.type === 'text/csv') {
      rows = parseCsv(Buffer.from(arrayBuf).toString('utf-8'))
    } else {
      // xlsx
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(arrayBuf)
      const ws = wb.worksheets[0]
      if (!ws) return NextResponse.json({ error: 'Hoja vacía' }, { status: 400 })

      const headers: string[] = []
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) {
          row.eachCell((cell, col) => {
            headers[col] = String(cell.value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
          })
        } else {
          const obj: any = {}
          headers.forEach((h, col) => {
            if (h) {
              const v = row.getCell(col).value
              obj[h] = v instanceof Date ? v.toISOString().split('T')[0] : (v ?? '')
            }
          })
          if (Object.values(obj).some(v => v !== '' && v != null)) rows.push(obj)
        }
      })
    }
  } else {
    // JSON legacy { rows }
    const body = await req.json()
    rows = body.rows || []
  }

  if (!rows.length) return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 })

  // Cache de empleados por email
  const empleadoCache: Record<string, any> = {}
  async function getEmpleado(email: string) {
    if (!email) return null
    if (empleadoCache[email] !== undefined) return empleadoCache[email]
    const emp = await prisma.empleado.findFirst({
      where: { empresaId, email: { equals: email.trim(), mode: 'insensitive' }, activo: true }
    })
    empleadoCache[email] = emp
    return emp
  }

  // Cache de clientes por nit
  const clienteCache: Record<string, any> = {}
  async function getOrCreateCliente(nit: string, nombre: string, celular: string) {
    const key = nit.trim()
    if (clienteCache[key]) return clienteCache[key]
    let cliente = await prisma.cliente.findFirst({
      where: { empresaId, nit: { equals: key, mode: 'insensitive' } }
    })
    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: {
          nombre: nombre || `Cliente ${key}`,
          nit: key,
          telefono: celular || null,
          empresaId,
        }
      })
    }
    clienteCache[key] = cliente
    return cliente
  }

  // Cache de carteras por clienteId+empleadoId
  const carteraCache: Record<string, any> = {}
  async function getOrCreateCartera(clienteId: string, empleadoId: string | null) {
    const key = `${clienteId}__${empleadoId ?? 'none'}`
    if (carteraCache[key]) return carteraCache[key]
    const where: any = { clienteId, empresaId }
    if (empleadoId) where.empleadoId = empleadoId
    else where.empleadoId = null
    let cartera = await prisma.cartera.findFirst({ where })
    if (!cartera) {
      cartera = await prisma.cartera.create({
        data: { clienteId, empresaId, saldoTotal: 0, saldoPendiente: 0, fuente: 'xlsx', empleadoId }
      })
    }
    carteraCache[key] = cartera
    return cartera
  }

  const errores: any[] = []
  const importados: any[] = []

  for (const row of rows) {
    const nit = String(row['nit'] || '').trim()
    const nombreCliente = String(row['nombre_cliente'] || row['nombre'] || '').trim()
    const celular = String(row['celular'] || '').trim()
    const vendedorEmail = String(row['vendedor_email'] || '').trim()
    const numeroFactura = String(row['numero_factura'] || row['numerofactura'] || '').trim()
    const concepto = String(row['concepto'] || '').trim()
    const valorFactura = Number(row['valor_factura'] || row['valor'] || 0)
    const abonos = Number(row['abonos'] || 0)
    const fechaVencStr = String(row['fecha_vencimiento'] || row['fechavencimiento'] || '').trim()

    if (!nit || isNaN(valorFactura) || valorFactura <= 0) {
      errores.push({ nit, error: 'NIT o valor_factura inválido' })
      continue
    }

    // Resolver vendedor
    let empId: string | null = null
    if (vendedorEmail) {
      const emp = await getEmpleado(vendedorEmail)
      if (!emp) {
        errores.push({ nit, error: `Vendedor ${vendedorEmail} no encontrado` })
        continue
      }
      empId = emp.id
    }

    // Resolver cliente
    const cliente = await getOrCreateCliente(nit, nombreCliente, celular)

    // Resolver cartera (una por nit+empleadoId)
    const cartera = await getOrCreateCartera(cliente.id, empId)

    // Calcular saldo
    const saldo = Math.max(0, valorFactura - abonos)
    const fechaVenc = fechaVencStr ? new Date(fechaVencStr) : null
    const { estado } = calcularEstado(saldo, valorFactura, abonos, fechaVenc)

    // Crear detalle
    await prisma.detalleCartera.create({
      data: {
        carteraId: cartera.id,
        numeroFactura: numeroFactura || null,
        concepto: concepto || null,
        valorFactura,
        valor: valorFactura,
        abonos,
        celular: celular || null,
        fechaVencimiento: fechaVenc,
        estado,
        empleadoId: empId,
      }
    })

    // Actualizar saldo de cartera
    await prisma.cartera.update({
      where: { id: cartera.id },
      data: {
        saldoTotal: { increment: valorFactura },
        saldoPendiente: { increment: saldo },
        updatedAt: new Date(),
        ...(celular && !cartera.celular ? { celular } : {}),
      }
    })

    importados.push({ nit, cliente: cliente.nombre, valorFactura, saldo, empleadoId: empId })
  }

  return NextResponse.json({ importados: importados.length, errores })
}

function parseCsv(text: string): any[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))
  const rows: any[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(s => s.trim())
    const row: any = {}
    headers.forEach((h, idx) => { row[h] = cols[idx] || '' })
    if (Object.values(row).some(v => v !== '')) rows.push(row)
  }
  return rows
}
