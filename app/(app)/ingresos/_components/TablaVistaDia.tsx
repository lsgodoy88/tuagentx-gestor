'use client'

import { Fila, Categoria } from '../_lib/tipos'
import { formatCOP, parseCOP } from '@/lib/shared/utils/formato'
import { tdStyle } from '../_lib/estilos'

interface Props {
  filas: Fila[]
  categorias: Categoria[]
  filasGuardadas: Set<number>
  celdasEditando: Set<string>
  puedeEditarSaldos: boolean
  tab: string
  fecha: string
  onSetFila: (i: number, campo: keyof Fila, valor: string) => void
  onSetFilas: (updater: (prev: Fila[]) => Fila[]) => void
  onBlurCelda: (i: number, campo: 'concepto' | 'ingreso' | 'egreso') => void
  onBlurFila: (i: number) => void
  onIntentarEditar: (i: number, campo?: 'concepto' | 'ingreso' | 'egreso') => void
  onFilaSheetOpen: (i: number) => void
  onAgregarFila: () => void
  onGuardarCategoria: (i: number, fila: Fila, cat: string) => void
}

export function TablaVistaDia({
  filas, categorias, filasGuardadas, celdasEditando,
  puedeEditarSaldos, tab, fecha,
  onSetFila, onSetFilas, onBlurCelda, onBlurFila,
  onIntentarEditar, onFilaSheetOpen, onAgregarFila, onGuardarCategoria,
}: Props) {

  function esCeldaEditable(i: number, campo: 'concepto' | 'ingreso' | 'egreso') {
    return !filasGuardadas.has(i) || celdasEditando.has(`${i}-${campo}`)
  }

  function esEditable(i: number) {
    return !filasGuardadas.has(i)
      || celdasEditando.has(`${i}-concepto`)
      || celdasEditando.has(`${i}-ingreso`)
      || celdasEditando.has(`${i}-egreso`)
  }

  return (
    <>
      {filas.map((fila, i) => (
        <tr
          key={i}
          style={{ background: '#141c2e', cursor: 'pointer' }}
          onClick={() => onFilaSheetOpen(i)}
          onDoubleClick={e => e.stopPropagation()}
        >
          {/* Concepto */}
          <td
            style={{ ...tdStyle, whiteSpace: 'nowrap' }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={() => onIntentarEditar(i, 'concepto')}
          >
            {esCeldaEditable(i, 'concepto')
              ? <input
                  value={fila.concepto}
                  onChange={e => puedeEditarSaldos && onSetFila(i, 'concepto', e.target.value.toUpperCase())}
                  onBlur={() => onBlurCelda(i, 'concepto')}
                  readOnly={!puedeEditarSaldos}
                  autoFocus={celdasEditando.has(`${i}-concepto`)}
                  style={{ background: 'transparent', color: '#d1d5db', outline: 'none', width: '100%', fontSize: 13, cursor: puedeEditarSaldos ? 'text' : 'default' }}
                />
              : <span style={{ color: '#d1d5db', fontSize: 13 }}>{fila.concepto || '—'}</span>}
          </td>

          {/* Ingreso */}
          <td
            style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={() => onIntentarEditar(i, 'ingreso')}
          >
            {esCeldaEditable(i, 'ingreso')
              ? <input
                  type="text"
                  inputMode="numeric"
                  value={formatCOP(fila.ingreso)}
                  onChange={e => {
                    if (!puedeEditarSaldos) return
                    const v = parseCOP(e.target.value)
                    onSetFilas(p => p.map((f, idx) => idx === i ? { ...f, ingreso: v, egreso: '' } : f))
                  }}
                  onBlur={() => onBlurCelda(i, 'ingreso')}
                  readOnly={!puedeEditarSaldos}
                  autoFocus={celdasEditando.has(`${i}-ingreso`)}
                  style={{ background: fila.ingreso ? 'rgba(16,42,30,0.6)' : 'transparent', color: '#34d399', outline: 'none', width: '100%', fontSize: 13, textAlign: 'right', borderRadius: 6, padding: '2px 6px', cursor: puedeEditarSaldos ? 'text' : 'default' }}
                />
              : fila.ingreso ? <span style={{ color: '#34d399', fontSize: 13 }}>{formatCOP(fila.ingreso)}</span> : null}
          </td>

          {/* Egreso */}
          <td
            style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}
            onDoubleClick={() => onIntentarEditar(i, 'egreso')}
          >
            {esCeldaEditable(i, 'egreso')
              ? <input
                  type="text"
                  inputMode="numeric"
                  value={formatCOP(fila.egreso)}
                  onChange={e => {
                    if (!puedeEditarSaldos) return
                    const v = parseCOP(e.target.value)
                    onSetFilas(p => p.map((f, idx) => idx === i ? { ...f, egreso: v, ingreso: '' } : f))
                  }}
                  onBlur={() => onBlurCelda(i, 'egreso')}
                  readOnly={!puedeEditarSaldos}
                  autoFocus={celdasEditando.has(`${i}-egreso`)}
                  style={{ background: fila.egreso ? 'rgba(42,16,16,0.6)' : 'transparent', color: '#f87171', outline: 'none', width: '100%', fontSize: 13, textAlign: 'right', borderRadius: 6, padding: '2px 6px', cursor: puedeEditarSaldos ? 'text' : 'default' }}
                />
              : fila.egreso ? <span style={{ color: '#f87171', fontSize: 13 }}>{formatCOP(fila.egreso)}</span> : null}
          </td>

          {/* Categoría */}
          <td
            className="hidden md:table-cell"
            style={{ ...tdStyle, whiteSpace: 'nowrap' }}
            onClick={e => e.stopPropagation()}
          >
            {(esEditable(i) || fila.ingreso || fila.egreso) && puedeEditarSaldos
              ? <select
                  value={fila.categoria}
                  onChange={e => onGuardarCategoria(i, fila, e.target.value)}
                  style={{ background: '#141c2e', color: fila.categoria ? 'white' : '#374151', border: 'none', outline: 'none', width: '100%', fontSize: 12, borderRadius: 6, padding: '2px 4px', cursor: 'pointer' }}
                >
                  <option value="">—</option>
                  {categorias
                    .filter(c => c.tipo === (fila.ingreso ? 'ingreso' : fila.egreso ? 'egreso' : 'ingreso'))
                    .map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              : <span style={{ color: '#9ca3af', fontSize: 12 }}>{fila.categoria || '—'}</span>}
          </td>
        </tr>
      ))}

      {/* Agregar fila */}
      <tr style={{ background: '#141c2e', borderBottom: '1px solid #1e2a3d' }}>
        <td colSpan={4} style={{ padding: '6px 10px' }}>
          {puedeEditarSaldos && (
            <button
              onClick={onAgregarFila}
              style={{ fontSize: 12, color: '#374151', cursor: 'pointer', background: 'none', border: 'none' }}
            >+ Agregar fila</button>
          )}
        </td>
      </tr>
    </>
  )
}
