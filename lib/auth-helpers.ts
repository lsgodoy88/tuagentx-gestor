/**
 * Helpers de autenticación — derivación de empresaId y constantes de roles.
 * Centralizado para evitar duplicación en 75+ endpoints.
 */

export function getEmpresaId(user: any): string {
  return user.role === 'empresa' ? user.id : user.empresaId
}

export const ROLES_ADMIN = ['empresa', 'supervisor'] as const
export const ROLES_ADMIN_BODEGA = ['empresa', 'supervisor', 'bodega'] as const
export const ROLES_ADMIN_VENDEDOR = ['empresa', 'supervisor', 'vendedor'] as const
export const ROLES_TODOS = ['empresa', 'supervisor', 'vendedor', 'impulsadora', 'bodega', 'entregas'] as const
export const ROLES_VENDEDOR_RUTAS = ['empresa', 'supervisor', 'vendedor', 'impulsadora'] as const

export function esAdmin(user: any): boolean {
  return ROLES_ADMIN.includes(user?.role)
}

export function tieneRol(user: any, roles: readonly string[]): boolean {
  return roles.includes(user?.role)
}
