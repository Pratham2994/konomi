import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { listChanged } from '../../lib/sync'
import './howscoring.css'

/** Clear every feeling and comparison, keeping the titles. Asks before it runs (twice with `twice`): there is no undo. */
export function StartOver({ label = 'Start rating over', twice = false }: { label?: string; twice?: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  // 0: not asked yet, 1: first question, 2: last check (only with `twice`).
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const r = await api<{ cleared: number; comparisons: number }>('/api/rate/reset', { method: 'POST' })
      await listChanged(qc)
      toast({ text: `Cleared ${r.cleared} rating${r.cleared === 1 ? '' : 's'} and ${r.comparisons} comparison${r.comparisons === 1 ? '' : 's'}. Your titles are still on your chart.` })
    } catch {
      toast({ text: 'Couldn’t start over. Nothing was changed' })
    } finally {
      setBusy(false); setStep(0)
    }
  }

  return (
    <div className="how-reset">
      {step === 1 ? (
        <>
          <span>Clear every feeling, score and comparison? Your titles stay. This can’t be undone.</span>
          <button className="btn btn-bad" onClick={twice ? () => setStep(2) : run} disabled={busy}>{busy ? 'Clearing…' : 'Yes, start over'}</button>
          <button className="btn btn-ghost" onClick={() => setStep(0)} disabled={busy}>Keep my ratings</button>
        </>
      ) : step === 2 ? (
        <>
          <span><strong>Last check.</strong> Your taste starts from zero and you rate every title again from the start.</span>
          <button className="btn btn-bad" onClick={run} disabled={busy}>{busy ? 'Clearing…' : 'Reset my taste'}</button>
          <button className="btn btn-ghost" onClick={() => setStep(0)} disabled={busy}>Keep my ratings</button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setStep(1)}>{label}</button>
      )}
    </div>
  )
}
