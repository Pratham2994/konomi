import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { api } from '../../lib/api'
import { useList } from '../../lib/hooks'
import { ImportPanel } from './ImportPanel'
import '../auth/auth.css'
import './settings.css'

interface Settings {
  username: string; display_name: string; is_public: boolean; bio: string; accent: string
  banner_anime_id: number | null; favourites: number[]; sections: { id: string; visible: boolean }[]
}

const SECTION_LABEL: Record<string, string> = {
  favourites: 'All-time favourites', hot_takes: 'Hot takes', years: 'Anime years', dna: 'Taste DNA', chart: 'The chart',
}
const ACCENTS = [
  { id: 'auto', label: 'Match my banner' }, { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' },
  { id: 'fall', label: 'Fall' }, { id: 'winter', label: 'Winter' },
]

export function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: s } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/profile') })
  const { data: entries = [] } = useList()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [pickFor, setPickFor] = useState<'favourites' | 'banner' | null>(null)
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api<Settings>('/api/profile', { method: 'PATCH', json: patch }),
    onSuccess: (d) => {
      qc.setQueryData(['settings'], d)
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  useEffect(() => { if (s) { setName(s.display_name); setBio(s.bio) } }, [s])
  if (!s) return <div className="page" />

  const watched = entries.filter((e) => e.status === 'completed').sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const byId = new Map(entries.map((e) => [e.anime_id, e]))

  function toggleFav(id: number) {
    const cur = s!.favourites
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 10 ? cur : [...cur, id]
    if (!cur.includes(id) && cur.length >= 10) toast({ text: 'Ten favourites max — remove one first' })
    save.mutate({ favourites: next })
  }

  function moveSection(i: number, dir: -1 | 1) {
    const arr = [...s!.sections]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    save.mutate({ sections: arr })
  }

  return (
    <div className="page settings">
      <header className="set-head">
        <h1 className="display set-title">Customise</h1>
        <Link to={`/u/${s.username}`} className="btn"><Icon name="eye" size={18} /> View profile</Link>
      </header>

      <section className="set-sec">
        <h2>Who can see it</h2>
        <label className="toggle">
          <input type="checkbox" checked={s.is_public} onChange={(e) => save.mutate({ is_public: e.target.checked })} />
          <span className="toggle-ui" aria-hidden="true" />
          <span>
            <strong>{s.is_public ? 'Public' : 'Private'}</strong>
            <span className="muted"> — {s.is_public ? `anyone with konomi/u/${s.username} can see your chart` : 'only you can see your chart'}</span>
          </span>
        </label>
      </section>

      <section className="set-sec set-grid">
        <label className="set-field">
          <span>Display name</span>
          <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== s.display_name && save.mutate({ display_name: name.trim() })} />
        </label>
        <label className="set-field">
          <span>Bio <em className="faint">{bio.length}/160</em></span>
          <textarea className="field set-bio" value={bio} maxLength={160} rows={3} onChange={(e) => setBio(e.target.value)}
            onBlur={() => bio !== s.bio && save.mutate({ bio })} placeholder="What do you watch for?" />
        </label>
      </section>

      <section className="set-sec">
        <h2>Colour</h2>
        <div className="accents">
          {ACCENTS.map((a) => (
            <button key={a.id} className={`accent accent-${a.id}${s.accent === a.id ? ' is-on' : ''}`} onClick={() => save.mutate({ accent: a.id })}>
              <span className="accent-dot" aria-hidden="true" /> {a.label}
            </button>
          ))}
        </div>
      </section>

      <section className="set-sec">
        <h2>Banner</h2>
        <p className="muted">The art behind your name. Defaults to your top favourite.</p>
        <div className="set-row">
          {s.banner_anime_id && byId.get(s.banner_anime_id) && (
            <Cover id={s.banner_anime_id} title={byId.get(s.banner_anime_id)!.anime.title} src={byId.get(s.banner_anime_id)!.anime.thumbnail} color={byId.get(s.banner_anime_id)!.anime.color} size="s" />
          )}
          <button className="btn" onClick={() => setPickFor(pickFor === 'banner' ? null : 'banner')}>Choose from your chart</button>
        </div>
      </section>

      <section className="set-sec">
        <h2>All-time favourites <span className="faint">{s.favourites.length}/10</span></h2>
        <p className="muted">In order. Leave empty and Konomi shows your highest scores.</p>
        <div className="set-favs">
          {s.favourites.map((id, i) => byId.get(id) && (
            <button key={id} className="set-fav" onClick={() => toggleFav(id)} aria-label={`Remove ${byId.get(id)!.anime.title}`}>
              <span className="display set-fav-n">{i + 1}</span>
              <Cover id={id} title={byId.get(id)!.anime.title} src={byId.get(id)!.anime.thumbnail} color={byId.get(id)!.anime.color} size="s" />
            </button>
          ))}
          <button className="btn" onClick={() => setPickFor(pickFor === 'favourites' ? null : 'favourites')}>
            <Icon name="plus" size={18} /> Pick favourites
          </button>
        </div>
      </section>

      {pickFor && (
        <section className="set-picker">
          <div className="set-picker-head">
            <h2>{pickFor === 'banner' ? 'Pick a banner' : 'Tap to add or remove'}</h2>
            <button className="btn btn-primary" onClick={() => setPickFor(null)}>Done</button>
          </div>
          <div className="grid grid-dense">
            {watched.map((e) => {
              const on = pickFor === 'banner' ? s.banner_anime_id === e.anime_id : s.favourites.includes(e.anime_id)
              return (
                <button key={e.anime_id} className={`set-pick${on ? ' is-on' : ''}`}
                  onClick={() => pickFor === 'banner' ? save.mutate({ banner_anime_id: e.anime_id }) : toggleFav(e.anime_id)}>
                  <Cover id={e.anime_id} title={e.anime.title} src={e.anime.thumbnail} color={e.anime.color} status={on ? 'completed' : undefined} animateMark score={e.score} />
                  <span className="tile-title">{e.anime.title_en ?? e.anime.title}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="set-sec" id="import">
        <h2>Bring your list over</h2>
        <p className="muted">From MyAnimeList (Profile → Export → Anime list) or a public AniList profile. Nothing already on your chart is changed.</p>
        <ImportPanel />
      </section>

      <section className="set-sec">
        <h2>Sections</h2>
        <p className="muted">Choose what your profile shows, and in what order.</p>
        <ul className="set-sections">
          {s.sections.map((sec, i) => (
            <li key={sec.id}>
              <label className="toggle toggle-s">
                <input type="checkbox" checked={sec.visible}
                  onChange={(e) => save.mutate({ sections: s.sections.map((x) => x.id === sec.id ? { ...x, visible: e.target.checked } : x) })} />
                <span className="toggle-ui" aria-hidden="true" />
                <span>{SECTION_LABEL[sec.id]}</span>
              </label>
              <span className="set-move">
                <button className="btn btn-ghost" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label="Move up"><Icon name="arrowUp" size={16} /></button>
                <button className="btn btn-ghost" disabled={i === s.sections.length - 1} onClick={() => moveSection(i, 1)} aria-label="Move down"><Icon name="arrowDown" size={16} /></button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
