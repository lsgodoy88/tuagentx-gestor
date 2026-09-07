'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { TablaEstandar, tdStyle } from '@/components/ui/TablaEstandar'
import type { ColDef } from '@/components/ui/TablaEstandar'

function fmt(v: number) {
  return '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function getMesActual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function labelMes(mes: string) {
  const [anio, m] = mes.split('-')
  const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${nombres[parseInt(m) - 1]} ${anio}`
}
function getMesesDisponibles() {
  const meses = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return meses
}
function abreviarVendedor(nombre: string) {
  if (!nombre) return '—'
  const parts = nombre.trim().split(/\s+/)
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() + (parts[1] ? ' ' + parts[1][0].toUpperCase() + '.' : '')
}
function fmtFecha(d: string | null | undefined) {
  if (!d) return '—'
  const s = d.slice(0,10)
  const [y,m,dy] = s.split('-')
  return `${dy}/${m}/${y.slice(2)}`
}

function getCols(abrirRecibo: (pagoId: string) => void): ColDef[] {
  return [
    { h: 'FECHA REG.', w: 85, key: 'createdAt', style: { color:'#ffffff', fontSize:12 },
      render: (r: any) => fmtFecha(r.createdAt ? new Date(r.createdAt).toISOString() : null) },
    { h: 'CLIENTE', w: 180, key: 'clienteNombre', style: { color:'#ffffff' } },
    { h: 'VENDEDOR', w: 110, key: 'vendedorNombre', style: { color:'#ffffff', fontSize:12 },
      render: (r: any) => abreviarVendedor(r.vendedorNombre) },
    { h: 'RECIBO', w: 110, key: 'numeroRecibo', style: { fontSize:12, fontFamily:'monospace' },
      render: (r: any) => r.numeroRecibo && r.pagoId
        ? <button onClick={() => abrirRecibo(r.pagoId)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#60a5fa', fontSize:12, fontFamily:'monospace', display:'flex', alignItems:'center', gap:4, padding:0 }}>
            🖨️ {r.numeroRecibo}
          </button>
        : <span style={{ color:'#475569' }}>—</span>
    },
    { h: 'REFERENCIA', w: 120, key: 'referencia', style: { color:'#ffffff', fontSize:12, fontFamily:'monospace' } },
    { h: 'FECHA COMP.', w: 100, key: 'fecha', style: { color:'#94a3b8', fontSize:11 },
      render: (r: any) => fmtFecha(r.fecha) },
    { h: 'VALOR', w: 110, key: 'valor', style: { fontWeight:700, color:'#60a5fa' },
      render: (r: any) => r.valor ? fmt(Number(r.valor)) : '—' },
  ]
}

export default function RelacionTransferenciasPage() {
  const [mes, setMes] = useState(getMesActual())
  const [grupos, setGrupos] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRefs = React.useRef<HTMLDivElement[]>([])

  const cargar = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cartera/relacion-transferencias?mes=${m}`)
      const data = await res.json()
      setGrupos(data.grupos || [])
    } catch { setGrupos([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { scrollRefs.current = []; cargar(mes) }, [mes, cargar])

  async function abrirRecibo(pagoId: string) {
    const res = await fetch('/api/cartera/recibo-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagoId })
    })
    const data = await res.json()
    if (data.reciboToken) window.open(`/recaudo/recibo?token=${data.reciboToken}`, '_blank')
  }

  const cols = React.useMemo(() => getCols(abrirRecibo), [])
  const totalGeneral = grupos.reduce((s, g) => s + g.total, 0)
  const meses = getMesesDisponibles()

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <p style={{ color:'white', fontWeight:700, fontSize:17, margin:0 }}>Relación Transferencias</p>
        <div style={{ textAlign:'right' }}>
          <p style={{ color:'#64748b', fontSize:11, margin:0 }}>Total general</p>
          <p style={{ color:'#34d399', fontWeight:700, fontSize:15, margin:0 }}>{fmt(totalGeneral)}</p>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <span style={{ color:'#94a3b8', fontSize:13 }}>Mes:</span>
        <select value={mes} onChange={e => setMes(e.target.value)}
          style={{ background:'#0d1520', border:'1px solid #1e2a3d', color:'white', fontSize:13, borderRadius:10, padding:'6px 12px', outline:'none' }}>
          {meses.map(m => <option key={m} value={m}>{labelMes(m)}</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign:'center', color:'#64748b', padding:40 }}>Cargando...</div>}
      {!loading && grupos.length === 0 && <div style={{ textAlign:'center', color:'#475569', fontSize:14, padding:40 }}>Sin transferencias para este mes</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
        {!loading && grupos.map((g, gi) => (
          <TablaEstandar
            key={gi}
            titulo={<>
              <span>🏦</span>
              <span style={{ fontSize:13, fontWeight:700, color:'white' }}>{g.numeroCuenta}</span>
              {g.titular && <span style={{ fontSize:11, color:'#94a3b8' }}>· {g.titular}</span>}
            </>}
            subtitulo={g.banco}
            badge={<span style={{ fontSize:14, fontWeight:700, color:'#34d399' }}>{fmt(g.total)}</span>}
            cols={cols}
            rows={g.registros}
            scrollRef={el => {
              if (!el) return
              const refs = scrollRefs.current
              if (!refs.includes(el)) refs.push(el)
              el.onscroll = () => refs.forEach(r => { if (r !== el) r.scrollLeft = el.scrollLeft })
            }}
            footerCols={<>
              <td style={{ ...tdStyle, borderLeft:'none' }} colSpan={6}>
                <span style={{ color:'#94a3b8', fontSize:12, fontWeight:600 }}>TOTAL</span>
              </td>
              <td style={{ ...tdStyle, borderLeft:'2px solid rgba(255,255,255,0.07)', fontWeight:700, color:'#34d399' }}>
                {fmt(g.total)}
              </td>
            </>}
          />
        ))}
      </div>
    </div>
  )
}
