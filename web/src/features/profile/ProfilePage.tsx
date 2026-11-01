import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { Bands, CoverGrid, SeasonBand } from '../../components/SeasonBand'
import { useToast } from '../../components/Toast'
import { api, ApiError } from '../../lib/api'
import { SEASON_ORDER, useMe } from '../../lib/hooks'
import type { AnimeBrief, Season, Status } from '../../lib/types'
import './profile.css'

interface Profile {
  user: { username: string; display_name: string; bio: string; accent: string; since: number; is_public: boolean }
  sections: { id: string; visible: boolean }[]
  banner: AnimeBrief | null
  stats: { watched: number; watching: number; hours: number; top_studio: string | null; rated: number }
  favourites: (AnimeBrief & { score: number | null })[]
  hot_takes: { anime: AnimeBrief; you: number; everyone: number }[]
  years: [number, number][]
  dna: { id: number; neg: string[]; pos: string[]; value: number }[] | null
  entries: { anime: AnimeBrief; status: Status; score: number | null }[]
  track: { n: number; within1: number } | null
  is_owner: boolean
}

interface Match {
  percent: number; shared: number
  agree: { anime: AnimeBrief; a: number; b: number }[]
  fight: { anime: AnimeBrief; a: number; b: number }[]
}

const ACCENT_SEASON: Record<string, Season> = { spring: 'SPRING', summer: 'SUMMER', fall: 'FALL', winter: 'WINTER' }

function Years({ years }: { years: [number, number][] }) {
  if (!years.length) return null
  const from = years[0][0], to = Math.max(years[years.length - 1][0], new Date().getFullYear())
  const map = new Map(years)
  const max = Math.max(...years.map((y) => y[1]))
  const all = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  return (
    <div className="years" role="img" aria-label={`Anime watched by release year, ${from} to ${to}`}>
      {all.map((y, i) => {
        const n = map.get(y) ?? 0
        return (
          <div key={y} className="years-col" title={`${y}: ${n}`}>
            <span className="years-bar" style={{ ['--h' as string]: `${(n / max) * 100}%`, animationDelay: `${i * 15}ms` }} />
            {(y % 5 === 0 || all.length < 12) && <span className="years-label">{y}</span>}
          </div>
        )
      })}
    </div>
  )
}

function MatchPanel({ username }: { username: string }) {
  const { data } = useQuery({ queryKey: ['match', username], queryFn: () => api<{ match: Match | null }>(`/api/u/${username}/match`), retry: false })
  if (!data) return null
  if (!data.match) return <p className="muted">Rate a few favourites of your own to see how your taste compares.</p>
  const m = data.match
  return (
    <div className="match">
      <p className="match-num"><span className="display">{m.percent}%</span> taste match</p>
      {m.fight.length > 0 && (
        <div className="match-list">
          <h3>You’d argue about</h3>
          {m.fight.map((f) => (
            <Link key={f.anime.id} to={`/anime/${f.anime.id}`} className="match-row">
              <Cover id={f.anime.id} title={f.anime.title} src={f.anime.thumbnail} color={f.anime.color} size="xs" />
              <span>{f.anime.title_en ?? f.anime.title}</span>
              <span className="match-scores">you {f.a.toFixed(1)} · them {f.b.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      )}
      {m.agree.length > 0 && (
        <div className="match-list">
          <h3>You both love</h3>
          {m.agree.slice(0, 3).map((f) => (
            <Link key={f.anime.id} to={`/anime/${f.anime.id}`} className="match-row">
              <Cover id={f.anime.id} title={f.anime.title} src={f.anime.thumbnail} color={f.anime.color} size="xs" />
              <span>{f.anime.title_en ?? f.anime.title}</span>
              <span className="match-scores">{f.a.toFixed(1)} · {f.b.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProfilePage() {
  const { username = '' } = useParams()
  const { data: me } = useMe()
  const toast = useToast()
  const [tab, setTab] = useState<Status>('completed')
  const { data: p, error, isLoading } = useQuery({
    queryKey: ['profile', username], queryFn: () => api<Profile>(`/api/u/${username}`), retry: false,
  })

  const grouped = useMemo(() => {
    const m = new Map<string, { season: Season | null; year: number | null; items: Profile['entries'] }>()
    for (const e of (p?.entries ?? []).filter((e) => e.status === tab)) {
      const k = `${e.anime.year ?? 0}-${e.anime.season ?? 'X'}`
      if (!m.has(k)) m.set(k, { season: e.anime.season, year: e.anime.year, items: [] })
      m.get(k)!.items.push(e)
    }
    const rank = (s: Season | null) => (s ? SEASON_ORDER.indexOf(s) : -1)
    return [...m.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || rank(b.season) - rank(a.season))
  }, [p, tab])

  if (isLoading) return <div className="page" />
  if (error || !p) {
    const missing = error instanceof ApiError && error.status === 404
    return (
      <div className="page prof-private">
        <Icon name="lock" size={40} />
        <h1 className="display">{missing ? 'This chart is private' : 'Couldn’t load this profile'}</h1>
        <p className="muted">{missing ? 'Either it doesn’t exist, or its owner hasn’t made it public yet.' : 'Try again in a moment.'}</p>
        <Link to="/" className="btn">Go to Konomi</Link>
      </div>
    )
  }

  const show = (id: string) => p.sections.find((s) => s.id === id)?.visible !== false
  const season = ACCENT_SEASON[p.user.accent] ?? p.banner?.season ?? 'FALL'
  const url = `${window.location.origin}/u/${p.user.username}`

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${p!.user.display_name} on Konomi`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast({ text: 'Link copied' })
      }
    } catch { /* share sheet dismissed */ }
  }

  const order = p.sections.map((s) => s.id)
  const blocks: Record<string, ReactNode> = {
    favourites: show('favourites') && p.favourites.length > 0 ? (
      <section key="fav" className="prof-sec">
        <h2 className="display prof-h">All-time favourites</h2>
        <ol className="favs">
          {p.favourites.map((f, i) => (
            <li key={f.id} data-season={f.season ?? undefined}>
              <span className="favs-n display">{i + 1}</span>
              <Link to={`/anime/${f.id}`} className="tile">
                <Cover id={f.id} title={f.title} src={f.picture ?? f.thumbnail} color={f.color} score={f.score} />
                <span className="tile-title">{f.title_en ?? f.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    ) : null,
    hot_takes: show('hot_takes') && p.hot_takes.length > 0 ? (
      <section key="hot" className="prof-sec">
        <h2 className="display prof-h">Hot takes</h2>
        <p className="muted prof-sub">Where {p.user.display_name} disagrees with everyone else the most.</p>
        <ol className="hot">
          {p.hot_takes.map((h, i) => (
            <li key={h.anime.id} data-season={h.anime.season ?? undefined}>
              <span className="hot-n display">{i + 1}</span>
              <Link to={`/anime/${h.anime.id}`} className="hot-title">{h.anime.title_en ?? h.anime.title}</Link>
              <span className="hot-you display">{h.you.toFixed(1)}</span>
              <span className="hot-vs faint">everyone {h.everyone.toFixed(1)}</span>
              <span className="hot-dir">{h.you > h.everyone ? 'Underrated, apparently' : 'Not buying the hype'}</span>
            </li>
          ))}
        </ol>
      </section>
    ) : null,
    years: show('years') && p.years.length > 0 ? (
      <section key="years" className="prof-sec">
        <h2 className="display prof-h">Anime years</h2>
        <p className="muted prof-sub">What {p.user.display_name} has watched, by the year it came out.</p>
        <Years years={p.years} />
      </section>
    ) : null,
    dna: show('dna') && p.dna ? (
      <section key="dna" className="prof-sec">
        <h2 className="display prof-h">Taste DNA</h2>
        <div className="dna">
          {p.dna.map((a) => (
            <div key={a.id} className="dna-row">
              <span className="dna-pole dna-neg">{a.neg.join(' · ')}</span>
              <div className="dna-rail"><span className="dna-mid" /><span className="dna-dot" style={{ left: `${50 + a.value * 50}%` }} /></div>
              <span className="dna-pole dna-pos">{a.pos.join(' · ')}</span>
            </div>
          ))}
        </div>
      </section>
    ) : null,
    chart: show('chart') ? (
      <section key="chart" className="prof-sec">
        <div className="prof-chart-head">
          <h2 className="display prof-h">The chart</h2>
          <div className="seg">
            {(['completed', 'watching', 'planned', 'dropped'] as Status[]).map((s) => (
              <button key={s} className={tab === s ? 'is-on' : ''} onClick={() => setTab(s)}>
                {{ completed: 'Watched', watching: 'Watching', planned: 'Want to watch', dropped: 'Dropped' }[s]}
              </button>
            ))}
          </div>
        </div>
        <Bands>{grouped.map((g) => (
          <SeasonBand key={`${g.year}-${g.season}`} season={g.season} year={g.year} count={`${g.items.length}`} wide={g.items.length > 8} n={g.items.length}>
            <CoverGrid dense>
              {g.items.map((e) => (
                <Link key={e.anime.id} to={`/anime/${e.anime.id}`} className="tile" data-season={e.anime.season ?? undefined}>
                  <Cover id={e.anime.id} title={e.anime.title} src={e.anime.picture ?? e.anime.thumbnail} color={e.anime.color} status={e.status} score={e.score} />
                  <span className="tile-title">{e.anime.title_en ?? e.anime.title}</span>
                </Link>
              ))}
            </CoverGrid>
          </SeasonBand>
        ))}</Bands>
      </section>
    ) : null,
  }

  return (
    <div className="prof" data-season={season}>
      <header className="prof-head">
        {p.banner && (
          <div className="prof-banner" aria-hidden="true">
            <img src={p.banner.picture ?? p.banner.thumbnail ?? ''} alt="" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="page prof-head-inner">
          {p.favourites.length >= 3 && (
            <div className="prof-fan" aria-hidden="true">
              {p.favourites.slice(0, 3).reverse().map((f, i) => (
                <div key={f.id} className={`prof-fan-card prof-fan-${i}`}>
                  <Cover id={f.id} title={f.title} src={f.picture ?? f.thumbnail} color={f.color} score={f.score} eager />
                </div>
              ))}
            </div>
          )}
          <div className="prof-id">
            <span className="prof-avatar display" aria-hidden="true">{p.user.display_name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h1 className="display prof-name">{p.user.display_name}</h1>
              <p className="prof-handle">@{p.user.username} · on Konomi since {p.user.since}</p>
            </div>
          </div>
          {p.user.bio && <p className="prof-bio">{p.user.bio}</p>}
          <p className="prof-line">
            <span><strong className="display">{p.stats.watched}</strong> watched</span>
            <span><strong className="display">{p.stats.hours.toLocaleString()}</strong> hours</span>
            {p.stats.watching > 0 && <span><strong className="display">{p.stats.watching}</strong> watching now</span>}
            {p.stats.top_studio && <span>mostly <strong className="prof-studio">{p.stats.top_studio}</strong></span>}
            {p.track && <span title={`Over ${p.track.n} titles, Konomi guessed before the answer`}>
              Konomi guesses {p.is_owner ? 'my' : 'their'} scores within a point <strong className="display">{Math.round(p.track.within1 * 100)}%</strong> of the time</span>}
          </p>
          <div className="prof-actions">
            {p.user.is_public && <button className="btn btn-primary" onClick={share}><Icon name="share" size={18} /> Share</button>}
            {p.user.is_public && <a className="btn" href={`/og/u/${p.user.username}.png`} download={`${p.user.username}-konomi.png`}>
              <Icon name="download" size={18} /> Card</a>}
            {p.is_owner && <Link to="/settings" className="btn"><Icon name="settings" size={18} /> Customise</Link>}
            {p.is_owner && !p.user.is_public && <span className="prof-note"><Icon name="lock" size={16} /> Only you can see this. Make it public in Customise.</span>}
          </div>
        </div>
      </header>

      <div className="page prof-body">
        {me && !p.is_owner && (
          <section className="prof-sec">
            <h2 className="display prof-h">You and {p.user.display_name}</h2>
            <MatchPanel username={p.user.username} />
          </section>
        )}
        {order.map((id) => blocks[id] ?? null)}
      </div>
    </div>
  )
}
