interface Props {
  size?: number
  className?: string
}

export default function RobotIcon({ size = 24, className = '' }: Props) {
  const s = size
  const scale = s / 24
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} robot-float`}>
      <style>{`
        @keyframes float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes wave {
          0%   { transform: rotate(0deg)   translateY(0px);   }
          15%  { transform: rotate(-30deg) translateY(-2px);  }
          30%  { transform: rotate(-50deg) translateY(-5px);  }
          45%  { transform: rotate(-30deg) translateY(-2px);  }
          60%  { transform: rotate(-50deg) translateY(-5px);  }
          75%  { transform: rotate(-20deg) translateY(-1px);  }
          100% { transform: rotate(0deg)   translateY(0px);   }
        }
        @keyframes antena {
          0%, 100% { opacity: 1;   r: 1;   }
          50%       { opacity: 0.5; r: 1.5; }
        }
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.1); }
        }
        .robot-arm-right { transform-origin: 17px 18px; animation: wave 2s ease-in-out infinite; }
        .robot-float { animation: float 3s ease-in-out infinite; }
        .robot-eye       { transform-origin: center; animation: blink 4s ease-in-out infinite; }
        .robot-antena    { animation: antena 1.5s ease-in-out infinite; }
      `}</style>

      {/* Antena */}
      <line x1="12" y1="2" x2="12" y2="5" stroke="#60a5fa" strokeWidth={1.5 / scale} strokeLinecap="round"/>
      <circle cx="12" cy="1.5" r={1 / scale} fill="#60a5fa" className="robot-antena"/>

      {/* Cabeza */}
      <rect x="4" y="5" width="16" height="11" rx="3" fill="#1e40af" stroke="#60a5fa" strokeWidth={1.2 / scale}/>

      {/* Ojos */}
      <g className="robot-eye"><circle cx="9"  cy="10" r="2" fill="#60a5fa"/><circle cx="9.7"  cy="9.3" r="0.7" fill="white"/></g>
      <g className="robot-eye"><circle cx="15" cy="10" r="2" fill="#60a5fa"/><circle cx="15.7" cy="9.3" r="0.7" fill="white"/></g>

      {/* Boca */}
      <rect x="8.5" y="13" width="7" height="1.2" rx="0.6" fill="#60a5fa"/>

      {/* Cuerpo */}
      <rect x="7" y="16" width="10" height="6" rx="2" fill="#1e40af" stroke="#60a5fa" strokeWidth={1.2 / scale}/>
      <circle cx="12" cy="19" r="1.2" fill="#60a5fa"/>

      {/* Brazo izquierdo — quieto */}
      <rect x="3" y="17" width="4" height="2.5" rx="1.2" fill="#1e40af" stroke="#60a5fa" strokeWidth={1 / scale}/>

      {/* Brazo derecho — saluda con entusiasmo */}
      <g className="robot-arm-right">
        <rect x="17" y="17" width="5" height="2.5" rx="1.2" fill="#1e40af" stroke="#60a5fa" strokeWidth={1 / scale}/>
      </g>
    </svg>
  )
}
