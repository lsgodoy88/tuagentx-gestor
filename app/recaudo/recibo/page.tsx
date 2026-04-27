'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import html2canvas from 'html2canvas'

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const metodoLabel: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque', datafono: 'Datáfono',
}

type Formato = '58mm' | '80mm'

function ReciboContent() {
  const { status } = useSession()
  const params = useSearchParams()
  const token = params.get('token')
  const fmtParam = params.get('fmt') as Formato | null
  const [pago, setPago] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [formato, setFormato] = useState<Formato>(fmtParam === '58mm' ? '58mm' : '80mm')
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null)

  useEffect(() => {
    const style = document.getElementById('print-page-style') as HTMLStyleElement | null
    if (style) style.textContent = `@page { margin: 0; size: ${formato} auto; }`
  }, [formato])

  useEffect(() => {
    if (status === 'unauthenticated') { window.location.href = '/login'; return }
    if (status === 'loading') return
    if (!token) { window.location.href = '/dashboard'; return }
    fetch(`/api/cartera/recibo-publico?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { window.location.href = '/dashboard'; return }
        setPago(d.pago)
        setLoading(false)
        const cfg = d.pago?.cartera?.empresa?.configRecibos
        const ap = (typeof cfg === 'object' && cfg !== null) ? cfg.anchoPapel : null
        if (ap === '58mm' || ap === '80mm') setFormato(ap)
        if (d.pago?.voucherKey) {
          fetch('/api/firma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firma: d.pago.voucherKey }) })
            .then(r => r.json()).then(v => { if (v.url) setVoucherUrl(v.url) }).catch(() => {})
        }
      })
      .catch(() => { window.location.href = '/dashboard' })
  }, [token, status])


  async function imprimirBluetooth() {
    function row(label: string, value: string, width = 32): string {
      const espacios = width - label.length - value.length
      return label + ' '.repeat(Math.max(1, espacios)) + value + '\n'
    }
    function sep(enc: TextEncoder): number[] {
      return Array.from(enc.encode('--------------------------------\n'))
    }
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      })
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
      const enc = new TextEncoder()
      const ESC = 0x1B
      const GS  = 0x1D
      const fmt2 = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

      // Flush buffer + inicializar
      let data: number[] = [0x0A, 0x0A, ESC, 0x40]

      // --- ENCABEZADO centrado ---
      data.push(ESC, 0x61, 0x01)
      data.push(ESC, 0x45, 0x01)
      const empresaNombre = (pago?.cartera?.empresa?.nombre || 'Empresa').toUpperCase()
      data.push(...Array.from(enc.encode(empresaNombre + '\n')))
      data.push(ESC, 0x45, 0x00)
      const empresaNit = (pago?.cartera?.empresa?.configRecibos as any)?.nit || ''
      const empresaDir = pago?.cartera?.empresa?.configRecibos?.direccion || ''
      if (empresaNit) data.push(...Array.from(enc.encode('NIT: ' + empresaNit + '\n')))
      if (empresaDir) data.push(...Array.from(enc.encode(empresaDir + '\n')))
      const recNum = pago?.consecutivo || pago?.id?.slice(-8).toUpperCase()
      data.push(ESC, 0x45, 0x01)
      data.push(...Array.from(enc.encode('RECIBO DE CAJA #' + recNum + '\n')))
      data.push(ESC, 0x45, 0x00)
      data.push(...sep(enc))

      // --- CLIENTE izquierda dos columnas ---
      data.push(ESC, 0x61, 0x00)
      const clienteNombre = pago?.cartera?.cliente?.nombre || ''
      const nit = pago?.cartera?.cliente?.nit || ''
      const tel = pago?.cartera?.cliente?.telefono || ''
      data.push(...Array.from(enc.encode(row('Cliente:', clienteNombre))))
      if (nit) data.push(...Array.from(enc.encode(row('NIT:', nit))))
      if (tel) data.push(...Array.from(enc.encode(row('Tel:', tel))))
      data.push(...sep(enc))

      // --- DATOS DEL PAGO ---
      const fechaPago = new Date(pago?.createdAt || Date.now())
      const fechaStr  = String(fechaPago.getDate()).padStart(2,'0') + '/' +
                        String(fechaPago.getMonth()+1).padStart(2,'0') + '/' +
                        fechaPago.getFullYear()
      const h       = fechaPago.getHours()
      const mi      = fechaPago.getMinutes()
      const horaStr = (h % 12 || 12) + ':' + String(mi).padStart(2,'0') + (h >= 12 ? ' PM' : ' AM')
      const factura  = pago?.cartera?.DetalleCartera?.[0]?.numeroFactura || ''
      const vendedor = pago?.empleado?.nombre || ''
      const metodos: Record<string,string> = { efectivo:'Efectivo', transferencia:'Transferencia', cheque:'Cheque', datafono:'Datafono' }
      const formaPago = metodos[pago?.metodoPago] || pago?.metodoPago || ''

      if (factura)  data.push(...Array.from(enc.encode(row('Factura:', factura))))
      data.push(...Array.from(enc.encode(row('Fecha:', fechaStr))))
      data.push(...Array.from(enc.encode(row('Hora:', horaStr))))
      if (vendedor) data.push(...Array.from(enc.encode(row('Atendio:', vendedor))))
      if (formaPago && !pago?.lineasPago) data.push(...Array.from(enc.encode(row('Forma pago:', formaPago))))
      data.push(...sep(enc))

      // --- VALORES ---
      const saldoAnt  = Number(pago?.cartera?.saldoPendiente ?? 0) + Number(pago?.monto || 0) + Number(pago?.descuento || 0)
      const saldoNuevo = Number(pago?.cartera?.saldoPendiente ?? 0)
      data.push(...Array.from(enc.encode(row('Valor factura:', fmt2(saldoAnt)))))
      data.push(...Array.from(enc.encode(row('Saldo anterior:', fmt2(saldoAnt)))))

      if (pago?.lineasPago) {
        for (const linea of pago.lineasPago) {
          const lbl = (metodos[linea.metodoPago] || linea.metodoPago) + ':'
          data.push(...Array.from(enc.encode(row(lbl, fmt2(Number(linea.monto))))))
          if (linea.metodoPago === 'transferencia' && linea.voucherDatosIA?.referencia)
            data.push(...Array.from(enc.encode('  Ref: ' + linea.voucherDatosIA.referencia + '\n')))
        }
      } else {
        data.push(...Array.from(enc.encode(row('Pago:', fmt2(Number(pago?.monto || 0))))))
      }

      if (pago?.descuento && Number(pago.descuento) > 0)
        data.push(...Array.from(enc.encode(row('Descuento:', fmt2(Number(pago.descuento))))))
      data.push(...sep(enc))

      // --- SALDO FINAL bold ---
      data.push(ESC, 0x45, 0x01)
      data.push(...Array.from(enc.encode(row('SALDO:', fmt2(saldoNuevo)))))
      data.push(ESC, 0x45, 0x00)
      data.push(...sep(enc))

      // --- PIE centrado ---
      data.push(ESC, 0x61, 0x01)
      if (pago?.notas) data.push(...Array.from(enc.encode('Nota: ' + pago.notas + '\n')))
      data.push(...Array.from(enc.encode('Gracias por su pago\n')))
      data.push(...Array.from(enc.encode('TuAgentX Gestor\n')))
      data.push(...Array.from(enc.encode('\n\n')))

      // Cortar papel
      data.push(GS, 0x56, 0x00)

      // Enviar chunks 100 bytes con ACK
      const chunk = 100
      for (let i = 0; i < data.length; i += chunk) {
        try {
          await characteristic.writeValueWithResponse(new Uint8Array(data.slice(i, i + chunk)))
        } catch {
          await characteristic.writeValueWithoutResponse(new Uint8Array(data.slice(i, i + chunk)))
        }
        await new Promise(r => setTimeout(r, 100))
      }
      alert('Impreso correctamente')
    } catch (e: any) {
      if (e.name !== 'NotFoundError') alert('Error: ' + e.message)
    }
  }
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'monospace', background: 'white' }}>
      Cargando...
    </div>
  )
  if (!pago) return null

  const empresa = pago.cartera?.empresa
  const cliente = pago.cartera?.cliente
  const fecha = new Date(pago.createdAt)
  const reciboNum = pago.consecutivo || pago.numeroRecibo || pago.id.slice(-8).toUpperCase()
  const saldoAnterior = Number(pago.cartera?.saldoPendiente ?? 0) + Number(pago.monto) + Number(pago.descuento)
  const saldoNuevo = Number(pago.cartera?.saldoPendiente ?? 0)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

  const handleCompartirImagen = async () => {
    const ticket = document.querySelector('.ticket') as HTMLElement | null
    if (!ticket) return
    try {
      const canvas = await html2canvas(ticket, { useCORS: true, scale: 2, backgroundColor: '#ffffff' })
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob null')), 'image/png')
      )
      const file = new File([blob], `recibo-${reciboNum}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        const text = `Recibo de pago #${reciboNum} - Cliente: ${cliente?.nombre} - Pago: ${fmt(Number(pago.monto))} - Nuevo saldo: ${fmt(saldoNuevo)}`
        await navigator.share({ title: `Recibo ${reciboNum}`, text, files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `recibo-${reciboNum}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error('Error compartiendo imagen:', e)
    }
  }

  const ancho = formato === '58mm' ? '58mm' : '80mm'
  const fs = {
    base:    formato === '58mm' ? 13 : 14,
    empresa: formato === '58mm' ? 15 : 17,
    saldo:   formato === '58mm' ? 15 : 17,
    small:   formato === '58mm' ? 11 : 12,
  }

  // URL para compartir: usar token si existe, si no generar con sesión
  const shareUrl = token
    ? window.location.href
    : `${window.location.origin}/recaudo/recibo?token=${pago.reciboToken || ''}`

  return (
    <>
      <style id="print-page-style">{`@page { margin: 0; size: ${ancho} auto; }`}</style>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background: #e5e7eb; font-family: 'Courier New', Courier, monospace; color: #111; }
        .ticket-screen { display: flex; flex-direction: column; align-items: center; padding: 16px 0 100px 0; min-height: 100vh; }
        .ticket { background: white; padding: 10px 10px 14px 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
        .ticket-80 { width: 80mm; }
        .ticket-58 { width: 58mm; }
        .tc { text-align: center; }
        .b { font-weight: bold; }
        .sep { border: none; border-top: 1px dashed #888; margin: 7px 0; }
        .row { display: flex; justify-content: space-between; align-items: baseline; margin: 3px 0; gap: 4px; }
        .row .lbl { color: #555; white-space: nowrap; flex-shrink: 0; }
        .row .val { text-align: right; }
        .srow { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 2px; border-bottom: 1px dotted #ccc; gap: 4px; }
        .srow .lbl { color: #555; white-space: nowrap; flex-shrink: 0; }
        .saldo-final { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; border-top: 2px solid #111; padding-top: 5px; margin-top: 3px; gap: 4px; }
        .no-print { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; padding: 10px 12px; background: white; border-top: 1px solid #e5e7eb; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); z-index: 999; justify-content: center; }
        .btn { padding: 10px 8px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 5px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-print, .btn-share { flex: 1; }
        .btn-print { background: #059669; color: white; }
        .btn-share { background: #3b82f6; color: white; }
        .btn-fmt { background: #f3f4f6; color: #111; flex: 0 0 auto; padding: 10px 12px; font-size: 12px; }
        .btn-back { background: #f3f4f6; color: #111; flex: 0 0 auto; padding: 10px 12px; font-size: 12px; }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .voucher-section { display: none !important; }
          .ticket-screen { padding: 0 !important; background: white !important; }
          .ticket { box-shadow: none !important; width: 100% !important; padding: 4px 6px 8px 6px !important; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn btn-back" onClick={() => {
          if (window.history.length > 1) { window.close(); setTimeout(() => { window.location.href = '/dashboard/cartera' }, 300) }
          else { window.location.href = '/dashboard/cartera' }
        }}>←</button>
        {!isIOS && (
          <button className="btn btn-print" onClick={imprimirBluetooth}>🖨️ BT Imprimir</button>
        )}
        <button className="btn btn-share" onClick={handleCompartirImagen}>📤 Compartir</button>
        <button className="btn btn-fmt" onClick={() => setFormato(f => f === '80mm' ? '58mm' : '80mm')}>
          🖨️ {formato} ▲
        </button>
      </div>

      <div className="ticket-screen">
        <div className={`ticket ${formato === '58mm' ? 'ticket-58' : 'ticket-80'}`} style={{ fontSize: fs.base }}>

          <div className="tc b" style={{ fontSize: fs.empresa, marginBottom: 2 }}>{empresa?.nombre || 'Empresa'}</div>
          {empresa?.telefono && <div className="tc" style={{ fontSize: fs.small, color: '#555' }}>Tel: {empresa.telefono}</div>}
          {empresa?.nit && <div className="tc" style={{ fontSize: fs.small, color: '#555' }}>NIT: {empresa.nit}</div>}

          <hr className="sep" />

          <div className="tc b" style={{ fontSize: fs.base + 1, letterSpacing: 1 }}>RECIBO PAGO</div>
          <div className="tc" style={{ fontSize: fs.small, color: '#555' }}>#{reciboNum}</div>

          <hr className="sep" />

          <div className="row"><span className="lbl">Cliente:</span><span className="val b">{cliente?.nombre}</span></div>
          {cliente?.nit && <div className="row"><span className="lbl">NIT:</span><span className="val">{cliente.nit}</span></div>}
          {cliente?.telefono && <div className="row"><span className="lbl">Tel:</span><span className="val">{cliente.telefono}</span></div>}
          <hr className="sep" />
          {pago.cartera?.DetalleCartera?.[0]?.numeroFactura && (
            <div className="row"><span className="lbl">Factura:</span><span className="val">{pago.cartera.DetalleCartera[0].numeroFactura}</span></div>
          )}
          <div className="row"><span className="lbl">Fecha:</span><span className="val">{String(fecha.getDate()).padStart(2,'0')}/{String(fecha.getMonth()+1).padStart(2,'0')}/{fecha.getFullYear()}</span></div>
          <div className="row"><span className="lbl">Hora:</span><span className="val">{(fecha.getHours()%12||12)}:{String(fecha.getMinutes()).padStart(2,'0')} {fecha.getHours()>=12?'PM':'AM'}</span></div>
          <div className="row"><span className="lbl">Atendió:</span><span className="val">{pago.empleado?.nombre || '-'}</span></div>
          {!pago.lineasPago && pago.metodoPago && (
            <div className="row"><span className="lbl">Forma de pago:</span><span className="val b">{metodoLabel[pago.metodoPago] || pago.metodoPago}</span></div>
          )}
          <hr className="sep" />
          <div className="srow"><span className="lbl">Valor factura:</span><span>{fmt(saldoAnterior)}</span></div>
          <div className="srow"><span className="lbl">Saldo anterior:</span><span>{fmt(saldoNuevo + Number(pago.monto) + Number(pago.descuento))}</span></div>
          {pago.lineasPago ? (
            pago.lineasPago.map((linea: any, i: number) => (
              <div key={i}>
                <div className="srow">
                  <span className="lbl">{metodoLabel[linea.metodoPago] || linea.metodoPago}:</span>
                  <span className="b" style={{ color: '#059669' }}>{fmt(Number(linea.monto))}</span>
                </div>
                {linea.metodoPago === 'transferencia' && linea.voucherDatosIA?.referencia && (
                  <div style={{ fontSize: fs.small - 1, color: '#888', textAlign: 'right', marginBottom: 2 }}>Ref: {linea.voucherDatosIA.referencia}</div>
                )}
              </div>
            ))
          ) : (
            <div className="srow"><span className="lbl">Pago:</span><span className="b" style={{ color: '#059669' }}>{fmt(Number(pago.monto))}</span></div>
          )}
          {Number(pago.descuento) > 0 && (
            <div className="srow"><span className="lbl">Descuento:</span><span style={{ color: '#059669' }}>{fmt(Number(pago.descuento))}</span></div>
          )}
          <div className="saldo-final" style={{ fontSize: fs.saldo }}>
            <span>SALDO:</span>
            <span style={{ color: saldoNuevo === 0 ? '#059669' : '#dc2626' }}>{fmt(saldoNuevo)}</span>
          </div>

          {pago.notas && (
            <>
              <hr className="sep" />
              <div style={{ fontSize: fs.small, color: '#555' }}>Nota: {pago.notas}</div>
            </>
          )}

          {voucherUrl && (
            <div className="voucher-section">
              <hr className="sep" />
              <div className="tc" style={{ fontSize: fs.small, color: '#555', marginBottom: 4 }}>Comprobante</div>
              <img src={voucherUrl} alt="Comprobante" style={{ width: '100%', borderRadius: 4, display: 'block' }} />
            </div>
          )}

          <hr className="sep" />
          <div className="tc" style={{ fontSize: fs.small, color: '#555', marginTop: 2 }}>Gracias por su pago</div>
          <div className="tc" style={{ fontSize: fs.small - 1, color: '#888', marginTop: 2 }}>TuAgentX Gestor</div>
        </div>
      </div>
    </>
  )
}

export default function ReciboPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: 'monospace', padding: 20, background: 'white', minHeight: '100vh' }}>Cargando...</div>}>
      <ReciboContent />
    </Suspense>
  )
}
