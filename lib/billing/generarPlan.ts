import { prisma, DB_SCHEMA } from '@/lib/prisma'

const ROLES_BILLING = ['vendedor', 'supervisor', 'bodega', 'entregas', 'impulsadora']
const EMPRESAS_EXENTAS = ['superadmin-001', 'cmn7o4pcg0000vmeg0utky01w'] // superadmin + admin

export async function generarPlanMes(mesOverride?: string, soloEmpresaId?: string) {
  const ahora = new Date()
  const anio = ahora.getFullYear()
  const mes = ahora.getMonth() + 1
  const mesStr = mesOverride ?? `${anio}-${String(mes).padStart(2, '0')}`

  // fechaCorte = día 1 del mes a las 00:00 Bogotá (UTC-5 = +5h)
  const fechaCorte = new Date(`${mesStr}-01T05:00:00.000Z`)
  // fechaLimite = día 5 del mes
  const fechaLimite = new Date(`${mesStr}-05T05:00:00.000Z`)

  // Precios globales
  const preciosRows = await (prisma as any).precioRol.findMany({
    where: { rol: { in: ROLES_BILLING } },
    select: { rol: true, precio: true },
  })
  const precios: Record<string, number> = Object.fromEntries(preciosRows.map((p: any) => [p.rol, p.precio]))

  // Empresas activas no exentas con al menos un vendedor activo
  const empresas = await prisma.empresa.findMany({
    where: {
      activo: true,
      id: { notIn: EMPRESAS_EXENTAS, ...(soloEmpresaId ? { in: [soloEmpresaId] } : {}) },
      empleados: { some: { rol: 'vendedor', activo: true } },
    },
    select: { id: true, nombre: true, montoNegociado: true },
  })

  const resultados: any[] = []

  for (const empresa of empresas) {
    // Verificar si ya existe plan para este mes
    const existente = await (prisma as any).planEmpresa.findUnique({
      where: { empresaId_mes: { empresaId: empresa.id, mes: mesStr } },
    })
    if (existente) {
      resultados.push({ empresaId: empresa.id, nombre: empresa.nombre, accion: 'ya_existe', mes: mesStr })
      continue
    }

    // Contar empleados activos por rol al momento del corte
    const conteos = await (prisma as any).empleado.groupBy({
      by: ['rol'],
      where: { empresaId: empresa.id, activo: true, rol: { in: ROLES_BILLING } },
      _count: { id: true },
    })

    let desglose: any[]
    let monto: number

    if ((empresa as any).montoNegociado) {
      // Valor negociado — superpone el cálculo automático
      monto = (empresa as any).montoNegociado
      desglose = [{ rol: 'negociado', cantidad: 1, precioUnitario: monto, subtotal: monto }]
    } else {
      desglose = conteos.map((c: any) => ({
        rol: c.rol,
        cantidad: c._count.id,
        precioUnitario: precios[c.rol] ?? 0,
        subtotal: c._count.id * (precios[c.rol] ?? 0),
      }))
      monto = desglose.reduce((s: number, d: any) => s + d.subtotal, 0)
      if (monto === 0) continue // sin empleados facturables
    }

    await (prisma as any).planEmpresa.create({
      data: {
        id: `plan-${empresa.id}-${mesStr}`,
        empresaId: empresa.id,
        mes: mesStr,
        fechaCorte,
        fechaLimite,
        monto,
        desglose,
        estado: 'pendiente',
      },
    })

    resultados.push({ empresaId: empresa.id, nombre: empresa.nombre, accion: 'creado', mes: mesStr, monto, desglose })
  }

  return { ok: true, mes: mesStr, resultados }
}
