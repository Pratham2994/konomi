import { motion } from 'motion/react'
import './scorerail.css'

/** The one 1 to 10 rail every score sits on. Your score is a full-height line; Konomi's guess is a dashed line. */
export function ScoreRail({ score, predicted }: { score: number | null; predicted?: number | null }) {
  const x = (v: number) => `${((v - 1) / 9) * 100}%`
  return (
    <div className="rail" role="img"
      aria-label={`Your score ${score?.toFixed(1) ?? 'not set'}${predicted != null ? `, Konomi guessed ${predicted.toFixed(1)}` : ''}`}>
      <div className="rail-line" />
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => (
        <span key={t} className="rail-tick" style={{ left: x(t) }}><span>{t}</span></span>
      ))}
      {predicted != null && (
        <motion.span className="rail-mark rail-guess" initial={{ left: '50%', opacity: 0 }}
          animate={{ left: x(predicted), opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
          <span className="rail-label">Konomi {predicted.toFixed(1)}</span>
        </motion.span>
      )}
      {score != null && (
        <motion.span className="rail-mark rail-you" initial={{ left: '50%', opacity: 0 }}
          animate={{ left: x(score), opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.25 }}>
          <span className="rail-label">You {score.toFixed(1)}</span>
        </motion.span>
      )}
    </div>
  )
}
