import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { ScoreRail } from '../../components/ScoreRail'
import { api } from '../../lib/api'
import type { AnimeBrief, Status } from '../../lib/types'
import './landing.css'

const MARKS: (Status | undefined)[] = ['completed', undefined, 'completed', 'watching', undefined, 'completed',
  'dropped', 'completed', undefined, 'planned', 'completed', undefined]

export function Landing() {
  const { data } = useQuery({ queryKey: ['showcase'], queryFn: () => api<{ items: AnimeBrief[] }>('/api/showcase'), staleTime: Infinity })
  const items = data?.items ?? []
  const wall = items.slice(0, 12)
  const [drawn, setDrawn] = useState(0)
  const [pick, setPick] = useState<'a' | 'b' | null>(null)
  const a = items[14], b = items[17]

  useEffect(() => {
    if (!wall.length || drawn >= wall.length) return
    const t = setTimeout(() => setDrawn((d) => d + 1), drawn === 0 ? 500 : 260)
    return () => clearTimeout(t)
  }, [drawn, wall.length])

  return (
    <div className="landing" data-season="SPRING">
      <section className="l-hero page">
        <div className="l-copy">
          <h1 className="display l-title">Your anime,<br />ranked by you.<br /><span>Never by a number.</span></h1>
          <p className="l-lead">
            Konomi is an anime list that never asks for a 1–10. Add a show in one keystroke, answer “which did you enjoy more?”,
            and your scores work themselves out — then a taste model trained on 56 million real ratings guesses what you’ll love next.
          </p>
          <div className="l-cta">
            <Link to="/signup" className="btn btn-primary l-btn">Start your chart</Link>
            <Link to="/login" className="btn btn-ghost l-btn">I have an account</Link>
          </div>
        </div>
        <div className="l-wall" aria-hidden="true">
          {wall.map((x, i) => (
            <motion.div key={x.id} className="l-wall-cell" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 260, damping: 26 }}>
              <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                status={i < drawn ? MARKS[i] : undefined} animateMark eager />
            </motion.div>
          ))}
        </div>
      </section>

      {a && b && (
        <section className="l-demo page" data-season="FALL">
          <div className="l-demo-text">
            <h2 className="display">Try it. Which did you enjoy more?</h2>
            <p className="muted">That’s the whole rating system. A feeling picks the band, a few of these place the show inside it,
              and your best ever lands on exactly 10.0.</p>
          </div>
          <div className="l-demo-duel">
            {[a, b].map((x, i) => (
              <button key={x.id} className={`l-demo-side${pick && pick !== (i ? 'b' : 'a') ? ' is-out' : ''}`}
                onClick={() => setPick(i ? 'b' : 'a')}>
                <Cover id={x.id} title={x.title} src={x.picture ?? x.thumbnail} color={x.color}
                  status={pick === (i ? 'b' : 'a') ? 'completed' : undefined} animateMark score={pick === (i ? 'b' : 'a') ? 9.4 : null} />
                <span className="tile-title">{x.title_en ?? x.title}</span>
              </button>
            ))}
          </div>
          <div className="l-demo-rail">
            {pick ? (
              <>
                <ScoreRail score={9.4} predicted={9.1} />
                <p className="faint l-demo-note">Example: after you answer, Konomi shows the score it guessed next to yours.</p>
              </>
            ) : <p className="faint l-demo-note">Tap one.</p>}
          </div>
        </section>
      )}

      <section className="l-steps page" data-season="WINTER">
        <div className="l-step">
          <h3 className="display">Add without searching</h3>
          <p className="muted">The whole catalogue — 39,000+ anime — lives in your browser. Type two letters, press Enter, done.
            Or walk back through past seasons and tap everything you’ve seen.</p>
        </div>
        <div className="l-step" data-season="SUMMER">
          <h3 className="display">Scores you can trust</h3>
          <p className="muted">“One of my favourites”, “Loved it”, “Liked it”… then a couple of quick comparisons. No more list where everything is a 10.</p>
        </div>
        <div className="l-step" data-season="FALL">
          <h3 className="display">A model that knows you</h3>
          <p className="muted">Trained on 56.5 million MyAnimeList ratings from 293,000 people. It recommends with reasons and draws your taste as a galaxy.</p>
        </div>
      </section>

      <footer className="l-foot page">
        <span className="display">好み Konomi</span>
        <span className="faint">Catalogue: anime-offline-database (ODbL) · ratings: MyAnimeList via Kaggle · metadata: AniList</span>
      </footer>
    </div>
  )
}
