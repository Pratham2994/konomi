import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type Point = [id: number, x: number, y: number, z: number, cluster: number]
export interface ClusterMeta {
  id: number; label: string; tags: string[]; size: number; name: string; examples: string[]
  /** How many well-known titles live here, and where they sit (older servers send neither). */
  known?: number; at?: [number, number, number] | null
}

const SCALE = 6

export function clusterColor(c: number, n = 24): THREE.Color {
  // Spread hues around the wheel at even lightness so no cluster shouts.
  const h = ((c * 360) / n + 330) % 360
  return new THREE.Color().setHSL(h / 360, 0.55, 0.62)
}

/** The galaxy's own clock: seconds since the stars arrived. Everything in the intro is timed from it. */
interface Clock { t: number; still: boolean }

const vert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aKind;
  attribute float aSeed;
  uniform float uTime;
  uniform float uIntro;
  uniform float uPx;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    bool mine = aKind > 1.5;
    // Intro: the stars swirl out of the core into place, inner ones first.
    float k = clamp((uIntro - 0.15 - aSeed * 0.45 - length(position) * 0.035) / 1.0, 0.0, 1.0);
    k = 1.0 - pow(1.0 - k, 3.0);
    float a = (1.0 - k) * (1.6 + aSeed * 1.2);
    vec3 p = position * (0.06 + 0.94 * k);
    p.xz = vec2(cos(a) * p.x - sin(a) * p.z, sin(a) * p.x + cos(a) * p.z);
    // Your stars wait in place and light up once the map has formed, each with one small flare.
    float lit = clamp((uIntro - 1.2 - aSeed * 0.5) / 0.45, 0.0, 1.0);
    if (mine) { p = position; k = lit; }
    float flare = mine ? sin(lit * 3.14159) * 1.4 : 0.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float pulse = aKind > 0.5 && !mine ? 1.0 + 0.35 * sin(uTime * 2.4 + position.x * 3.0) : 1.0;
    float twinkle = aKind < 0.5 ? 0.78 + 0.22 * sin(uTime * (0.6 + aSeed * 1.8) + aSeed * 60.0) : 1.0;
    // Stars right by the camera would swell into big soft blobs: cap their size and fade them out.
    float px = aSize * pulse * (1.0 + flare) * uPx * (14.0 / -mv.z);
    gl_PointSize = min(px, (mine ? 34.0 : 18.0) * uPx);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = (aSize > 2.5 ? 1.0 : 0.8) * twinkle * k * smoothstep(0.3, 1.4, -mv.z);
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

/** A steady 0-1 number per title, so a star twinkles and arrives the same way on every visit. */
const seedOf = (id: number) => { const h = Math.sin(id * 12.9898) * 43758.5453; return h - Math.floor(h) }

function Stars({ points, mine, recs, accent, clock, onHover, onPick }: {
  points: Point[]; mine: Map<number, number | null>; recs: Set<number>; accent: string; clock: React.RefObject<Clock>
  onHover: (id: number | null, e?: { x: number; y: number }) => void; onPick: (id: number, touch?: { x: number; y: number }) => void
}) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(points.length * 3)
    const col = new Float32Array(points.length * 3)
    const size = new Float32Array(points.length)
    const kind = new Float32Array(points.length)
    const seed = new Float32Array(points.length)
    const acc = new THREE.Color(accent)
    const paper = new THREE.Color('#f4f1ea')
    points.forEach((p, i) => {
      pos.set([p[1] * SCALE, p[2] * SCALE, p[3] * SCALE], i * 3)
      let c = clusterColor(p[4])
      let s = 2.0
      if (mine.has(p[0])) { c = paper; s = 4.2 + Math.max(0, (mine.get(p[0]) ?? 7) - 5) * 0.45; kind[i] = 2 }
      else if (recs.has(p[0])) { c = acc; s = 3.4; kind[i] = 1 }
      col.set([c.r, c.g, c.b], i * 3)
      size[i] = s
      seed[i] = seedOf(p[0])
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [points, mine, recs, accent])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame((_, dt) => {
    if (!mat.current) return
    // Reduced motion: no twinkle or pulse, and the intro is already over.
    if (!clock.current.still) mat.current.uniforms.uTime.value += dt
    mat.current.uniforms.uIntro.value = clock.current.t
  })

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uIntro: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio, 2) } }), [])

  function idx(e: ThreeEvent<PointerEvent | MouseEvent>) {
    return e.index != null ? points[e.index]?.[0] ?? null : null
  }
  // A finger has no hover: a tap shows the title's card instead of leaving the page at once.
  const touch = useRef(false)

  return (
    <points geometry={geo}
      onPointerDown={(e) => { touch.current = e.nativeEvent.pointerType !== 'mouse' }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.pointerType === 'mouse') onHover(idx(e), { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
      }}
      onPointerOut={() => onHover(null)}
      // A drag to turn the galaxy ends with a release over some star: only a still press counts as a click.
      // One click is one title: the pointer hits many overlapping stars, and each would otherwise fire its own
      // click (and push its own page, so Back walked through dozens of titles). The first hit is the nearest star.
      onClick={(e) => {
        e.stopPropagation()
        if (e.delta > 6) return
        const id = idx(e)
        if (id != null) onPick(id, touch.current ? { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : undefined)
      }}>
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
    <sprite ref={ref} position={at.map((v) => v * SCALE) as [number, number, number]} scale={[2.6, 2.6, 1]} raycast={() => null}>
      <spriteMaterial map={tex} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

/** A thin ring around the star under the pointer (or the one tapped), so the card clearly belongs to it. */
function Ring({ at }: { at: THREE.Vector3 | null }) {
  const ref = useRef<THREE.Sprite>(null)
  const born = useRef<number | null>(null)
  useEffect(() => { born.current = null }, [at])
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    g.strokeStyle = '#f4f1ea'
    g.lineWidth = 4
    g.beginPath()
    g.arc(32, 32, 26, 0, Math.PI * 2)
    g.stroke()
    return new THREE.CanvasTexture(c)
  }, [])
  useFrame(({ clock }) => {
    const s = ref.current
    if (!s) return
    if (born.current == null) born.current = clock.elapsedTime
    // Pops open over a fifth of a second.
    const k = 1 - Math.pow(1 - Math.min(1, (clock.elapsedTime - born.current) / 0.2), 3)
    s.scale.setScalar(0.032 * (0.5 + 0.5 * k))
    ;(s.material as THREE.SpriteMaterial).opacity = 0.9 * k
  })
  if (!at) return null
  return (
    <sprite ref={ref} position={at} renderOrder={2} raycast={() => null}>
      <spriteMaterial map={tex} sizeAttenuation={false} transparent depthTest={false} depthWrite={false} opacity={0} />
    </sprite>
  )
}

const at3 = (points: Map<number, Point>, id: number) => {
  const p = points.get(id)
  return p ? new THREE.Vector3(p[1] * SCALE, p[2] * SCALE, p[3] * SCALE) : null
}
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)

/** Your constellation: your best-rated titles joined nearest-first, so every chart draws its own shape. It draws
 * itself once your stars have lit up. */
function Constellation({ byId, top, clock }: { byId: Map<number, Point>; top: number[]; clock: React.RefObject<Clock> }) {
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
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.45, depthWrite: false }))
    l.frustumCulled = false
    return { l, path }
  }, [byId, top])
  useEffect(() => () => { line?.l.geometry.dispose() }, [line])
  const start = useRef<number | null>(null)
  const done = useRef(false)
  useEffect(() => { start.current = null; done.current = false }, [line])
  useFrame(() => {
    if (!line || done.current) return
    const t = clock.current.t
    if (start.current == null) start.current = Math.max(t + 0.15, 1.7)
    const k = clock.current.still ? 1 : easeOut(THREE.MathUtils.clamp((t - start.current) / 1.1, 0, 1))
    // Points past the pen's tip wait on the tip, so the line grows from your best title to the last.
    const { path } = line
    const f = k * (path.length - 1), i0 = Math.min(Math.floor(f), path.length - 2)
    const tip = path[i0].clone().lerp(path[i0 + 1], f - i0)
    const attr = line.l.geometry.getAttribute('position') as THREE.BufferAttribute
    path.forEach((v, i) => { const p = i <= i0 ? v : tip; attr.setXYZ(i, p.x, p.y, p.z) })
    attr.needsUpdate = true
    if (k >= 1) done.current = true
  })
  return line ? <primitive object={line.l} /> : null
}

/** Lines from a picked title to the titles its fans also love. They grow outwards as the camera arrives. */
function Spokes({ byId, focus, color, clock }: {
  byId: Map<number, Point>; focus: { id: number; near: number[] } | null; color: string; clock: React.RefObject<Clock>
}) {
  const lines = useMemo(() => {
    if (!focus) return null
    const from = at3(byId, focus.id)
    if (!from) return null
    const ends = focus.near.map((id) => at3(byId, id)).filter((v): v is THREE.Vector3 => v != null)
    const g = new THREE.BufferGeometry().setFromPoints(ends.flatMap(() => [from, from]))
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }))
    l.frustumCulled = false
    return { l, from, ends }
  }, [byId, focus, color])
  useEffect(() => () => { lines?.l.geometry.dispose() }, [lines])
  const start = useRef<number | null>(null)
  const done = useRef(false)
  useEffect(() => { start.current = null; done.current = false }, [lines])
  useFrame(() => {
    if (!lines || done.current) return
    const t = clock.current.t
    if (start.current == null) start.current = t + 0.45
    const k = clock.current.still ? 1 : easeOut(THREE.MathUtils.clamp((t - start.current) / 0.8, 0, 1))
    const attr = lines.l.geometry.getAttribute('position') as THREE.BufferAttribute
    lines.ends.forEach((v, i) => {
      const p = lines.from.clone().lerp(v, k)
      attr.setXYZ(i * 2 + 1, p.x, p.y, p.z)
    })
    attr.needsUpdate = true
    if (k >= 1) done.current = true
  })
  return lines ? <primitive object={lines.l} /> : null
}

/** A label pinned to a point in space, drawn as plain HTML over the canvas. */
interface Tag {
  key: string; at: THREE.Vector3; text: string; kind: 'cluster' | 'name'; color?: string; sub?: string; focus?: boolean
  /** How many of your titles sit in this neighbourhood. */
  n?: number
  /** Seconds before it fades in, so labels arrive after the stars, one by one. */
  delay: number
}

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
        // Layout size, not the on-screen box: labels fade in from a slightly smaller scale.
        const r = (el.firstElementChild ?? el) as HTMLElement
        b = { w: r.offsetWidth, h: r.offsetHeight }
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

/** Wide screens keep the intro text on the left: things are framed in the middle of the free space to its right. */
const TEXT_W = 600

/**
 * Flies the camera to your part of the galaxy, or to a picked title. It waits for the stars to form, eases in and
 * out, and pulls back a little on a long hop so you see where you are going. Turning the galaxy yourself ends it.
 */
function FlyTo({ to, spread, clock, held }: {
  to: THREE.Vector3 | null; spread?: number; clock: React.RefObject<Clock>; held: React.RefObject<boolean>
}) {
  const { camera, controls, size, gl } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null
    size: { width: number; height: number }; gl: THREE.WebGLRenderer
  }
  const t = useRef(0)
  const from = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; textEnd: number; dur: number; lift: number; soft: boolean } | null>(null)
  const back = useMemo(() => new THREE.Vector3(), [])
  const soft = useRef(false)
  useEffect(() => {
    // A new pick mid-flight carries on from the moving camera: no stop and start again.
    soft.current = t.current > 0 && t.current < 1
    t.current = 0
    from.current = null
    held.current = false
  }, [to, held])
  useFrame((_, dt) => {
    if (!to || !controls || t.current >= 1) return
    if (held.current) { t.current = 1; return }
    if (!clock.current.still && clock.current.t < 0.7) return
    // A picked title is framed so it and all its neighbours fit; your whole area is shown wider.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const d = spread != null ? THREE.MathUtils.clamp((spread * 1.35) / (tan * Math.min(1, camera.aspect)), 2.6, 12) : 7.5
    // Shift by a share of the screen, not a fixed distance, so close up and far away both land in the free space:
    // right of the text on wide screens, below it on narrow ones.
    const wide = size.width >= 900
    if (!from.current) {
      // Narrow screens stack the text above the stars: measure where it ends, so the stars below it are the stage.
      const text = document.querySelector('.g-overlay')?.getBoundingClientRect()
      const textEnd = text ? text.bottom - gl.domElement.getBoundingClientRect().top : 0
      from.current = { pos: camera.position.clone(), target: controls.target.clone(), textEnd, dur: 1.6, lift: 0, soft: soft.current }
    }
    const f = from.current
    // Narrow: a little left of centre, since title names sit to the right of their stars.
    const freeX = wide ? (Math.min(TEXT_W, size.width * 0.45) / 2) / (size.width / 2) : -0.4
    const below = THREE.MathUtils.clamp(f.textEnd, 0, size.height * 0.85)
    const freeY = wide ? 0 : (below / 2) / (size.height / 2)
    const aim = to.clone().add(new THREE.Vector3(-freeX * d * tan * camera.aspect, freeY * d * tan, 0))
    const goal = aim.clone().add(new THREE.Vector3(0, 0.19 * d, d))
    if (t.current === 0) {
      // Long hops take a little longer and swing out a little further; short ones stay quick.
      const far = f.pos.distanceTo(goal) + f.target.distanceTo(aim) * 0.5
      f.dur = THREE.MathUtils.clamp(1.0 + far * 0.09, 1.2, 2.2)
      f.lift = Math.min(far * 0.22, 3)
    }
    t.current = clock.current.still ? 1 : Math.min(1, t.current + dt / f.dur)
    const x = t.current
    const k = f.soft ? easeOut(x) : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
    camera.position.lerpVectors(f.pos, goal, k)
    controls.target.lerpVectors(f.target, aim, k)
    if (f.lift) camera.position.addScaledVector(back.subVectors(camera.position, controls.target).normalize(), Math.sin(Math.PI * k) * f.lift)
    controls.update()
  })
  return null
}

/** Advances the galaxy's clock. A slow first frame (the shader compiling) must not skip the intro. */
function Tick({ clock }: { clock: React.RefObject<Clock> }) {
  useFrame((_, dt) => { clock.current.t += Math.min(dt, 1 / 30) })
  return null
}

function clusterTags(points: Point[], clusters: ClusterMeta[], mine: Map<number, number | null>, wait: number): Tag[] {
  const sum = new Map<number, [number, number, number, number]>()
  const yours = new Map<number, number>()
  for (const p of points) {
    const s = sum.get(p[4]) ?? [0, 0, 0, 0]
    sum.set(p[4], [s[0] + p[1], s[1] + p[2], s[2] + p[3], s[3] + 1])
    if (mine.has(p[0])) yours.set(p[4], (yours.get(p[4]) ?? 0) + 1)
  }
  // The neighbourhoods you watch in come first, then the ones the best-known shows live in. The big drifts of
  // little-rated titles are never labelled. (Older servers send no counts: largest first, as before.)
  const mineIn = (c: ClusterMeta) => ((yours.get(c.id) ?? 0) >= 2 ? yours.get(c.id)! : 0)
  const fame = (c: ClusterMeta) => c.known ?? c.size
  const order = clusters.filter((c) => c.known == null || c.known > 0).sort((a, b) => mineIn(b) - mineIn(a) || fame(b) - fame(a))
  // Skip any whose centre sits too close to a label already placed, so none overlap. Phones get fewer.
  const most = window.innerWidth < 640 ? 5 : 7
  const placed: Tag[] = []
  for (const c of order) {
    const s = sum.get(c.id)
    if (!s) continue
    const at = (c.at ? new THREE.Vector3(...c.at) : new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3])).multiplyScalar(SCALE)
    if (placed.some((p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) < 2.3)) continue
    placed.push({
      key: `c${c.id}`, at, text: c.name ?? c.label, sub: c.examples?.join(' · '), kind: 'cluster', n: yours.get(c.id),
      color: `#${clusterColor(c.id).getHexString()}`, delay: wait + placed.length * 0.08,
    })
    if (placed.length === most) break
  }
  return placed
}

export function GalaxyCanvas({ points, clusters, mine, recs, centroid, accent, named, focus, marked, onHover, onPick, onMiss, onNudge }: {
  points: Point[]; clusters: ClusterMeta[]; mine: Map<number, number | null>; recs: Set<number>
  centroid: [number, number, number] | null; named: { id: number; label: string }[]
  /** A title you picked, and the titles its fans also love: the camera flies there and lines join them. */
  focus: { id: number; near: number[] } | null
  /** The star the card is showing: it gets a ring. */
  marked: number | null
  accent: string; onHover: (id: number | null, e?: { x: number; y: number }) => void
  /** A click opens a title; a tap (touch) passes where it landed, to show the title's card there. */
  onPick: (id: number, touch?: { x: number; y: number }) => void
  /** A press on empty sky. */
  onMiss: () => void
  /** A plain scroll over the galaxy, which scrolls the page: the hint says how to zoom. */
  onNudge: () => void
}) {
  const [moving, setMoving] = useState(false)
  const still = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const clock = useRef<Clock>({ t: still ? 99 : 0, still })
  // Set once you turn or zoom the galaxy yourself, so a flight in progress gives way.
  const held = useRef(false)
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
  const ring = useMemo(() => (marked != null ? at3(byId, marked) : null), [marked, byId])
  const tags = useMemo<Tag[]>(() => {
    // Labels arrive once the stars have formed; later changes (a new pick) bring theirs in quickly.
    const wait = (s: number) => (clock.current.still ? 0 : Math.max(0, s - clock.current.t))
    const names = named.flatMap((n, i) => {
      const at = at3(byId, n.id)
      return at ? [{ key: `n${n.id}`, at, text: n.label, kind: 'name' as const, focus: n.id === focus?.id, delay: (focus ? 0.5 : wait(2.1)) + i * 0.07 }] : []
    })
    const hoods = clusterTags(points, clusters, mine, wait(1.6))
    // With a title picked its names are placed first, so they keep their spots and the neighbourhoods move aside.
    return focus ? [...names, ...hoods] : [...hoods, ...names]
  }, [points, clusters, mine, named, byId, focus])
  const els = useRef(new Map<string, HTMLSpanElement>())

  // The page keeps scrolling over the galaxy: a plain wheel scrolls, pinch or Ctrl/Cmd + wheel zooms. A press that
  // travels (a drag, a two-finger move) takes the camera over from a flight.
  const box = useRef<HTMLDivElement>(null)
  const nudge = useRef(onNudge)
  const miss = useRef(onMiss)
  useEffect(() => { nudge.current = onNudge; miss.current = onMiss }, [onNudge, onMiss])
  // Stop drawing while the galaxy is scrolled out of view: phones keep their battery and frame rate for the page.
  const [seen, setSeen] = useState(true)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let down: { x: number; y: number } | null = null
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { held.current = true; return }
      e.stopPropagation()
      nudge.current()
    }
    const press = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    // A drag also puts away a tapped title's card: the star moves, the card would not.
    const move = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 10) return
      held.current = true
      down = null
      miss.current()
    }
    const lift = () => { down = null }
    el.addEventListener('wheel', wheel, { capture: true, passive: true })
    el.addEventListener('pointerdown', press, { capture: true, passive: true })
    el.addEventListener('pointermove', move, { capture: true, passive: true })
    el.addEventListener('pointerup', lift, { capture: true, passive: true })
    el.addEventListener('pointercancel', lift, { capture: true, passive: true })
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting))
    io.observe(el)
    return () => {
      el.removeEventListener('wheel', wheel, { capture: true })
      el.removeEventListener('pointerdown', press, { capture: true })
      el.removeEventListener('pointermove', move, { capture: true })
      el.removeEventListener('pointerup', lift, { capture: true })
      el.removeEventListener('pointercancel', lift, { capture: true })
      io.disconnect()
    }
  }, [])

  return (
    <div className="g-3d" ref={box}>
    <Canvas camera={{ position: [0, 1.5, 9], fov: 55, near: 0.1, far: 100 }} dpr={[1, 2]} frameloop={seen ? 'always' : 'never'}
      raycaster={{ params: { Points: { threshold: 0.09 } } } as never} gl={{ antialias: false, alpha: true }}
      onPointerMissed={() => { onHover(null); onMiss() }}>
      <Tick clock={clock} />
      <Stars points={points} mine={mine} recs={recs} accent={accent} clock={clock} onHover={moving ? () => undefined : onHover} onPick={onPick} />
      {centroid && <Glow at={centroid} color={accent} />}
      {focus ? <Spokes byId={byId} focus={focus} color={accent} clock={clock} /> : <Constellation byId={byId} top={top} clock={clock} />}
      <Ring at={ring} />
      <Projector tags={tags} els={els} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={!home && !still} autoRotateSpeed={0.35}
        minDistance={2.5} maxDistance={22} onStart={() => setMoving(true)} onEnd={() => setMoving(false)} />
      <FlyTo to={home} spread={spread} clock={clock} held={held} />
    </Canvas>
    <div className={`g-tags${focus ? ' is-focused' : ''}`} aria-hidden="true">
      {tags.map((t) => (
        <span key={t.key} className={`g-tag g-tag-${t.kind}${t.focus ? ' is-focus' : ''}`} style={{ visibility: 'hidden' }}
          ref={(el) => { if (el) els.current.set(t.key, el); else els.current.delete(t.key) }}>
          <span className={t.kind === 'cluster' ? 'g-label' : 'g-name'} style={{ color: t.color, animationDelay: `${t.delay}s` }}>
            {t.text}{t.n ? <b className="g-label-n">{t.n}</b> : null}
            {t.sub && <small className="g-label-ex">like {t.sub}</small>}
          </span>
        </span>
      ))}
    </div>
    </div>
  )
}
