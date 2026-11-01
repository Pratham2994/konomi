import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { Bands, CoverGrid, SeasonBand } from '../../components/SeasonBand'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/PageLoading'
import { api, ApiError } from '../../lib/api'
import { byRank, SEASON_ORDER, STATUS_LABEL, TIERS, useMe } from '../../lib/hooks'
import type { AnimeBrief, Season, Status } from '../../lib/types'
import './profile.css'

export interface Look {
  header: 'art' | 'poster' | 'ink' | 'plain'; banner_focus: 'center' | 'top' | 'bottom'
  avatar: 'initial' | 'cover' | 'none'; name_style: 'poster' | 'quiet'; fav_layout: 'hero' | 'even' | 'podium'
  scores: 'ten' | 'hundred' | 'off'; chart_group: 'season' | 'score' | 'flat'; chart_tab: Status
  fav_title: string; fan: boolean; stats_hidden: string[]; chart_lists: Status[]
}

interface Profile {
  user: {
    username: string; display_name: string; bio: string; accent: string; since: number; is_public: boolean
    pronouns: string; location: string; links: string[]
  }
  look: Look
  sections: { id: string; visible: boolean }[]
  banner: AnimeBrief | null
  hill: { anime: AnimeBrief; text: string; score: number | null; everyone: number | null } | null
  watching: (AnimeBrief & { progress: number | null })[]
  drops: (AnimeBrief & { progress: number | null })[]
  stats: { watched: number; watching: number | null; hours: number | null; top_studio: string | null; rated: number }
  favourites: (AnimeBrief & { score: number | null })[]
  hot_takes: { anime: AnimeBrief; you: number; everyone: number }[]
  years: [number, number][]
  dna: { id: number; neg: string[]; pos: string[]; value: number }[] | null
  entries: { anime: AnimeBrief; status: Status; score: number | null; strength?: number | null }[]
  track: { n: number; within1: number } | null
  is_owner: boolean
}

interface Match {
  percent: number; shared: number
  agree: { anime: AnimeBrief; a: number; b: number }[]
  fight: { anime: AnimeBrief; a: number; b: number }[]
}

const ACCENT_SEASON: Record<string, Season> = { spring: 'SPRING', summer: 'SUMMER', fall: 'FALL', winter: 'WINTER' }
/** Inks beyond the four seasons; they override --season for the whole profile. */
export const ACCENT_INK: Record<string, string> = { matcha: '#8fd16a', violet: '#b38cff', crimson: '#ff4d6a', mono: '#f4f1ea' }

const SCORE_BANDS = [...TIERS.map((t, i) => ({ label: t.label, min: [9, 8, 6.5, 5, 0][i] })), { label: 'Not rated yet', min: -1 }]

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

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
  const preview = useSearchParams()[0].has('preview')
  const [picked, setTab] = useState<Status | null>(null)
  const { data: p, error, isLoading } = useQuery({
    queryKey: ['profile', username], queryFn: () => api<Profile>(`/api/u/${username}`), retry: false,
  })

  // Lists with nothing in them are left out, unless one is all there is.
  const allowed = p?.look.chart_lists ?? []
  const filled = allowed.filter((s) => p?.entries.some((e) => e.status === s))
  const lists = filled.length ? filled : allowed.slice(0, 1)
  const tab: Status = picked && lists.includes(picked) ? picked : lists.includes(p?.look.chart_tab ?? 'completed') ? p!.look.chart_tab : lists[0] ?? 'completed'
  const group = p?.look.scores === 'off' && p.look.chart_group === 'score' ? 'season' : p?.look.chart_group ?? 'season'

  const grouped = useMemo(() => {
    const rows = (p?.entries ?? []).filter((e) => e.status === tab)
    if (group === 'flat') return [{ key: 'all', season: null, year: null, label: undefined, items: [...rows].sort(byRank) }]
    if (group === 'score') {
      return SCORE_BANDS.map((b, i) => ({
        key: b.label, season: null, year: null, label: b.label,
        items: rows.filter((e) => (e.score ?? -1) >= b.min && (i === 0 || (e.score ?? -1) < SCORE_BANDS[i - 1].min))
          .sort(byRank),
      })).filter((g) => g.items.length)
    }
    const m = new Map<string, { key: string; season: Season | null; year: number | null; label: string | undefined; items: Profile['entries'] }>()
    for (const e of rows) {
      const k = `${e.anime.year ?? 0}-${e.anime.season ?? 'X'}`
      if (!m.has(k)) m.set(k, { key: k, season: e.anime.season, year: e.anime.year, label: undefined, items: [] })
      m.get(k)!.items.push(e)
    }
    const rank = (s: Season | null) => (s ? SEASON_ORDER.indexOf(s) : -1)
    return [...m.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || rank(b.season) - rank(a.season))
      .map((g) => ({ ...g, items: g.items.sort(byRank) }))
  }, [p, tab, group])

  if (isLoading) return <PageLoading />
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

  const look = p.look
  const show = (id: string) => p.sections.find((s) => s.id === id)?.visible !== false
  const season = ACCENT_SEASON[p.user.accent] ?? p.banner?.season ?? 'FALL'
  const ink = ACCENT_INK[p.user.accent]
  const url = `${window.location.origin}/u/${p.user.username}`
  const scoresOn = look.scores !== 'off'
  const fmt = look.scores === 'hundred' ? (s: number) => String(Math.round(s * 10)) : undefined
  const fmtText = (s: number) => (fmt ? fmt(s) : s.toFixed(1))
  const sc = (s: number | null) => (scoresOn ? s : null)
  const statOn = (k: string) => !look.stats_hidden.includes(k)
  const whose = p.is_owner ? 'my' : 'their'

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
        <h2 className="display prof-h">{look.fav_title || 'All-time favourites'}</h2>
        <ol className={`favs favs-${look.fav_layout}`}>
          {p.favourites.map((f, i) => (
            <li key={f.id} data-season={f.season ?? undefined}>
              <span className="favs-n display">{i + 1}</span>
              <Link to={`/anime/${f.id}`} className="tile">
                <Cover id={f.id} title={f.title} src={f.picture ?? f.thumbnail} color={f.color} score={sc(f.score)} fmt={fmt} />
                <span className="tile-title">{f.title_en ?? f.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    ) : null,
    hill: show('hill') && p.hill ? (
      <section key="hill" className="prof-sec hill" data-season={p.hill.anime.season ?? undefined}>
        <Link to={`/anime/${p.hill.anime.id}`} className="hill-cover" aria-label={p.hill.anime.title_en ?? p.hill.anime.title}>
          <Cover id={p.hill.anime.id} title={p.hill.anime.title} src={p.hill.anime.picture ?? p.hill.anime.thumbnail} color={p.hill.anime.color} />
        </Link>
        <div className="hill-body">
          <p className="hill-kicker">The hill {p.is_owner ? 'I’ll' : 'they’ll'} die on</p>
          <h2 className="display hill-title"><Link to={`/anime/${p.hill.anime.id}`}>{p.hill.anime.title_en ?? p.hill.anime.title}</Link></h2>
          {p.hill.text && <p className="hill-text">“{p.hill.text}”</p>}
          {p.hill.score != null && scoresOn && (
            <p className="hill-score">
              <span className="display">{fmtText(p.hill.score)}</span>
              {p.hill.everyone != null && <span className="faint"> everyone else {fmtText(p.hill.everyone)}</span>}
            </p>
          )}
        </div>
      </section>
    ) : null,
    watching: show('watching') && p.watching.length > 0 ? (
      <section key="watching" className="prof-sec">
        <h2 className="display prof-h">Watching now</h2>
        <div className="prof-strip">
          {p.watching.map((a) => (
            <Link key={a.id} to={`/anime/${a.id}`} className="tile" data-season={a.season ?? undefined}>
              <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status="watching" />
              <span className="tile-title">{a.title_en ?? a.title}</span>
              {a.progress != null && <span className="tile-sub faint">Episode {a.progress}{a.episodes ? ` of ${a.episodes}` : ''}</span>}
            </Link>
          ))}
        </div>
      </section>
    ) : null,
    hot_takes: show('hot_takes') && scoresOn && p.hot_takes.length > 0 ? (
      <section key="hot" className="prof-sec">
        <h2 className="display prof-h">Hot takes</h2>
        <p className="muted prof-sub">Where {p.user.display_name} disagrees with everyone else the most.</p>
        <ol className="hot">
          {p.hot_takes.map((h, i) => (
            <li key={h.anime.id} data-season={h.anime.season ?? undefined}>
              <span className="hot-n display">{i + 1}</span>
              <Link to={`/anime/${h.anime.id}`} className="hot-title">{h.anime.title_en ?? h.anime.title}</Link>
              <span className="hot-you display">{fmtText(h.you)}</span>
              <span className="hot-vs faint">everyone {fmtText(h.everyone)}</span>
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
    drops: show('drops') && p.drops.length > 0 ? (
      <section key="drops" className="prof-sec">
        <h2 className="display prof-h">The drop wall</h2>
        <p className="muted prof-sub">Started, then stopped. No regrets.</p>
        <div className="prof-strip drops">
          {p.drops.map((a) => (
            <Link key={a.id} to={`/anime/${a.id}`} className="tile">
              <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status="dropped" />
              <span className="tile-title">{a.title_en ?? a.title}</span>
              {a.progress != null && a.progress > 0 && <span className="tile-sub faint">Quit at episode {a.progress}</span>}
            </Link>
          ))}
        </div>
      </section>
    ) : null,
    chart: show('chart') && lists.length > 0 ? (
      <section key="chart" className="prof-sec">
        <div className="prof-chart-head">
          <h2 className="display prof-h">The chart</h2>
          {lists.length > 1 && (
            <div className="seg">
              {lists.map((s) => (
                <button key={s} className={tab === s ? 'is-on' : ''} onClick={() => setTab(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          )}
        </div>
        {grouped.length === 0 && <p className="muted prof-sub">Nothing here yet.</p>}
        <Bands>{grouped.map((g) => (
          <SeasonBand key={g.key} season={g.season} year={g.year} label={g.label} neutral={group !== 'season'}
            count={`${g.items.length}`} wide={group === 'flat' || g.items.length > 8} n={g.items.length}>
            <CoverGrid dense>
              {g.items.map((e) => (
                <Link key={e.anime.id} to={`/anime/${e.anime.id}`} className="tile" data-season={e.anime.season ?? undefined}>
                  <Cover id={e.anime.id} title={e.anime.title} src={e.anime.picture ?? e.anime.thumbnail} color={e.anime.color}
                    status={e.status === 'completed' ? undefined : e.status} score={sc(e.score)} fmt={fmt} />
                  <span className="tile-title">{e.anime.title_en ?? e.anime.title}</span>
                </Link>
              ))}
            </CoverGrid>
          </SeasonBand>
        ))}</Bands>
      </section>
    ) : null,
  }

  const art = p.banner?.picture ?? p.banner?.thumbnail ?? null
  const avatarArt = p.favourites[0]?.picture ?? p.favourites[0]?.thumbnail ?? art
  const meta = [p.user.pronouns, p.user.location].filter(Boolean)

  return (
    <div className={`prof head-${look.header}${look.name_style === 'quiet' ? ' name-quiet' : ''}`} data-season={season}
      style={ink ? { ['--season' as string]: ink } : undefined}>
      <header className="prof-head">
        {art && (look.header === 'art' || look.header === 'poster') && (
          <div className="prof-banner" aria-hidden="true">
            <img src={art} alt="" referrerPolicy="no-referrer" style={{ objectPosition: `center ${look.banner_focus}` }} />
          </div>
        )}
        <div className={`page prof-head-inner${look.header === 'poster' && art ? ' head-poster-inner' : ''}`}>
          {look.header === 'poster' && art && (
            <div className="prof-poster" aria-hidden="true"><img src={art} alt="" referrerPolicy="no-referrer" /></div>
          )}
          {look.fan && p.favourites.length >= 3 && (
            <div className="prof-fan" aria-hidden="true">
              {p.favourites.slice(0, 3).reverse().map((f, i) => (
                <div key={f.id} className={`prof-fan-card prof-fan-${i}`}>
                  <Cover id={f.id} title={f.title} src={f.picture ?? f.thumbnail} color={f.color} score={sc(f.score)} fmt={fmt} eager />
                </div>
              ))}
            </div>
          )}
          <div className="prof-id">
            {look.avatar === 'initial' && <span className="prof-avatar display" aria-hidden="true">{p.user.display_name.slice(0, 1).toUpperCase()}</span>}
            {look.avatar === 'cover' && avatarArt && (
              <span className="prof-avatar prof-avatar-art" aria-hidden="true"><img src={avatarArt} alt="" referrerPolicy="no-referrer" /></span>
            )}
            <div>
              <h1 className="display prof-name">{p.user.display_name}</h1>
              <p className="prof-handle">@{p.user.username}{meta.map((m) => <span key={m}> · {m}</span>)} · on Konomi since {p.user.since}</p>
            </div>
          </div>
          {p.user.bio && <p className="prof-bio">{p.user.bio}</p>}
          {p.user.links.length > 0 && (
            <ul className="prof-links">
              {p.user.links.map((l) => (
                <li key={l}><a href={l} target="_blank" rel="noopener noreferrer nofollow ugc"><Icon name="arrowRight" size={14} /> {host(l)}</a></li>
              ))}
            </ul>
          )}
          <p className="prof-line">
            <span><strong className="display">{p.stats.watched}</strong> watched</span>
            {statOn('hours') && p.stats.hours != null && <span><strong className="display">{p.stats.hours.toLocaleString()}</strong> hours</span>}
            {statOn('watching') && !!p.stats.watching && <span><strong className="display">{p.stats.watching}</strong> watching now</span>}
            {statOn('studio') && p.stats.top_studio && <span>mostly <strong className="prof-studio">{p.stats.top_studio}</strong></span>}
            {statOn('track') && scoresOn && p.track && <span title={`Over ${p.track.n} titles, Konomi guessed before the answer`}>
              Konomi guesses {whose} scores within a point <strong className="display">{Math.round(p.track.within1 * 100)}%</strong> of the time</span>}
          </p>
          {!preview && (
            <div className="prof-actions">
              {p.user.is_public && <button className="btn btn-primary" onClick={share}><Icon name="share" size={18} /> Share</button>}
              {p.user.is_public && <a className="btn" href={`/og/u/${p.user.username}.png`} download={`${p.user.username}-konomi.png`}>
                <Icon name="download" size={18} /> Card</a>}
              {p.is_owner && <Link to="/settings" className="btn"><Icon name="settings" size={18} /> Customise</Link>}
              {p.is_owner && !p.user.is_public && <span className="prof-note"><Icon name="lock" size={16} /> Only you can see this. Make it public in Customise.</span>}
            </div>
          )}
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
