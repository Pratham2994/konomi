import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { BackButton } from '../../components/BackButton'
import { Cover } from '../../components/Cover'
import { ScoreRail } from '../../components/ScoreRail'
import { PageLoading } from '../../components/PageLoading'
import { api } from '../../lib/api'
import { SEASON_LABEL, STATUS_LABEL, TIERS, useListIndex, useMe, useRemoveWithUndo, useSetStatus } from '../../lib/hooks'
import type { AnimeDetail, Status } from '../../lib/types'
import { useRater } from '../rate/RaterContext'
import './anime.css'

/** The rating panel's follow-up answers, said back in plain words. */
const FACET_SAID: Record<string, Record<string, string>> = {
  rewatch: { Yes: 'Would rewatch', Maybe: 'Might rewatch', No: 'Once was enough' },
  still_think: { Often: 'Still think about it often', Sometimes: 'Think about it sometimes', Rarely: 'Rarely think about it' },
  ending: { Yes: 'The ending landed', 'Kind of': 'The ending half landed', No: 'The ending missed' },
}

const TYPE: Record<string, string> = { TV: 'TV series', MOVIE: 'Movie', ONA: 'Web series', OVA: 'OVA', SPECIAL: 'Special' }

function minutes(s: number | null) {
  if (!s) return null
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`
}

export function AnimePage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const { data: a, error } = useQuery({ queryKey: ['anime', id], queryFn: () => api<AnimeDetail>(`/api/anime/${id}`), retry: false })
  const { data: pred } = useQuery({
    queryKey: ['predict', id],
    queryFn: () => api<{ predicted: number | null }>(`/api/taste/predict/${id}`),
    enabled: !!me,
    retry: false,
  })
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const removeWithUndo = useRemoveWithUndo()
  const rater = useRater()
  if (error) {
    return (
      <div className="page prof-private">
        <h1 className="display">Not in the catalogue</h1>
        <p className="muted">This title doesn’t exist, or it was removed.</p>
        <Link to="/" className="btn">Back home</Link>
      </div>
    )
  }
  if (!a) return <PageLoading />

  const entry = onList.get(a.id)
  const name = a.title_en ?? a.title
  const tierLabel = entry?.tier ? TIERS.find((t) => t.tier === entry.tier)?.label : null

  function set(s: Status) {
    if (!a) return
    if (entry?.status === s) return
    setStatus.mutate({ anime: a, status: s })
    if (s === 'completed') rater.prompt(a)
  }

  return (
    <div className="anime" data-season={a.season ?? undefined} style={{ ['--tint' as string]: a.color ?? 'var(--season)' }}>
      <div className="anime-wash" aria-hidden="true" />
      <div className="page anime-grid">
        <div className="anime-back"><BackButton /></div>
        <div className="anime-cover">
          <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color}
            score={entry?.score} size="l" eager vt />
        </div>
        <div className="anime-main">
          <h1 className="display anime-title">{name}</h1>
          {a.title_en && a.title_en !== a.title && <p className="anime-alt">{a.title}</p>}
          <p className="anime-meta">
            {a.season && a.year ? <Link to={`/sweep?year=${a.year}&season=${a.season}`}>{SEASON_LABEL[a.season]} {a.year}</Link> : a.year}
            <span>{TYPE[a.type] ?? a.type}</span>
            {a.episodes && a.episodes > 1 && <span>{a.episodes} episodes</span>}
            {minutes(a.duration_s) && <span>{minutes(a.duration_s)}{a.episodes && a.episodes > 1 ? ' each' : ''}</span>}
          </p>

          {me ? (
            <div className="anime-actions">
              <div className="seg" role="group" aria-label="Your status">
                {(['completed', 'watching', 'planned', 'dropped'] as Status[]).map((s) => (
                  <button key={s} className={entry?.status === s ? 'is-on' : ''} onClick={() => set(s)} aria-pressed={entry?.status === s}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {entry && <button className="btn btn-ghost" onClick={() => removeWithUndo(entry)}>Remove</button>}
            </div>
          ) : (
            <div className="anime-actions"><Link to="/signup" className="btn btn-primary">Add it to your chart</Link></div>
          )}

          {entry?.status === 'completed' && (
            <div className="anime-score">
              {entry.score != null ? (
                <>
                  <p className="anime-score-head"><span className="display anime-score-num">{entry.score.toFixed(1)}</span>
                    <span className="muted">{tierLabel}</span>
                    <button className="btn btn-ghost" onClick={() => rater.prompt(a)}>Re-rate</button></p>
                  <ScoreRail score={entry.score} predicted={entry.predicted} />
                  {Object.keys(entry.facets ?? {}).length > 0 && (
                    <ul className="anime-facets" aria-label="What you said about it">
                      {Object.keys(FACET_SAID).map((k) => FACET_SAID[k][entry.facets[k]] && <li key={k}>{FACET_SAID[k][entry.facets[k]]}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => rater.prompt(a)}>Rate it</button>
              )}
            </div>
          )}
          {me && entry?.status !== 'completed' && pred?.predicted != null && (
            <p className="anime-guess">
              Konomi thinks you’d give this <strong className="display">{pred.predicted.toFixed(1)}</strong>
            </p>
          )}

          {a.synopsis && <p className="anime-synopsis">{a.synopsis}</p>}

          <dl className="anime-facts">
            {a.studios.length > 0 && <><dt>Studio</dt><dd>{a.studios.slice(0, 3).join(', ')}</dd></>}
            {a.genres.length > 0 && <><dt>Genres</dt><dd>{a.genres.join(', ')}</dd></>}
            {a.score && <><dt>Community</dt><dd>{a.score.toFixed(2)} average across sites</dd></>}
          </dl>
        </div>
      </div>

      {a.related.length > 0 && (
        <section className="page anime-related">
          <h2 className="display">Seasons and related</h2>
          <div className="grid grid-dense">
            {a.related.map((r) => (
              <Link key={r.id} to={`/anime/${r.id}`} className="tile">
                <Cover id={r.id} title={r.title} src={r.picture ?? r.thumbnail} color={r.color} status={onList.get(r.id)?.status} size="m" />
                <span className="tile-title">{r.title_en ?? r.title}</span>
                <span className="tile-sub">{[r.year, TYPE[r.type] ?? r.type].filter(Boolean).join(' · ')}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
