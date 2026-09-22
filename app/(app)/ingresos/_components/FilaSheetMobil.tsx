'use client'

import { Fila, Categoria } from '../_lib/tipos'

interface Props {
  filaIdx: number
  fila: Fila
  categorias: Categoria[]
  onClose: () => void
  onCategoriaChange: (i: number, valor: string) => void
  onRelacionChange: (i: number, valor: string) => void
  onBlurFila: (i: number) => void
}

export function FilaSheetMobil({ filaIdx, fila, categorias, onClose, onCategoriaChange, onRelacionChange, onBlurFila }: Props) {
  const tipoFiltro = fila.ingreso ? 'ingreso' : fila.egreso ? 'egreso' : 'ingreso'

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
      className="md:hidden"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#0d1220', borderTop: '1px solid #1e2a3d', borderRadius: '16px 16px 0 0', padding: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>{fila.concepto || `Fila ${filaIdx + 1}`}</span>
          <button onClick={onClose} style={{ color: '#6b7280', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Categoría</p>
          <select
            value={fila.categoria || ''}
            onChange={e => { onCategoriaChange(filaIdx, e.target.value); onBlurFila(filaIdx) }}
            style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', outline: 'none' }}
          >
            <option value="">— Sin categoría</option>
            {categorias.filter(c => c.tipo === tipoFiltro).map(c => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>Relación / Referencia</p>
          <input
            value={fila.relacionTexto || ''}
            onChange={e => onRelacionChange(filaIdx, e.target.value.toUpperCase())}
            onBlur={() => onBlurFila(filaIdx)}
            placeholder="Ej: Factura #3786"
            style={{ background: '#141c2e', color: 'white', border: '1px solid #1e2a3d', borderRadius: 10, padding: '10px 12px', fontSize: 14, width: '100%', outline: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
