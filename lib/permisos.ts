export function checkPermiso(session: any, permiso: string): boolean {
  const user = session?.user as any
  if (!user) return false
  if (user.role === 'empresa') return true
  const permisos = user.permisos
  if (!permisos || typeof permisos !== 'object') return false
  return permisos[permiso] === true
}

/** Permisos por defecto al crear un supervisor — todos activos */
export const PERMISOS_SUPERVISOR_DEFAULT: Record<string, boolean> = {
  // Menú / nav
  verSaldos:        true,
  verEgresos:       true,
  verEmpleados:     true,
  verClientes:      true,
  verCartera:       true,
  verRecaudos:      true,
  verVisitas:       true,
  verImpulsos:      true,
  verBodega:        true,
  // Acciones
  editarClientes:   true,
  registrarVisitas: true,
  asignarRutas:     true,
  verBitacora:      true,
}

/** Merge permisos con defaults — garantiza todos los keys del catálogo, elimina obsoletos */
export function permisosConDefaults(rol: string, permisos: Record<string, boolean> = {}): Record<string, boolean> {
  if (rol !== 'supervisor') return permisos
  // Keys válidos = solo los del catálogo actual
  const keysValidos = new Set(
    PERMISOS_CATALOGO.flatMap(g => g.items.map((i: any) => i.key))
  )
  const permisosLimpios: Record<string, boolean> = {}
  for (const key of keysValidos) {
    // Si el key viene en permisos recibidos → respetar; si no → usar default
    permisosLimpios[key] = key in permisos ? permisos[key] : (PERMISOS_SUPERVISOR_DEFAULT[key] ?? false)
  }
  return permisosLimpios
}

/** Catálogo de permisos para el popup UI — orden y agrupación */
export const PERMISOS_CATALOGO = [
  {
    grupo: 'Menú',
    descripcion: 'Secciones visibles en la navegación',
    items: [
      { key: 'verSaldos',    label: 'Saldos',    icon: '💵' },
      { key: 'verEgresos',   label: 'Egresos',   icon: '🛍️' },
      { key: 'verEmpleados', label: 'Activos',   icon: '👥' },
      { key: 'verClientes',  label: 'Clientes',  icon: '🏪' },
      { key: 'verCartera',   label: 'Cartera',   icon: '💰' },
      { key: 'verRecaudos',  label: 'Recaudos',  icon: '💳' },
      { key: 'verVisitas',   label: 'Visitas',   icon: '📋' },
      { key: 'verImpulsos',  label: 'Impulsos',  icon: '⚡' },
      { key: 'verBodega',    label: 'Bodega',    icon: '🏭' },
    ],
  },
  {
    grupo: 'Acciones',
    descripcion: 'Lo que puede hacer dentro de cada módulo',
    items: [
      { key: 'editarClientes',   label: 'Editar clientes',       icon: '✏️',  requiere: 'verClientes' },
      { key: 'registrarVisitas', label: 'Registrar visitas',     icon: '📝',  requiere: 'verVisitas' },
      { key: 'asignarRutas',     label: 'Asignar rutas',         icon: '🗺️',  requiere: 'verVisitas' },
      { key: 'verBitacora',      label: 'Ver Día / Semana / Mes (Saldos)', icon: '📅',  requiere: 'verSaldos' },
    ],
  },
]
