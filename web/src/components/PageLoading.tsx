import { useEffect, useState } from 'react'
import { Ghosts } from './Wall'
import './pageloading.css'

/**
 * Shown while a page's data is on its way. `wall` lays grey covers in the places the real ones will take, so
 * nothing jumps when they arrive; `mark` breathes the 好み mark. Both wait a moment, so fast loads never flash.
 */
export function PageLoading({ label = 'Loading', variant = 'mark' }: { label?: string; variant?: 'mark' | 'wall' }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), variant === 'wall' ? 120 : 250)
    return () => clearTimeout(t)
  }, [variant])
  if (variant === 'wall') {
    return (
      <div className="page page-loading-wall" role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        {shown && <>
          <span className="pl-head" aria-hidden="true" />
          <div className="wall"><Ghosts n={24} titled /></div>
        </>}
      </div>
    )
  }
  return (
    <div className="page page-loading" role="status" aria-live="polite">
      {shown && <><span className="page-loading-mark display" aria-hidden="true">好み</span><span className="sr-only">{label}</span></>}
    </div>
  )
}
