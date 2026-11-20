// Liegt in /public, damit der Browser es als eigene Datei laden kann (nicht als data:-URL inline).
const workletUrl = `${import.meta.env.BASE_URL}pitch-worklet.js`

export type EffectType = 'normal' | 'chipmunk' | 'monster' | 'robot' | 'radio' | 'echo' | 'phone' | 'megaphone' | 'underwater'

export interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  format: (v: number) => string
}

export interface EffectDef {
  type: EffectType
  name: string
  hint: string
  params: ParamDef[]
}

const pct = (v: number) => `${Math.round(v * 100)} %`
const st = (v: number) => `${v > 0 ? '+' : ''}${v} HT`
const hz = (v: number) => `${Math.round(v)} Hz`
const ms = (v: number) => `${Math.round(v * 1000)} ms`

const MIX: ParamDef = { key: 'mix', label: 'Mix (trocken → nass)', min: 0, max: 1, step: 0.01, default: 1, format: pct }

export const EFFECTS: EffectDef[] = [
  { type: 'normal', name: 'Normal', hint: 'Stimme unverändert', params: [] },
  {
    type: 'chipmunk',
    name: 'Höher',
    hint: 'Chipmunk',
    params: [
      { key: 'semitones', label: 'Tonhöhe', min: 1, max: 12, step: 1, default: 7, format: st },
      { key: 'window', label: 'Fenster (Qualität ↔ Latenz)', min: 0.02, max: 0.1, step: 0.005, default: 0.04, format: ms },
      MIX,
    ],
  },
  {
    type: 'monster',
    name: 'Tiefer',
    hint: 'Monster / Dämon',
    params: [
      { key: 'semitones', label: 'Tonhöhe', min: -12, max: -1, step: 1, default: -6, format: st },
      { key: 'drive', label: 'Rauheit', min: 0, max: 1, step: 0.01, default: 0.3, format: pct },
      { key: 'window', label: 'Fenster (Qualität ↔ Latenz)', min: 0.02, max: 0.1, step: 0.005, default: 0.05, format: ms },
      MIX,
    ],
  },
  {
    type: 'robot',
    name: 'Roboter',
    hint: 'Ringmodulation',
    params: [
      { key: 'freq', label: 'Modulation', min: 20, max: 200, step: 1, default: 50, format: hz },
      MIX,
    ],
  },
  {
    type: 'radio',
    name: 'Funkgerät',
    hint: 'Bandpass + Verzerrung',
    params: [
      { key: 'drive', label: 'Verzerrung', min: 0, max: 1, step: 0.01, default: 0.45, format: pct },
      MIX,
    ],
  },
  {
    type: 'echo',
    name: 'Echo',
    hint: 'Delay + Halle',
    params: [
      { key: 'time', label: 'Verzögerung', min: 0.05, max: 0.8, step: 0.01, default: 0.28, format: ms },
      { key: 'feedback', label: 'Wiederholungen', min: 0, max: 0.85, step: 0.01, default: 0.45, format: pct },
      { key: 'reverb', label: 'Halle', min: 0, max: 1, step: 0.01, default: 0.4, format: pct },
      { ...MIX, default: 0.6 },
    ],
  },
  {
    type: 'phone',
    name: 'Telefon',
    hint: '300–3400 Hz',
    params: [
      { key: 'drive', label: 'Verzerrung', min: 0, max: 1, step: 0.01, default: 0.15, format: pct },
      MIX,
    ],
  },
  {
    type: 'megaphone',
    name: 'Megafon',
    hint: 'Laut & kratzig',
    params: [
      { key: 'drive', label: 'Verzerrung', min: 0, max: 1, step: 0.01, default: 0.65, format: pct },
      MIX,
    ],
  },
  {
    type: 'underwater',
    name: 'Unterwasser',
    hint: 'Tiefpass + Modulation',
    params: [
      { key: 'cutoff', label: 'Dumpfheit', min: 300, max: 1500, step: 10, default: 600, format: hz },
      { key: 'rate', label: 'Blubbern', min: 0.5, max: 8, step: 0.1, default: 3.5, format: (v) => `${v.toFixed(1)} Hz` },
      MIX,
    ],
  },
]

export function effectDef(type: EffectType): EffectDef {
  return EFFECTS.find((e) => e.type === type) ?? EFFECTS[0]!
}

export function defaultParams(type: EffectType): Record<string, number> {
  return Object.fromEntries(effectDef(type).params.map((p) => [p.key, p.default]))
}

export interface Effect {
  input: AudioNode
  output: AudioNode
  set: (key: string, value: number) => void
  /** Zusätzliche Latenz durch den Effekt in ms (geschätzt) */
  latencyMs: () => number
  dispose: () => void
}

let workletReady: Promise<void> | null = null
export function loadWorklet(ctx: AudioContext): Promise<void> {
  if (!workletReady) workletReady = ctx.audioWorklet.addModule(workletUrl).catch((e) => {
    workletReady = null
    throw e
  })
  return workletReady
}

function distortionCurve(amount: number): Float32Array {
  const k = amount * 80
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curve
}

function impulseResponse(ctx: AudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay
  }
  return buf
}

function smooth(param: AudioParam, value: number, ctx: BaseAudioContext) {
  param.setTargetAtTime(value, ctx.currentTime, 0.02)
}

/** Baut den Effekt-Graphen. Die Pitch-Effekte setzen ein geladenes Worklet voraus. */
export function createEffect(ctx: AudioContext, type: EffectType, params: Record<string, number>): Effect {
  const nodes: AudioNode[] = []
  const track = <T extends AudioNode>(n: T) => (nodes.push(n), n)
  const stoppers: Array<() => void> = []
  const p = { ...defaultParams(type), ...params }
  const input = track(ctx.createGain())
  const output = track(ctx.createGain())
  let set: Effect['set'] = () => undefined
  let latency = () => 0

  const filter = (t: BiquadFilterType, freq: number, q = 0.7, gain = 0) => {
    const f = track(ctx.createBiquadFilter())
    f.type = t
    f.frequency.value = freq
    f.Q.value = q
    f.gain.value = gain
    return f
  }
  const shaper = (amount: number) => {
    const s = track(ctx.createWaveShaper())
    s.curve = distortionCurve(amount)
    s.oversample = '2x'
    return s
  }

  switch (type) {
    case 'normal':
      input.connect(output)
      break

    case 'chipmunk':
    case 'monster': {
      const ps = track(new AudioWorkletNode(ctx, 'pitch-shifter', { outputChannelCount: [1] }))
      const ratio = ps.parameters.get('ratio')!
      const win = ps.parameters.get('window')!
      ratio.value = 2 ** (p.semitones! / 12)
      win.value = p.window!
      latency = () => (win.value * 1000) / 2
      if (type === 'chipmunk') {
        input.connect(ps).connect(output)
      } else {
        const low = filter('lowshelf', 220, 0.7, 6)
        const sh = shaper(p.drive!)
        input.connect(ps).connect(low).connect(sh).connect(output)
        set = (k, v) => {
          if (k === 'drive') sh.curve = distortionCurve(v)
        }
      }
      const base = set
      set = (k, v) => {
        if (k === 'semitones') ratio.value = 2 ** (v / 12)
        else if (k === 'window') win.value = v
        else base(k, v)
      }
      break
    }

    case 'robot': {
      // Ringmodulation: Signal × Sinus. Gain mit Grundwert 0, Oszillator steuert gain.
      const ring = track(ctx.createGain())
      ring.gain.value = 0
      const osc = track(ctx.createOscillator())
      osc.frequency.value = p.freq!
      osc.connect(ring.gain)
      osc.start()
      stoppers.push(() => osc.stop())
      const boost = track(ctx.createGain())
      boost.gain.value = 1.6
      input.connect(ring).connect(boost).connect(output)
      set = (k, v) => k === 'freq' && smooth(osc.frequency, v, ctx)
      break
    }

    case 'radio':
    case 'phone':
    case 'megaphone': {
      const cfg = {
        radio: { hp: 450, lp: 3000, peak: 1400, peakGain: 4 },
        phone: { hp: 300, lp: 3400, peak: 1500, peakGain: 5 },
        megaphone: { hp: 700, lp: 4500, peak: 1800, peakGain: 10 },
      }[type]
      const hp = filter('highpass', cfg.hp)
      const lp = filter('lowpass', cfg.lp)
      const pk = filter('peaking', cfg.peak, 1, cfg.peakGain)
      const sh = shaper(p.drive!)
      const comp = track(ctx.createDynamicsCompressor())
      comp.threshold.value = -24
      comp.ratio.value = 6
      const post = filter('lowpass', cfg.lp + 500)
      input.connect(hp).connect(pk).connect(sh).connect(lp).connect(comp).connect(post).connect(output)
      set = (k, v) => {
        if (k === 'drive') sh.curve = distortionCurve(v)
      }
      break
    }

    case 'echo': {
      const delay = track(ctx.createDelay(1))
      delay.delayTime.value = p.time!
      const fb = track(ctx.createGain())
      fb.gain.value = p.feedback!
      const damp = filter('lowpass', 4000)
      const conv = track(ctx.createConvolver())
      conv.buffer = impulseResponse(ctx)
      const revGain = track(ctx.createGain())
      revGain.gain.value = p.reverb!
      input.connect(delay)
      delay.connect(damp).connect(fb).connect(delay)
      delay.connect(output)
      input.connect(conv).connect(revGain).connect(output)
      delay.connect(conv)
      set = (k, v) => {
        if (k === 'time') smooth(delay.delayTime, v, ctx)
        if (k === 'feedback') smooth(fb.gain, v, ctx)
        if (k === 'reverb') smooth(revGain.gain, v, ctx)
      }
      break
    }

    case 'underwater': {
      const lp = filter('lowpass', p.cutoff!, 4)
      const lfo = track(ctx.createOscillator())
      lfo.frequency.value = p.rate!
      const lfoAmt = track(ctx.createGain())
      lfoAmt.gain.value = p.cutoff! * 0.4
      lfo.connect(lfoAmt).connect(lp.frequency)
      // Leichtes Vibrato über eine modulierte Verzögerung
      const vib = track(ctx.createDelay(0.05))
      vib.delayTime.value = 0.008
      const vibAmt = track(ctx.createGain())
      vibAmt.gain.value = 0.003
      lfo.connect(vibAmt).connect(vib.delayTime)
      lfo.start()
      stoppers.push(() => lfo.stop())
      input.connect(vib).connect(lp).connect(output)
      latency = () => 8
      set = (k, v) => {
        if (k === 'cutoff') {
          smooth(lp.frequency, v, ctx)
          smooth(lfoAmt.gain, v * 0.4, ctx)
        }
        if (k === 'rate') smooth(lfo.frequency, v, ctx)
      }
      break
    }
  }

  return {
    input,
    output,
    set,
    latencyMs: () => latency(),
    dispose: () => {
      stoppers.forEach((s) => {
        try {
          s()
        } catch {
          /* ignore */
        }
      })
      nodes.forEach((n) => n.disconnect())
    },
  }
}
