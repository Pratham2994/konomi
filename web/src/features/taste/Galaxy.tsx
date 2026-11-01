import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type Point = [id: number, x: number, y: number, z: number, cluster: number]
export interface ClusterMeta { id: number; label: string; tags: string[]; size: number; name: string; examples: string[] }

const SCALE = 6

export function clusterColor(c: number, n = 24): THREE.Color {
  // Spread hues around the wheel at even lightness so no cluster shouts.
  const h = ((c * 360) / n + 330) % 360
  return new THREE.Color().setHSL(h / 360, 0.55, 0.62)
}

const vert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPulse;
  uniform float uTime;
  uniform float uPx;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pulse = aPulse > 0.5 ? 1.0 + 0.35 * sin(uTime * 2.4 + position.x * 3.0) : 1.0;
    gl_PointSize = aSize * pulse * uPx * (14.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aSize > 2.5 ? 1.0 : 0.8;
  }
`
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, vAlpha * core * core);
  }
`

function Stars({ points, mine, recs, accent, onHover, onPick }: {
  points: Point[]; mine: Map<number, number | null>; recs: Set<number>; accent: string
  onHover: (id: number | null, e?: { x: number; y: number }) => void; onPick: (id: number) => void
}) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(points.length * 3)
    const col = new Float32Array(points.length * 3)
    const size = new Float32Array(points.length)
    const pulse = new Float32Array(points.length)
    const acc = new THREE.Color(accent)
    const paper = new THREE.Color('#f4f1ea')
    points.forEach((p, i) => {
      pos.set([p[1] * SCALE, p[2] * SCALE, p[3] * SCALE], i * 3)
      let c = clusterColor(p[4])
      let s = 2.0
      if (mine.has(p[0])) { c = paper; s = 4.2 + Math.max(0, (mine.get(p[0]) ?? 7) - 5) * 0.45 }
      else if (recs.has(p[0])) { c = acc; s = 3.4; pulse[i] = 1 }
      col.set([c.r, c.g, c.b], i * 3)
      size[i] = s
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aPulse', new THREE.BufferAttribute(pulse, 1))
    return g
  }, [points, mine, recs, accent])

  useFrame((_, dt) => { if (mat.current) mat.current.uniforms.uTime.value += dt })

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio, 2) } }), [])

  function idx(e: ThreeEvent<PointerEvent | MouseEvent>) {
    return e.index != null ? points[e.index]?.[0] ?? null : null
  }

  return (
    <points geometry={geo}
      onPointerMove={(e) => { e.stopPropagation(); onHover(idx(e), { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }) }}
      onPointerOut={() => onHover(null)}
      // A drag to turn the galaxy ends with a release over some star: only a still press counts as a click.
      // One click is one title: the pointer hits many overlapping stars, and each would otherwise fire its own
      // click (and push its own page, so Back walked through dozens of titles). The first hit is the nearest star.
      onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; const id = idx(e); if (id != null) onPick(id) }}>
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function Glow({ at, color }: { at: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.3) * 0.08)
  })
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,255,255,0.55)')
    grd.addColorStop(0.4, 'rgba(255,255,255,0.18)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <sprite ref={ref} position={at.map((v) => v * SCALE) as [number, number, number]} scale={[2.6, 2.6, 1]}>
      <spriteMaterial map={tex} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

const at3 = (points: Map<number, Point>, id: number) => {
  const p = points.get(id)
  return p ? new THREE.Vector3(p[1] * SCALE, p[2] * SCALE, p[3] * SCALE) : null
}

/** Your constellation: your best-rated titles joined nearest-first, so every chart draws its own shape. */
function Constellation({ byId, top }: { byId: Map<number, Point>; top: number[] }) {
  const line = useMemo(() => {
    const pts = top.map((id) => at3(byId, id)).filter((v): v is THREE.Vector3 => v != null)
    if (pts.length < 2) return null
    const path = [pts[0]]
    const left = pts.slice(1)
    while (left.length) {
      const last = path[path.length - 1]
      let k = 0
      left.forEach((v, i) => { if (v.distanceTo(last) < left[k].distanceTo(last)) k = i })
      path.push(left.splice(k, 1)[0])
    }
    const g = new THREE.BufferGeometry().setFromPoints(path)
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.45, depthWrite: false }))
  }, [byId, top])
  return line ? <primitive object={line} /> : null
}

/** Lines from a picked title to the titles its fans also love. */
function Spokes({ byId, focus }: { byId: Map<number, Point>; focus: { id: number; near: number[] } | null }) {
  const lines = useMemo(() => {
    if (!focus) return null
    const from = at3(byId, focus.id)
    if (!from) return null
    const pts = focus.near.map((id) => at3(byId, id)).filter((v): v is THREE.Vector3 => v != null).flatMap((v) => [from, v])
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ff7340', transparent: true, opacity: 0.8, depthWrite: false }))
  }, [byId, focus])
  return lines ? <primitive object={lines} /> : null
}

/** A label pinned to a point in space, drawn as plain HTML over the canvas. */
interface Tag { key: string; at: THREE.Vector3; text: string; kind: 'cluster' | 'name'; color?: string; sub?: string; focus?: boolean }

/**
 * Moves the HTML labels to where their points sit on screen, every frame.
 * Plain elements updated in place, not one React root per label (which broke when the page unmounted).
 * Labels are placed in order (neighbourhoods, then the picked title, then its neighbours); one that would cover a
 * label already placed steps up or down until it is clear.
 */
function Projector({ tags, els }: { tags: Tag[]; els: React.MutableRefObject<Map<string, HTMLSpanElement>> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  const boxes = useRef(new Map<string, { w: number; h: number }>())
  useFrame(() => {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
    for (const t of tags) {
      const el = els.current.get(t.key)
      if (!el) continue
      v.copy(t.at).project(camera)
      const hidden = v.z > 1
      el.style.visibility = hidden ? 'hidden' : 'visible'
      if (hidden) continue
      const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height
      let b = boxes.current.get(t.key)
      if (!b) {
        const r = (el.firstElementChild ?? el).getBoundingClientRect()
        b = { w: r.width, h: r.height }
        if (b.w) boxes.current.set(t.key, b)
      }
      // Where the label sits around its point: centred for neighbourhoods, to the right for titles.
      const ox = t.kind === 'cluster' ? -b.w / 2 : 10, oy = -b.h / 2
      // Try the point itself, then one step down, one up, two down...; when all are taken, the least covered one.
      const covered = (dy: number) => {
        const y0 = y + oy + dy
        let a = 0
        for (const p of placed) a += Math.max(0, Math.min(x + ox + b.w, p.x1) - Math.max(x + ox, p.x0)) * Math.max(0, Math.min(y0 + b.h, p.y1) - Math.max(y0, p.y0))
        return a
      }
      let dy = 0, least = covered(0)
      for (let k = 1; k <= 12 && least > 0; k++) {
        const step = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (b.h + 3)
        const c = covered(step)
        if (c < least) { least = c; dy = step }
      }
      placed.push({ x0: x + ox, y0: y + oy + dy, x1: x + ox + b.w, y1: y + oy + dy + b.h })
      el.style.transform = `translate(${x}px, ${y + dy}px)`
    }
  })
  return null
}

/** On arrival, fly from the wide view to your part of the galaxy. */
/** Wide screens keep the intro text on the left: things are framed in the middle of the free space to its right. */
const TEXT_W = 600

function FlyTo({ to, spread }: { to: THREE.Vector3 | null; spread?: number }) {
  const { camera, controls, size, gl } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null
    size: { width: number; height: number }; gl: THREE.WebGLRenderer
  }
  const t = useRef(0)
  const from = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; textEnd: number } | null>(null)
  useEffect(() => { t.current = 0; from.current = null }, [to])
  useFrame((_, dt) => {
    if (!to || !controls || t.current >= 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!from.current) {
      // Narrow screens stack the text above the stars: measure where it ends, so the stars below it are the stage.
      const text = document.querySelector('.g-overlay')?.getBoundingClientRect()
      const textEnd = text ? text.bottom - gl.domElement.getBoundingClientRect().top : 0
      from.current = { pos: camera.position.clone(), target: controls.target.clone(), textEnd }
    }
    t.current = Math.min(1, t.current + dt / 2.2)
    const k = 1 - Math.pow(1 - t.current, 3)
    // A picked title is framed so it and all its neighbours fit; your whole area is shown wider.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const d = spread != null ? THREE.MathUtils.clamp((spread * 1.35) / (tan * Math.min(1, camera.aspect)), 2.6, 12) : 7.5
    // Shift by a share of the screen, not a fixed distance, so close up and far away both land in the free space:
    // right of the text on wide screens, below it on narrow ones.
    const wide = size.width >= 900
    // Narrow: a little left of centre, since title names sit to the right of their stars.
    const freeX = wide ? (Math.min(TEXT_W, size.width * 0.45) / 2) / (size.width / 2) : -0.4
    const below = THREE.MathUtils.clamp(from.current.textEnd, 0, size.height * 0.85)
    const freeY = wide ? 0 : (below / 2) / (size.height / 2)
    const aim = to.clone().add(new THREE.Vector3(-freeX * d * tan * camera.aspect, freeY * d * tan, 0))
    const goal = aim.clone().add(new THREE.Vector3(0, 0.19 * d, d))
    camera.position.lerpVectors(from.current.pos, goal, k)
    controls.target.lerpVectors(from.current.target, aim, k)
    controls.update()
  })
  return null
}

function clusterTags(points: Point[], clusters: ClusterMeta[]): Tag[] {
  const sum = new Map<number, [number, number, number, number]>()
  for (const p of points) {
    const s = sum.get(p[4]) ?? [0, 0, 0, 0]
    sum.set(p[4], [s[0] + p[1], s[1] + p[2], s[2] + p[3], s[3] + 1])
  }
  // Largest clusters first; skip any whose centre sits too close to a label already placed, so none overlap.
  const placed: Tag[] = []
  for (const c of [...clusters].sort((a, b) => b.size - a.size)) {
    const s = sum.get(c.id)
    if (!s) continue
    const at = new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3]).multiplyScalar(SCALE)
    if (placed.some((p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) < 2.8)) continue
    placed.push({ key: `c${c.id}`, at, text: c.name ?? c.label, sub: c.examples?.join(' · '), kind: 'cluster', color: `#${clusterColor(c.id).getHexString()}` })
    if (placed.length === 7) break
  }
  return placed
}

export function GalaxyCanvas({ points, clusters, mine, recs, centroid, accent, named, focus, onHover, onPick }: {
  points: Point[]; clusters: ClusterMeta[]; mine: Map<number, number | null>; recs: Set<number>
  centroid: [number, number, number] | null; named: { id: number; label: string }[]
  /** A title you picked, and the titles its fans also love: the camera flies there and lines join them. */
  focus: { id: number; near: number[] } | null
  accent: string; onHover: (id: number | null, e?: { x: number; y: number }) => void; onPick: (id: number) => void
}) {
  const [moving, setMoving] = useState(false)
  const byId = useMemo(() => new Map(points.map((p) => [p[0], p])), [points])
  const top = useMemo(() => [...mine].filter(([, s]) => s != null).sort((a, b) => b[1]! - a[1]!).slice(0, 12).map(([id]) => id), [mine])
  const home = useMemo(() => {
    const f = focus ? at3(byId, focus.id) : null
    return f ?? (centroid ? new THREE.Vector3(...centroid).multiplyScalar(SCALE) : null)
  }, [centroid, focus, byId])
  // How far the picked title's neighbours reach from it, so the camera can fit them all.
  const spread = useMemo(() => {
    const f = focus ? at3(byId, focus.id) : null
    if (!focus || !f) return undefined
    return Math.max(0.8, ...focus.near.map((id) => at3(byId, id)?.distanceTo(f) ?? 0))
  }, [focus, byId])
  const tags = useMemo<Tag[]>(() => [
    ...clusterTags(points, clusters),
    ...named.flatMap((n) => {
      const at = at3(byId, n.id)
      return at ? [{ key: `n${n.id}`, at, text: n.label, kind: 'name' as const, focus: n.id === focus?.id }] : []
    }),
  ], [points, clusters, named, byId, focus])
  const els = useRef(new Map<string, HTMLSpanElement>())
  return (
    <div className="g-3d">
    <Canvas camera={{ position: [0, 1.5, 9], fov: 55, near: 0.1, far: 100 }} dpr={[1, 2]}
      raycaster={{ params: { Points: { threshold: 0.09 } } } as never} gl={{ antialias: false, alpha: true }}
      onPointerMissed={() => onHover(null)}>
      <Stars points={points} mine={mine} recs={recs} accent={accent} onHover={moving ? () => undefined : onHover} onPick={onPick} />
      {centroid && <Glow at={centroid} color={accent} />}
      {focus ? <Spokes byId={byId} focus={focus} /> : <Constellation byId={byId} top={top} />}
      <Projector tags={tags} els={els} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={!home} autoRotateSpeed={0.35}
        minDistance={2.5} maxDistance={22} onStart={() => setMoving(true)} onEnd={() => setMoving(false)} />
      <FlyTo to={home} spread={spread} />
    </Canvas>
    <div className="g-tags" aria-hidden="true">
      {tags.map((t) => (
        <span key={t.key} className={`g-tag${t.focus ? ' is-focus' : ''}`} style={{ visibility: 'hidden' }}
          ref={(el) => { if (el) els.current.set(t.key, el); else els.current.delete(t.key) }}>
          <span className={t.kind === 'cluster' ? 'g-label' : 'g-name'} style={t.color ? { color: t.color } : undefined}>
            {t.text}{t.sub && <small className="g-label-ex">like {t.sub}</small>}
          </span>
        </span>
      ))}
    </div>
    </div>
  )
}
