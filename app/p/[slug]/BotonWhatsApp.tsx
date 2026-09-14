'use client'

const MENSAJE = encodeURIComponent('Hola👋🏻,Te ví en TaX-Link🔥 y estoy interesado en tus productos')

export default function BotonWhatsApp({ numero }: { numero: string }) {
  const numeroLimpio = numero.replace(/\D/g, "")
  const url = `https://wa.me/${numeroLimpio}?text=${MENSAJE}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-5 z-50 w-14 h-14 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-xl shadow-green-900/50 transition-transform hover:scale-110"
      aria-label="Contactar por WhatsApp"
    >
      <svg viewBox="0 0 32 32" className="w-8 h-8 fill-white">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 2.833.737 5.495 2.027 7.808L0 32l8.418-2.004A15.93 15.93 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.27 13.27 0 0 1-6.787-1.856l-.487-.29-4.997 1.19 1.257-4.862-.318-.5A13.271 13.271 0 0 1 2.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.293-9.907c-.4-.2-2.363-1.165-2.73-1.299-.366-.133-.633-.2-.9.2-.266.4-1.032 1.3-1.265 1.566-.233.267-.467.3-.867.1-.4-.2-1.688-.622-3.215-1.983-1.188-1.06-1.99-2.369-2.223-2.769-.233-.4-.025-.616.175-.815.18-.178.4-.467.6-.7.2-.233.267-.4.4-.667.133-.267.067-.5-.033-.7-.1-.2-.9-2.167-1.233-2.967-.325-.78-.655-.674-.9-.686l-.766-.013c-.267 0-.7.1-1.067.5-.366.4-1.4 1.367-1.4 3.333s1.433 3.867 1.633 4.133c.2.267 2.82 4.307 6.833 6.034 4.013 1.726 4.013 1.15 4.737 1.077.724-.073 2.333-.954 2.663-1.874.33-.92.33-1.707.233-1.873-.1-.167-.367-.267-.767-.467z"/>
      </svg>
    </a>
  )
}
