import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { SeasonBand } from '../../components/SeasonBand'
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
          <h1 className="display sweep-title">Add anime</h1>
          <p className="muted sweep-lead">
            {view === 'popular'
              ? 'Tap every one you’ve seen. Most people have watched a few dozen of these.'
              : 'Seeing the covers brings back what you watched. Tap everything you’ve seen, then step back a season.'}
          </p>
          <div className="seg sweep-views" role="tablist" aria-label="How to browse">
            <button role="tab" aria-selected={view === 'popular'} className={view === 'popular' ? 'is-on' : ''}
              onClick={() => setParams({ view: 'popular' })}>Most popular</button>
            <button role="tab" aria-selected={view === 'season'} className={view === 'season' ? 'is-on' : ''}
              onClick={() => setParams({ view: 'season', year: String(year), season })}>By season</button>
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
          <SeasonBand season={null} year={null} neutral label={kind === 'all' ? 'Most popular of all time' : `Most popular ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`}
            count={popular.isLoading ? '' : `${seenPop} of ${pop.length} watched`}>
            {popular.isError && <p className="muted">Couldn’t load the list. Try again in a moment.</p>}
            <SeasonGrid items={pop} />
          </SeasonBand>
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
      <SeasonBand season={season} year={year}
        count={isLoading ? '' : `${seenHere} of ${items.length} watched`}
        aside={<span className="sweep-nav">
          <button className="btn" onClick={() => go(prev)} aria-label={`${SEASON_LABEL[prev.season]} ${prev.year}`}>
            <Icon name="arrowLeft" size={18} /> <span className="hide-s">Earlier</span>
          </button>
          <button className="btn" onClick={() => go(next)} disabled={isFuture} aria-label={`${SEASON_LABEL[next.season]} ${next.year}`}>
            <span className="hide-s">Later</span> <Icon name="arrowRight" size={18} />
          </button>
        </span>}>
        {!isLoading && items.length === 0 && <p className="muted">Nothing charted for this season.</p>}
        <SeasonGrid items={items} />
      </SeasonBand>

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
