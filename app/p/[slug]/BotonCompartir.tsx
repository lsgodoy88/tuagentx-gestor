'use client'
import { useState } from 'react'

export default function BotonCompartir({ nombre }: { nombre: string }) {
  const [copiado, setCopiado] = useState(false)

  async function compartir() {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: nombre, url })
    } else {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  return (
    <button
      onClick={compartir}
      className="w-full bg-[#1e2a3d] hover:bg-[#243352] text-white font-medium py-3 rounded-2xl text-sm transition-colors"
    >
      {copiado ? '✓ ¡Link copiado!' : '📤 Compartir este TaX-Link'}
    </button>
  )
}
