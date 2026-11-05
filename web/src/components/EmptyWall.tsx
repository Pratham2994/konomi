import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useListIndex, useRemove, useRemoveWithUndo, useSetStatus } from '../lib/hooks'
import type { AnimeBrief } from '../lib/types'
import { Cover } from './Cover'
import { Ghosts, Headline } from './Wall'
import { VtLink } from './VtLink'
import { deal, useWallLayout, wallCells, type WallLayout } from './wallLayout'

const LAYOUTS: WallLayout[] = [
  { min: 0, cols: 4, sign: [1, 4, 1], row: 1, rows: 4 },
  { min: 520, cols: 6, sign: [1, 6, 1], row: 1, rows: 4 },
  { min: 860, cols: 8, sign: [2, 6, 2], row: 2, rows: 4 },
  { min: 1160, cols: 10, sign: [3, 6, 2], row: 2, rows: 4 },
  { min: 1640, cols: 12, sign: [4, 6, 2], row: 2, rows: 4 },
  { min: 2080, cols: 14, sign: [5, 6, 2], row: 2, rows: 4 },
]

/**
 * An empty page is never blank text: its message hangs in a wall of the most popular covers. With `tap`, the
 * covers mark what you've seen (the quickest way to fill an empty chart); otherwise they open their title.
 */
export function EmptyWall({ words, accent, text, actions, tap, as = 'h1' }: {
  words: string[]; accent?: number; text?: ReactNode; actions?: ReactNode; tap?: boolean; as?: 'h1' | 'h2'
}) {
  const { data } = useQuery({
    queryKey: ['popular', 'all', 60],
    queryFn: () => api<{ items: AnimeBrief[] }>('/api/popular?limit=60&kind=all'),
    staleTime: Infinity,
  })
  const [ref, layout] = useWallLayout(LAYOUTS)
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()
  const removeWithUndo = useRemoveWithUndo()
  const items = data?.items ?? []
  const n = wallCells(layout, data ? items.length : 999)
  const [col, span, rows] = layout.sign

  function toggle(a: AnimeBrief) {
    const e = onList.get(a.id)
    if (!e) setStatus.mutate({ anime: a, status: 'completed' })
    else if (e.tier != null) removeWithUndo(e)
    else remove.mutate(a.id)
  }

  return (
    <div className="hung empty-wall" ref={ref} style={{ ['--cols' as string]: layout.cols }}>
      <div className={`hung-sign empty-sign${rows === 1 ? ' is-row' : ''}`} style={{ gridColumn: `${col} / span ${span}`, gridRow: `${layout.row} / span ${rows}` }}>
        <div className="empty-sign-in">
          <Headline words={words} accent={accent} className="empty-title" as={as} />
          {text && <p className="empty-text">{text}</p>}
          {actions && <div className="empty-acts">{actions}</div>}
        </div>
      </div>
      {!data && <Ghosts n={n} />}
      {items.slice(0, n).map((a, k) => {
        const st = onList.get(a.id)?.status
        const cover = <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={st} animateMark={tap} />
        return tap ? (
          <button key={a.id} type="button" className="hung-cell" style={deal(k)} data-season={a.season ?? undefined}
            aria-pressed={st === 'completed'} aria-label={`${a.title_en ?? a.title}${st ? ', on your chart' : ''}`} onClick={() => toggle(a)}>
            {cover}<span className="wcap" aria-hidden="true">{a.title_en ?? a.title}</span>
          </button>
        ) : (
          <VtLink key={a.id} animeId={a.id} className="hung-cell" style={deal(k)} data-season={a.season ?? undefined}>
            {cover}<span className="wcap">{a.title_en ?? a.title}</span>
          </VtLink>
        )
      })}
    </div>
  )
}
