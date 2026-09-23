'use client'
import { fmtFecha, fmtHora } from './_lib/utils'
import { useRecaudos } from './_lib/useRecaudos'
import { getColumns } from './_components/columnas'
import { TabsFiltros } from './_components/TabsFiltros'
import { TablaDesktop } from './_components/TablaDesktop'
import { ListaMobile } from './_components/ListaMobile'
import { Paginacion } from './_components/Paginacion'
import { LightboxVoucher, ModalDetalleVariacion, ModalAjuste } from './_components/ModalesRecaudo'

// ── Página ────────────────────────────────────────────────────────
export default function RecaudosPage() {
  const r = useRecaudos()
  const { status, isAdmin, isDesktop, tab, setLightboxUrl, voucherUrls, cargarVoucherUrl,
    setAjusteMonto, setAjusteNota, setAjusteMsg, setModalAjuste } = r

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="text-white text-sm animate-pulse">Cargando...</div>
      </div>
    )
  }
  if (!isAdmin) return null

  const cols = getColumns({
    onLightbox: setLightboxUrl, voucherUrls, cargarVoucherUrl, tab,
    onAjuste: p => {
      const diff = Math.max(0, Number((p as any).nSaldo||0) - Number((p as any).saldoUptres||0))
      setAjusteMonto(String(diff||''))
      setAjusteNota('')
      setAjusteMsg('')
      setModalAjuste({ syncDeudaId: (p as any).syncDeudaId, montoSugerido: diff, cliente: p.Cartera?.Cliente?.nombre||(p as any).clienteNombre||'', factura: p.numeroFactura||0 })
    },
  })
  if (tab === 'enviado') {
    cols.push({
      key: 'envioFechaCol', label: 'Envío', width: 110, minWidth: 80,
      render: p => (
        <span style={{ color: '#60a5fa', fontSize: 12, whiteSpace: 'nowrap' }}>
          {p.envioFecha ? `${fmtFecha(p.envioFecha)} ${fmtHora(p.envioFecha)}` : '—'}
        </span>
      ),
    })
  }

  return (
    <div className="space-y-4 pb-28 max-w-7xl mx-auto">
      <TabsFiltros r={r} />

      {/* ── DESKTOP: DataTable ─────────────────────────────────── */}
      {isDesktop ? (
        <TablaDesktop r={r} cols={cols} />
      ) : (
        /* ── MOBILE: cards colapsables ───────────────────────── */
        <ListaMobile r={r} />
      )}

      <Paginacion r={r} />

      <LightboxVoucher r={r} />
      <ModalDetalleVariacion r={r} />
      <ModalAjuste r={r} />
    </div>
  )
}
