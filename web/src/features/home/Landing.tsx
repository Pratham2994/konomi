import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { Mark } from '../../components/Mark'
import { ScoreRail } from '../../components/ScoreRail'
import { api } from '../../lib/api'
import { currentSeason, SEASON_KANJI, SEASON_LABEL } from '../../lib/hooks'
import type { AnimeBrief, Season } from '../../lib/types'
import { SNAPSHOT, type Showcase } from './showcase'
import './landing.css'

/** Titles a visitor taps before signing up; HomePage adds them to the new chart after sign-up. */
export const PENDING_KEY = 'konomi-pending-marks'

// A visitor who is not signed in will see the wall: start its first covers now, alongside the /api/me check,
// instead of after it. Same URLs and referrer policy as Cover, so the wall takes them from the cache.
try {
  if (localStorage.getItem('konomi-signed-in') !== '1') {
    for (const a of SNAPSHOT.classics.slice(0, 16)) {
      const src = a.picture ?? a.thumbnail
      if (!src) continue
      const img = new Image()
      img.referrerPolicy = 'no-referrer'
      img.fetchPriority = 'high'
      img.src = src
    }
  }
} catch { /* storage blocked: the wall loads them itself */ }

/** The wall's covers: all-time favourites and the season airing now. The bundled copy shows at once (and stays
 *  if the API is slow or down); the live answer, cached by the browser for an hour, replaces it in the background. */
function useShowcase(): Showcase {
  const now = currentSeason()
  const snap = SNAPSHOT.year === now.year && SNAPSHOT.season === now.season ? SNAPSHOT : { ...SNAPSHOT, ...now, now: [] }
  return useQuery({
    queryKey: ['showcase'],
    queryFn: async () => {
      const r = await api<Partial<Showcase>>('/api/showcase')
      return Array.isArray(r.classics) && Array.isArray(r.now) && r.classics.length ? r as Showcase : snap
    },
    initialData: snap, initialDataUpdatedAt: 0, staleTime: 3_600_000, retry: 1,
  }).data
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
  | { kind: 'slab'; season: Season | null; kanji: string; name: [string, string]; label: string }
  | { kind: 'cover'; x: AnimeBrief; big: boolean; first: boolean }

const WORDS = ['Every', 'anime', 'you’ve', 'watched,', 'ranked', 'by', 'you.']

function readPending(): AnimeBrief[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function Landing() {
  const still = useReducedMotion()
  const show = useShowcase()
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
    return show.classics.length >= 2 ? [show.classics[0], show.classics[1]] : null
  }, [marked, show])

  // The wall: each group's slab, then its covers (the first one big, four cells), then the sign-up tile in the
  // last cell. Just enough covers that every row is full; about a third of them are airing now.
  const groups: [Omit<Extract<Slot, { kind: 'slab' }>, 'kind'>, AnimeBrief[]][] = [
    [{ season: null, kanji: '名', name: ['All', 'time'], label: 'most watched ever' }, show.classics],
    [{ season: show.season, kanji: SEASON_KANJI[show.season], name: [SEASON_LABEL[show.season], String(show.year)], label: 'airing now' }, show.now],
  ]
  const [haveC, haveN] = groups.map(([, xs]) => xs.length)
  const share = (n: number) => {
    const c = Math.min(haveC, n - Math.min(haveN, Math.round(n * 0.3)))
    return [c, Math.min(haveN, n - c)]
  }
  const room = layout.cols * layout.rows
  const cells = (t: number[]) => layout.sign[1] * layout.sign[2] + 1 + t.reduce((s, v) => s + (v ? v + 4 : 0), 0)
  let n = Math.min(room, haveC + haveN)
  while (n > 0 && (cells(share(n)) > room || cells(share(n)) % layout.cols)) n--
  const take = share(n)
  const lastRow = Math.ceil(cells(take) / layout.cols)
  const slots: Slot[] = []
  let dealt = 0
  groups.forEach(([slab, xs], i) => {
    if (!take[i]) return
    slots.push({ kind: 'slab', ...slab })
    for (let k = 0; k < take[i]; k++) slots.push({ kind: 'cover', x: xs[k], big: k === 0, first: dealt++ < layout.cols * 2 })
  })

  const [signCol, signSpan, signRows] = layout.sign
  return (
    <div className={`landing${marked.length ? ' has-keep' : ''}`} data-season={show.season}>
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
            <div key={i} className={`l-slab${s.season ? '' : ' l-slab-paper'}`} data-season={s.season ?? undefined} style={style}>
              <div className="l-slab-in">
                <span className="l-slab-kanji display" aria-hidden="true">{s.kanji}</span>
                <span className="l-slab-name display">{s.name[0]}<br />{s.name[1]}</span>
                <span className="l-slab-label">{s.label}</span>
              </div>
            </div>
          )
          const x = s.x
          return (
            // Keyed by place, so a new answer from the API swaps art in place without dealing in again.
            <button key={i} type="button" className={`l-tile${s.big ? ' is-big' : ''}`} style={style}
              aria-pressed={isOn(x.id)} aria-label={x.title_en ?? x.title} title={x.title_en ?? x.title} onClick={() => toggle(x)}>
              <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                status={isOn(x.id) ? 'completed' : undefined} animateMark priority={s.first} />
              <span className="l-cap" aria-hidden="true">{x.title_en ?? x.title}</span>
            </button>
          )
        })}

        {/* The wall's last cell is where your own chart starts. */}
        <Link to="/signup" className="l-slab l-cta" style={{ gridRow: lastRow, gridColumn: layout.cols, ['--i' as string]: slots.length }}>
          <span className="l-slab-in">
            <span className="l-cta-plus" aria-hidden="true"><Icon name="plus" size={40} stroke={2.6} /></span>
            <span className="l-slab-name display">Start<br />your chart</span>
            <span className="l-slab-label">{marked.length ? `with your ${marked.length} marked` : 'it starts with one tap'}</span>
          </span>
        </Link>
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
                <>
                  <p className="l-note">That answer moved one title above the other. A few of these and every score on your
                    chart is honest. The dashed line is Konomi’s guess, shown only after you answer. (Example numbers.)</p>
                  <Link to="/signup" className="btn btn-primary l-duel-go">Rate your own like this</Link>
                </>
              ) : <p className="l-note">Pick one. No numbers, just which one you liked more.</p>}
            </div>
          </div>
        </section>
      )}

      <footer className="l-foot page">
        <span className="display">好み Konomi</span>
        <span>Catalogue: anime-offline-database (ODbL), AniList. Ratings: MyAnimeList via Kaggle.</span>
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
