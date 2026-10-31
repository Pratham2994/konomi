import { useState } from 'react'
import type { Status } from '../lib/types'
import { Mark } from './Mark'
import './cover.css'

interface Props {
  id: number
  title: string
  src: string | null
  color?: string | null
  status?: Status | null
  score?: number | null
  animateMark?: boolean
  size?: 'xs' | 's' | 'm' | 'l'
  eager?: boolean
}

/** A cover tile: art, optional hand mark, optional obi strip carrying the Konomi score. */
export function Cover({ id, title, src, color, status, score, animateMark, size = 'm', eager }: Props) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`cover cover-${size}`} style={{ ['--tint' as string]: color ?? 'var(--ink-4)' }}>
      <div className="cover-art">
        {src && !failed ? (
          <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)}
            referrerPolicy="no-referrer" />
        ) : (
          <span className="cover-fallback" aria-hidden="true">{title.slice(0, 1)}</span>
        )}
        {score != null && (
          <span className="obi" aria-label={`Your score ${score.toFixed(1)}`}>
            <span className="obi-num">{score.toFixed(1)}</span>
          </span>
        )}
      </div>
      {status && <Mark status={status} animate={animateMark} seed={id} />}
    </div>
  )
}
