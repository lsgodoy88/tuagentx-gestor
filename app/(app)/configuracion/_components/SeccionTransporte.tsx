'use client'
import { useState, useEffect } from 'react'
import { Seccion } from './Seccion'
import { eyeOpen, eyeOff } from '../_lib/icons'
import type { TransprensaTest } from '../_lib/tipos'

interface Props {
  isOpen: boolean
  onToggle: () => void
}

export function SeccionTransporte({ isOpen, onToggle }: Props) {
  const [transportadora, setTransportadora] = useState('')
  const [urlBase, setUrlBase] = useState('')
  const [savingDespachos, setSavingDespachos] = useState(false)
  const [msgDespachos, setMsgDespachos] = useState('')

  const [transprensaLogin, setTransprensaLogin] = useState('')
  const [transprensaPassword, setTransprensaPassword] = useState('')
  const [transprensaNitRemitente, setTransprensaNitRemitente] = useState('')
  const [transprensaConfigurado, setTransprensaConfigurado] = useState(false)
  const [savingTransprensa, setSavingTransprensa] = useState(false)
  const [msgTransprensa, setMsgTransprensa] = useState('')
  const [showTransprensaPass, setShowTransprensaPass] = useState(false)
  const [transprensaTest, setTransprensaTest] = useState<TransprensaTest>('idle')
  const [testingTransprensa, setTestingTransprensa] = useState(false)

  useEffect(() => {
    fetch('/api/empresa/despachos').then(r => r.json()).then(d => {
      setTransportadora(d.transportadora || '')
      setUrlBase(d.urlBase || '')
    }).catch(() => {})
    fetch('/api/integracion/transprensa').then(r => r.json()).then(d => {
      if (d.configurado) {
        setTransprensaConfigurado(true)
        setTransprensaLogin(d.usuario_login || '')
        setTransprensaNitRemitente(d.nit_remitente || '')
      }
    }).catch(() => {})
  }, [])

  async function guardarConfigDespachos() {
    setSavingDespachos(true)
    const r = await fetch('/api/empresa/despachos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transportadora, urlBase }),
    })
    setSavingDespachos(false)
    setMsgDespachos(r.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgDespachos(''), 3000)
  }

  async function testTransprensa() {
    setTestingTransprensa(true)
    const r = await fetch('/api/integracion/transprensa/test', { method: 'POST' }).then(r => r.json()).catch(() => ({ ok: false }))
    setTransprensaTest(r.ok ? 'ok' : 'error')
    setTestingTransprensa(false)
  }

  async function guardarTransprensa() {
    if (!transprensaPassword && transprensaConfigurado) {
      setSavingTransprensa(true)
      const r = await fetch('/api/integracion/transprensa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nit_remitente: transprensaNitRemitente }),
      }).then(r => r.json()).catch(() => ({ ok: false }))
      setSavingTransprensa(false)
      setMsgTransprensa(r.ok ? '✅ Guardado' : r.error || 'Error al guardar')
      setTimeout(() => setMsgTransprensa(''), 3000)
      return
    }
    if (!transprensaLogin || !transprensaPassword) { setMsgTransprensa('Usuario y contraseña requeridos'); return }
    setSavingTransprensa(true)
    const r = await fetch('/api/integracion/transprensa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_login: transprensaLogin, usuario_password: transprensaPassword, nit_remitente: transprensaNitRemitente }),
    })
    setSavingTransprensa(false)
    if (r.ok) { setTransprensaConfigurado(true); setTransprensaPassword(''); setMsgTransprensa('✅ Guardado') }
    else setMsgTransprensa('Error al guardar')
    setTimeout(() => setMsgTransprensa(''), 3000)
  }

  return (
    <Seccion titulo="Transporte" icono="🚛" isOpen={isOpen} onToggle={onToggle}>
      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Transportadora de ciudades</p>
      <div>
        <label className="text-zinc-400 text-xs mb-1 block">Nombre de la transportadora</label>
        <input value={transportadora} onChange={e => setTransportadora(e.target.value)}
          placeholder="Nombre de la transportadora"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label className="text-zinc-400 text-xs mb-1 block">URL base de seguimiento</label>
        <input value={urlBase} onChange={e => setUrlBase(e.target.value)}
          placeholder="https://..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        <p className="text-zinc-600 text-xs mt-1">El código escaneado se agrega al final de esta URL</p>
      </div>
      {urlBase && transportadora && (
        <div className="bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-800">
          <p className="text-zinc-500 text-xs mb-1">Vista previa del link</p>
          <p className="text-blue-400 text-xs break-all">{urlBase}{'<codigo_guia>'}</p>
        </div>
      )}
      {msgDespachos && <p className="text-sm text-emerald-400">{msgDespachos}</p>}
      <button onClick={guardarConfigDespachos} disabled={savingDespachos}
        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
        {savingDespachos ? 'Guardando...' : 'Guardar'}
      </button>

      <div className="mt-6 pt-4 border-t border-zinc-800 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">API Transprensa</p>
          {transprensaTest !== 'idle' && <span className="text-base">{transprensaTest === 'ok' ? '🟢' : '🔴'}</span>}
          {transprensaConfigurado && (
            <button onClick={testTransprensa} disabled={testingTransprensa}
              className="ml-auto text-xs px-2 py-0.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50">
              {testingTransprensa ? '...' : 'Test'}
            </button>
          )}
        </div>
        {transprensaConfigurado && (
          <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/30 rounded-xl px-3 py-2">
            <span className="text-emerald-400 text-xs">✅ Configurado</span>
            <span className="text-zinc-400 text-xs ml-1">— {transprensaLogin}</span>
          </div>
        )}
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">NIT Remitente <span className="text-zinc-600">(match automático de guías)</span></label>
          <input value={transprensaNitRemitente} onChange={e => setTransprensaNitRemitente(e.target.value)}
            placeholder="NIT del remitente"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">Usuario</label>
          <input value={transprensaLogin} onChange={e => setTransprensaLogin(e.target.value)}
            placeholder="usuario_login"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-zinc-400 text-xs mb-1 block">Contraseña</label>
          <div className="relative">
            <input type={showTransprensaPass ? 'text' : 'password'} value={transprensaPassword}
              onChange={e => setTransprensaPassword(e.target.value)}
              placeholder={transprensaConfigurado ? '••••••••' : 'usuario_password'}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={() => setShowTransprensaPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs">
              {showTransprensaPass ? eyeOff : eyeOpen}
            </button>
          </div>
        </div>
        {msgTransprensa && <p className="text-sm text-emerald-400">{msgTransprensa}</p>}
        <button onClick={guardarTransprensa} disabled={savingTransprensa}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
          {savingTransprensa ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Seccion>
  )
}
