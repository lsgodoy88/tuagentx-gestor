import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    empleadoLista: { findMany: vi.fn() },
    empleado: { update: vi.fn() },
    supervisorVendedor: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

import { PUT } from '@/app/api/empleados/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

const SESSION = { user: { id: 'emp-1', role: 'empresa', email: 'e@x.com', empresaId: 'emp-1' } } as any

const makeReq = (body: any) => new NextRequest('http://localhost/api/empleados', {
  method: 'PUT', body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  ;(getServerSession as any).mockResolvedValue(SESSION)
  ;(prisma as any).empleado.update.mockResolvedValue({ id: 'e1', nombre: 'Test' })
})

describe('PUT /api/empleados — guard reducción de listas', () => {
  it('listaIds con MENOS listas que las actuales, sin confirmar → 409, no actualiza', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([
      { listaId: 'L1' }, { listaId: 'L2' }, { listaId: 'L3' },
    ])

    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L1'] }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('REDUCCION_LISTAS_SIN_CONFIRMAR')
    expect(json.listaIdsRemovidas.sort()).toEqual(['L2', 'L3'])
    expect((prisma as any).empleado.update).not.toHaveBeenCalled()
  })

  it('listaIds con MENOS listas, con confirmarReduccionListas:true → procede normal', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([
      { listaId: 'L1' }, { listaId: 'L2' }, { listaId: 'L3' },
    ])

    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L1'], confirmarReduccionListas: true }))

    expect(res.status).toBe(200)
    expect((prisma as any).empleado.update).toHaveBeenCalledTimes(1)
  })

  it('cambiar de lista (L1→L2) sí remueve L1 → requiere confirmación igual que cualquier reducción', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([
      { listaId: 'L1' },
    ])

    const sinConfirmar = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L2'] }))
    expect(sinConfirmar.status).toBe(409)

    const conConfirmar = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L2'], confirmarReduccionListas: true }))
    expect(conConfirmar.status).toBe(200)
  })

  it('misma lista única (sin cambio real) → no es reducción, no bloquea', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([
      { listaId: 'L1' },
    ])

    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L1'] }))

    expect(res.status).toBe(200)
  })

  it('listaIds undefined (no se está editando listas) → no consulta empleadoLista ni bloquea', async () => {
    const res = await PUT(makeReq({ id: 'e1', nombre: 'Solo cambio de nombre' }))

    expect(res.status).toBe(200)
    expect((prisma as any).empleadoLista.findMany).not.toHaveBeenCalled()
  })

  it('listaIds: [] (vaciar todas las listas) sin confirmar → 409', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([{ listaId: 'L1' }])

    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: [] }))

    expect(res.status).toBe(409)
  })

  it('empleado sin listas previas + listaIds:[] → no hay nada que remover, procede', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([])

    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: [] }))

    expect(res.status).toBe(200)
  })
})

describe('PUT /api/empleados — guard 1 sola lista por vendedor', () => {
  it('listaIds con 2+ elementos → 400, no consulta ni actualiza', async () => {
    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L1', 'L2'] }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect((prisma as any).empleadoLista.findMany).not.toHaveBeenCalled()
    expect((prisma as any).empleado.update).not.toHaveBeenCalled()
  })

  it('listaIds con 1 elemento → no activa el guard de cantidad, sigue flujo normal', async () => {
    ;(prisma as any).empleadoLista.findMany.mockResolvedValue([])
    const res = await PUT(makeReq({ id: 'e1', nombre: 'Claudia', listaIds: ['L1'] }))

    expect(res.status).toBe(200)
  })
})
