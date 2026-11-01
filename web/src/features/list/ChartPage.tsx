import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { VtLink } from '../../components/VtLink'
import { Bands, CoverGrid, SeasonBand } from '../../components/SeasonBand'
import { PageLoading } from '../../components/PageLoading'
import { SEASON_ORDER, STATUS_LABEL, useList } from '../../lib/hooks'
import type { Entry, Season, Status } from '../../lib/types'
import './chart.css'

type Filter = 'all' | Status
type Sort = 'season' | 'score'

/** On a chart, "watched" is the norm and its score strip already says so: pen marks are kept for the exceptions. */
const markFor = (s: Status) => (s === 'completed' ? undefined : s)

export function Tile({ e, sub }: { e: Entry; sub?: string }) {
  const a = e.anime
  return (
    <VtLink animeId={a.id} className="tile" data-season={a.season ?? undefined}>
      <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={markFor(e.status)} score={e.score} vt />
      <span className="tile-title">{a.title_en ?? a.title}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </VtLink>
  )
}

export function ChartPage() {
  const { data: entries = [], isLoading } = useList()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('season')

  const shown = useMemo(() => entries.filter((e) => filter === 'all' || e.status === filter), [entries, filter])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length }
    for (const e of entries) c[e.status] = (c[e.status] ?? 0) + 1
    return c
  }, [entries])

  const groups = useMemo(() => {
    const m = new Map<string, { season: Season | null; year: number | null; items: Entry[] }>()
    for (const e of shown) {
      const k = `${e.anime.year ?? 0}-${e.anime.season ?? 'X'}`
      if (!m.has(k)) m.set(k, { season: e.anime.season, year: e.anime.year, items: [] })
      m.get(k)!.items.push(e)
    }
    const rank = (s: Season | null) => (s ? SEASON_ORDER.indexOf(s) : -1)
    return [...m.values()]
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || rank(b.season) - rank(a.season))
      .map((g) => ({ ...g, items: g.items.sort((x, y) => (y.score ?? -1) - (x.score ?? -1)) }))
  }, [shown])

  const byScore = useMemo(() => [...shown].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), [shown])
  const hours = useMemo(() => Math.round(entries.filter((e) => e.status === 'completed')
    .reduce((s, e) => s + (e.anime.episodes ?? 1) * (e.anime.duration_s ?? 1440), 0) / 3600), [entries])

  if (isLoading) return <PageLoading />

  if (entries.length === 0) {
    return (
      <div className="page chart-empty">
        <h1 className="display">Your chart is empty</h1>
        <p className="muted">Type any anime in the search bar and press Enter. Or tap through the most popular anime and mark what you’ve seen.</p>
        <Link to="/sweep" className="btn btn-primary">Add anime</Link>
      </div>
    )
  }

  const shownFilters = (['all', 'completed', 'watching', 'dropped', 'planned'] as Filter[])
    .filter((f) => f === 'all' || f === filter || (counts[f] ?? 0) > 0)
  return (
    <div className="page chart">
      <header className="chart-head">
        <h1 className="display chart-title">Your chart</h1>
        <p className="chart-stats">
          <strong>{counts.completed ?? 0}</strong> watched · about <strong>{hours.toLocaleString()}</strong> hours
          {counts.watching ? <> · <strong>{counts.watching}</strong> watching</> : null}
        </p>
      </header>
      <div className="chart-controls">
        {/* Only statuses you have; with everything in one status there is nothing to filter. */}
        {shownFilters.length > 2 && <div className="seg" role="tablist" aria-label="Filter by status">
          {shownFilters.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS_LABEL[f]} <span className="seg-n">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>}
        <div className="seg" role="tablist" aria-label="Arrange">
          <button role="tab" aria-selected={sort === 'season'} className={sort === 'season' ? 'is-on' : ''} onClick={() => setSort('season')}>By season</button>
          <button role="tab" aria-selected={sort === 'score'} className={sort === 'score' ? 'is-on' : ''} onClick={() => setSort('score')}>By score</button>
        </div>
      </div>

      {sort === 'season' ? <Bands>{groups.map((g) => (
        <SeasonBand key={`${g.year}-${g.season}`} season={g.season} year={g.year} count={`${g.items.length}`} wide={g.items.length > 8} n={g.items.length}>
          <CoverGrid>{g.items.map((e) => <Tile key={e.anime_id} e={e} />)}</CoverGrid>
        </SeasonBand>
      ))}</Bands> : (
        <ol className="ranked">
          {byScore.map((e, i) => (
            <li key={e.anime_id} data-season={e.anime.season ?? undefined}>
              <span className="ranked-n display">{i + 1}</span>
              <Tile e={e} sub={[e.anime.year, e.score == null && e.status === 'completed' ? 'not rated yet' : null].filter(Boolean).join(' · ')} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
