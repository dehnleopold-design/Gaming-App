/** Feste, kräftige Palette des Glücksrads – bewusst bunt, unabhängig vom App-Akzent. */
export const WHEEL_COLORS = [
  '#FF5A5F', '#FF9F1C', '#FFD23F', '#9BE15D', '#2EC4B6',
  '#3A86FF', '#6A4CFF', '#C04CFD', '#FF4D8D', '#00B4D8',
] as const

/**
 * Farbe je Feld: Palette wiederholt sich immer gleich.
 * Sonderfall: Wenn das letzte Feld dieselbe Farbe wie das erste bekäme
 * (n % Palettengröße === 1), bekommt es eine Farbe, die weder dem ersten
 * noch dem vorletzten Feld entspricht.
 */
export function segmentColors(n: number): string[] {
  const P = WHEEL_COLORS.length
  const colors = Array.from({ length: n }, (_, i) => WHEEL_COLORS[i % P]!)
  if (n > 2 && n % P === 1) colors[n - 1] = WHEEL_COLORS[1]!
  return colors
}

export function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.4 ? '#141518' : '#FFFFFF'
}

/** Feld, das unter dem Zeiger (oben) steht, für eine Rotation r (Bogenmaß, im Uhrzeigersinn). */
export function indexAtPointer(rotation: number, n: number): number {
  const seg = (Math.PI * 2) / n
  const a = (((-rotation) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return Math.min(n - 1, Math.floor(a / seg))
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, Math.max(1, lo)) + '…'
}

/** Zeichnet das Rad in Ausgangsstellung (Feld 0 beginnt am Zeiger oben) auf eine Canvas der Größe size×size (CSS-Pixel × dpr). */
export function renderWheel(canvas: HTMLCanvasElement, entries: string[], size: number, dpr: number) {
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  const c = size / 2
  const r = c - 2
  const n = Math.max(entries.length, 1)
  const seg = (Math.PI * 2) / n
  const colors = segmentColors(n)
  const start = -Math.PI / 2

  if (entries.length === 0) {
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = '#2C2E34'
    ctx.fill()
    return
  }

  for (let i = 0; i < n; i++) {
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, r, start + i * seg, start + (i + 1) * seg)
    ctx.closePath()
    ctx.fillStyle = colors[i]!
    ctx.fill()
  }

  // feine Trennlinien
  if (n > 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 1
    for (let i = 0; i < n; i++) {
      const a = start + i * seg
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
      ctx.stroke()
    }
  }

  // Beschriftung
  const arcAtText = seg * r * 0.62
  const fontSize = Math.max(9, Math.min(r * 0.085, arcAtText * 0.62, 26))
  ctx.font = `600 ${fontSize}px "Space Grotesk", Inter, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  const maxWidth = r * 0.64
  for (let i = 0; i < n; i++) {
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(start + (i + 0.5) * seg)
    ctx.fillStyle = textColorFor(colors[i]!)
    ctx.fillText(fitText(ctx, entries[i]!, maxWidth), r * 0.9, 0)
    ctx.restore()
  }
}
