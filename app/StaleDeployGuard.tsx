'use client'

import { useEffect, useState } from 'react'
import { unstable_isUnrecognizedActionError } from 'next/navigation'

export default function StaleDeployGuard() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      if (unstable_isUnrecognizedActionError(e.reason)) setStale(true)
    }
    function onError(e: ErrorEvent) {
      if (unstable_isUnrecognizedActionError(e.error)) setStale(true)
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  useEffect(() => {
    if (!stale) return
    function blockEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', blockEscape, true)
    return () => window.removeEventListener('keydown', blockEscape, true)
  }, [stale])

  if (!stale) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: 'rgba(24,24,27,0.55)', backdropFilter: 'blur(1px)' }}
    >
      <div className="bg-white rounded-2xl w-[230px] shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-6">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2">
            <path d="M21 12a9 9 0 11-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        </div>
        <div className="px-4 pb-5 pt-2 text-center">
          <p className="text-zinc-900 font-semibold text-[15px] mb-1.5">Nueva versión disponible</p>
          <p className="text-zinc-500 text-[13px] leading-relaxed">
            Tu sesión quedó desactualizada. Toca Aceptar para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-zinc-900 text-white text-sm font-semibold py-3 rounded-xl"
          >
            Aceptar y recargar
          </button>
        </div>
      </div>
    </div>
  )
}
