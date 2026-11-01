import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { ScoreRail } from '../../components/ScoreRail'
import { SeasonBand } from '../../components/SeasonBand'
import { api } from '../../lib/api'
import { currentSeason, SEASON_ORDER } from '../../lib/hooks'
import type { AnimeBrief, Season } from '../../lib/types'
import './landing.css'

/** Titles a visitor taps before signing up; HomePage adds them to the new chart after sign-up. */
export const PENDING_KEY = 'konomi-pending-marks'

function back(year: number, season: Season, n: number): { year: number; season: Season } {
  let i = SEASON_ORDER.indexOf(season) - n
  let y = year
  while (i < 0) { i += 4; y -= 1 }
  return { year: y, season: SEASON_ORDER[i] }
}

function useSeason(year: number, season: Season) {
  return useQuery({
    queryKey: ['sweep', year, season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${year}&season=${season}&limit=12`),
    staleTime: Infinity,
  }).data?.items ?? []
}

const WORDS = ['Every', 'anime', 'you’ve', 'watched,', 'ranked', 'by', 'you.']

export function Landing() {
  const now = currentSeason()
  const s1 = now, s2 = back(now.year, now.season, 1), s3 = back(now.year, now.season, 4)
  const a = useSeason(s1.year, s1.season), b = useSeason(s2.year, s2.season), c = useSeason(s3.year, s3.season)
  const [marked, setMarked] = useState<AnimeBrief[]>([])
  const [pick, setPick] = useState<'a' | 'b' | null>(null)
  const isOn = (id: number) => marked.some((m) => m.id === id)

  function toggle(x: AnimeBrief) {
    const next = isOn(x.id) ? marked.filter((m) => m.id !== x.id) : [...marked, x]
    setMarked(next)
    setPick(null)
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(next)) } catch { /* storage blocked: fine */ }
  }

  const pair = useMemo(() => {
    if (marked.length >= 2) return [marked[marked.length - 2], marked[marked.length - 1]]
    const pool = [...c, ...b]
    return pool.length >= 2 ? [pool[0], pool[1]] : null
  }, [marked, b, c])

  const bands: [typeof s1, AnimeBrief[], string][] = [
    [s1, a, 'airing now'], [s2, b, 'last season'], [s3, c, 'a year ago'],
  ]

  return (
    <div className="landing" data-season={now.season}>
      <section className="l-top page">
        <h1 className="display l-title" aria-label="Every anime you’ve watched, ranked by you.">
          {WORDS.map((w, i) => (
            <span key={i} aria-hidden="true">{i > 0 && ' '}<span className="l-word-mask">
              <motion.span className={`l-word${i >= 4 ? ' l-accent' : ''}`} initial={{ y: '105%' }} animate={{ y: 0 }}
                transition={{ delay: 0.75 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>{w}</motion.span>
            </span></span>
          ))}
        </h1>
        <motion.div className="l-side" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <p className="l-lead">
            No 1 to 10 sliders. You pick a feeling, answer a couple of “which did you enjoy more?” questions,
            and your scores sort themselves out. Then a taste model trained on 56 million real ratings finds what
            you’ll love next.
          </p>
          <p className="l-try-ask display">Tap what you’ve seen <span aria-hidden="true">↓</span></p>
        </motion.div>
      </section>

      <section className="l-try page" aria-label="Try it">
        {bands.map(([s, items, label]) => items.length > 0 && (
          <SeasonBand key={`${s.year}-${s.season}`} season={s.season} year={s.year} count={label} reveal>
            <div className="l-grid">
              {items.map((x, i) => (
                <motion.button key={x.id} type="button" className="l-tile" onClick={() => toggle(x)} aria-pressed={isOn(x.id)}
                  initial={{ opacity: 0, y: 28, rotate: i % 2 ? 2.5 : -2.5 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: 0.25 + i * 0.045, type: 'spring', stiffness: 260, damping: 24 }}>
                  <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                    status={isOn(x.id) ? 'completed' : undefined} animateMark />
                  <span className="tile-title">{x.title_en ?? x.title}</span>
                </motion.button>
              ))}
            </div>
          </SeasonBand>
        ))}
      </section>

      {pair && (
        <section className="l-duel page" data-season="WINTER">
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
          </div>
          <div className="l-duel-out">
            {pick ? (
              <>
                <ScoreRail score={9.2} predicted={8.9} />
                <p className="l-note">That answer moved one title above the other. A few of these and every score on your
                  chart is honest. The dashed line is Konomi’s guess, shown only after you answer. (Example numbers.)</p>
              </>
            ) : <p className="l-note">Pick one.</p>}
          </div>
        </section>
      )}

      <section className="l-end page">
        <p className="display l-end-title">Your chart starts with one tap.</p>
        <Link to="/signup" className="btn btn-primary l-btn">Start your chart</Link>
      </section>

      <footer className="l-foot page">
        <span className="display">好み Konomi</span>
        <span className="faint">Catalogue: anime-offline-database (ODbL), AniList. Ratings: MyAnimeList via Kaggle.</span>
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
