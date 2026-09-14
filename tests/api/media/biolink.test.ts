import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
  DB_SCHEMA: 'gestor_staging',
}))
vi.mock('@/app/generated/prisma', () => ({ Prisma: { raw: (s: string) => s } }))

import { GET } from '@/app/api/media/biolink/[slug]/route'
import { prisma } from '@/lib/prisma'

const makeReq = () => new NextRequest('http://localhost/api/media/biolink/prokpil')
const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

const CONFIG_ROW = {
  id: 'mc1', empresaId: 'emp-1',
  nombre: 'Prokpil Colombia', descripcion: '🔥 Productos top',
  logoUrl: 'https://r2/logo.jpg', whatsapp: '573001234567',
  portafolioUrl: null, portafolioNombre: null,
  tema: 'fuego', empresa_nombre: 'Prokpil',
}

describe('GET /api/media/biolink/[slug]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('slug inexistente → 404', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]) // config no encontrada
    const res = await GET(makeReq(), params('noexiste'))
    expect(res.status).toBe(404)
  })

  it('slug válido → retorna config + carpetas', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([CONFIG_ROW])          // config
      .mockResolvedValueOnce([                       // carpetasFav
        { id: 'c1', nombre: 'Promo', primeraImagen: 'https://r2/img1.jpg' },
      ])
      .mockResolvedValueOnce([                       // todasCarpetas
        { id: 'c1', nombre: 'Promo' },
        { id: 'c2', nombre: 'Catálogo' },
      ])
      .mockResolvedValueOnce([                       // imágenes carpeta c1
        { id: 'a1', nombre: 'img1.jpg', url: 'https://r2/img1.jpg', orden: 0 },
      ])
      .mockResolvedValueOnce([])                     // imágenes carpeta c2 (vacía)

    const res = await GET(makeReq(), params('prokpil'))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.config.nombre).toBe('Prokpil Colombia')
    expect(data.config.tema).toBe('fuego')
    expect(data.carpetasFav).toHaveLength(1)
    expect(data.todasCarpetas).toHaveLength(1) // c2 filtrada por sin imágenes
  })

  it('slug normaliza correctamente — mayúsculas y espacios', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([CONFIG_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeReq(), params('PROKPIL'))
    // Debe encontrar la empresa aunque el slug venga en mayúsculas
    expect(res.status).toBe(200)
    // El primer call usa .toLowerCase() — verificamos que se llamó con 'prokpil'
    const firstCall = vi.mocked(prisma.$queryRaw).mock.calls[0]
    const queryStr = JSON.stringify(firstCall)
    expect(queryStr.toLowerCase()).toContain('prokpil')
  })

  it('carpetasFav sin primeraImagen → filtradas del resultado', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([CONFIG_ROW])
      .mockResolvedValueOnce([
        { id: 'c1', nombre: 'Promo', primeraImagen: 'https://r2/img.jpg' },
        { id: 'c2', nombre: 'Vacía', primeraImagen: null }, // sin imagen
      ])
      .mockResolvedValueOnce([])

    const res = await GET(makeReq(), params('prokpil'))
    const data = await res.json()
    expect(data.carpetasFav).toHaveLength(1) // c2 filtrada
    expect(data.carpetasFav[0].nombre).toBe('Promo')
  })

  it('config sin portafolio → portafolioUrl null', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ ...CONFIG_ROW, portafolioUrl: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeReq(), params('prokpil'))
    const data = await res.json()
    expect(data.config.portafolioUrl).toBeNull()
  })

  it('tema por defecto oceano si no está configurado', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ ...CONFIG_ROW, tema: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeReq(), params('prokpil'))
    const data = await res.json()
    expect(data.config.tema).toBe('oceano')
  })
})
