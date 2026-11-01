import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import { listChanged } from '../../lib/sync'
import type { AnimeBrief } from '../../lib/types'

export interface DuelPair {
  a: AnimeBrief
  b: AnimeBrief
}

export type Phase =
  | { kind: 'tier' }
  | { kind: 'duel'; pair: DuelPair; n: number }
  | { kind: 'reveal'; score: number | null; predicted: number | null }

interface TierOut { score: number | null; predicted: number | null; next_duel: DuelPair | null }
interface DuelOut { score?: number | null; next_duel?: DuelPair | null }

/** Drives one title through feeling -> insertion duels -> reveal. */
export function useRateFlow(anime: AnimeBrief) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'tier' })
  const [predicted, setPredicted] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function chooseTier(tier: number) {
    setBusy(true)
    try {
      const r = await api<TierOut>(`/api/rate/${anime.id}/tier`, { method: 'POST', json: { tier } })
      setPredicted(r.predicted)
      setPhase(r.next_duel ? { kind: 'duel', pair: r.next_duel, n: 1 } : { kind: 'reveal', score: r.score, predicted: r.predicted })
    } finally {
      setBusy(false)
      listChanged(qc)
    }
  }

  async function answer(outcome: 'a' | 'b' | 'tie') {
    if (phase.kind !== 'duel') return
    setBusy(true)
    try {
      const r = await api<DuelOut>('/api/rate/duel', {
        method: 'POST', json: { a: phase.pair.a.id, b: phase.pair.b.id, outcome, placing: anime.id },
      })
      setPhase(r.next_duel ? { kind: 'duel', pair: r.next_duel, n: phase.n + 1 }
        : { kind: 'reveal', score: r.score ?? null, predicted })
    } finally {
      setBusy(false)
      listChanged(qc)
    }
  }

  async function skipDuels() {
    const list = await api<{ entries: { anime_id: number; score: number | null }[] }>('/api/list').catch(() => null)
    const mine = list?.entries.find((e) => e.anime_id === anime.id)
    setPhase({ kind: 'reveal', score: mine?.score ?? null, predicted })
  }

  async function saveFacets(facets: Record<string, string>) {
    await api(`/api/rate/${anime.id}/facets`, { method: 'POST', json: { facets } })
    listChanged(qc)
  }

  return { phase, busy, chooseTier, answer, skipDuels, saveFacets }
}
