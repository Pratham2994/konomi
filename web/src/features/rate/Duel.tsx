import { motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { Cover } from '../../components/Cover'
import type { AnimeBrief } from '../../lib/types'
import './duel.css'

// Only the most recently mounted duel takes ←/→/↓ (the rating panel can open over the Rate page's duel).
const stack: string[] = []

/** "Which did you enjoy more?": two covers face off. ←/→ pick, ↓ too close. */
export function Duel({ a, b, onPick, busy, big }: {
  a: AnimeBrief; b: AnimeBrief; onPick: (o: 'a' | 'b' | 'tie') => void; busy?: boolean; big?: boolean
}) {
  const me = useId()
  // Your pick lights up the moment you tap, before the server answers.
  const [picked, setPicked] = useState<'a' | 'b' | 'tie' | null>(null)
  const pick = (o: 'a' | 'b' | 'tie') => { if (busy || picked) return; setPicked(o); onPick(o) }
  useEffect(() => { setPicked(null) }, [a.id, b.id])
  useEffect(() => { if (!busy) setPicked(null) }, [busy]) // a failed answer frees the pair again
  useEffect(() => {
    stack.push(me)
    return () => { stack.splice(stack.lastIndexOf(me), 1) }
  }, [me])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || stack[stack.length - 1] !== me || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') pick('a')
      else if (e.key === 'ArrowRight') pick('b')
      else if (e.key === 'ArrowDown') pick('tie')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`duel${big ? ' duel-big' : ''}`}>
      <div className="duel-pair">
        {[a, b].map((x, i) => (
          <motion.button key={`${x.id}-${i}`} type="button"
            className={`duel-side${picked === (i === 0 ? 'a' : 'b') ? ' is-picked' : picked ? ' is-passed' : ''}`} disabled={busy}
            onClick={() => pick(i === 0 ? 'a' : 'b')} whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, x: i === 0 ? -24 : 24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color} eager />
            <span className="duel-title">{x.title_en ?? x.title}</span>
            <span className="duel-key" aria-hidden="true">{i === 0 ? '←' : '→'}</span>
          </motion.button>
        ))}
        <span className="duel-vs display" aria-hidden="true">or</span>
      </div>
      <button type="button" className={`btn btn-ghost duel-tie${picked === 'tie' ? ' is-picked' : ''}`} disabled={busy} onClick={() => pick('tie')}>
        Too close to call
      </button>
    </div>
  )
}
