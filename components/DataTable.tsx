'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Tipos ────────────────────────────────────────────────────────
export interface ColDef<T = any> {
  key: string
  label: string
  width: number          // px inicial
  minWidth?: number      // px mínimo al resize (default 40)
  render: (row: T) => React.ReactNode
  renderSub?: (subRow: any, row: T) => React.ReactNode  // para sub-filas
}

interface DataTableProps<T = any> {
  columns: ColDef<T>[]
  rows: T[]
  rowKey: (row: T) => string
  selected?: Set<string>
  onToggle?: (id: string) => void
  onSelectAll?: (ids: string[]) => void
  subRows?: (row: T) => any[]   // devuelve array de sub-filas o []
  loading?: boolean
  storageKey?: string           // clave localStorage para anchos
  onRowClick?: (row: T) => void
}

// ── Estilos base ─────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 14, fontWeight: 500,
  color: 'white',
  letterSpacing: 0,
  textTransform: 'none',
  textAlign: 'center',
  userSelect: 'none',
  position: 'relative',
  borderBottom: 'none',
  borderRight: '1px solid #1a3557',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const TD: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14, fontWeight: 500,
  color: 'white',
  textAlign: 'center',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  borderBottom: '1px solid #111827',
}

const CHECKBOX_W = 32  // px fijo para la columna de checkbox

// ── Componente ───────────────────────────────────────────────────
export default function DataTable<T>({
  columns, rows, rowKey, selected, onToggle, onSelectAll, subRows,
  loading, storageKey, onRowClick,
}: DataTableProps<T>) {

  // Anchos de columnas — inicializa desde localStorage si hay storageKey
  const [widths, setWidths] = useState<number[]>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`dt-widths-${storageKey}`)
        if (saved) {
          const parsed = JSON.parse(saved) as number[]
          if (parsed.length === columns.length) return parsed
        }
      } catch {}
    }
    return columns.map(c => c.width)
  })

  // Persistir anchos
  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(`dt-widths-${storageKey}`, JSON.stringify(widths)) } catch {}
  }, [widths, storageKey])

  // Sincronizar si cambia el número de columnas
  useEffect(() => {
    setWidths(prev => prev.length === columns.length ? prev : columns.map(c => c.width))
  }, [columns.length])

  // ── Resize logic ───────────────────────────────────────────────
  const resizing = useRef<{ colIndex: number; startX: number; startW: number } | null>(null)

  const onResizeStart = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = { colIndex, startX: e.clientX, startW: widths[colIndex] }

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      const { colIndex: ci, startX, startW } = resizing.current
      const min = columns[ci].minWidth ?? 40
      const newW = Math.max(min, startW + ev.clientX - startX)
      setWidths(prev => { const w = [...prev]; w[ci] = newW; return w })
    }

    const onUp = () => {
      resizing.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widths, columns])

  // ── Total width ────────────────────────────────────────────────
  const showCheckbox = selected !== undefined
  const totalW = (showCheckbox ? CHECKBOX_W : 0) + widths.reduce((a, b) => a + b, 0)

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #1e3a5f', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{
        tableLayout: 'fixed',
        width: totalW,
        minWidth: '100%',
        borderCollapse: 'collapse',
        fontSize: 12,
      }}>
        {/* Anchos */}
        <colgroup>
          {showCheckbox && <col style={{ width: CHECKBOX_W }} />}
          {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>

        {/* Header */}
        <thead style={{background:"#0f0f1a",borderBottom:"1px solid #234a7a"}}>
          <tr>
            {/* Checkbox header — selecciona/deselecciona todos */}
            {showCheckbox && <th style={{ ...TH, width: CHECKBOX_W, padding: '7px 0' }}>
              {onSelectAll && (() => {
                const allIds = rows.map(r => rowKey(r))
                const allSelected = allIds.length > 0 && allIds.every(id => selected?.has(id))
                const someSelected = !allSelected && allIds.some(id => selected?.has(id))
                return (
                  <div style={{ display: 'flex', justifyContent: 'center' }}
                    onClick={() => onSelectAll(allSelected ? [] : allIds)}>
                    <div style={{
                      width: 13, height: 13, borderRadius: 3, cursor: 'pointer',
                      border: allSelected ? '2px solid #3b82f6' : someSelected ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.30)',
                      background: allSelected ? '#3b82f6' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {allSelected && <span style={{ color: 'white', fontSize: 7, fontWeight: 900 }}>✓</span>}
                      {someSelected && <span style={{ color: '#3b82f6', fontSize: 9, fontWeight: 900 }}>—</span>}
                    </div>
                  </div>
                )
              })()}
            </th>}
            {columns.map((col, i) => (
              <th key={col.key} style={{ ...TH, width: widths[i] }}>
                {col.label}
                {/* Handle de resize */}
                <div
                  onMouseDown={e => onResizeStart(e, i)}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: 6, cursor: 'col-resize',
                    background: 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#0f1f35')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                />
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {showCheckbox && <td style={{ ...TD }} />}
                {columns.map(col => (
                  <td key={col.key} style={{ ...TD }}>
                    <div style={{
                      height: 14, borderRadius: 4,
                      background: '#0a1628',
                      animation: 'pulse 1.5s infinite',
                    }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (showCheckbox ? 1 : 0)} style={{ ...TD, color: 'rgba(255,255,255,0.30)', padding: '32px' }}>
                Sin registros
              </td>
            </tr>
          ) : rows.map(row => {
            const id = rowKey(row)
            const sel = selected?.has(id) ?? false
            const subs = subRows?.(row) ?? []
            const isMulti = subs.length > 0

            const ROW_BG = sel ? '#1e3a8a' : '#0a0f1e'
            const ROW_BORDER = `1px solid ${sel ? '#3b82f6' : '#1a3557'}`

            return (
              <React.Fragment key={id}>
                {/* Fila principal */}
                <tr
                  onClick={() => onRowClick?.(row)}
                  style={{ background: ROW_BG, cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {/* Checkbox */}
                  {showCheckbox && <td style={{ ...TD, borderLeft: ROW_BORDER, borderTop: ROW_BORDER, borderBottom: isMulti ? 'none' : ROW_BORDER, borderRight: 'none' }}>
                    <div
                      onClick={e => { e.stopPropagation(); onToggle?.(id) }}
                      style={{
                        width: 13, height: 13, borderRadius: 3, margin: '0 auto',
                        border: sel ? '2px solid #3b82f6' : '2px solid #52525b',
                        background: sel ? '#3b82f6' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                      }}>
                      {sel && <span style={{ color: 'white', fontSize: 7, fontWeight: 900 }}>✓</span>}
                    </div>
                  </td>}
                  {columns.map((col, ci) => {
                    const isLast = ci === columns.length - 1
                    return (
                      <td key={col.key} style={{
                        ...TD,
                        borderTop: ROW_BORDER,
                        borderBottom: isMulti ? 'none' : ROW_BORDER,
                        borderRight: isLast ? ROW_BORDER : 'none',
                        borderLeft: 'none',
                      }}>
                        {col.render(row)}
                      </td>
                    )
                  })}
                </tr>

                {/* Sub-filas (pagos mixtos) */}
                {subs.map((sub, si) => {
                  const isLastSub = si === subs.length - 1
                  return (
                    <tr key={`${id}-sub-${si}`} style={{ background: '#0a0f1e' }}>
                      {showCheckbox && <td style={{ ...TD, borderLeft: ROW_BORDER, borderBottom: isLastSub ? ROW_BORDER : 'none', borderTop: 'none', borderRight: 'none' }} />}
                      {columns.map((col, ci) => {
                        const isLast = ci === columns.length - 1
                        return (
                          <td key={col.key} style={{
                            ...TD,
                            borderTop: 'none',
                            borderBottom: isLastSub ? ROW_BORDER : 'none',
                            borderRight: isLast ? ROW_BORDER : 'none',
                            borderLeft: 'none',
                          }}>
                            {col.renderSub ? col.renderSub(sub, row) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>

      {/* Cursor global durante resize */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }
      `}</style>
    </div>
  )
}
