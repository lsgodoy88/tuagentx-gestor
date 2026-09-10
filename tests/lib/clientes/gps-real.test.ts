import { describe, it, expect } from 'vitest'

/**
 * Simula la lógica del PATCH /api/clientes/[id]
 * para actualizar lat, lng, ubicacionReal
 */
function buildPatchData(body: Record<string, any>) {
  const { nit, nombre, nombreComercial, direccion, telefono, ciudad, listaId, apiId, lat, lng, ubicacionReal } = body
  return {
    ...(nit !== undefined ? { nit } : {}),
    ...(nombre !== undefined ? { nombre } : {}),
    ...(lat !== undefined ? { lat } : {}),
    ...(lng !== undefined ? { lng } : {}),
    ...(ubicacionReal !== undefined ? { ubicacionReal } : {}),
  }
}

describe('PATCH /api/clientes/[id] — GPS real', () => {
  it('incluye lat, lng y ubicacionReal cuando se envían', () => {
    const data = buildPatchData({ lat: 4.123, lng: -74.456, ubicacionReal: true })
    expect(data.lat).toBe(4.123)
    expect(data.lng).toBe(-74.456)
    expect(data.ubicacionReal).toBe(true)
  })

  it('no incluye lat/lng si no se envían', () => {
    const data = buildPatchData({ nombre: 'CARLOS' })
    expect(data).not.toHaveProperty('lat')
    expect(data).not.toHaveProperty('lng')
    expect(data).not.toHaveProperty('ubicacionReal')
  })

  it('puede actualizar solo ubicacionReal sin coordenadas', () => {
    const data = buildPatchData({ ubicacionReal: false })
    expect(data.ubicacionReal).toBe(false)
    expect(data).not.toHaveProperty('lat')
  })

  it('campos normales no se afectan al enviar GPS', () => {
    const data = buildPatchData({ nombre: 'PEDRO', lat: 5.0, lng: -75.0, ubicacionReal: true })
    expect(data.nombre).toBe('PEDRO')
    expect(data.lat).toBe(5.0)
    expect(data.ubicacionReal).toBe(true)
  })
})

/**
 * Lógica del popup 📌 en MapaHistorialClienteInner:
 * solo mostrar si canEditClientes && !v.cliente?.ubicacionReal
 */
function debesMostrarPin(canEditClientes: boolean, ubicacionReal?: boolean) {
  return canEditClientes && !ubicacionReal
}

describe('Popup 📌 — visibilidad correcta', () => {
  it('admin + sin gps real → muestra 📌', () => {
    expect(debesMostrarPin(true, false)).toBe(true)
  })

  it('admin + con gps real → NO muestra 📌', () => {
    expect(debesMostrarPin(true, true)).toBe(false)
  })

  it('vendedor sin permiso → NO muestra 📌', () => {
    expect(debesMostrarPin(false, false)).toBe(false)
  })

  it('ubicacionReal undefined (campo no llegó) → muestra 📌 si canEdit', () => {
    expect(debesMostrarPin(true, undefined)).toBe(true)
  })
})

/**
 * Popup de GPS post-registro en ModalVisita/ModalRecaudo:
 * solo mostrar si puedeCapturarGps && !ubicacionReal && !yaGuardoEnEstaSesion
 */
function debeMostrarPopupGps(puedeCapturarGps: boolean, ubicacionReal: boolean) {
  return puedeCapturarGps && !ubicacionReal
}

describe('Popup GPS post-registro — visibilidad', () => {
  it('vendedor + sin gps real → muestra popup', () => {
    expect(debeMostrarPopupGps(true, false)).toBe(true)
  })

  it('vendedor + con gps real → NO muestra popup', () => {
    expect(debeMostrarPopupGps(true, true)).toBe(false)
  })

  it('sin permiso gps → NO muestra popup', () => {
    expect(debeMostrarPopupGps(false, false)).toBe(false)
  })

  it('después de guardar: parent actualiza ubicacionReal → segunda visita no pregunta', () => {
    // Simula onUbicacionGuardada actualizando el cliente en state
    const clientes = [{ id: 'c1', nombre: 'CARLOS', ubicacionReal: false }]
    const updated = clientes.map(c => c.id === 'c1' ? { ...c, ubicacionReal: true } : c)
    expect(updated[0].ubicacionReal).toBe(true)
    expect(debeMostrarPopupGps(true, updated[0].ubicacionReal)).toBe(false)
  })
})
