'use client'
import React from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { loadSnapshot } from '@/lib/dashboardSnapshot'

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{children: React.ReactNode},{err:any}> {
  constructor(p: any) { super(p); this.state = {err: null} }
  static getDerivedStateFromError(e: any) { return {err: e} }
  render() {
    if (this.state.err) return (
      <div className="flex items-center justify-center min-h-screen">
        <div style={{padding:16,color:'#fff',background:'#1a0000',margin:16,borderRadius:8,border:'1px solid #f00',fontSize:11,wordBreak:'break-all'}}>
          <b>ERR:</b> {String(this.state.err?.message||this.state.err)}
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── Skeleton estático compartido ─────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-3 pb-20">
      <div className="rounded-2xl" style={{height:44,background:'rgba(148,160,185,0.10)',border:'1px solid rgba(148,180,255,0.08)'}} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl" style={{height:110,background:'rgba(148,160,185,0.08)'}} />
        <div className="rounded-2xl" style={{height:110,background:'rgba(148,160,185,0.08)'}} />
      </div>
      <div className="rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.08)'}} />
      <div className="rounded-2xl" style={{height:80,background:'rgba(148,160,185,0.08)'}} />
    </div>
  )
}

// ── Componentes por rol — lazy ────────────────────────────────────────────────
const DashboardVendedor = dynamic(() => import('./_components/DashboardVendedor'), { ssr: false, loading: () => <DashboardSkeleton /> })
const DashboardBodega   = dynamic(() => import('./_components/DashboardBodega'),   { ssr: false, loading: () => <DashboardSkeleton /> })
const DashboardEntregas = dynamic(() => import('./_components/DashboardEntregas'), { ssr: false, loading: () => <DashboardSkeleton /> })
const DashboardAdmin    = dynamic(() => import('./_components/DashboardAdmin'),    { ssr: false, loading: () => <DashboardSkeleton /> })

// ── Router ────────────────────────────────────────────────────────────────────
function DashboardRouter() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as any

  if (status === 'loading' || !user) return <DashboardSkeleton />

  if (user.role === 'vendedor')    return <DashboardVendedor user={user} />
  if (user.role === 'bodega')      return <DashboardBodega user={user} />
  if (user.role === 'entregas')    return <DashboardEntregas user={user} />
  if (user.role === 'impulsadora') { router.push('/impulsadora'); return null }

  return <DashboardAdmin user={user} />
}

export default function DashboardPage() {
  return <ErrorBoundary><DashboardRouter /></ErrorBoundary>
}
