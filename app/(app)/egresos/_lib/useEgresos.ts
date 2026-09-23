'use client'
import { useRef, useState, useEffect } from 'react'
import type { Categoria } from './tipos'

export function useEgresos() {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [showCal, setShowCal] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [totalesKey, setTotalesKey] = useState(0)
  const [totalGeneral, setTotalGeneral] = useState<{total:number,pagado:number,pendiente:number}|null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [showCategorias, setShowCategorias] = useState(false)

  useEffect(() => {
    if (showCategorias) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showCategorias])

  const [nuevaCat, setNuevaCat] = useState({ label: '', emoji: '📋' })

  useEffect(() => {
    fetch('/api/egresos/categorias').then(r => r.json()).then(d => {
      if (d.categorias) setCategorias(d.categorias)
    }).catch(() => {})
  }, [reloadKey])

  const scrollRefs = useRef<HTMLDivElement[]>([])

  useEffect(() => {
    fetch(`/api/egresos?mes=${mes}&anio=${anio}&totalOnly=1`)
      .then(r => r.json())
      .then(d => { if (d.total !== undefined) setTotalGeneral({ total: d.total, pagado: d.pagado, pendiente: d.pendiente }) })
      .catch(() => {})
  }, [mes, anio, reloadKey, totalesKey])

  const triggerGastos = useRef<(() => void) | null>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<'egresos' | 'gastos' | 'proveedores'>('egresos')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setShowCal(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return {
    mes, setMes, anio, setAnio,
    showCal, setShowCal,
    reloadKey, setReloadKey,
    totalesKey, setTotalesKey,
    totalGeneral, setTotalGeneral,
    categorias, setCategorias,
    showCategorias, setShowCategorias,
    nuevaCat, setNuevaCat,
    scrollRefs, triggerGastos, calRef,
    tab, setTab,
  }
}

export type UseEgresos = ReturnType<typeof useEgresos>
