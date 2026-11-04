import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Mark } from '../../components/Mark'
import { ScoreRail } from '../../components/ScoreRail'
import { api } from '../../lib/api'
import { currentSeason, SEASON_KANJI, SEASON_LABEL, SEASON_ORDER } from '../../lib/hooks'
import type { AnimeBrief, Season } from '../../lib/types'
import './landing.css'

/** Titles a visitor taps before signing up; HomePage adds them to the new chart after sign-up. */
export const PENDING_KEY = 'konomi-pending-marks'

const PER_SEASON = 16

function back(year: number, season: Season, n: number): { year: number; season: Season } {
  let i = SEASON_ORDER.indexOf(season) - n
  let y = year
  while (i < 0) { i += 4; y -= 1 }
  return { year: y, season: SEASON_ORDER[i] }
}

function useSeason(year: number, season: Season) {
  // Its own cache key: Home and Sweep share ['sweep', year, season] for the full season, and this asks for fewer.
  const q = useQuery({
    queryKey: ['sweep', year, season, PER_SEASON],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${year}&season=${season}&limit=${PER_SEASON}`),
    staleTime: Infinity,
  })
  return q.data?.items ?? (q.isPending ? null : [])
}

/** Wall columns by its width, and where the headline sits in them: first column, columns, rows. */
const LAYOUTS = [
  { min: 0, cols: 4, sign: [1, 4, 1], rows: 9 },
  { min: 520, cols: 6, sign: [1, 6, 1], rows: 8 },
  { min: 860, cols: 8, sign: [2, 6, 4], rows: 7 },
  { min: 1160, cols: 10, sign: [2, 6, 3], rows: 6 },
  { min: 1640, cols: 12, sign: [3, 7, 3], rows: 6 },
  { min: 2080, cols: 14, sign: [3, 8, 3], rows: 6 },
]
const layoutFor = (w: number) => LAYOUTS.filter((l) => w >= l.min).pop() ?? LAYOUTS[0]

function useLayout() {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState(() => layoutFor(window.innerWidth - 64))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLayout(layoutFor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, layout] as const
}

type Slot =
  | { kind: 'slab'; season: Season; year: number; label: string }
  | { kind: 'cover'; season: Season; x: AnimeBrief | null; big: boolean }

const WORDS = ['Every', 'anime', 'you’ve', 'watched,', 'ranked', 'by', 'you.']

function readPending(): AnimeBrief[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function Landing() {
  const still = useReducedMotion()
  const now = currentSeason()
  const s1 = now, s2 = back(now.year, now.season, 1), s3 = back(now.year, now.season, 4)
  const a = useSeason(s1.year, s1.season), b = useSeason(s2.year, s2.season), c = useSeason(s3.year, s3.season)
  // Marks made on an earlier visit are still waiting for sign-up, so they come back.
  const [marked, setMarked] = useState<AnimeBrief[]>(readPending)
  const [pick, setPick] = useState<'a' | 'b' | null>(null)
  const [wallRef, layout] = useLayout()
  const isOn = (id: number) => marked.some((m) => m.id === id)

  function toggle(x: AnimeBrief) {
    const next = isOn(x.id) ? marked.filter((m) => m.id !== x.id) : [...marked, x]
    setMarked(next)
    setPick(null)
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(next)) } catch { /* storage blocked: fine */ }
  }

  const pair = useMemo(() => {
    if (marked.length >= 2) return [marked[marked.length - 2], marked[marked.length - 1]]
    const pool = [...(c ?? []), ...(b ?? [])]
    return pool.length >= 2 ? [pool[0], pool[1]] : null
  }, [marked, b, c])

  // The wall: a season slab, then its covers (the first one big), for three seasons. Just enough covers that
  // the last row is full. Seasons still loading count as full, so their placeholders hold the same places.
  const seasons: [typeof s1, AnimeBrief[] | null, string][] = [
    [s1, a, 'airing now'], [s2, b, 'last season'], [s3, c, 'a year ago'],
  ]
  const have = seasons.map(([, xs]) => (xs ? xs.length : PER_SEASON))
  // Covers per season, dealt in turn; a big cover takes four cells.
  const share = (n: number) => {
    const t = [0, 0, 0]
    for (let i = 0; n > 0 && t.some((v, j) => v < have[j]); i = (i + 1) % 3) if (t[i] < have[i]) { t[i]++; n-- }
    return t
  }
  const cells = (t: number[]) => layout.sign[1] * layout.sign[2] + 3 + t.reduce((s, v) => s + v + (v ? 3 : 0), 0)
  let take = share(layout.cols * layout.rows)
  for (let n = take.reduce((s, v) => s + v, 0); n > 0 && (cells(take) > layout.cols * layout.rows || cells(take) % layout.cols); n--) take = share(n - 1)
  const slots: Slot[] = []
  seasons.forEach(([s, xs, label], i) => {
    slots.push({ kind: 'slab', season: s.season, year: s.year, label })
    for (let k = 0; k < take[i]; k++) slots.push({ kind: 'cover', season: s.season, x: xs?.[k] ?? null, big: k === 0 })
  })

  const [signCol, signSpan, signRows] = layout.sign
  return (
    <div className="landing" data-season={now.season}>
      <section className="l-wall page" aria-label="Tap the anime you’ve seen" ref={wallRef}
        style={{ ['--cols' as string]: layout.cols }}>
        <div className={`l-sign${signRows === 1 ? ' l-sign-row' : ''}`}
          style={{ gridColumn: `${signCol} / span ${signSpan}`, gridRow: `2 / span ${signRows}` }}>
          <div className="l-sign-in">
            <h1 className="display l-title" aria-label="Every anime you’ve watched, ranked by you.">
              {WORDS.map((w, i) => {
                const word = (
                  <span className="l-word-mask">
                    <motion.span className={`l-word${i >= 4 ? ' l-accent' : ''}`} initial={still ? false : { y: '105%' }}
                      animate={{ y: 0 }} transition={{ delay: 0.75 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>{w}</motion.span>
                  </span>
                )
                return (
                  <span key={i} aria-hidden="true">{i > 0 && ' '}
                    {/* The last word gets circled by hand, like a title you've seen. */}
                    {i === WORDS.length - 1 ? <span className="l-you">{word}<Mark status="completed" animate seed={7} /></span> : word}
                  </span>
                )
              })}
            </h1>
            <motion.div className="l-side" initial={still ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <p className="l-lead">
                No 1 to 10 sliders. You pick a feeling, answer a couple of “which did you enjoy more?” questions,
                and your scores sort themselves out. Then a taste model trained on 56 million real ratings finds what
                you’ll love next.
              </p>
              <div className="l-act">
                <Link to="/signup" className="btn btn-primary l-btn">Start your chart</Link>
                <p className="l-hint">Tap the covers you’ve seen. They go on your chart when you sign up.</p>
              </div>
            </motion.div>
          </div>
        </div>

        {slots.map((s, i) => {
          const style = { ['--i' as string]: i, ['--tilt' as string]: `${i % 2 ? 1.6 : -1.6}deg` } as CSSProperties
          if (s.kind === 'slab') return (
            <div key={i} className="l-slab" data-season={s.season} style={style}>
              <div className="l-slab-in">
                <span className="l-slab-kanji display" aria-hidden="true">{SEASON_KANJI[s.season]}</span>
                <span className="l-slab-name display">{SEASON_LABEL[s.season]}<br />{s.year}</span>
                <span className="l-slab-label">{s.label}</span>
              </div>
            </div>
          )
          const x = s.x
          return (
            // Keyed by place, so a placeholder turns into its cover without dealing in again.
            <button key={i} type="button" className={`l-tile${s.big ? ' is-big' : ''}`} data-season={s.season} style={style}
              disabled={!x} aria-pressed={x ? isOn(x.id) : undefined} aria-label={x ? x.title_en ?? x.title : 'Loading'}
              title={x ? x.title_en ?? x.title : undefined} onClick={() => x && toggle(x)}>
              {x ? (
                <>
                  <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                    status={isOn(x.id) ? 'completed' : undefined} animateMark />
                  <span className="l-cap" aria-hidden="true">{x.title_en ?? x.title}</span>
                </>
              ) : <span className="l-ghost" />}
            </button>
          )
        })}
      </section>

      {pair && (
        <section className="l-duel page" data-season="WINTER">
          <div className="l-duel-in">
            <h2 className="display l-duel-ask">
              {marked.length >= 2 ? 'Of those two, which did you enjoy more?' : 'Which did you enjoy more?'}
            </h2>
            <div className="l-duel-pair">
              {pair.map((x, i) => (
                <button key={x.id} type="button" className={`l-duel-side${pick && pick !== (i ? 'b' : 'a') ? ' is-out' : ''}`}
                  onClick={() => setPick(i ? 'b' : 'a')}>
                  <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                    status={pick === (i ? 'b' : 'a') ? 'completed' : undefined} animateMark />
                  <span className="tile-title">{x.title_en ?? x.title}</span>
                </button>
              ))}
              <span className="l-vs display" aria-hidden="true">vs</span>
            </div>
            <div className="l-duel-out">
              {/* The rail waits empty, so the answer has somewhere to land. */}
              <ScoreRail score={pick ? 9.2 : null} predicted={pick ? 8.9 : null} />
              {pick ? (
                <p className="l-note">That answer moved one title above the other. A few of these and every score on your
                  chart is honest. The dashed line is Konomi’s guess, shown only after you answer. (Example numbers.)</p>
              ) : <p className="l-note">Pick one. No numbers, just which one you liked more.</p>}
            </div>
          </div>
        </section>
      )}

      <footer className="l-foot page">
        <div className="l-end">
          <p className="display l-end-title">Your chart starts with one tap.</p>
          <Link to="/signup" className="btn btn-primary">Start your chart</Link>
        </div>
        <div className="l-credit">
          <span className="display">好み Konomi</span>
          <span className="faint">Catalogue: anime-offline-database (ODbL), AniList. Ratings: MyAnimeList via Kaggle.</span>
        </div>
      </footer>

      <AnimatePresence>
        {marked.length > 0 && (
          <motion.div className="l-keep" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            <span><strong className="display">{marked.length}</strong> marked</span>
            <Link to="/signup" className="btn btn-primary">Start your chart to keep them</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
