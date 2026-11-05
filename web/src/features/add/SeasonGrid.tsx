import { useEffect, useState, type ReactNode } from 'react'
import { Cover } from '../../components/Cover'
import { deal, fullRows, useGridCols } from '../../components/wallLayout'
import { STATUS_LABEL, useListIndex, useRemove, useRemoveWithUndo, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, Status } from '../../lib/types'
import './sweep.css'

/** A season's chart you mark by tapping: tap = watched; Dropped / Want underneath; S, D, W, X keys on hover. */
export function SeasonGrid({ items: all, compact, lead, rows, end }: {
  items: AnimeBrief[]; compact?: boolean
  /** A first cell before the covers: the season's slab. */
  lead?: ReactNode
  /** Show only as many covers as fill this many whole rows (the rest is a tap away elsewhere). */
  rows?: number
  /** Fills a short last row when every cover is shown. */
  end?: (span: number) => ReactNode
}) {
  const [gridRef, cols] = useGridCols<HTMLDivElement>()
  const leadN = lead ? 1 : 0
  const items = rows ? all.slice(0, fullRows(all.length, cols, leadN, rows)) : all
  const rest = (cols - ((items.length + leadN) % cols)) % cols
  const [focus, setFocus] = useState<number | null>(null)
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()
  const removeWithUndo = useRemoveWithUndo()

  // Untapping is silent for a quick correction; a title that already has a feeling gets an Undo, so it is never lost.
  function unmark(id: number) {
    const e = onList.get(id)
    if (e?.tier != null) removeWithUndo(e)
    else remove.mutate(id)
  }

  function mark(a: AnimeBrief, status: Status) {
    if (onList.get(a.id)?.status === status) unmark(a.id)
    else setStatus.mutate({ anime: a, status })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const a = items.find((x) => x.id === focus)
      if (!a) return
      const k = e.key.toLowerCase()
      if (k === 's') mark(a, 'completed')
      else if (k === 'd') mark(a, 'dropped')
      else if (k === 'w') mark(a, 'planned')
      else if (k === 'x' && onList.get(a.id)) unmark(a.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`wall dealt sweep-grid${compact ? ' sweep-grid-compact' : ''}`} ref={gridRef}>
      {lead}
      {items.map((a, i) => {
        const st = onList.get(a.id)?.status
        return (
          <div key={a.id} className={`sw${st ? ' is-marked' : ''}`} onMouseEnter={() => setFocus(a.id)} style={deal(i + (lead ? 1 : 0))}>
            <button type="button" className="sw-main" onClick={() => mark(a, 'completed')} onFocus={() => setFocus(a.id)}
              aria-pressed={st === 'completed'} aria-label={`${a.title_en ?? a.title}${st ? `, ${STATUS_LABEL[st]}` : ''}`}>
              <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={st} animateMark eager={i < 8} />
              <span className="tile-title">{a.title_en ?? a.title}</span>
            </button>
            <span className="sw-alt">
              <button type="button" className={st === 'dropped' ? 'is-on' : ''} onClick={() => mark(a, 'dropped')}>Dropped</button>
              <button type="button" className={st === 'planned' ? 'is-on' : ''} onClick={() => mark(a, 'planned')}>Want</button>
            </span>
          </div>
        )
      })}
      {!rows && rest > 0 && end?.(rest)}
    </div>
  )
}
