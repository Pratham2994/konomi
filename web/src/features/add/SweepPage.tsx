import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { SeasonBand } from '../../components/SeasonBand'
import { api } from '../../lib/api'
import { currentSeason, SEASON_LABEL, SEASON_ORDER, STATUS_LABEL, useListIndex, useRemove, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, Season, Status } from '../../lib/types'
import './sweep.css'

function step(year: number, season: Season, dir: -1 | 1): { year: number; season: Season } {
  let i = SEASON_ORDER.indexOf(season) + dir
  let y = year
  if (i < 0) { i = 3; y -= 1 }
  if (i > 3) { i = 0; y += 1 }
  return { year: y, season: SEASON_ORDER[i] }
}

const ERAS = [2025, 2020, 2015, 2010, 2005, 2000, 1995, 1990]

export function SweepPage() {
  const now = currentSeason()
  const [params, setParams] = useSearchParams()
  const year = Number(params.get('year')) || now.year
  const season = (params.get('season') as Season) || now.season
  const [walked, setWalked] = useState(0)
  const [focus, setFocus] = useState<number | null>(null)
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()

  const { data, isLoading } = useQuery({
    queryKey: ['sweep', year, season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${year}&season=${season}`),
    staleTime: Infinity,
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

  function mark(a: AnimeBrief, status: Status) {
    const cur = onList.get(a.id)?.status
    if (cur === status) remove.mutate(a.id)
    else setStatus.mutate({ anime: a, status })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const a = items.find((x) => x.id === focus)
      const k = e.key.toLowerCase()
      if (a && k === 's') mark(a, 'completed')
      else if (a && k === 'd') mark(a, 'dropped')
      else if (a && k === 'w') mark(a, 'planned')
      else if (a && k === 'x' && onList.get(a.id)) remove.mutate(a.id)
      else if (e.key === 'ArrowLeft' && e.shiftKey) go(prev)
      else if (e.key === 'ArrowRight' && e.shiftKey && !isFuture) go(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const seenHere = items.filter((a) => onList.get(a.id)?.status === 'completed').length

  return (
    <div className="page sweep" data-season={season}>
      <header className="sweep-head">
        <div>
          <h1 className="display sweep-title">Season walk</h1>
          <p className="muted sweep-lead">Tap everything you’ve watched. Walk back in time, one season at a time.</p>
        </div>
        <div className="sweep-eras" role="group" aria-label="Jump to a year">
          {ERAS.map((y) => (
            <button key={y} className={`chip${year === y ? ' is-on' : ''}`} onClick={() => go({ year: y, season: 'FALL' })}>{y}</button>
          ))}
        </div>
      </header>

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
        <div className="sweep-grid">
          {items.map((a) => {
            const st = onList.get(a.id)?.status
            return (
              <div key={a.id} className={`sw${st ? ' is-marked' : ''}`} onMouseEnter={() => setFocus(a.id)}>
                <button type="button" className="sw-main" onClick={() => mark(a, 'completed')} onFocus={() => setFocus(a.id)}
                  aria-pressed={st === 'completed'} aria-label={`${a.title_en ?? a.title}${st ? ` — ${STATUS_LABEL[st]}` : ''}`}>
                  <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={st} animateMark />
                  <span className="tile-title">{a.title_en ?? a.title}</span>
                </button>
                <span className="sw-alt">
                  <button type="button" className={st === 'dropped' ? 'is-on' : ''} onClick={() => mark(a, 'dropped')}>Dropped</button>
                  <button type="button" className={st === 'planned' ? 'is-on' : ''} onClick={() => mark(a, 'planned')}>Want</button>
                </span>
              </div>
            )
          })}
        </div>
      </SeasonBand>

      <footer className="sweep-foot">
        <button className="btn btn-primary sweep-next" onClick={() => go(prev)}>
          Walk back to {SEASON_LABEL[prev.season]} {prev.year} <Icon name="arrowRight" size={18} />
        </button>
        {walked > 0 && <Link to="/rate" className="btn">Rate what you marked</Link>}
        <p className="faint sweep-keys">Keyboard: hover a cover, then <kbd>S</kbd> watched · <kbd>D</kbd> dropped · <kbd>W</kbd> want · <kbd>X</kbd> clear · <kbd>Shift</kbd>+<kbd>←</kbd> earlier</p>
      </footer>
    </div>
  )
}
