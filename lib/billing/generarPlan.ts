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
    select: { id: true, nombre: true, montoNegociado: true, creditoSaldo: true },
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

// Usar slots contratados (maxVendedores, etc) — igual que Master
    const empresaSlots = await prisma.empresa.findUnique({
      where: { id: empresa.id },
      select: { maxVendedores: true, maxSupervisores: true, maxBodega: true, maxEntregas: true, maxImpulsadoras: true },
    })

    let desglose: any[]
    let monto: number

    if ((empresa as any).montoNegociado) {
      monto = (empresa as any).montoNegociado
      desglose = [{ rol: 'negociado', cantidad: 1, precioUnitario: monto, subtotal: monto }]
    } else {
      const slots = [
        { rol: 'vendedor',    cantidad: empresaSlots?.maxVendedores   ?? 0 },
        { rol: 'supervisor',  cantidad: empresaSlots?.maxSupervisores  ?? 0 },
        { rol: 'bodega',      cantidad: empresaSlots?.maxBodega        ?? 0 },
        { rol: 'entregas',    cantidad: empresaSlots?.maxEntregas      ?? 0 },
        { rol: 'impulsadora', cantidad: empresaSlots?.maxImpulsadoras  ?? 0 },
      ].filter(s => s.cantidad > 0)

      desglose = slots.map(s => ({
        rol: s.rol,
        cantidad: s.cantidad,
        precioUnitario: precios[s.rol] ?? 0,
        subtotal: s.cantidad * (precios[s.rol] ?? 0),
      }))
      monto = desglose.reduce((s: number, d: any) => s + d.subtotal, 0)
      if (monto === 0) continue
    }

    // Descontar crédito acumulado de pagos anteriores
    const credito = (empresa as any).creditoSaldo ?? 0
    const montoFinal = Math.max(0, monto - credito)
    const creditoUsado = monto - montoFinal

    await (prisma as any).planEmpresa.create({
      data: {
        id: `plan-${empresa.id}-${mesStr}`,
        empresaId: empresa.id,
        mes: mesStr,
        fechaCorte,
        fechaLimite,
        monto: montoFinal,
        montoOriginal: monto,      // inmutable — monto base antes de crédito
        saldo: montoFinal,         // saldo a cobrar (se reduce con pagos parciales)
        desglose,
        estado: montoFinal === 0 ? 'pagado' : 'pendiente',
      },
    })

    // Reducir creditoSaldo en lo que se usó
    if (creditoUsado > 0) {
      await (prisma as any).empresa.update({
        where: { id: empresa.id },
        data: { creditoSaldo: credito - creditoUsado },
      })
    }

    resultados.push({ empresaId: empresa.id, nombre: empresa.nombre, accion: 'creado', mes: mesStr, monto: montoFinal, montoBase: monto, creditoUsado, desglose })
  }

  return { ok: true, mes: mesStr, resultados }
}
