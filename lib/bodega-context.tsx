'use client'
import { createContext, useContext } from 'react'

export const BodegaContext = createContext<{ origenId: string; forzado: boolean }>({ origenId: 'propia', forzado: false })
export const useBodegaContext = () => useContext(BodegaContext)
