'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ReportesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/inicio') }, [])
  return null
}
