export function calcularEstado(
  saldoPendiente: number,
  valorFactura: number,
  abonos: number,
  fechaVencimiento: Date | null
): { estado: string; label: string; color: string } {
  if (saldoPendiente <= 0) return { estado: 'pagada', label: '✅ Pagada', color: 'emerald' }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  if (fechaVencimiento) {
    const fecha = new Date(fechaVencimiento); fecha.setHours(0, 0, 0, 0)
    const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000) // + = vencida, - = futura
    // Vencidas (pasado)
    if (dias > 90)  return { estado: 'critica',   label: `⛔ Crítica ${dias}d`,    color: 'red' }
    if (dias > 30)  return { estado: 'mora',      label: `🔴 Mora ${dias}d`,       color: 'rose' }
    if (dias > 0)   return { estado: 'vencida',   label: `🟠 Vencida ${dias}d`,    color: 'orange' }
    // Por vencer (futuro)
    if (dias > -8)  return { estado: 'proxima',   label: `⚠️ Vence en ${-dias}d`,  color: 'amber' }
    if (dias > -30) return { estado: 'pendiente', label: `🟡 Vence en ${-dias}d`,  color: 'yellow' }
    return { estado: 'vigente', label: `🔵 Vence en ${-dias}d`, color: 'blue' }
  }
  if (abonos > 0) return { estado: 'abonada', label: '🔵 Abonada', color: 'blue' }
  return { estado: 'pendiente', label: '🟡 Pendiente', color: 'yellow' }
}

const CRITICIDAD: Record<string, number> = { critica: 7, mora: 6, vencida: 5, proxima: 4, abonada: 3, pendiente: 2, vigente: 2, pagada: 1 }

export function estadoMasCritico(detalles: Array<{
  estado?: string | null
  valorFactura?: any
  valor: any
  abonos?: any
  fechaVencimiento?: Date | null
}>): string {
  let max = 0; let resultado = 'pagada'
  for (const d of detalles) {
    if (d.estado === 'pagada') continue
    const vf = Number(d.valorFactura ?? d.valor)
    const ab = Number(d.abonos ?? 0)
    const saldo = Math.max(0, vf - ab)
    const { estado } = calcularEstado(saldo, vf, ab, d.fechaVencimiento ?? null)
    const c = CRITICIDAD[estado] ?? 0
    if (c > max) { max = c; resultado = estado }
  }
  return resultado
}

export function colorEstado(estado: string): string {
  switch (estado) {
    case 'pagada':   return 'emerald'
    case 'vigente':  return 'blue'
    case 'abonada':  return 'blue'
    case 'pendiente':return 'yellow'
    case 'proxima':  return 'amber'
    case 'vencida':  return 'orange'
    case 'mora':     return 'rose'
    case 'critica':  return 'red'
    default: return 'zinc'
  }
}
