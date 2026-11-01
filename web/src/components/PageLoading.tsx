import { useEffect, useState } from 'react'
import './pageloading.css'

/** Shown while a page's data is on its way. Waits a moment first, so fast loads never flash it. */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 250)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="page page-loading" role="status" aria-live="polite">
      {shown && <><span className="page-loading-mark display" aria-hidden="true">好み</span><span className="sr-only">{label}</span></>}
    </div>
  )
}
