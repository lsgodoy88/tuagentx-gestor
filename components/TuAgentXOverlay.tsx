'use client'

export default function TuAgentXOverlay() {
  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(6,10,36,0.92)',backdropFilter:'blur(3px)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <style>{`
        @keyframes tax-sweep { to { left: 110%; } }
      `}</style>
      <div style={{textAlign:'center',fontFamily:"var(--font-dm-sans,'DM Sans',sans-serif)",fontWeight:200}}>
        <div style={{fontSize:30,color:'white',letterSpacing:1,marginBottom:10}}>
          TuAgent<span style={{color:'#3b82f6'}}>X</span>
        </div>
        <div style={{width:160,height:1,background:'#1e2a3d',position:'relative',overflow:'hidden',margin:'0 auto'}}>
          <div style={{position:'absolute',top:0,left:'-60%',width:'60%',height:'100%',background:'linear-gradient(90deg,transparent,#3b82f6,transparent)',animation:'tax-sweep 0.7s ease-in-out infinite'}} />
        </div>
      </div>
    </div>
  )
}
