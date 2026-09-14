'use client'
import { useState } from 'react'
import Carrusel from './Carrusel'
import type { Tema } from '@/lib/media/temas'

interface Imagen {
  id: string
  nombre: string
  url: string
  orden: number
}

interface Carpeta {
  id: string
  nombre: string
  imagenes: Imagen[]
}

interface CarpetaFav {
  id: string
  nombre: string
  primeraImagen: string
}

interface Props {
  carpetasFav: CarpetaFav[]
  todasCarpetas: Carpeta[]
  tema: Tema
}

export default function BiolinkCarpetas({ carpetasFav, todasCarpetas, tema }: Props) {
  const [activa, setActiva] = useState(0)
  const [popupAbierto, setPopupAbierto] = useState(false)
  const [carpetaPopup, setCarpetaPopup] = useState<Carpeta | null>(null)

  // Color primario del tema (primer blob)
  const colorPrimario = tema.blobs[0].color
  const colorSecundario = tema.blobs[1].color

  function abrirPopup() { setPopupAbierto(true); setCarpetaPopup(null) }
  function cerrarPopup() { setPopupAbierto(false); setCarpetaPopup(null) }

  return (
    <div className="px-4 max-w-xl mx-auto mb-6">

      {/* ── Popup flotante ── */}
      {popupAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={cerrarPopup}
        >
          <div
            className="w-full max-w-lg rounded-b-3xl flex flex-col overflow-hidden"
            style={{
              background: tema.bg,
              border: `1px solid ${colorPrimario}44`,
              height: '90vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Blobs mini dentro del popup */}
            <div style={{position:'absolute',top:0,left:0,right:0,height:120,overflow:'hidden',pointerEvents:'none',zIndex:0,borderRadius:'0 0 24px 24px'}}>
              {tema.blobs.slice(0,3).map((b,i) => (
                <div key={i} style={{
                  position:'absolute',
                  width: b.size * 0.4,
                  height: b.size * 0.4,
                  borderRadius:'50%',
                  background: b.color,
                  filter:'blur(30px)',
                  opacity: 0.4,
                  top: b.top ? '-20px' : undefined,
                  bottom: b.bottom ? '-10px' : undefined,
                  left: b.left ? '-10px' : undefined,
                  right: b.right ? '-10px' : undefined,
                }} />
              ))}
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3 border-b shrink-0"
              style={{ borderColor: `${colorPrimario}33`, position:'relative', zIndex:1 }}
            >
              {carpetaPopup ? (
                <button
                  onClick={() => setCarpetaPopup(null)}
                  className="text-sm flex items-center gap-1 font-medium"
                  style={{ color: colorSecundario }}
                >
                  ← <span>{carpetaPopup.nombre}</span>
                </button>
              ) : (
                <p className="text-white font-semibold text-sm">📂 Material publicitario</p>
              )}
              <button
                onClick={cerrarPopup}
                className="text-2xl leading-none ml-3"
                style={{ color: colorSecundario }}
              >×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1" style={{position:'relative',zIndex:1}}>
              {carpetaPopup ? (
                <div className="p-4">
                  <Carrusel imagenes={carpetaPopup.imagenes} />
                  {carpetaPopup.imagenes.length > 1 && (
                    <div className="grid grid-cols-4 gap-1.5 mt-4">
                      {carpetaPopup.imagenes.map(img => (
                        <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="rounded-lg overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.nombre} className="w-full h-20 object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4">
                  {todasCarpetas.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCarpetaPopup(c)}
                      className="rounded-xl overflow-hidden text-left"
                      style={{ border: `1px solid ${colorPrimario}44` }}
                    >
                      {c.imagenes[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imagenes[0].url} alt={c.nombre} className="w-full h-28 object-cover" />
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center" style={{ background: `${colorPrimario}22` }}>
                          <span className="text-3xl">🖼️</span>
                        </div>
                      )}
                      <div className="px-3 py-2" style={{ background: `${colorPrimario}18` }}>
                        <p className="text-white text-xs font-semibold truncate">{c.nombre}</p>
                        <p className="text-xs mt-0.5" style={{ color: colorSecundario }}>{c.imagenes.length} imagen{c.imagenes.length !== 1 ? 'es' : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Outline buttons con tema ── */}
      <div className="flex gap-2 mb-2">
        {carpetasFav.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActiva(i)}
            className="flex-1 text-xs font-bold py-2.5 rounded-xl transition-colors truncate"
            style={{
              background: activa === i ? `${colorPrimario}18` : 'transparent',
              color: '#ffffff',
              border: activa === i ? `1.5px solid ${colorPrimario}` : `1px solid ${colorPrimario}33`,
            }}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {/* ── Imagen activa ── */}
      <button
        onClick={abrirPopup}
        className="w-full relative overflow-hidden rounded-xl"
        style={{
          height: 315,
          border: `1px solid ${colorPrimario}55`,
          display: 'block',
          background: `${colorPrimario}11`,
        }}
      >
        {carpetasFav[activa]?.primeraImagen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={carpetasFav[activa].primeraImagen}
            alt={carpetasFav[activa].nombre}
            className="w-full h-full object-cover"
          />
        )}

      </button>
    </div>
  )
}
