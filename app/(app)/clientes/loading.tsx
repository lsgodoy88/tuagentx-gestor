export default function LoadingClientes() {
  return (
    <div className="space-y-3 max-w-7xl mx-auto px-2 pt-2 md:px-4 md:pt-4 animate-pulse">
      <div className="h-9 w-full bg-white/5 rounded-xl"/>
      {[...Array(6)].map((_,i) => <div key={i} className="h-20 bg-white/5 rounded-2xl"/>)}
    </div>
  )
}
