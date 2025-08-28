'use client'

import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

interface VSCodeContextType {
  isVSCode: boolean
}

const VSCodeContext = createContext<VSCodeContextType>({
  isVSCode: false,
})

export function useVSCode(): VSCodeContextType {
  return useContext(VSCodeContext)
}

interface VSCodeProviderProps {
  children: ReactNode
  isVSCode: boolean
}

export function VSCodeProvider({ children, isVSCode }: VSCodeProviderProps): ReactNode {
  return (
    <VSCodeContext.Provider value={{ isVSCode }}>
      {children}
    </VSCodeContext.Provider>
  )
}
