'use client'
import { useState } from 'react'

export default function PagarPlanBtn({ empresaId, limites, precios, montoNegociado }: {
  empresaId: string
  limites: Record<string, number>
  precios: Record<string, number>
  montoNegociado?: number | null
}) {
  const [loading, setLoading] = useState(false)

  const ROLES_BILLING = [
    { id: "vendedor", maxKey: "maxVendedores" },
    { id: "supervisor", maxKey: "maxSupervisores" },
    { id: "bodega", maxKey: "maxBodega" },
    { id: "entregas", maxKey: "maxEntregas" },
    { id: "impulsadora", maxKey: "maxImpulsadoras" },
  ]
  const montoSlots = ROLES_BILLING.reduce((sum, r) => {
    const max = limites[r.maxKey] ?? 0
    const precio = precios[r.id] ?? 0
    return sum + max * precio
  }, 0)

  async function handlePagar() {
    setLoading(true)
    try {
      const gen = await fetch("/api/plan-empresa/generar", { method: "POST" })
      const gd = await gen.json()
      if (!gd.ok) return
      const montoCheckout = gd.deudaTotal > 0 ? gd.deudaTotal : gd.monto
      if (!montoCheckout) return
      const res = await fetch("/api/pagos/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: montoCheckout }),
      })
      const d = await res.json()
      if (d.linkPago) window.open(d.linkPago, "_blank", "noopener,noreferrer")
    } catch {}
    finally { setLoading(false) }
  }

  if (montoNegociado) {
    return (
      <button onClick={handlePagar} disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-bold transition-colors bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white">
        {loading ? "Generando link..." : (
          <span>Pagar 💳 <span className="line-through text-white/50">${montoSlots.toLocaleString("es-CO")}</span> ${montoNegociado.toLocaleString("es-CO")}/mes</span>
        )}
      </button>
    )
  }

  return (
    <button onClick={handlePagar} disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-bold transition-colors bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white">
      {loading ? "Generando link..." : `💳 Pagar $${montoSlots.toLocaleString("es-CO")}/mes`}
    </button>
  )
}
