import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Hash, List, Pencil, Plus, Shuffle, Trash2, Type, X } from 'lucide-react'
import { Button, PageHeader, Section, Select, Toggle } from '../../components/ui'
import { audio } from '../../lib/audio'
import { useSettings } from '../../lib/settings'
import { usePersistentState } from '../../lib/storage'
import { cn, decodeShare, encodeShare, isTypingTarget, secureRandom, secureRandomInt, shuffle, uid } from '../../lib/util'
import { confetti } from './confetti'
import { indexAtPointer, segmentColors, textColorFor } from './draw'
import { WheelCanvas, type WheelHandle } from './WheelCanvas'

const MAX_ENTRIES = 100
const MAX_LEN = 60

interface HistoryItem {
  value: string
  at: number
}

interface WheelDef {
  id: string
  name: string
  entries: string[]
  history: HistoryItem[]
}

const PRESETS: WheelDef[] = [
  { id: 'preset-game', name: 'Nächstes Spiel', entries: ['Gartic Phone', 'Jackbox', 'Lethal Company', 'Among Us', 'Golf With Your Friends', 'Gang Beasts'], history: [] },
  { id: 'preset-pizza', name: 'Wer zahlt Pizza', entries: ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4'], history: [] },
  {
    id: 'preset-penalty',
    name: 'Strafe',
    entries: ['Nächste Runde nur Pistole', '10 Liegestütze', 'Mikro 2 Min. stumm', 'Mit Akzent reden', 'Getränke holen', 'Glück gehabt'],
    history: [],
  },
]

function cleanEntries(list: string[]): string[] {
  return list
    .map((e) => e.trim().slice(0, MAX_LEN))
    .filter(Boolean)
    .slice(0, MAX_ENTRIES)
}

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4

export function Wheel({ active }: { active: boolean }) {
  const { settings } = useSettings()
  const [wheels, setWheels] = usePersistentState<WheelDef[]>('wheel.list', PRESETS)
  const [activeId, setActiveId] = usePersistentState<string>('wheel.active', PRESETS[0]!.id)
  const [removeWinner, setRemoveWinner] = usePersistentState('wheel.removeWinner', false)
  const [withConfetti, setWithConfetti] = usePersistentState('wheel.confetti', true)
  const [withSound, setWithSound] = usePersistentState('wheel.sound', true)
  const [mode, setMode] = usePersistentState<'text' | 'list' | 'numbers'>('wheel.mode', 'text')

  const wheel = wheels.find((w) => w.id === activeId) ?? wheels[0]
  const entries = useMemo(() => wheel?.entries ?? [], [wheel])

  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const canvasRef = useRef<WheelHandle>(null)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<{ index: number; value: string } | null>(null)
  const [text, setText] = useState(entries.join('\n'))
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const updateWheel = useCallback(
    (patch: Partial<WheelDef>) => setWheels((list) => list.map((w) => (w.id === wheel?.id ? { ...w, ...patch } : w))),
    [setWheels, wheel?.id],
  )

  /** Programmatische Änderung der Einträge: Textfeld mitziehen. */
  const setEntries = useCallback(
    (list: string[]) => {
      const clean = cleanEntries(list)
      updateWheel({ entries: clean })
      setText(clean.join('\n'))
    },
    [updateWheel],
  )

  // Beim Wechsel des Rads Textfeld neu befüllen.
  useEffect(() => {
    setText(wheel?.entries.join('\n') ?? '')
    setResult(null)
  }, [wheel?.id])

  // Geteiltes Rad aus dem Link übernehmen (#wheel=...).
  useEffect(() => {
    if (!location.hash.startsWith('#wheel=')) return
    const data = decodeShare<{ n?: string; e?: string[] }>(location.hash.slice(7))
    history.replaceState(null, '', location.pathname + location.search)
    if (!data || !Array.isArray(data.e)) return
    const w: WheelDef = { id: uid(), name: (data.n || 'Geteiltes Rad').slice(0, 40), entries: cleanEntries(data.e.map(String)), history: [] }
    setWheels((list) => [...list, w])
    setActiveId(w.id)
  }, [])

  const tick = useCallback(() => {
    if (!withSound) return
    const ctx = audio.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 1800
    g.gain.setValueAtTime(0.08, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03)
    osc.connect(g).connect(audio.soundBus)
    osc.start()
    osc.stop(ctx.currentTime + 0.04)
  }, [withSound])

  const fanfare = useCallback(() => {
    if (!withSound) return
    const ctx = audio.ctx
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      const t = ctx.currentTime + i * 0.09
      osc.type = 'square'
      osc.frequency.value = f
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.06, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(g).connect(audio.soundBus)
      osc.start(t)
      osc.stop(t + 0.4)
    })
  }, [withSound])

  /** Entfernt den letzten Gewinner, falls die Option aktiv ist. */
  const consumeResult = useCallback(() => {
    if (result && removeWinner) {
      const next = entries.filter((_, i) => i !== result.index)
      setEntries(next)
    }
    setResult(null)
  }, [result, removeWinner, entries, setEntries])

  const spin = useCallback(async () => {
    if (spinning) return
    let list = entries
    if (result) {
      if (removeWinner) list = entries.filter((_, i) => i !== result.index)
      consumeResult()
    }
    const n = list.length
    if (n < 2) return
    await audio.resume().catch(() => undefined)

    // Ergebnis steht VOR der Animation fest; die Animation landet exakt darauf.
    const target = secureRandomInt(n)
    const seg = (Math.PI * 2) / n
    const within = 0.15 + secureRandom() * 0.7 // nicht direkt auf der Kante landen
    const desired = -(target + within) * seg // Rotation, bei der target unter dem Zeiger steht
    const from = rotRef.current
    const TAU = Math.PI * 2
    const delta = (((desired - from) % TAU) + TAU) % TAU
    const turns = 5 + secureRandomInt(3)
    const to = from + turns * TAU + delta
    const duration = 4200 + secureRandom() * 1600

    setSpinning(true)
    const t0 = performance.now()
    let lastIdx = indexAtPointer(from, n)
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / duration)
        const r = from + (to - from) * easeOutQuart(t)
        rotRef.current = r
        canvasRef.current?.setRotation(r)
        const idx = indexAtPointer(r, n)
        if (idx !== lastIdx) {
          lastIdx = idx
          tick()
        }
        if (t < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    // Normalisieren, damit die Zahl nicht ewig wächst
    rotRef.current = to % TAU
    setRotation(rotRef.current)
    setSpinning(false)

    const value = list[target]!
    setResult({ index: target, value })
    if (withConfetti) confetti()
    fanfare()
    setWheels((ws) =>
      ws.map((w) => (w.id === wheel?.id ? { ...w, history: [{ value, at: Date.now() }, ...w.history].slice(0, 20) } : w)),
    )
  }, [spinning, entries, result, removeWinner, consumeResult, tick, fanfare, withConfetti, setWheels, wheel?.id])

  // Leertaste dreht, solange dieser Tab aktiv ist.
  useEffect(() => {
    if (!active || !settings.shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return
      // Nicht drehen, wenn gerade ein Button den Fokus hat (Leertaste klickt ihn bereits).
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      e.preventDefault()
      void spin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, settings.shortcuts, spin])

  const share = async () => {
    const url = `${location.origin}${location.pathname}#wheel=${encodeShare({ n: wheel?.name, e: entries })}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      prompt('Link kopieren:', url)
    }
  }

  const newWheel = () => {
    const w: WheelDef = { id: uid(), name: `Rad ${wheels.length + 1}`, entries: ['Option 1', 'Option 2', 'Option 3'], history: [] }
    setWheels([...wheels, w])
    setActiveId(w.id)
    setRenaming(true)
  }

  const deleteWheel = () => {
    if (!wheel || wheels.length <= 1) return
    if (!confirm(`„${wheel.name}“ löschen?`)) return
    const rest = wheels.filter((w) => w.id !== wheel.id)
    setWheels(rest)
    setActiveId(rest[0]!.id)
  }

  const colors = segmentColors(entries.length)
  const canSpin = entries.length >= 2 && !spinning

  if (!wheel) return null

  return (
    <div>
      <PageHeader
        title="Glücksrad"
        description="Namen oder Zahlen eintragen, drehen, fertig. Der Zufall kommt aus crypto.getRandomValues."
        actions={
          <>
            <Button icon={copied ? Check : Copy} onClick={share} disabled={entries.length === 0}>
              {copied ? 'Link kopiert' : 'Teilen-Link'}
            </Button>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Rad */}
        <div className="flex flex-col items-center">
          <div className="relative w-full pt-3">
            <WheelCanvas ref={canvasRef} entries={entries} rotation={rotation} onCenterClick={() => void spin()} disabled={!canSpin} />

            {result && !spinning && (
              <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
                <div className="mx-4 w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-2xl">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">Ergebnis</p>
                  <p
                    className="mt-3 break-words rounded-lg px-4 py-3 font-display text-3xl font-bold leading-tight"
                    style={{ background: colors[result.index] ?? '#888', color: textColorFor(colors[result.index] ?? '#888888') }}
                  >
                    {result.value}
                  </p>
                  {removeWinner && <p className="mt-3 text-[13px] text-muted">Wird beim nächsten Drehen entfernt.</p>}
                  <div className="mt-5 flex justify-center gap-2">
                    <Button onClick={consumeResult}>Schließen</Button>
                    <Button variant="primary" onClick={() => void spin()} disabled={(removeWinner ? entries.length - 1 : entries.length) < 2}>
                      Nochmal
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button variant="primary" size="lg" className="mt-8 min-w-[220px]" onClick={() => void spin()} disabled={!canSpin}>
            {spinning ? 'Dreht …' : 'Drehen'}
            {!spinning && settings.shortcuts && <span className="kbd hidden border-on-accent/30 bg-transparent text-on-accent/80 md:inline-flex">Leertaste</span>}
          </Button>
          {entries.length < 2 && <p className="mt-3 text-sm text-muted">Mindestens zwei Einträge nötig.</p>}
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4">
          <Section title="Vorlage">
            {renaming ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  setRenaming(false)
                }}
              >
                <input
                  className="field"
                  autoFocus
                  maxLength={40}
                  value={wheel.name}
                  onChange={(e) => updateWheel({ name: e.target.value })}
                  onBlur={() => {
                    if (!wheel.name.trim()) updateWheel({ name: 'Unbenannt' })
                    setRenaming(false)
                  }}
                  aria-label="Name des Rads"
                />
                <Button type="submit" icon={Check} aria-label="Fertig" />
              </form>
            ) : (
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={wheel.id}
                  onChange={(id) => !spinning && setActiveId(id)}
                  options={wheels.map((w) => ({ value: w.id, label: w.name }))}
                />
                <Button icon={Pencil} onClick={() => setRenaming(true)} aria-label="Umbenennen" />
              </div>
            )}
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" icon={Plus} onClick={newWheel} disabled={spinning}>
                Neues Rad
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={deleteWheel} disabled={wheels.length <= 1 || spinning}>
                Löschen
              </Button>
            </div>
          </Section>

          <Section
            title="Einträge"
            aside={
              <span className={cn('font-mono text-xs', entries.length >= MAX_ENTRIES ? 'text-accent' : 'text-muted')}>
                {entries.length} / {MAX_ENTRIES}
              </span>
            }
          >
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-bg p-1" role="tablist" aria-label="Eingabeart">
              {(
                [
                  ['text', 'Text', Type],
                  ['list', 'Liste', List],
                  ['numbers', 'Zahlen', Hash],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[13px] transition-colors',
                    mode === id ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  <Icon size={14} aria-hidden /> {label}
                </button>
              ))}
            </div>

            <fieldset disabled={spinning} className="disabled:opacity-60">
              {mode === 'text' && (
                <>
                  <textarea
                    className="field min-h-[220px] resize-y font-mono text-[13px] leading-6"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value)
                      updateWheel({ entries: cleanEntries(e.target.value.split('\n')) })
                    }}
                    placeholder={'Ein Eintrag pro Zeile\nz. B. Namen deiner Freunde'}
                    aria-label="Einträge, einer pro Zeile"
                  />
                  <p className="mt-1.5 text-[12px] text-muted">Ein Eintrag pro Zeile, max. {MAX_LEN} Zeichen.</p>
                </>
              )}
              {mode === 'list' && <ListEditor entries={entries} colors={colors} onChange={setEntries} />}
              {mode === 'numbers' && <NumberGenerator onGenerate={setEntries} />}
            </fieldset>

            <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
              <Button size="sm" variant="ghost" icon={Shuffle} onClick={() => setEntries(shuffle(entries))} disabled={spinning || entries.length < 2}>
                Mischen
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => setEntries([])} disabled={spinning || entries.length === 0}>
                Leeren
              </Button>
            </div>
          </Section>

          <Section title="Optionen">
            <div className="space-y-3">
              <Toggle checked={removeWinner} onChange={setRemoveWinner} label="Gewinner nach dem Drehen entfernen" />
              <Toggle checked={withConfetti} onChange={setWithConfetti} label="Konfetti" />
              <Toggle checked={withSound} onChange={setWithSound} label="Sound" description="Läuft über den Soundboard-Ausgang." />
            </div>
          </Section>

          <Section
            title="Verlauf"
            aside={
              wheel.history.length > 0 && (
                <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => updateWheel({ history: [] })}>
                  Leeren
                </button>
              )
            }
          >
            {wheel.history.length === 0 ? (
              <p className="text-sm text-muted">Noch nicht gedreht.</p>
            ) : (
              <ol className="space-y-1.5">
                {wheel.history.map((h, i) => (
                  <li key={h.at + '-' + i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn('truncate', i === 0 && 'font-semibold')}>{h.value}</span>
                    <time className="shrink-0 font-mono text-[12px] text-muted">
                      {new Date(h.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function ListEditor({ entries, colors, onChange }: { entries: string[]; colors: string[]; onChange: (l: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    if (!draft.trim() || entries.length >= MAX_ENTRIES) return
    onChange([...entries, draft])
    setDraft('')
  }
  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="field" value={draft} maxLength={MAX_LEN} onChange={(e) => setDraft(e.target.value)} placeholder="Name oder Zahl" aria-label="Neuer Eintrag" />
        <Button type="submit" variant="primary" icon={Plus} aria-label="Hinzufügen" disabled={!draft.trim() || entries.length >= MAX_ENTRIES} />
      </form>
      <ul className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
        {entries.map((e, i) => (
          <li key={i + e} className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-raised">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: colors[i] }} aria-hidden />
            <span className="flex-1 truncate text-sm">{e}</span>
            <button
              type="button"
              className="text-muted opacity-100 hover:text-danger md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
              aria-label={`${e} entfernen`}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NumberGenerator({ onGenerate }: { onGenerate: (l: string[]) => void }) {
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(10)
  const count = Math.abs(to - from) + 1
  const valid = Number.isInteger(from) && Number.isInteger(to) && count >= 2 && count <= MAX_ENTRIES
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Von</span>
          <input type="number" className="field font-mono" value={from} onChange={(e) => setFrom(Math.trunc(Number(e.target.value)))} />
        </label>
        <label>
          <span className="label">Bis</span>
          <input type="number" className="field font-mono" value={to} onChange={(e) => setTo(Math.trunc(Number(e.target.value)))} />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {valid ? `${count} Felder` : `Bereich muss 2 bis ${MAX_ENTRIES} Zahlen umfassen.`}
      </p>
      <Button
        className="mt-3 w-full"
        variant="primary"
        disabled={!valid}
        onClick={() => {
          const step = to >= from ? 1 : -1
          onGenerate(Array.from({ length: count }, (_, i) => String(from + i * step)))
        }}
      >
        Rad mit Zahlen füllen
      </Button>
      <p className="mt-2 text-[12px] text-muted">Ersetzt die aktuellen Einträge.</p>
    </div>
  )
}
