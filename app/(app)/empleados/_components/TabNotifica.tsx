'use client'
import type { UseNotifReglas } from '../_lib/useNotifReglas'

export default function TabNotifica({ notif }: { notif: UseNotifReglas }) {
  const {
    notifReglas,
    notifLoading,
    notifGuardando,
    notifTesting,
    rolesConSub,
    subsDispositivos,
    ayudaNotif, setAyudaNotif,
    subsBorrando,
    testNotifRegla,
    toggleNotifRol,
    borrarSub,
    toggleNotifActiva,
  } = notif

  return (
    <div className="fade-up space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">Notificaciones push</span>
        {/* Tooltip siglas */}
        <div className="relative">
          <button onClick={() => setAyudaNotif(v => !v)}
            className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs flex items-center justify-center">?</button>
          {ayudaNotif && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAyudaNotif(false)} />
              <div className="absolute left-0 top-7 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-3 w-52 shadow-xl">
                <p className="text-zinc-300 text-xs font-semibold mb-2">¿Qué significa cada columna?</p>
                {[['A','Admin'],['S','Supervisor'],['V','Vendedor'],['I','Impulsadora'],['E','Entregas'],['B','Bodega']].map(([k,v]) => (
                  <p key={k} className="text-zinc-400 text-xs mb-1"><span className="text-white font-bold mr-1">{k}</span>{v}</p>
                ))}
                <p className="text-zinc-600 text-xs mt-2 border-t border-zinc-800 pt-2">Activa el ✓ para que ese rol reciba la notificación push cuando ocurra el evento.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {notifLoading ? (
        <p className="text-zinc-500 text-sm">Cargando...</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          {/* Cabecera */}
          <div style={{display:"grid", gridTemplateColumns:"260px repeat(6,36px) 48px 52px", gap:4, padding:"8px 16px", borderBottom:"1px solid #27272a"}}>
            <span className="text-zinc-500 text-xs">Evento</span>
            {[['A','empresa','Admin'],['S','supervisor','Supervisor'],['V','vendedor','Vendedor'],['I','impulsadora','Impulsadora'],['E','entregas','Entregas'],['B','bodega','Bodega']].map(([k,rol,v]) => (
              <div key={k} className="relative flex justify-center items-center">
                <span className="text-zinc-500 text-xs text-center" title={v}>{k}</span>
                {rolesConSub.includes(rol) && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" title={`${v} tiene suscripción activa`} />
                )}
              </div>
            ))}
            <span className="text-zinc-500 text-xs text-center">On</span>
            <span className="text-zinc-500 text-xs text-center">Test</span>
          </div>
          {/* Filas */}
          {notifReglas.map((regla: any) => (
            <div key={regla.id} style={{display:"grid", gridTemplateColumns:"260px repeat(6,36px) 48px 52px", gap:4, padding:"10px 16px", borderBottom:"1px solid rgba(39,39,42,0.5)", alignItems:"center", opacity: regla.activa ? 1 : 0.4}}>
              <span className="text-white text-xs whitespace-nowrap pr-4">{regla.label}</span>
              {['empresa','supervisor','vendedor','impulsadora','entregas','bodega'].map(rol => (
                <div key={rol} className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={regla.roles.includes(rol)}
                    disabled={!regla.activa || notifGuardando === regla.id}
                    onChange={e => toggleNotifRol(regla.id, rol, e.target.checked)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
              ))}
              {/* Toggle activa */}
              <div className="flex justify-center">
                <button
                  onClick={() => toggleNotifActiva(regla.id, !regla.activa)}
                  disabled={notifGuardando === regla.id}
                  className={`w-9 h-5 rounded-full transition-colors relative ${regla.activa ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${regla.activa ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
              {/* Botón test */}
              <div className="flex justify-center">
                <button
                  onClick={() => testNotifRegla(regla.id)}
                  disabled={notifTesting === regla.id}
                  className="px-2 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-40">
                  {notifTesting === regla.id ? '...' : 'Test'}
                </button>
              </div>
            </div>
          ))}
          </div>{/* overflow-x-auto */}
        </div>
      )}

      {/* Lista dispositivos suscritos */}
      {!notifLoading && (subsDispositivos.admin.length > 0 || subsDispositivos.empleados.length > 0) && (
        <div className="space-y-2">
          <span className="text-zinc-400 text-xs font-semibold">Dispositivos suscritos</span>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden overflow-x-auto">
            <table style={{width:'100%',minWidth:480,borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:'1px solid #27272a'}}>
                  <th style={{width:80,padding:'8px 12px',textAlign:'left',color:'#71717a',fontWeight:600}}>Rol</th>
                  <th style={{width:160,padding:'8px 12px',textAlign:'left',color:'#71717a',fontWeight:600}}>Nombre</th>
                  <th style={{width:110,padding:'8px 12px',textAlign:'left',color:'#71717a',fontWeight:600}}>Dispositivo</th>
                  <th style={{width:90,padding:'8px 12px',textAlign:'left',color:'#71717a',fontWeight:600}}>Fecha</th>
                  <th style={{width:40,padding:'8px 12px'}}></th>
                </tr>
              </thead>
              <tbody>
                {subsDispositivos.admin.map((s: any) => (
                  <tr key={s.id} style={{borderBottom:'1px solid #27272a'}}>
                    <td style={{padding:'8px 12px'}}><span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 font-semibold">Admin</span></td>
                    <td style={{padding:'8px 12px',color:'#d4d4d8'}}>—</td>
                    <td style={{padding:'8px 12px',color:'#a1a1aa'}}>{s.user_agent || 'Desconocido'}</td>
                    <td style={{padding:'8px 12px',color:'#52525b'}}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-CO') : '—'}</td>
                    <td style={{padding:'8px 12px',textAlign:'center'}}>
                      <button onClick={() => borrarSub(s.id, 'admin')} disabled={subsBorrando === s.id}
                        className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40">🗑️</button>
                    </td>
                  </tr>
                ))}
                {subsDispositivos.empleados.map((s: any) => (
                  <tr key={s.id} style={{borderBottom:'1px solid #27272a'}}>
                    <td style={{padding:'8px 12px'}}><span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-semibold capitalize">{s.rol}</span></td>
                    <td style={{padding:'8px 12px',color:'#d4d4d8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{s.nombre}</td>
                    <td style={{padding:'8px 12px',color:'#a1a1aa'}}>{s.user_agent || 'Desconocido'}</td>
                    <td style={{padding:'8px 12px',color:'#52525b'}}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-CO') : '—'}</td>
                    <td style={{padding:'8px 12px',textAlign:'center'}}>
                      <button onClick={() => borrarSub(s.id, 'empleado')} disabled={subsBorrando === s.id}
                        className="text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
