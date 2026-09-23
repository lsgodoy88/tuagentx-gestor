'use client'
import { useEffect, useState } from 'react'

export function useTurnos() {
  const [subTabRutas, setSubTabRutas] = useState<'hoy' | 'historial'>('hoy')
  const [turnosHoy, setTurnosHoy] = useState<any[]>([])
  const [turnosHistorial, setTurnosHistorial] = useState<any[]>([])
  const [filtroRol, setFiltroRol] = useState('')
  const [loadingTurnos, setLoadingTurnos] = useState(false)
  const [paginaHist, setPaginaHist] = useState(1)
  const [totalPaginasHist, setTotalPaginasHist] = useState(1)
  const [totalHist, setTotalHist] = useState(0)

  async function cargarTurnos(modo: 'hoy' | 'historial', rol = '', page = 1) {
    setLoadingTurnos(true)
    try {
      const res = await fetch(`/api/turnos/admin?modo=${modo}&rol=${rol}&page=${page}`)
      const data = await res.json()
      if (modo === 'hoy') {
        setTurnosHoy(data.turnos || [])
      } else {
        if (page === 1) setTurnosHistorial(data.turnos || [])
        else setTurnosHistorial(prev => [...prev, ...(data.turnos || [])])
        setTotalPaginasHist(data.pages || 1)
        setTotalHist(data.total || 0)
        setPaginaHist(page)
      }
    } finally {
      setLoadingTurnos(false)
    }
  }

  useEffect(() => { cargarTurnos('hoy') }, [])

  useEffect(() => {
    if (subTabRutas === 'historial' && turnosHistorial.length === 0) cargarTurnos('historial', filtroRol)
  }, [subTabRutas])

  useEffect(() => {
    if (subTabRutas === 'historial') { setPaginaHist(1); cargarTurnos('historial', filtroRol, 1) }
  }, [filtroRol])

  return {
    subTabRutas, setSubTabRutas,
    turnosHoy, setTurnosHoy,
    turnosHistorial, setTurnosHistorial,
    filtroRol, setFiltroRol,
    loadingTurnos, setLoadingTurnos,
    paginaHist, setPaginaHist,
    totalPaginasHist, setTotalPaginasHist,
    totalHist, setTotalHist,
    cargarTurnos,
  }
}

export type UseTurnos = ReturnType<typeof useTurnos>
