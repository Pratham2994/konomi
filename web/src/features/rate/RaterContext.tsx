import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AnimeBrief } from '../../lib/types'
import { RatePanel } from './RatePanel'

interface Rater {
  prompt: (anime: AnimeBrief) => void
  close: () => void
}

const Ctx = createContext<Rater>({ prompt: () => undefined, close: () => undefined })

export function RaterProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<AnimeBrief | null>(null)
  const [nonce, setNonce] = useState(0)
  const value = useMemo<Rater>(() => ({
    prompt: (a) => {
      setTarget(a)
      setNonce((n) => n + 1)
    },
    close: () => setTarget(null),
  }), [])
  return (
    <Ctx.Provider value={value}>
      {children}
      {target && <RatePanel key={nonce} anime={target} onClose={() => setTarget(null)} />}
    </Ctx.Provider>
  )
}

export const useRater = () => useContext(Ctx)
