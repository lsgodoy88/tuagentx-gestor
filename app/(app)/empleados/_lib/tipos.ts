export const ROLES_CONFIG = [
  { id: 'vendedor', label: 'Vendedores', icon: '🛍️', maxKey: 'maxVendedores' },
  { id: 'impulsadora', label: 'Impulsadoras', icon: '⚡', maxKey: 'maxImpulsadoras' },
  { id: 'supervisor', label: 'Supervisores', icon: '👁️', maxKey: 'maxSupervisores' },
  { id: 'bodega', label: 'Bodega', icon: '🏭', maxKey: 'maxBodega' },
  { id: 'entregas', label: 'Entregas', icon: '📦', maxKey: 'maxEntregas' },
]

export const ROL_SINGULAR: Record<string, string> = {
  supervisor: 'Supervisor', vendedor: 'Vendedor', entregas: 'Entrega', impulsadora: 'Impulsadora', bodega: 'Bodega',
}

export const PERMISOS_CONFIG = [
  { key: 'verClientes',       label: 'Ver clientes' },
  { key: 'editarClientes',    label: 'Editar clientes' },
  { key: 'verVisitas',        label: 'Ver visitas' },
  { key: 'registrarVisitas',  label: 'Registrar visitas' },
  { key: 'verRutas',          label: 'Ver rutas' },
  { key: 'asignarRutas',      label: 'Asignar rutas a entregas' },
  { key: 'verReportes',       label: 'Ver reportes' },
  { key: 'verBitacora',       label: 'Ver bitácora' },
]

export const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

export const ROL_ICON: Record<string,string> = { vendedor:'🛍️', entregas:'📦', supervisor:'👁️', impulsadora:'⭐', bodega:'🏭' }

export const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
