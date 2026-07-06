'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const LIMIT = 10

interface Props {
  accion: string
  onSeleccionar: (cliente: any) => void
  onNuevoProspecto: (nombre: string) => void
  onCerrar: () => void
  onHayResultados?: (hay: boolean) => void
}

export default function BuscadorInlineAccion({ accion, onSeleccionar, onNuevoProspecto, onCerrar, onHayResultados }: Props) {
  const [q, setQ]               = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [modoProspecto, setModoProspecto] = useState(false)
  const [nombreProspecto, setNombreProspecto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const inputProspectoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const fetchPage = useCallback(async (texto: string, p: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPage(p)
    setLoading(true)
    try {
      const extra = accion === 'cobro' ? '&conDeuda=true' : ''
      const r = await fetch(`/api/clientes?q=${encodeURIComponent(texto)}&page=${p}&limit=${LIMIT}${extra}`, { signal: ctrl.signal })
      const d = await r.json()
      setClientes(d.clientes || [])
      setTotal(d.total || 0)
    } catch (e: any) {
      if (e.name !== 'AbortError') setClientes([])
    } finally { setLoading(false) }
  }, [accion])

  useEffect(() => {
    if (q.trim().length < 3) { abortRef.current?.abort(); setClientes([]); setTotal(0); setPage(1); return }
    const t = setTimeout(() => fetchPage(q, 1), 300)
    return () => clearTimeout(t)
  }, [q, fetchPage])

  const totalPages = Math.ceil(total / LIMIT)
  useEffect(() => { if (modoProspecto) inputProspectoRef.current?.focus() }, [modoProspecto])
  const hayResultados = loading || clientes.length > 0 || q.trim().length > 0

  const irPagina = useCallback((p: number) => { fetchPage(q, p) }, [fetchPage, q])

  return (
    <div style={{position:'relative', marginTop:'3%'}}>
      <div className="flex items-center justify-center gap-2 px-4 py-3"
        style={{borderRadius: hayResultados ? '16px 16px 0 0' : '16px', border:'1px solid rgba(59,130,246,0.65)', background:'rgba(59,130,246,0.20)'}}>
        {modoProspecto ? (
          <>
            <input
              ref={inputProspectoRef}
              value={nombreProspecto}
              onChange={e => setNombreProspecto(e.target.value)}
              placeholder="Nombre del prospecto..."
              className="rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{background:'rgba(8,12,35,0.80)', border:'1px solid rgba(99,102,241,0.40)', width:'65%'}}
            />
            {(() => { const valido = nombreProspecto.trim().split(/\s+/).filter(Boolean).length >= 2; return (
              <button
                onClick={() => valido && onNuevoProspecto(nombreProspecto.trim())}
                disabled={!valido}
                className="text-white text-sm font-semibold px-3 py-2.5 rounded-xl whitespace-nowrap"
                style={{background: valido ? 'rgba(99,102,241,0.80)' : 'rgba(99,102,241,0.25)', border:'1px solid rgba(99,102,241,0.50)', opacity: valido ? 1 : 0.5}}>
                →
              </button>
            )})()}
            <button onClick={() => setModoProspecto(false)} className="text-zinc-400 hover:text-white text-xl leading-none px-1">×</button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              value={q}
              onChange={e => { setQ(e.target.value); onHayResultados?.(e.target.value.trim().length >= 3) }}
              placeholder="Buscar cliente..."
              className="rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{background:'rgba(8,12,35,0.80)', border:'1px solid rgba(59,130,246,0.25)', width: accion === 'visita' ? '65%' : '85%'}}
            />
            {accion === 'visita' && (
              <button onClick={() => setModoProspecto(true)}
                className="text-indigo-300 text-xs font-semibold px-2 py-2.5 rounded-xl whitespace-nowrap"
                style={{background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.35)'}}>
                ✨ ¿Es Nuevo?
              </button>
            )}
            <button onClick={() => { onHayResultados?.(false); onCerrar() }} className="text-zinc-400 hover:text-white text-xl leading-none px-1">×</button>
          </>
        )}
      </div>

      {hayResultados && (
        <div style={{background:'rgba(10,15,40,0.97)', border:'1px solid rgba(59,130,246,0.50)', borderTop:'none', borderRadius:'0 0 16px 16px'}}>
          {loading && <p className="text-zinc-500 text-xs text-center py-3">Buscando...</p>}
          {!loading && clientes.length > 0 && (
            <>
              <div className="px-2 pt-2 space-y-1">
                {clientes.map(cl => (
                  <button key={cl.id} onClick={() => onSeleccionar(cl)}
                    className="w-full text-left px-3 py-2 rounded-xl text-white text-sm hover:bg-white/10 transition-colors">
                    <span className="font-medium">{cl.nombre}</span>
                    {cl.nombreComercial && <span className="text-zinc-400 text-xs ml-1">· {cl.nombreComercial}</span>}
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2">
                  <button onClick={() => irPagina(page - 1)} disabled={page === 1}
                    className="text-blue-400 text-xs disabled:opacity-30">← Ant</button>
                  <span className="text-zinc-500 text-xs">{page} / {totalPages}</span>
                  <button onClick={() => irPagina(page + 1)} disabled={page >= totalPages}
                    className="text-blue-400 text-xs disabled:opacity-30">Sig →</button>
                </div>
              )}
            </>
          )}
          {!loading && q.trim() && clientes.length === 0 && (
            <p className="text-zinc-500 text-xs text-center py-3">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  )
}
