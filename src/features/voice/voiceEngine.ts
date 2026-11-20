import { audio } from '../../lib/audio'
import { createEffect, loadWorklet, type Effect, type EffectType } from './effects'

/**
 * Mikrofon → [Effekt] → Mix → Voice-Bus der gemeinsamen Audio-Engine.
 *
 *   mic ─> inMeter ─┬─> dry ────────────┐
 *                   └─> effect ─> wet ──┴─> mixOut ─> outMeter ─> audio.voiceBus
 */
class VoiceEngine {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private inMeter: AnalyserNode | null = null
  private outMeter: AnalyserNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private mixOut: GainNode | null = null
  private effect: Effect | null = null
  private type: EffectType = 'normal'
  private params: Record<string, number> = {}
  private mix = 1
  private holdMode = false
  private holding = false
  private buf = new Float32Array(2048)

  get running() {
    return this.stream !== null
  }

  async start(deviceId: string) {
    this.stop()
    await audio.resume()
    const ctx = audio.ctx
    await loadWorklet(ctx)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        // Browser-Aufbereitung aus, sonst werden Effekte verfälscht
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    this.stream = stream
    this.source = ctx.createMediaStreamSource(stream)
    this.inMeter = ctx.createAnalyser()
    this.inMeter.fftSize = 2048
    this.outMeter = ctx.createAnalyser()
    this.outMeter.fftSize = 2048
    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.mixOut = ctx.createGain()

    this.source.connect(this.inMeter)
    this.inMeter.connect(this.dry).connect(this.mixOut)
    this.wet.connect(this.mixOut)
    this.mixOut.connect(this.outMeter)
    this.outMeter.connect(audio.voiceBus)
    this.buildEffect()
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.effect?.dispose()
    this.effect = null
    for (const n of [this.source, this.inMeter, this.dry, this.wet, this.mixOut, this.outMeter]) n?.disconnect()
    this.source = this.inMeter = this.outMeter = this.dry = this.wet = this.mixOut = null
  }

  private buildEffect() {
    if (!this.inMeter || !this.wet) return
    this.effect?.dispose()
    this.effect = createEffect(audio.ctx, this.type, this.params)
    this.inMeter.connect(this.effect.input)
    this.effect.output.connect(this.wet)
    this.applyMix()
  }

  setEffect(type: EffectType, params: Record<string, number>) {
    this.type = type
    this.params = { ...params }
    this.mix = type === 'normal' ? 1 : (params.mix ?? 1)
    if (this.running) this.buildEffect()
  }

  setParam(key: string, value: number) {
    this.params[key] = value
    if (key === 'mix') {
      this.mix = value
      this.applyMix()
    } else this.effect?.set(key, value)
  }

  setHold(mode: boolean, holding: boolean) {
    this.holdMode = mode
    this.holding = holding
    this.applyMix()
  }

  private applyMix() {
    if (!this.dry || !this.wet) return
    const active = !this.holdMode || this.holding
    const isNormal = this.type === 'normal'
    // "Normal" läuft über den Effektzweig (Durchleitung), damit es keine Doppelung gibt.
    const wet = isNormal ? 1 : active ? this.mix : 0
    const dry = isNormal ? 0 : active ? 1 - this.mix : 1
    const t = audio.ctx.currentTime
    this.wet.gain.setTargetAtTime(wet, t, 0.015)
    this.dry.gain.setTargetAtTime(dry, t, 0.015)
  }

  private peak(an: AnalyserNode | null): number {
    if (!an) return 0
    an.getFloatTimeDomainData(this.buf)
    let m = 0
    for (let i = 0; i < this.buf.length; i++) {
      const v = Math.abs(this.buf[i]!)
      if (v > m) m = v
    }
    return m
  }

  levels() {
    return { input: this.peak(this.inMeter), output: this.peak(this.outMeter) }
  }

  /** Geschätzte Gesamtlatenz: Ausgabe-Latenz + ein Render-Block + Effekt. Eingangs-Latenz ist im Browser nicht messbar. */
  latencyMs(): number {
    if (!this.running) return 0
    const block = (128 / audio.ctx.sampleRate) * 1000
    return audio.outputLatencyMs() + block + (this.effect?.latencyMs() ?? 0)
  }

  /** Nimmt das bearbeitete Signal auf und gibt es als AudioBuffer zurück. */
  async record(seconds: number): Promise<AudioBuffer> {
    if (!this.outMeter) throw new Error('Mikrofon ist aus.')
    const ctx = audio.ctx
    const dest = ctx.createMediaStreamDestination()
    this.outMeter.connect(dest)
    const rec = new MediaRecorder(dest.stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.start()
    await new Promise((r) => setTimeout(r, seconds * 1000))
    rec.stop()
    await done
    this.outMeter?.disconnect(dest)
    const blob = new Blob(chunks, { type: rec.mimeType })
    return ctx.decodeAudioData(await blob.arrayBuffer())
  }
}

export const voice = new VoiceEngine()
