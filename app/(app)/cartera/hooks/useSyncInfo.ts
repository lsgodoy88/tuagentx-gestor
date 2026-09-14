'use client'
import { useState, useCallback } from 'react'

export type SyncLogItem = {
  id: string
  inicio: string
  fin: string | null
  duracionMs: number
  clientesActualizados: number
  empleadosSincronizados: number
  deudasSincronizadas: number
  zombis: number
  pagosConfrontados: number
  disparadoPor: string
  estado: string
  errores: any
}

type SyncInfo = {
  ultimaSync: string | null
  ultimaSyncCompleta?: string | null
  tieneIntegracion?: boolean
  historial?: SyncLogItem[]
}

export function useSyncInfo(onSyncComplete?: () => Promise<void>) {
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null)
  const [modalSync, setModalSync] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const cargarSyncInfo = useCallback(async () => {
    try {
      const d = await fetch('/api/integracion/estado').then(r => r.json())
      setSyncInfo({
        ultimaSync: d.ultimaSync ?? null,
        ultimaSyncCompleta: d.ultimaSyncCompleta ?? null,
        tieneIntegracion: d.tieneIntegracion ?? false,
        historial: d.historial ?? [],
      })
    } catch {}
  }, [])

  const sincronizar = useCallback(async () => {
    setSincronizando(true)
    try {
      await fetch('/api/integracion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'delta' }),
      })
    } catch {}
    if (onSyncComplete) await onSyncComplete()
    await cargarSyncInfo()
    setSincronizando(false)
  }, [onSyncComplete, cargarSyncInfo])

  return {
    syncInfo,
    modalSync,
    setModalSync,
    sincronizando,
    cargarSyncInfo,
    sincronizar,
  }
}
