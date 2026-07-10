export default function LoadingStock() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto px-2 pt-2 md:px-4 md:pt-4 animate-pulse">
      {/* Header */}
      <div className="flex gap-2 items-center">
        <div className="h-9 w-48 bg-white/5 rounded-xl"/>
        <div className="h-9 flex-1 bg-white/5 rounded-xl"/>
        <div className="h-9 w-24 bg-white/5 rounded-xl"/>
      </div>
      {/* Filtros */}
      <div className="flex gap-2">
        <div className="h-9 flex-1 bg-white/5 rounded-xl"/>
        <div className="h-9 flex-1 bg-white/5 rounded-xl"/>
      </div>
      {/* Tabla agotados */}
      <div className="rounded-xl border border-red-500/20 overflow-hidden">
        <div className="h-10 bg-red-900/20"/>
        {[...Array(3)].map((_,i) => <div key={i} className="h-10 border-t border-white/5 bg-white/2"/>)}
      </div>
      {/* Tabla stock bajo */}
      <div className="rounded-xl border border-orange-500/20 overflow-hidden">
        <div className="h-10 bg-orange-900/20"/>
        {[...Array(3)].map((_,i) => <div key={i} className="h-10 border-t border-white/5 bg-white/2"/>)}
      </div>
      {/* Tabla principal */}
      <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
        <div className="h-10 bg-emerald-900/10"/>
        <div className="h-10 bg-white/5"/>
        {[...Array(8)].map((_,i) => <div key={i} className="h-10 border-t border-white/5"/>)}
      </div>
    </div>
  )
}
