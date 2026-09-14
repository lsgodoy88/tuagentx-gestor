'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { TEMAS, type TemaId } from '@/lib/media/temas'

interface Config {
  nombre: string
  descripcion: string
  logoUrl: string | null
  whatsapp: string | null
  portafolioUrl: string | null
  portafolioNombre: string | null
  publicToken: string
}

interface Carpeta {
  id: string
  nombre: string
  favorita: boolean
  primeraImagen: string | null
  total: number
}

interface Archivo {
  id: string
  nombre: string
  url: string
  tipo: string
  orden: number
  tamano_byte: number
}

type Vista = 'home' | 'carpeta'

export default function MediaPage() {
  const { data: session } = useSession()
  const esAdmin = (session?.user as any)?.role === 'empresa'
  const empresaNombre: string = (session?.user as any)?.empresaNombre ?? session?.user?.name ?? ''
  const slug = empresaNombre.toLowerCase().replace(/[^a-z0-9]/g, '')

  const [vista, setVista] = useState<Vista>('home')
  const [modalParams, setModalParams] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const [cargandoConfig, setCargandoConfig] = useState(true)
  const [carpetas, setCarpetas] = useState<Carpeta[]>([])
  const [carpetaActiva, setCarpetaActiva] = useState<Carpeta | null>(null)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [compartido, setCompartido] = useState(false)
  const [toastGuardado, setToastGuardado] = useState(false)
  const [modalNueva, setModalNueva] = useState(false)
  const [modalRenombrar, setModalRenombrar] = useState<Carpeta | null>(null)
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formNombreEdit, setFormNombreEdit] = useState('')

  // Parámetros form
  const [fNombre, setFNombre] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fWa, setFWa] = useState('')
  const [fTema, setFTema] = useState<TemaId>('oceano')

  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const portafolioRef = useRef<HTMLInputElement>(null)
  const tapRef = useRef(false)

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    const [resConfig, resCarpetas] = await Promise.all([
      fetch('/api/media/config'),
      fetch('/api/media/carpetas'),
    ])
    if (resConfig.ok) {
      const c = await resConfig.json()
      setConfig(c)
      if (c) {
        setFNombre(c.nombre ?? '')
        setFDesc(c.descripcion ?? '')
        const wa = c.whatsapp ?? ''
        setFWa(wa.replace(/^57/, ''))
        setFTema((c.tema ?? 'oceano') as TemaId)
      }
    }
    if (resCarpetas.ok) setCarpetas(await resCarpetas.json())
    setCargandoConfig(false)
  }

  async function abrirCarpeta(c: Carpeta) {
    setCarpetaActiva(c)
    setVista('carpeta')
    const res = await fetch(`/api/media/archivos?carpetaId=${c.id}`)
    if (res.ok) setArchivos(await res.json())
  }

  async function crearCarpeta() {
    if (!formNombre.trim() || tapRef.current) return
    tapRef.current = true
    const res = await fetch('/api/media/carpetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: formNombre }),
    })
    tapRef.current = false
    if (res.ok) { setModalNueva(false); setFormNombre(''); cargarTodo() }
  }

  async function renombrarCarpeta() {
    if (!modalRenombrar || !formNombreEdit.trim()) return
    await fetch(`/api/media/carpetas/${modalRenombrar.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: formNombreEdit }),
    })
    setModalRenombrar(null)
    cargarTodo()
  }

  async function toggleFavorita(c: Carpeta) {
    const res = await fetch(`/api/media/carpetas/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorita: !c.favorita }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.error ?? 'Error')
      return
    }
    cargarTodo()
  }

  async function eliminarCarpeta(id: string) {
    if (!confirm('¿Eliminar carpeta y todos sus archivos?')) return
    await fetch(`/api/media/carpetas/${id}`, { method: 'DELETE' })
    cargarTodo()
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !carpetaActiva || subiendo) return
    setSubiendo(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const res = await fetch('/api/media/archivos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carpetaId: carpetaActiva.id, nombre: file.name, base64: reader.result }),
      })
      setSubiendo(false)
      if (res.ok) abrirCarpeta(carpetaActiva)
      else { const err = await res.json(); alert(err.error ?? 'Error al subir') }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function eliminarArchivo(id: string) {
    if (!confirm('¿Eliminar archivo?')) return
    await fetch(`/api/media/archivos/${id}`, { method: 'DELETE' })
    if (carpetaActiva) abrirCarpeta(carpetaActiva)
  }

  async function subirAsset(e: React.ChangeEvent<HTMLInputElement>, tipo: 'logo' | 'portafolio') {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const res = await fetch('/api/media/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nombre: file.name, base64: reader.result }),
      })
      if (res.ok) cargarTodo()
      else alert('Error al subir')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function guardarParametros() {
    if (guardando) return
    setGuardando(true)
    const esPrimera = !config
    await fetch('/api/media/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: fNombre, descripcion: fDesc, whatsapp: fWa ? '57' + fWa.replace(/^\+?57/, '') : '', tema: fTema }),
    })
    setGuardando(false)
    await cargarTodo()
    if (esPrimera) {
      // Primera vez — no cerrar modal, mostrar logo/portafolio recién habilitados
    } else {
      setModalParams(false)
    }
    setToastGuardado(true)
    setTimeout(() => setToastGuardado(false), 2500)
  }

  async function compartirBiolink() {
    if (!config) return
    const url = `${window.location.origin}/p/${slug}`
    const texto = `Hola 👋 mira mi publicidad, te va a encantar🔥: ${url}`
    if (navigator.share) {
      await navigator.share({ title: config.nombre || 'TaX-Link🔥', text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      setCompartido(true)
      setTimeout(() => setCompartido(false), 2000)
    }
  }

  function formatBytes(b: number) {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  // ── VISTA: DETALLE CARPETA ──
  if (vista === 'carpeta' && carpetaActiva) {
    const imagenes = archivos.filter(a => a.tipo === 'imagen')
    return (
      <div className="max-w-5xl mx-auto pt-3">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setVista('home'); setCarpetaActiva(null); setArchivos([]) }} className="text-gray-400 hover:text-white text-sm">← Volver</button>
          <h2 className="text-white font-semibold flex-1 truncate">{carpetaActiva.nombre}</h2>
          {esAdmin && (
            <button
              onClick={() => config && fileRef.current?.click()}
              disabled={subiendo}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg shrink-0"
            >{subiendo ? 'Subiendo...' : '+ Imagen'}</button>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subirArchivo} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {imagenes.map(a => (
            <div key={a.id} className="relative rounded-xl border border-[#1e2a3d] overflow-hidden">
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.nombre} className="w-full h-36 object-cover" />
              </a>
              {esAdmin && (
                <div className="p-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{formatBytes(a.tamano_byte)}</span>
                  <button onClick={() => eliminarArchivo(a.id)} className="text-red-400 text-xs">🗑</button>
                </div>
              )}
            </div>
          ))}
          {imagenes.length === 0 && <p className="col-span-3 text-gray-500 text-sm">Sin imágenes aún.</p>}
        </div>
      </div>
    )
  }

  // ── VISTA: HOME ──
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h1 className="text-white font-bold text-lg">TaX-Link🔥 <span className="text-gray-400 font-normal text-sm">· Material publicitario</span></h1>

      </div>

      {/* Preview config — siempre visible para admins */}
      {esAdmin && (
        <div className="rounded-xl p-4 mb-4 flex items-center gap-3" style={{background:"#09091f",border:"1px solid #27272a"}}>
          {cargandoConfig ? (
            <div className="w-full flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#1e2a3d] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-[#1e2a3d] rounded animate-pulse w-32" />
                <div className="h-2 bg-[#1e2a3d] rounded animate-pulse w-20" />
              </div>
              <div className="w-24 h-8 bg-[#1e2a3d] rounded-lg animate-pulse shrink-0" />
            </div>
          ) : (<>
          {config
            ? (config.logoUrl
                ? <img src={config.logoUrl} alt="logo" className="w-12 h-12 rounded-full object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-full bg-[#1e2a3d] flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">LOGO</div>
              )
            : <div className="w-12 h-12 rounded-full bg-[#1e2a3d] border-2 border-dashed border-zinc-600 flex items-center justify-center text-zinc-500 text-[10px] font-bold shrink-0">LOGO</div>
          }
          <div className="min-w-0 flex-1">
            {config
              ? <>
                  <p className="text-white font-semibold truncate">{config.nombre || empresaNombre}</p>
                  {config.whatsapp && <p className="text-green-400 text-xs mt-0.5 flex items-center gap-1"><svg viewBox="0 0 32 32" className="w-3.5 h-3.5 fill-green-400"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.833.737 5.495 2.027 7.808L0 32l8.418-2.004A15.93 15.93 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.27 13.27 0 0 1-6.787-1.856l-.487-.29-4.997 1.19 1.257-4.862-.318-.5A13.271 13.271 0 0 1 2.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.293-9.907c-.4-.2-2.363-1.165-2.73-1.299-.366-.133-.633-.2-.9.2-.266.4-1.032 1.3-1.265 1.566-.233.267-.467.3-.867.1-.4-.2-1.688-.622-3.215-1.983-1.188-1.06-1.99-2.369-2.223-2.769-.233-.4-.025-.616.175-.815.18-.178.4-.467.6-.7.2-.233.267-.4.4-.667.133-.267.067-.5-.033-.7-.1-.2-.9-2.167-1.233-2.967-.325-.78-.655-.674-.9-.686l-.766-.013c-.267 0-.7.1-1.067.5-.366.4-1.4 1.367-1.4 3.333s1.433 3.867 1.633 4.133c.2.267 2.82 4.307 6.833 6.034 4.013 1.726 4.013 1.15 4.737 1.077.724-.073 2.333-.954 2.663-1.874.33-.92.33-1.707.233-1.873-.1-.167-.367-.267-.767-.467z"/></svg> {config.whatsapp}</p>}
                </>
              : <p className="text-zinc-500 text-sm">TaX-Link no configurado aún</p>
            }
          </div>
          <div className="flex flex-col gap-1.5 shrink-0 justify-center">
            {config
              ? <>
                  <button
                    onClick={compartirBiolink}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white whitespace-nowrap"
                  >
                    {compartido ? '✓ Copiado' : 'Compartir🔥'}
                  </button>
                  <button
                    onClick={() => setModalParams(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1e2a3d] hover:bg-[#243352] text-white whitespace-nowrap"
                  >
                    Detalles⚙️
                  </button>
                </>
              : <button
                  onClick={() => setModalParams(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white whitespace-nowrap"
                >
                  Activar TaX-Link⚙️
                </button>
            }
          </div>
        </>)}
        </div>
      )}

      {/* Carpetas */}
      <div className="rounded-2xl p-4 mb-4" style={{background:"#0d1117",border:"1px solid #1e2a3d"}}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold">🗂️ Carpetas de imágenes</p>
          {esAdmin && config && (
            <button onClick={() => setModalNueva(true)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg">
              + Nueva
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {carpetas.map(c => (
            <div key={c.id} className="flex flex-col">
              <div
                onClick={() => abrirCarpeta(c)}
                className="cursor-pointer rounded-xl p-3 transition-colors"
                style={{background:"#161b27",border:c.favorita?"1px solid #facc15":"1px solid #27272a",borderBottomLeftRadius:menuAbierto===c.id?0:undefined,borderBottomRightRadius:menuAbierto===c.id?0:undefined}}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate text-sm">🖼️ {c.nombre}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{c.total} imagen{c.total !== 1 ? 'es' : ''}</p>
                  </div>
                  {esAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); setMenuAbierto(menuAbierto===c.id ? null : c.id) }}
                      className="text-gray-500 hover:text-white text-lg leading-none px-1 shrink-0"
                    >···</button>
                  )}
                </div>
              </div>
              {esAdmin && menuAbierto === c.id && (
                <div
                  className="flex items-center justify-around py-2 px-2 gap-1"
                  style={{background:'#111827',border:'1px solid #27272a',borderTop:'none',borderRadius:'0 0 10px 10px'}}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => { toggleFavorita(c); setMenuAbierto(null) }}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg flex-1 justify-center"
                    style={{color:c.favorita?'#facc15':'#9ca3af',background:c.favorita?'#1c1a05':'#1e2a3d',border:'1px solid #1e2a3d'}}
                  >Favoritos ⭐</button>
                  <button
                    onClick={() => { setModalRenombrar(c); setFormNombreEdit(c.nombre); setMenuAbierto(null) }}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg flex-1 justify-center text-gray-300"
                    style={{background:'#1e2a3d'}}
                  >Editar ✏️</button>
                  <button
                    onClick={() => { eliminarCarpeta(c.id); setMenuAbierto(null) }}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg flex-1 justify-center text-red-400"
                    style={{background:'#1e2a3d'}}
                  >Eliminar ❌</button>
                </div>
              )}
            </div>
          ))}
          {carpetas.length === 0 && (
            <p className="text-gray-500 text-sm col-span-2">
              {esAdmin ? 'Crea tu primera carpeta de imágenes.' : 'Sin material disponible aún.'}
            </p>
          )}
        </div>
      </div>


      {/* Modal nueva carpeta */}
      {modalNueva && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1220] border border-[#1e2a3d] rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-semibold mb-4">Nueva carpeta</h2>
            <input
              className="w-full bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm mb-4 outline-none focus:border-blue-500"
              placeholder="Nombre de la carpeta"
              value={formNombre}
              onChange={e => setFormNombre(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setModalNueva(false)} className="flex-1 border border-[#1e2a3d] text-gray-400 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={crearCarpeta} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal renombrar */}
      {modalRenombrar && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1220] border border-[#1e2a3d] rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-semibold mb-4">Renombrar carpeta</h2>
            <input
              className="w-full bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm mb-4 outline-none focus:border-blue-500"
              value={formNombreEdit}
              onChange={e => setFormNombreEdit(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setModalRenombrar(null)} className="flex-1 border border-[#1e2a3d] text-gray-400 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={renombrarCarpeta} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Parámetros TaX-Link */}
      {modalParams && esAdmin && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-2" style={{background:'rgba(10,15,28,0.92)'}}>
          <div style={{width:'100%', maxWidth:480}}>
            <div className="rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" style={{background:'#0f172a', border:'1px solid rgba(59,130,246,0.50)'}}>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b" style={{borderColor:'rgba(59,130,246,0.30)'}}>
                <p className="text-white font-semibold text-sm">⚙️ Parámetros TaX-Link🔥</p>
                <button onClick={() => setModalParams(false)} className="text-zinc-400 hover:text-white text-xl ml-3">×</button>
              </div>

              {/* Body scroll */}
              <div className="px-4 overflow-y-auto overscroll-contain flex-1 py-4 space-y-4">

                {/* Logo */}
                <div>
                  <p className="text-white text-xs uppercase tracking-wide mb-2">Logo circular</p>
                  <div className="flex items-center gap-4">
                    {config?.logoUrl
                      ? <img src={config.logoUrl} alt="logo" className="w-14 h-14 rounded-full object-cover border-2 border-blue-500 shrink-0" />
                      : <div className="w-14 h-14 rounded-full bg-[#1e2a3d] flex items-center justify-center text-gray-500 text-xl shrink-0">🏢</div>
                    }
                    <button
                      onClick={() => config && logoRef.current?.click()}
                      disabled={!config}
                      className="text-sm text-white px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{border: config ? '1.5px solid #22c55e' : '1.5px solid #ef4444'}}
                    >
                      {config?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                    </button>
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => subirAsset(e, 'logo')} disabled={!config} />
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="text-white text-xs uppercase tracking-wide block mb-1">Nombre del biolink</label>
                  <input
                    className="w-full bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                    placeholder="TuNegocio🔥"
                    value={fNombre}
                    onChange={e => setFNombre(e.target.value)}
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-white text-xs uppercase tracking-wide block mb-1">Descripción (con emojis 😎)</label>
                  <textarea
                    rows={3}
                    className="w-full bg-[#0d1220] border border-[#1e2a3d] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 resize-none"
                    placeholder="Ej: 🛒 Productos | 🚚 Entregas | 💥 Ofertas"
                    value={fDesc}
                    onChange={e => setFDesc(e.target.value)}
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="text-white text-xs uppercase tracking-wide block mb-1">WhatsApp</label>
                  <div className="flex items-center rounded-lg overflow-hidden" style={{border:"1px solid #1e2a3d",background:"#0d1220"}}>
                    <span className="px-3 py-2 text-white text-sm border-r shrink-0" style={{borderColor:"#1e2a3d"}}>+57</span>
                    <input
                      className="flex-1 bg-transparent px-3 py-2 text-white text-sm outline-none"
                      placeholder="3001234567"
                      value={fWa}
                      onChange={e => setFWa(e.target.value.replace(/\D/g, ''))}
                      maxLength={10}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                {/* Tema de color */}
                <div>
                  <p className="text-white text-xs uppercase tracking-wide mb-2">Tema de color</p>
                  <div className="grid grid-cols-5 gap-2">
                    {TEMAS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setFTema(t.id as TemaId)}
                        className="flex flex-col items-center gap-1"
                      >
                        <div
                          className="w-full h-10 rounded-lg relative overflow-hidden"
                          style={{
                            background: t.bg,
                            border: fTema === t.id ? '2px solid #60a5fa' : '1px solid #1e2a3d',
                          }}
                        >
                          {t.blobs.slice(0,2).map((b,i) => (
                            <div key={i} style={{
                              position:'absolute',
                              width: b.size * 0.3,
                              height: b.size * 0.3,
                              borderRadius:'50%',
                              background: b.color,
                              filter:'blur(8px)',
                              opacity:0.7,
                              top: b.top ? '-10px' : undefined,
                              bottom: b.bottom ? '-5px' : undefined,
                              left: b.left ? '-5px' : undefined,
                              right: b.right ? '-5px' : undefined,
                            }} />
                          ))}
                        </div>
                        <span className="text-xs" style={{color: fTema===t.id ? '#60a5fa':'#6b7280'}}>{t.emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Portafolio PDF */}
                <div>
                  <p className="text-white text-xs uppercase tracking-wide mb-2">Portafolio PDF (uno solo)</p>
                  {config?.portafolioUrl ? (
                    <div className="flex items-center gap-3 bg-[#0d1220] border border-[#1e2a3d] rounded-xl p-3">
                      <span className="text-2xl">📄</span>
                      <span className="text-white text-sm flex-1 truncate">{config.portafolioNombre}</span>
                      <button onClick={() => portafolioRef.current?.click()} className="text-blue-400 text-xs shrink-0">Cambiar</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => config && portafolioRef.current?.click()}
                      disabled={!config}
                      className="w-full text-white text-sm py-4 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{border: config ? '1.5px solid #22c55e' : '1.5px solid #ef4444'}}
                    >
                      📄 Subir portafolio PDF
                    </button>
                  )}
                  <input ref={portafolioRef} type="file" accept="application/pdf" className="hidden" onChange={e => subirAsset(e, 'portafolio')} disabled={!config} />
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t" style={{borderColor:'rgba(59,130,246,0.20)'}}>
                <button
                  onClick={guardarParametros}
                  disabled={guardando}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm"
                >
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toast guardado */}
      {toastGuardado && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-green-700 text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          ✅ Parámetros guardados
        </div>
      )}

    </div>
  )
}
