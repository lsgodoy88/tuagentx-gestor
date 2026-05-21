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

/**
 * vendedorScope — filtro infalible para endpoints con datos por vendedor.
 *
 * REGLA:
 *   - Vendedor → solo ve sus propios registros (user.id desde JWT, nunca del query param)
 *   - Admin/Supervisor → puede filtrar por vendedorId del query param, o ver todos
 *
 * Uso en route.ts:
 *   const { permitido, empleadoIdForzado } = vendedorScope(user)
 *   if (!permitido) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
 *   if (empleadoIdForzado) where.empleadoId = empleadoIdForzado
 *   else if (vendedorIdParam) where.empleadoId = vendedorIdParam
 *
 * @param user        session.user (token JWT)
 * @param rolesExtra  roles adicionales permitidos además de admin (ej: ['bodega'])
 */
export function vendedorScope(
  user: any,
  rolesExtra: string[] = []
): { permitido: boolean; empleadoIdForzado: string | null; isVendedor: boolean } {
  const isVendedor = user?.role === 'vendedor'
  const rolesPermitidos = [...ROLES_ADMIN, ...rolesExtra]
  const permitido = rolesPermitidos.includes(user?.role) || isVendedor
  // user.id es el id del Empleado en JWT (ver auth.ts callback jwt → token.userId)
  const empleadoIdForzado = isVendedor ? (user.id as string) : null
  return { permitido, empleadoIdForzado, isVendedor }
}
