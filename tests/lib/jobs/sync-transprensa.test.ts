import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {}, DB_SCHEMA: 'gestor_staging' }))
vi.mock('@/lib/crypto-uptres', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace('enc:', '')),
}))

import { prisma } from '@/lib/prisma'
import { runSyncTransprensa } from '@/lib/jobs/sync-transprensa'

const p = prisma as any

const INTEGRACION = {
  empresaId: 'emp-01',
  config: { usuario_login: 'LUMELI', usuario_password: 'enc:pass123' },
}

const ORDEN = { id: 'ord-01', guiaTransporte: '010604463379', numeroFactura: '4303' }

const REMESA_ENTREGADA = {
  numero_remesa: '010604463379',
  estado_remesa: 'FACTURADA',
  estado_atencioncliente: 'ENTREGADO',
  lista_estado_atencioncliente: [
    { estado_codigo: '401', estado_nombre: 'DIGITADA',    estado_fecha: '2026-08-01' },
    { estado_codigo: '73',  estado_nombre: 'ENTREGADO',   estado_fecha: '2026-08-13' },
  ],
  remesa_imagencumplido: 'https://transprensa.net/img/remesa/CE123.tif',
}

const REMESA_EN_TRANSITO = {
  numero_remesa: '010604463379',
  estado_remesa: 'PLANILLADA',
  estado_atencioncliente: 'EN BODEGA DESTINO',
  lista_estado_atencioncliente: [
    { estado_codigo: '401', estado_nombre: 'DIGITADA',          estado_fecha: '2026-08-01' },
    { estado_codigo: '77',  estado_nombre: 'EN BODEGA DESTINO', estado_fecha: '2026-08-12' },
  ],
  remesa_imagencumplido: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('runSyncTransprensa', () => {

  it('retorna 0 empresas si no hay integraciones activas', async () => {
    p.integracion = { findMany: vi.fn().mockResolvedValue([]) }
    const r = await runSyncTransprensa()
    expect(r).toEqual({ ok: true, empresas: 0, actualizadas: 0, entregadas: 0, errores: 0, asignadas: 0 })
  })

  it('marca orden como entregada cuando Transprensa retorna ENTREGADO', async () => {
    p.integracion = {
      findMany: vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    // Login OK
    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      // Consulta remesa
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_ENTREGADA] }) })

    const r = await runSyncTransprensa()

    expect(r.actualizadas).toBe(1)
    expect(r.entregadas).toBe(1)
    expect(r.errores).toBe(0)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-01' },
      data:  expect.objectContaining({ estado: 'entregado' }),
    }))
  })

  it('actualiza TransprensaRemesa sin marcar como entregada cuando estado != ENTREGADO', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_EN_TRANSITO] }) })

    const r = await runSyncTransprensa()

    expect(r.actualizadas).toBe(1)
    expect(r.entregadas).toBe(0)
    expect(r.errores).toBe(0)
    // No debe haber llamado update en ordenDespacho (solo upsert en TransprensaRemesa)
    expect(p.ordenDespacho.update).not.toHaveBeenCalled()
  })

  it('maneja error de login y acumula errores', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.$executeRaw = vi.fn().mockResolvedValue(0)

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: false, msg: 'Credenciales inválidas' }) })

    const r = await runSyncTransprensa()

    expect(r.errores).toBe(1)
    expect(r.actualizadas).toBe(0)
  })

  it('continúa con otras empresas si una falla', async () => {
    // INTEGRACION no tiene nit_remitente → autoAsignarGuias no corre
    // Por empresa: 1 findMany (con guía) + 1 fetch login + 1 fetch por remesa
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }, { empresaId: 'emp-02' }]),
      findFirst: vi.fn()
        .mockResolvedValueOnce(INTEGRACION)   // emp-01: config
        .mockResolvedValueOnce(INTEGRACION),  // emp-02: config
    }
    p.ordenDespacho = {
      findMany: vi.fn()
        .mockResolvedValueOnce([ORDEN])   // emp-01 con guía
        .mockResolvedValueOnce([ORDEN]),  // emp-02 con guía (retornará vacío en Transprensa)
      update: vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      // emp-01: login OK + remesa OK (ENTREGADA)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok1' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_ENTREGADA] }) })
      // emp-02: login OK + remesa vacía (no actualiza nada)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok2' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })

    const r = await runSyncTransprensa()

    expect(r.empresas).toBe(2)
    expect(r.actualizadas).toBe(1) // solo emp-01 procesó remesa
    expect(r.entregadas).toBe(1)
  })

  it('guarda imagen_cumplido cuando Transprensa la retorna', async () => {
    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REMESA_ENTREGADA] }) })

    await runSyncTransprensa()

    expect(p.transprensaRemesa.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ imagen_cumplido: REMESA_ENTREGADA.remesa_imagencumplido }),
        update: expect.objectContaining({ imagen_cumplido: REMESA_ENTREGADA.remesa_imagencumplido }),
      })
    )
  })

  it('no sobreescribe entregado si remesa retorna una RE EXPEDICIÓN distinta', async () => {
    const ORDEN_DIFERENTE = { id: 'ord-02', guiaTransporte: '010604463379', numeroFactura: '4304' }
    const REEXPEDICION = {
      numero_remesa: 'OTRO-99999',  // diferente al buscado
      estado_atencioncliente: 'ENTREGADO',
      lista_estado_atencioncliente: [],
      remesa_imagencumplido: null,
    }

    p.integracion = {
      findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
      findFirst: vi.fn().mockResolvedValue(INTEGRACION),
    }
    p.ordenDespacho = {
      findMany: vi.fn().mockResolvedValue([ORDEN_DIFERENTE]),
      update:   vi.fn().mockResolvedValue({}),
    }
    p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

    ;(global.fetch as any)
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
      // Retorna RE EXPEDICIÓN cuyo numero_remesa difiere
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [REEXPEDICION] }) })

    const r = await runSyncTransprensa()

    expect(r.actualizadas).toBe(0)
    expect(r.entregadas).toBe(0)
    expect(p.ordenDespacho.update).not.toHaveBeenCalled()
    expect(p.transprensaRemesa.upsert).not.toHaveBeenCalled()
  })

})

// ── autoAsignarGuias ──────────────────────────────────────────────────────────

const INTG_AUTO = {
  empresaId: 'emp-01',
  config: {
    usuario_login: 'LUMELI',
    usuario_password: 'enc:pass123',
    nit_remitente: '1110479750',
  },
}

/**
 * Helper: configura p.integracion + login mock + ordenes sin guía.
 * Ahora se hacen 2 llamadas a Transprensa por fecha (D y D+1).
 * remesasPorFechaD: remesas para la fecha exacta del despacho.
 * remesasPorFechaDSig: remesas para el día siguiente (por defecto vacío).
 */
function setupAutoAsignar(
  ordenesSinGuia: any[],
  remesasPorFechaD: any[],
  remesasPorFechaDSig: any[] = []
) {
  // Construir logs de DespachoLog a partir de las órdenes (usa createdAt como despachadoEl por defecto)
  const despachoLogs = ordenesSinGuia
    .filter((o: any) => o.numeroFactura)
    .map((o: any) => ({
      numeroFactura: o.numeroFactura,
      despachadoEl: o.despachadoEl ?? o.createdAt,
    }))
  p.integracion = {
    findMany:  vi.fn().mockResolvedValue([{ empresaId: 'emp-01' }]),
    findFirst: vi.fn().mockResolvedValue(INTG_AUTO),
  }
  p.ordenDespacho = {
    // primera findMany → sin guía (autoAsignar)
    // segunda findMany → con guía (sync estado) — vacío para aislar
    findMany: vi.fn()
      .mockResolvedValueOnce(ordenesSinGuia)
      .mockResolvedValueOnce([]),
    update: vi.fn().mockResolvedValue({}),
  }
  p.despachoLog = {
    findMany: vi.fn().mockResolvedValue(despachoLogs),
  }
  p.transprensaRemesa = { upsert: vi.fn().mockResolvedValue({}) }

  // Se hacen 2 queries por fecha: D y D+1
  ;(global.fetch as any)
    .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { token: 'tok123' } }) })
    // Fecha D
    .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: remesasPorFechaD }) })
    // Fecha D+1
    .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: remesasPorFechaDSig }) })
}

describe('autoAsignarGuias — fecha despachadoEl vs createdAt', () => {
  /**
   * Bug: usaba o.createdAt para agrupar por fecha, pero la fecha real de despacho es DespachoLog.despachadoEl.
   * Si la orden se creó el día 18 pero se despachó el 19, groupBy produce fecha incorrecta.
   * Fix: enriquecer con despachadoEl desde DespachoLog (join por numeroFactura).
   */
  it('usa despachadoEl (DespachoLog) para construir la fecha de búsqueda, no createdAt', async () => {
    const createdAt    = new Date('2026-09-18T10:00:00Z') // día anterior
    const despachadoEl = new Date('2026-09-19T15:00:00Z') // día real de despacho

    const orden = {
      id: 'ord-A',
      numeroFactura: '5001',
      clienteNombre: 'DIANA GIL',
      clienteNit: '123456789',
      num_cajas: 3,
      createdAt,
      despachadoEl, // se usará para mock de DespachoLog
      ciudad: 'NEIVA',
    }

    const remesa = {
      numero_remesa: 'TRP-001',
      remesa_destinatario: {
        destinataro_documento: '123456789',
        destinatario_nombre: 'DIANA GIL',
        destinatario_ciudad: 'NEIVA',
      },
      remesa_detalle: [
        { producto: { producto_nombre: 'CAJA' }, cantidad: '3' },
      ],
    }

    setupAutoAsignar([orden], [remesa])

    await runSyncTransprensa()

    // La petición a Transprensa debe incluir la fecha del despachadoEl (2026-09-19)
    const fetchCalls = (global.fetch as any).mock.calls
    const autoAsignarCall = fetchCalls.find((call: any[]) =>
      call[1]?.body && call[1].body.includes('remesa_fechacreacion')
    )
    expect(autoAsignarCall).toBeDefined()
    expect(autoAsignarCall[1].body).toContain('2026-09-19')
    expect(autoAsignarCall[1].body).not.toContain('2026-09-18')
  })
})

describe('autoAsignarGuias — match por NIT + ciudad + cajas', () => {
  it('asigna guía cuando NIT, ciudad y cajas coinciden exactamente', async () => {
    const orden = {
      id: 'ord-B',
      numeroFactura: '5002',
      clienteNombre: 'DIANA GIL',
      clienteNit: "123456789",
      num_cajas: 3,
      createdAt: new Date('2026-09-19T10:00:00Z'),
      ciudad: 'NEIVA',
    }

    const remesa = {
      numero_remesa: 'TRP-002',
      remesa_destinatario: {
        destinataro_documento: '123456789',
        destinatario_nombre: 'DIANA GIL',
        destinatario_ciudad: 'NEIVA',
      },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '3' }],
    }

    setupAutoAsignar([orden], [remesa])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(1)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-B' },
      data: expect.objectContaining({ guiaTransporte: 'TRP-002' }),
    }))
  })

  it('asigna guía cuando remesa no trae ciudad (campo ausente en Transprensa)', async () => {
    const orden = {
      id: 'ord-nocity',
      numeroFactura: '5099',
      clienteNombre: 'GENNYFFER LORENA',
      clienteNit: '1117511972',
      num_cajas: 1,
      createdAt: new Date('2026-09-18T22:16:47Z'),
      ciudad: 'FLORENCIA',
    }

    const remesa = {
      numero_remesa: '010604470878',
      remesa_destinatario: {
        destinataro_documento: '1117511972',
        destinatario_nombre: 'GENNYFFER LORENA ROJAS SALAZAR',
        // sin destinatario_ciudad
      },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJAS' }, cantidad: '1' }],
    }

    // La remesa está en D+1 (2026-09-19) por registro tardío en Transprensa
    setupAutoAsignar([orden], [], [remesa])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(1)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-nocity' },
      data: expect.objectContaining({ guiaTransporte: '010604470878' }),
    }))
  })

  it('no asigna guía cuando NIT no coincide', async () => {
    const orden = {
      id: 'ord-C',
      numeroFactura: '5003',
      clienteNombre: 'PEDRO PEREZ',
      clienteNit: '999000111',
      num_cajas: 1,
      createdAt: new Date('2026-09-19T10:00:00Z'),
      ciudad: 'BOGOTA',
    }

    const remesa = {
      numero_remesa: 'TRP-003',
      remesa_destinatario: {
        destinataro_documento: '111222333', // NIT diferente
        destinatario_nombre: 'PEDRO PEREZ',
        destinatario_ciudad: 'BOGOTA',
      },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '1' }],
    }

    setupAutoAsignar([orden], [remesa])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(0)
    expect(p.ordenDespacho.update).not.toHaveBeenCalled()
  })

  it('usa cajas como tiebreaker entre 2 remesas mismo cliente+ciudad', async () => {
    const orden = {
      id: 'ord-D',
      numeroFactura: '5004',
      clienteNombre: 'MARIA LOPEZ',
      clienteNit: '777888999',
      num_cajas: 2,
      createdAt: new Date('2026-09-19T10:00:00Z'),
      ciudad: 'CALI',
    }

    const remesa1 = {
      numero_remesa: 'TRP-004a',
      remesa_destinatario: { destinataro_documento: '777888999', destinatario_nombre: 'MARIA LOPEZ', destinatario_ciudad: 'CALI' },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '1' }],
    }
    const remesa2 = {
      numero_remesa: 'TRP-004b',
      remesa_destinatario: { destinataro_documento: '777888999', destinatario_nombre: 'MARIA LOPEZ', destinatario_ciudad: 'CALI' },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '2' }], // coincide
    }

    setupAutoAsignar([orden], [remesa1, remesa2])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(1)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-D' },
      data: expect.objectContaining({ guiaTransporte: 'TRP-004b' }),
    }))
  })

  it('fallback fuzzy por nombre cuando no hay NIT registrado en cliente', async () => {
    const orden = {
      id: 'ord-E',
      numeroFactura: '5005',
      clienteNombre: 'COMERCIALIZADORA EL PALMAR',
      clienteNit: null, // sin NIT
      num_cajas: 1,
      createdAt: new Date('2026-09-19T10:00:00Z'),
      ciudad: 'NEIVA',
    }

    const remesa = {
      numero_remesa: 'TRP-005',
      remesa_destinatario: {
        destinataro_documento: null,
        destinatario_nombre: 'COMERCIALIZADORA EL PALMAR S.A.',
        destinatario_ciudad: 'NEIVA',
      },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '1' }],
    }

    setupAutoAsignar([orden], [remesa])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(1)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord-E' },
      data: expect.objectContaining({ guiaTransporte: 'TRP-005' }),
    }))
  })

  it('no sobreescribe guía ya existente', async () => {
    // Esta orden ya tiene guía → no debe aparecer en ordenesSinGuia (el findMany lo filtra)
    // Verificamos que si por error llega con guía, no se sobreescribe
    // (En realidad el where del findMany garantiza guiaTransporte: null)
    // Simulamos que no hay órdenes sin guía
    setupAutoAsignar([], [])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(0)
    expect(p.ordenDespacho.update).not.toHaveBeenCalled()
  })

  it('registra URL de seguimiento con guía sin espacios', async () => {
    const orden = {
      id: 'ord-F',
      numeroFactura: '5006',
      clienteNombre: 'LUIS GARCIA',
      clienteNit: '100200300',
      num_cajas: 2,
      createdAt: new Date('2026-09-19T10:00:00Z'),
      ciudad: 'MEDELLIN',
    }

    const remesa = {
      numero_remesa: '  010604468165  ', // con espacios
      remesa_destinatario: { destinataro_documento: '100200300', destinatario_nombre: 'LUIS GARCIA', destinatario_ciudad: 'MEDELLIN' },
      remesa_detalle: [{ producto: { producto_nombre: 'CAJA' }, cantidad: '2' }],
    }

    setupAutoAsignar([orden], [remesa])

    const r = await runSyncTransprensa()

    expect(r.asignadas).toBe(1)
    expect(p.ordenDespacho.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        guiaTransporte: '010604468165',
        urlSeguimiento: 'https://transprensa.com/Seguimiento/?remesa_codigo=010604468165',
      }),
    }))
  })
})
