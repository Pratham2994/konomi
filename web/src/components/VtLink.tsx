import { useQueryClient } from '@tanstack/react-query'
import type { MouseEvent, ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

/**
 * Link to a title page whose cover morphs into the big cover there (View Transitions API).
 * Prefetches the title first so the destination is painted when the transition captures it.
 */
export function VtLink({ animeId, className, children, ...rest }: {
  animeId: number; className?: string; children: ReactNode; 'data-season'?: string
}) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const to = `/anime/${animeId}`
  const prefetch = () => qc.prefetchQuery({ queryKey: ['anime', String(animeId)], queryFn: () => api(to.replace('/anime', '/api/anime')), staleTime: 60_000 })

  async function onClick(e: MouseEvent<HTMLAnchorElement>) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    if (!doc.startViewTransition || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0
      || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()
    await Promise.race([prefetch(), new Promise((r) => setTimeout(r, 350))])
    doc.startViewTransition(() => flushSync(() => nav(to)))
  }

  return (
    <Link to={to} className={className} onClick={onClick} onPointerEnter={prefetch} {...rest}>
      {children}
    </Link>
  )
}
