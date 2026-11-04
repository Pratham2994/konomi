import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { preloadCovers } from '../../components/coverCache'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/PageLoading'
import { api } from '../../lib/api'
import { asked } from '../../lib/ask'
import { listChanged, scoresChanged } from '../../lib/sync'
import { entryLine, useList } from '../../lib/hooks'
import type { AnimeBrief, Entry } from '../../lib/types'
import { Duel } from './Duel'
import { Feelings } from './Feelings'
import { HowScoring } from './HowScoring'
import { StartOver } from './StartOver'
import './ratepage.css'

type Session = { question: Question | null; unrated: number; queue?: AnimeBrief[] }

/** One answer in this visit: the question as it was shown, and how to take the answer back. */
type Step = { shown: Session; undo: () => Promise<unknown>; cleared?: number }

type Question =
  | { kind: 'tier'; anime: AnimeBrief }
  | { kind: 'duel'; a: AnimeBrief; b: AnimeBrief }
  | { kind: 'facets'; anime: AnimeBrief }

const FACETS = [
  { key: 'rewatch', q: 'Would you rewatch it?', opts: ['Yes', 'Maybe', 'No'] },
  { key: 'still_think', q: 'Do you still think about it?', opts: ['Often', 'Sometimes', 'Rarely'] },
]

const ROUND = 10

const art = (x: AnimeBrief) => x.picture ?? x.thumbnail

/** Waits for the question's covers (and starts the next few feeling titles), so a new question never shows blank art. */
function ready(s: Session) {
  const q = s.question
  if (!q) return Promise.resolve()
  preloadCovers((s.queue ?? []).slice(0, 3).map(art), 0)
  return preloadCovers(q.kind === 'duel' ? [art(q.a), art(q.b)] : [art(q.anime)])
}

/** What a round changed: titles whose score moved, and titles that got their first score. */
function RoundSummary({ before, onMore, more }: { before: Map<number, number | null>; onMore: () => void; more: boolean }) {
  const { data: entries = [] } = useList()
  const moved = entries
    .filter((e) => e.score != null && (!before.has(e.anime_id) || before.get(e.anime_id) == null || Math.abs(e.score - (before.get(e.anime_id) ?? 0)) >= 0.05))
    .map((e) => ({ e, was: before.get(e.anime_id) ?? null }))
    .sort((x, y) => (y.was == null ? 1 : 0) - (x.was == null ? 1 : 0) || Math.abs(y.e.score! - (y.was ?? 0)) - Math.abs(x.e.score! - (x.was ?? 0)))
  const fresh = moved.filter((m) => m.was == null).length
  return (
    <div className="rate-done">
      <h2 className="display">{more ? 'Round done' : 'All caught up'}</h2>
      <p className="muted">
        {moved.length === 0 ? 'Your chart already agreed with these answers.'
          : `${fresh ? `${fresh} new score${fresh === 1 ? '' : 's'}` : ''}${fresh && moved.length - fresh ? ', ' : ''}${moved.length - fresh ? `${moved.length - fresh} score${moved.length - fresh === 1 ? '' : 's'} moved` : ''}. Comparing older titles with newer ones keeps every score honest.`}
      </p>
      {moved.length > 0 && (
        <ul className="rate-moved">
          {moved.slice(0, 6).map(({ e, was }) => (
            <li key={e.anime_id}>
              <Cover id={e.anime_id} title={e.anime.title} src={e.anime.thumbnail} color={e.anime.color} size="xs" />
              <span className="rate-moved-title">{e.anime.title_en ?? e.anime.title}</span>
              <span className="rate-moved-n">{was == null ? 'new' : was.toFixed(1)} → <strong className="display">{e.score!.toFixed(1)}</strong></span>
            </li>
          ))}
        </ul>
      )}
      <div className="rate-done-actions">
        {more ? <button className="btn btn-primary" onClick={onMore}>Another round</button>
          : <Link to="/sweep" className="btn btn-primary">Add anime</Link>}
        <Link to="/chart" className="btn">See your chart</Link>
      </div>
    </div>
  )
}

/** The most useful questions, ten at a time, for when you have two minutes. */
export function RatePage() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [inRound, setInRound] = useState(0)
  const [before, setBefore] = useState<Map<number, number | null> | null>(null)
  const [past, setPast] = useState<Step[]>([])
  const { data: entries = [] } = useList()
  const [picked, setPicked] = useState<{ key: string; vals: Record<string, string> }>({ key: '', vals: {} })
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rate-next'],
    queryFn: async () => { const s = await api<Session>('/api/rate/session/next'); await ready(s); return s },
  })
  const toast = useToast()
  // Feeling answers save in the background, one after another, while the next title is already on screen.
  const saving = useRef<Promise<unknown>>(Promise.resolve())

  // While rating, the list isn't fetched again after every answer (that would queue behind the next answer on the
  // server): the chart's copy is patched here, and fetched once when a round's summary needs the new scores.
  const patchList = (animeId: number, tier: number | null, between = false) =>
    qc.setQueryData<Entry[]>(['list'], (es) => es?.map((e) => (e.anime_id === animeId ? { ...e, tier, between } : e)))

  async function send(fn: () => Promise<unknown>, undo: (r: { id?: number }) => () => Promise<unknown>, cleared?: number) {
    const shown = qc.getQueryData<Session>(['rate-next'])
    setBusy(true)
    // The round's "before" picture of your scores, taken at its first answer.
    if (!before) setBefore(new Map(entries.map((e) => [e.anime_id, e.score])))
    try {
      await saving.current
      // Answers are sent with ?next=1, so the reply already carries the next question: one round trip, not two.
      const r = (await fn()) as { id?: number; session?: Session } | undefined
      setAnswered((n) => n + 1)
      setInRound((n) => n + 1)
      if (shown) setPast((p) => [...p, { shown, undo: undo(r ?? {}), cleared }])
      if (r?.session) { await ready(r.session); qc.setQueryData(['rate-next'], r.session) }
      else await refetch()
      scoresChanged(qc, ['rate-next', 'list'])
    } finally {
      setBusy(false)
    }
  }

  /** Back: show the last question again and take its answer back. As instant as answering. */
  function back() {
    const step = past[past.length - 1]
    if (!step || busy) return
    setPast((p) => p.slice(0, -1))
    setAnswered((n) => Math.max(0, n - 1))
    setInRound((n) => Math.max(0, n - 1))
    setPicked({ key: '', vals: {} })
    qc.setQueryData(['rate-next'], step.shown)
    if (step.cleared != null) patchList(step.cleared, null)
    saving.current = saving.current
      .then(step.undo)
      .then(() => scoresChanged(qc, ['rate-next', 'list']))
      .catch(() => { toast({ text: 'Couldn’t take that answer back. Showing where you are now' }); return refetch() })
  }

  const roundDone = inRound >= ROUND
  const q = roundDone ? null : data?.question
  const key = roundDone ? 'round' : !q ? 'none' : q.kind === 'duel' ? `d-${q.a.id}-${q.b.id}` : `${q.kind}-${q.anime.id}`
  function nextRound() {
    setInRound(0)
    setBefore(null)
    listChanged(qc)
  }
  const vals = picked.key === key ? picked.vals : {}
  const summary = roundDone || (!q && !!before)
  useEffect(() => {
    if (summary) saving.current.then(() => qc.refetchQueries({ queryKey: ['list'] }))
  }, [summary, qc])
  // Leaving the page ends the rating session: the model views catch up once.
  useEffect(() => () => { listChanged(qc) }, [qc])

  function tier(animeId: number, t: number, between = false) {
    const cur = qc.getQueryData<Session>(['rate-next'])
    const next = cur?.queue?.[0]
    const undo = () => () => api(`/api/rate/${animeId}/tier`, { method: 'DELETE' })
    if (!cur || !next) {
      patchList(animeId, t, between)
      send(() => api(`/api/rate/${animeId}/tier?next=1`, { method: 'POST', json: { tier: t, between } }), undo, animeId)
      return
    }
    // Instant: show the next title now; the answer saves behind it, in order. The last one in the queue fetches
    // the real next question from the server once every save has landed.
    if (!before) setBefore(new Map(entries.map((e) => [e.anime_id, e.score])))
    setAnswered((n) => n + 1)
    setInRound((n) => n + 1)
    setPast((p) => [...p, { shown: cur, undo: undo(), cleared: animeId }])
    preloadCovers(cur.queue!.slice(1, 4).map(art), 0)
    qc.setQueryData<Session>(['rate-next'], { question: { kind: 'tier', anime: next }, unrated: Math.max(0, cur.unrated - 1), queue: cur.queue!.slice(1) })
    patchList(animeId, t, between)
    const last = cur.queue!.length === 1
    saving.current = saving.current
      .then(() => api(`/api/rate/${animeId}/tier`, { method: 'POST', json: { tier: t, between } }))
      .then(() => { scoresChanged(qc, ['rate-next', 'list']); if (last) return refetch() })
      .catch(() => { toast({ text: 'Couldn’t save that answer. Showing where you are now' }); return refetch() })
  }

  // 1 to 5 answer the feeling question, like in the rating panel (which wins while it is open). Backspace or
  // Ctrl/Cmd+Z goes back one answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || (e.target as HTMLElement).tagName === 'INPUT' || document.querySelector('.rp')) return
      if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) { e.preventDefault(); back(); return }
      if (q?.kind === 'tier' && /^[1-5]$/.test(e.key)) tier(q.anime.id, 6 - Number(e.key))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="page ratepage">
      <header className="rate-head">
        <h1 className="display rate-title">Rate titles</h1>
        <p className="muted">
          {answered > 0 && <><strong className="rate-count">{answered}</strong> answered · </>}
          {data && data.unrated > 0 ? `${data.unrated} watched title${data.unrated === 1 ? '' : 's'} still need a feeling` : 'Every answer sharpens your scores and Konomi’s guesses.'}
        </p>
      </header>
      <div className="rate-how"><HowScoring><StartOver /></HowScoring></div>
      {answered === 0 && <p className="rate-lead">
        Konomi asks how each title felt, then which of two you enjoyed more. Your scores come from these answers,
        never from a slider.
      </p>}

      {(past.length > 0 || (!roundDone && q)) && (
        <div className="rate-bar">
          {past.length > 0 && (
            <button className="btn btn-ghost rate-back" onClick={back} disabled={busy} title="Change your last answer (Backspace)">
              <Icon name="arrowLeft" size={16} /> Back
            </button>
          )}
          {!roundDone && q && (
            <div className="rate-progress" role="progressbar" aria-label="This round" aria-valuemin={0} aria-valuemax={ROUND} aria-valuenow={inRound}>
              <span className="rate-progress-bar"><span style={{ transform: `scaleX(${inRound / ROUND})` }} /></span>
              <span className="faint">Question {inRound + 1} of {ROUND}</span>
            </div>
          )}
        </div>
      )}
      <div className="rate-stage">
        <AnimatePresence mode="wait">
          <motion.div key={key} className="rate-q" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.1 } }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
            {isLoading ? <PageLoading /> : summary ? (
              <RoundSummary before={before ?? new Map()} onMore={nextRound} more={roundDone && !!data?.question} />
            ) : !q ? (
              <div className="rate-done">
                <h2 className="display">All caught up</h2>
                <p className="muted">Add more anime, or walk through a few past seasons.</p>
                <div className="rate-done-actions">
                  <Link to="/sweep" className="btn btn-primary">Add anime</Link>
                  <Link to="/taste" className="btn">See your taste</Link>
                </div>
              </div>
            ) : q.kind === 'tier' ? (
              <div className="rate-tier">
                <Link to={`/anime/${q.anime.id}`} className="rate-cover" aria-label={`Open ${q.anime.title_en ?? q.anime.title}`}><Cover id={q.anime.id} title={q.anime.title} src={q.anime.picture ?? q.anime.thumbnail} color={q.anime.color} eager /></Link>
                <div className="rate-tier-side">
                  <h2 className="display rate-ask">How was <Link to={`/anime/${q.anime.id}`} className="rate-name">{asked(q.anime.title_en ?? q.anime.title)[0]}</Link>{asked(q.anime.title_en ?? q.anime.title)[1]}</h2>
                  <p className="rate-which">{entryLine(q.anime)}</p>
                  <Feelings busy={busy} onPick={(t, between) => tier(q.anime.id, t, between)} keys />
                </div>
              </div>
            ) : q.kind === 'duel' ? (
              <div className="rate-duel">
                <h2 className="display rate-ask">Which did you enjoy more?</h2>
                <Duel big a={q.a} b={q.b} busy={busy}
                  onPick={(o) => send(() => api('/api/rate/duel?next=1', { method: 'POST', json: { a: q.a.id, b: q.b.id, outcome: o } }),
                    (r) => () => api(`/api/rate/duel/${r.id}`, { method: 'DELETE' }))} />
              </div>
            ) : (
              <div className="rate-tier">
                <Link to={`/anime/${q.anime.id}`} className="rate-cover" aria-label={`Open ${q.anime.title_en ?? q.anime.title}`}><Cover id={q.anime.id} title={q.anime.title} src={q.anime.picture ?? q.anime.thumbnail} color={q.anime.color} eager /></Link>
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
                              const save = (next: boolean) => api(`/api/rate/${q.anime.id}/facets${next ? '?next=1' : ''}`, { method: 'POST', json: { facets: { [f.key]: o } } })
                              if (i === FACETS.length - 1) send(() => save(true), () => () => api(`/api/rate/${q.anime.id}/facets`, { method: 'DELETE' }))
                              else save(false)
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
