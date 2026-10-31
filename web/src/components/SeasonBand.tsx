import type { ReactNode } from 'react'
import { SEASON_KANJI, SEASON_LABEL } from '../lib/hooks'
import type { Season } from '../lib/types'
import './seasonband.css'

/** A season header in its own ink: big kanji, season + year, and a count. */
export function SeasonBand({ season, year, count, children, aside, label }: {
  season: Season | null; year: number | null; count?: string; children: ReactNode; aside?: ReactNode; label?: string
}) {
  return (
    <section className="band" data-season={season ?? undefined}>
      <header className="band-head">
        <span className="band-kanji display" aria-hidden="true">{season ? SEASON_KANJI[season] : '—'}</span>
        <h2 className="band-title">
          <span className="display">{label ?? (season ? SEASON_LABEL[season] : 'Unknown season')}</span>
          {!label && year && <span className="band-year display">{year}</span>}
        </h2>
        {count && <span className="band-count">{count}</span>}
        {aside && <span className="band-aside">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

export function CoverGrid({ children, dense }: { children: ReactNode; dense?: boolean }) {
  return <div className={`grid${dense ? ' grid-dense' : ''}`}>{children}</div>
}
