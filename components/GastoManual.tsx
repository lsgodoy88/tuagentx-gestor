'use client'
import { useState, useEffect } from 'react'
import InputMoneda from './InputMoneda'
import CiudadBuscador from './CiudadBuscador'

interface Props {
  open: boolean
  onClose: () => void
  onAdicionado: () => void
}

export default function GastoManual({ open, onClose, onAdicionado }: Props) {
  const [concepto, setConcepto] = useState('')

  const [valor, setValor]       = useState('')
  const [tipo, setTipo]         = useState('')
  const [ciudad, setCiudad]     = useState('')
  const [fechaDoc, setFechaDoc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [tipos, setTipos] = useState<{id:string,label:string}[]>([])
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch('/api/gastos/tipos').then(r => r.json()).then(d => { if (d.tipos) setTipos(d.tipos) }).catch(() => {})
  }, [open])

  function cerrar() {
    onClose(); setConcepto(''); setValor(''); setTipo(''); setCiudad(''); setFechaDoc(''); setError('')
  }

  async function confirmar() {
    if (!concepto.trim() || !valor || !tipo || !ciudad.trim()) { setError('Completa concepto, valor, tipo y ciudad.'); return }
    setGuardando(true); setError('')
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto: concepto.trim(),
          valor: parseFloat(valor) || 0,
          tipo: tipo,
          ciudad: ciudad.trim() || undefined,
          fechaDoc: fechaDoc || hoy,
          evidenciaKey: 'manual',
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      cerrar(); onAdicionado()
    } catch {
      setError('Error al guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#141c2e', border: '1px solid #1e2a3d' }}>
            <h3 className="text-white font-semibold text-base">Gasto manual</h3>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500">
                <option value="">Selecciona tipo</option>
                {tipos.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Concepto</label>
              <input autoFocus type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                placeholder="Ej: Tiquete, almuerzo, papelería..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Valor</label>
              <InputMoneda value={valor} onChange={setValor}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Ciudad</label>
              <CiudadBuscador value={ciudad} onChange={setCiudad} />
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-semibold block mb-1">Fecha (opcional)</label>
              <input type="date" value={fechaDoc} onChange={e => setFechaDoc(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={cerrar} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm py-2.5 rounded-xl transition-colors">Cancelar</button>
              <button onClick={confirmar} disabled={!concepto.trim() || !valor || !tipo || !ciudad.trim() || guardando}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors">
                {guardando ? 'Guardando...' : 'Agregar gasto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
