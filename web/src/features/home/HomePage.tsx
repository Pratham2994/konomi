import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { VtLink } from '../../components/VtLink'
import { Ghosts, Headline, Slab } from '../../components/Wall'
import { deal, fullRows, useGridCols, useWallLayout, wallCells, type WallLayout } from '../../components/wallLayout'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { currentSeason, useList, useListIndex, useMe, useRemove, useRemoveWithUndo, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, Entry } from '../../lib/types'
import { QuickAdd } from '../add/QuickAdd'
import { SeasonGrid } from '../add/SeasonGrid'
import { PENDING_KEY } from './Landing'
import './home.css'

export interface Rec {
  anime: AnimeBrief
  predicted: number | null
  /** Your titles behind this pick. */
  because: AnimeBrief[]
  /** Why it was picked, in one plain sentence (older servers send only `because`). */
  reason?: string
  kind?: 'similar' | 'genre' | 'sequel' | 'side' | 'taste' | 'popular'
  genres?: string[]
}

export interface Recs {
  items: Rec[]
  mode: 'model' | 'popular'
  need: number
  /** "Mostly because you loved A, B and C": the titles most picks came from. */
  summary?: string | null
}

export function useRecs(params = '', enabled = true) {
  const onList = useListIndex()
  const q = useQuery({
    queryKey: ['recs', params],
    queryFn: () => api<Recs>(`/api/taste/recs${params}`),
    retry: false,
    staleTime: 60_000,
    enabled,
  })
  // Something you just added leaves the list at once, before the server's next recommendations arrive.
  const data = q.data && { ...q.data, items: q.data.items.filter((r) => !onList.has(r.anime.id)) }
  return { ...q, data }
}

export function RecCard({ r }: { r: Rec }) {
  const a = r.anime
  const why = r.reason ?? (r.because.length > 0 ? `Because you liked ${r.because.map((b) => b.title_en ?? b.title).join(' and ')}` : null)
  return (
    <VtLink animeId={a.id} className="rec" data-season={a.season ?? undefined}>
      <span className="rec-art">
        <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} vt />
        {/* The titles of yours behind the pick, pinned to its cover. */}
        {r.because.length > 0 && (
          <span className="rec-pins" aria-hidden="true">
            {r.because.slice(0, 2).map((b) => (
              <span key={b.id} className="rec-pin"><Cover id={b.id} title={b.title} src={b.thumbnail ?? b.picture} color={b.color} size="xs" /></span>
            ))}
          </span>
        )}
      </span>
      <span className="tile-title">{a.title_en ?? a.title}</span>
      {r.predicted != null && <span className="rec-guess"><span className="display">{r.predicted.toFixed(1)}</span> for you</span>}
      {why && <span className="rec-why" data-kind={r.kind}>{why}</span>}
    </VtLink>
  )
}

/** Until Konomi can guess your scores: the three steps that get you there, with your progress. */
function Starter({ watched, rated }: { watched: number; rated: number }) {
  const steps = [
    { done: watched >= 10, title: 'Add 10 anime you’ve seen', note: `${Math.min(watched, 10)} of 10`, to: '/sweep', cta: 'Tap through popular anime' },
    { done: rated >= 5, title: 'Rate 5 of them', note: `${Math.min(rated, 5)} of 5`, to: '/rate', cta: 'Rate titles' },
    { done: false, title: 'Konomi starts guessing your scores', note: 'It learns from your answers', to: '/taste', cta: 'See your taste' },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <ol className="home-start" aria-label="Get started">
      {steps.map((s, i) => (
        <li key={s.title} className={s.done ? 'is-done' : i === current ? 'is-now' : ''}>
          <span className="home-start-dot display" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
          <span className="home-start-text">
            <strong>{s.title}</strong>
            <span className="muted">{s.done ? 'Done' : s.note}</span>
            {i === current && <Link to={s.to} className="btn btn-primary">{s.cta}</Link>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Your wall: the block you act in, hung among your own covers. Phones put the block first, then the covers. */
const HERO: WallLayout[] = [
  { min: 0, cols: 4, sign: [1, 4, 1], row: 1, rows: 4 },
  { min: 520, cols: 6, sign: [1, 6, 1], row: 1, rows: 4 },
  { min: 860, cols: 8, sign: [2, 6, 3], row: 2, rows: 5 },
  { min: 1160, cols: 10, sign: [2, 6, 3], row: 2, rows: 5 },
  { min: 1640, cols: 12, sign: [3, 7, 3], row: 2, rows: 5 },
  { min: 2080, cols: 14, sign: [4, 7, 3], row: 2, rows: 5 },
]
const MAX_CELLS = 14 * 5

/** The wall as it was when you opened Home, so covers you tap stay where they are instead of jumping. */
function useFrozenWall(entries: Entry[], ready: boolean, popular: AnimeBrief[] | undefined) {
  const [wall, setWall] = useState<{ mine: Entry[]; picks: AnimeBrief[] } | null>(null)
  const needPicks = entries.length < MAX_CELLS
  useEffect(() => {
    if (wall || !ready || (needPicks && !popular)) return
    const on = new Set(entries.map((e) => e.anime_id))
    setWall({ mine: entries.slice(0, MAX_CELLS), picks: (popular ?? []).filter((a) => !on.has(a.id)) })
  }, [wall, ready, needPicks, popular, entries])
  return wall
}

export function HomePage() {
  const { data: me } = useMe()
  const { data: entries = [], isSuccess: listReady } = useList()
  const { data: recs } = useRecs()
  const now = currentSeason()
  const { data: season } = useQuery({
    queryKey: ['sweep', now.year, now.season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${now.year}&season=${now.season}`),
    staleTime: Infinity,
  })
  // Shares its cache with Add anime's first page.
  const { data: popular, isError: popularFailed } = useQuery({
    queryKey: ['popular', 'all', 60],
    queryFn: () => api<{ items: AnimeBrief[] }>('/api/popular?limit=60&kind=all'),
    staleTime: Infinity, enabled: listReady && entries.length < MAX_CELLS,
  })
  const watchedN = entries.filter((e) => e.status === 'completed').length
  const ratedN = entries.filter((e) => e.tier != null).length
  const unrated = entries.filter((e) => e.status === 'completed' && e.tier == null).length
  const empty = listReady && entries.length === 0
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()
  const removeWithUndo = useRemoveWithUndo()
  const toast = useToast()
  const wall = useFrozenWall(entries, listReady, popular?.items ?? (popularFailed ? [] : undefined))
  const [heroRef, layout] = useWallLayout(HERO)
  const [recRef, recCols] = useGridCols<HTMLDivElement>()
  // The top bar's search hides while this page's own big one is on screen: one search box at a time.
  const [heroSearch, setHeroSearch] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!heroSearch) return
    const root = document.documentElement
    const io = new IntersectionObserver(([e]) => { root.dataset.heroSearch = e.isIntersecting ? 'on' : 'off' }, { rootMargin: '-64px 0px 0px 0px' })
    io.observe(heroSearch)
    return () => { io.disconnect(); delete root.dataset.heroSearch }
  }, [heroSearch])

  // Titles tapped on the landing page before signing up land on the new chart.
  useEffect(() => {
    let pending: AnimeBrief[] = []
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]')
      localStorage.removeItem(PENDING_KEY)
    } catch { return }
    if (!Array.isArray(pending) || pending.length === 0) return
    pending.slice(0, 60).forEach((anime) => setStatus.mutate({ anime, status: 'completed' }))
    toast({ text: `Added the ${pending.length} title${pending.length === 1 ? '' : 's'} you marked` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tap a cover you've seen; tap again to take it back (a title with a feeling gets an Undo).
  function toggle(a: AnimeBrief) {
    const e = onList.get(a.id)
    if (!e) setStatus.mutate({ anime: a, status: 'completed' })
    else if (e.tier != null) removeWithUndo(e)
    else remove.mutate(a.id)
  }

  const guesses = recs?.mode === 'model' ? recs.items.filter((r) => r.predicted != null).slice(0, 3) : []

  // The hero wall's cells: your slab and covers, then (if the wall has room) popular covers to tap.
  const mine = wall?.mine ?? []
  const picks = wall?.picks ?? []
  const room = wallCells(layout, wall ? (mine.length ? mine.length + 1 : 0) + (picks.length ? picks.length + 1 : 0) : MAX_CELLS)
  const mineCells = mine.length ? Math.min(mine.length + 1, room) : 0
  const pickCells = picks.length && room - mineCells >= 2 ? room - mineCells : 0
  const [signCol, signSpan, signRows] = layout.sign
  const name = me?.display_name ?? ''

  return (
    <div className="home">
      <section className="page home-hero" aria-label="Your wall">
        <div className="hung home-wall" ref={heroRef} style={{ ['--cols' as string]: layout.cols }}>
          <div className={`hung-sign home-sign${signRows === 1 ? ' is-row' : ''}`}
            style={{ gridColumn: `${signCol} / span ${signSpan}`, gridRow: `${layout.row} / span ${signRows}` }}>
            <div className="home-sign-in">
              {empty
                ? <Headline words={['What', 'have', 'you', 'watched?']} accent={3} circle={3} className="home-title" />
                : <Headline words={['What', 'did', 'you', 'watch', 'lately?']} accent={4} circle={4} className="home-title" />}
              {empty && (
                <p className="home-lead">
                  Welcome, {name}. Type a title and press Enter, and it lands on your chart. Or tap the covers you’ve seen,{' '}
                  <Link to="/sweep">walk back through past seasons</Link>, or <Link to="/settings#import">import from MyAnimeList or AniList</Link>.
                </p>
              )}
              <div ref={setHeroSearch}><QuickAdd variant="hero" autoFocus={empty} /></div>
              {unrated > 0 ? (
                <Link to="/rate" className="home-next">
                  <span className="display home-next-n">{unrated}</span>
                  <span className="home-next-text">
                    <strong>{unrated === 1 ? 'title is' : 'titles are'} waiting for a feeling.</strong>
                    <span className="muted"> A few quick answers turn them into scores.</span>
                  </span>
                  <span className="btn btn-primary">Rate now</span>
                </Link>
              ) : guesses.length > 0 ? (
                <div className="home-guesses">
                  <p className="muted">Konomi’s guesses, if you watched these:</p>
                  <ol>
                    {guesses.map((r) => (
                      <li key={r.anime.id}>
                        <VtLink animeId={r.anime.id}>
                          <Cover id={r.anime.id} title={r.anime.title} src={r.anime.thumbnail} color={r.anime.color} size="xs" />
                          <span className="home-guess-title">{r.anime.title_en ?? r.anime.title}</span>
                          <span className="display home-guess-n">{r.predicted!.toFixed(1)}</span>
                        </VtLink>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : recs ? <Starter watched={watchedN} rated={ratedN} /> : null}
            </div>
          </div>

          {!wall && <Ghosts n={room} />}
          {mineCells > 0 && <Slab season={now.season} kanji="好み" name="Your chart" to="/chart" i={0}
            sub={`${entries.length} title${entries.length === 1 ? '' : 's'}`} />}
          {mine.slice(0, Math.max(0, mineCells - 1)).map((snap, k) => {
            const e = onList.get(snap.anime_id)
            const a = snap.anime
            return (
              <VtLink key={a.id} animeId={a.id} className="hung-cell" data-season={a.season ?? undefined} style={deal(k + 1)}>
                <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} vt priority={k < 8}
                  status={e && e.status !== 'completed' ? e.status : undefined} score={e?.score} />
                <span className="wcap">{a.title_en ?? a.title}</span>
              </VtLink>
            )
          })}
          {pickCells > 0 && <Slab season={null} kanji="人気" name="Most popular" i={mineCells}
            sub={mine.length ? 'Seen these? Tap them' : 'Tap every one you’ve seen'} />}
          {picks.slice(0, Math.max(0, pickCells - 1)).map((a, k) => {
            const st = onList.get(a.id)?.status
            return (
              <button key={a.id} type="button" className="hung-cell" data-season={a.season ?? undefined} style={deal(mineCells + k + 1)}
                aria-pressed={st === 'completed'} aria-label={`${a.title_en ?? a.title}${st ? ', on your chart' : ''}`}
                title={a.title_en ?? a.title} onClick={() => toggle(a)}>
                <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={st} animateMark priority={mineCells + k < 8} />
                <span className="wcap" aria-hidden="true">{a.title_en ?? a.title}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="page home-sec" aria-label="Airing now">
        {season ? (
          season.items.length > 0 && (
            <SeasonGrid items={season.items} rows={2} compact
              lead={<Slab season={now.season} year={now.year}
                sub={`airing now. ${season.items.filter((a) => onList.has(a.id)).length} on your chart`}>
                <Link to={`/sweep?view=season&year=${now.year}&season=${now.season}`}>Whole season</Link>
              </Slab>} />
          )
        ) : <div className="wall" aria-hidden="true"><Ghosts n={12} titled /></div>}
      </section>

      {recs && recs.items.length > 0 && (
        <section className="page home-sec" aria-label="For you">
          <div className="wall dealt home-recs" ref={recRef}>
            <Slab season={null} kanji="推し" name="For you"
              sub={recs.mode === 'model' ? (recs.summary ?? 'Picked by your taste') : 'Popular picks for now. Rate a few favourites to make them yours'}>
              <Link to="/taste">See your taste</Link>
            </Slab>
            {recs.items.slice(0, fullRows(recs.items.length, recCols, 1, 2)).map((r, k) => (
              <div key={r.anime.id} className="home-rec" style={deal(k + 1)}><RecCard r={r} /></div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
