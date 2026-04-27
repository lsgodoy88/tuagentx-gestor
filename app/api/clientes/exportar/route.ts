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

  const clientes = await prisma.cliente.findMany({
    where: { empresaId },
    orderBy: { nombre: 'asc' },
    select: {
      apiId: true,
      nit: true,
      nombre: true,
      telefono: true,
      direccion: true,
      ciudad: true,
      lista: { select: { nombre: true } },
    },
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Clientes')
  ws.columns = [
    { header: 'API',        key: 'api',        width: 20 },
    { header: 'NIT/Cédula', key: 'nit',        width: 18 },
    { header: 'Nombre',     key: 'nombre',     width: 30 },
    { header: 'Teléfono',   key: 'telefono',   width: 16 },
    { header: 'Dirección',  key: 'direccion',  width: 34 },
    { header: 'Ciudad',     key: 'ciudad',     width: 26 },
    { header: 'Lista',      key: 'lista',      width: 22 },
  ]

  const VERDE_OSCURO = 'FF14532D'
  const GRIS_HEADER  = 'FF3F3F46'

  // Encabezados: verde oscuro por defecto, gris en API y NIT
  ws.getRow(1).eachCell((cell, colNum) => {
    const esGris = colNum === 1 || colNum === 2
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: esGris ? GRIS_HEADER : VERDE_OSCURO } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.getRow(1).height = 22

  // Comentarios en encabezados
  ws.getCell(1, 1).note = 'ID para llamadas API — no modificar una vez asignado'
  ws.getCell(1, 2).note = 'NIT o Cédula del cliente. No editar — se usa como clave para actualizar registros existentes.'
  ws.getCell(1, 3).note = 'Nombre completo del cliente (obligatorio).'
  ws.getCell(1, 4).note = 'Número de teléfono o celular del cliente.'
  ws.getCell(1, 5).note = 'Dirección física del cliente.'
  ws.getCell(1, 6).note = 'Ciudad en formato Departamento/Ciudad.'
  ws.getCell(1, 7).note = 'Nombre de la lista asignada al cliente.'

  const GRIS_CELDA = 'FFF0F0F0'

  clientes.forEach(c => {
    const row = ws.addRow({
      api:      c.apiId    || '',
      nit:      c.nit      || '',
      nombre:   c.nombre,
      telefono: c.telefono || '',
      direccion:c.direccion|| '',
      ciudad:   c.ciudad   || '',
      lista:    (c as any).lista?.nombre || '',
    })
    // Columna API: fondo gris, texto gris itálico — no editar
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_CELDA } }
    row.getCell(1).font = { color: { argb: 'FF71717A' }, italic: true }
    // Columna NIT: fondo gris, texto gris oscuro — no editar
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_CELDA } }
    row.getCell(2).font = { color: { argb: 'FF71717A' } }
  })

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="clientes_exportados.xlsx"',
    },
  })
}
