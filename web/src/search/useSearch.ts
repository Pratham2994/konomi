import { useEffect, useRef, useState } from 'react'
import type { Hit } from '../lib/types'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (hits: Hit[]) => void>()
let readyCount = 0
const readyListeners = new Set<(n: number) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'result') {
        pending.get(m.id)?.(m.hits)
        pending.delete(m.id)
      } else if (m.type === 'ready') {
        readyCount = m.count
        readyListeners.forEach((f) => f(m.count))
      }
    }
  }
  return worker
}

/** Start loading the catalog index early (call on app boot). */
export function warmSearch() {
  getWorker()
}

export function searchOnce(q: string, limit = 8): Promise<Hit[]> {
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ type: 'query', id, q, limit })
  })
}

export function useSearch(q: string, limit = 8) {
  const [hits, setHits] = useState<Hit[]>([])
  const [count, setCount] = useState(readyCount)
  const latest = useRef(0)
  useEffect(() => {
    readyListeners.add(setCount)
    return () => {
      readyListeners.delete(setCount)
    }
  }, [])
  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      return
    }
    const mine = ++latest.current
    searchOnce(q, limit).then((h) => {
      if (mine === latest.current) setHits(h)
    })
  }, [q, limit, count])
  return { hits, ready: count > 0, count }
}
