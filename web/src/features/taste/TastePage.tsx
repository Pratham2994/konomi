import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { api } from '../../lib/api'
import { useList } from '../../lib/hooks'
import type { AnimeBrief } from '../../lib/types'
import { RecCard, useRecs } from '../home/HomePage'
import { galaxyQuery, loadGalaxy } from './preload'
import './taste.css'

interface Axis { id: number; neg: string[]; pos: string[]; value: number }
interface NetNode { anime: AnimeBrief | null; edges: number[] }

const ACCENT = '#ff7340'
const GalaxyCanvas = lazy(() => loadGalaxy().then((m) => ({ default: m.GalaxyCanvas })))

function Dna({ axes }: { axes: Axis[] }) {
  return (
    <div className="dna">
      {axes.map((a, i) => (
        <div key={a.id} className="dna-row">
          <span className="dna-pole dna-neg">{a.neg.join(' · ')}</span>
          <div className="dna-rail">
            <span className="dna-mid" />
            <motion.span className="dna-dot" initial={{ left: '50%' }} animate={{ left: `${50 + a.value * 50}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.1 + i * 0.06 }} />
          </div>
          <span className="dna-pole dna-pos">{a.pos.join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}

function ModelView({ net }: { net: { axes: Axis[]; inputs: NetNode[]; outputs: NetNode[] } }) {
  const W = 1000, rowH = 54
  const n = Math.max(net.inputs.length, net.outputs.length, net.axes.length)
  const H = n * rowH + 20
  const col = [150, 500, 850]
  const PILL = 70 // half-width of a middle node; edges meet its sides
  const y = (i: number, len: number) => 10 + (H - 20) * ((i + 0.5) / len)
  const maxIn = Math.max(...net.inputs.flatMap((x) => x.edges.map(Math.abs)), 1e-6)
  const maxOut = Math.max(...net.outputs.flatMap((x) => x.edges.map(Math.abs)), 1e-6)
  const edge = (x1: number, y1: number, x2: number, y2: number, v: number, max: number, k: string, d: number) => {
    const w = Math.abs(v) / max
    if (w < 0.18) return null
    return (
      <motion.path key={k} d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`}
        stroke={v > 0 ? 'var(--season)' : 'var(--paper-3)'} strokeWidth={0.6 + w * 4} fill="none"
        strokeOpacity={0.25 + w * 0.6} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay: d, ease: [0.16, 1, 0.3, 1] }} />
    )
  }
  return (
    <div className="net">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="net-svg" aria-hidden="true">
        {net.inputs.map((inp, i) => inp.edges.map((v, j) =>
          edge(col[0] + 70, y(i, net.inputs.length), col[1] - PILL, y(j, net.axes.length), v, maxIn, `i${i}-${j}`, i * 0.04)))}
        {net.outputs.map((out, i) => out.edges.map((v, j) =>
          edge(col[1] + PILL, y(j, net.axes.length), col[2] - 70, y(i, net.outputs.length), v, maxOut, `o${i}-${j}`, 0.5 + i * 0.04)))}
      </svg>
      <div className="net-cols" style={{ height: H }}>
        <ul className="net-col net-in">
          {net.inputs.map((x, i) => x.anime && (
            <li key={i} style={{ top: `${(y(i, net.inputs.length) / H) * 100}%` }}>
              <Cover id={x.anime.id} title={x.anime.title} src={x.anime.thumbnail} color={x.anime.color} size="xs" />
              <span>{x.anime.title_en ?? x.anime.title}</span>
            </li>
          ))}
        </ul>
        <ul className="net-col net-mid">
          {net.axes.map((a, i) => (
            <li key={a.id} style={{ top: `${(y(i, net.axes.length) / H) * 100}%` }}>
              <span className="net-axis" title={(a.value >= 0 ? a.pos : a.neg).join(' · ')}>{(a.value >= 0 ? a.pos : a.neg)[0]}</span>
            </li>
          ))}
        </ul>
        <ul className="net-col net-out">
          {net.outputs.map((x, i) => x.anime && (
            <li key={i} style={{ top: `${(y(i, net.outputs.length) / H) * 100}%` }}>
              <span>{x.anime.title_en ?? x.anime.title}</span>
              <Cover id={x.anime.id} title={x.anime.title} src={x.anime.thumbnail} color={x.anime.color} size="xs" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function HoverCard({ id, at }: { id: number; at: { x: number; y: number } }) {
  const { data } = useQuery({ queryKey: ['anime', String(id)], queryFn: () => api<AnimeBrief>(`/api/anime/${id}`), staleTime: Infinity })
  if (!data) return null
  return (
    <div className="g-hover" style={{ left: at.x + 14, top: at.y + 14 }}>
      <Cover id={data.id} title={data.title} src={data.thumbnail} color={data.color} size="s" />
      <span><strong>{data.title_en ?? data.title}</strong><span className="faint">{data.year}</span></span>
    </div>
  )
}

const FILTERS = [
  { key: '', label: 'Everything' }, { key: '?type=TV', label: 'Series' }, { key: '?type=MOVIE', label: 'Movies' },
  { key: '?era=new', label: '2020s' }, { key: '?era=2010s', label: '2010s' }, { key: '?era=2000s', label: '2000s' },
  { key: '?era=classic', label: 'Classics' }, { key: '?gems=true', label: 'Hidden gems' },
]

export default function TastePage() {
  const nav = useNavigate()
  const [filter, setFilter] = useState('')
  const [hover, setHover] = useState<{ id: number; at: { x: number; y: number } } | null>(null)
  const galaxy = useQuery(galaxyQuery)
  const me = useQuery({ queryKey: ['taste-me'], queryFn: () => api<{ mine: { id: number; score: number | null }[]; centroid: [number, number, number] | null; recs: number[] }>('/api/taste/me') })
  const dna = useQuery({ queryKey: ['dna'], queryFn: () => api<{ axes: Axis[] | null; need: number }>('/api/taste/dna') })
  const net = useQuery({ queryKey: ['network'], queryFn: () => api<{ network: { axes: Axis[]; inputs: NetNode[]; outputs: NetNode[] } | null }>('/api/taste/network') })
  const track = useQuery({ queryKey: ['track'], queryFn: () => api<{ n: number; within1: number | null; mae: number | null }>('/api/taste/track') })
  const recs = useRecs(filter)

  const mine = useMemo(() => new Map((me.data?.mine ?? []).map((m) => [m.id, m.score])), [me.data])
  const { data: entries = [] } = useList()
  // Pick one of your titles to see where it sits and which titles its fans also love.
  const [focusId, setFocusId] = useState<number | null>(null)
  const near = useQuery({
    queryKey: ['similar', focusId], enabled: focusId != null, staleTime: Infinity,
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/taste/similar/${focusId}?k=6`),
  })
  const mineTop = useMemo(() => entries.filter((e) => e.score != null).sort((a, b) => b.score! - a.score!).slice(0, 10), [entries])
  const focus = focusId != null && near.data ? { id: focusId, near: near.data.items.map((a) => a.id) } : null
  const focused = entries.find((e) => e.anime_id === focusId)
  // Your three best-rated titles get name tags on the map.
  const named = useMemo(() => (focus && focused && near.data
    ? [{ id: focus.id, label: focused.anime.title_en ?? focused.anime.title }, ...near.data.items.map((a) => ({ id: a.id, label: a.title_en ?? a.title }))]
    : entries.filter((e) => e.score != null).sort((a, b) => b.score! - a.score!).slice(0, 3)
      .map((e) => ({ id: e.anime_id, label: e.anime.title_en ?? e.anime.title }))), [entries, focus, focused, near.data])
  // The neighbourhoods you watch most in, by the cluster each of your titles sits in.
  const hoods = useMemo(() => {
    if (!galaxy.data || mine.size === 0) return []
    const cluster = new Map(galaxy.data.points.map((p) => [p[0], p[4]]))
    const n = new Map<number, number>()
    for (const id of mine.keys()) { const c = cluster.get(id); if (c != null) n.set(c, (n.get(c) ?? 0) + 1) }
    const label = new Map(galaxy.data.clusters.map((c) => [c.id, c.name ?? c.label]))
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, k]) => ({ label: label.get(c) ?? '', n: k })).filter((h) => h.label)
  }, [galaxy.data, mine])
  const recSet = useMemo(() => new Set(me.data?.recs ?? []), [me.data])
  const need = dna.data?.need ?? 0

  return (
    <div className="taste" data-season="FALL">
      <section className="g-stage">
        {galaxy.data ? (
          <Suspense fallback={<p className="g-loading faint">Placing the stars…</p>}>
            <div className="g-canvas"><GalaxyCanvas points={galaxy.data.points} clusters={galaxy.data.clusters} mine={mine} recs={recSet} centroid={me.data?.centroid ?? null}
              accent={ACCENT} named={named} focus={focus} onHover={(id, at) => setHover(id != null && at ? { id, at } : null)}
              onPick={(id) => nav(`/anime/${id}`)} /></div>
          </Suspense>
        ) : <p className="g-loading faint">{galaxy.isError ? 'The galaxy didn’t load. Refresh to try again.' : 'Placing the stars…'}</p>}
        <div className="g-overlay page">
          <h1 className="display g-title">Your taste</h1>
          <p className="g-lead">
            Every star is an anime, {galaxy.data ? galaxy.data.points.length.toLocaleString() : '39,000+'} of them. Konomi placed
            them using 56 million real ratings: two stars sit close when the same people love both. The map is the same for
            everyone. {me.data && mine.size === 0
              ? <>Rate a few anime and yours light up here in <span className="g-key g-key-mine">white</span>.</>
              : <><span className="g-key g-key-mine">White</span> stars are the ones you’ve rated,
                <span className="g-key g-key-rec"> pulsing</span> ones are what Konomi thinks you’ll love next.</>}
            {' '}Each label names a neighbourhood of similar shows, with two it’s known for.
          </p>
          {hoods.length > 0 && (
            <p className="g-hoods">
              You watch most in{' '}
              {hoods.map((h, i) => <span key={h.label}>{i > 0 && (i === hoods.length - 1 ? ' and ' : ', ')}<strong>{h.label}</strong> ({h.n})</span>)}.
            </p>
          )}
          {mineTop.length > 0 && (
            <div className="g-pick">
              <p className="g-pick-ask">Pick one of yours to see its neighbours:</p>
              <div className="g-pick-list">
                {mineTop.map((e) => (
                  <button key={e.anime_id} className={`chip${focusId === e.anime_id ? ' is-on' : ''}`} aria-pressed={focusId === e.anime_id}
                    onClick={() => setFocusId(focusId === e.anime_id ? null : e.anime_id)}>
                    {e.anime.title_en ?? e.anime.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {focused && near.data && (
            <div className="g-near">
              <p>People who loved <strong>{focused.anime.title_en ?? focused.anime.title}</strong> also loved:</p>
              <ol>
                {near.data.items.map((a) => (
                  <li key={a.id}><Link to={`/anime/${a.id}`}>{a.title_en ?? a.title}</Link>{mine.has(a.id) ? <span className="g-near-seen"> · on your chart</span> : null}</li>
                ))}
              </ol>
            </div>
          )}
          {track.data && track.data.n >= 3 && track.data.within1 != null && (
            <p className="g-track">
              Konomi guessed your score within 1 point on <strong>{Math.round(track.data.within1 * 100)}%</strong> of
              {' '}{track.data.n} titles, before you answered.
            </p>
          )}
        </div>
        {hover && <HoverCard id={hover.id} at={hover.at} />}
        <p className="g-hint faint">Drag to turn · scroll to zoom · click a star</p>
      </section>

      <div className="page taste-body">
        {need > 0 && (
          <div className="taste-need">
            <h2 className="display">Rate {need} more favourite{need === 1 ? '' : 's'} to unlock your taste</h2>
            <p className="muted">Konomi needs a few titles you loved before it can place you. “One of my favourites” and “Loved it” count most.</p>
            <Link to="/rate" className="btn btn-primary">Rate now</Link>
          </div>
        )}

        {dna.data?.axes && (
          <section className="taste-sec">
            <h2 className="display taste-h">Taste DNA</h2>
            <p className="muted taste-sub">
              The model found six big ways anime fans differ, from 56 million ratings. Each line is one of them, with
              the kind of show at each end. Your dot shows which way your rated titles lean: near the middle means you
              like both ends, near an end means that side is clearly yours.
            </p>
            <Dna axes={dna.data.axes} />
          </section>
        )}

        {net.data?.network && (
          <section className="taste-sec">
            <h2 className="display taste-h">How Konomi picks</h2>
            <p className="muted taste-sub">
              How your picks are made, left to right. On the left are the titles you rated highest. In the middle are
              the taste directions from Taste DNA. On the right are the shows Konomi suggests. A line means “this pulls
              on that”: an orange line pushes towards it, a grey one pushes away, and thicker lines matter more. So you
              can follow any suggestion back to the titles that led to it.
            </p>
            <ModelView net={net.data.network} />
          </section>
        )}

        <section className="taste-sec">
          <h2 className="display taste-h">You’ll probably love</h2>
          <div className="taste-filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip${filter === f.key ? ' is-on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="recs">{recs.data?.items.map((r) => <RecCard key={r.anime.id} r={r} />)}</div>
        </section>
      </div>
    </div>
  )
}
