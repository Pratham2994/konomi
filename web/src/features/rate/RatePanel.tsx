import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { ScoreRail } from '../../components/ScoreRail'
import { asked } from '../../lib/ask'
import { TIERS, useList } from '../../lib/hooks'
import type { AnimeBrief } from '../../lib/types'
import { Duel } from './Duel'
import { useRateFlow } from './flow'
import './ratepanel.css'

const FACETS: { key: string; q: string; opts: string[] }[] = [
  { key: 'rewatch', q: 'Would you rewatch it?', opts: ['Yes', 'Maybe', 'No'] },
  { key: 'still_think', q: 'Do you still think about it?', opts: ['Often', 'Sometimes', 'Rarely'] },
  { key: 'ending', q: 'Did the ending land?', opts: ['Yes', 'Kind of', 'No'] },
]

export function RatePanel({ anime, onClose }: { anime: AnimeBrief; onClose: () => void }) {
  const flow = useRateFlow(anime)
  const [facets, setFacets] = useState<Record<string, string>>({})
  const name = anime.title_en ?? anime.title
  const { data: list } = useList()
  const onChart = list?.find((e) => e.anime_id === anime.id)

  // Removed, undone, or moved off "watched" somewhere else: there is nothing left to rate, so the panel goes too.
  // Only after the title was seen as watched, because a fresh add reaches the list a moment after the panel opens.
  const seen = useRef(false)
  useEffect(() => {
    if (onChart?.status === 'completed') seen.current = true
    else if (seen.current && list) onClose()
  }, [list, onChart, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (flow.phase.kind === 'tier' && !flow.busy && /^[1-5]$/.test(e.key)
        && (e.target as HTMLElement).tagName !== 'INPUT') {
        flow.chooseTier(6 - Number(e.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flow, onClose])

  function pickFacet(key: string, v: string) {
    const next = { ...facets, [key]: v }
    setFacets(next)
    flow.saveFacets(next).catch(() => undefined)
  }

  return (
    <motion.aside className="rp" role="dialog" aria-label={`Rate ${name}`}
      initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
      <header className="rp-head">
        <Cover id={anime.id} title={anime.title} src={anime.thumbnail} color={anime.color} size="s" status="completed" animateMark />
        <h2 className="rp-sub">
          {flow.phase.kind === 'tier' && <>How was <span className="rp-name">{asked(name)[0]}</span>{asked(name)[1]}</>}
          {flow.phase.kind === 'duel' && <>Which did you enjoy more? <span className="rp-step">Question {flow.phase.n} of up to 6</span></>}
          {flow.phase.kind === 'reveal' && <><span className="rp-name">{name}</span> is on your chart</>}
        </h2>
        <button className="rp-x" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {flow.phase.kind === 'tier' && (
          <motion.div key="tier" className="rp-body" exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>
            <div className="rp-tiers">
              {TIERS.map((t, i) => (
                <button key={t.tier} className={`rp-tier rp-tier-${t.tier}`} disabled={flow.busy}
                  onClick={() => flow.chooseTier(t.tier)}>
                  <span>{t.label}</span>
                  <span className="rp-band">{t.band}<kbd aria-hidden="true">{i + 1}</kbd></span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost rp-later" onClick={onClose}>Rate later</button>
          </motion.div>
        )}
        {flow.phase.kind === 'duel' && (
          <motion.div key={`duel-${flow.phase.n}`} className="rp-body" initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>
            <Duel a={flow.phase.pair.a} b={flow.phase.pair.b} onPick={flow.answer} busy={flow.busy} />
            <button className="btn btn-ghost rp-later" onClick={flow.skipDuels}>Stop comparing</button>
          </motion.div>
        )}
        {flow.phase.kind === 'reveal' && (
          <motion.div key="reveal" className="rp-body" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <ScoreRail score={flow.phase.score} predicted={flow.phase.predicted} />
            <p className="rp-verdict">
              {flow.phase.predicted == null
                ? 'Konomi starts guessing your scores once it knows a few of your favourites.'
                : flow.phase.score != null && Math.abs(flow.phase.predicted - flow.phase.score) <= 1
                  ? 'Konomi called it.'
                  : 'Konomi missed this one. Now it knows you a little better.'}
            </p>
            <div className="rp-facets">
              {FACETS.map((f) => (
                <div key={f.key} className="rp-facet">
                  <span>{f.q}</span>
                  <div className="rp-chips">
                    {f.opts.map((o) => (
                      <button key={o} className={`chip${facets[f.key] === o ? ' is-on' : ''}`} onClick={() => pickFacet(f.key, o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary rp-done" onClick={onClose}>
              <Icon name="check" size={18} /> Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
