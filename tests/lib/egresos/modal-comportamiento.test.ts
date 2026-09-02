import { describe, it, expect } from 'vitest'

// Lógica visibilitychange — no recarga si modal abierto
function debeRecargar(visibilityState: string, modalAdjIdx: number | null): boolean {
  return visibilityState === 'visible' && modalAdjIdx === null
}

// Lógica overlay — no cierra si está subiendo o click no es en overlay mismo
function overlayDebesCerrar(targetIsOverlay: boolean, subiendo: boolean, subiendoPago: boolean): boolean {
  return targetIsOverlay && !subiendo && !subiendoPago
}

// Lógica onBlur fila nueva
function onBlurFilaNueva(esNueva: boolean, concepto: string): 'eliminar' | 'guardar' | 'noop' {
  if (esNueva && !concepto.trim()) return 'eliminar'
  if (!esNueva) return 'guardar'
  return 'noop'
}

// Lógica onClose modal
function onCloseModal(esNueva: boolean, tieneValor: boolean, tieneId: boolean): 'eliminarFila' | 'recargarFila' | 'noop' {
  if (esNueva && !tieneValor) return 'eliminarFila'
  if (tieneId) return 'recargarFila'
  return 'noop'
}

describe('visibilitychange — no recarga con modal abierto', () => {
  it('visible + sin modal → recarga', () => {
    expect(debeRecargar('visible', null)).toBe(true)
  })
  it('visible + modal abierto → NO recarga', () => {
    expect(debeRecargar('visible', 0)).toBe(false)
    expect(debeRecargar('visible', 3)).toBe(false)
  })
  it('hidden → no recarga', () => {
    expect(debeRecargar('hidden', null)).toBe(false)
  })
})

describe('overlay modal — no cierra al seleccionar archivo', () => {
  it('click en overlay sin subir → cierra', () => {
    expect(overlayDebesCerrar(true, false, false)).toBe(true)
  })
  it('click en overlay mientras subiendo → NO cierra', () => {
    expect(overlayDebesCerrar(true, true, false)).toBe(false)
  })
  it('click en overlay mientras subiendo pago → NO cierra', () => {
    expect(overlayDebesCerrar(true, false, true)).toBe(false)
  })
  it('click en hijo del overlay (no directo) → NO cierra', () => {
    expect(overlayDebesCerrar(false, false, false)).toBe(false)
  })
})

describe('onBlur fila nueva', () => {
  it('nueva + vacío → eliminar', () => {
    expect(onBlurFilaNueva(true, '')).toBe('eliminar')
    expect(onBlurFilaNueva(true, '   ')).toBe('eliminar')
  })
  it('nueva + con concepto → noop (Enter confirma)', () => {
    expect(onBlurFilaNueva(true, 'NOMINA')).toBe('noop')
  })
  it('existente → guardar', () => {
    expect(onBlurFilaNueva(false, '')).toBe('guardar')
    expect(onBlurFilaNueva(false, 'NOMINA')).toBe('guardar')
  })
})

describe('onClose modal', () => {
  it('fila nueva sin valor → eliminar', () => {
    expect(onCloseModal(true, false, false)).toBe('eliminarFila')
  })
  it('fila nueva con valor → recargar (tiene id)', () => {
    expect(onCloseModal(true, true, true)).toBe('recargarFila')
  })
  it('fila existente con id → recargar', () => {
    expect(onCloseModal(false, true, true)).toBe('recargarFila')
  })
  it('fila existente sin id (raro) → noop', () => {
    expect(onCloseModal(false, true, false)).toBe('noop')
  })
})
