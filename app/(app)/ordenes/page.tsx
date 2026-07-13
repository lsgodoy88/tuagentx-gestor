'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OrdenesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/bodega/propia') }, [])
  return null
}
