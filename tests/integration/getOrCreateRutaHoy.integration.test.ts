/**
 * Tests de integración — getOrCreateRutaHoy contra BD real (staging)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getOrCreateRutaHoy } from '@/lib/rutas/getOrCreateRutaHoy'

const EMP = 'test-intg-01'
const EMP_ID = 'test-intg-emp-01'

async function limpiarRutas() {
  await prisma.rutaEmpleado.deleteMany({ where: { empleadoId: EMP_ID } })
  await prisma.ruta.deleteMany({ where: { empresaId: EMP } })
}

beforeEach(async () => { await limpiarRutas() })
afterEach(async () => { await limpiarRutas() })

describe('getOrCreateRutaHoy — integración BD real', () => {
  it('sin ruta hoy → crea una con nombre del empleado', async () => {
    const r = await getOrCreateRutaHoy(EMP_ID, EMP)

    expect(r.rutaId).toBeDefined()
    expect(r.posible_entrega).toBeInstanceOf(Date)

    const ruta = await prisma.ruta.findUnique({ where: { id: r.rutaId } })
    expect(ruta).not.toBeNull()
    expect(ruta!.nombre).toContain('Repartidor Test')
    expect(ruta!.empresaId).toBe(EMP)
  })

  it('idempotencia: dos llamadas seguidas retornan el mismo rutaId', async () => {
    const r1 = await getOrCreateRutaHoy(EMP_ID, EMP)
    const r2 = await getOrCreateRutaHoy(EMP_ID, EMP)

    expect(r1.rutaId).toBe(r2.rutaId)

    // Solo debe existir 1 ruta
    const rutas = await prisma.ruta.findMany({ where: { empresaId: EMP } })
    expect(rutas).toHaveLength(1)
  })

  it('ruta hoy NO iniciada → retorna esa ruta, no crea nueva', async () => {
    const r1 = await getOrCreateRutaHoy(EMP_ID, EMP)
    const r2 = await getOrCreateRutaHoy(EMP_ID, EMP)

    expect(r2.rutaId).toBe(r1.rutaId)
    const rutas = await prisma.ruta.findMany({ where: { empresaId: EMP } })
    expect(rutas).toHaveLength(1)
  })

  it('ruta hoy iniciada → crea ruta mañana', async () => {
    const r1 = await getOrCreateRutaHoy(EMP_ID, EMP)

    // Marcar como iniciada
    await prisma.ruta.update({ where: { id: r1.rutaId }, data: { iniciada: true } })

    const r2 = await getOrCreateRutaHoy(EMP_ID, EMP)
    expect(r2.rutaId).not.toBe(r1.rutaId)

    // Ahora deben existir 2 rutas
    const rutas = await prisma.ruta.findMany({ where: { empresaId: EMP } })
    expect(rutas).toHaveLength(2)
  })

  it('nombre único: segunda ruta del mismo día agrega sufijo', async () => {
    const r1 = await getOrCreateRutaHoy(EMP_ID, EMP)
    await prisma.ruta.update({ where: { id: r1.rutaId }, data: { iniciada: true } })

    // Crear ruta mañana
    const r2 = await getOrCreateRutaHoy(EMP_ID, EMP)

    // Verificar que r2 tiene nombre distinto a r1
    const ruta1 = await prisma.ruta.findUnique({ where: { id: r1.rutaId } })
    const ruta2 = await prisma.ruta.findUnique({ where: { id: r2.rutaId } })
    expect(ruta1!.nombre).not.toBe(ruta2!.nombre)
  })
})
