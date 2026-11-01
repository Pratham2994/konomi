import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { PageLoading } from '../../components/PageLoading'
import { api } from '../../lib/api'
import { asked } from '../../lib/ask'
import { listChanged } from '../../lib/sync'
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
  const [picked, setPicked] = useState<{ key: string; vals: Record<string, string> }>({ key: '', vals: {} })
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
      listChanged(qc)
    } finally {
      setBusy(false)
    }
  }

  const q = data?.question
  const key = !q ? 'none' : q.kind === 'duel' ? `d-${q.a.id}-${q.b.id}` : `${q.kind}-${q.anime.id}`
  const vals = picked.key === key ? picked.vals : {}

  function tier(animeId: number, t: number) {
    send(() => api(`/api/rate/${animeId}/tier`, { method: 'POST', json: { tier: t } }))
  }

  // 1 to 5 answer the feeling question, like in the rating panel (which wins while it is open).
  useEffect(() => {
    if (q?.kind !== 'tier') return
    const id = q.anime.id
    const onKey = (e: KeyboardEvent) => {
      if (busy || !/^[1-5]$/.test(e.key) || (e.target as HTMLElement).tagName === 'INPUT' || document.querySelector('.rp')) return
      tier(id, 6 - Number(e.key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
            {isLoading ? <PageLoading /> : !q ? (
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
                  <h2 className="display rate-ask">How was <span className="rate-name">{asked(q.anime.title_en ?? q.anime.title)[0]}</span>{asked(q.anime.title_en ?? q.anime.title)[1]}</h2>
                  <div className="rp-tiers">
                    {TIERS.map((t, i) => (
                      <button key={t.tier} className={`rp-tier rp-tier-${t.tier}`} disabled={busy}
                        onClick={() => tier(q.anime.id, t.tier)}>
                        <span>{t.label}</span>
                        <span className="rp-band">{t.band}<kbd aria-hidden="true">{i + 1}</kbd></span>
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
                          <button key={o} className={`chip chip-l${vals[f.key] === o ? ' is-on' : ''}`} disabled={busy}
                            aria-pressed={vals[f.key] === o}
                            onClick={() => {
                              setPicked({ key, vals: { ...vals, [f.key]: o } })
                              const save = () => api(`/api/rate/${q.anime.id}/facets`, { method: 'POST', json: { facets: { [f.key]: o } } })
                              if (i === FACETS.length - 1) send(save)
                              else save()
                            }}>
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
