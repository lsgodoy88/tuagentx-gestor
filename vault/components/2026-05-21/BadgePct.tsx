'use client'

interface Props {
  pct: number | null
  size?: 'sm' | 'md'
}

export default function BadgePct({ pct, size = 'md' }: Props) {
  if (pct === null || pct === undefined) return null

  function color() {
    if ((pct as number) >= 80) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    if ((pct as number) >= 50) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    return 'bg-red-500/20 text-red-400 border border-red-500/30'
  }

  return (
    <span className={`font-bold rounded-full ${color()} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}>
      {pct}%
    </span>
  )
}
