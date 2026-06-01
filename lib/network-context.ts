import { createContext, useContext } from 'react'

export const NetworkContext = createContext<{
  online: boolean
  lastOnline: Date | null
}>({ online: true, lastOnline: null })

export const useNetworkContext = () => useContext(NetworkContext)
