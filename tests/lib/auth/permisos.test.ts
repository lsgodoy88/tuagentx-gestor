import { describe, it, expect } from 'vitest'
import { checkPermiso } from '@/lib/permisos'

describe('lib/permisos — checkPermiso(session, permiso)', () => {
  it('session null → false (sin sesión, sin permiso)', () => {
    expect(checkPermiso(null, 'lo-que-sea')).toBe(false)
  })

  it('session sin user → false', () => {
    expect(checkPermiso({}, 'asignarRutas')).toBe(false)
  })

  it('role=empresa → true SIEMPRE (acceso total)', () => {
    expect(checkPermiso({ user: { role: 'empresa' } }, 'lo-que-sea')).toBe(true)
    expect(checkPermiso({ user: { role: 'empresa' } }, 'permiso-inexistente')).toBe(true)
  })

  it('supervisor con permiso true → true', () => {
    const session = {
      user: { role: 'supervisor', permisos: { asignarRutas: true } }
    }
    expect(checkPermiso(session, 'asignarRutas')).toBe(true)
  })

  it('supervisor con permiso false → false', () => {
    const session = {
      user: { role: 'supervisor', permisos: { asignarRutas: false } }
    }
    expect(checkPermiso(session, 'asignarRutas')).toBe(false)
  })

  it('supervisor sin la key específica → false (default deny)', () => {
    const session = {
      user: { role: 'supervisor', permisos: { otra: true } }
    }
    expect(checkPermiso(session, 'asignarRutas')).toBe(false)
  })

  it('supervisor sin permisos definidos → false', () => {
    expect(checkPermiso({ user: { role: 'supervisor' } }, 'asignarRutas')).toBe(false)
    expect(checkPermiso({ user: { role: 'supervisor', permisos: null } }, 'asignarRutas')).toBe(false)
  })

  it('permisos no-objeto (string, array) → false', () => {
    expect(checkPermiso({ user: { role: 'supervisor', permisos: 'admin' } }, 'x')).toBe(false)
  })

  it('valor truthy distinto de true → false (estricto === true)', () => {
    // El código usa `=== true`, así que 1, 'true', 'yes' no cuentan
    const session = {
      user: { role: 'supervisor', permisos: { x: 1 } }
    }
    expect(checkPermiso(session, 'x')).toBe(false)
  })

  it('vendedor (no admin) con permisos custom funciona igual que supervisor', () => {
    const session = {
      user: { role: 'vendedor', permisos: { verCartera: true } }
    }
    expect(checkPermiso(session, 'verCartera')).toBe(true)
    expect(checkPermiso(session, 'otraCosa')).toBe(false)
  })
})
