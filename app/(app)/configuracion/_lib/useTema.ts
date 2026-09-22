'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { hslToHex, buildGradient } from './utils'

export function useTema(userId: string | undefined) {
  const [temaHue, setTemaHue] = useState(225)
  const [temaSat, setTemaSat] = useState(72)
  const [temaLit, setTemaLit] = useState(11)
  const [colorFondo, setColorFondo] = useState('#060f2c')
  const [savingTema, setSavingTema] = useState(false)
  const [msgTema, setMsgTema] = useState('')
  const [temaHistorial, setTemaHistorial] = useState<string[]>([])
  const temaBandRef = useRef<HTMLDivElement>(null)
  const temaDragging = useRef(false)

  useEffect(() => {
    if (!userId) return
    try {
      const hist = JSON.parse(localStorage.getItem(`colorFondoHistorial_${userId}`) || '[]')
      if (Array.isArray(hist)) setTemaHistorial(hist)
    } catch {}
    const cached = localStorage.getItem(`colorFondo_${userId}`)
    if (cached && /^#[0-9a-fA-F]{6}$/.test(cached)) setColorFondo(cached)
  }, [userId])

  function previewColor(hex: string, h?: number, s?: number, l?: number) {
    const newHue = h !== undefined ? h : temaHue
    const newSat = s !== undefined ? s : temaSat
    const newLit = l !== undefined ? l : temaLit
    setColorFondo(hex)
    if (h !== undefined) setTemaHue(h)
    if (s !== undefined) setTemaSat(s)
    if (l !== undefined) setTemaLit(l)
    document.documentElement.style.setProperty('--background', hex)
    const grad = document.getElementById('bg-grad-base')
    if (grad) grad.style.background = buildGradient(newHue, newSat, newLit)
    if (userId) {
      localStorage.setItem(`colorFondo_${userId}`, hex)
      localStorage.setItem(`colorFondoGradient_${userId}`, buildGradient(newHue, newSat, newLit))
    }
  }

  const getHueFromBand = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const band = temaBandRef.current
    if (!band) return
    const rect = band.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const newHue = Math.round((x / rect.width) * 360)
    const hex = hslToHex(newHue, temaSat, temaLit)
    previewColor(hex, newHue, temaSat, temaLit)
  }, [temaSat, temaLit])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => { if (temaDragging.current) getHueFromBand(e as any) }
    const onUp = () => { temaDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [getHueFromBand])

  async function guardarTema(update: (data: any) => Promise<any>) {
    setSavingTema(true); setMsgTema('')
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorFondo }),
      })
      if (res.ok) {
        document.documentElement.style.setProperty('--background', colorFondo)
        if (userId) localStorage.setItem(`colorFondo_${userId}`, colorFondo)
        setMsgTema('✅ Guardado')
        try { await update({ colorFondo }) } catch {}
      } else {
        setMsgTema('Error al guardar')
      }
    } catch {
      setMsgTema('Error al guardar')
    }
    setSavingTema(false)
    setTimeout(() => setMsgTema(''), 3000)
  }

  return {
    temaHue, temaSat, temaLit, colorFondo,
    savingTema, msgTema, temaHistorial,
    temaBandRef, temaDragging,
    previewColor, getHueFromBand, guardarTema,
  }
}

export type Tema = ReturnType<typeof useTema>
