export function checkPermiso(session: any, permiso: string): boolean {
  const user = session?.user as any
  if (!user) return false
  if (user.role === 'empresa') return true
  const permisos = user.permisos
  if (!permisos || typeof permisos !== 'object') return false
  return permisos[permiso] === true
}

export const PERMISOS_SUPERVISOR_DEFAULT: Record<string, boolean> = {
  // Saldos
  verSaldos:        true,
  editarSaldos:     true,
  verBitacora:      true,
  // Egresos
  verEgresos:       true,
  editarEgresos:    true,
  adminEgresos:     true,
  // Clientes
  verClientes:      true,
  editarClientes:   true,
  // Cartera
  verCartera:       true,
  editarCartera:    true,
  // Recaudos
  verRecaudos:      true,
  editarRecaudos:   true,
  // Visitas
  verVisitas:       true,
  registrarVisitas: true,
  asignarRutas:     true,
  // Impulsos
  verImpulsos:      true,
  editarImpulsos:   true,
  // Activos
  verEmpleados:     true,
  editarEmpleados:  true,
  // Bodega
  verBodega:        true,
}

export function permisosConDefaults(rol: string, permisos: Record<string, boolean> = {}): Record<string, boolean> {
  if (rol !== 'supervisor') return permisos
  const keysValidos = new Set(
    PERMISOS_CATALOGO.flatMap(m => [
      m.ver?.key, m.editar?.key, m.admin?.key
    ].filter(Boolean) as string[])
  )
  const permisosLimpios: Record<string, boolean> = {}
  for (const key of keysValidos) {
    permisosLimpios[key] = key in permisos ? permisos[key] : (PERMISOS_SUPERVISOR_DEFAULT[key] ?? false)
  }
  return permisosLimpios
}

export interface PermisoModulo {
  modulo:  string
  icon:    string
  ver?:    { key: string; label: string }
  editar?: { key: string; label: string; requiere?: string }
  admin?:  { key: string; label: string; requiere?: string }
}

export const PERMISOS_CATALOGO: PermisoModulo[] = [
  {
    modulo: 'Saldos',   icon: '💵',
    ver:    { key: 'verSaldos',    label: 'Ver' },
    editar: { key: 'editarSaldos', label: 'Agregar / editar filas', requiere: 'verSaldos' },
    admin:  { key: 'verBitacora',  label: 'Día/Sem/Mes · Categorías · Tabs', requiere: 'verSaldos' },
  },
  {
    modulo: 'Egresos',  icon: '🛍️',
    ver:    { key: 'verEgresos',    label: 'Ver' },
    editar: { key: 'editarEgresos', label: 'Agregar / editar filas', requiere: 'verEgresos' },
    admin:  { key: 'adminEgresos',  label: 'Categorías · Renombrar tabs', requiere: 'verEgresos' },
  },
  {
    modulo: 'Clientes', icon: '🏪',
    ver:    { key: 'verClientes',    label: 'Ver' },
    editar: { key: 'editarClientes', label: 'Editar clientes', requiere: 'verClientes' },
  },
  {
    modulo: 'Cartera',  icon: '💰',
    ver:    { key: 'verCartera',    label: 'Ver' },
    editar: { key: 'editarCartera', label: 'Editar / Eliminar', requiere: 'verCartera' },
  },
  {
    modulo: 'Recaudos', icon: '💳',
    ver:    { key: 'verRecaudos',    label: 'Ver' },
    editar: { key: 'editarRecaudos', label: 'Enviar / Eliminar', requiere: 'verRecaudos' },
  },
  {
    modulo: 'Visitas',  icon: '📋',
    ver:    { key: 'verVisitas',      label: 'Ver' },
    editar: { key: 'registrarVisitas', label: 'Registrar', requiere: 'verVisitas' },
    admin:  { key: 'asignarRutas',    label: 'Asignar rutas', requiere: 'verVisitas' },
  },
  {
    modulo: 'Impulsos', icon: '⚡',
    ver:    { key: 'verImpulsos',    label: 'Ver' },
    editar: { key: 'editarImpulsos', label: 'Editar', requiere: 'verImpulsos' },
  },
  {
    modulo: 'Activos',  icon: '👥',
    ver:    { key: 'verEmpleados',    label: 'Ver' },
    editar: { key: 'editarEmpleados', label: 'Editar', requiere: 'verEmpleados' },
  },
  {
    modulo: 'Bodega',   icon: '🏭',
    ver:    { key: 'verBodega', label: 'Ver' },
  },
]
