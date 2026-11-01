import { useEffect, useState } from 'react'
import { Cover } from '../../components/Cover'
import { STATUS_LABEL, useListIndex, useRemove, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, Status } from '../../lib/types'
import './sweep.css'

/** A season's chart you mark by tapping: tap = watched; Dropped / Want underneath; S, D, W, X keys on hover. */
export function SeasonGrid({ items, compact }: { items: AnimeBrief[]; compact?: boolean }) {
  const [focus, setFocus] = useState<number | null>(null)
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()

  function mark(a: AnimeBrief, status: Status) {
    if (onList.get(a.id)?.status === status) remove.mutate(a.id)
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
      else if (k === 'x' && onList.get(a.id)) remove.mutate(a.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`sweep-grid${compact ? ' sweep-grid-compact' : ''}`}>
      {items.map((a) => {
        const st = onList.get(a.id)?.status
        return (
          <div key={a.id} className={`sw${st ? ' is-marked' : ''}`} onMouseEnter={() => setFocus(a.id)}>
            <button type="button" className="sw-main" onClick={() => mark(a, 'completed')} onFocus={() => setFocus(a.id)}
              aria-pressed={st === 'completed'} aria-label={`${a.title_en ?? a.title}${st ? `, ${STATUS_LABEL[st]}` : ''}`}>
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
  )
}
