interface Props {
  size?: number
  className?: string
}

export default function RobotIcon({ size = 24, className = '' }: Props) {
  const s = size
  const scale = s / 24
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Antena */}
      <line x1="12" y1="2" x2="12" y2="5" stroke="#60a5fa" strokeWidth={1.5 / scale} strokeLinecap="round"/>
      <circle cx="12" cy="1.5" r={1 / scale} fill="#60a5fa"/>
      {/* Cabeza */}
      <rect x="4" y="5" width="16" height="11" rx="3" fill="#1e3a6e" stroke="#3b82f6" strokeWidth={1.2 / scale}/>
      {/* Ojos */}
      <circle cx="9" cy="10" r="2" fill="#60a5fa"/>
      <circle cx="15" cy="10" r="2" fill="#60a5fa"/>
      <circle cx="9.7" cy="9.3" r="0.7" fill="white"/>
      <circle cx="15.7" cy="9.3" r="0.7" fill="white"/>
      {/* Boca */}
      <rect x="8.5" y="13" width="7" height="1.2" rx="0.6" fill="#60a5fa"/>
      {/* Cuerpo */}
      <rect x="7" y="16" width="10" height="6" rx="2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth={1.2 / scale}/>
      {/* Botón cuerpo */}
      <circle cx="12" cy="19" r="1.2" fill="#60a5fa"/>
      {/* Brazos */}
      <rect x="3" y="17" width="4" height="2.5" rx="1.2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth={1 / scale}/>
      <rect x="17" y="17" width="4" height="2.5" rx="1.2" fill="#1e3a6e" stroke="#3b82f6" strokeWidth={1 / scale}/>
    </svg>
  )
}
