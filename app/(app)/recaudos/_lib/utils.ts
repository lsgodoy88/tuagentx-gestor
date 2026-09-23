export function fmtMonto(v: number | string) {
  return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
export function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
}
export function fmtFecha(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' , timeZone: 'America/Bogota'})
}
export function fmtFechaBtn(dateStr: string) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}
export function fmtMetodo(m: string | null) {
  if (!m) return '—'
  if (m === 'efectivo')      return 'Efect.'
  if (m === 'transferencia') return 'Banco'
  return 'Otro'
}

export async function abrirRecibo(pagoId: string) {
  const res  = await fetch('/api/cartera/recibo-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pagoId }),
  })
  const data = await res.json()
  if (data.reciboToken) {
    const fmt = data.anchoPapel === '58mm' ? '&fmt=58mm' : ''
    window.open('/recaudo/recibo?token=' + data.reciboToken + fmt, '_blank')
  }
}
