import { createContext, useContext } from 'react'

export const NetworkContext = createContext<{ online: boolean }>({ online: true })

export const useNetworkContext = () => useContext(NetworkContext)
