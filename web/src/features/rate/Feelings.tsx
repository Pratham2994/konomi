import { useEffect, useState } from 'react'
import { TIERS } from '../../lib/hooks'

/** Roughly where each feeling starts a title. Comparisons then move it, even across into the next feeling. */
const STARTS: Record<number, string> = { 5: 'around 9.5', 4: 'around 8.5', 3: 'around 7', 2: 'around 5.5', 1: 'around 3' }
const SHORT: Record<number, string> = { 5: 'favourite', 4: 'loved', 3: 'liked', 2: 'okay', 1: 'didn’t like' }

/**
 * The five feelings, with a slim "in between" choice between each pair for when you can't decide.
 * "In between" starts the title on the edge between the two; your comparisons settle which side it lands.
 */
export function Feelings({ busy, onPick, keys }: { busy: boolean; onPick: (tier: number, between: boolean) => void; keys?: boolean }) {
  // The chosen feeling lights up at once; the list is remounted for each new title, which clears it.
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => { if (!busy) setChosen(null) }, [busy]) // a failed answer frees the list again
  const choose = (tier: number, between: boolean) => { if (busy || chosen) return; setChosen(`${tier}${between ? '~' : ''}`); onPick(tier, between) }
  return (
    <div className="rp-tiers">
      {TIERS.map((t, i) => (
        <div key={t.tier} className="rp-tier-row">
          <button className={`rp-tier rp-tier-${t.tier}${chosen === `${t.tier}` ? ' is-chosen' : ''}`} disabled={busy} onClick={() => choose(t.tier, false)}>
            <span>{t.label}</span>
            <span className="rp-band">{STARTS[t.tier]}{keys && <kbd aria-hidden="true">{i + 1}</kbd>}</span>
          </button>
          {t.tier > 1 && (
            <button className={`rp-between${chosen === `${t.tier}~` ? ' is-chosen' : ''}`} disabled={busy} onClick={() => choose(t.tier, true)}
              aria-label={`Between ${SHORT[t.tier]} and ${SHORT[t.tier - 1]}`}>
              <span aria-hidden="true">in between</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
