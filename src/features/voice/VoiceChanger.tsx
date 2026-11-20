import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Mic,
  MicOff,
  Phone,
  Play,
  Radio,
  Rabbit,
  Repeat,
  Save,
  Skull,
  Trash2,
  Waves,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { AudioRouting } from '../../components/AudioRouting'
import { Button, LevelMeter, Modal, Notice, PageHeader, Section, Select, Slider, Toggle } from '../../components/ui'
import { audio, looksLikeVirtualCable, supportsContextSinkId } from '../../lib/audio'
import { useSettings } from '../../lib/settings'
import { usePersistentState } from '../../lib/storage'
import { useDevices } from '../../lib/useDevices'
import { cn, isTypingTarget, uid } from '../../lib/util'
import { EFFECTS, defaultParams, effectDef, type EffectType } from './effects'
import { voice } from './voiceEngine'

interface Preset {
  id: string
  name: string
  type: EffectType
  params: Record<string, number>
  builtin?: boolean
}

const ICONS: Record<EffectType, LucideIcon> = {
  normal: AudioLines,
  chipmunk: Rabbit,
  monster: Skull,
  robot: Bot,
  radio: Radio,
  echo: Repeat,
  phone: Phone,
  megaphone: Megaphone,
  underwater: Waves,
}

const BUILTIN: Preset[] = EFFECTS.map((e) => ({ id: 'fx-' + e.type, name: e.name, type: e.type, params: defaultParams(e.type), builtin: true }))

const HOLD_KEY = 'Backquote'

const supported =
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined'

export function VoiceChanger() {
  const { settings, update } = useSettings()
  const { inputs, outputs, hasLabels, requestLabels } = useDevices()
  const [custom, setCustom] = usePersistentState<Preset[]>('voice.presets', [])
  const [selectedId, setSelectedId] = usePersistentState('voice.selected', 'fx-normal')
  const [inputId, setInputId] = usePersistentState('voice.input', '')
  const [monitor, setMonitor] = usePersistentState('voice.monitor', false)
  const [holdMode, setHoldMode] = usePersistentState('voice.hold', false)
  const presets = [...BUILTIN, ...custom]
  const preset = presets.find((p) => p.id === selectedId) ?? BUILTIN[0]!
  const [params, setParams] = useState<Record<string, number>>(preset.params)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [levels, setLevels] = useState({ input: 0, output: 0, latency: 0 })
  const [holding, setHolding] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [wizard, setWizard] = useState(false)

  const def = effectDef(preset.type)
  const dirty = def.params.some((p) => params[p.key] !== preset.params[p.key])

  // Preset-Wechsel → Engine umbauen
  useEffect(() => {
    const p = { ...defaultParams(preset.type), ...preset.params }
    setParams(p)
    voice.setEffect(preset.type, p)
  }, [preset.id, preset.type])

  useEffect(() => voice.setHold(holdMode, holding), [holdMode, holding])
  useEffect(() => audio.setRouting({ voiceToMonitor: monitor }), [monitor])

  const start = useCallback(async () => {
    setError('')
    setStarting(true)
    try {
      await voice.start(inputId)
      voice.setEffect(preset.type, params)
      voice.setHold(holdMode, holding)
      setRunning(true)
    } catch (e) {
      const err = e as DOMException
      setError(
        err.name === 'NotAllowedError'
          ? 'Mikrofon-Zugriff wurde verweigert. Erlaube ihn über das Schloss-Symbol in der Adressleiste.'
          : err.name === 'NotFoundError' || err.name === 'OverconstrainedError'
            ? 'Mikrofon nicht gefunden. Wähle ein anderes Eingabegerät.'
            : 'Start fehlgeschlagen: ' + (err.message || String(e)),
      )
      voice.stop()
      setRunning(false)
    } finally {
      setStarting(false)
    }
  }, [inputId, preset.type, params, holdMode, holding])

  const stop = () => {
    voice.stop()
    setRunning(false)
    setLevels({ input: 0, output: 0, latency: 0 })
  }

  // Eingabegerät gewechselt → neu starten
  useEffect(() => {
    if (voice.running) void start()
  }, [inputId])

  useEffect(() => () => voice.stop(), [])

  // Pegel ~20×/s aktualisieren
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      if (t - last > 50) {
        last = t
        setLevels({ ...voice.levels(), latency: voice.latencyMs() })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])

  // Tastenkürzel: Shift+1–9 wählt Preset, ^ halten = Effekt aktiv (im Halten-Modus)
  useEffect(() => {
    if (!settings.shortcuts) return
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return
      if (e.code === HOLD_KEY && holdMode) {
        e.preventDefault()
        if (!e.repeat) setHolding(true)
        return
      }
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const p = presets[Number(e.code.slice(5)) - 1]
        if (p) {
          e.preventDefault()
          setSelectedId(p.id)
        }
      }
    }
    const up = (e: KeyboardEvent) => e.code === HOLD_KEY && setHolding(false)
    const blur = () => setHolding(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [settings.shortcuts, holdMode, presets, setSelectedId])

  const setParam = (key: string, v: number) => {
    setParams((p) => ({ ...p, [key]: v }))
    voice.setParam(key, v)
  }

  const saveAsNew = () => {
    const name = saveName.trim() || `${def.name} (eigen)`
    const p: Preset = { id: uid(), name: name.slice(0, 24), type: preset.type, params }
    setCustom([...custom, p])
    setSelectedId(p.id)
    setSaveName('')
  }

  const saveChanges = () => setCustom(custom.map((c) => (c.id === preset.id ? { ...c, params } : c)))

  const deletePreset = () => {
    setCustom(custom.filter((c) => c.id !== preset.id))
    setSelectedId('fx-normal')
  }

  const outputIsDefault = settings.outputId === ''
  const outputLabel = outputs.find((o) => o.deviceId === settings.outputId)?.label ?? ''

  if (!supported) {
    return (
      <div>
        <PageHeader title="Voice Changer" />
        <Notice tone="warn">Dieser Browser unterstützt Mikrofon-Effekte nicht (getUserMedia oder AudioWorklet fehlt). Bitte Chrome oder Edge verwenden.</Notice>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Voice Changer"
        description="Echtzeit-Effekte für dein Mikrofon. Über ein virtuelles Audiokabel landet die veränderte Stimme in Discord."
        actions={
          <>
            <Button icon={Wand2} onClick={() => setWizard(true)}>
              Einrichtung
            </Button>
            <Button
              variant={running ? 'danger' : 'primary'}
              icon={running ? MicOff : Mic}
              onClick={running ? stop : () => void start()}
              disabled={starting}
              aria-pressed={running}
            >
              {starting ? 'Startet …' : running ? 'Mikrofon aus' : 'Mikrofon an'}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-5">
          <Notice tone="warn">{error}</Notice>
        </div>
      )}

      {running && outputIsDefault && (
        <div className="mb-5">
          <Notice tone="warn">
            Die Stimme läuft gerade über dein normales Ausgabegerät – du hörst dich selbst. Kopfhörer aufsetzen, sonst gibt es
            Rückkopplung. Für Discord am PC: virtuelles Kabel als Ausgang wählen (siehe Einrichtung).
          </Notice>
        </div>
      )}

      {!running && (
        <div className="mb-5">
          <Notice>
            Aus bedeutet: Es geht <strong className="text-fg">kein</strong> Mikrofon-Signal an den Ausgang. Wenn Discord auf das
            virtuelle Kabel hört, bist du dann stumm. Für unveränderte Stimme: Mikrofon an + Preset „Normal“.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* Presets */}
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {presets.map((p, i) => {
              const Icon = ICONS[p.type]
              const selected = p.id === preset.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    aria-pressed={selected}
                    className={cn(
                      'relative flex h-full min-h-[92px] w-full flex-col justify-between rounded-lg border p-3 text-left transition-colors',
                      selected ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-muted/60 hover:bg-raised',
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <Icon size={18} className={selected ? 'text-accent' : 'text-muted'} aria-hidden />
                      {i < 9 && settings.shortcuts && <span className="kbd">⇧{i + 1}</span>}
                    </span>
                    <span className="mt-3">
                      <span className="block font-medium leading-tight">{p.name}</span>
                      <span className="block text-[12px] text-muted">{p.builtin ? effectDef(p.type).hint : 'Eigenes Preset'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Regler */}
          <Section
            title={`Regler · ${preset.name}`}
            aside={
              def.params.length > 0 && dirty && (
                <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => {
                  const p = { ...defaultParams(preset.type), ...preset.params }
                  setParams(p)
                  voice.setEffect(preset.type, p)
                }}>
                  Zurücksetzen
                </button>
              )
            }
          >
            {def.params.length === 0 ? (
              <p className="text-sm text-muted">Keine Regler – die Stimme wird unverändert durchgeleitet.</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {def.params.map((pd) => (
                  <Slider
                    key={pd.key}
                    label={pd.label}
                    value={params[pd.key] ?? pd.default}
                    min={pd.min}
                    max={pd.max}
                    step={pd.step}
                    format={pd.format}
                    onChange={(v) => setParam(pd.key, v)}
                  />
                ))}
              </div>
            )}

            {(preset.type === 'chipmunk' || preset.type === 'monster') && (
              <p className="mt-4 text-[12px] leading-relaxed text-muted">
                Tonhöhen-Effekte im Browser sind ein einfaches Verfahren: Bei starker Verschiebung klingt es leicht flatternd. Größeres
                Fenster = sauberer, aber mehr Verzögerung. Spezialisierte Programme wie Voicemod klingen hier besser.
              </p>
            )}

            {def.params.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
                <input
                  className="field h-9 py-0"
                  placeholder="Name für eigenes Preset"
                  value={saveName}
                  maxLength={24}
                  onChange={(e) => setSaveName(e.target.value)}
                  aria-label="Name für eigenes Preset"
                />
                <Button icon={Save} onClick={saveAsNew}>
                  Als Preset speichern
                </Button>
                {!preset.builtin && (
                  <>
                    <Button icon={Check} onClick={saveChanges} disabled={!dirty}>
                      Übernehmen
                    </Button>
                    <Button variant="danger" icon={Trash2} onClick={deletePreset} aria-label="Preset löschen" />
                  </>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* Status & Geräte */}
        <div className="space-y-4">
          <Section
            title="Status"
            aside={
              <span className={cn('flex items-center gap-1.5 text-[12px]', running ? 'text-ok' : 'text-muted')}>
                <span className={cn('h-2 w-2 rounded-full', running ? 'bg-ok' : 'bg-line')} />
                {running ? 'Aktiv' : 'Aus'}
              </span>
            }
          >
            <div className="space-y-3">
              <LevelMeter label="Eingang (Mikrofon)" level={levels.input} />
              <LevelMeter label="Ausgang (mit Effekt)" level={levels.output} />
              <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
                <span className="text-muted">Latenz (geschätzt)</span>
                <span className="font-mono">{running ? `${levels.latency.toFixed(0)} ms` : '–'}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                Ausgabe + Effekt. Die Verzögerung des Mikrofon-Eingangs kann der Browser nicht messen; real kommt etwas dazu.
              </p>
            </div>
          </Section>

          <Section title="Modus">
            <div className="space-y-4">
              <Toggle
                checked={holdMode}
                onChange={setHoldMode}
                label={
                  <>
                    Effekt nur beim Halten von <span className="kbd">^</span>
                  </>
                }
                description={holdMode ? (holding ? 'Effekt aktiv' : 'Taste loslassen = normale Stimme') : 'Effekt dauerhaft aktiv'}
              />
              <Toggle
                checked={monitor}
                onChange={setMonitor}
                label="Mithören"
                description="Nur mit Kopfhörern – sonst Rückkopplung."
              />

              {settings.shortcuts && (
                <p className="text-[12px] leading-relaxed text-muted">
                  Tasten wirken nur, solange dieses Browserfenster den Fokus hat – nicht im Spiel.
                </p>
              )}
            </div>
          </Section>

          <Section title="Geräte">
            <div className="space-y-4">
              <Select
                label="Mikrofon"
                value={inputId}
                onChange={setInputId}
                options={[
                  { value: '', label: 'Standard-Mikrofon' },
                  ...inputs
                    .filter((d) => d.deviceId !== 'default' && d.deviceId !== '' && !looksLikeVirtualCable(d.label))
                    .map((d, i) => ({ value: d.deviceId, label: d.label || `Mikrofon ${i + 1}` })),
                ]}
              />
              <AudioRouting compact />
              {!hasLabels && (
                <Button size="sm" variant="ghost" onClick={requestLabels}>
                  Gerätenamen anzeigen
                </Button>
              )}
            </div>
          </Section>
        </div>
      </div>

      <SetupWizard
        open={wizard}
        onClose={() => setWizard(false)}
        running={running}
        onStart={() => void start()}
        outputLabel={outputLabel}
        outputIsDefault={outputIsDefault}
        cableDetected={outputs.some((o) => looksLikeVirtualCable(o.label))}
        hasLabels={hasLabels}
        requestLabels={requestLabels}
        selectCable={() => {
          const cable = outputs.find((o) => looksLikeVirtualCable(o.label))
          if (cable) update({ outputId: cable.deviceId })
        }}
      />
    </div>
  )
}

function SetupWizard({
  open,
  onClose,
  running,
  onStart,
  outputLabel,
  outputIsDefault,
  cableDetected,
  hasLabels,
  requestLabels,
  selectCable,
}: {
  open: boolean
  onClose: () => void
  running: boolean
  onStart: () => void
  outputLabel: string
  outputIsDefault: boolean
  cableDetected: boolean
  hasLabels: boolean
  requestLabels: () => Promise<void>
  selectCable: () => void
}) {
  const [step, setStep] = useState(0)
  const [recState, setRecState] = useState<'idle' | 'recording' | 'playing' | 'done'>('idle')
  const [recError, setRecError] = useState('')
  const bufRef = useRef<AudioBuffer | null>(null)

  const steps = ['Kabel installieren', 'Ausgang wählen', 'Discord einstellen', 'Testaufnahme']

  const testRecord = async () => {
    setRecError('')
    try {
      setRecState('recording')
      bufRef.current = await voice.record(4)
      setRecState('playing')
      const src = audio.playOnMonitor(bufRef.current)
      src.onended = () => setRecState('done')
    } catch (e) {
      setRecError((e as Error).message)
      setRecState('idle')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Einrichtung: Stimme in Discord" wide>
      <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Schritte">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn('w-full border-t-2 pt-2 text-left text-[12px]', i <= step ? 'border-accent text-fg' : 'border-line text-muted')}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="font-mono">{i + 1}</span> <span className="hidden sm:inline">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="min-h-[220px] space-y-4 text-sm leading-relaxed">
        {step === 0 && (
          <>
            <h3 className="font-semibold">1. Virtuelles Audiokabel installieren</h3>
            <p className="text-muted">
              Ein virtuelles Kabel ist ein Treiber, der wie ein Lautsprecher (Eingang) und ein Mikrofon (Ausgang) zugleich aussieht. Die App
              spielt hinein, Discord hört heraus.
            </p>
            <a
              href="https://vb-audio.com/Cable/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-line px-3.5 font-medium hover:bg-raised"
            >
              VB-Audio Virtual Cable (Windows/macOS)
            </a>
            <p className="text-[13px] text-muted">Nach der Installation den Rechner ggf. neu starten.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void requestLabels()}>
                Prüfen
              </Button>
              {hasLabels &&
                (cableDetected ? (
                  <span className="text-[13px] text-ok">Virtuelles Kabel gefunden.</span>
                ) : (
                  <span className="text-[13px] text-muted">Kein virtuelles Kabel erkannt (Erkennung nach Gerätename).</span>
                ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3 className="font-semibold">2. In der App: Ausgang = virtuelles Kabel</h3>
            {!supportsContextSinkId && <Notice tone="warn">Dein Browser kann das Ausgabegerät nicht wählen – bitte Chrome oder Edge verwenden.</Notice>}
            <p className="text-muted">Als Ausgang „CABLE Input“ wählen. Als Mithören deine Kopfhörer.</p>
            {cableDetected && outputIsDefault && (
              <Button size="sm" variant="primary" onClick={selectCable}>
                Erkanntes Kabel als Ausgang setzen
              </Button>
            )}
            <AudioRouting compact />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" icon={Play} onClick={() => void audio.testTone('output')}>
                Testton auf Ausgang
              </Button>
              <span className="text-[13px] text-muted">
                {outputIsDefault ? 'Ausgang ist noch das Standardgerät.' : `Ausgang: ${outputLabel || 'gewähltes Gerät'}`}
              </span>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="font-semibold">3. In Discord</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted">
              <li>Benutzereinstellungen → Sprache &amp; Video.</li>
              <li>
                Eingabegerät: <strong className="text-fg">„CABLE Output“</strong>.
              </li>
              <li>Rauschunterdrückung (Krisp) und Echounterdrückung ausschalten – sie verstümmeln Effekte.</li>
              <li>Optional „Automatische Verstärkungsregelung“ aus, damit Discord die Lautstärke nicht nachregelt.</li>
            </ol>
            <p className="text-[13px] text-muted">
              Discord benennt Einstellungen gelegentlich um – falls ein Punkt anders heißt, ist er meist im selben Bereich zu finden.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h3 className="font-semibold">4. Testaufnahme</h3>
            <p className="text-muted">Nimmt 4 Sekunden der bearbeiteten Stimme auf und spielt sie auf deinem Mithören-Gerät ab.</p>
            {!running ? (
              <Button variant="primary" icon={Mic} onClick={onStart}>
                Mikrofon einschalten
              </Button>
            ) : (
              <Button variant="primary" icon={Mic} onClick={() => void testRecord()} disabled={recState === 'recording' || recState === 'playing'}>
                {recState === 'recording' ? 'Aufnahme läuft … sprich jetzt' : recState === 'playing' ? 'Spielt ab …' : 'Aufnahme starten'}
              </Button>
            )}
            {recState === 'done' && (
              <Notice tone="ok">Fertig. Wenn du dich gehört hast, kommt die Stimme genauso am Ausgang an. Test in Discord: „Mikrofon testen“ unter Sprache &amp; Video.</Notice>
            )}
            {recError && <Notice tone="warn">{recError}</Notice>}
          </>
        )}
      </div>

      <div className="mt-6 flex justify-between border-t border-line pt-4">
        <Button icon={ChevronLeft} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Zurück
        </Button>
        {step < steps.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            Weiter <ChevronRight size={16} aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Fertig
          </Button>
        )}
      </div>
    </Modal>
  )
}
