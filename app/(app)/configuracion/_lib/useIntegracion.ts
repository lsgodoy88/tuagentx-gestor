'use client'
import { useState } from 'react'
import type { FaseConexion, EstadoEndpoint, ModoIntegracion, PasoApi, Validacion } from './tipos'

export function useIntegracion() {
  const [modoSel, setModoSel] = useState<ModoIntegracion>('erp')
  const [modoActivo, setModoActivo] = useState<ModoIntegracion>('erp')

  // UpTres
  const [erpConectado, setErpConectado] = useState(false)
  const [erpNombre, setErpNombre] = useState('')
  const [uptresApiKey, setUptresApiKey] = useState('')
  const [uptresApiSecret, setUptresApiSecret] = useState('')
  const [showUptresSecret, setShowUptresSecret] = useState(false)
  const [conectandoErp, setConectandoErp] = useState(false)
  const [msgErp, setMsgErp] = useState('')
  const [syncInicial, setSyncInicial] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincronizandoNocturno, setSincronizandoNocturno] = useState(false)
  const [msgSync, setMsgSync] = useState('')
  const [ultimaSync, setUltimaSync] = useState('')
  const [syncHistorial, setSyncHistorial] = useState<any[]>([])
  const [modalValidacion, setModalValidacion] = useState(false)
  const [faseConexion, setFaseConexion] = useState<FaseConexion>('idle')
  const [endpointsFase, setEndpointsFase] = useState<Record<string, EstadoEndpoint>>({})
  const [syncResultado, setSyncResultado] = useState<Record<string, number>>({})
  const [validacion, setValidacion] = useState<Validacion>({ ok: false, endpoints: {}, counts: {}, activeCount: 0 })

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
  const [pasoApi, setPasoApi] = useState<PasoApi>(1)

  function nowBogota() {
    return new Date(Date.now() - 5 * 60 * 60 * 1000).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  }

  function initFromEstado(d: any) {
    if (d.conectado) {
      setErpConectado(true)
      setErpNombre(d.nombre ?? '')
      setSyncInicial(d.syncInicial ?? false)
      setUltimaSync(d.ultimaSync ?? '')
      setSyncHistorial(d.historial || [])
      setModoActivo('erp')
      setModoSel('erp')
    }
  }

  function initFromRecibosConfig(d: any) {
    if (!d.error) {
      const url = d.urlApi ?? ''
      const tok = d.tokenApi ?? ''
      setIntUrl(url)
      setIntToken(tok)
      if (url) { setModoActivo('api'); setModoSel('api') }
    }
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
    const epFase: Record<string, 'ok' | 'error'> = {}
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
      setUltimaSync(nowBogota())
      setSyncResultado({ clientes: dataSync.clientesActualizados ?? 0, deudas: dataSync.deudasInsertadas ?? 0 })
      setFaseConexion('listo')
    } else {
      setFaseConexion('error')
      setMsgErp(dataSync.error || 'Error en sync inicial')
    }
  }

  async function desconectarERP() {
    await fetch('/api/integracion/conectar', { method: 'DELETE' })
    setErpConectado(false); setErpNombre(''); setUptresApiKey(''); setUptresApiSecret(''); setUltimaSync('')
    setModoActivo('erp'); setModoSel('erp')
  }

  async function ejecutarSyncInicial() {
    setSincronizando(true); setMsgSync('')
    const res = await fetch('/api/integracion/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'inicial' }) })
    const data = await res.json()
    setSincronizando(false)
    if (data.ok) {
      setMsgSync(`✅ ${data.clientes ?? data.clientesActualizados ?? 0} clientes · ${data.empleados ?? data.empleadosSincronizados ?? 0} empleados · ${data.deudas ?? data.deudasInsertadas ?? 0} deudas`)
      setSyncInicial(true)
      setUltimaSync(nowBogota())
      setSyncResultado({ clientes: data.clientes ?? data.clientesActualizados ?? 0, empleados: data.empleados ?? data.empleadosSincronizados ?? 0, deudas: data.deudas ?? data.deudasInsertadas ?? 0 })
    } else {
      setMsgSync(data.error || 'Error en sincronización')
    }
  }

  async function syncDelta() {
    setSincronizando(true); setMsgSync('')
    const res = await fetch('/api/integracion/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'delta' }) })
    const data = await res.json()
    setSincronizando(false)
    if (data.ok) {
      setMsgSync(`✅ Delta: ${data.clientesActualizados ?? 0} clientes · ${data.empleadosSincronizados ?? 0} empleados · ${data.deudasInsertadas ?? 0} deudas`)
      setUltimaSync(nowBogota())
      setSyncResultado({ clientes: data.clientesActualizados ?? 0, empleados: data.empleadosSincronizados ?? 0, deudas: data.deudasInsertadas ?? 0 })
    } else {
      setMsgSync(data.error || 'Error en sync delta')
    }
  }

  async function syncNocturno() {
    setSincronizandoNocturno(true); setMsgSync('')
    const res = await fetch('/api/sync/nocturno?modo=completo', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    const data = await res.json()
    setSincronizandoNocturno(false)
    if (data.ok) {
      const r = data.resultados?.[0]
      setMsgSync(`✅ Nocturno: ${r?.deudas ?? 0} deudas · ${r?.clientesCache ?? 0} clientes cache`)
    } else {
      setMsgSync(data.error || 'Error en sync nocturno')
    }
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
    setPasoApi(1); setModoActivo('erp'); setModoSel('erp')
  }

  return {
    modoSel, setModoSel, modoActivo, setModoActivo,
    erpConectado, erpNombre, uptresApiKey, setUptresApiKey,
    uptresApiSecret, setUptresApiSecret, showUptresSecret, setShowUptresSecret,
    conectandoErp, msgErp, syncInicial, sincronizando, sincronizandoNocturno,
    msgSync, ultimaSync, syncHistorial, modalValidacion, setModalValidacion,
    faseConexion, setFaseConexion, endpointsFase, syncResultado, validacion,
    intUrl, setIntUrl, intToken, setIntToken, showIntToken, setShowIntToken,
    docApi, setDocApi, analizando, endpointsDetectados, setEndpointsDetectados,
    mapeoIA, validando, msgValidar, resultValidacion, pasoApi, setPasoApi,
    initFromEstado, initFromRecibosConfig,
    validarUpTres, desconectarERP,
    ejecutarSyncInicial, syncDelta, syncNocturno,
    analizarDocs, validarConexionApi, activarApiConexion, desconectarApi,
  }
}

export type Integracion = ReturnType<typeof useIntegracion>
