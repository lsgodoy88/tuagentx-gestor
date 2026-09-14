import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))
vi.mock('@/app/generated/prisma', () => ({ Prisma: { raw: (s: string) => s } }))
vi.mock('@/lib/media/upload', () => ({
  subirMediaArchivo: vi.fn(),
  eliminarMediaArchivo: vi.fn(),
}))

import { GET, POST } from '@/app/api/media/archivos/route'
import { DELETE, PATCH } from '@/app/api/media/carpetas/[id]/route'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { subirMediaArchivo, eliminarMediaArchivo } from '@/lib/media/upload'

const EMPRESA = { user: { role: 'empresa', empresaId: 'emp-1' } } as any
const VENDEDOR = { user: { role: 'vendedor', empresaId: 'emp-1' } } as any

const makeReq = (method: string, body?: any, search = '') =>
  new NextRequest(`http://localhost/api/media/archivos${search}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  })

const params = (id: string) => ({ params: Promise.resolve({ id }) })

// ── GET archivos ───────────────────────────────────────────────────────────
describe('GET /api/media/archivos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await GET(makeReq('GET', undefined, '?carpetaId=c1'))
    expect(res.status).toBe(401)
  })

  it('sin carpetaId → 400', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(400)
  })

  it('carpeta de otra empresa → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]) // carpeta no encontrada
    const res = await GET(makeReq('GET', undefined, '?carpetaId=c-ajena'))
    expect(res.status).toBe(404)
  })

  it('carpeta válida → retorna archivos', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'c1' }]) // carpeta existe
      .mockResolvedValueOnce([{ id: 'a1', nombre: 'foto.jpg', url: 'https://r2/foto.jpg', tipo: 'imagen', orden: 0, tamano_byte: 1024 }])
    const res = await GET(makeReq('GET', undefined, '?carpetaId=c1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].tipo).toBe('imagen')
  })
})

// ── POST subir archivo ─────────────────────────────────────────────────────
describe('POST /api/media/archivos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await POST(makeReq('POST', { carpetaId: 'c1', nombre: 'img.jpg', base64: 'data:image/jpeg;base64,abc' }))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    const res = await POST(makeReq('POST', { carpetaId: 'c1', nombre: 'img.jpg', base64: 'data:image/jpeg;base64,abc' }))
    expect(res.status).toBe(403)
  })

  it('payload incompleto → 400', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    const res = await POST(makeReq('POST', { carpetaId: 'c1' }))
    expect(res.status).toBe(400)
  })

  it('archivo > 10MB → 413', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    const base64Grande = 'A'.repeat(14_000_000) // ~10.5MB decoded
    const res = await POST(makeReq('POST', { carpetaId: 'c1', nombre: 'img.jpg', base64: base64Grande }))
    expect(res.status).toBe(413)
  })

  it('carpeta ajena → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]) // carpeta no encontrada
    const res = await POST(makeReq('POST', { carpetaId: 'c-ajena', nombre: 'img.jpg', base64: 'data:image/jpeg;base64,abc' }))
    expect(res.status).toBe(404)
    expect(subirMediaArchivo).not.toHaveBeenCalled()
  })

  it('subida exitosa → 201 con datos del archivo', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'c1' }])           // carpeta existe
      .mockResolvedValueOnce([{ max: -1 }])             // maxOrden
      .mockResolvedValueOnce([{ id: 'a1', nombre: 'img.jpg', url: 'https://r2/img.jpg', tipo: 'imagen', orden: 0, tamano_byte: 50000 }]) // insert
    vi.mocked(subirMediaArchivo).mockResolvedValue({ key: 'media/emp-1/c1/uuid.jpg', url: 'https://r2/img.jpg', tipo: 'imagen', tamano_byte: 50000 })

    const res = await POST(makeReq('POST', { carpetaId: 'c1', nombre: 'img.jpg', base64: 'data:image/jpeg;base64,abc' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.tipo).toBe('imagen')
    expect(subirMediaArchivo).toHaveBeenCalledOnce()
  })

  it('⚠️ race condition: BD falla → R2 se revierte', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'c1' }])   // carpeta existe
      .mockResolvedValueOnce([{ max: 0 }])      // maxOrden
      .mockRejectedValueOnce(new Error('DB connection lost')) // INSERT falla
    vi.mocked(subirMediaArchivo).mockResolvedValue({ key: 'media/emp-1/c1/uuid.jpg', url: 'https://r2/img.jpg', tipo: 'imagen', tamano_byte: 50000 })
    vi.mocked(eliminarMediaArchivo).mockResolvedValue(undefined)

    const res = await POST(makeReq('POST', { carpetaId: 'c1', nombre: 'img.jpg', base64: 'data:image/jpeg;base64,abc' }))
    expect(res.status).toBe(500)
    // R2 debe haberse revertido con el key correcto
    expect(eliminarMediaArchivo).toHaveBeenCalledWith('media/emp-1/c1/uuid.jpg')
  })
})

// ── DELETE carpeta ─────────────────────────────────────────────────────────
describe('DELETE /api/media/carpetas/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin sesión → 401', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    const res = await DELETE(makeReq('DELETE') as any, params('c1'))
    expect(res.status).toBe(401)
  })

  it('rol vendedor → 403', async () => {
    vi.mocked(getServerSession).mockResolvedValue(VENDEDOR)
    const res = await DELETE(makeReq('DELETE') as any, params('c1'))
    expect(res.status).toBe(403)
  })

  it('carpeta ajena → 404', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]) // carpeta no encontrada
    const res = await DELETE(makeReq('DELETE') as any, params('c-ajena'))
    expect(res.status).toBe(404)
  })

  it('elimina archivos R2 antes de borrar BD', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'c1' }])    // carpeta existe
      .mockResolvedValueOnce([                   // archivos en R2
        { key: 'media/emp-1/c1/a.jpg' },
        { key: 'media/emp-1/c1/b.jpg' },
      ])
    vi.mocked(eliminarMediaArchivo).mockResolvedValue(undefined)
    vi.mocked(prisma.$executeRaw).mockResolvedValue(undefined as any)

    const res = await DELETE(makeReq('DELETE') as any, params('c1'))
    expect(res.status).toBe(200)
    expect(eliminarMediaArchivo).toHaveBeenCalledTimes(2)
    expect(eliminarMediaArchivo).toHaveBeenCalledWith('media/emp-1/c1/a.jpg')
    expect(eliminarMediaArchivo).toHaveBeenCalledWith('media/emp-1/c1/b.jpg')
    expect(prisma.$executeRaw).toHaveBeenCalledOnce() // DELETE BD
  })

  it('carpeta sin archivos → elimina BD sin llamar R2', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'c1' }]) // carpeta existe
      .mockResolvedValueOnce([])              // sin archivos
    vi.mocked(prisma.$executeRaw).mockResolvedValue(undefined as any)

    const res = await DELETE(makeReq('DELETE') as any, params('c1'))
    expect(res.status).toBe(200)
    expect(eliminarMediaArchivo).not.toHaveBeenCalled()
  })
})

// ── PATCH favorita ─────────────────────────────────────────────────────────
describe('PATCH /api/media/carpetas/[id] — favorita', () => {
  beforeEach(() => vi.clearAllMocks())

  it('límite 3 favoritos → 400', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ n: 3 }]) // ya hay 3
    const res = await PATCH(
      new NextRequest('http://localhost/api/media/carpetas/c1', { method: 'PATCH', body: JSON.stringify({ favorita: true }) }),
      params('c1')
    )
    expect(res.status).toBe(400)
    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('activar con < 3 favoritos → OK', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ n: 2 }]) // hay 2
    vi.mocked(prisma.$executeRaw).mockResolvedValue(undefined as any)
    const res = await PATCH(
      new NextRequest('http://localhost/api/media/carpetas/c1', { method: 'PATCH', body: JSON.stringify({ favorita: true }) }),
      params('c1')
    )
    expect(res.status).toBe(200)
    expect(prisma.$executeRaw).toHaveBeenCalledOnce()
  })

  it('desactivar favorita → no verifica límite', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$executeRaw).mockResolvedValue(undefined as any)
    const res = await PATCH(
      new NextRequest('http://localhost/api/media/carpetas/c1', { method: 'PATCH', body: JSON.stringify({ favorita: false }) }),
      params('c1')
    )
    expect(res.status).toBe(200)
    expect(prisma.$queryRaw).not.toHaveBeenCalled() // no chequea contador
  })

  it('renombrar → actualiza nombre', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    vi.mocked(prisma.$executeRaw).mockResolvedValue(undefined as any)
    const res = await PATCH(
      new NextRequest('http://localhost/api/media/carpetas/c1', { method: 'PATCH', body: JSON.stringify({ nombre: 'Nuevo nombre' }) }),
      params('c1')
    )
    expect(res.status).toBe(200)
  })

  it('renombrar con nombre vacío → 400', async () => {
    vi.mocked(getServerSession).mockResolvedValue(EMPRESA)
    const res = await PATCH(
      new NextRequest('http://localhost/api/media/carpetas/c1', { method: 'PATCH', body: JSON.stringify({ nombre: '   ' }) }),
      params('c1')
    )
    expect(res.status).toBe(400)
  })
})
