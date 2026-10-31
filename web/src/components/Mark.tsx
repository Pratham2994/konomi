import type { Status } from '../lib/types'
import './mark.css'

/**
 * Hand-drawn status marks laid over a cover, in the season ink.
 * completed = circled, watching = half arc, dropped = struck through, planned = dotted ring.
 * The stroke draws itself once when `animate` is set (the signature interaction).
 */
export function Mark({ status, animate = false, seed = 0 }: { status: Status; animate?: boolean; seed?: number }) {
  // Small per-cover wobble so marks never look stamped.
  const j = ((seed * 9301 + 49297) % 233280) / 233280
  const rot = -8 + j * 16
  const cls = `mark mark-${status}${animate ? ' mark-draw' : ''}`
  return (
    <svg className={cls} viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"
      style={{ transform: `rotate(${rot.toFixed(1)}deg)` }}>
      {status === 'completed' && (
        <path pathLength={1} d="M18 22c20-16 58-14 70 8 12 22 8 70-6 88-15 19-52 17-64-6C6 90 4 50 14 30c6-11 18-18 30-19" />
      )}
      {status === 'watching' && <path pathLength={1} d="M14 118C2 90 4 44 22 24c18-20 52-16 66 6" />}
      {status === 'dropped' && <path pathLength={1} d="M10 128 92 10" />}
      {status === 'planned' && (
        <path pathLength={1} className="dots" d="M18 22c20-16 58-14 70 8 12 22 8 70-6 88-15 19-52 17-64-6C6 90 4 50 14 30" />
      )}
    </svg>
  )
}
