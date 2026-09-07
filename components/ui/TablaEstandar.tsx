import React from 'react'

export const thStyle: React.CSSProperties = {
  padding: '10px 10px', fontSize: 12, fontWeight: 600, color: '#94a3b8',
  whiteSpace: 'nowrap', borderBottom: '1px solid #1e2a3d',
  borderLeft: '2px solid rgba(255,255,255,0.07)', background: '#0a1020',
}

export const tdStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 13, fontWeight: 500, color: '#ffffff',
  borderBottom: '1px solid #1e2a3d', whiteSpace: 'nowrap',
}

export const tablaContainerStyle: React.CSSProperties = {
  borderRadius: 16, border: '1px solid #1e2a3d', overflow: 'hidden', background: '#0f1623',
}

export const tablaHeaderStyle: React.CSSProperties = {
  padding: '8px 14px', background: '#0d1520', borderBottom: '1px solid #1e2a3d',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

export const tablaFooterRowStyle: React.CSSProperties = {
  borderTop: '2px solid #1e2a3d', background: '#0a1020',
}

export interface ColDef {
  h: string
  w: number
  key: string
  render?: (row: any) => React.ReactNode
  style?: React.CSSProperties
}

interface TablaEstandarProps {
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  badge?: React.ReactNode
  cols: ColDef[]
  rows: any[]
  minWidth?: number
  footerCols?: React.ReactNode
  scrollRef?: (el: HTMLDivElement | null) => void
}

export function TablaEstandar({
  titulo, subtitulo, badge, cols, rows, minWidth = 620, footerCols, scrollRef
}: TablaEstandarProps) {
  return (
    <div style={tablaContainerStyle}>
      <div style={tablaHeaderStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {titulo}
          {subtitulo && <span style={{ fontSize: 11, color: '#64748b' }}>{subtitulo}</span>}
        </span>
        {badge && <span>{badge}</span>}
      </div>
      <div className="overflow-x-auto" ref={scrollRef}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
          <thead>
            <tr>
              {cols.map(({ h, w }) => (
                <th key={h} style={{ ...thStyle, width: w, minWidth: w }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id || ri}>
                {cols.map(({ key, render, style }) => (
                  <td key={key} style={{ ...tdStyle, borderLeft: '2px solid rgba(255,255,255,0.07)', ...style }}>
                    {render ? render(row) : row[key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footerCols && (
            <tfoot>
              <tr style={tablaFooterRowStyle}>{footerCols}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
