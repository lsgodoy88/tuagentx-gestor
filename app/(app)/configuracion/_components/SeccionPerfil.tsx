'use client'
import { useState } from 'react'
import { Seccion } from './Seccion'
import { eyeOpen, eyeOff } from '../_lib/icons'
import { inputClass, labelClass } from '../_lib/utils'

interface Props {
  isOpen: boolean
  onToggle: () => void
  email: string
  role: string
}

export function SeccionPerfil({ isOpen, onToggle, email, role }: Props) {
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)

  async function cambiarPassword() {
    if (newPass !== newPass2) { setMsg('Las contraseñas no coinciden'); return }
    if (newPass.length < 6) { setMsg('Mínimo 6 caracteres'); return }
    setSaving(true)
    const res = await fetch('/api/configuracion/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPass }),
    })
    setSaving(false)
    if (res.ok) { setMsg('✅ Contraseña actualizada'); setNewPass(''); setNewPass2('') }
    else setMsg('Error al actualizar')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <Seccion titulo="Mi perfil" icono="👤" isOpen={isOpen} onToggle={onToggle}>
      <div className="rounded-xl px-4 py-3 space-y-0.5" style={{ background: '#1e2030', border: '1px solid rgba(59,130,246,0.20)' }}>
        <p className="text-zinc-400 text-xs">Email</p>
        <p className="text-white text-sm font-mono">{email}</p>
        <p className="text-zinc-500 text-xs capitalize">{role}</p>
      </div>
      <div className="space-y-3 pt-2">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Cambiar contraseña</p>
        <div>
          <label className={labelClass}>Nueva contraseña</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{showPass ? eyeOff : eyeOpen}</button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Confirmar contraseña</label>
          <div className="relative">
            <input type={showPass2 ? 'text' : 'password'} value={newPass2} onChange={e => setNewPass2(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} />
            <button type="button" tabIndex={-1} onClick={() => setShowPass2(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{showPass2 ? eyeOff : eyeOpen}</button>
          </div>
        </div>
        {msg && <p className="text-sm text-emerald-400">{msg}</p>}
        <button onClick={cambiarPassword} disabled={saving || !newPass}
          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
          {saving ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </div>
    </Seccion>
  )
}
