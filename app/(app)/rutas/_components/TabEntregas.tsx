'use client'
import { useEffect, useRef, useState } from 'react'
import type { ClienteRow } from '../_lib/tipos'
import { fmtHoraBogota, fmtFechaBogota, nombreFechaLargo } from '../_lib/utils'

function GrupoEntregas({ clave, label, clientes, color, onAnular }: { clave:string; label:string; clientes:ClienteRow[]; color?:string; onAnular?:(id:string)=>void }) {
  const [open, setOpen] = useState(false)
  const [anulando, setAnulando] = useState<string|null>(null)
  const [confirmando, setConfirmando] = useState<string|null>(null)
  const longRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  function startLong(rcId: string) { longRef.current = setTimeout(() => setConfirmando(rcId), 600) }
  function cancelLong() { if (longRef.current) { clearTimeout(longRef.current); longRef.current = null } }
  async function anularRc(rcId: string) {
    if (!onAnular) return
    setAnulando(rcId)
    const r = await fetch('/api/rutas/cliente', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rutaClienteId: rcId }) })
    setAnulando(null); setConfirmando(null)
    if (r.ok) onAnular(rcId)
  }
  return (
    <div style={{background:'#0d1220', border:`1px solid ${color || '#1e2a3d'}`, borderRadius:14, overflow:'hidden'}}>
      <button onClick={() => setOpen(o => !o)} style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'transparent', border:'none', cursor:'pointer'}}>
        <span style={{color:'white', fontWeight:700, fontSize:14}}>{label}</span>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <span style={{color: color || '#60a5fa', fontSize:12, fontWeight:600}}>{"\u{1F4E6}"} {clientes.length}</span>
          <span style={{color:'#64748b', fontSize:12}}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div style={{borderTop:`1px solid ${color || '#1e2a3d'}`}}>
          <div className="grid grid-cols-1 md:grid-cols-2">
          {clientes.map(({ rc, visita, asignadoA, horaEntrega, fechaAsignado }, i) => {
            const c = rc.cliente
            const ejecutado = !!visita
            const factM = (rc.notas || '').match(/#(\d+)/)
            const factura = factM ? factM[1] : null
            const esConfirmando = confirmando === rc.id
            return (
              <div key={rc.id || i}
                onTouchStart={() => { if (onAnular && !ejecutado) startLong(rc.id) }}
                onTouchEnd={cancelLong} onTouchMove={cancelLong}
                onClick={(e) => { if (esConfirmando && !(e.target as HTMLElement).closest('button')) setConfirmando(null) }}
                style={{ padding:'10px 14px', borderBottom:'1px solid #131c2e', background: esConfirmando ? 'rgba(220,38,38,0.12)' : i%2===0 ? '#0a0f1a' : '#080d18', display:'flex', alignItems:'flex-start', gap:10, position:'relative' }}>
                <span style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, background: ejecutado ? '#059669' : '#374151', color: ejecutado ? 'white' : '#9ca3af' }}>{ejecutado ? '✓' : i+1}</span>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                    <span style={{color:'white', fontSize:13, fontWeight:600, flex:1, minWidth:0}}>{c?.nombre || '—'}</span>
                    {factura && <span style={{color:'white', fontSize:12, fontWeight:600, flexShrink:0}}>#{factura}</span>}
                  </div>
                  {c?.direccion && <p style={{color:'#64748b', fontSize:11, margin:'2px 0 0'}}>{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</p>}
                  <div style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:10, marginTop:4}}>
                    <span style={{color:'#94a3b8', fontSize:11}}>{"\u{1F464}"} {asignadoA}</span>
                    {fechaAsignado && <span style={{color:'#64748b', fontSize:11}}>{"\u{1F4C5}"} {fechaAsignado}</span>}
                    {ejecutado && horaEntrega && <span style={{color:'#34d399', fontSize:11}}>{"\u{1F550}"} {horaEntrega}</span>}
                  </div>
                </div>
                {esConfirmando && onAnular && (
                  <div style={{position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', display:'flex', gap:6, zIndex:10}}>
                    <button onClick={() => anularRc(rc.id)} disabled={anulando === rc.id} style={{background:'#dc2626', color:'white', border:'none', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700, cursor:'pointer'}}>{anulando === rc.id ? '...' : 'Devolver a Bodega'}</button>
                    <button onClick={() => setConfirmando(null)} style={{background:'#374151', color:'white', border:'none', borderRadius:8, padding:'5px 12px', fontSize:12, cursor:'pointer'}}>{"×"}</button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TabEntregasAdmin() {
  const [rutas, setRutas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetch('/api/rutas').then(r => r.json()).then((d: any) => {
      const todas = Array.isArray(d) ? d : []
      setRutas(todas.filter((r: any) => r.clientes?.length > 0).sort((a: any, b: any) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()))
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl h-14 animate-pulse" />)}</div>

  const hoy = new Date().toISOString().split('T')[0]

  const buildClientes = (rutasList: any[]): ClienteRow[] =>
    rutasList.flatMap((r: any) => (r.clientes || []).map((rc: any) => {
      const visita = (r.visitas || []).find((v: any) => v.clienteId === rc.clienteId)
      const asignadoA = r.empleados?.map((re: any) => re.empleado?.nombre).filter(Boolean).join(', ') || '—'
      return { rc, visita, asignadoA, horaEntrega: visita ? fmtHoraBogota(visita.fechaBogota || visita.createdAt) : null, fechaAsignado: rc.asignadoEn ? fmtFechaBogota(rc.asignadoEn) : null }
    }))

  const pendientes = rutas.filter(r => { const dia = (r.fecha || '').split('T')[0]; return !r.cerrada || dia >= hoy })
  const clientesPendientes = buildClientes(pendientes).filter(row => !row.visita)
  const historial = rutas.filter(r => { const dia = (r.fecha || '').split('T')[0]; return r.cerrada && dia < hoy })
  const porDia: Record<string, any[]> = {}
  historial.forEach(r => { const dia = (r.fecha || '').split('T')[0]; if (!porDia[dia]) porDia[dia] = []; porDia[dia].push(r) })
  const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a))

  const q = busqueda.trim().toLowerCase()
  const filtrar = (rows: ClienteRow[]) => !q ? rows : rows.filter(({ rc }) => rc.cliente?.nombre?.toLowerCase().includes(q) || (rc.notas || '').toLowerCase().includes(q))

  if (clientesPendientes.length === 0 && dias.length === 0) return <p className="text-zinc-500 text-sm text-center py-10">Sin historial de entregas</p>

  return (
    <div className="space-y-2">
      <div className="relative min-w-0 mb-3">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente u orden..."
          className={`min-w-0 w-full bg-[#0d1220] text-white rounded-lg px-3 py-2 text-sm focus:outline-none ${busqueda ? 'border border-red-500' : 'border border-[#1e2a3d]'}`} />
        {busqueda && <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-base leading-none">×</button>}
      </div>

      {filtrar(clientesPendientes).length > 0 && (
        <GrupoEntregas clave="pendientes" label="Pendientes de entrega" clientes={filtrar(clientesPendientes)} color="#10b981"
          onAnular={(id) => setRutas(prev => prev.map(r => ({...r, clientes: (r.clientes || []).filter((rc: any) => rc.id !== id)})))} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {dias.map(dia => {
        const clientesDia = filtrar(buildClientes(porDia[dia]))
        if (q && clientesDia.length === 0) return null
        const isOpen = q ? true : expandidos.has(dia)
        return (
          <div key={dia} style={{background:'#0d1220', border:'1px solid #1e2a3d', borderRadius:14, overflow:'hidden'}}>
            <button onClick={() => toggle(dia)} style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', cursor:'pointer', background:'transparent', border:'none'}}>
              <span style={{color:'white', fontWeight:700, fontSize:14}}>{nombreFechaLargo(dia)}</span>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <span style={{color:'#60a5fa', fontSize:12, fontWeight:600}}>{"\u{1F4E6}"} {clientesDia.length}</span>
                <span style={{color:'#64748b', fontSize:12}}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {isOpen && (
              <div style={{borderTop:'1px solid #1e2a3d'}}>
                {clientesDia.map(({ rc, visita, asignadoA, horaEntrega, fechaAsignado }, i) => {
                  const c = rc.cliente
                  const ejecutado = !!visita
                  const factM = (rc.notas || '').match(/#(\d+)/)
                  const factura = factM ? factM[1] : null
                  return (
                    <div key={rc.id || i} style={{ padding:'10px 16px', borderBottom:'1px solid #131c2e', background: i%2===0 ? '#0a0f1a' : '#080d18', display:'flex', alignItems:'flex-start', gap:10 }}>
                      <span style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, background: ejecutado ? '#059669' : '#374151', color: ejecutado ? 'white' : '#9ca3af' }}>{ejecutado ? '✓' : i+1}</span>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                          <p style={{color:'white', fontSize:13, fontWeight:600, margin:0, flex:1, minWidth:0}}>{c?.nombre || '—'}</p>
                          {factura && <span style={{color:'white', fontSize:12, fontWeight:600, flexShrink:0}}>#{factura}</span>}
                        </div>
                        {c?.direccion && <p style={{color:'#64748b', fontSize:11, margin:'2px 0 0'}}>{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ''}</p>}
                        <div style={{display:'flex', alignItems:'center', flexWrap:'wrap', gap:10, marginTop:4}}>
                          <span style={{color:'#94a3b8', fontSize:11}}>{"\u{1F464}"} {asignadoA}</span>
                          {fechaAsignado && <span style={{color:'#64748b', fontSize:11}}>{"\u{1F4C5}"} {fechaAsignado}</span>}
                          {ejecutado && horaEntrega && <span style={{color:'#34d399', fontSize:11}}>{"\u{1F550}"} {horaEntrega}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
