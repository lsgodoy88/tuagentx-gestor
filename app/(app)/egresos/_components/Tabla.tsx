'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react'
import ModalAdjuntarEgreso from '@/components/ModalAdjuntarEgreso'
import { fmt, fmtFecha } from '../_lib/utils'
import { filaVacia, type Fila, type Categoria } from '../_lib/tipos'

const thStyle: React.CSSProperties = { padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d', borderLeft: '2px solid rgba(255,255,255,0.07)', background: '#0a1020' }
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13, fontWeight: 500, color: '#ffffff', borderBottom: '1px solid #1e2a3d', whiteSpace: 'nowrap' }

export function Tabla({ cat, mes, anio, scrollRefs, onCatUpdate, onTotalesUpdate, isAdmin = false, canEdit = false, canAdmin = false }: { cat: Categoria; mes: number; anio: number; scrollRefs: React.MutableRefObject<HTMLDivElement[]>; onCatUpdate?: (id:string, label:string, emoji:string) => void; onTotalesUpdate?: () => void; isAdmin?: boolean; canEdit?: boolean; canAdmin?: boolean }) {
  const [editandoTitulo, setEditandoTitulo] = React.useState(false)
  const [nuevoLabel, setNuevoLabel] = React.useState(cat.label)
  const [modoEliminar, setModoEliminar] = useState(false)
  const [filaEliminar, setFilaEliminar] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [filaAccion, setFilaAccion] = useState<string | null>(null)
  const [proveedores, setProveedores] = useState<{id:string,firstName:string,lastName:string|null,document:string|null}[]>([])
  const [buscandoProv, setBuscandoProv] = useState('')
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filas, setFilas] = useState<Fila[]>([])
  const [editando, setEditando] = useState<Record<number, boolean>>({})
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [subiendoAdj, setSubiendoAdj] = useState<Record<string, boolean>>({})
  const [modalAdjIdx, setModalAdjIdx] = useState<number | null>(null)
  const [modalEgresoId, setModalEgresoId] = useState<string|null>(null)
  const debounceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const fileInputRefs = useRef<Map<number, HTMLInputElement | null>>(new Map())

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/egresos?categoria=${cat.key}&mes=${mes}&anio=${anio}`)
    const d = await res.json()
    const rows: Fila[] = (d.egresos || []).map((e: any) => ({
      id: e.id, fecha: e.fecha?.split('T')[0] || '', concepto: e.concepto,
      valor: String(Math.round(parseFloat(e.valor)||0)),
      retencion: String(Math.round(parseFloat(e.retencion)||0)),
      abonoPago: String(Math.round(parseFloat(e.abonoPago)||0)),
      descuento: String(Math.round(parseFloat(e.descuento)||0)),
      saldo: String(Math.round(parseFloat(e.saldo)||0)),
      fechaPago: e.fechaPago?.split('T')[0] || '', medioPago: e.medioPago || '',
      estado: e.estado, autorizado: e.autorizado, categoria: cat.key, evidenciaKey: e.evidenciaKey || '', abonosCount: e._count?.abonos ?? 0, esNueva: false, proveedorId: e.proveedor?.id || null, proveedorNombre: e.proveedor ? (e.proveedor.firstName + (e.proveedor.lastName ? ' ' + e.proveedor.lastName : '')) : null, proveedorData: e.proveedor || null,
    }))
    setFilas(rows)
  }, [cat.key, mes, anio])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && modalAdjIdx === null) cargar() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [cargar, modalAdjIdx])

  // beforeunload — guardar al cerrar/navegar
  useEffect(() => {
    const handler = () => {
      filasRef.current.forEach((f, idx) => {
        if ((f.concepto || f.valor) && (f.esNueva || editando[idx])) {
          const body = { ...f, categoria: cat.key }
          const url = '/api/egresos'
          const data = JSON.stringify(body)
          if (navigator.sendBeacon && f.id) {
            navigator.sendBeacon(url + '?method=PATCH', new Blob([data], { type: 'application/json' }))
          }
        }
      })
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editando, cat.key])

  // Guardar filas pendientes al desmontar (navegación sin onBlur)
  const filasRef = useRef<Fila[]>([])
  const guardandoNuevaRef = useRef<Set<number>>(new Set())
  useEffect(() => { filasRef.current = filas }, [filas])
  useEffect(() => {
    return () => {
      filasRef.current.forEach((f, idx) => {
        if ((f.concepto || f.valor) && (f.esNueva || editando[idx])) {
          const body = { ...f, categoria: cat.key }
          if (f.id) {
            fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          }
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(idx: number, campo: string, valor: any) {
    setFilas(prev => prev.map((f, i) => {
      if (i !== idx) return f
      const updated = { ...f, [campo]: valor }
      // Recalcular saldo automáticamente
      const v = parseInt(campo === 'valor' ? valor : updated.valor) || 0
      const r = parseInt(campo === 'retencion' ? valor : updated.retencion) || 0
      const d = parseInt(campo === 'descuento' ? valor : updated.descuento) || 0
      const a = parseInt(campo === 'abonoPago' ? valor : updated.abonoPago) || 0
      if (['valor','retencion','descuento','abonoPago'].includes(campo)) {
        updated.saldo = String(Math.max(0, v - r - a - d))
      }
      return updated
    }))
  }

  function scheduleGuardar(idx: number) {
    setTimeout(() => {
      const active = document.activeElement
      const activeIdx = active?.closest('[data-row-idx]')?.getAttribute('data-row-idx')
      if (activeIdx === String(idx)) return
      const f = filasRef.current[idx]
      if (!f) return
      const tieneContenido = !!(f.concepto && f.valor)
      if (tieneContenido) {
        guardar(idx)
      } else if (f.esNueva && !f.concepto && !f.valor) {
        setFilas(prev => prev.filter((_, i) => i !== idx))
      }
    }, 0)
  }

  async function handleAdjuntarFila(idx: number, file: File) {
    const f = filasRef.current[idx]
    if (!f?.id) return
    const egresoId = f.id
    setSubiendoAdj(p => ({ ...p, [egresoId]: true }))
    try {
      let base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      if (!base64.startsWith('data:application/pdf')) {
        base64 = await new Promise<string>(resolve => {
          const img = new Image()
          img.onload = () => {
            const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(img.width * scale)
            canvas.height = Math.round(img.height * scale)
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL('image/jpeg', 0.75))
          }
          img.onerror = () => resolve(base64)
          img.src = base64
        })
      }
      const mimeType = file.type || (base64.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg')
      const res = await fetch('/api/gastos/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoBase64: base64, mimeType, gastoId: crypto.randomUUID() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error subiendo')
      const key = data.key || ''
      const ia = data.datosIA || {}
      await fetch('/api/egresos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: egresoId, evidenciaKey: key }),
      })
      setFilas(prev => prev.map((fi, i) => {
        if (i !== idx) return fi
        const conceptoVacio = !fi.concepto.trim()
        const valorActual = parseInt(fi.valor) || 0
        const valorIA = ia.valor ? Math.round(ia.valor) : 0
        const difiere = valorActual > 0 && valorIA > 0 && Math.abs(valorActual - valorIA) / Math.max(valorActual, valorIA) > 0.05
        return {
          ...fi,
          evidenciaKey: key,
          concepto: conceptoVacio && ia.concepto ? ia.concepto.toUpperCase() : fi.concepto,
          valor: !fi.valor && valorIA ? String(valorIA) : fi.valor,
          fecha: !fi.fecha && ia.fecha ? ia.fecha : fi.fecha,
          _valorIA: valorIA,
          _valorDifiere: difiere,
        } as any
      }))
    } catch (e: any) {
      console.error('[egreso adj]', e)
    } finally {
      setSubiendoAdj(p => ({ ...p, [egresoId]: false }))
    }
  }

  async function guardar(idx: number) {
    const f = filas[idx]
    if (!f.concepto && !f.valor) return
    if (f.esNueva) return  // fila nueva solo se guarda via Enter
    // Si es nueva y no tiene fecha, poner hoy
    if (f.esNueva && !f.fecha) {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      set(idx, 'fecha', hoy)
      f.fecha = hoy
    }
    const body = { ...f, categoria: cat.key }
    try {
      if (f.id) {
        await fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      // POST solo via Enter — nunca desde guardar()
      setSaved(p => ({ ...p, [idx]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [idx]: false })), 1500)
    } catch {}
    setEditando(p => ({ ...p, [idx]: false }))
  }

  async function toggle(idx: number, campo: 'estado' | 'autorizado') {
    const f = filas[idx]
    if (!f.id) return
    const nuevo = campo === 'estado' ? (f.estado === 'ok' ? 'pendiente' : 'ok') : !f.autorizado
    set(idx, campo, nuevo)
    await fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, [campo]: nuevo }) })
  }

  const tot = (campo: keyof Fila) => filas.filter(f => f.concepto || f.valor).reduce((s, f) => s + (parseInt(String(f[campo])) || 0), 0)
  const totalSaldo = tot('saldo')

  async function cargarProveedores(q = '') {
    const res = await fetch('/api/proveedores?modo=todos' + (q ? '&q=' + encodeURIComponent(q) : ''))
    const d = await res.json()
    setProveedores(d.proveedores || [])
  }
  async function asociarProveedor(egresoId: string, proveedorId: string | null) {
    await fetch('/api/egresos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: egresoId, proveedorId }) })
    setFilaAccion(null)
    setProveedores([])
    setBuscandoProv('')
  }

  async function eliminarEgreso(id: string) {
    setEliminando(true)
    try {
      const res = await fetch('/api/egresos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const d = await res.json()
      if (d.ok) {
        setFilas(prev => prev.filter(f => f.id !== id))
        setFilaEliminar(null)
      }
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="space-y-1">
      <div className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: '#0f1623' }}>
        {/* Título fijo — fuera del scroll horizontal */}
        <div style={{ padding: '8px 14px', background: '#0d1520', borderBottom: '1px solid #1e2a3d', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>{cat.emoji}</span>
            {editandoTitulo
              ? <input autoFocus value={nuevoLabel} onChange={e => setNuevoLabel(e.target.value)}
                  onBlur={() => { setEditandoTitulo(false); if (nuevoLabel.trim() && nuevoLabel !== cat.label) onCatUpdate?.(cat.id, nuevoLabel.trim(), cat.emoji) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setNuevoLabel(cat.label); setEditandoTitulo(false) } }}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, color: 'white', width: Math.max(80, nuevoLabel.length * 9) }} />
              : <span className="text-sm font-bold text-white cursor-pointer" onDoubleClick={() => setEditandoTitulo(true)} title="Doble clic para editar">{nuevoLabel}</span>
            }
          </span>
          {totalSaldo > 0 && <span className="md:hidden" style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>{fmt(totalSaldo)}</span>}
        </div>
        <div className="overflow-x-auto" ref={el => {
            if (!el) return
            const refs = scrollRefs.current
            if (!refs.includes(el)) refs.push(el)
            el.onscroll = () => refs.forEach(r => { if (r !== el) r.scrollLeft = el.scrollLeft })
          }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                {[
                  {h:'Ver', w:32}, {h:'FECHA REG', w:75}, {h:'CONCEPTO', w:160}, {h:'PROVEEDOR', w:100},
                  {h:'VALOR', w:90}, {h:'ABONOS', w:60}, {h:'SALDO', w:90}
                ].map(({h,w}) => (
                  <th key={h} style={{ ...thStyle, width: w, minWidth: w }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => {
                const pagado = f.estado === 'ok'
                const isEdit = editando[idx] || f.esNueva
                const rowBg = f.autorizado ? 'rgba(34,197,94,0.12)' : pagado ? 'rgba(34,197,94,0.05)' : 'transparent'
                return (
                  <tr key={f.id || `n-${idx}`}
                    style={{ background: saved[idx] ? 'rgba(34,197,94,0.15)' : rowBg, transition: 'background 0.3s', outline: filaEliminar === f.id ? '2px solid #ef4444' : 'none', position: 'relative' }}
                    onClick={() => { if (modoEliminar && f.id) setFilaEliminar(fid => fid === f.id ? null : f.id) }}
                    data-row-idx={idx}>

                    {/* BOTÓN 📝 */}
                    <td style={{ ...tdStyle, textAlign:'center', borderLeft: '2px solid rgba(255,255,255,0.07)', padding:'4px 6px', position:'relative' }}>
                      {modoEliminar && filaEliminar === f.id && (
                        <div onClick={e => e.stopPropagation()} style={{ position:'fixed', top:'auto', right:16, zIndex:200, display:'flex', gap:6, alignItems:'center', background:'#0f1623', border:'1px solid #ef4444', borderRadius:8, padding:'4px 8px', boxShadow:'0 4px 20px rgba(0,0,0,0.7)', whiteSpace:'nowrap' }}>
                          <button onClick={() => eliminarEgreso(f.id!)} disabled={eliminando}
                            style={{ background:'#dc2626', color:'white', border:'none', borderRadius:6, padding:'4px 10px', fontSize:12, fontWeight:700, cursor:'pointer', opacity:eliminando?0.5:1, display:'flex', alignItems:'center', gap:4 }}>
                            🗑️ {eliminando ? 'Eliminando...' : 'Eliminar'}
                          </button>
                          <button onClick={() => setFilaEliminar(null)} style={{ background:'#3f3f46', color:'white', border:'none', borderRadius:6, padding:'4px 8px', fontSize:12, fontWeight:700, cursor:'pointer' }}>✕</button>
                        </div>
                      )}
                      {f.id && !modoEliminar && (
                        <button onClick={e => { e.stopPropagation(); setModalEgresoId(f.id); setModalAdjIdx(idx) }}
                          style={{background:'none',border:'none',cursor:'pointer',fontSize:16,padding:'2px 4px',opacity:0.7,transition:'opacity 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.opacity='1')}
                          onMouseLeave={e=>(e.currentTarget.style.opacity='0.7')}
                          title="Detalle egreso">📝</button>
                      )}
                    </td>
                    {/* FECHA REG */}
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)', fontSize:12 }}>
                      {fmtFecha(f.fecha)}
                    </td>
                    {/* CONCEPTO editable */}
                    <td style={{ ...tdStyle, width: 160, minWidth: 160, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {isEdit
                        ? <input value={f.concepto} onChange={e => set(idx,'concepto',e.target.value.toUpperCase())} onBlur={() => { if (f.esNueva && !f.concepto.trim()) { setFilas(prev => prev.filter((_,i) => i !== idx)) } else if (!f.esNueva) scheduleGuardar(idx) }} autoFocus={f.esNueva}
                            onKeyDown={async e => {
                              if (e.key === 'Enter' && f.esNueva && f.concepto.trim() && !guardandoNuevaRef.current.has(idx)) {
                                e.preventDefault()
                                guardandoNuevaRef.current.add(idx)
                                const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
                                set(idx, 'fecha', hoy)
                                // Guardar y abrir modal
                                const body = { ...filasRef.current[idx], fecha: hoy, categoria: cat.key }
                                const res = await fetch('/api/egresos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                                const d = await res.json()
                                setFilas(prev => prev.map((fi, i) => i !== idx ? fi : { ...fi, id: d.egreso?.id, fecha: hoy, esNueva: false }))
                                setSaved(p => ({ ...p, [idx]: true }))
                                setTimeout(() => { setSaved(p => ({ ...p, [idx]: false })); setModalEgresoId(d.egreso?.id || null); guardandoNuevaRef.current.delete(idx); setModalAdjIdx(idx) }, 300)
                              }
                            }}
                            style={{ background:'transparent',color:'white',border:'none',outline:'none',width:'100%',fontSize:13 }} placeholder="Concepto..." />
                        : <span style={{ fontWeight: 500 }}>{f.concepto}</span>}
                    </td>
                    {/* PROVEEDOR */}
                    <td style={{ ...tdStyle, fontSize:12, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {((f as any).proveedorNombre || '').length > 20 ? (f as any).proveedorNombre.slice(0,20) + '…' : ((f as any).proveedorNombre || '—')}
                    </td>
                    {/* VALOR */}
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                      {f.valor ? fmt(f.valor) : ''}
                    </td>
                    {/* ABONOS */}
                    <td style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)', color:'#34d399' }}>
                      {parseInt(f.abonoPago) > 0 ? fmt(f.abonoPago) : <span style={{color:'rgba(255,255,255,0.3)',fontSize:12}}>—</span>}
                    </td>
                    {/* SALDO */}
                    <td style={{ ...tdStyle, fontWeight:700, borderLeft: '2px solid rgba(255,255,255,0.07)', color:'#f87171' }}>
                      {parseInt(f.saldo) > 0 ? fmt(f.saldo) : parseInt(f.saldo) === 0 && f.valor ? <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>Pagado</span> : ''}
                    </td>

                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #1e2a3d', background: '#0a1020' }}>
                <td style={{ ...tdStyle, borderLeft: 'none' }}>
                  {canEdit && <button onClick={() => { const f = filaVacia(cat.key); setFilas(p => [...p, f]); setTimeout(() => setEditando(p => ({...p, [filas.length]: true})), 50) }}
                    className="flex items-center justify-center w-5 h-5 rounded-full border border-zinc-700 hover:border-zinc-400 text-zinc-500 hover:text-zinc-200 text-sm transition-colors">+</button>}
                </td>
                <td style={{ ...tdStyle, borderLeft: 'none' }} />
                <td style={{ ...tdStyle, borderLeft: 'none' }} />
                <td style={{ ...tdStyle, borderLeft: 'none' }} />
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none', color:'white' }}>{fmt(tot('valor'))}</td>
                <td style={{ ...tdStyle, borderLeft: 'none', fontWeight:700, color:'#34d399' }}>{tot('abonoPago') > 0 ? fmt(tot('abonoPago')) : ''}</td>
                <td style={{ ...tdStyle, fontWeight:700, borderLeft: 'none', color:'#f87171' }}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span>{fmt(tot('saldo'))}</span>
                    {isAdmin && (
                      <button onClick={() => { setModoEliminar(m => !m); setFilaEliminar(null) }}
                        className={`flex items-center justify-center w-5 h-5 rounded-full border text-sm transition-colors ${modoEliminar ? 'border-red-500 text-red-400 hover:border-red-400' : 'border-zinc-700 hover:border-zinc-400 text-zinc-500 hover:text-zinc-200'}`}>−</button>
                    )}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


      {/* Modal adjuntar egreso */}
      {modalAdjIdx !== null && filas[modalAdjIdx] && (
          <ModalAdjuntarEgreso
            egresoId={modalEgresoId}
            canEdit={canEdit}
            canAdmin={canAdmin}
            categoriaKey={cat.key}
            mes={mes} anio={anio}
            initialConcepto={filas[modalAdjIdx!].concepto}
            initialFechaReg={filas[modalAdjIdx!].fecha}
            initialValor={filas[modalAdjIdx!].valor}
            initialRetencion={filas[modalAdjIdx!].retencion}
            initialDescuento={filas[modalAdjIdx!].descuento}
            initialFecha={filas[modalAdjIdx!].fecha}
            initialEvidenciaKey={filas[modalAdjIdx!].evidenciaKey || ''}
            initialProveedor={(filas[modalAdjIdx!] as any).proveedorData || null}
            onClose={() => {
              const idx = modalAdjIdx!
              const fila = filas[idx]
              if (fila?.esNueva && !fila?.valor) {
                // Fila nueva sin datos → borrar
                setFilas(prev => prev.filter((_, i) => i !== idx))
              } else if (fila?.id) {
                fetch(`/api/egresos?id=${fila.id}`).then(r => r.json()).then(d => {
                  if (!d.egreso) return
                  const e = d.egreso
                  setFilas(prev => prev.map((fi, i) => i !== idx ? fi : ({
                    ...fi,
                    valor: String(Math.round(parseFloat(e.valor)||0)),
                    retencion: String(Math.round(parseFloat(e.retencion)||0)),
                    descuento: String(Math.round(parseFloat(e.descuento)||0)),
                    abonoPago: String(Math.round(parseFloat(e.abonoPago)||0)),
                    saldo: String(Math.round(parseFloat(e.saldo)||0)),
                    evidenciaKey: e.evidenciaKey || fi.evidenciaKey,
                    proveedorId: e.proveedor?.id || null,
                    proveedorNombre: e.proveedor ? (e.proveedor.firstName + (e.proveedor.lastName ? ' ' + e.proveedor.lastName : '')) : null,
                  })))
                })
              }
              setEditando(p => ({ ...p, [idx]: false }))
              setModalEgresoId(null); setModalAdjIdx(null)
              cargar(); onTotalesUpdate?.()
            }}
            onAbonoGuardado={(abonoPago, saldo) => {
              const idx = modalAdjIdx!
              setFilas(prev => prev.map((fi, i) => i !== idx ? fi : ({
                ...fi,
                abonoPago: String(Math.round(abonoPago)),
                saldo: String(Math.round(saldo)),
                estado: saldo <= 0 ? 'ok' : 'pendiente',
              })))
            }}
            onGuardado={data => {
              const idx = modalAdjIdx!
              setFilas(prev => prev.map((fi, i) => i !== idx ? fi : ({
                ...fi,
                evidenciaKey: data.evidenciaKey || fi.evidenciaKey,
                concepto: data.concepto || fi.concepto,
                valor: data.valor || fi.valor,
                retencion: data.retencion,
                descuento: data.descuento,
                fecha: data.fecha || fi.fecha,
                saldo: String(Math.round(data.saldo)),
                esNueva: false,
                proveedorId: data.proveedorId,
                proveedorNombre: data.proveedorNombre || null,
              })))
              setEditando(p => ({ ...p, [idx]: false }))
              setModalEgresoId(null); setModalAdjIdx(null)
              cargar(); onTotalesUpdate?.()
            }}
          />
      )}

      {/* Overlay proveedor — fixed, centrado */}
      {filaAccion && (
        <>
          <div onClick={() => { setFilaAccion(null); setProveedores([]); setBuscandoProv('') }}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.45)' }} />
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 50,
              background: '#0f1623', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14,
              padding: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.7)', width: 'min(90vw, 340px)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 13, flex: 1 }}>
                Asociar — {filas.find(f => f.id === filaAccion)?.concepto}
              </span>
              <button onClick={() => { setFilaAccion(null); setProveedores([]); setBuscandoProv('') }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <input autoFocus value={buscandoProv}
              onChange={e => { setBuscandoProv(e.target.value); cargarProveedores(e.target.value) }}
              placeholder="Buscar proveedor..."
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'white', width: '100%', fontSize: 13, padding: '7px 10px', marginBottom: 8, boxSizing: 'border-box' }} />
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {proveedores.map(pv => (
                <button key={pv.id} onClick={() => asociarProveedor(filaAccion!, pv.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 6, color: 'white', fontSize: 13, padding: '7px 10px', cursor: 'pointer', marginBottom: 3 }}>
                  {pv.firstName}{pv.lastName ? ' ' + pv.lastName : ''}{pv.document ? ` — ${pv.document}` : ''}
                </button>
              ))}
              {proveedores.length === 0 && <p style={{ color: '#64748b', fontSize: 12, padding: '4px 0' }}>Sin resultados</p>}
            </div>
            <button onClick={() => asociarProveedor(filaAccion!, null)}
              style={{ marginTop: 8, display: 'block', width: '100%', textAlign: 'center', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, color: '#f87171', fontSize: 12, padding: '6px', cursor: 'pointer' }}>
              Quitar proveedor
            </button>
          </div>
        </>
      )}
    </div>
  )
}
