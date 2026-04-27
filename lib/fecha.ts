// Utilidad central para fechas en zona horaria Bogotá (UTC-5)

export function ahoraBogota(): Date {
  return new Date(Date.now() - 5 * 60 * 60 * 1000)
}

export function fechaBogotaStr(fecha?: Date | string | null): string {
  const d = fecha ? new Date(fecha) : new Date()
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function inicioDiaBogota(fechaStr?: string): Date {
  const str = fechaStr || fechaBogotaStr()
  // fechaBogota en DB ya está en hora Bogotá (UTC-5 aplicado al guardar)
  return new Date(str + 'T00:00:00.000Z')
}

export function finDiaBogota(fechaStr?: string): Date {
  const str = fechaStr || fechaBogotaStr()
  return new Date(str + 'T23:59:59.999Z')
}

export function fechaBogotaDeVisita(v: { fechaBogota?: Date | null, createdAt: Date }): string {
  if (v.fechaBogota) return new Date(v.fechaBogota).toISOString().split('T')[0]
  return new Date(new Date(v.createdAt).getTime() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
}
