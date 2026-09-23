'use client'
import type { ColDef } from '@/components/DataTable'
import type { Pago } from '../_lib/tipos'
import { fmtMonto, fmtFecha, abrirRecibo } from '../_lib/utils'

// ── Columnas DataTable ───────────────────────────────────────────
export function getColumns(ctx: {
  _unused?: never
  onLightbox:    (url: string) => void
  voucherUrls:   Record<string, string>
  cargarVoucherUrl: (id: string, key: string) => void
  tab: string
  onAjuste?: (p: Pago) => void
}): ColDef<Pago>[] {
  const isRevisar = ctx.tab === 'revisar'
  return [
    {
      key: 'vendedor', label: 'Vend.', width: 60, minWidth: 40,
      render: p => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
          {(p.vendedorNombre || p.Empleado.nombre)
            .split(' ').map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 3)}
        </span>
      ),
    },
    {
      key: 'fecha', label: isRevisar ? 'Envío' : 'Fecha', width: 70, minWidth: 55,
      render: p => (
        <span style={{ fontFamily: 'monospace' }}>{fmtFecha(isRevisar && p.envioFecha ? p.envioFecha : p.createdAt)}</span>
      ),
    },
    {
      key: 'recibo', label: 'Recibo', width: 130, minWidth: 80,
      render: p => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); abrirRecibo(p.id) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
            title="Ver recibo">🖨️</button>
          {p.voucherKey && ctx.voucherUrls[p.id] && (
            <div
              onClick={e => { e.stopPropagation(); ctx.onLightbox(ctx.voucherUrls[p.id]) }}
              style={{ width: 18, height: 18, borderRadius: 3, overflow: 'hidden', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
              <img src={ctx.voucherUrls[p.id]} alt="v"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          )}
          <span style={{ fontFamily: 'monospace' }}>{p.numeroRecibo || '—'}</span>
        </div>
      ),
    },
    {
      key: 'cliente', label: 'Cliente', width: 220, minWidth: 100,
      render: p => (
        <span>{p.Cartera?.Cliente?.nombre || (p as any).cliente?.nombre || (p as any).clienteNombre || '—'}</span>
      ),
    },
    {
      // Una sola fuente para fila y sub-filas: reciboPago.detalles[i] — mismo
      // formato/colores en ambas, índice 0 = fila principal, 1+ = sub-filas.
      key: 'factura', label: 'Factura', width: 75, minWidth: 55,
      render: p => {
        const detalles: any[] = Array.isArray((p as any).reciboPago?.detalles) ? (p as any).reciboPago.detalles : []
        const numero = detalles.length > 0 ? detalles[0].numeroFactura : p.numeroFactura
        return <span style={{ fontFamily: 'monospace' }}>{numero || '—'}</span>
      },
      renderSub: (sub) => <span style={{ fontFamily: 'monospace' }}>{sub.numeroFactura || '—'}</span>,
    },
    {
      key: 'saldoAntes', hidden: isRevisar, label: 'Saldo', width: 95, minWidth: 70,
      render: p => {
        const detalles: any[] = Array.isArray((p as any).reciboPago?.detalles) ? (p as any).reciboPago.detalles : []
        const saldo = detalles.length > 0 ? detalles[0].saldoAntes : p.saldoAnterior
        return <span style={{ color: '#fde68a' }}>{saldo != null ? fmtMonto(saldo) : '—'}</span>
      },
      renderSub: (sub) => <span style={{ color: '#fde68a' }}>{sub.saldoAntes != null ? fmtMonto(sub.saldoAntes) : '—'}</span>,
    },
    {
      // Metodo de pago vive a nivel de RECIBO (lineasPago/metodopago), no por factura
      // individual — se asume el mismo metodo para todas las facturas del mismo recibo
      // (un recibo no cruza "que parte de la transferencia fue a cada factura").
      // FIX 30/06: detalles[].montoAplicado es BRUTO (snapshot reciboPago, igual
      // que PagoCarteraDeuda) — debe restarse detalles[].descuento para obtener
      // el neto realmente recibido, igual patrón que /cartera tab Bonus.
      key: 'efectivo', hidden: isRevisar, label: 'Efect.', width: 90, minWidth: 70,
      render: p => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0 ? (p as any).lineasPago : []
        const montoEfectivo = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago === 'efectivo').reduce((acc: number, l: any) => acc + Number(l.monto || 0), 0)
          : (p.metodopago === 'efectivo' ? Number(p.monto) : 0)
        return <span style={{ color: '#34d399' }}>{montoEfectivo > 0 ? fmtMonto(montoEfectivo) : '—'}</span>
      },
      renderSub: (sub, p) => {
        // Distribuir igual que cartera: transf primero (facturas más antiguas), luego efectivo para el resto
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0 ? (p as any).lineasPago : []
        const efectivoTotal = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago === 'efectivo').reduce((s: number, l: any) => s + Number(l.monto || 0), 0)
          : (p.metodopago === 'efectivo' ? Number(p.monto) : 0)
        const transfTotal = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago !== 'efectivo' && l.metodoPago).reduce((s: number, l: any) => s + Number(l.monto || 0), 0)
          : (p.metodopago !== 'efectivo' ? Number(p.monto) : 0)
        // Usar _facturas (mismo origen que cartera tab pagos), no reciboPago.detalles
        const facturas: any[] = Array.isArray((p as any)._facturas) && (p as any)._facturas.length > 0
          ? [...(p as any)._facturas].sort((a: any, b: any) => Number(a.numeroFactura || 0) - Number(b.numeroFactura || 0))
          : sub.numeroFactura ? [{ numeroFactura: sub.numeroFactura, montoAplicado: sub.montoAplicado }] : []
        let transfRest = transfTotal, efectivoRest = efectivoTotal
        const porFactura = facturas.map((f: any) => {
          const monto = Number(f.montoAplicado || 0)
          const tAplica = Math.min(transfRest, monto); transfRest -= tAplica
          const eAplica = Math.min(efectivoRest, monto - tAplica); efectivoRest -= eAplica
          return { numeroFactura: f.numeroFactura, _efectivo: Math.round(eAplica), _transf: Math.round(tAplica) }
        })
        const match = porFactura.find((f: any) => String(f.numeroFactura) === String(sub.numeroFactura))
        const eFactura = match ? match._efectivo : (facturas.length <= 1 ? efectivoTotal : 0)
        return <span style={{ color: '#34d399' }}>{eFactura > 0 ? fmtMonto(eFactura) : '—'}</span>
      },
    },
    {
      key: 'transferencia', hidden: isRevisar, label: 'Transf.', width: 90, minWidth: 70,
      render: p => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0 ? (p as any).lineasPago : []
        const montoTransf = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago === 'transferencia').reduce((acc: number, l: any) => acc + Number(l.monto || 0), 0)
          : (p.metodopago === 'transferencia' ? Number(p.monto) : 0)
        return <span style={{ color: '#60a5fa' }}>{montoTransf > 0 ? fmtMonto(montoTransf) : '—'}</span>
      },
      renderSub: (sub, p) => {
        const ls: any[] = Array.isArray((p as any).lineasPago) && (p as any).lineasPago.length > 0 ? (p as any).lineasPago : []
        const efectivoTotal = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago === 'efectivo').reduce((s: number, l: any) => s + Number(l.monto || 0), 0)
          : (p.metodopago === 'efectivo' ? Number(p.monto) : 0)
        const transfTotal = ls.length > 0
          ? ls.filter((l: any) => l.metodoPago !== 'efectivo' && l.metodoPago).reduce((s: number, l: any) => s + Number(l.monto || 0), 0)
          : (p.metodopago !== 'efectivo' ? Number(p.monto) : 0)
        // Usar _facturas (mismo origen que cartera tab pagos), no reciboPago.detalles
        const facturas: any[] = Array.isArray((p as any)._facturas) && (p as any)._facturas.length > 0
          ? [...(p as any)._facturas].sort((a: any, b: any) => Number(a.numeroFactura || 0) - Number(b.numeroFactura || 0))
          : sub.numeroFactura ? [{ numeroFactura: sub.numeroFactura, montoAplicado: sub.montoAplicado }] : []
        let transfRest = transfTotal, efectivoRest = efectivoTotal
        const porFactura = facturas.map((f: any) => {
          const monto = Number(f.montoAplicado || 0)
          const tAplica = Math.min(transfRest, monto); transfRest -= tAplica
          const eAplica = Math.min(efectivoRest, monto - tAplica); efectivoRest -= eAplica
          return { numeroFactura: f.numeroFactura, _efectivo: Math.round(eAplica), _transf: Math.round(tAplica) }
        })
        const match = porFactura.find((f: any) => String(f.numeroFactura) === String(sub.numeroFactura))
        const tFactura = match ? match._transf : (facturas.length <= 1 ? transfTotal : 0)
        return <span style={{ color: '#60a5fa' }}>{tFactura > 0 ? fmtMonto(tFactura) : '—'}</span>
      },
    },
    {
      key: 'descuento', hidden: isRevisar, label: 'Desc.', width: 90, minWidth: 60,
      render: p => {
        const detalles: any[] = Array.isArray((p as any).reciboPago?.detalles) ? (p as any).reciboPago.detalles : []
        const d = detalles.length > 0 ? Number(detalles[0].descuento || 0) : Number(p.descuento || 0)
        return <span style={{ color: d > 0 ? '#fdba74' : 'rgba(255,255,255,0.25)' }}>{d > 0 ? `-${fmtMonto(d)}` : '—'}</span>
      },
      renderSub: (sub) => {
        const d = Number(sub.descuento || 0)
        return <span style={{ color: d > 0 ? '#fdba74' : 'rgba(255,255,255,0.25)' }}>{d > 0 ? `-${fmtMonto(d)}` : '—'}</span>
      },
    },
    {
      key: 'saldoDespues', hidden: isRevisar, label: 'Nuevo Saldo', width: 105, minWidth: 75,
      render: p => {
        const detalles: any[] = Array.isArray((p as any).reciboPago?.detalles) ? (p as any).reciboPago.detalles : []
        const saldo = detalles.length > 0 ? detalles[0].saldoDespues : ((p as any).reciboPago?.saldoNuevo ?? null)
        return <span style={{ color: '#86efac', fontWeight: 700 }}>{saldo != null ? fmtMonto(saldo) : '—'}</span>
      },
      renderSub: (sub) => <span style={{ color: '#86efac', fontWeight: 700 }}>{sub.saldoDespues != null ? fmtMonto(sub.saldoDespues) : '—'}</span>,
    },
    {
      key: 'dif', label: 'Diferencias', width: 100, minWidth: 75, hidden: !isRevisar,
      render: p => {
        const n = Number((p as any).nSaldo ?? 0), u = Number((p as any).saldoUptres ?? 0)
        const d = n - u
        return <span style={{ fontWeight: 700, color: d > 0 ? '#f87171' : d < 0 ? '#34d399' : '#6b7280' }}>{fmtMonto(Math.abs(d))}</span>
      },
      renderSub: (sub) => {
        const n = Number(sub.nSaldo ?? 0), u = Number(sub.saldoUptres ?? 0)
        const d = n - u
        if (Math.abs(d) < 1) return <span style={{ color: '#4b5563' }}>—</span>
        return <span style={{ fontWeight: 700, color: d > 0 ? '#f87171' : '#34d399' }}>{fmtMonto(Math.abs(d))}</span>
      },
    },
    {
      key: 'uptres', label: 'UpTres', width: 100, minWidth: 75, hidden: !isRevisar,
      render: p => <span style={{ color: '#fff' }}>{fmtMonto(Number((p as any).saldoUptres ?? 0))}</span>,
      renderSub: (sub) => { const d = Math.abs(Number(sub.nSaldo??0)-Number(sub.saldoUptres??0)); return d < 1 ? <span style={{color:'#4b5563'}}>—</span> : <span style={{color:'#fff'}}>{fmtMonto(Number(sub.saldoUptres??0))}</span> },
    },
    {
      key: 'gestor', label: 'Gestor', width: 100, minWidth: 75, hidden: !isRevisar,
      render: p => <span style={{ color: '#fff' }}>{fmtMonto(Number((p as any).nSaldo ?? 0))}</span>,
      renderSub: (sub) => { const d = Math.abs(Number(sub.nSaldo??0)-Number(sub.saldoUptres??0)); return d < 1 ? <span style={{color:'#4b5563'}}>—</span> : <span style={{color:'#fff'}}>{fmtMonto(Number(sub.nSaldo??0))}</span> },
    },
    {
      key: 'dias', label: 'Días', width: 60, minWidth: 50, hidden: !isRevisar,
      render: p => {
        const ef = p.envioFecha
        if (!ef) return <span style={{ color: '#4b5563' }}>—</span>
        const dias = Math.floor((Date.now() - new Date(ef).getTime()) / 86400000)
        const color = dias > 20 ? '#ef4444' : dias > 10 ? '#f59e0b' : '#6b7280'
        return <span style={{ fontWeight: 800, color }}>{dias}d</span>
      },
      renderSub: () => <span style={{ color: '#4b5563' }}>—</span>,
    },
    {
      key: 'ajuste', label: 'Ajuste', width: 70, minWidth: 60, hidden: !isRevisar,
      render: p => {
        if ((p as any).ajusteManual) return <span className="text-xs text-emerald-400 font-semibold">✔ Ajust.</span>
        if (!(p as any).syncDeudaId) return <span style={{ color: '#4b5563' }}>—</span>
        return (
          <button onClick={e => { e.stopPropagation(); ctx.onAjuste?.(p) }}
            className="text-xs px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
            📝
          </button>
        )
      },
      renderSub: () => null,
    },
  ]
}
