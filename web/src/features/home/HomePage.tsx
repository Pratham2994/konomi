import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { CoverGrid, SeasonBand } from '../../components/SeasonBand'
import { api } from '../../lib/api'
import { currentSeason, useList, useMe } from '../../lib/hooks'
import type { AnimeBrief } from '../../lib/types'
import { QuickAdd } from '../add/QuickAdd'
import { SeasonGrid } from '../add/SeasonGrid'
import { Tile } from '../list/ChartPage'
import './home.css'

export interface Rec {
  anime: AnimeBrief
  predicted: number | null
  because: AnimeBrief[]
}

export function useRecs(params = '') {
  return useQuery({
    queryKey: ['recs', params],
    queryFn: () => api<{ items: Rec[]; mode: 'model' | 'popular'; need: number }>(`/api/taste/recs${params}`),
    retry: false,
    staleTime: 60_000,
  })
}

export function RecCard({ r }: { r: Rec }) {
  const a = r.anime
  return (
    <Link to={`/anime/${a.id}`} className="rec" data-season={a.season ?? undefined}>
      <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} />
      <span className="tile-title">{a.title_en ?? a.title}</span>
      {r.predicted != null && <span className="rec-guess"><span className="display">{r.predicted.toFixed(1)}</span> for you</span>}
      {r.because.length > 0 && (
        <span className="rec-why">because you liked {r.because.map((b) => b.title_en ?? b.title).join(' and ')}</span>
      )}
    </Link>
  )
}

export function HomePage() {
  const { data: me } = useMe()
  const { data: entries = [] } = useList()
  const { data: recs } = useRecs()
  const { data: next } = useQuery({
    queryKey: ['rate-next'],
    queryFn: () => api<{ unrated: number; question: unknown }>('/api/rate/session/next'),
  })
  const now = currentSeason()
  const { data: season } = useQuery({
    queryKey: ['sweep', now.year, now.season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${now.year}&season=${now.season}`),
    staleTime: Infinity,
  })
  const recent = entries.slice(0, 18)
  const empty = entries.length === 0
  const guesses = recs?.mode === 'model' ? recs.items.filter((r) => r.predicted != null).slice(0, 5) : []

  return (
    <div className="page home">
      <div className="home-grid">
        <div className="home-main">
          <section className="home-add">
            <h1 className="display home-title">{empty ? `Welcome, ${me?.display_name}. What have you watched?` : 'Add what you watched'}</h1>
            <QuickAdd variant="hero" autoFocus={empty} />
            {empty && (
              <p className="muted home-hint">
                Type a title and press Enter — it lands on your chart. Or tap what you’ve seen this season below,{' '}
                <Link to="/sweep">walk back through past seasons</Link>,
                or <Link to="/settings#import">import your MyAnimeList or AniList list</Link>.
              </p>
            )}
          </section>

          {season && season.items.length > 0 && (
            <SeasonBand season={now.season} year={now.year} count="airing now — tap what you’re watching"
              aside={<Link to="/sweep" className="btn">Earlier seasons</Link>}>
              <SeasonGrid items={season.items.slice(0, 12)} compact />
            </SeasonBand>
          )}
        </div>

        <aside className="home-rail" aria-label="Rate and guesses">
          {next && next.unrated > 0 && (
            <Link to="/rate" className="home-rate">
              <span className="display home-rate-n">{next.unrated}</span>
              <span>
                <strong>{next.unrated === 1 ? 'title is' : 'titles are'} waiting for a feeling.</strong>
                <span className="muted"> A few quick answers turn them into scores.</span>
              </span>
              <span className="btn btn-primary">Rate now</span>
            </Link>
          )}
          {guesses.length > 0 && (
            <section className="home-guesses">
              <h2 className="display">Konomi’s guesses</h2>
              <p className="muted">What you’d score these, if you watched them.</p>
              <ol>
                {guesses.map((r) => (
                  <li key={r.anime.id}>
                    <Link to={`/anime/${r.anime.id}`}>
                      <Cover id={r.anime.id} title={r.anime.title} src={r.anime.thumbnail} color={r.anime.color} size="xs" />
                      <span className="home-guess-title">{r.anime.title_en ?? r.anime.title}</span>
                      <span className="display home-guess-n">{r.predicted!.toFixed(1)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      {recs && recs.items.length > 0 && (
        <SeasonBand neutral season={null} year={null} label="For you"
          count={recs.mode === 'model' ? 'picked by your taste model' : 'popular picks — rate a few favourites to personalise'}
          aside={<Link to="/taste" className="btn">See your taste</Link>}>
          <div className="recs">{recs.items.slice(0, 12).map((r) => <RecCard key={r.anime.id} r={r} />)}</div>
        </SeasonBand>
      )}

      {recent.length > 0 && (
        <SeasonBand neutral season={null} year={null} label="Recently added"
          aside={<Link to="/chart" className="btn">Whole chart</Link>}>
          <CoverGrid dense>{recent.map((e) => <Tile key={e.anime_id} e={e} />)}</CoverGrid>
        </SeasonBand>
      )}
    </div>
  )
}
