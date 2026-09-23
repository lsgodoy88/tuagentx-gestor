import { useEffect, useRef, useState } from 'react'
import { nombreAuto } from '../_lib/utils'

export function useCrearRuta(loadData: () => void) {
  const [modal, setModal] = useState(false)
  const [paso, setPaso] = useState(1)

  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [empSeleccionado, setEmpSeleccionado] = useState<any>(null)
  const [empSeleccionados, setEmpSeleccionados] = useState<string[]>([])
  const [cliSeleccionados, setCliSeleccionados] = useState<string[]>([])
  const [buscarCli, setBuscarCli] = useState('')
  const [pageCli, setPageCli] = useState(1)
  const [clientes, setClientes] = useState<any[]>([])
  const [totalCli, setTotalCli] = useState(0)
  const [loadingCli, setLoadingCli] = useState(false)
  const LIMIT_CLI = 10
  const [loading, setLoading] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)
  const cliListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (modal) modalRef.current?.scrollTo(0, 0)
  }, [modal])

  useEffect(() => {
    cliListRef.current?.scrollTo(0, 0)
  }, [buscarCli])

  function toggleCli(id: string) {
    setCliSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function crear() {
    setLoading(true)
    await fetch('/api/rutas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, fecha, empleadoIds: empSeleccionados, clienteIds: cliSeleccionados })
    })
    setLoading(false)
    resetModal()
    loadData()
  }

  function resetModal() {
    setEmpSeleccionado(null)
    setModal(false); setPaso(1); setNombre(''); setFecha('')
    setEmpSeleccionados([]); setCliSeleccionados([]); setBuscarCli('')
  }

  async function loadClientes(q: string, p: number) {
    setLoadingCli(true)
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT_CLI}`)
    const data = await res.json()
    setClientes(data.clientes || [])
    setTotalCli(data.total || 0)
    setLoadingCli(false)
  }

  const clientesFiltrados = clientes

  return {
    modal, setModal, paso, setPaso,
    nombre, setNombre, fecha, setFecha,
    empSeleccionado, setEmpSeleccionado, empSeleccionados, setEmpSeleccionados,
    cliSeleccionados, setCliSeleccionados,
    buscarCli, setBuscarCli, pageCli, setPageCli,
    clientes, setClientes, totalCli, setTotalCli, loadingCli, LIMIT_CLI,
    loading, modalRef, cliListRef,
    toggleCli, crear, resetModal, loadClientes,
    clientesFiltrados, nombreAuto,
  }
}

export type UseCrearRuta = ReturnType<typeof useCrearRuta>
