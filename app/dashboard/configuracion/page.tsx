'use client'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

const eyeOpen = <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const eyeOff = <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>

function Seccion({ titulo, icono, isOpen, onToggle, children }: {
  titulo: string
  icono: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="text-white font-semibold">{icono} {titulo}</span>
        <span className="text-zinc-500 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  )
}

export default function ConfiguracionPage() {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showPass2, setShowPass2] = useState(false)

  // Rutas (solo empresa)
  const [horaInicio, setHoraInicio] = useState('07:00')
  const [horaFin, setHoraFin] = useState('21:00')
  const [autoCrearRuta, setAutoCrearRuta] = useState(false)
  const [autoCerrarRuta, setAutoCerrarRuta] = useState(false)
  const [diasCrear, setDiasCrear] = useState<number[]>([0, 1, 2, 3, 4])
  const [diasCerrar, setDiasCerrar] = useState<number[]>([0, 1, 2, 3, 4])
  const [msgRutas, setMsgRutas] = useState('')
  const [savingRutas, setSavingRutas] = useState(false)

  // Despachos (solo empresa)
  const [ciudadEntregaLocal, setCiudadEntregaLocal] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [diasHistorialBodega, setDiasHistorialBodega] = useState(7)
  const [bodegaPuedeEnviar, setBodegaPuedeEnviar] = useState(false)

  // Config empresa — datos generales
  const [cfgEmpNit, setCfgEmpNit] = useState('')
  const [cfgEmpDir, setCfgEmpDir] = useState('')
  const [cfgEmpTel, setCfgEmpTel] = useState('')
  const [savingMiEmpresa, setSavingMiEmpresa] = useState(false)
  const [msgMiEmpresa, setMsgMiEmpresa] = useState('')

  // Config empresa — recibos
  const [cfgEmpAncho, setCfgEmpAncho] = useState('58mm')
  const [cfgEmpPrefijo, setCfgEmpPrefijo] = useState('REC')
  const [savingRecibosEmp, setSavingRecibosEmp] = useState(false)
  const [msgRecibosEmp, setMsgRecibosEmp] = useState('')

  // Modo integración
  const [modoSel, setModoSel] = useState<'manual'|'erp'|'api'>('manual')
  const [modoActivo, setModoActivo] = useState<'manual'|'erp'|'api'>('manual')

  // API UpTres
  const [erpConectado, setErpConectado] = useState(false)
  const [erpNombre, setErpNombre] = useState('')
  const [uptresApiKey, setUptresApiKey] = useState('')
  const [uptresApiSecret, setUptresApiSecret] = useState('')
  const [showUptresSecret, setShowUptresSecret] = useState(false)
  const [conectandoErp, setConectandoErp] = useState(false)
  const [msgErp, setMsgErp] = useState('')
  const [syncInicial, setSyncInicial] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [ultimaSync, setUltimaSync] = useState('')
  const [modalValidacion, setModalValidacion] = useState(false)
  const [faseConexion, setFaseConexion] = useState<'idle'|'validando'|'conectando'|'sincronizando'|'listo'|'error'>('idle')
  const [endpointsFase, setEndpointsFase] = useState<Record<string, 'pendiente'|'ok'|'error'|'cargando'>>({})
  const [syncResultado, setSyncResultado] = useState<Record<string, number>>({})
  const [validacion, setValidacion] = useState<{
    ok: boolean
    endpoints: Record<string, boolean>
    counts: Record<string, number>
    activeCount: number
  }>({ ok: false, endpoints: {}, counts: {}, activeCount: 0 })

  // API Universal
  const [intUrl, setIntUrl] = useState('')
  const [intToken, setIntToken] = useState('')
  const [showIntToken, setShowIntToken] = useState(false)
  const [docApi, setDocApi] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [endpointsDetectados, setEndpointsDetectados] = useState<any>(null)
  const [mapeoIA, setMapeoIA] = useState<any>(null)
  const [validando, setValidando] = useState(false)
  const [msgValidar, setMsgValidar] = useState('')
  const [resultValidacion, setResultValidacion] = useState<any>(null)
  const [pasoApi, setPasoApi] = useState<1|2|3>(1)

  // Config recibos personal (empleados)
  const [cfgUsarEmpresa, setCfgUsarEmpresa] = useState(true)
  const [cfgPrefijo, setCfgPrefijo] = useState('')
  const [cfgAncho, setCfgAncho] = useState('58mm')
  const [cfgConsecutivo, setCfgConsecutivo] = useState(0)
  const [savingCfgPers, setSavingCfgPers] = useState(false)
  const [msgCfgPers, setMsgCfgPers] = useState('')

  // Empresas vinculadas
  const [vinculadas, setVinculadas] = useState<any[]>([])
  const [conectadas, setConectadas] = useState<any[]>([])
  const [modalVinculada, setModalVinculada] = useState(false)
  const [nuevaVinculada, setNuevaVinculada] = useState({ nombre: '', color: '#8b5cf6' })
  const [tokenGenerado, setTokenGenerado] = useState<string | null>(null)
  const [creandoVinculada, setCreandoVinculada] = useState(false)
  const [msgVinculada, setMsgVinculada] = useState('')
  const [modalConectarToken, setModalConectarToken] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenLookup, setTokenLookup] = useState<{ nombre: string; vinculadaId: string } | null>(null)
  const [tokenMsg, setTokenMsg] = useState('')
  const [buscandoToken, setBuscandoToken] = useState(false)
  const [conectandoToken, setConectandoToken] = useState(false)

  // Acordeón
  const [seccionAbierta, setSeccionAbierta] = useState('')

  const esAdmin = user?.role === 'empresa' || user?.role === 'supervisor'
  const esEmpleado = user?.role !== 'empresa' && user?.role !== 'superadmin'
  const esSoloEmpleado = user?.role !== 'empresa' && user?.role !== 'superadmin' && user?.role !== 'supervisor'

  function toggleSeccion(id: string) {
    setSeccionAbierta(prev => prev === id ? '' : id)
  }

  useEffect(() => {
    if (status !== 'authenticated') return

    // Abrir primera sección por defecto
    setSeccionAbierta(user?.role === 'empresa' || user?.role === 'supervisor' ? 'empresa' : 'perfil')

    if (user?.role === 'empresa' || user?.role === 'supervisor') {
      fetch('/api/empresas-vinculadas').then(r => r.json()).then(d => { setVinculadas(d.vinculadas || []); setConectadas(d.conectadas || []) })
    }

    if (user?.role === 'empresa') {
      fetch('/api/integracion/estado').then(r => r.json()).then(d => {
        if (d.conectado) {
          setErpConectado(true); setErpNombre(d.nombre ?? '')
          setSyncInicial(d.syncInicial ?? false)
          setUltimaSync(d.ultimaSync ?? '')
          setModoActivo('erp'); setModoSel('erp')
        }
      })
      fetch('/api/clientes?limit=500').then(r => r.json()).then(d => setClientes(d.clientes || [])).catch(() => {})
      fetch('/api/mi-empresa/config').then(r => r.json()).then(d => {
        if (d.horaInicioRuta) setHoraInicio(d.horaInicioRuta)
        if (d.horaFinRuta) setHoraFin(d.horaFinRuta)
        setAutoCrearRuta(d.autoCrearRuta ?? false)
        setAutoCerrarRuta(d.autoCerrarRuta ?? false)
        if (d.diasCrearRuta) setDiasCrear(d.diasCrearRuta.split(',').map(Number))
        if (d.diasCerrarRuta) setDiasCerrar(d.diasCerrarRuta.split(',').map(Number))
        setCiudadEntregaLocal(d.ciudadEntregaLocal ?? '')
        setDiasHistorialBodega(d.diasHistorialBodega ?? 7)
        setBodegaPuedeEnviar(d.bodegaPuedeEnviar ?? false)
      })
      fetch('/api/recibos/config/empresa').then(r => r.json()).then(d => {
        if (!d.error) {
          const url = d.urlApi ?? ''
          const tok = d.tokenApi ?? ''
          setIntUrl(url); setIntToken(tok)
          if (url) { setModoActivo('api'); setModoSel('api') }
        }
      })
    }

    if (esAdmin) {
      fetch('/api/recibos/config/empresa').then(r => r.json()).then(d => {
        if (!d.error) {
          setCfgEmpAncho(d.anchoPapel ?? '58mm')
          setCfgEmpPrefijo(d.prefijo ?? 'REC')
          setCfgEmpNit(d.nit ?? '')
          setCfgEmpDir(d.direccion ?? '')
          setCfgEmpTel(d.telefono ?? '')
        }
      })
    }

    if (esEmpleado) {
      fetch('/api/recibos/config').then(r => r.json()).then(d => {
        if (!d.error) {
          setCfgUsarEmpresa(d.usarConfigEmpresa !== false)
          setCfgPrefijo(d.prefijoPersonal ?? '')
          setCfgAncho(d.anchoPapelPersonal ?? '58mm')
          setCfgConsecutivo(d.consecutivoActual ?? 0)
        }
      })
    }
  }, [status])

  function toggleDia(tipo: 'inicio' | 'fin', i: number) {
    if (tipo === 'inicio') {
      setDiasCrear(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort((a, b) => a - b))
    } else {
      setDiasCerrar(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort((a, b) => a - b))
    }
  }

  async function guardarConfigEntregas() {
    setSavingRutas(true)
    const res = await fetch('/api/mi-empresa/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horaInicioRuta: horaInicio, horaFinRuta: horaFin,
        autoCrearRuta, autoCerrarRuta,
        diasCrearRuta: diasCrear.join(','), diasCerrarRuta: diasCerrar.join(','),
        ciudadEntregaLocal: ciudadEntregaLocal || null,
        diasHistorialBodega, bodegaPuedeEnviar,
      }),
    })
    setSavingRutas(false)
    setMsgRutas(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgRutas(''), 3000)
  }

  async function cambiarPassword() {
    if (newPass !== newPass2) { setMsg('Las contraseñas no coinciden'); return }
    if (newPass.length < 6) { setMsg('Mínimo 6 caracteres'); return }
    setSaving(true)
    const res = await fetch('/api/configuracion/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPass }) })
    setSaving(false)
    if (res.ok) { setMsg('✅ Contraseña actualizada'); setNewPass(''); setNewPass2('') }
    else setMsg('Error al actualizar')
    setTimeout(() => setMsg(''), 3000)
  }

  async function guardarMiEmpresa() {
    setSavingMiEmpresa(true)
    const res = await fetch('/api/recibos/config/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit: cfgEmpNit || null, direccion: cfgEmpDir || null, telefono: cfgEmpTel || null }),
    })
    setSavingMiEmpresa(false)
    setMsgMiEmpresa(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgMiEmpresa(''), 3000)
  }

  async function guardarRecibosEmpresa() {
    setSavingRecibosEmp(true)
    const res = await fetch('/api/recibos/config/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchoPapel: cfgEmpAncho, prefijo: cfgEmpPrefijo }),
    })
    setSavingRecibosEmp(false)
    setMsgRecibosEmp(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgRecibosEmp(''), 3000)
  }

  function truncarEmail(email: string) {
    const at = email.indexOf('@')
    if (at < 0 || at <= 10) return email
    return email.slice(0, 10) + '...' + email.slice(at)
  }

  async function activarManual() {
    if (erpConectado) await fetch('/api/integracion/conectar', { method: 'DELETE' })
    if (intUrl) await fetch('/api/recibos/config/empresa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urlApi: null, tokenApi: null }) })
    setErpConectado(false); setErpNombre(''); setUptresApiKey(''); setUptresApiSecret('')
    setIntUrl(''); setIntToken(''); setResultValidacion(null); setEndpointsDetectados(null)
    setModoActivo('manual'); setModoSel('manual')
  }

  async function validarUpTres() {
    if (!uptresApiKey || !uptresApiSecret) return
    setModalValidacion(true)
    setFaseConexion('validando')
    setEndpointsFase({ clientes: 'cargando', empleados: 'cargando', cartera: 'cargando', ordenes: 'cargando' })
    setSyncResultado({})
    setMsgErp('')
    const res = await fetch('/api/integracion/validar-uptres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'uptres', apiKey: uptresApiKey, apiSecret: uptresApiSecret }),
    })
    const data = await res.json()
    if (data.error || !data.ok) {
      setEndpointsFase({ clientes: 'error', empleados: 'error', cartera: 'error', ordenes: 'error' })
      setFaseConexion('error')
      setMsgErp(data.error || 'Sin conexión')
      return
    }
    const epFase: Record<string, 'ok'|'error'> = {}
    for (const k of Object.keys(data.endpoints)) epFase[k] = data.endpoints[k] ? 'ok' : 'error'
    setEndpointsFase(epFase)
    setValidacion(data)
    await new Promise(r => setTimeout(r, 800))
    setFaseConexion('conectando')
    const resConn = await fetch('/api/integracion/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'uptres', apiKey: uptresApiKey, apiSecret: uptresApiSecret }),
    })
    const dataConn = await resConn.json()
    if (!dataConn.ok) { setFaseConexion('error'); setMsgErp(dataConn.error || 'Error al conectar'); return }
    setErpConectado(true); setErpNombre(dataConn.nombre ?? 'API UpTres'); setModoActivo('erp')
    await new Promise(r => setTimeout(r, 500))
    setFaseConexion('sincronizando')
    const resSync = await fetch('/api/integracion/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'inicial' }),
    })
    const dataSync = await resSync.json()
    if (dataSync.ok) {
      setSyncInicial(true)
      setUltimaSync(new Date().toLocaleString('es-CO'))
      setSyncResultado({ clientes: dataSync.clientesActualizados ?? 0, deudas: dataSync.deudasInsertadas ?? 0 })
      setFaseConexion('listo')
    } else {
      setFaseConexion('error')
      setMsgErp(dataSync.error || 'Error en sync inicial')
    }
  }

  async function activarUpTres() {
    const res = await fetch('/api/integracion/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'uptres', apiKey: uptresApiKey, apiSecret: uptresApiSecret }),
    })
    const data = await res.json()
    if (data.ok) {
      setErpConectado(true); setErpNombre(data.nombre ?? 'API UpTres')
      setSyncInicial(data.syncInicial ?? false); setModalValidacion(false)
      setModoActivo('erp')
    } else {
      setMsgErp(data.error || 'Error al activar')
    }
  }

  async function desconectarERP() {
    await fetch('/api/integracion/conectar', { method: 'DELETE' })
    setErpConectado(false); setErpNombre(''); setUptresApiKey(''); setUptresApiSecret(''); setUltimaSync('')
    setModoActivo('manual'); setModoSel('manual')
  }

  async function ejecutarSyncInicial() {
    setSincronizando(true); setMsgSync('')
    const res = await fetch('/api/integracion/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'inicial' }) })
    const data = await res.json()
    setSincronizando(false)
    if (data.ok) { setMsgSync(`✅ ${data.clientesActualizados ?? 0} clientes · ${data.empleadosSincronizados ?? 0} empleados · ${data.deudasInsertadas ?? 0} deudas`); setSyncInicial(true); setUltimaSync(new Date().toLocaleString('es-CO')); setSyncResultado({ clientes: data.clientesActualizados ?? 0, empleados: data.empleadosSincronizados ?? 0, deudas: data.deudasInsertadas ?? 0 }) }
    else setMsgSync(data.error || 'Error en sincronización')
    // éxito permanente
  }

  async function syncDelta() {
    setSincronizando(true); setMsgSync('')
    const res = await fetch('/api/integracion/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'delta' }) })
    const data = await res.json()
    setSincronizando(false)
    setMsgSync(data.ok ? '✅ Sync completada' : data.error || 'Error en sync')
    setTimeout(() => setMsgSync(''), 4000)
  }

  async function analizarDocs() {
    if (!docApi.trim()) return
    setAnalizando(true)
    const res = await fetch('/api/integracion/analizar-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentacion: docApi, url: intUrl }) })
    const data = await res.json()
    setAnalizando(false)
    if (!data.error) {
      setEndpointsDetectados(data.endpoints ?? null)
      setMapeoIA(data.mapeo ?? null)
      setPasoApi(2)
    }
  }

  async function validarConexionApi() {
    if (!intUrl) { setMsgValidar('Ingresa la URL primero'); return }
    setValidando(true); setMsgValidar(''); setResultValidacion(null)
    const res = await fetch('/api/integracion/validar-api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: intUrl, token: intToken, endpoints: endpointsDetectados }) })
    const data = await res.json()
    setValidando(false)
    setResultValidacion(data.endpoints ?? null)
    setPasoApi(3)
  }

  async function activarApiConexion() {
    await fetch('/api/recibos/config/empresa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urlApi: intUrl, tokenApi: intToken || null }) })
    setModoActivo('api')
  }

  async function desconectarApi() {
    await fetch('/api/recibos/config/empresa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urlApi: null, tokenApi: null }) })
    setIntUrl(''); setIntToken(''); setResultValidacion(null); setEndpointsDetectados(null); setMapeoIA(null)
    setPasoApi(1); setModoActivo('manual'); setModoSel('manual')
  }

  async function guardarCfgPersonal() {
    setSavingCfgPers(true)
    const body: any = { usarConfigEmpresa: cfgUsarEmpresa }
    if (!cfgUsarEmpresa) { body.prefijo = cfgPrefijo || null; body.anchoPapel = cfgAncho }
    const res = await fetch('/api/recibos/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSavingCfgPers(false)
    setMsgCfgPers(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgCfgPers(''), 3000)
  }

  async function crearVinculada() {
    setCreandoVinculada(true)
    const res = await fetch('/api/empresas-vinculadas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: nuevaVinculada.color }) })
    const data = await res.json()
    setCreandoVinculada(false)
    if (data.vinculada) {
      setVinculadas(prev => [...prev, data.vinculada])
      setTokenGenerado(data.vinculada.apiKey)
      setNuevaVinculada({ nombre: '', color: '#8b5cf6' })
    } else {
      setMsgVinculada(data.error || 'Error al crear')
    }
  }

  async function buscarToken() {
    if (!tokenInput.trim()) return
    setBuscandoToken(true); setTokenMsg(''); setTokenLookup(null)
    const res = await fetch(`/api/empresas-vinculadas/lookup?token=${tokenInput.trim()}`)
    const data = await res.json()
    setBuscandoToken(false)
    if (data.ok) {
      setTokenLookup({ nombre: data.nombre, vinculadaId: data.vinculadaId })
    } else {
      setTokenMsg(data.error || 'Token inválido')
    }
  }
  async function confirmarConexionToken() {
    if (!tokenLookup) return
    setConectandoToken(true); setTokenMsg('')
    const res = await fetch('/api/empresas-vinculadas/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenInput.trim() })
    })
    const data = await res.json()
    setConectandoToken(false)
    if (data.ok) {
      setTokenMsg(`✅ Vinculada a ${data.nombre}`)
      setTokenLookup(null); setTokenInput('')
      setTimeout(() => { setModalConectarToken(false); setTokenMsg('') }, 2000)
    } else {
      setTokenMsg(data.error || 'Error al conectar')
    }
  }
  async function eliminarVinculada(id: string) {
    await fetch(`/api/empresas-vinculadas?id=${id}`, { method: 'DELETE' })
    setVinculadas(prev => prev.filter(v => v.id !== id))
  }

  const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500'
  const inputReadonlyClass = 'w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-zinc-400 text-sm'
  const labelClass = 'text-zinc-400 text-xs font-semibold block mb-1.5'
  const anchoBtns: { v: string; l: string }[] = [{ v: '80mm', l: '🖨️ 80mm' }, { v: '58mm', l: '🖨️ 58mm' }]

  const btnGuardar = (onClick: () => void, disabled: boolean, saving: boolean) => (
    <button onClick={onClick} disabled={disabled}
      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
      {saving ? 'Guardando...' : 'Guardar'}
    </button>
  )

  const passwordFields = (
    <div className="space-y-3 pt-2">
      <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Cambiar contraseña</p>
      <div>
        <label className={labelClass}>Nueva contraseña</label>
        <div className="relative">
          <input type={showPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} />
          <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{showPass ? eyeOff : eyeOpen}</button>
        </div>
      </div>
      <div>
        <label className={labelClass}>Confirmar contraseña</label>
        <div className="relative">
          <input type={showPass2 ? 'text' : 'password'} value={newPass2} onChange={e => setNewPass2(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} />
          <button type="button" tabIndex={-1} onClick={() => setShowPass2(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{showPass2 ? eyeOff : eyeOpen}</button>
        </div>
      </div>
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      <button onClick={cambiarPassword} disabled={saving || !newPass}
        className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
        {saving ? 'Guardando...' : 'Cambiar contraseña'}
      </button>
    </div>
  )

  return (
    <div className="max-w-2xl space-y-3">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-zinc-400 text-sm mt-1">Ajustes de tu cuenta</p>
      </div>

      {/* ── EMPRESA ── */}
      {user?.role === 'empresa' && (
        <>
          <Seccion titulo="Mi empresa" icono="🏢" isOpen={seccionAbierta === 'empresa'} onToggle={() => toggleSeccion('empresa')}>
            <div className="bg-zinc-800 rounded-xl px-4 py-3 space-y-0.5">
              <p className="text-zinc-400 text-xs">Cuenta</p>
              <p className="text-white text-sm font-mono">{user?.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>NIT</label>
                <input value={cfgEmpNit} onChange={e => setCfgEmpNit(e.target.value)} placeholder="900.123.456-7" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input value={cfgEmpTel} onChange={e => setCfgEmpTel(e.target.value)} placeholder="601 234 5678" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input value={cfgEmpDir} onChange={e => setCfgEmpDir(e.target.value)} placeholder="Calle 123 # 45-67" className={inputClass} />
            </div>
            {msgMiEmpresa && <p className="text-sm text-emerald-400">{msgMiEmpresa}</p>}
            {btnGuardar(guardarMiEmpresa, savingMiEmpresa, savingMiEmpresa)}
            <hr className="border-zinc-800" />
            {passwordFields}
          </Seccion>

          <Seccion titulo="Recibos" icono="🖨️" isOpen={seccionAbierta === 'recibos'} onToggle={() => toggleSeccion('recibos')}>
            <div>
              <label className={labelClass}>Ancho de papel</label>
              <div className="flex gap-2 flex-wrap">
                {anchoBtns.map(b => (
                  <button key={b.v} onClick={() => setCfgEmpAncho(b.v)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${cfgEmpAncho === b.v ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                    {b.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Prefijo recibo</label>
              <input value={cfgEmpPrefijo} onChange={e => setCfgEmpPrefijo(e.target.value.toUpperCase())} placeholder="REC" maxLength={6} className={inputClass} />
            </div>
            {msgRecibosEmp && <p className="text-sm text-emerald-400">{msgRecibosEmp}</p>}
            {btnGuardar(guardarRecibosEmpresa, savingRecibosEmp, savingRecibosEmp)}
          </Seccion>

          <Seccion titulo="Entregas" icono="🚚" isOpen={seccionAbierta === 'entregas'} onToggle={() => toggleSeccion('entregas')}>
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Automatización — solo aplica a rol Entregas</p>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-white text-sm">Auto-crear ruta diaria</p>
                <p className="text-zinc-500 text-xs">Crea rutas automáticamente a la hora de inicio</p>
              </div>
              <button onClick={() => setAutoCrearRuta(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoCrearRuta ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCrearRuta ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {autoCrearRuta && (
              <div className="space-y-2 pl-1">
                <div>
                  <label className={labelClass}>Hora inicio</label>
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Días</label>
                  <div className="flex gap-1">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, i) => (
                      <button key={i} onClick={() => toggleDia('inicio', i)}
                        className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${diasCrear.includes(i) ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                        {dia}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-white text-sm">Auto-cerrar ruta diaria</p>
                <p className="text-zinc-500 text-xs">Cierra rutas automáticamente a la hora de fin</p>
              </div>
              <button onClick={() => setAutoCerrarRuta(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoCerrarRuta ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCerrarRuta ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {autoCerrarRuta && (
              <div className="space-y-2 pl-1">
                <div>
                  <label className={labelClass}>Hora fin</label>
                  <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Días</label>
                  <div className="flex gap-1">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, i) => (
                      <button key={i} onClick={() => toggleDia('fin', i)}
                        className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${diasCerrar.includes(i) ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                        {dia}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <hr className="border-zinc-800 my-3" />

            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-3">Bodega y Despachos</p>

            <div>
              <label className={labelClass}>Ciudad entrega local</label>
              <select value={ciudadEntregaLocal} onChange={e => setCiudadEntregaLocal(e.target.value)} className={inputClass}>
                <option value="">Sin entrega local (todo por transportadora)</option>
                {[...new Set((clientes || []).map((c: any) => c.ciudad?.split('/').pop()?.trim()).filter(Boolean))].sort().map((ciudad: any) => (
                  <option key={ciudad} value={ciudad}>{ciudad}</option>
                ))}
              </select>
              <p className="text-zinc-600 text-xs mt-1">Órdenes con esta ciudad se asignan a repartidor local; las demás van por transportadora.</p>
            </div>
            <div>
              <label className={labelClass}>Días historial bodega</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setDiasHistorialBodega(Math.max(1, diasHistorialBodega - 1))} className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-lg font-bold flex items-center justify-center">−</button>
                <span className="text-white font-semibold w-8 text-center">{diasHistorialBodega}</span>
                <button onClick={() => setDiasHistorialBodega(Math.min(90, diasHistorialBodega + 1))} className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-lg font-bold flex items-center justify-center">+</button>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-white text-sm">Permitir que bodega envíe a despacho</p>
                <p className="text-zinc-500 text-xs">El rol bodega puede asignar repartidor o ingresar guía</p>
              </div>
              <button onClick={() => setBodegaPuedeEnviar(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${bodegaPuedeEnviar ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${bodegaPuedeEnviar ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {msgRutas && <p className="text-sm text-emerald-400">{msgRutas}</p>}
            {btnGuardar(guardarConfigEntregas, savingRutas, savingRutas)}
          </Seccion>

          <Seccion titulo="Modo de integración" icono="⚙️" isOpen={seccionAbierta === 'integracion'} onToggle={() => toggleSeccion('integracion')}>
            <p className="text-zinc-500 text-xs">Define cómo se sincronizan clientes, cartera y recaudos.</p>

            {/* ── Card Manual ── */}
            <div className={`rounded-2xl border cursor-pointer transition-colors ${modoSel === 'manual' ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-zinc-700 bg-zinc-800/40'}`}
              onClick={() => setModoSel('manual')}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${modoSel === 'manual' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-500'}`} />
                  <div>
                    <p className="text-white text-sm font-medium">📋 Manual</p>
                    <p className="text-zinc-500 text-xs">Importación Excel habilitada</p>
                  </div>
                </div>
                {modoActivo === 'manual' && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">Activo</span>}
              </div>
              {modoSel === 'manual' && modoActivo !== 'manual' && (
                <div className="px-4 pb-4 pt-1 border-t border-zinc-700">
                  <p className="text-zinc-400 text-xs mb-3">Los datos se gestionan manualmente via Excel. Se desconectará la integración actual.</p>
                  <button onClick={e => { e.stopPropagation(); activarManual() }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                    Activar modo manual
                  </button>
                </div>
              )}
            </div>

            {/* ── Card API UpTres ── */}
            <div className={`rounded-2xl border transition-colors ${modoSel === 'erp' ? 'border-violet-500/60 bg-violet-500/5' : 'border-zinc-700 bg-zinc-800/40'}`}>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setModoSel('erp')}>
                <div className="flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${modoSel === 'erp' ? 'border-violet-500 bg-violet-500' : 'border-zinc-500'}`} />
                  <div>
                    <p className="text-white text-sm font-medium">🔗 API UpTres</p>
                    <p className="text-zinc-500 text-xs">Sincroniza clientes, cartera e impulso</p>
                  </div>
                </div>
                {modoActivo === 'erp' && <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full font-semibold">Activo</span>}
              </div>
              {modoSel === 'erp' && (
                <div className="px-4 pb-4 pt-1 border-t border-zinc-700 space-y-3">
                  {erpConectado ? (
                    <>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">✅</span>
                          <p className="text-emerald-400 text-sm font-semibold">Conectado</p>
                        </div>
                        {ultimaSync && <p className="text-zinc-500 text-xs mt-0.5">Última sync: {ultimaSync}</p>}
                      </div>
                      {!syncInicial ? (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
                          <p className="text-amber-400 text-sm font-semibold">⚠️ Sincronización inicial pendiente</p>
                          <p className="text-zinc-400 text-xs">Carga todos los clientes, cartera y datos de impulso. Solo se ejecuta una vez.</p>
                          {msgSync && <p className="text-sm text-emerald-400">{msgSync}</p>}
                          <button onClick={ejecutarSyncInicial} disabled={sincronizando}
                            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold px-4 py-2 rounded-xl text-sm">
                            {sincronizando ? 'Sincronizando...' : '🚀 Ejecutar sincronización inicial'}
                          </button>
                        </div>
                      ) : (
                        <div className="bg-zinc-800 rounded-xl px-4 py-3">
                          <p className="text-zinc-400 text-xs">✅ Sync inicial completada</p>
                          <p className="text-zinc-500 text-xs mt-0.5">Delta diario 3am Bogotá</p>
                          {msgSync && <p className="text-sm text-emerald-400 mt-1">{msgSync}</p>}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={syncDelta} disabled={sincronizando}
                          className="bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/20 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
                          {sincronizando ? 'Sincronizando...' : '🔄 Sync'}
                        </button>
                        <button onClick={desconectarERP}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold px-4 py-2 rounded-xl text-sm">
                          Desconectar API
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className={labelClass}>API Key</label>
                        <input value={uptresApiKey} onChange={e => setUptresApiKey(e.target.value)} placeholder="pk_..." className={inputClass} onClick={e => e.stopPropagation()} />
                      </div>
                      <div>
                        <label className={labelClass}>API Secret</label>
                        <div className="relative">
                          <input type={showUptresSecret ? 'text' : 'password'} value={uptresApiSecret} onChange={e => setUptresApiSecret(e.target.value)} placeholder="••••••••" className={inputClass + ' pr-10'} onClick={e => e.stopPropagation()} />
                          <button type="button" tabIndex={-1} onClick={e => { e.stopPropagation(); setShowUptresSecret(p => !p) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                            {showUptresSecret ? eyeOff : eyeOpen}
                          </button>
                        </div>
                      </div>
                      {msgErp && <p className="text-sm text-red-400">{msgErp}</p>}
                      <button onClick={e => { e.stopPropagation(); validarUpTres() }} disabled={conectandoErp || !uptresApiKey || !uptresApiSecret}
                        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                        {conectandoErp ? 'Validando...' : 'Validar conexión'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Card API Universal ── */}
            <div className={`rounded-2xl border transition-colors ${modoSel === 'api' ? 'border-sky-500/60 bg-sky-500/5' : 'border-zinc-700 bg-zinc-800/40'}`}>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => { setModoSel('api'); if (modoActivo !== 'api') setPasoApi(1) }}>
                <div className="flex items-center gap-3">
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${modoSel === 'api' ? 'border-sky-500 bg-sky-500' : 'border-zinc-500'}`} />
                  <div>
                    <p className="text-white text-sm font-medium">🌐 API Universal</p>
                    <p className="text-zinc-500 text-xs">Conecta con cualquier sistema via REST</p>
                  </div>
                </div>
                {modoActivo === 'api' && <span className="text-xs bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-semibold">Activo</span>}
              </div>
              {modoSel === 'api' && (
                <div className="px-4 pb-4 pt-1 border-t border-zinc-700 space-y-3" onClick={e => e.stopPropagation()}>

                  {/* ── Conectado ── */}
                  {modoActivo === 'api' ? (
                    <>
                      <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3">
                        <p className="text-sky-400 text-sm font-semibold">✅ Conectado</p>
                        <p className="text-zinc-400 text-xs mt-0.5 font-mono truncate">{intUrl}</p>
                      </div>
                      {resultValidacion && (
                        <div className="space-y-1.5 bg-zinc-800 rounded-xl p-3">
                          {Object.entries(resultValidacion).map(([ep, r]: any) => (
                            <div key={ep} className="flex items-center gap-2 text-xs">
                              <span>{r.ok ? '✅' : r.error === 'timeout' ? '⏱️' : '❌'}</span>
                              <span className="text-zinc-300 w-20">{ep}</span>
                              <span className="text-zinc-500 font-mono">{endpointsDetectados?.[ep]?.path ?? '/' + ep}</span>
                              <span className="text-zinc-600 ml-auto">{r.ok ? `${r.status}` : r.error ?? r.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={desconectarApi}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold px-4 py-2 rounded-xl text-sm">
                        Desconectar API
                      </button>
                    </>

                  ) : pasoApi === 1 ? (
                    /* ── Paso 1 — Formulario ── */
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                        <p className="text-zinc-300 text-xs font-semibold">Credenciales</p>
                      </div>
                      <div>
                        <label className={labelClass}>URL base</label>
                        <input value={intUrl} onChange={e => setIntUrl(e.target.value)} placeholder="https://api.ejemplo.com" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Token / API Key</label>
                        <div className="relative">
                          <input type={showIntToken ? 'text' : 'password'} value={intToken} onChange={e => setIntToken(e.target.value)} placeholder="••••••••••••••••" className={inputClass + ' pr-10'} />
                          <button type="button" tabIndex={-1} onClick={() => setShowIntToken(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                            {showIntToken ? eyeOff : eyeOpen}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Documentación de la API <span className="text-zinc-600">(opcional — para análisis IA)</span></label>
                        <textarea value={docApi} onChange={e => setDocApi(e.target.value)} rows={4} placeholder="Pega aquí la documentación, Swagger o ejemplos de endpoints…"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-sky-500 resize-none" />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {docApi.trim() && (
                          <button onClick={analizarDocs} disabled={analizando}
                            className="bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                            {analizando ? '🤖 Analizando...' : '🤖 Analizar con IA'}
                          </button>
                        )}
                        <button onClick={validarConexionApi} disabled={validando || !intUrl}
                          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                          {validando ? 'Validando...' : '✓ Validar conexión'}
                        </button>
                      </div>
                    </>

                  ) : pasoApi === 2 ? (
                    /* ── Paso 2 — Resultado IA ── */
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                        <p className="text-zinc-300 text-xs font-semibold">Endpoints detectados — edita si es necesario</p>
                      </div>
                      <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                        {(['clientes','cartera','empleados','recaudos'] as const).map(ep => (
                          <div key={ep} className="flex items-center gap-2">
                            <span className="text-zinc-500 text-xs w-20 flex-shrink-0">{ep}</span>
                            <select value={endpointsDetectados?.[ep]?.method ?? 'GET'}
                              onChange={e => setEndpointsDetectados((p: any) => ({ ...p, [ep]: { ...p?.[ep], method: e.target.value } }))}
                              className="bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1 text-white text-xs w-20 flex-shrink-0">
                              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option>
                            </select>
                            <input value={endpointsDetectados?.[ep]?.path ?? ''}
                              onChange={e => setEndpointsDetectados((p: any) => ({ ...p, [ep]: { ...p?.[ep], path: e.target.value } }))}
                              className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-2 py-1 text-white text-xs min-w-0" />
                          </div>
                        ))}
                        {mapeoIA && (
                          <div className="mt-2 pt-2 border-t border-zinc-700">
                            <p className="text-zinc-500 text-xs mb-1 font-semibold">Mapeo de campos sugerido</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                              {Object.entries(mapeoIA).map(([k, v]: any) => (
                                <p key={k} className="text-xs text-zinc-400"><span className="text-zinc-500">{k}:</span> {v}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setPasoApi(1)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">
                          ← Volver
                        </button>
                        <button onClick={validarConexionApi} disabled={validando || !intUrl}
                          className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                          {validando ? 'Validando...' : '✓ Validar conexión'}
                        </button>
                      </div>
                    </>

                  ) : (
                    /* ── Paso 3 — Resultados validación ── */
                    (() => {
                      const eps = resultValidacion ? Object.entries(resultValidacion) : []
                      const okCount = eps.filter(([, r]: any) => r.ok).length
                      return (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                            <p className="text-zinc-300 text-xs font-semibold">Resultado de validación</p>
                          </div>
                          <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                            {eps.map(([ep, r]: any) => (
                              <div key={ep} className="flex items-center gap-2 text-xs">
                                <span className="w-4">{r.ok ? '✅' : r.error === 'timeout' ? '⏱️' : '❌'}</span>
                                <span className="text-zinc-300 w-20 flex-shrink-0">{ep}</span>
                                <span className="text-zinc-500 font-mono text-xs truncate flex-1">{endpointsDetectados?.[ep]?.path ?? '/' + ep}</span>
                                <span className={`font-mono text-xs flex-shrink-0 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {r.ok ? `${r.status}` : r.error === 'timeout' ? 'timeout' : `${r.status || '???'}`}
                                </span>
                              </div>
                            ))}
                            <div className="pt-2 border-t border-zinc-700">
                              <p className={`text-xs font-semibold ${okCount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {okCount} de {eps.length} endpoints activos
                              </p>
                            </div>
                          </div>
                          {okCount > 0 ? (
                            <button onClick={activarApiConexion}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
                              🚀 Activar integración
                            </button>
                          ) : (
                            <>
                              <p className="text-red-400 text-xs">Ningún endpoint respondió. Verifica la URL base, el token y los paths.</p>
                              <button onClick={() => setPasoApi(endpointsDetectados ? 2 : 1)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">
                                ← Volver
                              </button>
                            </>
                          )}
                        </>
                      )
                    })()
                  )}
                </div>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Empresas vinculadas" icono="📦" isOpen={seccionAbierta === 'vinculadas'} onToggle={() => toggleSeccion('vinculadas')}>
            <div className="flex items-center justify-between">
              <p className="text-zinc-500 text-xs">Empresas externas con acceso a rutas via API</p>
              <div className="flex gap-2">
                <button onClick={() => { setModalConectarToken(true); setTokenInput(''); setTokenLookup(null); setTokenMsg('') }}
                  disabled={bodegaPuedeEnviar}
                  title={bodegaPuedeEnviar ? 'Tu empresa ya tiene bodega propia' : ''}
                  className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors">
                  🔗 Token
                </button>
                <button onClick={() => { setModalVinculada(true); setMsgVinculada('') }}
                  disabled={!bodegaPuedeEnviar}
                  title={!bodegaPuedeEnviar ? 'Requiere módulo bodega activo' : ''}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors">
                  + Nueva
                </button>
              </div>
            </div>
            {vinculadas.length === 0 && conectadas.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-3">Sin empresas vinculadas</p>
            ) : (
              <div className="space-y-2">
                {vinculadas.map(v => (
                  <div key={v.id} className="bg-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{v.nombre === 'Pendiente' ? '⏳ Esperando conexión' : v.nombre}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">{v._count?.rutas ?? 0} rutas · Generada por ti</p>
                    </div>
                    <button onClick={() => eliminarVinculada(v.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
                      Eliminar
                    </button>
                  </div>
                ))}
                {conectadas.map(v => (
                  <div key={v.id} className="bg-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">✅ {v.nombreEmpresaPrincipal}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">Conectada como cliente</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Seccion>
        </>
      )}

      {/* ── SUPERVISOR ── */}
      {user?.role === 'supervisor' && (
        <>
          <Seccion titulo="Mi empresa" icono="🏢" isOpen={seccionAbierta === 'empresa'} onToggle={() => toggleSeccion('empresa')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={labelClass}>NIT</p>
                  <div className={inputReadonlyClass}>{cfgEmpNit || <span className="text-zinc-600">—</span>}</div>
                </div>
                <div>
                  <p className={labelClass}>Teléfono</p>
                  <div className={inputReadonlyClass}>{cfgEmpTel || <span className="text-zinc-600">—</span>}</div>
                </div>
              </div>
              <div>
                <p className={labelClass}>Dirección</p>
                <div className={inputReadonlyClass}>{cfgEmpDir || <span className="text-zinc-600">—</span>}</div>
              </div>
            </div>
            <hr className="border-zinc-800" />
            {passwordFields}
          </Seccion>

          <Seccion titulo="Recibos" icono="🖨️" isOpen={seccionAbierta === 'recibos'} onToggle={() => toggleSeccion('recibos')}>
            <div>
              <label className={labelClass}>Ancho de papel</label>
              <div className="flex gap-2 flex-wrap">
                {anchoBtns.map(b => (
                  <button key={b.v} onClick={() => setCfgEmpAncho(b.v)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${cfgEmpAncho === b.v ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                    {b.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Prefijo recibo</label>
              <input value={cfgEmpPrefijo} onChange={e => setCfgEmpPrefijo(e.target.value.toUpperCase())} placeholder="REC" maxLength={6} className={inputClass} />
            </div>
            {msgRecibosEmp && <p className="text-sm text-emerald-400">{msgRecibosEmp}</p>}
            {btnGuardar(guardarRecibosEmpresa, savingRecibosEmp, savingRecibosEmp)}
          </Seccion>
        </>
      )}

      {/* ── EMPLEADOS ── */}
      {esSoloEmpleado && (
        <>
          <Seccion titulo="Mi perfil" icono="👤" isOpen={seccionAbierta === 'perfil'} onToggle={() => toggleSeccion('perfil')}>
            <div className="bg-zinc-800 rounded-xl px-4 py-3 space-y-0.5">
              <p className="text-zinc-400 text-xs">Email</p>
              <p className="text-white text-sm font-mono">{user?.email}</p>
              <p className="text-zinc-500 text-xs capitalize">{user?.role}</p>
            </div>
            {passwordFields}
          </Seccion>

          <Seccion titulo="Recibos" icono="🖨️" isOpen={seccionAbierta === 'recibos'} onToggle={() => toggleSeccion('recibos')}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Usar configuración de empresa</p>
                <p className="text-zinc-500 text-xs">Hereda el papel y prefijo de la empresa</p>
              </div>
              <button onClick={() => setCfgUsarEmpresa(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${cfgUsarEmpresa ? 'bg-emerald-600' : 'bg-zinc-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfgUsarEmpresa ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {!cfgUsarEmpresa && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Ancho de papel personal</label>
                  <div className="flex gap-2 flex-wrap">
                    {anchoBtns.map(b => (
                      <button key={b.v} onClick={() => setCfgAncho(b.v)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${cfgAncho === b.v ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Prefijo personal</label>
                  <input value={cfgPrefijo} onChange={e => setCfgPrefijo(e.target.value.toUpperCase())} placeholder="CL" maxLength={6} className={inputClass} />
                </div>
              </div>
            )}
            <div className="bg-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs">Consecutivo actual</p>
                <p className="text-white font-mono text-lg font-bold">{String(cfgConsecutivo).padStart(3, '0')}</p>
              </div>
            </div>
            {msgCfgPers && <p className="text-sm text-emerald-400">{msgCfgPers}</p>}
            {btnGuardar(guardarCfgPersonal, savingCfgPers, savingCfgPers)}
          </Seccion>
        </>
      )}

      {/* Sesión */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 flex items-center justify-between">
        <p className="text-zinc-400 text-sm">Sesión activa</p>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
          Cerrar sesión
        </button>
      </div>

      {/* Modal validación API UpTres */}
      {modalValidacion && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">🔌 API UpTres</h3>
              {faseConexion === 'listo' || faseConexion === 'error' ? (
                <button onClick={() => { setModalValidacion(false); setFaseConexion('idle') }} className="text-zinc-500 hover:text-white text-xl">×</button>
              ) : null}
            </div>
            {/* Endpoints */}
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-semibold uppercase">Endpoints</p>
              {Object.entries(endpointsFase).map(([k, estado]) => (
                <div key={k} className="flex items-center justify-between py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-300 text-sm capitalize">{k}</span>
                  <span className="text-xs">
                    {estado === 'cargando' && <span className="text-zinc-400 animate-pulse">⏳ validando...</span>}
                    {estado === 'ok' && <span className="text-emerald-400">✅ {validacion.counts?.[k] ?? 0} registros</span>}
                    {estado === 'error' && <span className="text-red-400">❌ sin acceso</span>}
                    {estado === 'pendiente' && <span className="text-zinc-600">—</span>}
                  </span>
                </div>
              ))}
            </div>
            {/* Fase actual */}
            <div className={`rounded-xl p-3 text-center text-sm font-semibold ${
              faseConexion === 'validando' ? 'bg-blue-500/10 text-blue-400' :
              faseConexion === 'conectando' ? 'bg-amber-500/10 text-amber-400' :
              faseConexion === 'sincronizando' ? 'bg-purple-500/10 text-purple-400' :
              faseConexion === 'listo' ? 'bg-emerald-500/10 text-emerald-400' :
              faseConexion === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {faseConexion === 'validando' && <span className="animate-pulse">🔄 Validando conexión...</span>}
              {faseConexion === 'conectando' && <span className="animate-pulse">🔗 Activando integración...</span>}
              {faseConexion === 'sincronizando' && <span className="animate-pulse">⚡ Sincronizando datos...</span>}
              {faseConexion === 'listo' && (
                <div className="space-y-1">
                  <p>✅ Todo listo</p>
                  {Object.keys(syncResultado).length > 0 && (
                    <div className="text-xs text-emerald-300 space-y-0.5 mt-1">
                      {syncResultado.clientes !== undefined && <p>👥 {syncResultado.clientes} clientes</p>}
                      {syncResultado.deudas !== undefined && <p>📋 {syncResultado.deudas} deudas</p>}
                    </div>
                  )}
                </div>
              )}
              {faseConexion === 'error' && <span>❌ {msgErp || 'Error de conexión'}</span>}
            </div>
            {faseConexion === 'error' && (
              <div className="flex gap-2">
                <button onClick={() => { setModalValidacion(false); setFaseConexion('idle') }} className="flex-1 bg-zinc-800 text-white py-2 rounded-xl text-sm">Cerrar</button>
                <button onClick={validarUpTres} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-semibold">🔄 Reintentar</button>
              </div>
            )}
            {faseConexion === 'listo' && (
              <button onClick={() => { setModalValidacion(false); setFaseConexion('idle') }} className="w-full bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold">✓ Cerrar</button>
            )}
          </div>
        </div>
      )}

      {/* Modal nueva vinculada */}
      {modalVinculada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { if (!tokenGenerado) setModalVinculada(false) }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            {!tokenGenerado ? (
              <>
                <h3 className="text-white font-semibold">Nueva empresa vinculada</h3>
                <div>
                  <label className="text-zinc-400 text-xs font-semibold block mb-1.5">Color identificador</label>
                  <div className="flex gap-2">
                    {['#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#84cc16', '#f59e0b'].map(c => (
                      <button key={c} onClick={() => setNuevaVinculada(p => ({ ...p, color: c }))}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${nuevaVinculada.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                {msgVinculada && <p className="text-sm text-red-400">{msgVinculada}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setModalVinculada(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">Cancelar</button>
                  <button onClick={crearVinculada} disabled={creandoVinculada}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
                    {creandoVinculada ? 'Generando...' : 'Generar token'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-white font-semibold">✅ Token generado</h3>
                <p className="text-zinc-400 text-xs">Comparte este token con la empresa. Solo se muestra una vez.</p>
                <div className="bg-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
                  <p className="text-white font-mono text-xs flex-1 break-all">{tokenGenerado}</p>
                  <button onClick={() => navigator.clipboard.writeText(tokenGenerado)}
                    className="text-violet-400 hover:text-violet-300 flex-shrink-0 text-xs font-semibold">Copiar</button>
                </div>
                <p className="text-amber-400 text-xs text-center">⚠️ Este token no volverá a mostrarse</p>
                <button onClick={() => { setTokenGenerado(null); setModalVinculada(false) }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-sm">
                  ✓ Ya lo copié, cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Modal ingresar token vinculación */}
      {modalConectarToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setModalConectarToken(false); setTokenLookup(null); setTokenMsg('') }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm space-y-4 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold">🔗 Conectar con empresa</h3>
            <p className="text-zinc-400 text-xs">Ingresa el token que te compartió la empresa para vincularse.</p>
            <input
              value={tokenInput}
              onChange={e => { setTokenInput(e.target.value); setTokenLookup(null); setTokenMsg('') }}
              placeholder="Pega el token aquí..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500 font-mono"
            />
            {tokenLookup && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                <p className="text-emerald-400 text-sm font-semibold">✅ Conectado a {tokenLookup.nombre}</p>
                <p className="text-zinc-400 text-xs mt-0.5">Confirma para completar la vinculación</p>
              </div>
            )}
            {tokenMsg && (
              <p className={`text-xs text-center ${tokenMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{tokenMsg}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setModalConectarToken(false); setTokenLookup(null); setTokenMsg('') }}
                className="flex-1 bg-zinc-800 text-white py-2 rounded-xl text-sm">Cancelar</button>
              {!tokenLookup ? (
                <button onClick={buscarToken} disabled={buscandoToken || !tokenInput.trim()}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold">
                  {buscandoToken ? 'Buscando...' : 'Verificar'}
                </button>
              ) : (
                <button onClick={confirmarConexionToken} disabled={conectandoToken}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold">
                  {conectandoToken ? 'Conectando...' : '✓ Confirmar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
