export default function LoadingEgresos() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto px-2 pt-2 md:px-4 md:pt-4 animate-pulse">
      <div className="flex gap-2">
        <div className="h-9 flex-1 bg-white/5 rounded-xl"/>
        <div className="h-9 w-32 bg-white/5 rounded-xl"/>
      </div>
      <div className="h-24 bg-white/5 rounded-2xl"/>
      {[...Array(5)].map((_,i) => <div key={i} className="h-16 bg-white/5 rounded-2xl"/>)}
    </div>
  )
}
