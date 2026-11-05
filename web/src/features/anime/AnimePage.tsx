import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { BackButton } from '../../components/BackButton'
import { Cover } from '../../components/Cover'
import { EmptyWall } from '../../components/EmptyWall'
import { ScoreRail } from '../../components/ScoreRail'
import { Slab, WallFill, WallGrid } from '../../components/Wall'
import { deal } from '../../components/wallLayout'
import { api } from '../../lib/api'
import { SEASON_KANJI, SEASON_LABEL, STATUS_LABEL, TIERS, useListIndex, useMe, useRemoveWithUndo, useSignedIn, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, AnimeDetail, Status } from '../../lib/types'
import { HowScoring } from '../rate/HowScoring'
import { useRater } from '../rate/RaterContext'
import './anime.css'

/** The rating panel's follow-up answers, said back in plain words. */
const FACET_SAID: Record<string, Record<string, string>> = {
  rewatch: { Yes: 'Would rewatch', Maybe: 'Might rewatch', No: 'Once was enough' },
  still_think: { Often: 'Still think about it often', Sometimes: 'Think about it sometimes', Rarely: 'Rarely think about it' },
  ending: { Yes: 'The ending landed', 'Kind of': 'The ending half landed', No: 'The ending missed' },
}

interface Explain { tier: number; between: boolean; start: number; score: number | null; wins: number; losses: number; ties: number }

/** "Started at 8.5 (Loved it) · won 3, lost 1 → 8.7": where the feeling put it, and what comparisons did. */
function ScoreStory({ id }: { id: number }) {
  const { data: x } = useQuery({ queryKey: ['explain', id], queryFn: () => api<Explain>(`/api/rate/${id}/explain`), retry: false })
  if (!x) return null
  const feeling = TIERS.find((t) => t.tier === x.tier)?.label ?? ''
  const below = TIERS.find((t) => t.tier === x.tier - 1)?.label
  const n = x.wins + x.losses + x.ties
  const parts = [x.wins && `won ${x.wins}`, x.losses && `lost ${x.losses}`, x.ties && `tied ${x.ties}`].filter(Boolean).join(', ')
  return (
    <p className="anime-story">
      Started at <strong>{x.start.toFixed(1)}</strong> ({x.between && below ? `between ${feeling.toLowerCase()} and ${below.toLowerCase()}` : feeling.toLowerCase()})
      {n > 0 ? <> · {n} comparison{n === 1 ? '' : 's'}: {parts}</> : <> · not compared yet</>}
      {x.score != null && <> → <strong>{x.score.toFixed(1)}</strong></>}
    </p>
  )
}

const TYPE: Record<string, string> = { TV: 'TV series', MOVIE: 'Movie', ONA: 'Web series', OVA: 'OVA', SPECIAL: 'Special' }

function minutes(s: number | null) {
  if (!s) return null
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`
}

export function AnimePage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const signedIn = useSignedIn()
  const { data: a, error } = useQuery({ queryKey: ['anime', id], queryFn: () => api<AnimeDetail>(`/api/anime/${id}`), retry: false })
  const { data: pred } = useQuery({
    queryKey: ['predict', id],
    queryFn: () => api<{ predicted: number | null }>(`/api/taste/predict/${id}`),
    enabled: signedIn,
    retry: false,
  })
  // Covers from the same season fill out the related wall's last row.
  const { data: sameSeason } = useQuery({
    queryKey: ['sweep', a?.year, a?.season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${a!.year}&season=${a!.season}`),
    enabled: !!a?.season && !!a?.year && (a?.related.length ?? 0) > 0, staleTime: Infinity,
  })
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const removeWithUndo = useRemoveWithUndo()
  const rater = useRater()
  if (error) {
    return (
      <div className="page anime-missing">
        <EmptyWall words={['Not', 'in', 'the', 'catalogue.']} accent={3} text="This title doesn’t exist, or it was removed. These ones do."
          actions={<Link to="/" className="btn">Back home</Link>} />
      </div>
    )
  }
  // The spread's places, held while the title loads (a cover morph usually has it ready already).
  if (!a) {
    return (
      <div className="page anime-grid anime-wait" role="status" aria-label="Loading">
        <div className="anime-art"><span className="ghost-art" /><span className="anime-spine ghost-art" /></div>
        <div className="anime-main"><span className="anime-ghost-line" /><span className="anime-ghost-line is-short" /></div>
      </div>
    )
  }

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
        {/* A magazine spread: the cover as the page, its season down the spine beside it. */}
        <div className="anime-art">
          <div className="anime-cover">
            <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color}
              status={entry && entry.status !== 'completed' ? entry.status : undefined} score={entry?.score} size="l" eager vt />
          </div>
          {a.season && a.year ? (
            <Link to={`/sweep?year=${a.year}&season=${a.season}`} className="anime-spine" aria-label={`More from ${SEASON_LABEL[a.season]} ${a.year}`}>
              <span className="anime-spine-kanji display" aria-hidden="true">{SEASON_KANJI[a.season]}</span>
              <span className="anime-spine-text display">{SEASON_LABEL[a.season]} {a.year}</span>
            </Link>
          ) : a.year ? <span className="anime-spine is-plain"><span className="anime-spine-text display">{a.year}</span></span> : null}
        </div>
        <div className="anime-main">
          <h1 className={`display anime-title${name.length > 38 ? ' is-long' : ''}`}>{name}</h1>
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
                  {entry.tier != null && <ScoreStory id={a.id} />}
                  {Object.keys(entry.facets ?? {}).length > 0 && (
                    <ul className="anime-facets" aria-label="What you said about it">
                      {Object.keys(FACET_SAID).map((k) => FACET_SAID[k][entry.facets[k]] && <li key={k}>{FACET_SAID[k][entry.facets[k]]}</li>)}
                    </ul>
                  )}
                  <HowScoring />
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

        </div>
        {(a.synopsis || a.studios.length > 0 || a.genres.length > 0 || a.score) && (
          <div className="anime-read">
            {a.synopsis && <p className="anime-synopsis">{a.synopsis}</p>}
            <dl className="anime-facts">
              {a.studios.length > 0 && <><dt>Studio</dt><dd>{a.studios.slice(0, 3).join(', ')}</dd></>}
              {a.genres.length > 0 && <><dt>Genres</dt><dd>{a.genres.join(', ')}</dd></>}
              {a.score && <><dt>Community</dt><dd>{a.score.toFixed(2)} average across sites</dd></>}
            </dl>
          </div>
        )}
      </div>

      {a.related.length > 0 && (
        <section className="page anime-related" aria-label="Seasons and related">
          <WallGrid className="dealt" cells={1 + a.related.length} end={(span) => a.season && a.year
            ? <WallFill span={span} to={`/sweep?view=season&year=${a.year}&season=${a.season}`} label={`More from ${SEASON_LABEL[a.season]} ${a.year}`}
              covers={(sameSeason?.items ?? []).filter((x) => x.id !== a.id && !a.related.some((r) => r.id === x.id))} />
            : <WallFill span={span} to="/sweep" label="Most popular anime" />}>
            <Slab season={null} kanji="続" name="Same story" sub={`${a.related.length} season${a.related.length === 1 ? '' : 's'}, films and side stories`} />
            {a.related.map((r, k) => (
              <Link key={r.id} to={`/anime/${r.id}`} className="tile" style={deal(k + 1)} data-season={r.season ?? undefined}>
                <Cover id={r.id} title={r.title} src={r.picture ?? r.thumbnail} color={r.color} status={onList.get(r.id)?.status} size="m" />
                <span className="tile-title">{r.title_en ?? r.title}</span>
                <span className="tile-sub">{[r.year, TYPE[r.type] ?? r.type].filter(Boolean).join(' · ')}</span>
              </Link>
            ))}
          </WallGrid>
        </section>
      )}
    </div>
  )
}
