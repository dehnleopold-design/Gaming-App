import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { renderWheel } from './draw'

export interface WheelHandle {
  /** Setzt die Rotation (Bogenmaß) und zeichnet neu – ohne React-Render. */
  setRotation: (r: number) => void
}

/**
 * Das Rad wird einmal auf eine Offscreen-Canvas gerendert; pro Animationsframe
 * wird nur dieses Bild gedreht. Hält die Animation auch bei 100 Feldern flüssig.
 */
export const WheelCanvas = forwardRef<WheelHandle, { entries: string[]; rotation: number; onCenterClick?: () => void; disabled?: boolean }>(
  function WheelCanvas({ entries, rotation, onCenterClick, disabled }, ref) {
    const wrap = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const offscreen = useRef<HTMLCanvasElement>(document.createElement('canvas'))
    const rot = useRef(rotation)
    const [size, setSize] = useState(0)

    const paint = () => {
      const cv = canvas.current
      if (!cv || size === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const px = Math.round(size * dpr)
      if (cv.width !== px) {
        cv.width = px
        cv.height = px
      }
      const ctx = cv.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, px, px)
      ctx.translate(px / 2, px / 2)
      ctx.rotate(rot.current)
      ctx.drawImage(offscreen.current, -px / 2, -px / 2)
    }

    useImperativeHandle(ref, () => ({
      setRotation(r: number) {
        rot.current = r
        paint()
      },
    }))

    useEffect(() => {
      const el = wrap.current
      if (!el) return
      const ro = new ResizeObserver(([e]) => {
        const w = e?.contentRect.width ?? 0
        if (w > 0) setSize(Math.floor(w))
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    useEffect(() => {
      if (size === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const draw = () => {
        renderWheel(offscreen.current, entries, size, dpr)
        rot.current = rotation
        paint()
      }
      draw()
      // Nach dem Laden der Webfont noch einmal zeichnen, damit die Schrift stimmt.
      void document.fonts?.ready.then(draw)
    }, [entries, size])

    return (
      <div ref={wrap} className="relative mx-auto aspect-square w-full max-w-[560px]">
        <canvas ref={canvas} className="h-full w-full rounded-full" style={{ width: size, height: size }} aria-hidden />
        {/* Zeiger */}
        <svg viewBox="0 0 40 44" className="absolute left-1/2 top-[-10px] h-11 w-10 -translate-x-1/2 drop-shadow-md" aria-hidden>
          <path d="M4 4 H36 L20 40 Z" className="fill-fg stroke-bg" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        {/* Nabe */}
        <button
          type="button"
          onClick={onCenterClick}
          disabled={disabled}
          aria-label="Rad drehen"
          className="absolute left-1/2 top-1/2 grid h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-bg bg-surface font-display text-[clamp(11px,2.2vw,15px)] font-bold uppercase tracking-wider text-fg shadow-lg transition-transform hover:scale-105 disabled:hover:scale-100"
        >
          Dreh
        </button>
      </div>
    )
  },
)
