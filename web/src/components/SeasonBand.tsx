import type { ReactNode } from 'react'
import { SEASON_KANJI, SEASON_LABEL } from '../lib/hooks'
import type { Season } from '../lib/types'
import './seasonband.css'

/** A season header in its own ink: big kanji, season + year, and a count. */
export function SeasonBand({ season, year, count, children, aside, label, neutral, wide }: {
  season: Season | null; year: number | null; count?: string; children: ReactNode; aside?: ReactNode; label?: string
  /** Not a real season (For you, Recently added): paper header, no season ink. */
  neutral?: boolean
  /** Span the full row inside a multi-column <Bands>. */
  wide?: boolean
}) {
  return (
    <section className={`band${neutral ? ' band-neutral' : ''}${wide ? ' band-wide' : ''}`} data-season={neutral ? undefined : season ?? undefined}>
      <header className="band-head">
        {!neutral && season && <span className="band-kanji display" aria-hidden="true">{SEASON_KANJI[season]}</span>}
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

/** Season bands side by side on wide screens, like a printed seasonal chart. */
export function Bands({ children }: { children: ReactNode }) {
  return <div className="bands">{children}</div>
}
