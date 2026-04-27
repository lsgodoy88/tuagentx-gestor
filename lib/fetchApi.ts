// Helper fetch con manejo de errores y reintentos
export async function fetchApi(
  url: string,
  opciones: RequestInit = {},
  reintentos = 2
): Promise<any> {
  for (let i = 1; i <= reintentos; i++) {
    try {
      const res = await fetch(url, opciones)
      if (!res.ok) {
        const err = await res.text().catch(() => 'Error desconocido')
        throw new Error(`HTTP ${res.status}: ${err}`)
      }
      const text = await res.text()
      if (!text) return {}
      return JSON.parse(text)
    } catch(e: any) {
      console.error(`[fetchApi] Intento ${i}/${reintentos} fallido [${url}]:`, e.message)
      if (i === reintentos) return null
      await new Promise(r => setTimeout(r, 800 * i))
    }
  }
  return null
}

// Helper para mostrar error al usuario
export function errorMsg(data: any, fallback = 'Error inesperado'): string {
  if (!data) return 'Sin respuesta del servidor'
  if (typeof data === 'string') return data
  return data.error || data.message || fallback
}
