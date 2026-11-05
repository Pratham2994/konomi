import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SEASON_KANJI, SEASON_LABEL } from '../lib/hooks'
import type { Season } from '../lib/types'
import { Mark } from './Mark'
import { deal } from './wallLayout'
import './wall.css'

/**
 * The cover wall the landing page started: covers in one even grid, each season led by a slab of its own ink.
 * Every page that shows many covers uses these parts, so the whole site reads as one record shop wall.
 */


/** A whole cell in a season's ink: big kanji, season and year, a short line. Neutral slabs are paper. */
export function Slab({ season, year, name, kanji, sub, to, i = 0, className = '', children }: {
  season: Season | null; year?: number | null
  /** Replaces "Fall 2026" (e.g. "Your chart"). */
  name?: ReactNode
  /** Replaces the season kanji. */
  kanji?: string
  sub?: ReactNode
  /** The whole slab opens this page. */
  to?: string
  i?: number
  className?: string
  /** An action at the foot of the slab. */
  children?: ReactNode
}) {
  const glyph = kanji ?? (season ? SEASON_KANJI[season] : null)
  const body = (
    <span className="slab-in">
      {glyph && <span className={`slab-kanji display${glyph.length > 1 ? ' is-pair' : ''}`} aria-hidden="true">{glyph}</span>}
      <span className="slab-name display">
        {name ?? (season ? <>{SEASON_LABEL[season]}<br />{year}</> : year ?? 'Date unknown')}
      </span>
      {sub && <span className="slab-sub">{sub}</span>}
      {children && <span className="slab-act">{children}</span>}
    </span>
  )
  const cls = `slab${season ? '' : ' slab-neutral'} ${className}`
  return to ? (
    <Link to={to} className={cls} data-season={season ?? undefined} style={deal(i)}>{body}</Link>
  ) : (
    <div className={cls} data-season={season ?? undefined} style={deal(i)}>{body}</div>
  )
}

/**
 * A season's divider tab, on top of its first cover in a long wall (a chart of many small seasons): kanji, season
 * and year, count. The covers after it carry the same ink as a thin rule, so the season reads as one run.
 */
export function TabHead({ season, year, label, count, end }: {
  season: Season | null; year: number | null; label?: string; count?: number; end?: boolean
}) {
  return (
    <span className={`tab tab-head${season || label ? '' : ' tab-plain'}${label ? ' tab-label' : ''}${end ? ' is-end' : ''}`} aria-hidden="true">
      {!label && season && <span className="tab-kanji display">{SEASON_KANJI[season]}</span>}
      <span className="tab-name display">{label ?? (season ? `${SEASON_LABEL[season]} ${year}` : year ?? 'Date unknown')}</span>
      {count != null && count > 1 && <span className="tab-n">{count}</span>}
    </span>
  )
}

export function TabBar({ end, plain }: { end?: boolean; plain?: boolean }) {
  return <span className={`tab tab-bar${plain ? ' tab-plain' : ''}${end ? ' is-end' : ''}`} aria-hidden="true" />
}

/** Covers still on their way: grey cells in the same places, so nothing jumps when the art arrives. */
export function Ghosts({ n, from = 0, titled }: { n: number; from?: number; titled?: boolean }) {
  return <>{Array.from({ length: n }, (_, k) => (
    <span key={`g${k}`} className={`ghost${titled ? ' ghost-titled' : ''}`} style={deal(from + k)} aria-hidden="true">
      <span className="ghost-art" />{titled && <span className="ghost-line" />}
    </span>
  ))}</>
}

/**
 * A display headline whose words rise into place one by one. `accent` words (by index, from there on) take the
 * season ink; `circle` gets the pen circle drawn round it once the words have landed.
 */
export function Headline({ words, accent, circle, className = '', delay = 0.1, as = 'h1' }: {
  words: string[]; accent?: number; circle?: number; className?: string; delay?: number; as?: 'h1' | 'h2'
}) {
  const still = useReducedMotion()
  const Tag = as
  return (
    <Tag className={`display headline ${className}`} aria-label={words.join(' ')}>
      {words.map((w, i) => {
        const word = (
          <span className="hl-mask">
            <motion.span className={`hl-word${accent != null && i >= accent ? ' hl-accent' : ''}`} initial={still ? false : { y: '105%' }}
              animate={{ y: 0 }} transition={{ delay: delay + i * 0.06, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}>{w}</motion.span>
          </span>
        )
        return (
          <span key={i} aria-hidden="true">{i > 0 && ' '}
            {i === circle ? (
              <span className="hl-circled" style={{ ['--hl-delay' as string]: `${delay + words.length * 0.06 + 0.35}s` }}>
                {word}<Mark status="completed" animate seed={7} />
              </span>
            ) : word}
          </span>
        )
      })}
    </Tag>
  )
}
