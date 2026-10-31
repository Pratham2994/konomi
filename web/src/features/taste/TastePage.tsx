import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { api } from '../../lib/api'
import type { AnimeBrief } from '../../lib/types'
import { RecCard, useRecs } from '../home/HomePage'
import { GalaxyCanvas, type ClusterMeta, type Point } from './Galaxy'
import './taste.css'

interface Axis { id: number; neg: string[]; pos: string[]; value: number }
interface NetNode { anime: AnimeBrief | null; edges: number[] }

const ACCENT = '#ff7340'

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
          edge(col[0] + 70, y(i, net.inputs.length), col[1] - 90, y(j, net.axes.length), v, maxIn, `i${i}-${j}`, i * 0.04)))}
        {net.outputs.map((out, i) => out.edges.map((v, j) =>
          edge(col[1] + 90, y(j, net.axes.length), col[2] - 70, y(i, net.outputs.length), v, maxOut, `o${i}-${j}`, 0.5 + i * 0.04)))}
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
              <span className="net-axis">{a.value >= 0 ? a.pos[0] : a.neg[0]}</span>
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
  const galaxy = useQuery({ queryKey: ['galaxy'], queryFn: () => api<{ points: Point[]; clusters: ClusterMeta[] }>('/api/taste/galaxy'), staleTime: Infinity })
  const me = useQuery({ queryKey: ['taste-me'], queryFn: () => api<{ mine: { id: number; score: number | null }[]; centroid: [number, number, number] | null; recs: number[] }>('/api/taste/me') })
  const dna = useQuery({ queryKey: ['dna'], queryFn: () => api<{ axes: Axis[] | null; need: number }>('/api/taste/dna') })
  const net = useQuery({ queryKey: ['network'], queryFn: () => api<{ network: { axes: Axis[]; inputs: NetNode[]; outputs: NetNode[] } | null }>('/api/taste/network') })
  const track = useQuery({ queryKey: ['track'], queryFn: () => api<{ n: number; within1: number | null; mae: number | null }>('/api/taste/track') })
  const recs = useRecs(filter)

  const mine = useMemo(() => new Map((me.data?.mine ?? []).map((m) => [m.id, m.score])), [me.data])
  const recSet = useMemo(() => new Set(me.data?.recs ?? []), [me.data])
  const need = dna.data?.need ?? 0

  return (
    <div className="taste" data-season="FALL">
      <section className="g-stage">
        {galaxy.data && (
          <div className="g-canvas"><GalaxyCanvas points={galaxy.data.points} mine={mine} recs={recSet} centroid={me.data?.centroid ?? null}
            accent={ACCENT} onHover={(id, at) => setHover(id != null && at ? { id, at } : null)}
            onPick={(id) => nav(`/anime/${id}`)} /></div>
        )}
        <div className="g-overlay page">
          <h1 className="display g-title">Your taste</h1>
          <p className="g-lead">
            Every star is an anime — {galaxy.data ? galaxy.data.points.length.toLocaleString() : '39,000+'} of them.
            Stars sit close when the same people love them. <span className="g-key g-key-mine">White</span> are yours,
            <span className="g-key g-key-rec"> pulsing</span> are what Konomi thinks you’ll love next.
          </p>
          {track.data && track.data.n >= 3 && track.data.within1 != null && (
            <p className="g-track">
              Konomi guessed your score within 1 point on <strong>{Math.round(track.data.within1 * 100)}%</strong> of
              {' '}{track.data.n} titles — before you answered.
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
            <p className="muted taste-sub">Six directions the model found in 56 million ratings. Nobody named them — the labels are the tags that cluster at each end.</p>
            <Dna axes={dna.data.axes} />
          </section>
        )}

        {net.data?.network && (
          <section className="taste-sec">
            <h2 className="display taste-h">How Konomi picks</h2>
            <p className="muted taste-sub">Your strongest titles pull on the taste directions; those directions push the picks. Thicker lines carry more weight.</p>
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
