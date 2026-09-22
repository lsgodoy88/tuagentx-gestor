'use client'
import { useState } from 'react'
import type { EmpresaVinculada } from './tipos'

export function useVinculadas() {
  const [vinculadas, setVinculadas] = useState<EmpresaVinculada[]>([])
  const [conectadas, setConectadas] = useState<EmpresaVinculada[]>([])
  const [modalVinculada, setModalVinculada] = useState(false)
  const [nuevaVinculada, setNuevaVinculada] = useState({ nombre: '', color: '#8b5cf6' })
  const [tokenGenerado, setTokenGenerado] = useState<string | null>(null)
  const [creandoVinculada, setCreandoVinculada] = useState(false)
  const [msgVinculada, setMsgVinculada] = useState('')
  const [modalConectarToken, setModalConectarToken] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenLookup, setTokenLookup] = useState<{ nombre: string; vinculadaId: string } | null>(null)
  const [tokenMsg, setTokenMsg] = useState('')
  const [buscandoToken, setBuscandoToken] = useState(false)
  const [conectandoToken, setConectandoToken] = useState(false)
  const [sincVinculadaMsg, setSincVinculadaMsg] = useState<Record<string, string>>({})
  const [confirmVinculada, setConfirmVinculada] = useState<string | null>(null)
  const [fechaVinculadaLocal, setFechaVinculadaLocal] = useState<Record<string, string>>({})

  function init(d: { vinculadas?: EmpresaVinculada[]; conectadas?: EmpresaVinculada[] }) {
    setVinculadas(d.vinculadas || [])
    setConectadas(d.conectadas || [])
  }

  async function guardarFechaInicioBodega(vinculadaId: string, fecha: string) {
    setSincVinculadaMsg(p => ({ ...p, [vinculadaId]: '' }))
    const res = await fetch('/api/empresas-vinculadas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vinculadaId, fechaInicioBodega: fecha || null }),
    })
    const d = await res.json()
    setVinculadas(prev => prev.map(v => v.id === vinculadaId ? { ...v, fechaInicioBodega: fecha || undefined } : v))
    setSincVinculadaMsg(p => ({ ...p, [vinculadaId]: d.canceladas > 0 ? `✅ Guardado. ${d.canceladas} órdenes inactivadas.` : '✅ Guardado.' }))
  }

  async function crearVinculada() {
    setCreandoVinculada(true)
    const res = await fetch('/api/empresas-vinculadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: nuevaVinculada.color }),
    })
    const data = await res.json()
    setCreandoVinculada(false)
    if (data.vinculada) {
      setVinculadas(prev => [...prev, data.vinculada])
      setTokenGenerado(data.vinculada.apiKey)
      setNuevaVinculada({ nombre: '', color: '#8b5cf6' })
    } else {
      setMsgVinculada(data.error || 'Error al crear')
    }
  }

  async function buscarToken() {
    if (!tokenInput.trim()) return
    setBuscandoToken(true); setTokenMsg(''); setTokenLookup(null)
    const res = await fetch(`/api/empresas-vinculadas/lookup?token=${tokenInput.trim()}`)
    const data = await res.json()
    setBuscandoToken(false)
    if (data.ok) {
      setTokenLookup({ nombre: data.nombre, vinculadaId: data.vinculadaId })
    } else {
      setTokenMsg(data.error || 'Token inválido')
    }
  }

  async function confirmarConexionToken() {
    if (!tokenLookup) return
    setConectandoToken(true); setTokenMsg('')
    const res = await fetch('/api/empresas-vinculadas/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInput.trim() }),
    })
    const data = await res.json()
    setConectandoToken(false)
    if (data.ok) {
      setTokenMsg(`✅ Vinculada a ${data.nombre}`)
      setTokenLookup(null); setTokenInput('')
      setTimeout(() => { setModalConectarToken(false); setTokenMsg('') }, 2000)
    } else {
      setTokenMsg(data.error || 'Error al conectar')
    }
  }

  async function toggleActivaVinculada(id: string, activa: boolean) {
    await fetch('/api/empresas-vinculadas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activa }),
    })
    setVinculadas(prev => prev.map(v => v.id === id ? { ...v, activa } : v))
    setConfirmVinculada(null)
  }

  return {
    vinculadas, conectadas, init,
    modalVinculada, setModalVinculada,
    nuevaVinculada, setNuevaVinculada,
    tokenGenerado, setTokenGenerado,
    creandoVinculada, msgVinculada,
    modalConectarToken, setModalConectarToken,
    tokenInput, setTokenInput,
    tokenLookup, setTokenLookup,
    tokenMsg, setTokenMsg,
    buscandoToken, conectandoToken,
    sincVinculadaMsg,
    confirmVinculada, setConfirmVinculada,
    fechaVinculadaLocal, setFechaVinculadaLocal,
    guardarFechaInicioBodega, crearVinculada,
    buscarToken, confirmarConexionToken, toggleActivaVinculada,
  }
}

export type Vinculadas = ReturnType<typeof useVinculadas>
