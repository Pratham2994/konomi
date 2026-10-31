import { motion } from 'motion/react'
import { useEffect } from 'react'
import { Cover } from '../../components/Cover'
import type { AnimeBrief } from '../../lib/types'
import './duel.css'

/** "Which did you enjoy more?" — two covers face off. ←/→ pick, ↓ too close. */
export function Duel({ a, b, onPick, busy, big }: {
  a: AnimeBrief; b: AnimeBrief; onPick: (o: 'a' | 'b' | 'tie') => void; busy?: boolean; big?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') onPick('a')
      else if (e.key === 'ArrowRight') onPick('b')
      else if (e.key === 'ArrowDown') onPick('tie')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onPick])

  return (
    <div className={`duel${big ? ' duel-big' : ''}`}>
      <div className="duel-pair">
        {[a, b].map((x, i) => (
          <motion.button key={`${x.id}-${i}`} type="button" className="duel-side" disabled={busy}
            onClick={() => onPick(i === 0 ? 'a' : 'b')} whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, x: i === 0 ? -24 : 24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color} eager />
            <span className="duel-title">{x.title_en ?? x.title}</span>
            <span className="duel-key" aria-hidden="true">{i === 0 ? '←' : '→'}</span>
          </motion.button>
        ))}
        <span className="duel-vs display" aria-hidden="true">or</span>
      </div>
      <button type="button" className="btn btn-ghost duel-tie" disabled={busy} onClick={() => onPick('tie')}>
        Too close to call
      </button>
    </div>
  )
}
