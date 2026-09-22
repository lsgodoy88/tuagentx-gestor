'use client'

import { GrupoDia } from '../_lib/tipos'
import { fmtFechaCorta } from '../_lib/fechas'
import { formatCOP } from '@/lib/shared/utils/formato'
import { tdStyle } from '../_lib/estilos'

interface Props {
  grupos: GrupoDia[]
  buscando: boolean
  onClickFila: (fecha: string) => void
}

export function TablaVistaRango({ grupos, buscando, onClickFila }: Props) {
  if (buscando) return null

  if (!grupos.length) {
    return (
      <tr style={{ background: '#141c2e' }}>
        <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#374151', fontStyle: 'italic', padding: 24 }}>
          Sin movimientos en este período
        </td>
      </tr>
    )
  }

  return (
    <>
      {grupos.flatMap(g =>
        g.filas
          .filter(f => f.concepto || f.ingreso || f.egreso)
          .map((fila, fi) => {
            const esPrimera = fi === 0
            return (
              <tr
                key={g.fecha + '_' + fi}
                style={{ background: esPrimera ? '#0f1a2e' : '#141c2e', borderBottom: '1px solid #1e2a3d', cursor: 'pointer' }}
                onClick={() => onClickFila(g.fecha)}
              >
                <td style={{ ...tdStyle, width: 48, fontSize: 12, fontWeight: esPrimera ? 700 : 400, color: esPrimera ? '#60a5fa' : '#374151', whiteSpace: 'nowrap' }}>
                  {esPrimera ? fmtFechaCorta(g.fecha) : ''}
                </td>
                <td style={{ ...tdStyle, fontSize: 13, color: '#d1d5db', whiteSpace: 'nowrap' }}>{fila.concepto || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                  {fila.ingreso ? <span style={{ color: '#34d399' }}>{formatCOP(fila.ingreso)}</span> : null}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontSize: 13, whiteSpace: 'nowrap', borderLeft: '2px solid rgba(255,255,255,0.07)' }}>
                  {fila.egreso ? <span style={{ color: '#f87171' }}>{formatCOP(fila.egreso)}</span> : null}
                </td>
                <td className="hidden md:table-cell" style={{ ...tdStyle, color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {fila.categoria || '—'}
                </td>
              </tr>
            )
          })
      )}
    </>
  )
}
