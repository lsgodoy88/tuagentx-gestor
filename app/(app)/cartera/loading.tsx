export default function LoadingCartera() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto px-2 pt-2 md:px-4 md:pt-4 animate-pulse">
      <div className="flex gap-2">
        <div className="h-9 flex-1 bg-white/5 rounded-xl"/>
        <div className="h-9 w-32 bg-white/5 rounded-xl"/>
      </div>
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="h-12 bg-white/5"/>
        {[...Array(8)].map((_,i) => <div key={i} className="h-20 border-t border-white/5"/>)}
      </div>
    </div>
  )
}
