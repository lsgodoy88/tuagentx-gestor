import { notFound } from 'next/navigation'
import BiolinkCarpetas from './BiolinkCarpetas'
import BotonWhatsApp from './BotonWhatsApp'
import { getTema } from '@/lib/media/temas'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function BiolinkPage({ params }: PageProps) {
  const { slug } = await params

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/media/biolink/${slug}`, { cache: 'no-store' })
  if (!res.ok) notFound()

  const { config, carpetasFav, todasCarpetas } = await res.json()
  const tema = getTema(config.tema ?? 'oceano')

  return (
    <div className="min-h-screen text-white pb-24 relative overflow-hidden" style={{ background: tema.bg }}>
      {/* Blobs difuminados animados */}
      <style>{`
        @keyframes blob1{0%,100%{transform:translate(0,0)}33%{transform:translate(40px,30px)}66%{transform:translate(-20px,50px)}}
        @keyframes blob2{0%,100%{transform:translate(0,0)}33%{transform:translate(-50px,20px)}66%{transform:translate(30px,-40px)}}
        @keyframes blob3{0%,100%{transform:translate(0,0)}33%{transform:translate(30px,-30px)}66%{transform:translate(-40px,20px)}}
        @keyframes blob4{0%,100%{transform:translate(0,0)}50%{transform:translate(-35px,40px)}}
        @keyframes blob5{0%,100%{transform:translate(0,0)}50%{transform:translate(45px,-25px)}}
        @keyframes blob6{0%,100%{transform:translate(0,0)}50%{transform:translate(-25px,-45px)}}
        .blob-anim-0{animation:blob1 12s ease-in-out infinite}
        .blob-anim-1{animation:blob2 15s ease-in-out infinite}
        .blob-anim-2{animation:blob3 10s ease-in-out infinite}
        .blob-anim-3{animation:blob4 18s ease-in-out infinite}
        .blob-anim-4{animation:blob5 13s ease-in-out infinite}
        .blob-anim-5{animation:blob6 16s ease-in-out infinite}
      `}</style>
      {tema.blobs.map((b, i) => (
        <div key={i} className={`blob-anim-${i}`} style={{
          position: 'absolute', width: b.size, height: b.size,
          borderRadius: '50%', background: b.color, filter: 'blur(80px)',
          opacity: 0.45, top: b.top, bottom: b.bottom, left: b.left, right: b.right,
          pointerEvents: 'none', zIndex: 0,
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* TaX-Link badge esquina superior derecha */}
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '.05em' }}>TaX-Link🔥</span>
        </div>

        {/* Hero */}
        <div className="px-6 pt-3 pb-6 text-center flex flex-col items-center">
          {config.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logoUrl} alt={config.nombre} className="w-24 h-24 rounded-full object-cover border-2 mb-4"  style={{borderColor: tema.blobs[0].color}} />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#1e2a3d] flex items-center justify-center text-4xl mb-4">🏢</div>
          )}
          <h1 className="text-2xl font-bold text-white truncate w-full px-4">{config.nombre}</h1>
          {config.descripcion && (
            <p className="text-gray-300 mt-2 text-sm max-w-xs mx-auto truncate">{config.descripcion}</p>
          )}
        </div>

        {/* Carpetas archivador */}
        {carpetasFav.length > 0 && (
          <BiolinkCarpetas carpetasFav={carpetasFav} todasCarpetas={todasCarpetas} tema={tema} />
        )}

        {/* Portafolio PDF */}
        {config.portafolioUrl && (
          <div className="px-4 mb-6 max-w-xl mx-auto">
            <style>{`
              @keyframes pdfshine{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
              @keyframes pdfpulse{0%,100%{opacity:1}50%{opacity:.4}}
              .pdf-shine{overflow:hidden;position:relative}
              .pdf-shine::after{content:'';position:absolute;top:0;left:0;width:35%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent);animation:pdfshine 3s ease-in-out infinite}
            `}</style>
            <a href={config.portafolioUrl} target="_blank" rel="noopener noreferrer"
              className="pdf-shine flex items-center gap-3 rounded-2xl transition-colors"
              style={{background: tema.bg, border: `1px solid ${tema.blobs[0].color}`, padding:'10px 14px'}}>
              <div className="shrink-0 flex flex-col items-center justify-center gap-1 w-10 h-10 rounded-xl" style={{background:`${tema.blobs[0].color}33`, border:`1px solid ${tema.blobs[0].color}`}}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill={tema.blobs[1].color}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                </svg>
                <span className="text-xs font-bold" style={{color:tema.blobs[1].color,fontSize:8,letterSpacing:'.05em'}}>PDF</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Portafolio de productos</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" style={{animation:'pdfpulse 2s infinite'}}></div>
                  <span className="text-xs" style={{color:'#64748b'}}>Disponible ahora</span>
                </div>
              </div>
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{background:`${tema.blobs[0].color}22`, border:`1px solid ${tema.blobs[0].color}55`}}>
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill={tema.blobs[1].color}>
                  <path d="M12 16l-4-4h3V8h2v4h3l-4 4zm6 2H6v2h12v-2z"/>
                </svg>
              </div>
            </a>
          </div>
        )}

        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">Powered by TaX-Link🔥 · TuAgentX</p>
        </div>

        {config.whatsapp && <BotonWhatsApp numero={config.whatsapp} />}
      </div>
    </div>
  )
}
