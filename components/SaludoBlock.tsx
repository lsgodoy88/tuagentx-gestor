'use client'
export default function SaludoBlock({ nombre }: { nombre?: string }) {
  return (
    <h1 className="text-2xl font-bold text-white px-1">
      Bienvenido, {nombre?.split(' ')[0]}
    </h1>
  )
}
