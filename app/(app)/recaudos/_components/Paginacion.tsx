'use client'
import type { UseRecaudos } from '../_lib/useRecaudos'

export function Paginacion({ r }: { r: UseRecaudos }) {
  const { pagos, page, setPage, totalPages, hasMore, nextCursor, fetchPagos, loadingMore } = r
  if (pagos.length === 0) return null
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,paddingTop:8}}>
      <button
        onClick={() => setPage(p => p - 1)}
        disabled={page === 0}
        style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 14px',fontSize:12,fontWeight:700,color:page===0?'rgba(255,255,255,0.25)':'white',cursor:page===0?'not-allowed':'pointer'}}>
        ← Anterior
      </button>
      <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',minWidth:90,textAlign:'center'}}>
        Pág {page + 1} / {totalPages}{hasMore ? '+' : ''}
      </span>
      <button
        onClick={async () => {
          const nextPage = page + 1
          if (nextPage >= totalPages && hasMore) await fetchPagos(nextCursor)
          setPage(nextPage)
        }}
        disabled={(page >= totalPages - 1 && !hasMore) || loadingMore}
        style={{background:'#1e2a3d',border:'1px solid #1e3a5f',borderRadius:'0.75rem',padding:'6px 14px',fontSize:12,fontWeight:700,color:(page>=totalPages-1&&!hasMore)?'rgba(255,255,255,0.25)':'white',cursor:(page>=totalPages-1&&!hasMore)?'not-allowed':'pointer'}}>
        {loadingMore ? '...' : 'Siguiente →'}
      </button>
    </div>
  )
}
