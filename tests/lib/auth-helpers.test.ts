import { describe, it, expect } from 'vitest'
import {
  getEmpresaId,
  esAdmin,
  tieneRol,
  ROLES_ADMIN,
  ROLES_ADMIN_BODEGA,
  ROLES_ADMIN_VENDEDOR,
  ROLES_TODOS,
  ROLES_VENDEDOR_RUTAS,
} from '@/lib/auth-helpers'

describe('lib/auth-helpers', () => {
  describe('getEmpresaId(user)', () => {
    it('role=empresa → devuelve user.id (la empresa ES su propio empresaId)', () => {
      const user = { id: 'emp-123', role: 'empresa', empresaId: 'DEBERIA_IGNORARSE' }
      expect(getEmpresaId(user)).toBe('emp-123')
    })

    it('role=vendedor → devuelve user.empresaId', () => {
      const user = { id: 'usr-99', role: 'vendedor', empresaId: 'emp-123' }
      expect(getEmpresaId(user)).toBe('emp-123')
    })

    it('role=supervisor → devuelve user.empresaId (no es la empresa, le pertenece)', () => {
      const user = { id: 'usr-50', role: 'supervisor', empresaId: 'emp-123' }
      expect(getEmpresaId(user)).toBe('emp-123')
    })

    it('role=bodega → devuelve user.empresaId', () => {
      const user = { id: 'usr-77', role: 'bodega', empresaId: 'emp-123' }
      expect(getEmpresaId(user)).toBe('emp-123')
    })
  })

  describe('esAdmin(user)', () => {
    it('empresa es admin', () => {
      expect(esAdmin({ role: 'empresa' })).toBe(true)
    })

    it('supervisor es admin', () => {
      expect(esAdmin({ role: 'supervisor' })).toBe(true)
    })

    it('vendedor NO es admin', () => {
      expect(esAdmin({ role: 'vendedor' })).toBe(false)
    })

    it('bodega NO es admin', () => {
      expect(esAdmin({ role: 'bodega' })).toBe(false)
    })

    it('null user no rompe', () => {
      expect(esAdmin(null)).toBe(false)
    })

    it('user sin role no rompe', () => {
      expect(esAdmin({})).toBe(false)
    })
  })

  describe('tieneRol(user, roles)', () => {
    it('vendedor está en ROLES_ADMIN_VENDEDOR', () => {
      expect(tieneRol({ role: 'vendedor' }, ROLES_ADMIN_VENDEDOR)).toBe(true)
    })

    it('bodega NO está en ROLES_ADMIN_VENDEDOR', () => {
      expect(tieneRol({ role: 'bodega' }, ROLES_ADMIN_VENDEDOR)).toBe(false)
    })

    it('impulsadora en ROLES_VENDEDOR_RUTAS', () => {
      expect(tieneRol({ role: 'impulsadora' }, ROLES_VENDEDOR_RUTAS)).toBe(true)
    })

    it('lista vacía siempre false', () => {
      expect(tieneRol({ role: 'empresa' }, [])).toBe(false)
    })

    it('user null no rompe', () => {
      expect(tieneRol(null, ROLES_ADMIN)).toBe(false)
    })
  })

  describe('constantes de roles', () => {
    it('ROLES_ADMIN solo empresa + supervisor', () => {
      expect([...ROLES_ADMIN].sort()).toEqual(['empresa', 'supervisor'])
    })

    it('ROLES_TODOS cubre los 6 roles del sistema', () => {
      expect(ROLES_TODOS.length).toBe(6)
      expect([...ROLES_TODOS].sort()).toEqual(
        ['bodega', 'empresa', 'entregas', 'impulsadora', 'supervisor', 'vendedor']
      )
    })

    it('ROLES_ADMIN_BODEGA incluye admin + bodega', () => {
      expect([...ROLES_ADMIN_BODEGA].sort()).toEqual(['bodega', 'empresa', 'supervisor'])
    })

    it('ROLES_VENDEDOR_RUTAS incluye admin + vendedor + impulsadora (los que recorren rutas)', () => {
      expect([...ROLES_VENDEDOR_RUTAS].sort()).toEqual(
        ['empresa', 'impulsadora', 'supervisor', 'vendedor']
      )
    })
  })
})
