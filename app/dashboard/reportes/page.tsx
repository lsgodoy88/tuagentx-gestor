'use client'
import TarjetaVisita from '@/components/TarjetaVisita'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { checkPermiso } from '@/lib/permisos'

export default function ReportesPage() {
  const { data: session } = useSession()
  const user = session?.user as any
  const [datos, setDatos] = useState<any>({ visitas: [], empleados: [], resumenPorEmpleado: [], totales: {}, turnos: [] })
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [empleadoId, setEmpleadoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'dia' | 'ranking' | 'recaudos'>('dia')
  const [periodoRanking, setPeriodoRanking] = useState<'semana' | 'mes'>('semana')
  const [ranking, setRanking] = useState<any[]>([])

  useEffect(() => { loadData() }, [fecha, empleadoId])
  useEffect(() => { loadRanking() }, [periodoRanking])

  async function loadRanking() {
    const res = await fetch('/api/reportes?ranking=true&periodo=' + periodoRanking)
    const data = await res.json()
    setRanking(Array.isArray(data.ranking) ? data.ranking : [])
  }

  async function loadData() {
    setLoading(true)
    const params = new URLSearchParams({ fecha })
    if (empleadoId) params.append('empleadoId', empleadoId)
    const res = await fetch(`/api/reportes?${params}`)
    const data = await res.json()
    setDatos(data)
    setLoading(false)
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`

  if (user?.role === 'supervisor' && !checkPermiso(session, 'verReportes')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="text-white font-semibold">Sin acceso a reportes</p>
        <p className="text-zinc-400 text-sm">No tienes permiso para ver esta sección</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 tab-pills rounded-xl p-1">
        <button onClick={() => setTab('dia')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === 'dia' ? 'tab-active' : 'text-white hover:text-white'}`}>
          📊 Por día
        </button>
        <button onClick={() => setTab('ranking')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === 'ranking' ? 'tab-active' : 'text-white hover:text-white'}`}>
          🏆 Ranking
        </button>
        <button onClick={() => setTab('recaudos')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors text-center ${tab === 'recaudos' ? 'tab-active' : 'text-white hover:text-white'}`}>
          💰 Recaudos
        </button>
      </div>

      {tab === 'ranking' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setPeriodoRanking('semana')}
              className={"flex-1 py-2 rounded-xl text-sm font-semibold border transition-all " + (periodoRanking === 'semana' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400")}>
              Esta semana
            </button>
            <button onClick={() => setPeriodoRanking('mes')}
              className={"flex-1 py-2 rounded-xl text-sm font-semibold border transition-all " + (periodoRanking === 'mes' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400")}>
              Este mes
            </button>
          </div>
          <div className="space-y-2">
            {ranking.map((r: any, i: number) => (
              <div key={r.empleadoId} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
                <div className={"w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 " + (i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-zinc-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-zinc-700 text-white")}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{r.nombre}</p>
                  <p className="text-zinc-500 text-xs capitalize">{r.rol}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-emerald-400 font-bold">${Number(r.totalVentas || 0).toLocaleString('es-CO')}</p>
                  <p className="text-zinc-500 text-xs">{r.totalVisitas} visitas</p>
                </div>
              </div>
            ))}
            {ranking.length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                <p className="text-zinc-500 text-sm">Sin datos para este periodo</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'dia' && (
        <>
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-emerald-500" />
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-emerald-500">
          <option value="">Todos los empleados</option>
          {datos.empleados.map((e: any) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total gestiones', value: datos.totales.total || 0, icon: '📍', sub: null },
          { label: 'Ventas', value: datos.totales.ventas || 0, icon: '💰', sub: fmt(datos.totales.montoVentas || 0) },
          { label: 'Cobros', value: datos.totales.cobros || 0, icon: '💵', sub: fmt(datos.totales.montoCobros || 0) },
          { label: 'Entregas', value: datos.totales.entregas || 0, icon: '📦', sub: null },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-zinc-400 text-xs">{s.label}</div>
            {s.sub && <div className="text-emerald-400 text-xs font-semibold mt-1">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Resumen por empleado */}
      {datos.resumenPorEmpleado.length > 0 && (
        <div className="space-y-3">
          <p className="text-zinc-400 text-xs font-semibold">RESUMEN POR EMPLEADO</p>
          {datos.resumenPorEmpleado
            .sort((a: any, b: any) => b.total - a.total)
            .map((r: any) => (
              <div key={r.empleado.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-zinc-700 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {r.empleado.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">{r.empleado.nombre}</p>
                    <p className="text-zinc-500 text-xs capitalize">{r.empleado.rol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.enTurno && <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">En turno</span>}
                    <span className="text-white font-bold text-lg">{r.total}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.visitas}</p>
                    <p className="text-zinc-500 text-xs">👁️ Visitas</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.ventas}</p>
                    <p className="text-zinc-500 text-xs">💰 Ventas</p>
                    {r.montoVentas > 0 && <p className="text-emerald-400 text-xs">{fmt(r.montoVentas)}</p>}
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.cobros}</p>
                    <p className="text-zinc-500 text-xs">💵 Cobros</p>
                    {r.montoCobros > 0 && <p className="text-emerald-400 text-xs">{fmt(r.montoCobros)}</p>}
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-2 text-center">
                    <p className="text-white font-bold">{r.entregas}</p>
                    <p className="text-zinc-500 text-xs">📦 Entregas</p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Detalle de visitas */}
      {datos.visitas.length > 0 && (
        <div className="space-y-3">
          <p className="text-zinc-400 text-xs font-semibold">DETALLE DE GESTIONES</p>
          <div className="space-y-2">
            {datos.visitas.map((v: any) => (
              <TarjetaVisita key={v.id} visita={v} mostrarEmpleado mostrarCliente colapsado />
            ))}
          </div>
        </div>
      )}

      {datos.visitas.length === 0 && !loading && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-zinc-400">Sin actividad en esta fecha</p>
        </div>
      )}
        </>
      )}

      {tab === 'recaudos' && <TabRecaudos />}
    </div>
  )
}

// ─── Tab Recaudos ───────────────────────────────────────────────────────────
function TabRecaudos() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0,7))
  const [empleadoId, setEmpleadoId] = useState<string>('all')
  const [metodo, setMetodo] = useState<string>('all')

  async function load() {
    setLoading(true)
    const p = new URLSearchParams({ mes })
    if (empleadoId !== 'all') p.set('empleadoId', empleadoId)
    if (metodo !== 'all') p.set('metodo', metodo)
    const r = await fetch(`/api/reportes/recaudos?${p}`)
    const d = await r.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [mes, empleadoId, metodo])

  function fmtFecha(iso: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    // Bogotá UTC-5
    const bog = new Date(d.getTime() - 5*60*60*1000)
    const dd = String(bog.getUTCDate()).padStart(2,'0')
    const mm = String(bog.getUTCMonth()+1).padStart(2,'0')
    const yy = String(bog.getUTCFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
  }

  function diffDias(a: string, b: string) {
    if (!a || !b) return 0
    return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
  }

  function iconoDif(reg: string, pag: string) {
    const d = Math.abs(diffDias(reg, pag))
    if (d <= 1) return null
    if (d <= 7) return <span className="text-yellow-400 text-[10px] ml-1">⚠️{d}d</span>
    return <span className="text-red-400 text-[10px] ml-1">⚠️{d}d</span>
  }

  function exportarCSV() {
    if (!data?.filas?.length) return
    const headers = ['Registrado','Pagado','Vendedor','Cliente','Factura','Venta','Saldo ant.','Monto','Descuento','Método','Notas']
    const rows = data.filas.map((f: any) => [
      fmtFecha(f.registrado), fmtFecha(f.pagado), f.vendedor, f.cliente, f.factura ?? '',
      f.venta ?? '', f.saldoAnterior ?? '', f.monto, f.descuento, f.metodo, f.notas ?? ''
    ])
    const csv = [headers, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `recaudos-${mes}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-zinc-500 text-xs">Mes</label>
            <input type="month" value={mes} onChange={e => setMes(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm" />
          </div>
          <div>
            <label className="text-zinc-500 text-xs">Vendedor</label>
            <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm">
              <option value="all">Todos</option>
              {data?.empleados?.map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-zinc-500 text-xs">Método</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm">
              <option value="all">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="nequi">Nequi</option>
              <option value="banco">Banco</option>
            </select>
          </div>
          <button onClick={exportarCSV} disabled={!data?.filas?.length}
            className="self-end bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
            📥 Exportar
          </button>
        </div>
      </div>

      {/* Totales */}
      {data?.totales && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-xs">Total recaudado</p>
            <p className="text-emerald-400 font-bold text-lg">{fmtMoney(data.totales.totalRecaudado)}</p>
            <p className="text-zinc-500 text-xs">{data.totales.cantidad} pagos</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-xs">Descuentos</p>
            <p className="text-orange-400 font-bold text-lg">{fmtMoney(data.totales.totalDescuento)}</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading && <p className="text-zinc-500 text-sm text-center py-4">Cargando...</p>}
      {!loading && data?.filas?.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">Sin pagos en este filtro</p>}
      {!loading && data?.filas?.length > 0 && (
        <div className="space-y-2">
          {data.filas.map((f: any) => (
            <div key={f.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-white font-semibold truncate flex-1">{f.cliente}</p>
                <p className="text-emerald-400 font-bold whitespace-nowrap">{fmtMoney(f.monto)}</p>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-400">
                <span>Reg: {fmtFecha(f.registrado)}</span>
                <span>Pag: {fmtFecha(f.pagado)}{iconoDif(f.registrado, f.pagado)}</span>
                <span>{f.vendedor}</span>
                {f.factura && <span>F#{f.factura}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500">
                {f.venta != null && <span>Venta {fmtMoney(f.venta)}</span>}
                {f.saldoAnterior != null && <span>Saldo ant. {fmtMoney(f.saldoAnterior)}</span>}
                {f.descuento > 0 && <span className="text-orange-400">Desc {fmtMoney(f.descuento)}</span>}
                <span className="capitalize">{f.metodo}</span>
              </div>
              <div className="flex gap-3 pt-1">
                {f.voucherKey && <a href={`/api/voucher/${encodeURIComponent(f.voucherKey)}`} target="_blank" className="text-blue-400 text-xs">📎 Voucher</a>}
                {f.reciboToken && <a href={`/recaudo/recibo?token=${f.reciboToken}`} target="_blank" className="text-blue-400 text-xs">🧾 Recibo</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
