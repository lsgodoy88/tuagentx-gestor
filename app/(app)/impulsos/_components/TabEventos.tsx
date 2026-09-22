'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function TabEventos() {
  const { data: session } = useSession()
  const _u = session?.user as any
  const esAdmin = _u?.role === 'empresa'
  const esSupervisor = _u?.role === 'supervisor'

  const _hoy = new Date()
  const _dom = new Date(_hoy); _dom.setDate(_hoy.getDate() - _hoy.getDay())
  const _sab = new Date(_dom); _sab.setDate(_dom.getDate() + 6)
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const defaultDesde = toISO(_dom)
  const defaultHasta = toISO(_sab)

  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(defaultHasta)
  const filtroModificado = desde !== defaultDesde || hasta !== defaultHasta

  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({})
  const [visorFotos, setVisorFotos] = useState<{ keys: string[]; idx: number } | null>(null)

  async function cargar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    const d = await fetch('/api/impulsar/evento?' + params).then(r => r.json())
    setEventos(d.eventos || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [desde, hasta])

  async function verFoto(key: string) {
    if (fotoUrls[key]) return
    const d = await fetch('/api/impulsar/evento/foto-url?key=' + encodeURIComponent(key)).then(r => r.json())
    setFotoUrls(prev => ({ ...prev, [key]: d.url }))
  }

  function abrirVisor(fotos: string[], idx: number) {
    setVisorFotos({ keys: fotos, idx })
    fotos.forEach(k => verFoto(k))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar este evento?')) return
    await fetch('/api/impulsar/evento?id=' + id, { method: 'DELETE' })
    cargar()
  }

  const fmtFecha = (f: string) => {
    const iso = f.slice(0, 10)
    const [y, m, d] = iso.split('-')
    return d + '/' + m + '/' + y
  }

  const grupos: Record<string, { nombre: string; eventos: any[] }> = {}
  for (const ev of eventos) {
    if (!grupos[ev.empleadoId]) grupos[ev.empleadoId] = { nombre: ev.impulsadoraNombre, eventos: [] }
    grupos[ev.empleadoId].eventos.push(ev)
  }

  const thEv: React.CSSProperties = {
    padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8',
    whiteSpace: 'nowrap', overflow: 'hidden', borderBottom: '1px solid #1e2a3d',
    background: '#0a1020', userSelect: 'none', textAlign: 'left',
  }
  const tdEv: React.CSSProperties = {
    padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #131c2e',
    borderLeft: '2px solid rgba(255,255,255,0.07)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  return (
    <div className="space-y-3">
      {visorFotos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setVisorFotos(null)}>
          <div className="relative w-full max-w-lg px-4" onClick={e => e.stopPropagation()}>
            <img src={fotoUrls[visorFotos.keys[visorFotos.idx]] || ''} alt="" className="w-full rounded-2xl object-contain max-h-[80vh]" />
            <div className="flex justify-center gap-2 mt-3">
              {visorFotos.keys.map((_, i) => (
                <button key={i} onClick={() => setVisorFotos(v => v ? { ...v, idx: i } : v)}
                  className={'w-2.5 h-2.5 rounded-full ' + (i === visorFotos.idx ? 'bg-blue-400' : 'bg-zinc-600')} />
              ))}
            </div>
            {visorFotos.keys.length > 1 && (
              <>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx - 1 + v.keys.length) % v.keys.length } : v)}
                  className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8249;</button>
                <button onClick={() => setVisorFotos(v => v ? { ...v, idx: (v.idx + 1) % v.keys.length } : v)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/50 text-white px-3 py-2 rounded-xl">&#8250;</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
          onFocus={e => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
          className={'bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-1 min-w-0 cursor-pointer ' + (filtroModificado ? 'border border-red-500' : 'border border-[#1e2a3d]')}
          style={{ colorScheme: 'dark' }} />
        <span className="text-zinc-500 text-sm flex-shrink-0">—</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
          onFocus={e => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
          className={'bg-[#0d1220] rounded-lg px-3 py-2 text-white text-sm focus:outline-none flex-1 min-w-0 cursor-pointer ' + (filtroModificado ? 'border border-red-500' : 'border border-[#1e2a3d]')}
          style={{ colorScheme: 'dark' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : eventos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-10 text-center">
          <p className="text-zinc-400 text-sm">Sin eventos en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.values(grupos).map(grupo => (
            <div key={grupo.nombre} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                  <span>👤</span>
                  <span className="text-sm font-bold text-white">{grupo.nombre}</span>
                </div>
                <span className="text-sm font-bold text-zinc-400">{grupo.eventos.length} evento{grupo.eventos.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 480, background: '#0a0f1a' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e2a3d' }}>
                        {['FECHA', 'CLIENTE', 'CIUDAD', 'TIPO', 'FOTOS'].map(h => (
                          <th key={h} style={{ ...thEv, textAlign: h === 'FOTOS' ? 'center' : 'left' }}>{h}</th>
                        ))}
                        {(esAdmin || esSupervisor) && <th style={thEv}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.eventos.map((ev: any, i: number) => (
                        <tr key={ev.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ ...tdEv, color: 'white' }}>{fmtFecha(ev.fecha)}</td>
                          <td style={{ ...tdEv, color: 'white', fontWeight: 500 }}>{ev.clienteNombre}</td>
                          <td style={{ ...tdEv, color: '#94a3b8', fontSize: 11 }}>{ev.ciudad || '—'}</td>
                          <td style={{ ...tdEv, color: 'white' }}>{ev.tipoEvento}</td>
                          <td style={{ ...tdEv, textAlign: 'center' }}>
                            <button onClick={() => abrirVisor(ev.fotos, 0)}
                              className="flex items-center gap-1 mx-auto text-blue-400 hover:text-blue-300 transition-colors">
                              <span>🖼</span>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{ev.fotos?.length || 0}</span>
                            </button>
                          </td>
                          {(esAdmin || esSupervisor) && (
                            <td style={tdEv}>
                              <button onClick={() => eliminar(ev.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors text-xs">🗑</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
