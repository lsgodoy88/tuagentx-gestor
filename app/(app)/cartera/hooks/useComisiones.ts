'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { mesBogota, anioBogota } from '@/lib/fechas'
import { Parser } from 'expr-eval'
import type { ComisionVendedor } from '@/lib/types/cartera'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function evaluarComision(formula: string, total: number, porcentaje: number): number {
  try {
    const r = new Parser().parse(formula || 'total/1.19*porcentaje').evaluate({ total, porcentaje: porcentaje / 100 })
    return Number.isFinite(r) ? Math.round(r) : 0
  } catch {
    return 0
  }
}

export function useComisiones(esVendedor: boolean, tab: string, status: string) {
  const [comisiones, setComisiones] = useState<ComisionVendedor[]>([])
  const [comisionPropia, setComisionPropia] = useState<any>(null)
  const [loadingComisionPropia, setLoadingComisionPropia] = useState(false)
  const [comisionCalculo, setComisionCalculo] = useState<any>(null)
  const [editandoFormulaId, setEditandoFormulaId] = useState<string | null>(null)
  const [borradorFormula, setBorradorFormula] = useState('')
  const [borradorPorcentaje, setBorradorPorcentaje] = useState(0)
  const [loadingComisiones, setLoadingComisiones] = useState(false)
  const [nombreComision, setNombreComision] = useState('')
  const [guardandoComision, setGuardandoComision] = useState(false)
  const [mesComision, setMesComision] = useState(mesBogota())
  const [anioComision, setAnioComision] = useState(anioBogota())
  const debounceComisionRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Vendedor: carga su propia comisión al cambiar mes/año
  useEffect(() => {
    if (status !== 'authenticated' || !esVendedor || tab !== 'comisiones') return
    setLoadingComisionPropia(true)
    fetch(`/api/comisiones?mes=${mesComision}&anio=${anioComision}`)
      .then(r => r.json())
      .then(r => setComisionPropia((r.vendedores || [])[0] || null))
      .catch(() => setComisionPropia(null))
      .finally(() => setLoadingComisionPropia(false))
  }, [status, esVendedor, tab, mesComision, anioComision])

  const guardarComisionAuto = useCallback((vendedorId: string, porcentaje: number, formula: string) => {
    if (debounceComisionRef.current[vendedorId]) clearTimeout(debounceComisionRef.current[vendedorId])
    debounceComisionRef.current[vendedorId] = setTimeout(() => {
      fetch('/api/comisiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'guardar_config', vendedores: [{ id: vendedorId, porcentaje, formula }] }),
      }).catch(() => {})
    }, 500)
  }, [])

  const cargarComisiones = useCallback(async () => {
    setLoadingComisiones(true)
    const r = await fetch(`/api/comisiones?mes=${mesComision}&anio=${anioComision}`)
      .then(r => r.json()).catch(() => ({}))
    setComisiones(r.vendedores || [])
    setComisionCalculo(r.calculo || null)
    if (!nombreComision) {
      setNombreComision(`Comision${MESES[mesComision - 1]}${anioComision}`)
    }
    setLoadingComisiones(false)
  }, [mesComision, anioComision, nombreComision])

  const guardarComisionFinal = useCallback(async () => {
    setGuardandoComision(true)
    await fetch('/api/comisiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_config', vendedores: comisiones }),
    })
    const r = await fetch('/api/comisiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'calcular', mes: mesComision, anio: anioComision, nombre: nombreComision, vendedores: comisiones, formula: 'recaudado * porcentaje / 100' }),
    }).then(r => r.json())
    setComisionCalculo(r.calculo)
    setGuardandoComision(false)
  }, [comisiones, mesComision, anioComision, nombreComision])

  return {
    comisiones, setComisiones,
    comisionPropia,
    loadingComisionPropia,
    comisionCalculo,
    editandoFormulaId, setEditandoFormulaId,
    borradorFormula, setBorradorFormula,
    borradorPorcentaje, setBorradorPorcentaje,
    loadingComisiones,
    nombreComision, setNombreComision,
    guardandoComision,
    mesComision, setMesComision,
    anioComision, setAnioComision,
    guardarComisionAuto,
    cargarComisiones,
    guardarComisionFinal,
  }
}
