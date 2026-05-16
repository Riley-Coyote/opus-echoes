/**
 * VoiceOrb — audio-reactive 12-shape morphing particle visualizer.
 * ────────────────────────────────────────────────────────────────
 * Self-contained React + TypeScript + Canvas2D + Web Audio. No deps
 * (no three.js, no tailwind required). Drop this single file into a
 * Lovable / Vite / Next project and render <VoiceOrb/>.
 *
 * Ported from the "ExpressiveField" voice-mode visualizer (vanilla
 * canvas engine). The original faked its amplitude from UI state;
 * THIS version drives the particles from REAL audio via a Web Audio
 * AnalyserNode (mic, a MediaStream, an <audio> element, or your own
 * AnalyserNode). With no audio source it falls back to the original
 * state-driven simulation so it still looks alive.
 *
 * ── Quick use ───────────────────────────────────────────────────
 *   // React to the user's microphone:
 *   <VoiceOrb audioSource="mic" state="listening" />
 *
 *   // React to a voice agent's TTS <audio> output:
 *   <VoiceOrb audioSource={agentAudioElRef.current} state="speaking" />
 *
 *   // React to a WebRTC / realtime MediaStream:
 *   <VoiceOrb audioSource={remoteStream} state="speaking" />
 *
 *   // No audio — animated idle/thinking visual:
 *   <VoiceOrb state="thinking" />
 *
 * ── Paste-to-Lovable prompt ─────────────────────────────────────
 *   "Add this VoiceOrb.tsx component to the classic chat screen.
 *    When the user is recording, mount <VoiceOrb audioSource='mic'
 *    state='listening' />. When the voice agent is speaking, pass
 *    the agent's playback <audio> element (or its MediaStream) as
 *    audioSource and set state='speaking'. While the agent is
 *    generating, set state='thinking'. Otherwise state='idle'.
 *    Render it centered behind/above the message area."
 *
 * Notes
 *  - AudioContext needs a user gesture to start (browser autoplay
 *    policy). Mounting this from a click/tap (e.g. the mic button)
 *    is enough; it also calls resume() on first interaction.
 *  - createMediaElementSource() can only be called ONCE per <audio>
 *    element and reroutes its audio through Web Audio. This handles
 *    that and reconnects to the speakers. If your element is already
 *    routed, pass an AnalyserNode you built instead.
 *  - particleCount default 30000 (faithful). Drop to ~14000 for
 *    low-end devices.
 */

import { useEffect, useRef } from 'react'

// ════════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════════

export type VoiceOrbState = 'idle' | 'listening' | 'speaking' | 'thinking'

export type VoiceOrbAudioSource =
  | 'mic'
  | MediaStream
  | HTMLAudioElement
  | HTMLVideoElement
  | AnalyserNode
  | null
  | undefined

export interface VoiceOrbProps {
  /** Drives baseline brightness/rotation + auto shape-morphing on 'thinking'. */
  state?: VoiceOrbState
  /** Real audio to react to. Omit for the simulated (state-driven) look. */
  audioSource?: VoiceOrbAudioSource
  /** 0..11 to lock a shape; omit/undefined to let it morph freely. */
  shape?: number
  /** Particle count. Default 30000. Lower = faster. */
  particleCount?: number
  /** Multiplier on detected loudness. Default 1. */
  sensitivity?: number
  /** Faint radial aura behind the orb that pulses with the level. Default true. */
  aura?: boolean
  /** Pause the animation loop. */
  paused?: boolean
  /** Called each frame with the smoothed 0..1 level (handy for other UI). */
  onLevel?: (level: number) => void
  className?: string
  style?: React.CSSProperties
}

// ════════════════════════════════════════════════════════════════
// Audio level meter — turns any source into a 0..1 loudness function
// ════════════════════════════════════════════════════════════════

class AudioLevelMeter {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buf: Uint8Array | null = null
  private micStream: MediaStream | null = null
  private ownsCtx = false
  private disposed = false
  sensitivity = 1

  async attach(source: VoiceOrbAudioSource): Promise<void> {
    if (!source) return
    try {
      // Caller supplied their own AnalyserNode — just read it.
      if (source instanceof AnalyserNode) {
        this.analyser = source
        this.buf = new Uint8Array(source.fftSize)
        return
      }

      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.ownsCtx = true
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.6
      this.analyser = analyser
      this.buf = new Uint8Array(analyser.fftSize)

      let node: AudioNode
      if (source === 'mic') {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        node = this.ctx.createMediaStreamSource(this.micStream)
        node.connect(analyser) // mic: analyser only, never to speakers (no echo)
      } else if (source instanceof MediaStream) {
        node = this.ctx.createMediaStreamSource(source)
        node.connect(analyser)
      } else {
        // HTMLAudioElement / HTMLVideoElement — tap playback, keep sound audible.
        node = this.ctx.createMediaElementSource(source)
        node.connect(analyser)
        analyser.connect(this.ctx.destination)
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {})
      }
    } catch (err) {
      console.warn('[VoiceOrb] audio attach failed, falling back to simulated:', err)
      this.dispose()
    }
  }

  /** 0..1 loudness (time-domain RMS), or null if no live source. */
  getLevel(): number | null {
    if (this.disposed || !this.analyser || !this.buf) return null
    try {
      this.analyser.getByteTimeDomainData(this.buf as Uint8Array<ArrayBuffer>)
      let sum = 0
      for (let i = 0; i < this.buf.length; i++) {
        const x = (this.buf[i] - 128) / 128
        sum += x * x
      }
      const rms = Math.sqrt(sum / this.buf.length)
      // Speech RMS sits ~0.02–0.30; map into a lively 0..1 range.
      const level = rms * 3.0 * this.sensitivity
      return level < 0 ? 0 : level > 1 ? 1 : level
    } catch {
      return null
    }
  }

  dispose(): void {
    this.disposed = true
    try {
      if (this.micStream) {
        this.micStream.getTracks().forEach((t) => t.stop())
        this.micStream = null
      }
      if (this.ownsCtx && this.ctx) {
        this.ctx.close().catch(() => {})
      }
    } catch {
      /* noop */
    }
    this.ctx = null
    this.analyser = null
    this.buf = null
  }
}

// ════════════════════════════════════════════════════════════════
// ExpressiveField engine — faithful port of the canvas particle system
// ════════════════════════════════════════════════════════════════

const SHAPE_COUNT = 12

const BANDS = [
  { l: 2, m: 0, freq: 1.8, phase: 0.0, weight: 0.14 },
  { l: 3, m: 2, freq: 4.7, phase: 1.3, weight: 0.1 },
  { l: 4, m: 1, freq: 7.3, phase: 2.7, weight: 0.08 },
  { l: 5, m: 3, freq: 11.2, phase: 0.8, weight: 0.06 },
  { l: 6, m: 4, freq: 14.1, phase: 2.1, weight: 0.05 },
]

function gaussRandom(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

type ShapeGen = (N: number) => Float32Array

const genSphere: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const theta = 2 * Math.PI * Math.random()
    const phi = Math.acos(2 * Math.random() - 1)
    arr[i * 3] = Math.sin(phi) * Math.cos(theta)
    arr[i * 3 + 1] = Math.cos(phi)
    arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta)
  }
  return arr
}

const genCube: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const s = 0.78
  for (let i = 0; i < N; i++) {
    const face = i % 6
    const u = (Math.random() * 2 - 1) * s
    const v = (Math.random() * 2 - 1) * s
    let x = 0
    let y = 0
    let z = 0
    switch (face) {
      case 0: x = s; y = u; z = v; break
      case 1: x = -s; y = u; z = v; break
      case 2: x = u; y = s; z = v; break
      case 3: x = u; y = -s; z = v; break
      case 4: x = u; y = v; z = s; break
      default: x = u; y = v; z = -s; break
    }
    arr[i * 3] = x
    arr[i * 3 + 1] = y
    arr[i * 3 + 2] = z
  }
  return arr
}

const genOctahedron: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const x = gaussRandom()
    const y = gaussRandom()
    const z = gaussRandom()
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) + 0.0001
    const s = 1.15
    arr[i * 3] = (x / l1) * s
    arr[i * 3 + 1] = (y / l1) * s
    arr[i * 3 + 2] = (z / l1) * s
  }
  return arr
}

const genHexPrism: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const R = 0.82
  const HP = 0.82
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    if (r < 0.15 || r < 0.3) {
      const yTop = r < 0.15 ? HP : -HP
      const face = Math.floor(Math.random() * 6)
      const a1 = (face * Math.PI) / 3
      const a2 = ((face + 1) * Math.PI) / 3
      let uu = Math.random()
      let vv = Math.random()
      if (uu + vv > 1) {
        uu = 1 - uu
        vv = 1 - vv
      }
      arr[i * 3] = uu * Math.cos(a1) * R + vv * Math.cos(a2) * R
      arr[i * 3 + 1] = yTop
      arr[i * 3 + 2] = uu * Math.sin(a1) * R + vv * Math.sin(a2) * R
    } else {
      const face = Math.floor(Math.random() * 6)
      const a1 = (face * Math.PI) / 3
      const a2 = ((face + 1) * Math.PI) / 3
      const t = Math.random()
      arr[i * 3] = Math.cos(a1) * R * (1 - t) + Math.cos(a2) * R * t
      arr[i * 3 + 1] = (Math.random() * 2 - 1) * HP
      arr[i * 3 + 2] = Math.sin(a1) * R * (1 - t) + Math.sin(a2) * R * t
    }
  }
  return arr
}

const genTorus: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const Rm = 0.7
  const rm = 0.3
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2
    const v = Math.random() * Math.PI * 2
    arr[i * 3] = (Rm + rm * Math.cos(v)) * Math.cos(u)
    arr[i * 3 + 1] = rm * Math.sin(v)
    arr[i * 3 + 2] = (Rm + rm * Math.cos(v)) * Math.sin(u)
  }
  return arr
}

const genBlob: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  for (let i = 0; i < N; i++) {
    const theta = 2 * Math.PI * Math.random()
    const phi = Math.acos(2 * Math.random() - 1)
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)
    const d =
      1 +
      Math.sin(x * 2.7 + y * 1.9) * 0.28 +
      Math.sin(y * 3.4 - z * 1.6) * 0.22 +
      Math.sin(z * 2.2 + x * 2.8) * 0.18 +
      Math.sin((x + y + z) * 3.1) * 0.12
    arr[i * 3] = x * d
    arr[i * 3 + 1] = y * d
    arr[i * 3 + 2] = z * d
  }
  return arr
}

const genKlein: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const R = 1.2
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 * Math.PI
    const v = Math.random() * 2 * Math.PI
    const cosU2 = Math.cos(u / 2)
    const sinU2 = Math.sin(u / 2)
    const sinV = Math.sin(v)
    const sin2V = Math.sin(2 * v)
    const factor = R + cosU2 * sinV - sinU2 * sin2V
    arr[i * 3] = factor * Math.cos(u) * 0.48
    arr[i * 3 + 1] = (sinU2 * sinV + cosU2 * sin2V) * 0.48
    arr[i * 3 + 2] = factor * Math.sin(u) * 0.48
  }
  return arr
}

const genDoubleHelix: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const turns = 3
  const maxT = turns * 2 * Math.PI
  const rad = 0.55
  const height = 1.8
  for (let i = 0; i < N; i++) {
    if (Math.random() < 0.88) {
      const strand = Math.floor(Math.random() * 2)
      const t = Math.random() * maxT
      const y = (t / maxT - 0.5) * height
      const angle = t + strand * Math.PI
      arr[i * 3] = rad * Math.cos(angle)
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = rad * Math.sin(angle)
    } else {
      const rungCount = 16
      const rung = Math.floor(Math.random() * rungCount)
      const tRung = (rung / rungCount) * maxT
      const t = Math.random()
      const y = (tRung / maxT - 0.5) * height
      const a1 = tRung
      const a2 = tRung + Math.PI
      const x1 = rad * Math.cos(a1)
      const z1 = rad * Math.sin(a1)
      const x2 = rad * Math.cos(a2)
      const z2 = rad * Math.sin(a2)
      arr[i * 3] = x1 + (x2 - x1) * t
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z1 + (z2 - z1) * t
    }
  }
  return arr
}

const genLorenz: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const sigma = 10
  const rho = 28
  const beta = 8 / 3
  let x = 0.1
  let y = 0
  let z = 0
  const dt = 0.005
  for (let i = 0; i < 3000; i++) {
    const dx = sigma * (y - x)
    const dy = x * (rho - z) - y
    const dz = x * y - beta * z
    x += dx * dt
    y += dy * dt
    z += dz * dt
  }
  const pts = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 3; j++) {
      const dx = sigma * (y - x)
      const dy = x * (rho - z) - y
      const dz = x * y - beta * z
      x += dx * dt
      y += dy * dt
      z += dz * dt
    }
    pts[i * 3] = x
    pts[i * 3 + 1] = y
    pts[i * 3 + 2] = z
  }
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  let zMin = Infinity
  let zMax = -Infinity
  for (let i = 0; i < N; i++) {
    xMin = Math.min(xMin, pts[i * 3])
    xMax = Math.max(xMax, pts[i * 3])
    yMin = Math.min(yMin, pts[i * 3 + 1])
    yMax = Math.max(yMax, pts[i * 3 + 1])
    zMin = Math.min(zMin, pts[i * 3 + 2])
    zMax = Math.max(zMax, pts[i * 3 + 2])
  }
  const ccx = (xMin + xMax) / 2
  const ccy = (yMin + yMax) / 2
  const ccz = (zMin + zMax) / 2
  const s = 1.9 / Math.max(xMax - xMin, yMax - yMin, zMax - zMin)
  for (let i = 0; i < N; i++) {
    arr[i * 3] = (pts[i * 3] - ccx) * s
    arr[i * 3 + 1] = (pts[i * 3 + 1] - ccy) * s
    arr[i * 3 + 2] = (pts[i * 3 + 2] - ccz) * s
  }
  return arr
}

const genManifold: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const ringR = 0.9
  const thickness = 0.035
  for (let i = 0; i < N; i++) {
    const ring = i % 3
    const u = Math.random() * 2 * Math.PI
    let x = 0
    let y = 0
    let z = 0
    if (ring === 0) {
      x = ringR * Math.cos(u)
      y = ringR * Math.sin(u)
    } else if (ring === 1) {
      y = ringR * Math.cos(u)
      z = ringR * Math.sin(u)
    } else {
      x = ringR * Math.cos(u)
      z = ringR * Math.sin(u)
    }
    arr[i * 3] = x + (Math.random() - 0.5) * thickness
    arr[i * 3 + 1] = y + (Math.random() - 0.5) * thickness
    arr[i * 3 + 2] = z + (Math.random() - 0.5) * thickness
  }
  return arr
}

const genEcho: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const radii = [0.38, 0.68, 0.98]
  const weights = [0.15, 0.3, 0.55]
  for (let i = 0; i < N; i++) {
    const r = Math.random()
    let shellIdx = 0
    let cum = 0
    for (let s = 0; s < 3; s++) {
      cum += weights[s]
      if (r < cum) {
        shellIdx = s
        break
      }
    }
    const rad = radii[shellIdx]
    const theta = 2 * Math.PI * Math.random()
    const phi = Math.acos(2 * Math.random() - 1)
    arr[i * 3] = rad * Math.sin(phi) * Math.cos(theta)
    arr[i * 3 + 1] = rad * Math.cos(phi)
    arr[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta)
  }
  return arr
}

const genMobius: ShapeGen = (N) => {
  const arr = new Float32Array(3 * N)
  const R = 0.9
  const width = 0.35
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 * Math.PI
    const v = (Math.random() * 2 - 1) * width
    const x = (R + v * Math.cos(u / 2)) * Math.cos(u)
    const y = (R + v * Math.cos(u / 2)) * Math.sin(u)
    const z = v * Math.sin(u / 2)
    arr[i * 3] = x * 0.95
    arr[i * 3 + 1] = z * 0.95
    arr[i * 3 + 2] = y * 0.95
  }
  return arr
}

const SHAPE_GENERATORS: ShapeGen[] = [
  genSphere, genCube, genOctahedron, genHexPrism, genTorus, genBlob,
  genKlein, genDoubleHelix, genLorenz, genManifold, genEcho, genMobius,
]

interface EngineOptions {
  particleCount: number
  /** Returns 0..1 live loudness, or null to use the simulated fallback. */
  levelProvider: () => number | null
  onLevel?: (level: number) => void
}

class ExpressiveFieldEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private container: HTMLElement
  private dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  private N: number
  private opts: EngineOptions

  private W = 0
  private H = 0
  private pw = 0
  private ph = 0
  private imgData: ImageData | null = null
  private pix: Uint8ClampedArray | null = null
  private pix32: Uint32Array | null = null

  private HOMES: Float32Array[] = []
  private SX_CUR!: Float32Array
  private SY_CUR!: Float32Array
  private VX!: Float32Array
  private VY!: Float32Array
  private PH!: Float32Array
  private DLAYER!: Float32Array
  private WM!: Float32Array
  private EXC!: Float32Array
  private PFREQ!: Float32Array
  private THETA_S!: Float32Array
  private PHI_S!: Float32Array
  private HARMONICS!: Float32Array[]

  private currentShape = 0
  private targetShape = 0
  private morphStart = 0
  private readonly morphDuration = 2.8
  private nextMorphTime = 5
  private manualShape: number | null = null
  private currentHomes: Float32Array | null = null

  private focusX = 0
  private focusY = 0
  private focusZ = 0
  private focusVX = 0
  private focusVY = 0
  private focusVZ = 0

  private readonly MAX_RIPPLES = 6
  private RIPPLES = new Float32Array(6 * 6)
  private activeRipples = 0
  private contagion = 0

  private state: VoiceOrbState = 'idle'
  private prevState: VoiceOrbState = 'idle'
  private time = 0
  private lastFrameTime = 0
  private amp = 0
  private tAmp = 0

  private rafId: number | null = null
  private paused = false

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, opts: EngineOptions) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('VoiceOrb: 2D context unavailable')
    this.ctx = ctx
    this.container = container
    this.N = Math.max(2000, Math.floor(opts.particleCount))
    this.opts = opts
    this.resize()
    this.initParticles()
    this.lastFrameTime = performance.now()
    this.rafId = requestAnimationFrame(this.render)
  }

  resize = (): void => {
    const r = this.container.getBoundingClientRect()
    this.W = r.width
    this.H = r.height
    if (this.W === 0 || this.H === 0) return
    this.pw = Math.round(this.W * this.dpr)
    this.ph = Math.round(this.H * this.dpr)
    this.canvas.width = this.pw
    this.canvas.height = this.ph
    this.imgData = this.ctx.createImageData(this.pw, this.ph)
    this.pix = this.imgData.data
    this.pix32 = new Uint32Array(this.imgData.data.buffer)
  }

  private initParticles(): void {
    const N = this.N
    this.HOMES = SHAPE_GENERATORS.map((fn) => fn(N))
    this.SX_CUR = new Float32Array(N)
    this.SY_CUR = new Float32Array(N)
    this.VX = new Float32Array(N)
    this.VY = new Float32Array(N)
    this.PH = new Float32Array(N)
    this.DLAYER = new Float32Array(N)
    this.WM = new Float32Array(N)
    this.EXC = new Float32Array(N)
    this.PFREQ = new Float32Array(N)
    this.THETA_S = new Float32Array(N)
    this.PHI_S = new Float32Array(N)
    this.HARMONICS = BANDS.map(() => new Float32Array(N))

    for (let i = 0; i < N; i++) {
      const sx = this.HOMES[0][i * 3]
      const sy = this.HOMES[0][i * 3 + 1]
      const sz = this.HOMES[0][i * 3 + 2]
      this.THETA_S[i] = Math.atan2(sz, sx)
      this.PHI_S[i] = Math.acos(Math.max(-1, Math.min(1, sy)))
      this.PH[i] = Math.random() * Math.PI * 2
      this.DLAYER[i] = Math.random()
      this.WM[i] = Math.random() * 0.4
      this.EXC[i] = 0
      this.PFREQ[i] = 0.8 + Math.random() * 0.4
      this.SX_CUR[i] = this.W / 2
      this.SY_CUR[i] = this.H / 2
      for (let b = 0; b < BANDS.length; b++) {
        this.HARMONICS[b][i] =
          Math.sin(BANDS[b].l * this.PHI_S[i]) * Math.cos(BANDS[b].m * this.THETA_S[i])
      }
    }
  }

  private updateMorph(elapsed: number, justEntered: boolean): number {
    if (justEntered) {
      this.morphStart = elapsed - this.morphDuration
      this.nextMorphTime = elapsed + 4
    }
    const progress = (elapsed - this.morphStart) / this.morphDuration
    if (progress >= 1 && elapsed >= this.nextMorphTime && this.manualShape === null) {
      this.currentShape = this.targetShape
      this.targetShape = (this.targetShape + 1) % SHAPE_COUNT
      this.morphStart = elapsed
      this.nextMorphTime = elapsed + this.morphDuration + 5 + Math.random() * 3
    }
    return Math.max(0, Math.min(1, progress))
  }

  private triggerManualMorph(shapeIdx: number, elapsed: number): void {
    if (!this.currentHomes || this.currentHomes.length !== this.N * 3) {
      this.currentHomes = new Float32Array(this.N * 3)
      const baseHome = this.HOMES[this.currentShape]
      if (baseHome) this.currentHomes.set(baseHome)
    }
    const progress = Math.max(0, Math.min(1, (elapsed - this.morphStart) / this.morphDuration))
    const morphT = smoothstep(progress)
    const oldDst = this.HOMES[this.targetShape]
    if (oldDst) {
      for (let i = 0; i < this.N * 3; i++) {
        this.currentHomes[i] = this.currentHomes[i] * (1 - morphT) + oldDst[i] * morphT
      }
    }
    this.manualShape = shapeIdx
    this.targetShape = shapeIdx
    this.morphStart = elapsed
    this.nextMorphTime = Infinity
  }

  private updateFocus(): void {
    this.focusVX += (Math.random() - 0.5) * 0.003
    this.focusVY += (Math.random() - 0.5) * 0.003
    this.focusVZ += (Math.random() - 0.5) * 0.003
    this.focusVX *= 0.985
    this.focusVY *= 0.985
    this.focusVZ *= 0.985
    this.focusX += this.focusVX
    this.focusY += this.focusVY
    this.focusZ += this.focusVZ
    const d2 = this.focusX ** 2 + this.focusY ** 2 + this.focusZ ** 2
    if (d2 > 0.64) {
      this.focusX *= 0.97
      this.focusY *= 0.97
      this.focusZ *= 0.97
    }
  }

  private addRipple(x: number, y: number, z: number): void {
    let slot = this.activeRipples
    if (this.activeRipples >= this.MAX_RIPPLES) {
      let oldestIdx = 0
      let oldestAge = -1
      for (let i = 0; i < this.MAX_RIPPLES; i++) {
        if (this.RIPPLES[i * 6 + 3] > oldestAge) {
          oldestAge = this.RIPPLES[i * 6 + 3]
          oldestIdx = i
        }
      }
      slot = oldestIdx
    } else {
      this.activeRipples++
    }
    const o = slot * 6
    this.RIPPLES[o] = x
    this.RIPPLES[o + 1] = y
    this.RIPPLES[o + 2] = z
    this.RIPPLES[o + 3] = 0
    this.RIPPLES[o + 4] = 1.2
    this.RIPPLES[o + 5] = 1.4
  }

  private updateRipples(dt: number): void {
    for (let i = this.activeRipples - 1; i >= 0; i--) {
      const o = i * 6
      this.RIPPLES[o + 3] += dt
      if (this.RIPPLES[o + 3] > this.RIPPLES[o + 4]) {
        if (i < this.activeRipples - 1) {
          const lo = (this.activeRipples - 1) * 6
          for (let j = 0; j < 6; j++) this.RIPPLES[o + j] = this.RIPPLES[lo + j]
        }
        this.activeRipples--
      }
    }
  }

  private simAudio(): void {
    const live = this.opts.levelProvider()
    if (live != null && !Number.isNaN(live)) {
      this.tAmp = live < 0 ? 0 : live > 1 ? 1 : live
    } else {
      const t = this.time * 0.003
      if (this.state === 'speaking') {
        const env = Math.max(
          0,
          Math.sin(t * 1.8) * 0.3 +
            Math.sin(t * 4.7) * 0.25 +
            Math.sin(t * 0.5) * 0.25 +
            Math.sin(t * 11) * 0.12,
        )
        const pause = Math.sin(t * 0.35) > 0.25 ? 1 : 0.1
        this.tAmp = Math.min(1, env * pause)
      } else if (this.state === 'listening') {
        this.tAmp = Math.max(0, Math.sin(t * 2.3) * 0.12 + Math.sin(t * 5.7) * 0.08) * 0.5
      } else {
        this.tAmp = 0
      }
    }
    this.amp += (this.tAmp - this.amp) * 0.08
    if (this.opts.onLevel) this.opts.onLevel(this.amp)
  }

  private render = (ts: number): void => {
    this.rafId = requestAnimationFrame(this.render)
    if (this.paused || !this.pix || !this.pix32 || !this.imgData) return

    const dt = Math.min(0.05, (ts - this.lastFrameTime) * 0.001)
    this.lastFrameTime = ts
    this.time = ts
    const elapsed = this.time * 0.001
    this.simAudio()

    this.pix32.fill(0)

    const cx = this.W / 2
    const cy = this.H / 2
    const baseSize = Math.min(this.W, this.H) * 0.3

    const justEntered = this.state === 'thinking' && this.prevState !== 'thinking'
    const morphActive = this.state === 'thinking' || this.manualShape !== null
    const morphProgress = morphActive ? this.updateMorph(elapsed, justEntered) : 0
    this.prevState = this.state

    const morphT = smoothstep(morphProgress)
    const srcHomes =
      this.manualShape !== null && this.currentHomes ? this.currentHomes : this.HOMES[this.currentShape]
    const dstHomes = this.HOMES[this.targetShape]
    if (!srcHomes || !dstHomes) return

    const rotY = elapsed * 0.12
    const rotX =
      Math.sin(elapsed * 0.08) * 0.3 + (this.state === 'thinking' ? Math.sin(elapsed * 0.05) * 0.2 : 0)
    const cosY = Math.cos(rotY)
    const sinY = Math.sin(rotY)
    const cosX = Math.cos(rotX)
    const sinX = Math.sin(rotX)

    const bandAmps = new Float32Array(BANDS.length)
    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b]
      const osc = Math.sin(elapsed * band.freq + band.phase)
      const baseline = this.state === 'idle' || this.state === 'thinking' ? 0.15 : 0.25
      bandAmps[b] = osc * band.weight * baseline * (1 + this.amp * 3.5)
    }

    const breath = Math.sin(elapsed * 0.3) * 0.025
    this.updateFocus()
    this.updateRipples(dt)

    const baseExcRate =
      0.0002 + this.amp * 0.004 + (this.state === 'thinking' && morphProgress < 1 ? 0.001 : 0)

    const N = this.N
    const pix = this.pix
    const pix32 = this.pix32
    const pw = this.pw
    const ph = this.ph
    const dprL = this.dpr

    for (let i = 0; i < N; i++) {
      let px = srcHomes[i * 3] * (1 - morphT) + dstHomes[i * 3] * morphT
      let py = srcHomes[i * 3 + 1] * (1 - morphT) + dstHomes[i * 3 + 1] * morphT
      let pz = srcHomes[i * 3 + 2] * (1 - morphT) + dstHomes[i * 3 + 2] * morphT

      let cymaticD = breath
      for (let b = 0; b < BANDS.length; b++) cymaticD += this.HARMONICS[b][i] * bandAmps[b]
      const radialScale = 1 + cymaticD
      px *= radialScale
      py *= radialScale
      pz *= radialScale

      const fdx = px - this.focusX
      const fdy = py - this.focusY
      const fdz = pz - this.focusZ
      const focusD2 = fdx * fdx + fdy * fdy + fdz * fdz
      let focusBoost = 0
      if (focusD2 < 0.25) focusBoost = (1 - focusD2 / 0.25) * 0.25

      let rippleExciteChance = 0
      for (let r = 0; r < this.activeRipples; r++) {
        const o = r * 6
        const rdx = px - this.RIPPLES[o]
        if (rdx > 0.5 || rdx < -0.5) continue
        const rdy = py - this.RIPPLES[o + 1]
        if (rdy > 0.5 || rdy < -0.5) continue
        const rdz = pz - this.RIPPLES[o + 2]
        if (rdz > 0.5 || rdz < -0.5) continue
        const rd = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz)
        const rAge = this.RIPPLES[o + 3]
        const rMaxAge = this.RIPPLES[o + 4]
        const curRadius = (rAge / rMaxAge) * this.RIPPLES[o + 5]
        const distFromFront = Math.abs(rd - curRadius)
        if (distFromFront < 0.12) {
          rippleExciteChance += (1 - rAge / rMaxAge) * (1 - distFromFront / 0.12) * 0.05
        }
      }

      const x1 = px * cosY + pz * sinY
      const z1 = -px * sinY + pz * cosY
      const y1 = py * cosX - z1 * sinX
      const z2 = py * sinX + z1 * cosX

      const perspective = 3
      const scale = perspective / (perspective + z2)
      const targetX = cx + x1 * scale * baseSize
      const targetY = cy + y1 * scale * baseSize

      this.VX[i] += (targetX - this.SX_CUR[i]) * 0.08
      this.VY[i] += (targetY - this.SY_CUR[i]) * 0.08
      this.VX[i] *= 0.82
      this.VY[i] *= 0.82
      this.SX_CUR[i] += this.VX[i]
      this.SY_CUR[i] += this.VY[i]

      const sxPx = (this.SX_CUR[i] * dprL + 0.5) | 0
      const syPx = (this.SY_CUR[i] * dprL + 0.5) | 0
      if (sxPx < 0 || sxPx >= pw || syPx < 0 || syPx >= ph) continue

      this.EXC[i] *= 0.985
      const excProb = baseExcRate + this.contagion * 0.002 + rippleExciteChance
      if (Math.random() < excProb) {
        this.EXC[i] = Math.max(this.EXC[i], 0.7 + Math.random() * 0.3)
        this.contagion = Math.min(1, this.contagion + 0.012)
        if (this.EXC[i] > 0.85 && Math.random() < 0.04) this.addRipple(px, py, pz)
      }

      const depthClamp = Math.max(0, Math.min(1, (z2 + 1.2) * 0.417))
      const layerBright = 0.35 + this.DLAYER[i] * 0.55
      let a = 0.04 + layerBright * 0.35 + depthClamp * 0.25

      if (this.state === 'idle') a *= 0.62
      else if (this.state === 'listening') a *= 0.72 + this.amp * 0.3
      else if (this.state === 'speaking') a *= 0.58 + this.amp * 0.6
      else if (this.state === 'thinking') a *= 0.7
      if (this.manualShape !== null && this.state !== 'thinking') a *= 0.66

      a += this.EXC[i] * 0.55
      a += focusBoost
      a += Math.abs(cymaticD) * 2 * this.amp * 0.5
      a *= 0.88 + Math.sin(this.time * 0.0008 * this.PFREQ[i] + this.PH[i]) * 0.12

      a = Math.min(1, Math.max(0, a))
      if (a < 0.015) continue

      const wb = this.WM[i] * 0.4 + this.amp * 0.35 + this.EXC[i] * 0.5 + focusBoost * 0.8
      let r = 172 + wb * 60 + depthClamp * 22
      let g = 168 + wb * 28 + depthClamp * 18
      let b = 162 - wb * 15 + depthClamp * 12
      if (this.EXC[i] > 0.3) {
        const gb = (this.EXC[i] - 0.3) * 1.4
        r = Math.min(255, r + gb * 30)
        g = Math.min(255, g + gb * 15)
        b = Math.max(0, b - gb * 20)
      }
      r = Math.min(255, r | 0)
      g = Math.min(255, g | 0)
      b = Math.min(255, b | 0)

      const pidx = syPx * pw + sxPx
      const al = (a * 255) | 0

      if (pix32[pidx] !== 0) {
        const idx = pidx * 4
        pix[idx] = Math.min(255, pix[idx] + ((r * a * 0.55) | 0))
        pix[idx + 1] = Math.min(255, pix[idx + 1] + ((g * a * 0.55) | 0))
        pix[idx + 2] = Math.min(255, pix[idx + 2] + ((b * a * 0.55) | 0))
        pix[idx + 3] = Math.min(255, pix[idx + 3] + ((al * 0.55) | 0))
      } else {
        pix32[pidx] = (al << 24) | (b << 16) | (g << 8) | r
      }

      const shouldBloom = (depthClamp > 0.6 && a > 0.15) || this.EXC[i] > 0.4 || focusBoost > 0.1
      if (shouldBloom) {
        const bloomStr = this.EXC[i] > 0.4 ? 0.45 : 0.28
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue
            const nx = sxPx + ox
            const ny = syPx + oy
            if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) continue
            const falloff = 1 / (1 + Math.abs(ox) + Math.abs(oy))
            const ba = a * bloomStr * falloff
            const ni = (ny * pw + nx) * 4
            pix[ni] = Math.min(255, pix[ni] + ((r * ba) | 0))
            pix[ni + 1] = Math.min(255, pix[ni + 1] + ((g * ba) | 0))
            pix[ni + 2] = Math.min(255, pix[ni + 2] + ((b * ba) | 0))
            pix[ni + 3] = Math.min(255, pix[ni + 3] + ((ba * 255) | 0))
          }
        }
      }
    }

    this.contagion *= 0.93
    this.ctx.putImageData(this.imgData, 0, 0)
  }

  setState(next: VoiceOrbState): void {
    this.state = next
    if (next === 'thinking') this.nextMorphTime = this.time * 0.001 + 4
  }

  setShape(idx: number | undefined): void {
    if (idx == null) {
      this.manualShape = null
      this.currentHomes = null
      return
    }
    const clamped = Math.max(0, Math.min(SHAPE_COUNT - 1, Math.floor(idx)))
    this.triggerManualMorph(clamped, this.time * 0.001)
  }

  setPaused(p: boolean): void {
    this.paused = p
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.manualShape = null
    this.currentHomes = null
    this.activeRipples = 0
  }
}

// ════════════════════════════════════════════════════════════════
// React component
// ════════════════════════════════════════════════════════════════

export default function VoiceOrb({
  state = 'idle',
  audioSource = null,
  shape,
  particleCount = 30000,
  sensitivity = 1,
  aura = true,
  paused = false,
  onLevel,
  className,
  style,
}: VoiceOrbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const auraRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<ExpressiveFieldEngine | null>(null)
  const meterRef = useRef<AudioLevelMeter | null>(null)
  const levelRef = useRef(0)

  // Create the engine once (re-create only if particleCount changes).
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const meter = new AudioLevelMeter()
    meter.sensitivity = sensitivity
    meterRef.current = meter

    const engine = new ExpressiveFieldEngine(canvas, container, {
      particleCount,
      levelProvider: () => meterRef.current?.getLevel() ?? null,
      onLevel: (lvl) => {
        levelRef.current = lvl
        if (auraRef.current) {
          auraRef.current.style.setProperty('--voice-level', String(lvl))
        }
        onLevel?.(lvl)
      },
    })
    engineRef.current = engine
    engine.setState(state)
    engine.setShape(shape)
    engine.setPaused(paused)

    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(container)

    return () => {
      ro.disconnect()
      engine.destroy()
      // Dispose the live meter (may have been swapped by the audioSource
      // effect) plus the original — dispose() is idempotent/guarded.
      meterRef.current?.dispose()
      meter.dispose()
      engineRef.current = null
      meterRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleCount])

  // (Re)attach the audio source whenever it changes.
  useEffect(() => {
    const meter = meterRef.current
    if (!meter) return
    let cancelled = false
    // Fresh meter so a changed source doesn't leak the old graph.
    const fresh = new AudioLevelMeter()
    fresh.sensitivity = sensitivity
    fresh.attach(audioSource).then(() => {
      if (cancelled) {
        fresh.dispose()
        return
      }
      meterRef.current?.dispose()
      meterRef.current = fresh
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource])

  useEffect(() => {
    if (meterRef.current) meterRef.current.sensitivity = sensitivity
  }, [sensitivity])

  useEffect(() => {
    engineRef.current?.setState(state)
  }, [state])

  useEffect(() => {
    engineRef.current?.setShape(shape)
  }, [shape])

  useEffect(() => {
    engineRef.current?.setPaused(paused)
  }, [paused])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      {aura && (
        <div
          ref={auraRef}
          aria-hidden
          style={
            {
              position: 'absolute',
              inset: '8%',
              borderRadius: '50%',
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at center, rgba(244,243,240,0.10) 0%, rgba(244,243,240,0.05) 38%, rgba(244,243,240,0) 62%)',
              transform: 'scale(calc(0.92 + var(--voice-level, 0) * 0.18))',
              opacity: 'calc(0.45 + var(--voice-level, 0) * 0.55)',
              transition: 'opacity 220ms ease-out',
              willChange: 'transform, opacity',
              '--voice-level': 0,
            } as React.CSSProperties
          }
        />
      )}
      <canvas
        ref={canvasRef}
        style={{ position: 'relative', display: 'block', width: '100%', height: '100%', zIndex: 1 }}
      />
    </div>
  )
}
