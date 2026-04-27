// DESACTIVADO - reactivar cuando salga de pruebas
export default function SwUpdateNotifier() { return null }
/* ORIGINAL:
'use client'

import { useEffect, useState } from 'react'

export default function SwUpdateNotifier() {
  const [newVersion, setNewVersion] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setNewVersion(true)
            }
          })
        })
      })
    }
  }, [])

  if (!newVersion) return null

  return (
    <div className="fixed bottom-6 right-4 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl flex items-start gap-3 w-72">
      <span className="text-xl">🔄</span>
      <div className="flex-1">
        <p className="text-white text-sm font-semibold">Nueva versión</p>
        <p className="text-zinc-400 text-xs mt-0.5">Hay una actualización disponible</p>
        <button
          onClick={() => {
            navigator.serviceWorker.controller?.postMessage('SKIP_WAITING')
            window.location.reload()
          }}
          className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          Actualizar
        </button>
      </div>
      <button
        onClick={() => setNewVersion(false)}
        className="text-zinc-500 hover:text-white text-lg leading-none"
      >
        ✕
      </button>
    </div>
  )
}

*/