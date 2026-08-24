'use client'
import { useEffect, useState } from 'react'

const TIPO_META: Record<string, { emoji: string; label: string; color: string }> = {
  voucher_pago:      { emoji: '🧾', label: 'Comprobantes de pago',  color: '#3b82f6' },
  foto_alistamiento: { emoji: '📦', label: 'Fotos alistamiento',    color: '#10b981' },
  firma:             { emoji: '✍️',  label: 'Firmas de entrega',     color: '#8b5cf6' },
  factura_egreso:    { emoji: '🧮', label: 'Facturas de egreso',     color: '#f59e0b' },
  evidencia_abono:   { emoji: '💳', label: 'Evidencias de abono',    color: '#ec4899' },
  evidencia_saldo:   { emoji: '🏦', label: 'Evidencias de saldo',    color: '#06b6d4' },
  foto_evento:       { emoji: '📸', label: 'Fotos de eventos',       color: '#a855f7' },
}

function fmtMb(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${Math.round(mb * 1024)} KB`
}

function fmtCop(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
}

export default function AlmacenamientoPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comprando, setComprando] = useState(false)

  useEffect(() => {
    fetch('/api/almacenamiento')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function comprarStorage() {
    if (!data?.precioGb) return
    setComprando(true)
    try {
      const res = await fetch('/api/almacenamiento/comprar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: data.precioGb }),
      })
      const d = await res.json()
      if (d.linkPago) window.open(d.linkPago, '_blank')
      else alert('Error generando enlace de pago')
    } finally {
      setComprando(false)
    }
  }

  const pct = data?.porcentaje ?? 0
  const alerta = data?.alerta ?? false
  const barColor = pct >= 100 ? '#ef4444' : alerta ? '#f59e0b' : '#3b82f6'

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">☁️</span>
        <div>
          <h1 className="text-white font-bold text-lg">Almacenamiento Nube</h1>
          <p className="text-white/60 text-xs">Uso de archivos por módulo</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center text-white/60 text-sm">Cargando...</div>
      ) : !data ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center text-white/60 text-sm">No se pudo cargar la información</div>
      ) : (
        <>
          {/* Barra total */}
          <div className="relative">
            <button
              onClick={comprarStorage}
              disabled={comprando}
              className="absolute -top-3 right-4 z-10 px-3 py-1 rounded-full text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white shadow-lg transition-colors disabled:opacity-50">
              {comprando ? '...' : 'Comprar 1 GB'}
            </button>
          <div className={`border rounded-2xl p-5 space-y-3 ${alerta ? 'bg-amber-950/30 border-amber-600/40' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-white font-semibold text-sm">
                Capacidad total
                {data.limiteGb > 1 && <span className="ml-2 text-xs text-zinc-400">({data.limiteGb} GB contratados)</span>}
              </span>
              <span className="text-white text-xs">{fmtMb(data.totalMb)} / {fmtMb(data.limiteMb)}</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden flex">
              {alerta ? (
                <>
                  <div className="h-3 transition-all" style={{ width: `${data.limiteBytes > 0 ? (800*1024*1024/data.limiteBytes*100) : 0}%`, background: '#3b82f6', borderRadius: '9999px 0 0 9999px' }} />
                  <div className="h-3 transition-all" style={{ width: `${Math.min(pct - (800*1024*1024/data.limiteBytes*100), 100 - (800*1024*1024/data.limiteBytes*100))}%`, background: '#f97316', borderRadius: '0 9999px 9999px 0' }} />
                </>
              ) : (
                <div className="h-3 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: '#3b82f6' }} />
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70 text-xs">{pct.toFixed(2)}% utilizado</span>
              <span className="text-white/70 text-xs">{fmtMb(data.bytesRestantes / 1024 / 1024)} disponibles</span>
            </div>
            {alerta && (
              <p className="text-orange-400 text-xs">⚠️ Espacio casi agotado &nbsp;&nbsp;Compra capacidad en la Nube.</p>
            )}
          </div>
          </div>



          {/* Cards por tipo */}
          <div className="space-y-2">
            <span className="text-white text-xs font-semibold px-1">Desglose por tipo</span>
            {data.tipos.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center text-white/60 text-sm">
                Sin registros aún — los archivos nuevos se contabilizarán automáticamente
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {data.tipos.map((t: any, i: number) => {
                  const meta = TIPO_META[t.tipo] ?? { emoji: '📄', label: t.tipo, color: '#6b7280' }
                  const tipoPct = data.totalBytes > 0 ? (t.bytes / data.totalBytes * 100) : 0
                  return (
                    <div key={t.tipo} className={`px-4 py-3 flex items-center gap-3 ${i < data.tipos.length - 1 ? 'border-b border-zinc-800' : ''}`}>
                      <span className="text-xl w-8 text-center">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-white text-xs font-semibold truncate">{meta.label}</span>
                          <span className="text-white text-xs ml-2 shrink-0">{fmtMb(t.mb)}</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${tipoPct}%`, background: meta.color }} />
                        </div>
                      </div>
                      <span className="text-white/70 text-xs w-16 text-right shrink-0">{t.archivos.toLocaleString('es-CO')} arch.</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>



          <p className="text-white/40 text-xs text-center px-4">
            Solo se contabilizan archivos subidos a partir de la activación de este módulo
          </p>
        </>
      )}
    </div>
  )
}
