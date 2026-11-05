import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { EmptyWall } from '../../components/EmptyWall'
import { VtLink } from '../../components/VtLink'
import { Headline, TabBar, TabHead } from '../../components/Wall'
import { deal } from '../../components/wallLayout'
import { PageLoading } from '../../components/PageLoading'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { restoreOf, SEASON_LABEL, SEASON_ORDER, STATUS_LABEL, useBulk, byRank, useList, useMe, useStored } from '../../lib/hooks'
import type { Entry, Season, Status } from '../../lib/types'
import { downloadChart } from './exportChart'
import './chart.css'

type Filter = 'all' | Status
type Sort = 'season' | 'score'

/** On a chart, "watched" is the norm and its score strip already says so: pen marks are kept for the exceptions. */
const markFor = (s: Status) => (s === 'completed' ? undefined : s)

export function Tile({ e, sub, picking, picked, onPick, tab, style }: {
  e: Entry; sub?: string
  /** Select mode: the tile toggles a tick instead of opening the title. */
  picking?: boolean; picked?: boolean; onPick?: () => void
  /** The season's divider tab (first title) or rule (the rest), above the cover. */
  tab?: ReactNode
  style?: CSSProperties
}) {
  const a = e.anime
  if (picking) {
    return (
      <button type="button" className={`tile tile-pick${picked ? ' is-picked' : ''}`} aria-pressed={!!picked} onClick={onPick}
        data-season={a.season ?? undefined} style={style}>
        {tab}
        <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={markFor(e.status)} score={e.score} />
        <span className="tile-tick" aria-hidden="true"><Icon name="check" size={18} stroke={3} /></span>
        <span className="tile-title">{a.title_en ?? a.title}</span>
        {sub && <span className="tile-sub">{sub}</span>}
      </button>
    )
  }
  return (
    <VtLink animeId={a.id} className="tile" data-season={a.season ?? undefined} style={style}>
      {tab}
      <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={markFor(e.status)} score={e.score} vt />
      <span className="tile-title">{a.title_en ?? a.title}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </VtLink>
  )
}

export function ChartPage() {
  const { data: entries = [], isLoading } = useList()
  const { data: me } = useMe()
  const [filter, setFilter] = useStored<Filter>('konomi-chart-filter', 'all', ['all', 'completed', 'watching', 'planned', 'dropped'])
  const [sort, setSort] = useStored<Sort>('konomi-chart-sort', 'season', ['season', 'score'])
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const bulk = useBulk()
  const toast = useToast()

  const stopPicking = () => { setPicking(false); setPicked(new Set()) }
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  useEffect(() => {
    if (!picking) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopPicking() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])

  function moveTo(status: Status) {
    const chosen = entries.filter((e) => picked.has(e.anime_id) && e.status !== status)
    if (chosen.length === 0) return stopPicking()
    bulk.mutate({ action: 'status', ids: chosen.map((e) => e.anime_id), status })
    // Undo puts each title back to the status it had: one request per old status.
    toast({
      title: `${chosen.length} title${chosen.length === 1 ? '' : 's'}`, text: `Moved to ${STATUS_LABEL[status]}`,
      action: { label: 'Undo', run: () => {
        for (const s of new Set(chosen.map((e) => e.status))) {
          bulk.mutate({ action: 'status', status: s, ids: chosen.filter((e) => e.status === s).map((e) => e.anime_id) })
        }
      } },
    })
    stopPicking()
  }

  function removeAll() {
    const chosen = entries.filter((e) => picked.has(e.anime_id))
    if (chosen.length === 0) return
    bulk.mutate({ action: 'remove', ids: chosen.map((e) => e.anime_id) })
    const rated = chosen.filter((e) => e.tier != null).length
    toast({
      title: `${chosen.length} title${chosen.length === 1 ? '' : 's'} removed`,
      text: rated ? `${rated} with ${rated === 1 ? 'its feeling' : 'their feelings'}. Undo brings them back` : 'Undo brings them back',
      action: { label: 'Undo', run: () => bulk.mutate({ action: 'restore', entries: chosen.map(restoreOf) }) },
    })
    stopPicking()
  }

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
      .map((g) => ({ ...g, items: g.items.sort(byRank) }))
  }, [shown])

  const byScore = useMemo(() => [...shown].sort(byRank), [shown])
  const hours = useMemo(() => Math.round(entries.filter((e) => e.status === 'completed')
    .reduce((s, e) => s + (e.anime.episodes ?? 1) * (e.anime.duration_s ?? 1440), 0) / 3600), [entries])

  if (isLoading) return <PageLoading variant="wall" label="Loading your chart" />

  if (entries.length === 0) {
    return (
      <div className="page chart-empty">
        <EmptyWall tap words={['Your', 'chart', 'is', 'empty.']} accent={3}
          text="Tap the covers you’ve seen and they land here. Or type any anime in the search bar and press Enter."
          actions={<><Link to="/sweep" className="btn btn-primary">Add anime</Link><Link to="/settings#import" className="btn">Import a list</Link></>} />
      </div>
    )
  }

  const shownFilters = (['all', 'completed', 'watching', 'dropped', 'planned'] as Filter[])
    .filter((f) => f === 'all' || f === filter || (counts[f] ?? 0) > 0)
  return (
    <div className="page chart">
      <header className="chart-head">
        <Headline words={['Your', 'chart']} accent={1} className="chart-title" />
        <p className="chart-stats">
          <strong className="display">{counts.completed ?? 0}</strong> watched, about <strong className="display">{hours.toLocaleString()}</strong> hours
          {counts.watching ? <>, <strong className="display">{counts.watching}</strong> watching now</> : null}
          {groups.length > 1 ? <>, across <strong className="display">{groups.length}</strong> seasons</> : null}
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
        <div className="chart-tools">
          <div className="seg" role="tablist" aria-label="Arrange">
            <button role="tab" aria-selected={sort === 'season'} className={sort === 'season' ? 'is-on' : ''} onClick={() => setSort('season')}>By season</button>
            <button role="tab" aria-selected={sort === 'score'} className={sort === 'score' ? 'is-on' : ''} onClick={() => setSort('score')}>By score</button>
          </div>
          <button className={`btn${picking ? ' btn-primary' : ''}`} aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))}>
            {picking ? 'Done' : 'Select'}
          </button>
          {!picking && me && entries.length > 0 && (
            <button className="btn" onClick={() => downloadChart(entries, me)} title="Download your chart as one web page to keep or share">
              <Icon name="download" size={16} /> Save as page
            </button>
          )}
        </div>
      </div>

      {/* One wall in season order. Each season's first cover carries its divider tab; the rest carry its rule. */}
      {sort === 'season' ? <div className="wall dealt chart-wall">{groups.map((g, gi) => {
        const at = groups.slice(0, gi).reduce((n, x) => n + x.items.length, 0)
        return (
          <Fragment key={`${g.year}-${g.season}`}>
            <h2 className="sr-only">{g.season && g.year ? `${SEASON_LABEL[g.season]} ${g.year}` : g.year ?? 'Date unknown'}, {g.items.length} title{g.items.length === 1 ? '' : 's'}</h2>
            {g.items.map((e, j) => (
              <Tile key={e.anime_id} e={e} picking={picking} picked={picked.has(e.anime_id)} onPick={() => toggle(e.anime_id)} style={deal(at + j)}
                tab={j === 0 ? <TabHead season={g.season} year={g.year} count={g.items.length} end={g.items.length === 1} />
                  : <TabBar end={j === g.items.length - 1} plain={!g.season} />} />
            ))}
          </Fragment>
        )
      })}</div> : (
        <ol className="wall ranked dealt">
          {byScore.map((e, i) => (
            <li key={e.anime_id} data-season={e.anime.season ?? undefined} style={deal(i)}>
              <span className="ranked-n display">{i + 1}</span>
              <Tile e={e} sub={[e.anime.year, e.score == null && e.status === 'completed' ? 'not rated yet' : null].filter(Boolean).join(' · ')}
                picking={picking} picked={picked.has(e.anime_id)} onPick={() => toggle(e.anime_id)} />
            </li>
          ))}
        </ol>
      )}

      {picking && (
        <div className="pick-bar" role="toolbar" aria-label="Change the selected titles">
          <span className="pick-count"><strong className="display">{picked.size}</strong> selected</span>
          <button className="btn btn-ghost" onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((e) => e.anime_id)))}>
            {picked.size === shown.length ? 'Select none' : 'Select all'}
          </button>
          <span className="pick-moves">
            {(['completed', 'watching', 'planned', 'dropped'] as Status[]).map((s) => (
              <button key={s} className="btn" disabled={picked.size === 0} onClick={() => moveTo(s)}>{STATUS_LABEL[s]}</button>
            ))}
          </span>
          <button className="btn pick-remove" disabled={picked.size === 0} onClick={removeAll}><Icon name="close" size={16} /> Remove</button>
        </div>
      )}
    </div>
  )
}
