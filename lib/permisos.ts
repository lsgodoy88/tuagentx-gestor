export function checkPermiso(session: any, permiso: string): boolean {
  const user = session?.user as any
  if (!user) return false
  if (user.role === 'empresa') return true
  const permisos = user.permisos
  if (!permisos || typeof permisos !== 'object') return false
  return permisos[permiso] === true
}
