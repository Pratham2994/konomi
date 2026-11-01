import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { api } from '../../lib/api'
import { TIERS } from '../../lib/hooks'
import type { AnimeBrief } from '../../lib/types'
import { Duel } from './Duel'
import './ratepage.css'

type Question =
  | { kind: 'tier'; anime: AnimeBrief }
  | { kind: 'duel'; a: AnimeBrief; b: AnimeBrief }
  | { kind: 'facets'; anime: AnimeBrief }

const FACETS = [
  { key: 'rewatch', q: 'Would you rewatch it?', opts: ['Yes', 'Maybe', 'No'] },
  { key: 'still_think', q: 'Do you still think about it?', opts: ['Often', 'Sometimes', 'Rarely'] },
]

/** An endless stream of the most useful questions, for when you have two minutes. */
export function RatePage() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(0)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rate-next'],
    queryFn: () => api<{ question: Question | null; unrated: number }>('/api/rate/session/next'),
  })

  async function send(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setAnswered((n) => n + 1)
      await refetch()
      qc.invalidateQueries({ queryKey: ['list'] })
    } finally {
      setBusy(false)
    }
  }

  const q = data?.question
  const key = !q ? 'none' : q.kind === 'duel' ? `d-${q.a.id}-${q.b.id}` : `${q.kind}-${q.anime.id}`

  return (
    <div className="page ratepage">
      <header className="rate-head">
        <h1 className="display rate-title">Rate</h1>
        <p className="muted">
          {answered > 0 && <><strong className="rate-count">{answered}</strong> answered · </>}
          {data && data.unrated > 0 ? `${data.unrated} watched title${data.unrated === 1 ? '' : 's'} still need a feeling` : 'Every answer sharpens your scores and Konomi’s guesses.'}
        </p>
      </header>

      <div className="rate-stage">
        <AnimatePresence mode="wait">
          <motion.div key={key} className="rate-q" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            {isLoading ? null : !q ? (
              <div className="rate-done">
                <h2 className="display">All caught up</h2>
                <p className="muted">Add more anime, or walk through a few past seasons.</p>
                <div className="rate-done-actions">
                  <Link to="/sweep" className="btn btn-primary">Season walk</Link>
                  <Link to="/taste" className="btn">See your taste</Link>
                </div>
              </div>
            ) : q.kind === 'tier' ? (
              <div className="rate-tier">
                <div className="rate-cover"><Cover id={q.anime.id} title={q.anime.title} src={q.anime.picture ?? q.anime.thumbnail} color={q.anime.color} eager /></div>
                <div className="rate-tier-side">
                  <h2 className="display rate-ask">How was <span className="rate-name">{q.anime.title_en ?? q.anime.title}</span>?</h2>
                  <div className="rp-tiers">
                    {TIERS.map((t) => (
                      <button key={t.tier} className={`rp-tier rp-tier-${t.tier}`} disabled={busy}
                        onClick={() => send(() => api(`/api/rate/${q.anime.id}/tier`, { method: 'POST', json: { tier: t.tier } }))}>
                        <span>{t.label}</span>
                        <span className="rp-band">{t.band}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : q.kind === 'duel' ? (
              <div className="rate-duel">
                <h2 className="display rate-ask">Which did you enjoy more?</h2>
                <Duel big a={q.a} b={q.b} busy={busy}
                  onPick={(o) => send(() => api('/api/rate/duel', { method: 'POST', json: { a: q.a.id, b: q.b.id, outcome: o } }))} />
              </div>
            ) : (
              <div className="rate-tier">
                <div className="rate-cover"><Cover id={q.anime.id} title={q.anime.title} src={q.anime.picture ?? q.anime.thumbnail} color={q.anime.color} eager /></div>
                <div className="rate-tier-side">
                  <p className="rate-facet-title display">{q.anime.title_en ?? q.anime.title}</p>
                  {FACETS.map((f, i) => (
                    <div key={f.key} className="rate-facet">
                      <h2 className="display rate-ask-s">{f.q}</h2>
                      <div className="rp-chips">
                        {f.opts.map((o) => (
                          <button key={o} className="chip chip-l" disabled={busy}
                            onClick={() => i === FACETS.length - 1
                              ? send(() => api(`/api/rate/${q.anime.id}/facets`, { method: 'POST', json: { facets: { [f.key]: o } } }))
                              : api(`/api/rate/${q.anime.id}/facets`, { method: 'POST', json: { facets: { [f.key]: o } } })}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
