import { motion, useReducedMotion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { SEASON_KANJI, SEASON_LABEL } from '../lib/hooks'
import type { Season } from '../lib/types'
import { Mark } from './Mark'
import { deal, useGridCols } from './wallLayout'
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
  // A long word ("favourites") must fit the slab's width without breaking mid-word.
  const long = typeof name === 'string' && Math.max(...name.split(' ').map((w) => w.length)) > 8
  const body = (
    <span className="slab-in">
      {glyph && <span className={`slab-kanji display${glyph.length > 1 ? ' is-pair' : ''}`} aria-hidden="true">{glyph}</span>}
      <span className={`slab-name display${long ? ' is-long' : ''}`}>
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
      <span className="tab-name display">
        {label ?? (season && year ? <><span className="tab-full">{SEASON_LABEL[season]} {year}</span><span className="tab-short">{SEASON_LABEL[season]} ’{String(year).slice(2)}</span></>
          : year ?? 'Date unknown')}
      </span>
      {count != null && count > 1 && <span className="tab-n">{count}</span>}
    </span>
  )
}

export function TabBar({ end, plain }: { end?: boolean; plain?: boolean }) {
  return <span className={`tab tab-bar${plain ? ' tab-plain' : ''}${end ? ' is-end' : ''}`} aria-hidden="true" />
}

/**
 * A wall of a whole list (a chart, a title's seasons): nothing can be left out, so when the last row is short, one
 * card with the obvious next step fills the rest of it, and the wall still ends on a whole row. Only real entries
 * go in the wall itself.
 * `cells` counts the cells the children take (a big cover takes four).
 */
export function WallGrid({ cells, end, className = '', as = 'div', children }: {
  cells: number; end?: (span: number) => ReactNode; className?: string; as?: 'div' | 'ol' | 'ul'; children: ReactNode
}) {
  const [ref, cols] = useGridCols<HTMLElement>()
  const rest = (cols - (cells % cols)) % cols
  const Tag = as
  return (
    <Tag className={`wall ${className}`} ref={ref}>
      {children}
      {rest > 0 && end?.(rest)}
    </Tag>
  )
}

/** The cell that ends a short last row: as wide as the room left, as tall as a cover, one clear link. */
export function WallEnd({ span, to, onClick, label, item }: {
  span: number; to?: string; onClick?: () => void; label: string
  /** Inside an <ol>/<ul> wall. */
  item?: boolean
}) {
  const style = { gridColumn: `span ${span}`, ['--k' as string]: span } as CSSProperties
  // Three covers wide or more: the disc and the words sit side by side in the middle, not lost in a corner.
  const cls = `wall-end${span >= 3 ? ' is-wide' : ''}`
  const body = <><span className="wall-end-disc" aria-hidden="true"><Icon name="arrowRight" size={20} stroke={2.4} /></span>
    <span className="wall-end-label display">{label}</span></>
  const cell = to
    ? <Link to={to} className={cls} style={item ? undefined : style}>{body}</Link>
    : <button type="button" className={cls} onClick={onClick} style={item ? undefined : style}>{body}</button>
  return item ? <li className="wall-end-item" style={style}>{cell}</li> : cell
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
