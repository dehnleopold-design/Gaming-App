/**
 * Gemeinsame Audio-Engine für Soundboard und Voice Changer.
 *
 * Routing:
 *   soundBus ─┬─> soundToOutput ─┐
 *             └─> soundToMonitor ─┼─> (monitor)
 *   voiceBus ─┬─> voiceToOutput ──┤
 *             └─> voiceToMonitor ─┘
 *
 *   "Ausgang"  = AudioContext.destination, per setSinkId z. B. auf ein virtuelles
 *                Audiokabel gelegt → Discord nutzt dieses Kabel als Mikrofon.
 *   "Mithören" = eigenes Gerät (Kopfhörer) über ein <audio>-Element mit setSinkId.
 *
 * Stimme und Sounds laufen durch denselben AudioContext und landen daher
 * gemeinsam auf dem Ausgang.
 */

type SinkAudioContext = AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string }
type SinkAudioElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }

export const supportsContextSinkId =
  typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype
export const supportsElementSinkId =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

export interface Routing {
  outputId: string
  monitorId: string
  soundToOutput: boolean
  soundToMonitor: boolean
  voiceToMonitor: boolean
}

class AudioEngine {
  private _ctx: SinkAudioContext | null = null
  private monitorEl: SinkAudioElement | null = null
  private monitorDest: MediaStreamAudioDestinationNode | null = null

  soundBus!: GainNode
  voiceBus!: GainNode
  private soundToOutput!: GainNode
  private soundToMonitor!: GainNode
  private voiceToOutput!: GainNode
  private voiceToMonitor!: GainNode
  /** Abgriff des Ausgangssignals (z. B. für Testaufnahmen und Pegelanzeige). */
  outputTap!: GainNode

  private routing: Routing = {
    outputId: '',
    monitorId: '',
    soundToOutput: true,
    soundToMonitor: true,
    voiceToMonitor: false,
  }
  private sinkError: string | null = null

  get ctx(): SinkAudioContext {
    if (!this._ctx) this.init()
    return this._ctx!
  }

  get isReady(): boolean {
    return this._ctx !== null
  }

  private init() {
    const ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkAudioContext
    this._ctx = ctx

    this.outputTap = ctx.createGain()
    this.outputTap.connect(ctx.destination)

    this.monitorDest = ctx.createMediaStreamDestination()
    const el = new Audio() as SinkAudioElement
    el.autoplay = true
    el.srcObject = this.monitorDest.stream
    this.monitorEl = el

    this.soundBus = ctx.createGain()
    this.voiceBus = ctx.createGain()
    this.soundToOutput = ctx.createGain()
    this.soundToMonitor = ctx.createGain()
    this.voiceToOutput = ctx.createGain()
    this.voiceToMonitor = ctx.createGain()

    this.soundBus.connect(this.soundToOutput).connect(this.outputTap)
    this.soundBus.connect(this.soundToMonitor).connect(this.monitorDest)
    this.voiceBus.connect(this.voiceToOutput).connect(this.outputTap)
    this.voiceBus.connect(this.voiceToMonitor).connect(this.monitorDest)

    void this.applyRouting()
  }

  /** Muss aus einer Nutzeraktion heraus aufgerufen werden (Autoplay-Regeln der Browser). */
  async resume(): Promise<void> {
    const ctx = this.ctx
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.monitorEl?.paused) await this.monitorEl.play().catch(() => undefined)
  }

  setRouting(r: Partial<Routing>) {
    this.routing = { ...this.routing, ...r }
    if (this._ctx) void this.applyRouting()
  }

  getRouting(): Routing {
    return this.routing
  }

  getSinkError(): string | null {
    return this.sinkError
  }

  /**
   * Mithören nur, wenn Ausgang und Mithören-Gerät verschieden sind –
   * sonst würde man alles doppelt hören.
   */
  private get monitorUseful(): boolean {
    return this.routing.outputId !== this.routing.monitorId
  }

  private async applyRouting() {
    const r = this.routing
    const t = this.ctx.currentTime
    const set = (g: GainNode, on: boolean) => g.gain.setTargetAtTime(on ? 1 : 0, t, 0.01)
    set(this.soundToOutput, r.soundToOutput)
    set(this.soundToMonitor, r.soundToMonitor && (this.monitorUseful || !r.soundToOutput))
    set(this.voiceToOutput, true)
    set(this.voiceToMonitor, r.voiceToMonitor && this.monitorUseful)

    this.sinkError = null
    try {
      if (supportsContextSinkId && this.ctx.sinkId !== r.outputId) {
        await this.ctx.setSinkId!(r.outputId)
      }
    } catch (e) {
      this.sinkError = 'Ausgabegerät konnte nicht gesetzt werden: ' + String((e as Error).message ?? e)
    }
    try {
      if (supportsElementSinkId && this.monitorEl) await this.monitorEl.setSinkId!(r.monitorId)
    } catch {
      /* Mithören fällt auf das Standardgerät zurück */
    }
  }

  /** Geschätzte Ausgabe-Latenz in ms (Eingangs-Latenz des Mikrofons ist im Browser nicht messbar). */
  outputLatencyMs(): number {
    const ctx = this._ctx
    if (!ctx) return 0
    const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0
    const total = ((ctx.baseLatency ?? 0) + (Number.isFinite(out) ? out : 0)) * 1000
    return Number.isFinite(total) ? total : 0
  }

  /** Kurzer Testton über den Ausgang. */
  async testTone(target: 'output' | 'monitor' = 'output') {
    await this.resume()
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.value = 660
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45)
    osc.connect(g)
    g.connect(target === 'output' ? this.outputTap : this.monitorDest!)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  }

  /** Spielt einen Buffer direkt auf dem Mithören-Gerät (z. B. Testaufnahme). */
  playOnMonitor(buffer: AudioBuffer) {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.monitorUseful ? this.monitorDest! : this.ctx.destination)
    src.start()
    return src
  }
}

export const audio = new AudioEngine()

export interface DeviceLists {
  inputs: MediaDeviceInfo[]
  outputs: MediaDeviceInfo[]
  hasLabels: boolean
}

export async function listDevices(): Promise<DeviceLists> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [], hasLabels: false }
  const all = await navigator.mediaDevices.enumerateDevices()
  const inputs = all.filter((d) => d.kind === 'audioinput')
  const outputs = all.filter((d) => d.kind === 'audiooutput')
  return { inputs, outputs, hasLabels: all.some((d) => d.label !== '') }
}

export function looksLikeVirtualCable(label: string): boolean {
  return /cable|vb-audio|virtual|voicemeeter|blackhole|loopback/i.test(label)
}
