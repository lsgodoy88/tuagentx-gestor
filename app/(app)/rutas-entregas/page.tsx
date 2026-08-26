'use client'
import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

function fechaHoyBogota() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function nombreFecha(f: string) {
  if (!f) return ''
  const hoy = fechaHoyBogota()
  if (f === hoy) return '📅 Hoy'
  const d = new Date(f + 'T12:00:00')
  const dia = DIAS[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${dia} ${dd}-${mm}-${yy}`
}

function parseHora(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{2}):(\d{2})/)
  if (!m) return null
  const h = parseInt(m[1])
  const mm = m[2]
  const ampm = h >= 12 ? 'p. m.' : 'a. m.'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${String(h12).padStart(2,'0')}:${mm} ${ampm}`
}

function CardEntregado({ nombre, hora, nota, direccion, ciudad, fotoUrl, lat, lng, isLast }: {
  nombre: string; hora: string | null; nota: string; direccion?: string; ciudad?: string; fotoUrl?: string | null; lat?: number | null; lng?: number | null; isLast: boolean
}) {
  const [expandido, setExpandido] = useState(false)
  const [fotoSrc, setFotoSrc] = useState<string | null>(null)
  const [fotoLoading, setFotoLoading] = useState(false)

  async function abrirFoto() {
    if (!fotoUrl) return
    if (fotoSrc) return
    setFotoLoading(true)
    try {
      const res = await fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: fotoUrl }) })
      const data = await res.json()
      setFotoSrc(data.url || fotoUrl)
    } finally { setFotoLoading(false) }
  }

  const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null

  return (
    <>
      <div className={`py-3.5 ${!isLast ? 'border-b border-white/20' : ''}`}>
        {/* Línea 1: nombre + hora + toggle */}
        <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => setExpandido(v => !v)}>
          <span className="text-white text-sm font-semibold truncate flex-1">{nombre}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hora && <span className="text-emerald-400 text-xs">{hora}</span>}
            <span className="text-zinc-600 text-xs">{expandido ? '▲' : '▼'}</span>
          </div>
        </div>
        {/* Línea 2 colapsada: nota + foto */}
        <div className="flex items-center gap-2 mt-1">
          {nota && <span className="text-white text-xs flex-1 truncate">📦 {nota}</span>}
          {fotoUrl && (
            <button onClick={abrirFoto} disabled={fotoLoading}
              className="text-xs px-2 py-0.5 rounded-lg bg-zinc-800 text-white flex items-center gap-1 flex-shrink-0">
              {fotoLoading ? '⏳' : '🖼'} <span>Foto Entrega</span>
            </button>
          )}
        </div>

        {expandido && (
          <div className="mt-2 pl-2 space-y-1.5">
            {direccion && (
              <div className="flex items-center gap-2">
                <p className="text-white text-xs truncate flex-1">{direccion}{ciudad ? `, ${ciudad}` : ''}</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer"
                    className="text-xs px-2 py-0.5 rounded-lg bg-zinc-800 text-white flex-shrink-0">
                    🗺️
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal foto */}
      {fotoSrc && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFotoSrc(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={fotoSrc} alt="Foto entrega" className="max-w-full max-h-[80vh] rounded-xl object-contain" />
            <button onClick={() => setFotoSrc(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold">
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function RutasEntregasPage() {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const router = useRouter()
  const [rutas, setRutas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!user || user.role !== 'entregas') { router.push('/'); return }
    fetch('/api/rutas/historial')
      .then(r => r.json())
      .then(d => {
        const hoy = fechaHoyBogota()
        const todas = Array.isArray(d) ? d : []
        const porFecha: Record<string, any> = {}
        for (const r of todas) {
          if (!r.fecha) continue
          const fechaRuta = r.fecha.split('T')[0]
          if (fechaRuta > hoy) continue
          if (!porFecha[fechaRuta]) porFecha[fechaRuta] = { fecha: fechaRuta, clientes: [], visitas: [] }
          for (const c of (r.clientes || [])) {
            if (!porFecha[fechaRuta].clientes.some((x: any) => x.clienteId === c.clienteId))
              porFecha[fechaRuta].clientes.push(c)
          }
          for (const v of (r.visitas || [])) {
            if (!porFecha[fechaRuta].visitas.some((x: any) => x.id === v.id))
              porFecha[fechaRuta].visitas.push(v)
          }
        }
        const misRutas = Object.values(porFecha)
          .filter((r: any) => r.clientes.length > 0 || (r.fecha === hoy && r.visitas.length > 0))
          .sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))
        setRutas(misRutas)
        const hoyEntry = misRutas.find((r: any) => r.fecha === hoy)
        if (hoyEntry) setExpandidos(new Set([hoy]))
        setLoading(false)
      })
  }, [status, user, router])

  function toggleExpandido(fecha: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(fecha) ? next.delete(fecha) : next.add(fecha)
      return next
    })
  }

  const rutasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return rutas
    const q = busqueda.toLowerCase()
    return rutas.map((r: any) => {
      const filtrados = r.clientes.filter((rc: any) =>
        r.visitas.some((v: any) => v.clienteId === rc.clienteId) &&
        rc.cliente?.nombre?.toLowerCase().includes(q)
      )
      return filtrados.length ? { ...r, _filtrados: filtrados } : null
    }).filter(Boolean)
  }, [rutas, busqueda])

  if (loading) return (
    <div className="space-y-3 pb-20 pt-4">
      {[1,2,3].map(i => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-16 animate-pulse" />)}
    </div>
  )

  return (
    <div className="space-y-3 pb-20 pt-4">
      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="🔍 Buscar cliente..."
        className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
        style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}
      />

      {rutasFiltradas.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">
          {busqueda ? 'Sin resultados' : 'Sin entregas registradas'}
        </p>
      )}

      {rutasFiltradas.map((r: any) => {
        const totalClientes = r.clientes?.length || 0
        const clientesEntregados = (r._filtrados ?? (r.clientes?.filter((rc: any) =>
          r.visitas.some((v: any) => v.clienteId === rc.clienteId)
        ) || [])).sort((a: any, b: any) => {
          const va = r.visitas.find((v: any) => v.clienteId === a.clienteId)
          const vb = r.visitas.find((v: any) => v.clienteId === b.clienteId)
          const ta = va?.fechaBogota || va?.createdAt || ''
          const tb = vb?.fechaBogota || vb?.createdAt || ''
          return ta.localeCompare(tb)
        })
        const visitados = r.clientes?.filter((rc: any) =>
          r.visitas.some((v: any) => v.clienteId === rc.clienteId)
        ).length || 0
        const pct = totalClientes > 0 ? Math.round(visitados / totalClientes * 100) : 0
        const expandido = expandidos.has(r.fecha)

        return (
          <div key={r.fecha} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => toggleExpandido(r.fecha)}>
              <p className="text-white text-sm font-semibold">{nombreFecha(r.fecha)}</p>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-xs">📦 {totalClientes}</span>
                <span className="text-emerald-400 text-xs">✓ {visitados}</span>
                {visitados === totalClientes && totalClientes > 0
                  ? <span className="text-xs font-semibold text-emerald-400">100%</span>
                  : <span className="text-xs font-semibold text-amber-400">{pct}%</span>
                }
                <span className="text-zinc-400 text-sm bg-zinc-800 px-2.5 py-1.5 rounded-lg ml-1">
                  {expandido ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {expandido && (
              <div className="mt-2 border-t border-zinc-800 pt-1">
                {clientesEntregados.length === 0 && (
                  <p className="text-zinc-600 text-xs text-center py-2">Sin entregas este día</p>
                )}
                {clientesEntregados.map((rc: any, i: number) => {
                  const visita = r.visitas.find((v: any) => v.clienteId === rc.clienteId)
                  const raw = visita?.fechaBogota || (visita?.createdAt
                    ? new Date(new Date(visita.createdAt).getTime() - 5*3600*1000).toISOString().replace('Z','')
                    : null)
                  const hora = parseHora(raw)
                  const c = rc.cliente
                  const nota = rc.notas?.replace(/#(\d+)/, 'F_$1') || ''
                  return (
                    <CardEntregado
                      key={rc.id}
                      nombre={c?.nombre || ''}
                      hora={hora}
                      nota={nota}
                      direccion={c?.direccion}
                      ciudad={c?.ciudad}
                      fotoUrl={visita?.firma || null}
                      lat={visita?.lat || null}
                      lng={visita?.lng || null}
                      isLast={i === clientesEntregados.length - 1}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
