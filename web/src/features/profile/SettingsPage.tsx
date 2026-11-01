import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/PageLoading'
import { api, ApiError } from '../../lib/api'
import { profileChanged } from '../../lib/sync'
import { STATUS_LABEL, useList } from '../../lib/hooks'
import type { Status } from '../../lib/types'
import { ImportPanel } from './ImportPanel'
import { ACCENT_INK, type Look } from './ProfilePage'
import '../auth/auth.css'
import '../list/chart.css'
import './settings.css'

interface Settings extends Look {
  username: string; display_name: string; is_public: boolean; bio: string; accent: string
  banner_anime_id: number | null; favourites: number[]; sections: { id: string; visible: boolean }[]
  pronouns: string; location: string; links: string[]
  hill: { anime_id: number; text: string } | null
}

const SECTION_LABEL: Record<string, string> = {
  favourites: 'All-time favourites', hill: 'The hill I’ll die on', watching: 'Watching now', hot_takes: 'Hot takes',
  years: 'Anime years', dna: 'Taste DNA', drops: 'The drop wall', chart: 'The chart',
}
const SECTION_NOTE: Record<string, string> = {
  favourites: 'Your top ten, in your order',
  hill: 'One title you’ll always defend, with a line why',
  watching: 'What you’re in the middle of right now',
  hot_takes: 'Where your score is furthest from everyone else’s',
  years: 'How many of your anime came out each year',
  dna: 'Six sliders the taste model learned from your ratings',
  drops: 'Shows you stopped watching (off unless you turn it on)',
  chart: 'Your whole list, which visitors can browse',
}
const ACCENTS = [
  { id: 'auto', label: 'Match my banner' }, { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' },
  { id: 'fall', label: 'Fall' }, { id: 'winter', label: 'Winter' }, { id: 'matcha', label: 'Matcha' },
  { id: 'violet', label: 'Violet' }, { id: 'crimson', label: 'Crimson' }, { id: 'mono', label: 'Paper' },
]
const HEADERS = [
  { id: 'art', label: 'Soft art', note: 'Your banner, blurred into the page' },
  { id: 'poster', label: 'Poster', note: 'Your banner, full and sharp' },
  { id: 'ink', label: 'Solid ink', note: 'A block of your colour' },
  { id: 'plain', label: 'Plain', note: 'No banner at all' },
] as const
/** Complete looks in one tap. Fine-tune below changes any single part. */
const THEMES = [
  { id: 'soft', label: 'Soft', note: 'Blurred art, big name', look: { header: 'art', avatar: 'initial', name_style: 'poster', fav_layout: 'hero', fan: true } },
  { id: 'poster', label: 'Poster', note: 'Your banner art, sharp', look: { header: 'poster', avatar: 'cover', name_style: 'poster', fav_layout: 'podium', fan: false } },
  { id: 'ink', label: 'Bold ink', note: 'A block of colour', look: { header: 'ink', avatar: 'initial', name_style: 'poster', fav_layout: 'hero', fan: true } },
  { id: 'quiet', label: 'Quiet', note: 'Plain and calm', look: { header: 'plain', avatar: 'none', name_style: 'quiet', fav_layout: 'even', fan: false } },
] as const

const STATS = [
  { id: 'hours', label: 'Hours watched' }, { id: 'watching', label: 'Watching now count' },
  { id: 'studio', label: 'Top studio' }, { id: 'track', label: 'How well Konomi guesses you' },
]
const ALL_LISTS: Status[] = ['completed', 'watching', 'planned', 'dropped']

type Opt<T extends string> = { id: T; label: string }

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: readonly Opt<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg set-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'is-on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Group({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="set-group" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="display set-group-h" id={`${id}-h`}>{title}</h2>
      {lead && <p className="muted set-group-lead">{lead}</p>}
      <div className="set-group-body">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row-opt">
      <div className="set-row-label"><strong>{label}</strong>{hint && <span className="faint">{hint}</span>}</div>
      <div className="set-row-ctl">{children}</div>
    </div>
  )
}

const NAV = [['visibility', 'Privacy'], ['you', 'About you'], ['look', 'Look'], ['favs', 'Favourites'], ['hill', 'Pinned opinion'],
  ['layout', 'What it shows'], ['chart', 'Chart & scores'], ['import', 'Import']] as const

export function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: s } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/profile') })
  const { data: entries = [] } = useList()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [location, setLocation] = useState('')
  const [favTitle, setFavTitle] = useState('')
  const [links, setLinks] = useState<string[]>(['', '', '', ''])
  const [hillText, setHillText] = useState('')
  const [pickFor, setPickFor] = useState<'favourites' | 'banner' | 'hill' | null>(null)
  const [pickQ, setPickQ] = useState('')
  // The picker is a sheet over the page: Escape closes it and the page behind stays still.
  useEffect(() => {
    if (!pickFor) return
    setPickQ('')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickFor(null) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [pickFor])
  const frame = useRef<HTMLIFrameElement>(null)
  const nav = useNavigate()

  // A link clicked in the preview opens here, in the main app.
  useEffect(() => {
    const on = (e: MessageEvent<{ type?: string; to?: string }>) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'konomi:open' && e.data.to?.startsWith('/')) nav(e.data.to)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [nav])
  const save = useMutation({
    mutationKey: ['settings-save'],
    scope: { id: 'settings-save' }, // saves run one after another, so the server never applies them out of order
    mutationFn: (patch: Partial<Settings>) => api<Settings>('/api/profile', { method: 'PATCH', json: patch }),
    // Every switch moves the moment you touch it; the server's answer lands quietly a moment later.
    onMutate: (patch) => {
      qc.cancelQueries({ queryKey: ['settings'] })
      const prev = qc.getQueryData<Settings>(['settings'])
      if (prev) qc.setQueryData<Settings>(['settings'], { ...prev, ...patch } as Settings)
      return { prev }
    },
    // Quick taps send several saves; only the last one to finish refreshes, so no switch flickers back.
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['settings-save'] }) <= 1) profileChanged(qc)
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(['settings'], ctx.prev)
      toast({ text: e instanceof ApiError && e.code === 'bad_link' ? 'That link doesn’t look like a web address' : 'Couldn’t save that. Try again' })
    },
  })

  useEffect(() => {
    if (!s) return
    setName(s.display_name); setBio(s.bio); setPronouns(s.pronouns); setLocation(s.location); setFavTitle(s.fav_title)
    setLinks([...s.links, '', '', '', ''].slice(0, 4)); setHillText(s.hill?.text ?? '')
  }, [s])
  if (!s) return <PageLoading />

  // Every title on your chart can be picked: watched ones first, best scores first, then the rest.
  const rank = (e: (typeof entries)[number]) => (e.status === 'completed' ? 0 : 1)
  const pickable = [...entries].sort((a, b) => rank(a) - rank(b) || (b.score ?? 0) - (a.score ?? 0))
    .filter((e) => !pickQ.trim() || `${e.anime.title} ${e.anime.title_en ?? ''}`.toLowerCase().includes(pickQ.trim().toLowerCase()))
  const byId = new Map(entries.map((e) => [e.anime_id, e]))
  const set = (patch: Partial<Settings>) => save.mutate(patch)
  const hillAnime = s.hill ? byId.get(s.hill.anime_id) : undefined

  function toggleFav(id: number) {
    const cur = s!.favourites
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 10 ? cur : [...cur, id]
    if (!cur.includes(id) && cur.length >= 10) toast({ text: 'Ten favourites max. Remove one first' })
    set({ favourites: next })
  }

  function moveSection(i: number, dir: -1 | 1) {
    const arr = [...s!.sections]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    set({ sections: arr })
  }

  function pick(id: number) {
    if (pickFor === 'banner') { set({ banner_anime_id: id }); setPickFor(null) }
    else if (pickFor === 'hill') { set({ hill: { anime_id: id, text: hillText } }); setPickFor(null) }
    else toggleFav(id)
  }

  const blurSave = (key: keyof Settings, value: string, current: string) => () => { if (value.trim() !== current) set({ [key]: value.trim() }) }

  return (
    <div className="page settings">
      <header className="set-head">
        <h1 className="display set-title">Customise</h1>
        <Link to={`/u/${s.username}`} className="btn"><Icon name="eye" size={18} /> View profile</Link>
      </header>
      <nav className="set-nav" aria-label="Customise sections">
        {NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <div className="set-layout">
        <div className="set-main">
          <Group id="visibility" title="Who can see your profile">
            <label className="toggle">
              <input type="checkbox" checked={s.is_public} onChange={(e) => set({ is_public: e.target.checked })} />
              <span className="toggle-ui" aria-hidden="true" />
              <span>
                <strong>{s.is_public ? 'Public' : 'Private'}</strong>
                <span className="muted">. {s.is_public ? `Anyone with your link (/u/${s.username}) can see your profile` : 'Only you can see your profile'}</span>
              </span>
            </label>
          </Group>

          <Group id="you" title="About you" lead="Shown under your name.">
            <div className="set-grid">
              <label className="set-field">
                <span>Display name</span>
                <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && name.trim() !== s.display_name && set({ display_name: name.trim() })} />
              </label>
              <label className="set-field set-span">
                <span>Bio <em className="faint">{bio.length}/160</em></span>
                <textarea className="field set-bio" value={bio} maxLength={160} rows={3} onChange={(e) => setBio(e.target.value)}
                  onBlur={() => bio !== s.bio && set({ bio })} placeholder="What do you watch for?" />
              </label>
            </div>
            <details className="set-more" open={!!(s.pronouns || s.location || s.links.length) || undefined}>
              <summary>More about you: pronouns, location, links</summary>
              <div className="set-more-body">
            <div className="set-grid">
              <label className="set-field">
                <span>Pronouns <em className="faint">optional</em></span>
                <input className="field" value={pronouns} maxLength={24} placeholder="they/them"
                  onChange={(e) => setPronouns(e.target.value)} onBlur={blurSave('pronouns', pronouns, s.pronouns)} />
              </label>
              <label className="set-field">
                <span>Location <em className="faint">optional</em></span>
                <input className="field" value={location} maxLength={40} placeholder="Mumbai"
                  onChange={(e) => setLocation(e.target.value)} onBlur={blurSave('location', location, s.location)} />
              </label>
            </div>
            <div className="set-field">
              <span>Links <em className="faint">up to 4: MyAnimeList, AniList, socials, your site</em></span>
              <div className="set-links">
                {links.map((l, i) => (
                  <input key={i} className="field" value={l} placeholder={['myanimelist.net/profile/you', 'anilist.co/user/you', 'x.com/you', 'yoursite.com'][i]}
                    inputMode="url" autoCapitalize="off" spellCheck={false} maxLength={200}
                    onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                    onBlur={() => {
                      const next = links.map((x) => x.trim()).filter(Boolean)
                      if (next.join('|') !== s.links.join('|')) set({ links: next })
                    }} />
                ))}
              </div>
            </div>
              </div>
            </details>
          </Group>

          <Group id="look" title="Look" lead="Pick a look, then a colour. The preview on the right updates as you go.">
            <div className="set-themes" role="radiogroup" aria-label="Look">
              {THEMES.map((t) => {
                const on = Object.entries(t.look).every(([k, v]) => s[k as keyof Settings] === v)
                return (
                  <button key={t.id} role="radio" aria-checked={on} className={`set-theme theme-${t.id}${on ? ' is-on' : ''}`}
                    onClick={() => set(t.look as Partial<Settings>)}>
                    <span className="set-theme-art" aria-hidden="true"><i /><b /><em /></span>
                    <strong>{t.label}</strong>
                    <span className="faint">{t.note}</span>
                  </button>
                )
              })}
            </div>
            <Row label="Colour" hint="Used for your name, numbers and headings">
              <div className="accents">
                {ACCENTS.map((a) => (
                  <button key={a.id} className={`accent accent-${a.id}${s.accent === a.id ? ' is-on' : ''}`} aria-pressed={s.accent === a.id}
                    onClick={() => set({ accent: a.id })}>
                    <span className="accent-dot" aria-hidden="true" style={ACCENT_INK[a.id] ? { background: ACCENT_INK[a.id] } : undefined} /> {a.label}
                  </button>
                ))}
              </div>
            </Row>
            <details className="set-more">
              <summary>Fine-tune: header, banner, picture, name and numbers</summary>
              <div className="set-more-body">
            <Row label="Header">
              <div className="set-cards" role="radiogroup" aria-label="Header style">
                {HEADERS.map((h) => (
                  <button key={h.id} role="radio" aria-checked={s.header === h.id} className={`set-card head-card-${h.id}${s.header === h.id ? ' is-on' : ''}`}
                    onClick={() => set({ header: h.id })}>
                    <span className="set-card-art" aria-hidden="true"><span /></span>
                    <strong>{h.label}</strong>
                    <span className="faint">{h.note}</span>
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Banner" hint="The art behind your name. Defaults to your top favourite">
              <div className="set-inline">
                {s.banner_anime_id && byId.get(s.banner_anime_id) && (
                  <Cover id={s.banner_anime_id} title={byId.get(s.banner_anime_id)!.anime.title} src={byId.get(s.banner_anime_id)!.anime.thumbnail} color={byId.get(s.banner_anime_id)!.anime.color} size="xs" />
                )}
                <button className="btn" onClick={() => setPickFor(pickFor === 'banner' ? null : 'banner')}>Choose from your chart</button>
              </div>
            </Row>
            <Row label="Banner focus" hint="Which part of the art stays in view">
              <Choice label="Banner focus" value={s.banner_focus} onChange={(v) => set({ banner_focus: v })}
                options={[{ id: 'top', label: 'Top' }, { id: 'center', label: 'Middle' }, { id: 'bottom', label: 'Bottom' }]} />
            </Row>
            <Row label="Picture">
              <Choice label="Picture" value={s.avatar} onChange={(v) => set({ avatar: v })}
                options={[{ id: 'initial', label: 'Initial' }, { id: 'cover', label: 'Top favourite' }, { id: 'none', label: 'None' }]} />
            </Row>
            <Row label="Name">
              <Choice label="Name style" value={s.name_style} onChange={(v) => set({ name_style: v })}
                options={[{ id: 'poster', label: 'Poster type' }, { id: 'quiet', label: 'Quiet' }]} />
            </Row>
            <Row label="Fanned covers" hint="Your top three, fanned beside your name on big screens">
              <label className="toggle toggle-s">
                <input type="checkbox" checked={s.fan} onChange={(e) => set({ fan: e.target.checked })} />
                <span className="toggle-ui" aria-hidden="true" />
                <span>{s.fan ? 'On' : 'Off'}</span>
              </label>
            </Row>
            <Row label="Numbers under your name">
              <div className="set-checks">
                {STATS.map((st) => (
                  <label key={st.id} className="toggle toggle-s">
                    <input type="checkbox" checked={!s.stats_hidden.includes(st.id)}
                      onChange={(e) => set({ stats_hidden: e.target.checked ? s.stats_hidden.filter((x) => x !== st.id) : [...s.stats_hidden, st.id] })} />
                    <span className="toggle-ui" aria-hidden="true" />
                    <span>{st.label}</span>
                  </label>
                ))}
              </div>
            </Row>
              </div>
            </details>
          </Group>

          <Group id="favs" title="Favourites" lead="In order. Leave empty and Konomi shows your highest scores.">
            <div className="set-favs">
              {s.favourites.map((id, i) => byId.get(id) && (
                <button key={id} className="set-fav" onClick={() => toggleFav(id)} aria-label={`Remove ${byId.get(id)!.anime.title}`}>
                  <span className="display set-fav-n">{i + 1}</span>
                  <Cover id={id} title={byId.get(id)!.anime.title} src={byId.get(id)!.anime.thumbnail} color={byId.get(id)!.anime.color} size="s" />
                </button>
              ))}
              <button className="btn" onClick={() => setPickFor(pickFor === 'favourites' ? null : 'favourites')}>
                <Icon name="plus" size={18} /> {s.favourites.length ? `Edit favourites (${s.favourites.length}/10)` : 'Pick favourites (now your top scores)'}
              </button>
            </div>
            <details className="set-more">
              <summary>Heading and layout</summary>
              <div className="set-more-body">
            <Row label="Heading" hint="Optional">
              <input className="field set-short" value={favTitle} maxLength={32} placeholder="All-time favourites"
                onChange={(e) => setFavTitle(e.target.value)} onBlur={blurSave('fav_title', favTitle, s.fav_title)} />
            </Row>
            <Row label="Layout">
              <Choice label="Favourites layout" value={s.fav_layout} onChange={(v) => set({ fav_layout: v })}
                options={[{ id: 'hero', label: 'Number one big' }, { id: 'podium', label: 'Top three big' }, { id: 'even', label: 'All equal' }]} />
            </Row>
              </div>
            </details>
          </Group>

          <Group id="hill" title="The hill I’ll die on" lead="Pin one opinion to your profile: a title and one line about why.">
            <div className="set-inline">
              {hillAnime && <Cover id={hillAnime.anime_id} title={hillAnime.anime.title} src={hillAnime.anime.thumbnail} color={hillAnime.anime.color} size="s" />}
              <div className="set-hill">
                <strong>{hillAnime ? hillAnime.anime.title_en ?? hillAnime.anime.title : 'Nothing pinned yet'}</strong>
                <div className="set-inline">
                  <button className="btn" onClick={() => setPickFor(pickFor === 'hill' ? null : 'hill')}>{hillAnime ? 'Change title' : 'Pick a title'}</button>
                  {hillAnime && <button className="btn btn-ghost" onClick={() => set({ hill: null })}>Remove</button>}
                </div>
              </div>
            </div>
            <label className="set-field">
              <span>Why <em className="faint">{hillText.length}/140</em></span>
              <input className="field" value={hillText} maxLength={140} disabled={!s.hill} placeholder="Episode 19 is the best hour of television ever made."
                onChange={(e) => setHillText(e.target.value)}
                onBlur={() => s.hill && hillText.trim() !== s.hill.text && set({ hill: { anime_id: s.hill.anime_id, text: hillText } })} />
            </label>
          </Group>

          {pickFor && (
            <div className="sheet-back" onClick={() => setPickFor(null)}>
            <section className="set-picker sheet" role="dialog" aria-modal="true" aria-label="Pick from your chart" onClick={(e) => e.stopPropagation()}>
              <div className="set-picker-head">
                <h2>{{ banner: 'Pick a banner', hill: 'Pick your hill', favourites: `Favourites: tap to add or remove (${s.favourites.length}/10)` }[pickFor]}</h2>
                <button className="btn btn-primary" onClick={() => setPickFor(null)}>{pickFor === 'favourites' ? 'Done' : 'Close'}</button>
              </div>
              <input className="field set-pick-q" value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Find a title on your chart" autoFocus />
              {entries.length === 0 && <p className="muted">Add some anime to your chart first.</p>}
              {entries.length > 0 && pickable.length === 0 && <p className="muted">Nothing on your chart matches that.</p>}
              <div className="grid grid-dense">
                {pickable.map((e) => {
                  const on = pickFor === 'banner' ? s.banner_anime_id === e.anime_id : pickFor === 'hill' ? s.hill?.anime_id === e.anime_id : s.favourites.includes(e.anime_id)
                  return (
                    <button key={e.anime_id} className={`set-pick${on ? ' is-on' : ''}`} onClick={() => pick(e.anime_id)}>
                      <Cover id={e.anime_id} title={e.anime.title} src={e.anime.picture ?? e.anime.thumbnail} color={e.anime.color} status={on ? 'completed' : undefined} animateMark score={e.score} />
                      <span className="tile-title">{e.anime.title_en ?? e.anime.title}</span>
                    </button>
                  )
                })}
              </div>
            </section>
            </div>
          )}

          <Group id="layout" title="What your profile shows" lead="Turn parts on or off, and use the arrows to change their order. A part with nothing in it stays hidden.">
            <ul className="set-sections">
              {s.sections.map((sec, i) => (
                <li key={sec.id}>
                  <label className="toggle toggle-s">
                    <input type="checkbox" checked={sec.visible}
                      onChange={(e) => set({ sections: s.sections.map((x) => x.id === sec.id ? { ...x, visible: e.target.checked } : x) })} />
                    <span className="toggle-ui" aria-hidden="true" />
                    <span className="set-sec-text"><span>{SECTION_LABEL[sec.id] ?? sec.id}</span><span className="faint">{SECTION_NOTE[sec.id]}</span></span>
                  </label>
                  <span className="set-move">
                    <button className="btn btn-ghost" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label={`Move ${SECTION_LABEL[sec.id]} up`}><Icon name="arrowUp" size={16} /></button>
                    <button className="btn btn-ghost" disabled={i === s.sections.length - 1} onClick={() => moveSection(i, 1)} aria-label={`Move ${SECTION_LABEL[sec.id]} down`}><Icon name="arrowDown" size={16} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </Group>

          <Group id="chart" title="Chart & scores" lead="How your list and your numbers appear to visitors.">
            <details className="set-more">
              <summary>Scores, grouping and which lists visitors see</summary>
              <div className="set-more-body">
            <Row label="Scores" hint={s.scores === 'off' ? 'Visitors see no numbers, and hot takes are hidden' : undefined}>
              <Choice label="Score format" value={s.scores} onChange={(v) => set({ scores: v })}
                options={[{ id: 'ten', label: '8.7' }, { id: 'hundred', label: '87' }, { id: 'off', label: 'Hidden' }]} />
            </Row>
            <Row label="Group the chart by" hint={s.scores === 'off' && s.chart_group === 'score' ? 'Scores are hidden, so it falls back to season' : undefined}>
              <Choice label="Group by" value={s.chart_group} onChange={(v) => set({ chart_group: v })}
                options={[{ id: 'season', label: 'Season' }, { id: 'score', label: 'Score' }, { id: 'flat', label: 'One wall' }]} />
            </Row>
            <Row label="Lists visitors can open">
              <div className="set-checks">
                {ALL_LISTS.map((st) => (
                  <label key={st} className="toggle toggle-s">
                    <input type="checkbox" checked={s.chart_lists.includes(st)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...s.chart_lists, st] : s.chart_lists.filter((x) => x !== st)
                        if (next.length === 0) toast({ text: 'Keep at least one list. Hide the whole chart in Sections instead' })
                        else set({ chart_lists: next })
                      }} />
                    <span className="toggle-ui" aria-hidden="true" />
                    <span>{STATUS_LABEL[st]}</span>
                  </label>
                ))}
              </div>
            </Row>
            <Row label="Opens on">
              <Choice label="Default list" value={s.chart_tab} onChange={(v) => set({ chart_tab: v })}
                options={ALL_LISTS.filter((x) => s.chart_lists.includes(x)).map((x) => ({ id: x, label: STATUS_LABEL[x] }))} />
            </Row>
              </div>
            </details>
          </Group>

          <Group id="import" title="Bring your list over" lead="From MyAnimeList (Profile → Export → Anime list) or a public AniList profile. Nothing already on your chart is changed.">
            <ImportPanel />
          </Group>
        </div>

        <aside className="set-preview" aria-label="Live preview">
          <div className="set-preview-bar"><span className="faint">Live preview</span><Link to={`/u/${s.username}`}>Open</Link></div>
          <div className="set-preview-frame">
            <iframe ref={frame} src={`/u/${s.username}?preview=1`} title="Profile preview" loading="lazy" />
          </div>
        </aside>
      </div>
    </div>
  )
}
