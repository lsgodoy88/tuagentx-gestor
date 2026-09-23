'use client'
import React from 'react'
import SelectorMes from '@/components/SelectorMes'
import { evaluarComision } from './hooks/useComisiones'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

interface CarteraTabComisionesProps {
  isAdmin: boolean
  esVendedor: boolean
  comisiones: any[]
  setComisiones: React.Dispatch<React.SetStateAction<any[]>>
  comisionPropia: any
  loadingComisionPropia: boolean
  comisionCalculo: any
  editandoFormulaId: string | null
  setEditandoFormulaId: (id: string | null) => void
  borradorFormula: string
  setBorradorFormula: (v: string) => void
  borradorPorcentaje: number
  setBorradorPorcentaje: (v: number) => void
  loadingComisiones: boolean
  nombreComision: string
  setNombreComision: (v: string) => void
  guardandoComision: boolean
  mesComision: number
  setMesComision: (v: number) => void
  anioComision: number
  setAnioComision: (v: number) => void
  guardarComisionAuto: (vendedorId: string, porcentaje: number, formula: string) => void
  cargarComisiones: () => void
  guardarComisionFinal: () => void
}

export default function CarteraTabComisiones({
  isAdmin, esVendedor, comisiones, setComisiones, comisionPropia, loadingComisionPropia,
  comisionCalculo, editandoFormulaId, setEditandoFormulaId, borradorFormula, setBorradorFormula,
  borradorPorcentaje, setBorradorPorcentaje, loadingComisiones, nombreComision, setNombreComision,
  guardandoComision, mesComision, setMesComision, anioComision, setAnioComision,
  guardarComisionAuto, cargarComisiones, guardarComisionFinal,
}: CarteraTabComisionesProps) {
  return (
    <>
      {isAdmin && (<div key='tab-comisiones' className='fade-up space-y-4'>

        {/* Selector mes + botón cargar */}
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes
            value={`${anioComision}-${String(mesComision).padStart(2,'0')}`}
            onChange={v => { const [a,m] = v.split('-'); setAnioComision(Number(a)); setMesComision(Number(m)) }}
          />
          <button
            onClick={cargarComisiones}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Cargar
          </button>
        </div>

        {comisiones.length > 0 && (
          <>
            {/* Tabla de vendedores con % */}
            <div className="rounded-2xl overflow-hidden" style={{border:'1px solid #1e2a3d'}}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr style={{background:'#0d1220',borderBottom:'1px solid #1e2a3d'}}>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"left"}}>Vendedor</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Efect.</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Transf.</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Total</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"center"}}>% Comisión</th>
                      <th style={{padding:"8px 10px",fontSize:14,fontWeight:500,color:"white",textAlign:"right"}}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comisiones.map((v: any, i: number) => {
                      const total = (v.efectivo||0) + (v.transferencia||0)
                      return (
                      <tr key={v.id} style={{background: i%2===0 ? '#141c2e' : '#141c2e', borderBottom:'1px solid #1e2a3d'}}>
                        <td className="px-4 py-3 text-white font-medium">{v.nombre}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{fmt(v.efectivo||0)}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{fmt(v.transferencia||0)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmt(total)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number" min="0" max="100" step="0.5"
                              value={v.porcentaje === 0 ? '' : v.porcentaje}
                              onChange={e => {
                                const raw = e.target.value
                                const porcentaje = raw === '' ? 0 : (parseFloat(raw) || 0)
                                setComisiones(prev => prev.map(x => x.id === v.id
                                  ? { ...x, porcentaje, comision: evaluarComision(x.formula, total, porcentaje) }
                                  : x))
                                guardarComisionAuto(v.id, porcentaje, v.formula || 'total/1.19*porcentaje')
                              }}
                              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-white text-center text-xs outline-none focus:border-blue-500"
                            />
                            <span className="text-zinc-500">%</span>
                            <button
                              onClick={() => {
                                setBorradorFormula(v.formula || 'total/1.19*porcentaje')
                                setBorradorPorcentaje(v.porcentaje)
                                setEditandoFormulaId(v.id)
                              }}
                              title="Editar fórmula de comisión"
                              className="text-zinc-500 hover:text-blue-400 transition-colors">
                              ✏️
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-amber-400 font-bold">{fmt(v.comision)}</span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'#0d1220',borderTop:'1px solid #1e2a3d'}}>
                      <td className="px-4 py-3 text-zinc-400 font-bold">Total</td>
                      <td className="px-4 py-3 text-right text-zinc-300 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.efectivo||0),0))}</td>
                      <td className="px-4 py-3 text-right text-zinc-300 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.transferencia||0),0))}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+(v.efectivo||0)+(v.transferencia||0),0))}</td>
                      <td></td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold">{fmt(comisiones.reduce((s,v)=>s+v.comision,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={nombreComision}
                onChange={e => setNombreComision(e.target.value)}
                placeholder="Ej: ComisionMayo2026"
                className="flex-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
              />
              <button
                disabled={guardandoComision}
                onClick={guardarComisionFinal}
                className={`bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors ${guardandoComision ? 'btn-shimmer' : ''}`}>
                {guardandoComision ? 'Guardando...' : '💾 Guardar como ' + (nombreComision || 'Comision')}
              </button>
            </div>

            {/* Último cálculo guardado */}
            {comisionCalculo && (
              <div className="rounded-2xl px-4 py-3" style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.25)'}}>
                <p className="text-emerald-400 text-sm font-semibold">✅ Guardado: {comisionCalculo.nombre}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{new Date(comisionCalculo.createdAt).toLocaleDateString('es-CO',{timeZone:'America/Bogota'})}</p>
              </div>
            )}
          </>
        )}
      </div>)}

      {esVendedor && (<div key='tab-comisiones-vendedor' className='fade-up space-y-4'>
        <SelectorMes
          value={`${anioComision}-${String(mesComision).padStart(2,'0')}`}
          onChange={v => { const [a,m] = v.split('-'); setAnioComision(Number(a)); setMesComision(Number(m)) }}
        />

        {loadingComisionPropia ? (
          <p className="text-zinc-500 text-sm text-center py-8">Cargando...</p>
        ) : !comisionPropia ? (
          <p className="text-zinc-500 text-sm text-center py-8">Sin datos para este mes</p>
        ) : (
          <div className="rounded-2xl p-5 space-y-3" style={{background:'#141c2e', border:'1px solid #1e2a3d'}}>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Efectivo</span>
              <span className="text-zinc-200 font-semibold">{fmt(comisionPropia.efectivo||0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Transferencia</span>
              <span className="text-zinc-200 font-semibold">{fmt(comisionPropia.transferencia||0)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-zinc-400 text-sm">Total recaudo</span>
              <span className="text-emerald-400 font-bold">{fmt(comisionPropia.total||0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-sm">Tu % de comisión</span>
              <span className="text-zinc-200 font-semibold">{comisionPropia.porcentaje}%</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-zinc-300 text-base font-semibold">Tu comisión del mes</span>
              <span className="text-amber-400 font-bold text-xl">{fmt(comisionPropia.comision||0)}</span>
            </div>
          </div>
        )}
      </div>)}

      {/* Modal editar fórmula de comisión */}
      {editandoFormulaId && (() => {
        const v = comisiones.find((x: any) => x.id === editandoFormulaId)
        if (!v) return null
        const total = (v.efectivo||0) + (v.transferencia||0)
        const preview = evaluarComision(borradorFormula, total, borradorPorcentaje)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.6)'}}
            onClick={() => setEditandoFormulaId(null)}>
            <div onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-5 space-y-4"
              style={{background:'#141c2e', border:'1px solid #1e2a3d'}}>
              <h3 className="text-white font-semibold text-base">Editar fórmula de comisión — {v.nombre}</h3>

              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total recaudo</span>
                <span className="text-emerald-400 font-semibold">{fmt(total)}</span>
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Fórmula</label>
                <input
                  type="text"
                  value={borradorFormula}
                  onChange={e => setBorradorFormula(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none font-mono focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 text-xs font-semibold block mb-1">Porcentaje (%)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={borradorPorcentaje === 0 ? '' : borradorPorcentaje}
                  onChange={e => {
                    const raw = e.target.value
                    setBorradorPorcentaje(raw === '' ? 0 : (parseFloat(raw) || 0))
                  }}
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="rounded-xl px-3 py-2 text-xs space-y-1" style={{background:'#0d1220'}}>
                <p className="text-zinc-400 font-semibold mb-1">Variables disponibles:</p>
                <p className="text-zinc-500"><span className="text-blue-400 font-mono">total</span> → recaudo del mes ({fmt(total)})</p>
                <p className="text-zinc-500"><span className="text-blue-400 font-mono">porcentaje</span> → campo % arriba, ya convertido a fracción (5% → 0.05)</p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                <span className="text-zinc-400 text-sm">Resultado</span>
                <span className="text-amber-400 font-bold text-lg">{fmt(preview)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditandoFormulaId(null)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setComisiones(prev => prev.map(x => x.id === v.id
                      ? { ...x, formula: borradorFormula, porcentaje: borradorPorcentaje, comision: preview }
                      : x))
                    guardarComisionAuto(v.id, borradorPorcentaje, borradorFormula)
                    setEditandoFormulaId(null)
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
