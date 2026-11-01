import type { Status } from '../lib/types'
import './mark.css'

// Three hand-drawn strokes per mark, so a wall of circled covers never looks stamped.
const CIRCLES = [
  'M18 22c20-16 58-14 70 8 12 22 8 70-6 88-15 19-52 17-64-6C6 90 4 50 14 30c6-11 18-18 30-19',
  'M30 14c24-8 54 0 62 26 8 26 2 64-14 80-17 16-50 14-62-10C4 86 6 46 20 26c8-10 20-14 34-12 6 1 10 3 12 6',
  'M12 40C14 18 38 6 62 10c24 4 34 30 32 60-2 30-14 56-40 58-26 2-44-20-46-50-1-16 2-30 10-40',
]
const ARCS = [
  'M14 118C2 90 4 44 22 24c18-20 52-16 66 6',
  'M20 124C4 100 2 52 16 30 30 8 62 4 84 22',
  'M10 110C6 80 12 40 32 22c20-18 46-12 58 4',
]
const STRIKES = ['M10 128 92 10', 'M8 120c26-36 52-74 86-108', 'M14 130 88 14c1-2 2-3 4-4']

export function Mark({ status, animate = false, seed = 0 }: { status: Status; animate?: boolean; seed?: number }) {
  const j = ((seed * 9301 + 49297) % 233280) / 233280
  const v = seed % 3
  const rot = -8 + j * 16
  const width = 2.8 + j * 0.9
  const cls = `mark mark-${status}${animate ? ' mark-draw' : ''}`
  return (
    <svg className={cls} viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"
      style={{ transform: `rotate(${rot.toFixed(1)}deg)`, strokeWidth: status === 'dropped' ? width + 0.4 : width }}>
      {status === 'completed' && <path pathLength={1} d={CIRCLES[v]} />}
      {status === 'watching' && <path pathLength={1} d={ARCS[v]} />}
      {status === 'dropped' && <path pathLength={1} d={STRIKES[v]} />}
      {status === 'planned' && <path pathLength={1} className="dots" d={CIRCLES[v]} />}
    </svg>
  )
}
