import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = session.user as any
  const empresaId = user.role === 'empresa' ? user.id : user.empresaId

  const listas = await prisma.listaClientes.findMany({
    where: { empresaId },
    select: { nombre: true },
    orderBy: { nombre: 'asc' }
  })

  const colombiaRaw = readFileSync(join(process.cwd(), 'public', 'colombia.json'), 'utf-8')
  const colombia = JSON.parse(colombiaRaw)
  const todasCiudades: string[] = []
  colombia.forEach((dep: any) => dep.ciudades.forEach((c: string) => todasCiudades.push(c)))

  console.log('[plantilla] listas:', listas.length, '| ciudades:', todasCiudades.length)

  const wb = new ExcelJS.Workbook()

  // --- Hoja oculta _listas (ANTES de aplicar validación) ---
  const wsL = wb.addWorksheet('_listas')
  wsL.state = 'veryHidden'
  listas.forEach((l, i) => {
    wsL.getCell(i + 1, 1).value = l.nombre
  })

  // --- Hoja oculta _ciudades (ANTES de aplicar validación) ---
  const wsC = wb.addWorksheet('_ciudades')
  wsC.state = 'veryHidden'
  todasCiudades.forEach((c, i) => {
    wsC.getCell(i + 1, 1).value = c
  })

  // --- Hoja principal Clientes ---
  const ws = wb.addWorksheet('Clientes')
  ws.columns = [
    { header: 'nit',             key: 'nit',             width: 15 },
    { header: 'nombre',          key: 'nombre',          width: 25 },
    { header: 'celular',         key: 'celular',         width: 15 },
    { header: 'direccion',       key: 'direccion',       width: 30 },
    { header: 'nombre_comercial',key: 'nombre_comercial',width: 25 },
    { header: 'ciudad',          key: 'ciudad',          width: 25 },
    { header: 'lista',           key: 'lista',           width: 20 },
    { header: 'api',             key: 'api',             width: 20 },
  ]

  ws.getRow(1).eachCell((cell, colNum) => {
    const esApi = colNum === 9
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: esApi ? 'FF3F3F46' : 'FF16A34A' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.getRow(1).height = 20
  ws.getCell(1, 1).note = 'ID para llamadas API — no modificar una vez asignado'
  ws.addRow({
    nit: '123456789',
    nombre: 'Ejemplo Cliente',
    celular: '3001234567',
    direccion: 'Calle 1 #2-3',
    nombre_comercial: 'Tienda Ejemplo',
    ciudad: 'Cundinamarca/Bogota',
    lista: listas[0]?.nombre || '',
    api: ''
  })
  ws.getRow(2).getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
  ws.getRow(2).getCell(9).font = { color: { argb: 'FF71717A' }, italic: true }

  // --- Validaciones fila por fila (100 filas de datos) ---
  const VALIDATION_ROWS = 100
  if (listas.length > 0) {
    console.log(`[plantilla] aplicando validación lista H2:H${VALIDATION_ROWS + 1}`)
    for (let r = 2; r <= VALIDATION_ROWS + 1; r++) {
      ws.getCell(r, 7).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`_listas!$A$1:$A$${listas.length}`],
        showErrorMessage: true,
        errorTitle: 'Lista invalida',
        error: 'Selecciona una lista de las disponibles'
      }
    }
  }

  if (todasCiudades.length > 0) {
    console.log(`[plantilla] aplicando validación ciudad G2:G${VALIDATION_ROWS + 1}`)
    for (let r = 2; r <= VALIDATION_ROWS + 1; r++) {
      ws.getCell(r, 6).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`_ciudades!$A$1:$A$${todasCiudades.length}`],
        showErrorMessage: false
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_clientes.xlsx"',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  })
}
