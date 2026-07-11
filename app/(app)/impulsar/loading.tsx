export default function Loading() {
  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      <div className="shimmer h-10 rounded-xl" />
      <div className="shimmer h-12 rounded-xl" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="shimmer h-14 rounded-xl" />
      ))}
    </div>
  )
}
