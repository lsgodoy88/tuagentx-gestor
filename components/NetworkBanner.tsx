'use client'
/**
 * NetworkBanner — barra superior fina cuando no hay red.
 * Se monta en el layout, invisible cuando hay conexión.
 */
import { useNetwork } from '@/lib/useNetwork'

export function NetworkBanner() {
  const { online, lastOnline } = useNetwork()
  if (online) return null

  const mins = lastOnline
    ? Math.floor((Date.now() - lastOnline.getTime()) / 60_000)
    : null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2
                    bg-amber-500/95 backdrop-blur-sm text-black text-[11px] font-semibold
                    px-3 py-1.5 shadow-lg">
      <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-pulse flex-shrink-0" />
      Sin conexión
      {mins !== null && (
        <span className="font-normal opacity-70">
          · datos de hace {mins < 1 ? 'menos de 1' : mins} min
        </span>
      )}
    </div>
  )
}
