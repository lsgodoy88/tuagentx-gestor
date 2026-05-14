'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType, Position, Handle
} from 'reactflow'
import 'reactflow/dist/style.css'

type Modulo = { nombre: string; ruta: string; archivo: string; botones: string[]; endpoints: string[]; propiedades: string[]; roles: string[]; lineas: number }
type Endpoint = { ruta: string; archivo: string; metodos: string[]; tablas: string[]; lineas: number }
type Modelo = { nombre: string; campos: { name: string; type: string }[]; totalCampos: number }
type Cron = { job: string; cron: string }
type Adaptador = { adaptador: string; metodos: string[] }
type CodeMap = {
  generadoEn: string
  resumen: { modulos: number; endpoints: number; modelos: number; crons: number; adaptadores: number; envKeys: number }
  modulos: Modulo[]
  endpoints: Endpoint[]
  modelos: Modelo[]
  crons: Cron[]
  adaptadores: Adaptador[]
  envKeys: string[]
}

// Nodo personalizado con colores por tipo
function NodoCustom({ data }: any) {
  const colores: Record<string, string> = {
    raiz: 'bg-purple-600 border-purple-400 text-white',
    modulo: 'bg-emerald-900/80 border-emerald-500 text-emerald-100',
    endpoint: 'bg-cyan-900/80 border-cyan-500 text-cyan-100',
    tabla: 'bg-orange-900/80 border-orange-500 text-orange-100',
    cron: 'bg-yellow-900/80 border-yellow-500 text-yellow-100',
    adapter: 'bg-pink-900/80 border-pink-500 text-pink-100',
    externo: 'bg-zinc-800 border-zinc-500 text-zinc-100 border-dashed',
  }
  return (
    <div className={`px-3 py-2 rounded-lg border-2 shadow-lg ${colores[data.tipo] || 'bg-zinc-900 border-zinc-700'} cursor-pointer hover:scale-105 transition`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
      <div className="font-semibold text-xs">{data.label}</div>
      {data.subtitle && <div className="text-[10px] opacity-70 mt-0.5">{data.subtitle}</div>}
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
    </div>
  )
}

const nodeTypes = { custom: NodoCustom }

export default function CodePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<CodeMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [vista, setVista] = useState<'diagrama' | 'lista'>('diagrama')
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'modulos' | 'endpoints' | 'modelos' | 'crons' | 'integraciones' | 'env'>('modulos')
  const [filtro, setFiltro] = useState('')
  const [detalleNodo, setDetalleNodo] = useState<any>(null)

  useEffect(() => {
    if (status === 'authenticated' && (session?.user as any)?.role !== 'superadmin') router.push('/dashboard')
  }, [status, session, router])

  async function cargar() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/code-map')
      if (res.ok) setData(await res.json())
    } catch {}
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  // Construir grafo
  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] }
    const N: any[] = []
    const E: any[] = []
    let edgeId = 0
    const addEdge = (s: string, t: string, color = '#52525b') => {
      E.push({ id: `e${edgeId++}`, source: s, target: t, animated: false, style: { stroke: color, strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color } })
    }

    // Nodo raíz Gestor
    N.push({
      id: 'root', type: 'custom', position: { x: 0, y: 0 },
      data: { label: '🧬 Gestor', subtitle: `${data.resumen.modulos} módulos`, tipo: 'raiz', detalle: data.resumen }
    })

    // UpTres externo
    N.push({
      id: 'uptres', type: 'custom', position: { x: -700, y: 0 },
      data: { label: '☁ UpTres API', subtitle: data.adaptadores.find(a => a.adaptador === 'uptres')?.metodos.length + ' métodos', tipo: 'externo', detalle: data.adaptadores.find(a => a.adaptador === 'uptres') }
    })
    addEdge('uptres', 'root', '#ec4899')

    // Columnas: módulos (centro), endpoints (derecha), tablas (más derecha), crons (abajo)
    // Módulos UI
    const modulos = data.modulos.filter(m => m.endpoints.length > 0 || m.botones.length > 0)
    modulos.forEach((m, i) => {
      const id = `mod-${m.nombre}`
      N.push({
        id, type: 'custom',
        position: { x: 300, y: -modulos.length * 35 + i * 70 },
        data: { label: `📱 ${m.nombre}`, subtitle: `${m.botones.length} btn · ${m.endpoints.length} api`, tipo: 'modulo', detalle: m }
      })
      addEdge('root', id, '#10b981')
      // Conectar a endpoints que llama
      m.endpoints.forEach(ep => {
        const cleanEp = ep.replace(/\/$/, '')
        const epId = `ep-${cleanEp}`
        addEdge(id, epId, '#06b6d4')
      })
    })

    // Endpoints API
    data.endpoints.forEach((e, i) => {
      const id = `ep-${e.ruta}`
      N.push({
        id, type: 'custom',
        position: { x: 700, y: -data.endpoints.length * 22 + i * 44 },
        data: { label: `${e.metodos.join(' ')} ${e.ruta.replace('/api', '')}`, subtitle: e.tablas.length ? `→ ${e.tablas.slice(0, 2).join(', ')}` : '', tipo: 'endpoint', detalle: e }
      })
      // Conectar endpoint → tablas
      e.tablas.forEach(t => {
        const tId = `tbl-${t}`
        addEdge(id, tId, '#f97316')
      })
    })

    // Tablas
    data.modelos.forEach((m, i) => {
      const id = `tbl-${m.nombre}`
      N.push({
        id, type: 'custom',
        position: { x: 1100, y: -data.modelos.length * 22 + i * 44 },
        data: { label: `📊 ${m.nombre}`, subtitle: `${m.totalCampos} campos`, tipo: 'tabla', detalle: m }
      })
    })

    // Crons (abajo)
    data.crons.forEach((c, i) => {
      const id = `cron-${i}`
      N.push({
        id, type: 'custom',
        position: { x: -300 + i * 200, y: 500 },
        data: { label: `⏰ ${c.job}`, subtitle: c.cron, tipo: 'cron', detalle: c }
      })
      addEdge(id, 'root', '#eab308')
    })

    return { nodes: N, edges: E }
  }, [data])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setRfNodes(nodes)
    setRfEdges(edges)
  }, [nodes, edges, setRfNodes, setRfEdges])

  const onNodeClick = useCallback((_: any, node: any) => {
    setDetalleNodo(node.data)
  }, [])

  function toggle(k: string) { setExpandido(s => ({ ...s, [k]: !s[k] })) }

  const f = filtro.toLowerCase()
  const modulosFilt = data?.modulos.filter(m =>
    !f || m.nombre.includes(f) || m.ruta.includes(f) ||
    m.botones.some(b => b.toLowerCase().includes(f)) ||
    m.endpoints.some(e => e.toLowerCase().includes(f))
  ) || []
  const endpointsFilt = data?.endpoints.filter(e =>
    !f || e.ruta.toLowerCase().includes(f) || e.tablas.some(t => t.toLowerCase().includes(f))
  ) || []
  const modelosFilt = data?.modelos.filter(m =>
    !f || m.nombre.toLowerCase().includes(f) || m.campos.some(c => c.name.toLowerCase().includes(f))
  ) || []

  if (status === 'loading' || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-3">🧬 Code</h1>
        <div className="text-zinc-500">{loading ? 'Escaneando…' : 'Cargando…'}</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">🧬 Code · Mapa</h1>
          <p className="text-zinc-500 text-[10px]">{new Date(data.generadoEn).toLocaleString('es-CO')}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="bg-zinc-900 rounded-lg flex border border-zinc-800">
            <button onClick={() => setVista('diagrama')}
              className={`px-3 py-1.5 text-xs rounded-lg ${vista === 'diagrama' ? 'bg-emerald-600 text-white' : 'text-zinc-400'}`}>
              🕸 Diagrama
            </button>
            <button onClick={() => setVista('lista')}
              className={`px-3 py-1.5 text-xs rounded-lg ${vista === 'lista' ? 'bg-emerald-600 text-white' : 'text-zinc-400'}`}>
              📋 Lista
            </button>
          </div>
          <button onClick={cargar} disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">
            {loading ? '⏳' : '🔄'} Sync
          </button>
        </div>
      </div>

      {/* Resumen chips */}
      <div className="px-3 py-2 flex gap-2 overflow-x-auto border-b border-zinc-800 text-xs">
        {[
          { l: 'Módulos', v: data.resumen.modulos, c: 'text-emerald-400' },
          { l: 'Endpoints', v: data.resumen.endpoints, c: 'text-cyan-400' },
          { l: 'Tablas', v: data.resumen.modelos, c: 'text-orange-400' },
          { l: 'Crons', v: data.resumen.crons, c: 'text-yellow-400' },
          { l: 'Adapters', v: data.resumen.adaptadores, c: 'text-pink-400' },
          { l: 'Env', v: data.resumen.envKeys, c: 'text-zinc-400' },
        ].map(s => (
          <div key={s.l} className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 whitespace-nowrap">
            <span className={`font-bold ${s.c}`}>{s.v}</span>{' '}
            <span className="text-zinc-500">{s.l}</span>
          </div>
        ))}
      </div>

      {/* Vista Diagrama */}
      {vista === 'diagrama' && (
        <div className="flex-1 relative bg-zinc-950">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#27272a" gap={20} />
            <Controls className="!bg-zinc-900 !border-zinc-700" />
            <MiniMap
              className="!bg-zinc-900 !border !border-zinc-700"
              nodeColor={(n: any) => {
                const c: Record<string, string> = {
                  raiz: '#9333ea', modulo: '#10b981', endpoint: '#06b6d4',
                  tabla: '#f97316', cron: '#eab308', adapter: '#ec4899', externo: '#71717a'
                }
                return c[n.data?.tipo] || '#525252'
              }}
            />
          </ReactFlow>

          {/* Panel detalle al hacer click */}
          {detalleNodo && (
            <div className="absolute top-4 right-4 w-96 max-h-[80vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl z-10">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-white font-bold">{detalleNodo.label}</h3>
                <button onClick={() => setDetalleNodo(null)} className="text-zinc-500 hover:text-white">×</button>
              </div>
              {detalleNodo.subtitle && <p className="text-zinc-400 text-xs mb-3">{detalleNodo.subtitle}</p>}
              {detalleNodo.detalle && (
                <pre className="text-xs text-zinc-300 bg-zinc-950 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(detalleNodo.detalle, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Leyenda */}
          <div className="absolute bottom-4 left-4 bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-[10px] space-y-1 z-10">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500"></span><span className="text-zinc-300">Raíz</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span><span className="text-zinc-300">Módulo UI</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500"></span><span className="text-zinc-300">Endpoint API</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500"></span><span className="text-zinc-300">Tabla DB</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-500"></span><span className="text-zinc-300">Cron</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-pink-500"></span><span className="text-zinc-300">Externo</span></div>
          </div>
        </div>
      )}

      {/* Vista Lista (igual que antes) */}
      {vista === 'lista' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-1 mb-3 overflow-x-auto">
            {(['modulos', 'endpoints', 'modelos', 'crons', 'integraciones', 'env'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-lg text-xs whitespace-nowrap ${tab === t ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'}`}>
                {t}
              </button>
            ))}
          </div>
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white mb-3" />

          {tab === 'modulos' && modulosFilt.map(m => {
            const k = `mod-${m.nombre}`; const isOpen = !!expandido[k]
            return (
              <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-lg mb-2">
                <button onClick={() => toggle(k)} className="w-full flex items-center justify-between p-3 text-left">
                  <div>
                    <div className="text-white font-semibold text-sm">{isOpen ? '▾' : '▸'} {m.nombre}</div>
                    <div className="text-zinc-500 text-xs">{m.ruta} · {m.lineas} líneas</div>
                  </div>
                  <div className="flex gap-1 text-xs">{m.roles.slice(0, 3).map(r => <span key={r} className="bg-zinc-800 text-zinc-400 px-2 rounded">{r}</span>)}</div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 text-xs border-t border-zinc-800 pt-2">
                    {m.botones.length > 0 && <div><div className="text-zinc-500 mb-1">🔘 Botones</div>
                      <div className="flex flex-wrap gap-1">{m.botones.map((b, i) => <span key={i} className="bg-zinc-800/60 text-zinc-300 px-2 py-0.5 rounded">{b}</span>)}</div></div>}
                    {m.endpoints.length > 0 && <div><div className="text-zinc-500 mb-1">🔗 Endpoints</div>
                      {m.endpoints.map((e, i) => <div key={i} className="text-cyan-300 font-mono">{e}</div>)}</div>}
                    {m.propiedades.length > 0 && <div><div className="text-zinc-500 mb-1">⚙ useState</div>
                      <div className="flex flex-wrap gap-1">{m.propiedades.map((p, i) => <span key={i} className="bg-purple-900/30 text-purple-300 px-2 rounded font-mono">{p}</span>)}</div></div>}
                  </div>
                )}
              </div>
            )
          })}

          {tab === 'endpoints' && endpointsFilt.map((e, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-2 text-xs">
              <div className="flex justify-between flex-wrap">
                <div className="font-mono text-cyan-300">{e.ruta}</div>
                <div className="flex gap-1">{e.metodos.map(mm => <span key={mm} className="bg-blue-900/40 text-blue-300 px-2 rounded font-bold">{mm}</span>)}</div>
              </div>
              {e.tablas.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.tablas.map(t => <span key={t} className="bg-orange-900/30 text-orange-300 px-2 rounded">📊 {t}</span>)}</div>}
            </div>
          ))}

          {tab === 'modelos' && modelosFilt.map(m => {
            const k = `tbl-${m.nombre}`; const isOpen = !!expandido[k]
            return (
              <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-lg mb-2">
                <button onClick={() => toggle(k)} className="w-full flex justify-between p-3 text-left text-xs">
                  <div className="text-white font-semibold">{isOpen ? '▾' : '▸'} {m.nombre}</div>
                  <div className="text-zinc-500">{m.totalCampos} campos</div>
                </button>
                {isOpen && <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                  {m.campos.map((c, i) => <div key={i} className="font-mono"><span className="text-white">{c.name}</span> <span className="text-zinc-600">{c.type}</span></div>)}
                </div>}
              </div>
            )
          })}

          {tab === 'crons' && data.crons.map((c, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-2 flex justify-between text-xs">
              <div className="text-white">{c.job}</div><div className="font-mono text-yellow-300">{c.cron}</div>
            </div>
          ))}

          {tab === 'integraciones' && data.adaptadores.map((a, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-2 text-xs">
              <div className="text-white font-semibold mb-1">🔌 {a.adaptador}</div>
              <div className="flex flex-wrap gap-1">{a.metodos.map(m => <span key={m} className="bg-cyan-900/30 text-cyan-300 px-2 rounded font-mono">{m}()</span>)}</div>
            </div>
          ))}

          {tab === 'env' && <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-1 text-xs font-mono">
            {data.envKeys.map(k => <div key={k} className="text-zinc-300">{k}</div>)}
          </div>}
        </div>
      )}
    </div>
  )
}
