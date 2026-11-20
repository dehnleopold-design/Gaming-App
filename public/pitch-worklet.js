/**
 * Echtzeit-Pitch-Shifter als AudioWorklet (Delay-Line-Verfahren mit zwei
 * überblendeten Leseköpfen, sin²/cos²-Fenster → konstante Lautstärke).
 *
 * Ehrliche Einordnung: Das ist ein einfaches, latenzarmes Verfahren.
 * Es klingt bei starken Verschiebungen leicht "flatternd" (Granular-Artefakte)
 * und erhält die Formanten nicht – Qualität wie Voicemod ist damit nicht erreichbar.
 */
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
      { name: 'window', defaultValue: 0.04, minValue: 0.01, maxValue: 0.12, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.size = 1 << 15
    this.mask = this.size - 1
    this.buf = new Float32Array(this.size)
    this.w = 0
    this.phase = 0
  }

  read(delay) {
    const pos = this.w - delay
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buf[i & this.mask]
    const b = this.buf[(i + 1) & this.mask]
    return a + (b - a) * frac
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    if (!output || output.length === 0) return true
    const inCh = input && input[0]
    const ratio = parameters.ratio[0]
    const W = Math.max(64, Math.floor(parameters.window[0] * sampleRate))
    const step = (1 - ratio) / W
    const out = output[0]

    for (let n = 0; n < out.length; n++) {
      this.buf[this.w & this.mask] = inCh ? inCh[n] : 0

      let p = this.phase
      let p2 = p + 0.5
      if (p2 >= 1) p2 -= 1
      const s = Math.sin(Math.PI * p)
      const g1 = s * s
      const g2 = 1 - g1
      out[n] = this.read(p * W + 1) * g1 + this.read(p2 * W + 1) * g2

      p += step
      if (p >= 1) p -= 1
      else if (p < 0) p += 1
      this.phase = p
      this.w = (this.w + 1) & this.mask
    }
    for (let ch = 1; ch < output.length; ch++) output[ch].set(out)
    return true
  }
}

registerProcessor('pitch-shifter', PitchShifter)
