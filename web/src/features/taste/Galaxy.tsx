import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export type Point = [id: number, x: number, y: number, z: number, cluster: number]
export interface ClusterMeta { id: number; label: string; tags: string[]; size: number }

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
    gl_PointSize = aSize * pulse * uPx * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aSize > 2.5 ? 1.0 : 0.55;
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
      let s = 1.6
      if (mine.has(p[0])) { c = paper; s = 3.2 + ((mine.get(p[0]) ?? 7) - 5) * 0.35 }
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
      onClick={(e) => { const id = idx(e); if (id != null) onPick(id) }}>
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

export function GalaxyCanvas({ points, mine, recs, centroid, accent, onHover, onPick }: {
  points: Point[]; mine: Map<number, number | null>; recs: Set<number>; centroid: [number, number, number] | null
  accent: string; onHover: (id: number | null, e?: { x: number; y: number }) => void; onPick: (id: number) => void
}) {
  const [moving, setMoving] = useState(false)
  const target = centroid ? (centroid.map((v) => v * SCALE * 0.5) as [number, number, number]) : [0, 0, 0] as [number, number, number]
  return (
    <Canvas camera={{ position: [0, 2, 12], fov: 55, near: 0.1, far: 100 }} dpr={[1, 2]}
      raycaster={{ params: { Points: { threshold: 0.09 } } } as never} gl={{ antialias: false, alpha: true }}
      onPointerMissed={() => onHover(null)}>
      <Stars points={points} mine={mine} recs={recs} accent={accent} onHover={moving ? () => undefined : onHover} onPick={onPick} />
      {centroid && <Glow at={centroid} color={accent} />}
      <OrbitControls enableDamping dampingFactor={0.08} autoRotate autoRotateSpeed={0.35} target={target}
        minDistance={2.5} maxDistance={22} onStart={() => setMoving(true)} onEnd={() => setMoving(false)} />
    </Canvas>
  )
}
