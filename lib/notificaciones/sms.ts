// lib/notificaciones/sms.ts — wrapper Onurix SMS

const ONURIX_URL = 'https://www.onurix.com/api/v1/sms/send'
const CLIENT = process.env.ONURIX_CLIENT || ''
const KEY = process.env.ONURIX_KEY || ''

export interface OnurixResult {
  ok: boolean
  msgId?: string
  errorCodigo?: number
  errorMsg?: string
}

export async function enviarSMS(phone: string, mensaje: string): Promise<OnurixResult> {
  // Normalizar número colombiano → 57XXXXXXXXXX
  const tel = normalizarTelefono(phone)
  if (!tel) return { ok: false, errorCodigo: 1007, errorMsg: 'Número inválido o vacío' }

  try {
    const body = new URLSearchParams({ client: CLIENT, key: KEY, phone: tel, sms: mensaje })
    const res = await fetch(ONURIX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    if (data?.status === 0 && data?.data?.id) {
      return { ok: true, msgId: String(data.data.id) }
    }
    return { ok: false, errorCodigo: data?.error, errorMsg: data?.msg || 'Error Onurix' }
  } catch (err: any) {
    return { ok: false, errorMsg: err.message }
  }
}

export async function consultarEstadoSMS(msgId: string): Promise<'entregado' | 'fallido' | 'pendiente'> {
  try {
    const res = await fetch(
      `https://www.onurix.com/api/v1/general/message-state?client=${CLIENT}&key=${KEY}&id=${msgId}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    const state = data?.data?.state?.toLowerCase() || ''
    if (state.includes('delivered') || state === 'delivered') return 'entregado'
    if (state.includes('failed') || state.includes('error') || state.includes('undelivered')) return 'fallido'
    return 'pendiente'
  } catch {
    return 'pendiente'
  }
}

export function construirMensaje(plantilla: string, firma: string, vars: {
  nombre: string
  factura: string
  valor: string
  vencimiento: string
}): string {
  const cuerpo = plantilla
    .replace('{nombre}', vars.nombre.slice(0, 25).trim())
    .replace('{factura}', vars.factura)
    .replace('{valor}', vars.valor)
    .replace('{vencimiento}', vars.vencimiento)
  return cuerpo.slice(0, 140)
}

function normalizarTelefono(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('57') && digits.length === 12) return digits
  if (digits.length === 10 && digits.startsWith('3')) return '57' + digits
  if (digits.length === 10) return '57' + digits
  return null
}
