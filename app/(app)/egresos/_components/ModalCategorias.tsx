'use client'
import React from 'react'
import type { Categoria } from '../_lib/tipos'

export function ModalCategorias({
  categorias, setCategorias, nuevaCat, setNuevaCat, onClose, setReloadKey,
}: {
  categorias: Categoria[]
  setCategorias: React.Dispatch<React.SetStateAction<Categoria[]>>
  nuevaCat: { label: string; emoji: string }
  setNuevaCat: React.Dispatch<React.SetStateAction<{ label: string; emoji: string }>>
  onClose: () => void
  setReloadKey: React.Dispatch<React.SetStateAction<number>>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{background:'rgba(0,0,0,0.6)'}} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md" style={{background:'#0f1623', border:'1px solid rgba(255,255,255,0.12)'}} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <p className="text-white font-bold" style={{fontSize:15}}>Categorías de egresos</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors" style={{fontSize:20,lineHeight:1,padding:'2px 6px'}}>✕</button>
        </div>
        {/* Lista */}
        <div className="px-4 py-3 space-y-2">
          {categorias.map((cat, idx) => (
            <div key={cat.id} className="flex items-center"
              style={{gap:'6px'}} draggable
              onDragStart={e => { e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', String(idx)) }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const from = parseInt(e.dataTransfer.getData('text/plain'))
                if (from === idx) return
                const next = [...categorias]
                const [moved] = next.splice(from, 1)
                next.splice(idx, 0, moved)
                setCategorias(next)
                fetch('/api/egresos/categorias', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({orden: next.map(c => c.id)})})
              }}
            >
              <span className="text-zinc-500 cursor-grab" style={{fontSize:14,userSelect:'none'}}>⠿</span>
              <input value={cat.emoji} onChange={e => setCategorias(prev => prev.map(c => c.id===cat.id ? {...c, emoji: e.target.value} : c))}
                style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',width:40,textAlign:'center',fontSize:16,padding:'4px'}} />
              <input value={cat.label} onChange={e => setCategorias(prev => prev.map(c => c.id===cat.id ? {...c, label: e.target.value} : c))}
                style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,minWidth:0,fontSize:14,padding:'6px 8px'}} />
              <button onClick={async () => {
                await fetch('/api/egresos/categorias', {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:cat.id, label:cat.label, emoji:cat.emoji})})
                setReloadKey(k => k+1)
              }} style={{background:'rgba(52,211,153,0.12)',border:'1px solid rgba(52,211,153,0.30)',borderRadius:8,color:'#34d399',fontSize:15,padding:'5px 10px',fontWeight:700,cursor:'pointer'}}>✓</button>
              <button onClick={async () => {
                const r = await fetch('/api/egresos/categorias', {method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id:cat.id})})
                const d = await r.json()
                if (d.error) alert(d.error)
                else { setReloadKey(k => k+1); onClose() }
              }} style={{background:'rgba(248,113,113,0.10)',border:'1px solid rgba(248,113,113,0.30)',borderRadius:8,color:'#f87171',fontSize:15,padding:'5px 10px',cursor:'pointer'}}>✕</button>
            </div>
          ))}
        </div>
        {/* Nueva categoría */}
        <div className="flex items-center gap-2 px-4 pb-4" style={{borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:12}}>
          <input value={nuevaCat.emoji} onChange={e => setNuevaCat(p => ({...p, emoji: e.target.value}))}
            style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',width:40,textAlign:'center',fontSize:16,padding:'4px'}} />
          <input value={nuevaCat.label} onChange={e => setNuevaCat(p => ({...p, label: e.target.value}))}
            placeholder="Nueva categoría..." style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:6,color:'white',flex:1,minWidth:0,fontSize:14,padding:'6px 8px'}} />
          <button onClick={async () => {
            if (!nuevaCat.label.trim()) return
            await fetch('/api/egresos/categorias', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(nuevaCat)})
            setNuevaCat({ label: '', emoji: '📋' })
            setReloadKey(k => k+1)
          }} style={{background:'rgba(52,211,153,0.12)',border:'1px solid rgba(52,211,153,0.30)',borderRadius:8,color:'#34d399',fontSize:18,padding:'5px 12px',fontWeight:700,cursor:'pointer'}}>+</button>
        </div>
      </div>
    </div>
  )
}
