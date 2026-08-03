'use client'
import { useState, useEffect } from 'react'
import { PERMISOS_CATALOGO } from '@/lib/permisos'

interface Props {
  nombreEmpleado: string
  permisosIniciales: Record<string, boolean>
  onGuardar: (permisos: Record<string, boolean>) => void
  onCerrar: () => void
}

export default function PopupPermisos({ nombreEmpleado, permisosIniciales, onGuardar, onCerrar }: Props) {
  const [permisos, setPermisos] = useState<Record<string, boolean>>({ ...permisosIniciales })

  useEffect(() => {
    setPermisos({ ...permisosIniciales })
  }, [permisosIniciales])

  function toggle(key: string, requiere?: string) {
    setPermisos(prev => {
      const next = { ...prev, [key]: !prev[key] }
      // Encadenados: al activar acción → activar su módulo padre
      if (next[key] && requiere) next[requiere] = true
      // Al desactivar módulo → desactivar acciones dependientes
      if (!next[key]) {
        PERMISOS_CATALOGO.forEach(g =>
          g.items.forEach((item: any) => {
            if (item.requiere === key) next[item.key] = false
          })
        )
      }
      return next
    })
  }

  const todosMenu = PERMISOS_CATALOGO[0].items.every(i => permisos[i.key])
  const todosAcciones = PERMISOS_CATALOGO[1].items.every(i => permisos[i.key])

  function toggleGrupo(grupo: typeof PERMISOS_CATALOGO[0], valor: boolean) {
    setPermisos(prev => {
      const next = { ...prev }
      grupo.items.forEach((i: any) => { next[i.key] = valor })
      // Si desactivamos acciones que dependen de menú desactivado, consistencia
      if (!valor) {
        PERMISOS_CATALOGO[1].items.forEach((i: any) => {
          if (i.requiere && !next[i.requiere]) next[i.key] = false
        })
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[88vh]"
        style={{ background: '#0a0f28', border: '1px solid rgba(139,92,246,0.30)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(139,92,246,0.20)' }}>
          <div>
            <p className="text-white font-bold text-sm">🔐 Permisos</p>
            <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[200px]">{nombreEmpleado}</p>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Grupos */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">
          {PERMISOS_CATALOGO.map((grupo, gi) => {
            const todosOn = grupo.items.every((i: any) => permisos[i.key])
            return (
              <div key={gi}>
                {/* Encabezado grupo */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white text-xs font-bold uppercase tracking-widest">{grupo.grupo}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{grupo.descripcion}</p>
                  </div>
                  {/* Toggle todos del grupo */}
                  <button
                    type="button"
                    onClick={() => toggleGrupo(grupo, !todosOn)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${todosOn ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                    {todosOn ? 'Quitar todos' : 'Todos'}
                  </button>
                </div>

                {/* Items */}
                <div className="space-y-1.5">
                  {grupo.items.map((item: any) => {
                    const on = !!permisos[item.key]
                    const padreOff = item.requiere && !permisos[item.requiere]
                    return (
                      <div
                        key={item.key}
                        onClick={() => !padreOff && toggle(item.key, item.requiere)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer select-none ${padreOff ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/5'}`}
                        style={{ background: on ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(139,92,246,0.30)' : 'rgba(255,255,255,0.06)'}` }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-base w-5 text-center">{item.icon}</span>
                          <span className="text-sm text-white">{item.label}</span>
                          {item.requiere && (
                            <span className="text-[9px] text-zinc-600 font-mono">requiere {item.requiere.replace('ver','')}</span>
                          )}
                        </div>
                        {/* Toggle visual */}
                        <div className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${on ? 'bg-violet-500' : 'bg-zinc-700'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: 'rgba(139,92,246,0.20)' }}>
          <button onClick={onCerrar}
            className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancelar
          </button>
          <button
            onClick={() => onGuardar(permisos)}

            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', border: '1px solid rgba(139,92,246,0.50)' }}>
            💾 Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
