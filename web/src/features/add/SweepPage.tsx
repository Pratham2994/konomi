import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Ghosts, Headline, Slab, WallEnd } from '../../components/Wall'
import { api } from '../../lib/api'
import { currentSeason, SEASON_LABEL, SEASON_ORDER, useListIndex } from '../../lib/hooks'
import type { AnimeBrief, Season } from '../../lib/types'
import { SeasonGrid } from './SeasonGrid'
import './sweep.css'

function step(year: number, season: Season, dir: -1 | 1): { year: number; season: Season } {
  let i = SEASON_ORDER.indexOf(season) + dir
  let y = year
  if (i < 0) { i = 3; y -= 1 }
  if (i > 3) { i = 0; y += 1 }
  return { year: y, season: SEASON_ORDER[i] }
}

type Kind = 'all' | 'shounen' | 'isekai' | 'romance' | 'films'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'shounen', label: 'Shounen' }, { id: 'isekai', label: 'Isekai' },
  { id: 'romance', label: 'Romance' }, { id: 'films', label: 'Films' },
]
const MOST = 500
const HIDE_KEY = 'konomi-hide-watched'

const ERAS = [2025, 2020, 2015, 2010, 2005, 2000, 1995, 1990]

export function SweepPage() {
  const now = currentSeason()
  const [params, setParams] = useSearchParams()
  // Opens on the most popular anime of all time; "By season" walks back through the seasons.
  const view = params.get('view') ?? (params.has('year') ? 'season' : 'popular')
  const [shown, setShown] = useState(60)
  const kind = (params.get('kind') as Kind) || 'all'
  const popular = useQuery({
    queryKey: ['popular', kind, shown],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/popular?limit=${shown}&kind=${kind}`),
    staleTime: Infinity, placeholderData: keepPreviousData, enabled: view === 'popular',
  })
  const year = Number(params.get('year')) || now.year
  const season = (params.get('season') as Season) || now.season
  const [walked, setWalked] = useState(0)
  const onList = useListIndex()

  // Hide watched: titles already on your chart when you open a page (or switch filter) are hidden. A cover you
  // tap now stays put, so you see the mark land and can tap again to undo.
  const [hideWatched, setHideWatched] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false } })
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    setHiddenIds(hideWatched ? new Set(onList.keys()) : new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideWatched, view, kind, year, season, onList.size === 0])
  function toggleHide() {
    const next = !hideWatched
    setHideWatched(next)
    try { localStorage.setItem(HIDE_KEY, next ? '1' : '0') } catch { /* storage blocked: fine */ }
  }
  const visible = (xs: AnimeBrief[]) => (hideWatched ? xs.filter((a) => !hiddenIds.has(a.id)) : xs)

  const { data, isLoading } = useQuery({
    queryKey: ['sweep', year, season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${year}&season=${season}`),
    staleTime: Infinity, enabled: view === 'season',
  })
  const items = data?.items ?? []
  const prev = step(year, season, -1)
  const next = step(year, season, 1)
  const isFuture = year > now.year || (year === now.year && SEASON_ORDER.indexOf(season) >= SEASON_ORDER.indexOf(now.season))

  function go(t: { year: number; season: Season }) {
    setParams({ year: String(t.year), season: t.season })
    setWalked((w) => w + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || view !== 'season') return
      if (e.key === 'ArrowLeft' && e.shiftKey) go(prev)
      else if (e.key === 'ArrowRight' && e.shiftKey && !isFuture) go(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const seenHere = items.filter((a) => onList.get(a.id)?.status === 'completed').length
  const pop = popular.data?.items ?? []
  const seenPop = pop.filter((a) => onList.get(a.id)?.status === 'completed').length
  const marked = pop.concat(items).some((a) => onList.get(a.id)?.status === 'completed' && !onList.get(a.id)?.tier)

  return (
    <div className="page sweep" data-season={season}>
      <header className="sweep-head">
        <div>
          <Headline words={['Tap', 'what', 'you’ve', 'seen.']} accent={3} className="sweep-title" />
          <p className="muted sweep-lead">
            {view === 'popular'
              ? 'Tap every one you’ve seen. Most people have watched a few dozen of these.'
              : 'Seeing the covers brings back what you watched. Tap everything you’ve seen, then step back a season.'}
          </p>
          <div className="sweep-switches">
          <div className="seg sweep-views" role="tablist" aria-label="How to browse">
            <button role="tab" aria-selected={view === 'popular'} className={view === 'popular' ? 'is-on' : ''}
              onClick={() => setParams({ view: 'popular' })}>Most popular</button>
            <button role="tab" aria-selected={view === 'season'} className={view === 'season' ? 'is-on' : ''}
              onClick={() => setParams({ view: 'season', year: String(year), season })}>By season</button>
          </div>
          <label className="toggle toggle-s sweep-hide">
            <input type="checkbox" checked={hideWatched} onChange={toggleHide} />
            <span className="toggle-ui" aria-hidden="true" />
            <span>Hide watched</span>
          </label>
          </div>
        </div>
        {view === 'season' && <div className="sweep-eras" role="group" aria-label="Jump to a year">
          {ERAS.map((y) => (
            <button key={y} className={`chip${year === y ? ' is-on' : ''}`} onClick={() => go({ year: y, season: 'FALL' })}>{y}</button>
          ))}
        </div>}
      </header>

      {view === 'popular' ? (
        <>
          <div className="sweep-kinds" role="group" aria-label="Show only">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip${kind === k.id ? ' is-on' : ''}`} aria-pressed={kind === k.id}
                onClick={() => { setShown(60); setParams(k.id === 'all' ? { view: 'popular' } : { view: 'popular', kind: k.id }) }}>
                {k.label}
              </button>
            ))}
          </div>
          {popular.isError && <p className="muted sweep-note">Couldn’t load the list. Try again in a moment.</p>}
          {hideWatched && pop.length > 0 && visible(pop).length === 0 && <p className="muted sweep-note">You’ve watched all of these. Show more below.</p>}
          {popular.isLoading ? <div className="wall"><Ghosts n={24} titled /></div> : (
            // While more can load, the wall stops on a whole row and the rest comes with Show 60 more.
            <SeasonGrid items={visible(pop)} rows={shown < MOST && pop.length >= shown ? 99 : undefined}
              end={(span) => <WallEnd span={span} to={marked ? '/rate' : '/sweep?view=season'} label={marked ? 'Rate what you marked' : 'Walk back by season'} />} lead={
              <Slab season={null} kanji="人気" name={kind === 'all' ? 'Most popular' : `Popular ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`}
                sub={`${seenPop} of ${pop.length} watched`} />} />
          )}
          <footer className="sweep-foot">
            {shown < MOST && pop.length >= shown && !popular.isError && (
              <button className="btn btn-primary sweep-next" disabled={popular.isFetching} onClick={() => setShown((n) => Math.min(n + 60, MOST))}>
                {popular.isFetching ? 'Loading…' : 'Show 60 more'}
              </button>
            )}
            {marked && <Link to="/rate" className="btn">Rate what you marked</Link>}
          </footer>
        </>
      ) : (<>
      {!isLoading && items.length === 0 && <p className="muted sweep-note">Nothing charted for this season.</p>}
      {hideWatched && items.length > 0 && visible(items).length === 0 && <p className="muted sweep-note">You’ve watched everything here. Try an earlier season.</p>}
      {/* The season's own slab leads its covers, with the steps to the seasons either side. */}
      {isLoading ? <div className="wall"><Ghosts n={24} titled /></div> : (
        <SeasonGrid key={`${year}-${season}`} items={visible(items)}
          end={(span) => <WallEnd span={span} onClick={() => go(prev)} label={`Back to ${SEASON_LABEL[prev.season]} ${prev.year}`} />} lead={
          <Slab season={season} year={year} sub={`${seenHere} of ${items.length} watched`}>
            <button className="btn sweep-step" onClick={() => go(prev)} aria-label={`Earlier: ${SEASON_LABEL[prev.season]} ${prev.year}`}>
              <Icon name="arrowLeft" size={16} />
            </button>
            <button className="btn sweep-step" onClick={() => go(next)} disabled={isFuture} aria-label={`Later: ${SEASON_LABEL[next.season]} ${next.year}`}>
              <Icon name="arrowRight" size={16} />
            </button>
          </Slab>} />
      )}

      <footer className="sweep-foot">
        <button className="btn btn-primary sweep-next" onClick={() => go(prev)}>
          Back to {SEASON_LABEL[prev.season]} {prev.year} <Icon name="arrowRight" size={18} />
        </button>
        {(walked > 0 || marked) && <Link to="/rate" className="btn">Rate what you marked</Link>}
        <p className="faint sweep-keys">Keyboard: hover a cover, then <kbd>S</kbd> watched · <kbd>D</kbd> dropped · <kbd>W</kbd> want · <kbd>X</kbd> clear · <kbd>Shift</kbd>+<kbd>←</kbd> earlier</p>
      </footer>
      </>)}
    </div>
  )
}
