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
    const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000)
    if (dias > 90) return { estado: 'critica', label: '⛔ Crítica +90 días', color: 'red' }
    if (dias > 30) return { estado: 'mora', label: `🔴 En mora ${dias} días`, color: 'red' }
    if (dias > 0) return { estado: 'vencida', label: `🟠 Vencida ${dias} días`, color: 'orange' }
  }
  if (abonos > 0) return { estado: 'abonada', label: '🔵 Abonada', color: 'blue' }
  return { estado: 'pendiente', label: '🟡 Pendiente', color: 'yellow' }
}

const CRITICIDAD: Record<string, number> = { critica: 6, mora: 5, vencida: 4, abonada: 3, pendiente: 2, pagada: 1 }

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
    case 'pagada': return 'emerald'
    case 'abonada': return 'blue'
    case 'pendiente': return 'yellow'
    case 'vencida': return 'orange'
    case 'mora': return 'red'
    case 'critica': return 'rose'
    default: return 'zinc'
  }
}
