'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

function ReciboContent() {
  const { status } = useSession()
  const params = useSearchParams()
  const pagoId = params.get('id')
  const [pago, setPago] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status !== 'authenticated' || !pagoId) return
    fetch(`/api/cartera/recibo/${pagoId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setPago(d.pago)
        setLoading(false)
      })
  }, [status, pagoId])

  if (status === 'loading' || loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'monospace', background: 'white' }}>
      Cargando recibo...
    </div>
  )
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'monospace', background: 'white', color: 'red' }}>
      {error}
    </div>
  )
  if (!pago) return null

  const empresa = pago.cartera.empresa
  const cliente = pago.cartera.cliente
  const fecha = new Date(pago.createdAt)
  const reciboNum = pago.id.slice(-8).toUpperCase()
  const saldoAnterior = Number(pago.cartera.saldoPendiente) + Number(pago.monto) + Number(pago.descuento)
  const saldoNuevo = Number(pago.cartera.saldoPendiente)

  const metodoLabel: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    cheque: 'Cheque',
    datafono: 'Datáfono',
  }

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: white; font-family: 'Courier New', monospace; font-size: 11px; color: #111; }
        .ticket { width: 80mm; max-width: 80mm; margin: 0 auto; padding: 8px 6px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #888; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .label { color: #555; }
        .big { font-size: 14px; font-weight: bold; }
        .saldo-row { display: flex; justify-content: space-between; background: #f5f5f5; padding: 3px 4px; margin: 2px 0; }
        .no-print { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 100; }
        .btn { padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; }
        .btn-print { background: #059669; color: white; }
        .btn-share { background: #6b7280; color: white; }
        @media print {
          @page { margin: 0; size: 80mm auto; }
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn btn-print" onClick={() => window.print()}>🖨️ Imprimir</button>
        <button className="btn btn-share" onClick={async () => {
          try {
            await navigator.share({ title: `Recibo ${reciboNum}`, url: window.location.href })
          } catch {
            navigator.clipboard.writeText(window.location.href)
            alert('URL copiada')
          }
        }}>📤 Compartir</button>
      </div>

      <div className="ticket">
        <div className="center bold big" style={{ fontSize: 13, marginBottom: 2 }}>{empresa.nombre}</div>
        {empresa.telefono && <div className="center label">Tel: {empresa.telefono}</div>}
        <div className="center label">RECIBO DE PAGO</div>
        <div className="line" />

        <div className="row"><span className="label">Recibo:</span><span className="bold">#{reciboNum}</span></div>
        <div className="row"><span className="label">Fecha:</span><span>{fecha.toLocaleDateString('es-CO')}</span></div>
        <div className="row"><span className="label">Hora:</span><span>{fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div className="row"><span className="label">Atendió:</span><span>{pago.empleado?.nombre || '-'}</span></div>

        <div className="line" />

        <div className="row"><span className="label">Cliente:</span><span className="bold">{cliente.nombre}</span></div>
        {cliente.nit && <div className="row"><span className="label">NIT:</span><span>{cliente.nit}</span></div>}
        {cliente.telefono && <div className="row"><span className="label">Tel:</span><span>{cliente.telefono}</span></div>}

        <div className="line" />

        <div className="row"><span className="label">Tipo:</span><span>{pago.tipo === 'total' ? 'Pago total' : 'Abono parcial'}</span></div>
        <div className="row"><span className="label">Método:</span><span>{metodoLabel[pago.metodoPago] || pago.metodoPago}</span></div>
        <div className="row bold"><span>Monto pagado:</span><span style={{ color: '#059669' }}>{fmt(Number(pago.monto))}</span></div>
        {Number(pago.descuento) > 0 && (
          <div className="row"><span className="label">Descuento:</span><span>{fmt(Number(pago.descuento))}</span></div>
        )}
        {pago.notas && <div style={{ marginTop: 4 }}><span className="label">Notas: </span>{pago.notas}</div>}

        <div className="line" />

        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>ESTADO DE CUENTA</div>
        <div className="saldo-row"><span className="label">Saldo anterior:</span><span>{fmt(saldoAnterior)}</span></div>
        <div className="saldo-row"><span className="label">Pago aplicado:</span><span style={{ color: '#059669' }}>- {fmt(Number(pago.monto) + Number(pago.descuento))}</span></div>
        <div className="saldo-row bold"><span>Saldo nuevo:</span><span style={{ color: saldoNuevo === 0 ? '#059669' : '#dc2626' }}>{fmt(saldoNuevo)}</span></div>

        <div className="line" />
        <div className="center label" style={{ marginTop: 4 }}>Gracias por su pago</div>
        <div className="center label" style={{ fontSize: 9, marginTop: 2 }}>Conserve este recibo como comprobante</div>
      </div>
    </>
  )
}

export default function ReciboPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: 'monospace', padding: 20 }}>Cargando...</div>}>
      <ReciboContent />
    </Suspense>
  )
}
