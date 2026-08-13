export default function IconBarcode({ className = "w-4 h-4 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="1" y="4" width="2" height="16"/><rect x="4" y="4" width="1" height="16"/>
      <rect x="6" y="4" width="2" height="16"/><rect x="9" y="4" width="1" height="16"/>
      <rect x="11" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/>
      <rect x="17" y="4" width="2" height="16"/><rect x="20" y="4" width="1" height="16"/>
      <rect x="22" y="4" width="1" height="16"/>
    </svg>
  )
}
