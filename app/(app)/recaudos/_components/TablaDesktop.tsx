'use client'
import DataTable, { ColDef } from '@/components/DataTable'
import type { Pago } from '../_lib/tipos'
import type { UseRecaudos } from '../_lib/useRecaudos'

export function TablaDesktop({ r, cols }: { r: UseRecaudos; cols: ColDef<Pago>[] }) {
  const { pagedPagos, seleccionados, toggleSeleccion, setSeleccionados, loading } = r
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      <DataTable
        columns={cols}
        rows={pagedPagos}
        rowKey={p => p.id}
        selected={seleccionados}
        onToggle={toggleSeleccion}
        onSelectAll={ids => setSeleccionados(ids.length ? new Set(ids) : new Set())}
        loading={loading}
        storageKey="recaudos"
        subRows={p => {
          // Siempre usar _facturas (mismo origen que cartera tab pagos)
          // Fallback a reciboPago.detalles para pagos de carteraId (sin _facturas)
          const facts: any[] = Array.isArray((p as any)._facturas) ? (p as any)._facturas : []
          if (facts.length > 1) return facts.slice(1)
          const detalles: any[] = Array.isArray((p as any).reciboPago?.detalles) ? (p as any).reciboPago.detalles : []
          return detalles.length > 1 ? detalles.slice(1) : []
        }}
      />
    </div>
  )
}
