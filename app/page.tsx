'use client'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import CotizadorGestor from '@/components/Cotizador'
import PlanesDinamicos from '@/components/PlanesDinamicos'

const BOGOTA = {
  lat: 4.6486, lng: -74.0627,
  puntos: [
    { lat: 4.6501, lng: -74.0635, nombre: 'Distribuidora La 15' },
    { lat: 4.6472, lng: -74.0618, nombre: 'Supermercado El Ahorro' },
    { lat: 4.6495, lng: -74.0608, nombre: 'Tienda Don Carlos' },
  ]
}

function loadLeaflet(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).L) { resolve(); return }
    if (!document.getElementById('leafletCss')) {
      const lCss = document.createElement('link')
      lCss.id = 'leafletCss'
      lCss.rel = 'stylesheet'
      lCss.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(lCss)
    }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => resolve()
    document.head.appendChild(s)
  })
}

interface Punto { lat: number; lng: number; nombre: string }

export default function HomePage() {
  const [precios, setPrecios] = useState<Record<string, number>>({})
  const [preciosLoading, setPreciosLoading] = useState(true)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState(false)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    fetch('/api/precios/publico')
      .then(r => r.json())
      .then((data: { precios: { rol: string; precio: number }[] }) => {
        const map: Record<string, number> = {}
        for (const p of data.precios ?? []) map[p.rol] = p.precio
        setPrecios(map)
        setPreciosLoading(false)
      })
      .catch(() => setPreciosLoading(false))
  }, [])

  // Inicializar mapa al montar — cache GPS tiene prioridad sobre Bogotá default
  useEffect(() => {
    try {
      const cached = localStorage.getItem('demo_gps')
      if (cached) {
        const { lat, lng, puntos, ts } = JSON.parse(cached)
        if (Date.now() - ts < 30 * 60 * 1000) {
          renderMapa(lat, lng, puntos, true)
          return
        }
      }
    } catch {}
    renderMapa(BOGOTA.lat, BOGOTA.lng, BOGOTA.puntos, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function renderMapa(lat: number, lng: number, puntos: Punto[], esReal: boolean) {
    const statusEl = document.getElementById('demoStatus')
    const demoPuntosEl = document.getElementById('demoPuntos')
    const mapEl = document.getElementById('demoMap')
    if (!mapEl || !demoPuntosEl || !statusEl) return

    // Destruir mapa anterior
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    demoPuntosEl.innerHTML = ''

    const mapHeight = window.innerWidth < 640 ? 280 : 380
    mapEl.style.height = `${mapHeight}px`
    statusEl.textContent = esReal ? 'GPS activo · tu ubicación' : 'Demo Bogotá'

    await loadLeaflet()
    const L = (window as any).L

    const map = L.map('demoMap', { zoomControl: true, attributionControl: false }).setView([lat, lng], 15)
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd'
    }).addTo(map)

    // CRÍTICO: invalidateSize después de que el contenedor sea visible
    setTimeout(() => map.invalidateSize(), 200)

    // Marker usuario
    const iconUser = L.divIcon({
      html: '<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px #10b981,0 0 24px rgba(16,185,129,.5)"></div>',
      className: '', iconSize: [16, 16], iconAnchor: [8, 8]
    })
    L.marker([lat, lng], { icon: iconUser }).addTo(map)
      .bindPopup(`<b>${esReal ? '📍 Tu ubicación' : '📍 Bogotá Centro'}</b>`)

    // Ruta por calles via OSRM (fallback: línea recta)
    const todosCoords = [[lat, lng], ...puntos.map(p => [p.lat, p.lng])]
    const osrmCoords = todosCoords.map(([la, ln]) => `${ln},${la}`).join(';')
    let routeLayer: any = null
    try {
      const osrmRes = await fetch(`/api/osrm-route?coords=${osrmCoords}`)
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json()
        const geom = osrmData?.routes?.[0]?.geometry
        if (geom) {
          routeLayer = L.geoJSON(geom, { style: { color: '#2563eb', weight: 4, opacity: 0.85 } }).addTo(map)
        }
      }
    } catch {}
    if (!routeLayer) {
      const coordsRuta: [number, number][] = [[lat, lng], ...puntos.map(p => [p.lat, p.lng] as [number, number])]
      L.polyline(coordsRuta, { color: '#2563eb', weight: 3, dashArray: '8 5', opacity: 0.85 }).addTo(map)
    }

    // Markers + lista
    const markers: any[] = []
    const rowEls: HTMLElement[] = []

    puntos.forEach((p, i) => {
      const iconPunto = L.divIcon({
        html: `<div id="demoMarker${i}" style="background:#2563eb;width:30px;height:30px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#fff;box-shadow:0 2px 12px rgba(37,99,235,.6)">${i + 1}</div>`,
        className: '', iconSize: [30, 30], iconAnchor: [15, 15]
      })
      const m = L.marker([p.lat, p.lng], { icon: iconPunto }).addTo(map)
        .bindPopup(`<b>${i + 1}. ${p.nombre}</b><br><span style="color:#93c5fd;font-size:.75rem">⏳ Pendiente visita</span>`)
      markers.push(m)

      const row = document.createElement('div')
      row.id = `demoRow${i}`
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.04);transition:all .4s;'
      row.innerHTML =
        `<div id="demoRowNum${i}" style="width:22px;height:22px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#fff;flex-shrink:0">${i + 1}</div>` +
        `<span style="font-size:.78rem;color:rgba(255,255,255,.8);flex:1">${p.nombre}</span>` +
        `<span id="demoRowSt${i}" style="font-size:.65rem;color:#93c5fd;font-weight:600">Pendiente</span>`
      demoPuntosEl.appendChild(row)
      rowEls.push(row)
    })

    // Tour animado
    let tourIdx = 0
    function tourStep() {
      const p = puntos[tourIdx]
      statusEl!.textContent = `${esReal ? '📍' : '🗺️'} En ${p.nombre}`
      map.panTo([p.lat, p.lng])
      markers[tourIdx].openPopup()

      const markerEl = document.getElementById(`demoMarker${tourIdx}`)
      if (markerEl) { markerEl.style.background = '#10b981'; markerEl.textContent = '✓'; markerEl.style.boxShadow = '0 2px 12px rgba(16,185,129,.6)' }
      const rowEl = rowEls[tourIdx]
      if (rowEl) { rowEl.style.background = 'rgba(16,185,129,.08)'; rowEl.style.borderColor = 'rgba(16,185,129,.3)' }
      const numEl = document.getElementById(`demoRowNum${tourIdx}`)
      if (numEl) { numEl.style.background = '#10b981'; numEl.textContent = '✓' }
      const stEl = document.getElementById(`demoRowSt${tourIdx}`)
      if (stEl) { stEl.textContent = 'Visitado ✓'; stEl.style.color = '#10b981' }

      tourIdx++
      if (tourIdx < puntos.length) {
        setTimeout(tourStep, 2400)
      } else {
        setTimeout(() => {
          statusEl!.textContent = `${puntos.length} puntos recorridos ✓`
          setTimeout(() => map.panTo([lat, lng]), 800)
        }, 1000)
      }
    }
    setTimeout(tourStep, 1200)
  }

  async function usarGps() {
    setGpsError(false)
    if (!navigator.geolocation) { setGpsError(true); return }

    // Intentar cache primero
    try {
      const cached = localStorage.getItem('demo_gps')
      if (cached) {
        const { lat, lng, puntos, ts } = JSON.parse(cached)
        const age = Date.now() - ts
        if (age < 30 * 60 * 1000) { // 30 min válido
          renderMapa(lat, lng, puntos, true)
          return
        }
      }
    } catch {}

    setGpsLoading(true)
    const statusEl = document.getElementById('demoStatus')
    if (statusEl) statusEl.textContent = 'Localizando...'

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        if (statusEl) statusEl.textContent = 'Buscando comercios...'

        const buildQuery = (r: number) =>
          `[out:json][timeout:15];(node["shop"](around:${r},${lat},${lng});node["amenity"](around:${r},${lat},${lng});node["office"](around:${r},${lat},${lng}););out 50;`

        const filterNamed = (els: any[]) =>
          els.filter(n => n.tags?.name).slice(0, 3)

        const FALLBACK_PUNTOS = [
          { lat: lat + 0.0009, lng: lng + 0.0005, nombre: 'Tienda Don Carlos' },
          { lat: lat - 0.0007, lng: lng + 0.0012, nombre: 'Supermercado El Ahorro' },
          { lat: lat + 0.0004, lng: lng - 0.0010, nombre: 'Distribuidora La 15' },
        ]

        const saveCacheAndRender = (puntos: any[]) => {
          setGpsLoading(false)
          try { localStorage.setItem('demo_gps', JSON.stringify({ lat, lng, puntos, ts: Date.now() })) } catch {}
          renderMapa(lat, lng, puntos, true)
        }

        const radios = [300, 600, 1200, 2500]
        let idx = 0

        const tryRadius = () => {
          fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: buildQuery(radios[idx]) })
            .then(r => r.json())
            .then((data: any) => {
              const named = filterNamed(data.elements || [])
              if (named.length >= 3) {
                saveCacheAndRender(named.map((n: any) => ({ lat: n.lat, lng: n.lon, nombre: n.tags.name })))
              } else if (idx < radios.length - 1) {
                idx++; tryRadius()
              } else {
                const puntos = named.length > 0
                  ? named.map((n: any) => ({ lat: n.lat, lng: n.lon, nombre: n.tags.name }))
                  : FALLBACK_PUNTOS
                saveCacheAndRender(puntos)
              }
            })
            .catch(() => {
              setGpsLoading(false)
              renderMapa(lat, lng, [
                { lat: lat + 0.0009, lng: lng + 0.0005, nombre: 'Tienda Don Carlos' },
                { lat: lat - 0.0007, lng: lng + 0.0012, nombre: 'Supermercado El Ahorro' },
                { lat: lat + 0.0004, lng: lng - 0.0010, nombre: 'Distribuidora La 15' },
              ], true)
            })
        }
        tryRadius()
      },
      () => { setGpsLoading(false); setGpsError(true) },
      { timeout: 12000, enableHighAccuracy: true }
    )
  }

  return (
    <div style={{minHeight:'auto',background:'#06050f',display:'flex',flexDirection:'column',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",color:'#fff',overflowX:'hidden'}}>
      <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 40px',background:'rgba(6,5,15,0.92)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontWeight:800,fontSize:'1.3rem'}}>
          <div style={{width:34,height:34,background:'#2563eb',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:16}}>🗺️</span>
          </div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{letterSpacing:0}}>{'TuAgent'}<span style={{color:'#2563eb'}}>X</span></span>
            <span style={{fontSize:'.8rem',color:'#93c5fd',fontWeight:600,verticalAlign:'baseline'}}>Gestor</span>
          </div>
        </div>
        <Link href="/login" style={{background:'#2563eb',color:'#fff',fontWeight:700,padding:'8px 20px',borderRadius:8,textDecoration:'none',fontSize:'.85rem'}}>Ingresar →</Link>
      </nav>

      {/* HERO */}
      <div style={{flex:1,padding:'80px 24px 40px',minHeight:'auto',background:'radial-gradient(ellipse at 70% 50%, rgba(37,99,235,.15) 0%, transparent 60%)'}}>
        <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row items-center gap-10 md:gap-16">
          <div className="w-full flex flex-col items-center text-center gap-5">
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(37,99,235,.1)',border:'1px solid rgba(37,99,235,.22)',borderRadius:16,padding:'8px 20px',fontSize:'.8rem',fontWeight:700,letterSpacing:1,textTransform:'uppercase' as const,color:'#93c5fd',boxShadow:'0 0 20px rgba(37,99,235,.4), 0 0 40px rgba(37,99,235,.2)'}}>📍 Gestión de fuerza de campo</div>
            <h1 style={{fontSize:'clamp(2rem,5vw,3rem)',fontWeight:800,lineHeight:1.12,letterSpacing:-.5,margin:0}}>Tu equipo en campo,<br/><span style={{color:'#93c5fd'}}>bajo control total</span></h1>
            <iframe
              src="https://tuagentx.com/demo-gestor-flow.html"
              style={{width:'100%',maxWidth:312,height:452,border:'none',borderRadius:17,display:'block'}}
              scrolling="no"
            />
            <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center',width:'100%',maxWidth:340}}>
              <button
                onClick={() => document.getElementById('demoGps')?.scrollIntoView({behavior:'smooth'})}
                style={{flex:1,minWidth:160,background:'#2563eb',color:'#fff',fontWeight:700,padding:'10px 20px',borderRadius:10,border:'none',fontSize:'.85rem',cursor:'pointer',boxShadow:'0 0 24px rgba(37,99,235,.3)'}}>
                📍 Probar Demo
              </button>
              <button
                onClick={() => document.getElementById('cotizador')?.scrollIntoView({behavior:'smooth'})}
                style={{flex:1,minWidth:160,background:'transparent',color:'#93c5fd',fontWeight:700,padding:'10px 20px',borderRadius:10,border:'1px solid rgba(37,99,235,.3)',fontSize:'.85rem',cursor:'pointer',boxShadow:'0 0 20px rgba(37,99,235,.4), 0 0 40px rgba(37,99,235,.15)'}}>
                💰 Cotiza Ya
              </button>
            </div>
            <p style={{fontSize:'.72rem',color:'#6b7280'}}>✓ Sin contrato · ✓ Funciona desde el movil · ✓ Soporte en español</p>
          </div>
        </div>
      </div>

      <style>{`@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}.shimmer-section{background:linear-gradient(90deg,transparent 0%,rgba(37,99,235,.08) 50%,transparent 100%);background-size:200% 100%;animation:shimmer 4s ease-in-out infinite}`}</style>

      {/* FEATURES */}
      <div className="shimmer-section" style={{padding:'32px 24px 40px',borderTop:'1px solid rgba(255,255,255,.05)',boxShadow:'0 0 40px rgba(37,99,235,.15)'}}>
        <div className="max-w-screen-xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[['🗺️','Rutas asignadas','Con orden de visita'],['📍','GPS tiempo real','Mapa Leaflet'],['👥','Multi-rol','Supervisores y vendedores'],['📊','Reportes diarios','Ventas, cobros, entregas'],['⚡','Impulsadoras','GPS validado'],['🔔','Notif push','Alertas instantaneas']].map(([ico,name,desc])=>(
              <div key={name} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:'12px 14px',textAlign:'left'}}>
                <div style={{fontSize:'1.1rem',marginBottom:5}}>{ico}</div>
                <div style={{fontSize:'.78rem',fontWeight:600,marginBottom:2}}>{name}</div>
                <div style={{fontSize:'.7rem',color:'#9ca3af',lineHeight:1.3}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DEMO GPS */}
      <div id="demoGps" className="shimmer-section" style={{background:'rgba(0,0,0,.25)',padding:'40px 24px',borderTop:'1px solid rgba(37,99,235,.1)',boxShadow:'0 0 40px rgba(37,99,235,.15)'}}>
        <div className="max-w-screen-xl mx-auto">
          <div style={{maxWidth:520,margin:'0 auto',textAlign:'center'}}>
            <div style={{fontSize:'.68rem',fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:'#93c5fd',marginBottom:12}}>🗺️ DEMO EN VIVO</div>
            <h2 style={{fontSize:'clamp(1.4rem,3vw,1.9rem)',fontWeight:800,marginBottom:12}}>Ve cómo funciona<br/><span style={{color:'#93c5fd'}}>con tu ubicación real</span></h2>
            <p style={{color:'#9ca3af',fontSize:'.9rem',lineHeight:1.6,maxWidth:380,margin:'0 auto 28px'}}>Activa el GPS y te mostramos una ruta simulada cerca de ti, tal como la ven tus vendedores en campo.</p>

            {/* Mapa siempre visible */}
            <div style={{width:'100%',borderRadius:16,overflow:'hidden',border:'1px solid rgba(37,99,235,.2)',boxShadow:'0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(37,99,235,.3)',marginBottom:16,position:'relative',zIndex:1}}>
              <div style={{background:'#0e0d1e',padding:'10px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 6px #10b981'}}></div>
                <span style={{fontSize:'.9rem',fontWeight:700,color:'#fff'}}>Ruta demo · 3 puntos</span>
                <span id="demoStatus" style={{display:'none'}}></span>
              </div>
              <div id="demoMap" style={{height:'clamp(280px,50vw,380px)',background:'#0d1117',position:'relative',zIndex:0}}></div>
              <div id="demoPuntos" style={{padding:'10px',display:'flex',flexDirection:'column',gap:4}}></div>
            </div>

            <button
              onClick={usarGps}
              disabled={gpsLoading}
              style={{background:'transparent',color:'#93c5fd',fontWeight:700,padding:'10px 24px',borderRadius:10,border:'1px solid rgba(37,99,235,.4)',fontSize:'.85rem',cursor:gpsLoading?'not-allowed':'pointer',opacity:gpsLoading?.7:1,marginBottom:8}}>
              {gpsLoading ? '📡 Obteniendo GPS...' : '📡 Usar mi ubicación real'}
            </button>
            {gpsError && <p style={{color:'#f87171',fontSize:'.75rem',marginTop:8}}>GPS no disponible en este dispositivo.</p>}
          </div>
        </div>
      </div>

      <PlanesDinamicos precios={precios} loading={preciosLoading} />
      <CotizadorGestor precios={precios} loading={preciosLoading} />
      <footer style={{background:'#07070a',padding:'24px 40px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{fontWeight:800,fontSize:'.95rem'}}>{'TuAgent'}<span style={{color:'#2563eb'}}>X</span> <span style={{fontSize:'.65rem',color:'#93c5fd',fontWeight:600}}>Gestor</span></div>
        <div style={{color:'#6b7280',fontSize:'.75rem'}}>© 2026 TuAgentX · Colombia</div>
      </footer>
    </div>
  )
}
