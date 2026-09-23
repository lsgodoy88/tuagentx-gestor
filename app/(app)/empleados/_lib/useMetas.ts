'use client'
import { useState } from 'react'

export function useMetas() {
  const [metasEmpleadoId, setMetasEmpleadoId] = useState('')
  const [metasAnio, setMetasAnio] = useState(new Date().getFullYear())
  const [metasData, setMetasData] = useState<{recaudo: any[], venta: any[]}>({ recaudo: [], venta: [] })
  const [metasEdit, setMetasEdit] = useState<Record<string, {recaudo: string, venta: string}>>({})
  const [metasCargando, setMetasCargando] = useState(false)
  const [metasGuardando, setMetasGuardando] = useState(false)
  const [metasDirty, setMetasDirty] = useState(false)

  async function cargarMetas(empId: string, anio: number) {
    if (!empId) return
    setMetasCargando(true)
    const d = await fetch(`/api/metas?empleadoId=${empId}&anio=${anio}`).then(r => r.json()).catch(() => ({ recaudo: [], venta: [] }))
    setMetasData(d)
    const edit: Record<string, {recaudo: string, venta: string}> = {}
    for (let m = 1; m <= 12; m++) {
      const r = d.recaudo.find((x: any) => x.mes === m)
      const v = d.venta.find((x: any) => x.mes === m)
      edit[m] = { recaudo: r ? Math.round(Number(r.metaPesos)).toLocaleString('es-CO') : '', venta: v ? Math.round(Number(v.metaPesos)).toLocaleString('es-CO') : '' }
    }
    setMetasEdit(edit)
    setMetasDirty(false)
    setMetasCargando(false)
  }

  async function guardarMetas() {
    if (!metasEmpleadoId) return
    setMetasGuardando(true)
    const recaudo = []
    const venta = []
    for (let m = 1; m <= 12; m++) {
      const r = metasEdit[m]?.recaudo
      const v = metasEdit[m]?.venta
      recaudo.push({ mes: m, metaPesos: r ? parseInt(r.replace(/[^0-9]/g, ''), 10) || null : null })
      venta.push({ mes: m, metaPesos: v ? parseInt(v.replace(/[^0-9]/g, ''), 10) || null : null })
    }
    await fetch('/api/metas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empleadoId: metasEmpleadoId, anio: metasAnio, recaudo, venta }) })
    setMetasDirty(false)
    setMetasGuardando(false)
  }

  return {
    metasEmpleadoId, setMetasEmpleadoId,
    metasAnio, setMetasAnio,
    metasData, setMetasData,
    metasEdit, setMetasEdit,
    metasCargando, setMetasCargando,
    metasGuardando, setMetasGuardando,
    metasDirty, setMetasDirty,
    cargarMetas,
    guardarMetas,
  }
}

export type UseMetas = ReturnType<typeof useMetas>
