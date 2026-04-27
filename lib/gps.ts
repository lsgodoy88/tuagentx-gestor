const GPS_CACHE_KEY = 'gps_cache'
const GPS_CACHE_TTL = 120000 // 2 minutos

export interface GpsPos { lat: number; lng: number; accuracy: number; ts: number }

function guardarCache(pos: GpsPos) {
  try { sessionStorage.setItem(GPS_CACHE_KEY, JSON.stringify(pos)) } catch {}
}

function leerCache(): GpsPos | null {
  try {
    const raw = sessionStorage.getItem(GPS_CACHE_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as GpsPos
    if (Date.now() - pos.ts > GPS_CACHE_TTL) return null
    return pos
  } catch { return null }
}

export function obtenerGpsBajo(): Promise<GpsPos | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: Date.now() }
        guardarCache(pos)
        resolve(pos)
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    )
  })
}

export function obtenerGpsAlto(): Promise<GpsPos | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, ts: Date.now() }
        guardarCache(pos)
        resolve(pos)
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  })
}

export async function obtenerGpsMejor(): Promise<GpsPos | null> {
  const cache = leerCache()
  const alto = obtenerGpsAlto()
  const timeout = new Promise<GpsPos | null>(resolve => setTimeout(() => resolve(cache), 3000))
  const resultado = await Promise.race([alto, timeout])
  if (resultado) return resultado
  return await alto
}

export function calentar() {
  obtenerGpsBajo().catch(() => {})
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
