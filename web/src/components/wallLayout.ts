import { useLayoutEffect, useState, type CSSProperties } from 'react'

/** Index and tilt for the deal-in, so cells land in reading order, each tipped a little. */
export const deal = (i: number): CSSProperties => ({ ['--i' as string]: Math.min(i, 40), ['--tilt' as string]: `${i % 2 ? 1.6 : -1.6}deg` })

export interface WallLayout { min: number; cols: number; sign: [col: number, span: number, rows: number]; row: number; rows: number }

/** Wall columns by the wall's own width, and where the hung block sits in them. */
export function useWallLayout(layouts: WallLayout[]) {
  const pick = (w: number) => layouts.filter((l) => w >= l.min).pop() ?? layouts[0]
  const [el, ref] = useState<HTMLElement | null>(null)
  const [layout, setLayout] = useState(() => pick(window.innerWidth - 64))
  useLayoutEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLayout(pick(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el])
  return [ref, layout] as const
}

/** How many columns an auto-fill grid has right now, so a wall can stop on a whole row. */
export function useGridCols<T extends HTMLElement>(fallback = 4) {
  // A callback ref: the grid may only appear once its data has arrived.
  const [el, ref] = useState<T | null>(null)
  const [cols, setCols] = useState(fallback)
  useLayoutEffect(() => {
    if (!el) return
    const read = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
      if (n > 0) setCols(n)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, cols] as const
}

/** How many single cells fill a hung wall to whole rows, given how many there are to show. */
export function wallCells(l: WallLayout, have: number) {
  const sign = l.sign[1] * l.sign[2]
  const full = l.cols * l.rows - sign
  if (have >= full) return full
  // Fewer covers than the wall: end it on the last whole row (never shorter than the hung block needs).
  const minRows = l.row + l.sign[2] - 1
  const rows = Math.max(minRows, Math.floor((have + sign) / l.cols))
  return Math.max(0, Math.min(have, rows * l.cols - sign))
}
