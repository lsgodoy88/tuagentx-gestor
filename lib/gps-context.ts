import { createContext, useContext } from 'react'

export const GpsContext = createContext<{
  setSincronizandoGps: (v: boolean) => void
}>({ setSincronizandoGps: () => {} })

export const useGpsContext = () => useContext(GpsContext)
