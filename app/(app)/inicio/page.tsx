'use client'
import React from 'react'

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

// Dashboard ahora vive en el layout — persiste entre rutas
export default function DashboardPage() {
  return <ErrorBoundary><></></ErrorBoundary>
}
