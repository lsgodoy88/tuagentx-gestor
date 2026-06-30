'use client'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ModuloGastos from '@/components/ModuloGastos'

export default function GastosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any
  const isAdmin = user?.role === 'empresa' || user?.role === 'supervisor'

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    // Admin/supervisor ahora gestionan gastos desde la tab dentro de
    // /egresos — esta página independiente queda exclusiva para
    // vendedor/impulsadora (sus propios gastos).
    if (isAdmin) { router.push('/egresos'); return }
    if (!['vendedor', 'impulsadora'].includes(user?.role)) { router.push('/inicio'); return }
  }, [status])

  if (status !== 'authenticated' || isAdmin) return null

  return <ModuloGastos isAdmin={false} />
}
