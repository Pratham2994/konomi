import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { listChanged } from '../../lib/sync'

/** Clear every feeling and comparison, keeping the titles. Asks twice: there is no undo. */
export function StartOver() {
  const qc = useQueryClient()
  const toast = useToast()
  const [sure, setSure] = useState(false)
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
      setBusy(false); setSure(false)
    }
  }

  return (
    <div className="how-reset">
      {sure ? (
        <>
          <span>Clear every feeling, score and comparison? Your titles stay. This can’t be undone.</span>
          <button className="btn btn-bad" onClick={run} disabled={busy}>{busy ? 'Clearing…' : 'Yes, start over'}</button>
          <button className="btn btn-ghost" onClick={() => setSure(false)} disabled={busy}>Keep my ratings</button>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setSure(true)}>Start rating over</button>
      )}
    </div>
  )
}
