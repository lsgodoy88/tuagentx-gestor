'use client'
import { useState, useEffect } from 'react'

export function useConfigEntregas(role: string | undefined, empresaId?: string) {
  const [horaInicio, setHoraInicio] = useState('07:00')
  const [horaFin, setHoraFin] = useState('21:00')
  const [autoCrearRuta, setAutoCrearRuta] = useState(false)
  const [autoCerrarRuta, setAutoCerrarRuta] = useState(false)
  const [autoAbrirTurno, setAutoAbrirTurno] = useState(false)
  const [autoCerrarTurno, setAutoCerrarTurno] = useState(false)
  const [diasCrear, setDiasCrear] = useState<number[]>([0, 1, 2, 3, 4])
  const [diasCerrar, setDiasCerrar] = useState<number[]>([0, 1, 2, 3, 4])
  const [ciudadEntregaLocal, setCiudadEntregaLocal] = useState('')
  const [diasHistorialBodega, setDiasHistorialBodega] = useState(7)
  const [bodegaPuedeEnviar, setBodegaPuedeEnviar] = useState(false)
  const [tieneBodega, setTieneBodega] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [fechaInicioBodegaPropia, setFechaInicioBodegaPropia] = useState('')
  const [sincInicioMsg, setSincInicioMsg] = useState('')
  const [msgRutas, setMsgRutas] = useState('')
  const [savingRutas, setSavingRutas] = useState(false)

  useEffect(() => {
    if (role !== 'empresa') return
    fetch('/api/mi-empresa/config').then(r => r.json()).then(d => {
      if (d.horaInicioRuta) setHoraInicio(d.horaInicioRuta)
      if (d.horaFinRuta) setHoraFin(d.horaFinRuta)
      setAutoCrearRuta(d.autoCrearRuta ?? false)
      setAutoCerrarRuta(d.autoCerrarRuta ?? false)
      setAutoAbrirTurno(d.autoAbrirTurno ?? false)
      setAutoCerrarTurno(d.autoCerrarTurno ?? false)
      if (d.diasCrearRuta) setDiasCrear(d.diasCrearRuta.split(',').map(Number))
      if (d.diasCerrarRuta) setDiasCerrar(d.diasCerrarRuta.split(',').map(Number))
      setCiudadEntregaLocal(d.ciudadEntregaLocal ?? '')
      setDiasHistorialBodega(d.diasHistorialBodega ?? 7)
      setBodegaPuedeEnviar(d.bodegaPuedeEnviar ?? false)
      setTieneBodega(d.tieneBodega ?? false)
    }).catch(() => {})

    fetch('/api/clientes?page=1&limit=500').then(r => r.json()).then(d => setClientes(d.clientes || [])).catch(() => {})
    fetch('/api/configuracion/bodega-inicio').then(r => r.json()).then(d => {
      if (d.fechaInicioBodega) setFechaInicioBodegaPropia(d.fechaInicioBodega.split('T')[0])
    }).catch(() => {})
  }, [role])

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
        autoAbrirTurno, autoCerrarTurno,
        diasCrearRuta: diasCrear.join(','), diasCerrarRuta: diasCerrar.join(','),
        ciudadEntregaLocal: ciudadEntregaLocal || null,
        diasHistorialBodega, bodegaPuedeEnviar,
      }),
    })
    setSavingRutas(false)
    setMsgRutas(res.ok ? '✅ Guardado' : 'Error al guardar')
    setTimeout(() => setMsgRutas(''), 3000)
  }

  async function guardarFechaInicioBodegaPropia(fecha: string) {
    setSincInicioMsg('')
    const res = await fetch('/api/configuracion/bodega-inicio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fechaInicioBodega: fecha || null }),
    })
    const d = await res.json()
    setSincInicioMsg(d.canceladas > 0 ? `✅ Fecha guardada. ${d.canceladas} órdenes inactivadas.` : '✅ Fecha guardada.')
  }

  return {
    horaInicio, setHoraInicio,
    horaFin, setHoraFin,
    autoCrearRuta, setAutoCrearRuta,
    autoCerrarRuta, setAutoCerrarRuta,
    autoAbrirTurno, setAutoAbrirTurno,
    autoCerrarTurno, setAutoCerrarTurno,
    diasCrear, diasCerrar, toggleDia,
    ciudadEntregaLocal, setCiudadEntregaLocal,
    diasHistorialBodega, setDiasHistorialBodega,
    bodegaPuedeEnviar, setBodegaPuedeEnviar,
    tieneBodega, clientes,
    fechaInicioBodegaPropia, setFechaInicioBodegaPropia,
    sincInicioMsg, msgRutas, savingRutas,
    guardarConfigEntregas, guardarFechaInicioBodegaPropia,
  }
}

export type ConfigEntregas = ReturnType<typeof useConfigEntregas>
