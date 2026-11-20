import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Download,
  ExternalLink,
  FileAudio,
  HelpCircle,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import { AudioRouting } from '../../components/AudioRouting'
import { Button, EmptyState, Modal, Notice, PageHeader, Slider, Toggle } from '../../components/ui'
import { audio } from '../../lib/audio'
import { useSettings } from '../../lib/settings'
import { usePersistentState } from '../../lib/storage'
import { cn, downloadFile, formatDuration, isTypingTarget, keyLabel } from '../../lib/util'
import {
  RESERVED_KEYS,
  createSoundFromFile,
  exportSounds,
  isAudioFile,
  parseSoundExport,
  soundDB,
  type Sound,
} from './soundStore'
import { usePlayer, type PlayingInfo } from './usePlayer'

const MYINSTANTS = 'https://www.myinstants.com'

export function Soundboard() {
  const { settings, update } = useSettings()
  const [sounds, setSounds] = useState<Sound[]>([])
  const [loaded, setLoaded] = useState(false)
  const [volume, setVolume] = usePersistentState('sb.volume', 0.8)
  const [overlap, setOverlap] = usePersistentState('sb.overlap', true)
  const [category, setCategory] = useState<string>('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Sound | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkErrors, setLinkErrors] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const { play, stop, stopAll, playing } = usePlayer(overlap)

  useEffect(() => {
    soundDB
      .all()
      .then(setSounds)
      .catch(() => setErrors(['Gespeicherte Sounds konnten nicht geladen werden (IndexedDB nicht verfügbar?).']))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (audio.isReady) audio.soundBus.gain.value = volume
  }, [volume])

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      const errs: string[] = []
      let current = sounds
      for (const f of list) {
        if (!isAudioFile(f)) {
          errs.push(`„${f.name}“ ist keine Audiodatei.`)
          continue
        }
        try {
          // resume() nicht abwarten: außerhalb eines Klicks (z. B. nach einem Download) bleibt es in Safari hängen
          void audio.resume().catch(() => undefined)
          audio.soundBus.gain.value = volume
          const s = await createSoundFromFile(f, current)
          await soundDB.save(s)
          current = [...current, s]
        } catch (e) {
          errs.push((e as Error).message)
        }
      }
      setSounds(current)
      setErrors(errs)
    },
    [sounds, volume],
  )

  /** Lädt Sounds über die Server-Funktion /api/sound (umgeht fehlende CORS-Header der Quellseiten). */
  const addFromLinks = async () => {
    const links = linkText
      .split(/\s+/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l))
    if (links.length === 0) {
      setLinkErrors(['Bitte einen Link einfügen, der mit http:// oder https:// beginnt.'])
      return
    }
    void audio.resume().catch(() => undefined) // noch innerhalb des Klicks
    setLinkBusy(true)
    setLinkErrors([])
    const files: File[] = []
    const errs: string[] = []
    for (const link of links.slice(0, 20)) {
      try {
        const r = await fetch(`/api/sound?url=${encodeURIComponent(link)}`)
        const type = r.headers.get('content-type') ?? ''
        if (!r.ok || !type.startsWith('audio/')) {
          let msg = `Fehler ${r.status}`
          if (type.includes('json')) msg = ((await r.json()) as { error?: string }).error ?? msg
          else if (r.status === 404 || type.includes('html')) msg = 'Link-Import braucht die Server-Funktion (läuft auf Vercel bzw. mit npm run dev).'
          errs.push(`${link}: ${msg}`)
          continue
        }
        const name = decodeURIComponent(r.headers.get('x-sound-name') ?? '') || 'Sound'
        const ext = type.includes('wav') ? 'wav' : type.includes('ogg') ? 'ogg' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : 'mp3'
        files.push(new File([await r.blob()], `${name}.${ext}`, { type: type.split(';')[0] }))
      } catch {
        errs.push(`${link}: Keine Verbindung.`)
      }
    }
    if (files.length) await addFiles(files)
    setLinkBusy(false)
    setLinkErrors(errs)
    if (errs.length === 0) {
      setLinkText('')
      setLinkOpen(false)
    }
  }

  const saveSound = async (s: Sound) => {
    // Eine Taste gehört immer nur einem Sound: beim alten Besitzer entfernen.
    const next = sounds.map((x) => (x.id === s.id ? s : s.key && x.key === s.key ? { ...x, key: null } : x))
    for (const x of next) if (x !== sounds.find((o) => o.id === x.id)) await soundDB.save(x)
    setSounds(next)
  }

  const removeSound = async (id: string) => {
    stop(id)
    await soundDB.remove(id)
    setSounds((list) => list.filter((x) => x.id !== id))
  }

  const trigger = useCallback(
    (s: Sound) => {
      if (audio.isReady) audio.soundBus.gain.value = volume
      void play(s)
    },
    [play, volume],
  )

  // Tastenkürzel: wirken nur, solange dieses Browserfenster den Fokus hat.
  useEffect(() => {
    if (!settings.shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.code === 'Escape') {
        stopAll()
        return
      }
      const s = sounds.find((x) => x.key === e.code)
      if (s) {
        e.preventDefault()
        trigger(s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sounds, settings.shortcuts, stopAll, trigger])

  const categories = useMemo(
    () => Array.from(new Set(sounds.map((s) => s.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de')),
    [sounds],
  )

  const visible = sounds.filter(
    (s) => (!category || s.category === category) && (!query || s.name.toLowerCase().includes(query.toLowerCase())),
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
  }

  const doExport = async () => {
    downloadFile(`squad-night-soundboard-${new Date().toISOString().slice(0, 10)}.json`, await exportSounds(sounds), 'application/json')
  }

  const doImport = async (file: File) => {
    try {
      const imported = parseSoundExport(JSON.parse(await file.text()))
      for (const s of imported) await soundDB.save(s)
      setSounds(await soundDB.all())
      setErrors([])
    } catch (e) {
      setErrors([(e as Error).message || 'Import fehlgeschlagen.'])
    }
  }

  const anyPlaying = Object.keys(playing).length > 0

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
      className="relative"
    >
      <PageHeader
        title="Soundboard"
        description="Eigene Sounds hochladen, per Klick oder Taste abspielen."
        actions={
          <>
            <a
              href={MYINSTANTS}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-accent/50 px-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Sounds finden auf Myinstants
              <ExternalLink size={15} aria-hidden />
            </a>
            <Button icon={Link2} onClick={() => setLinkOpen(true)}>
              Per Link
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => fileInput.current?.click()}>
              Datei hinzufügen
            </Button>
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void doImport(f)
          e.target.value = ''
        }}
      />

      {/* Steuerleiste */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3 lg:w-64">
          <Volume2 size={16} className="shrink-0 text-muted" aria-hidden />
          <Slider
            className="flex-1"
            value={volume}
            min={0}
            max={1}
            step={0.01}
            onChange={setVolume}
            label="Gesamtlautstärke"
            format={(v) => `${Math.round(v * 100)} %`}
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <div className="relative min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input className="field h-9 py-0 pl-9" placeholder="Suchen" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Sounds suchen" />
          </div>
          <Button variant={anyPlaying ? 'primary' : 'secondary'} icon={Square} onClick={stopAll} disabled={!anyPlaying}>
            Alle stoppen <span className="kbd ml-1 border-current/30">Esc</span>
          </Button>
          <Button variant="ghost" icon={HelpCircle} onClick={() => setHelpOpen(true)}>
            Discord
          </Button>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Kategorie filtern">
          {['', ...categories].map((c) => (
            <button
              key={c || 'all'}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] transition-colors',
                category === c ? 'border-fg bg-fg text-bg' : 'border-line text-muted hover:border-muted hover:text-fg',
              )}
            >
              {c || 'Alle'}
            </button>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-5 space-y-1">
          {errors.map((e, i) => (
            <Notice key={i} tone="warn">
              {e}
            </Notice>
          ))}
        </div>
      )}

      {loaded && sounds.length === 0 ? (
        <EmptyState
          icon={FileAudio}
          title="Noch keine Sounds"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={MYINSTANTS}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3.5 text-sm font-medium hover:bg-raised"
              >
                Myinstants öffnen <ExternalLink size={15} aria-hidden />
              </a>
              <Button icon={Link2} onClick={() => setLinkOpen(true)}>
                Link einfügen
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => fileInput.current?.click()}>
                Datei wählen
              </Button>
            </div>
          }
        >
          Link einer Myinstants-Sound-Seite einfügen – oder eine Datei herunterladen und hier reinziehen. MP3, WAV, OGG und M4A bis 20&nbsp;MB.
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((s) => (
              <SoundButton
                key={s.id}
                sound={s}
                playing={playing[s.id]}
                onPlay={() => trigger(s)}
                onStop={() => stop(s.id)}
                onEdit={() => setEditing(s)}
              />
            ))}
            <li className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Sound hinzufügen"
                className="grid aspect-square w-full max-w-[112px] place-items-center rounded-full border-2 border-dashed border-line text-muted transition-colors hover:border-muted hover:text-fg"
              >
                <Plus size={26} aria-hidden />
              </button>
              <span className="mt-2.5 text-[13px] text-muted">Hinzufügen</span>
            </li>
          </ul>
          {visible.length === 0 && <p className="mt-4 text-sm text-muted">Keine Treffer für diese Auswahl.</p>}
        </>
      )}

      {/* Fußleiste: Optionen + Backup */}
      <div className="mt-8 flex flex-col gap-4 border-t border-line pt-5 md:flex-row md:items-center md:justify-between">
        <Toggle checked={overlap} onChange={setOverlap} label="Sounds überlappen" description="Aus: Ein neuer Sound stoppt alle laufenden." />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={Download} onClick={doExport} disabled={sounds.length === 0}>
            Backup exportieren
          </Button>
          <Button size="sm" variant="ghost" icon={Upload} onClick={() => importInput.current?.click()}>
            Backup importieren
          </Button>
        </div>
      </div>
      {settings.shortcuts && sounds.length > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          Tastenkürzel funktionieren nur, solange dieses Browserfenster im Vordergrund ist – nicht während das Spiel den Fokus hat.
          Das ist eine Grenze von Browsern, keine Einstellung.
        </p>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-bg/85">
          <div className="text-center">
            <Upload className="mx-auto text-accent" size={28} aria-hidden />
            <p className="mt-2 font-display text-lg font-semibold">Loslassen zum Hinzufügen</p>
          </div>
        </div>
      )}

      <EditSoundModal
        sound={editing}
        sounds={sounds}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={async (s) => {
          await saveSound(s)
          setEditing(null)
        }}
        onDelete={async (id) => {
          await removeSound(id)
          setEditing(null)
        }}
      />

      <Modal open={linkOpen} onClose={() => !linkBusy && setLinkOpen(false)} title="Sound per Link hinzufügen">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void addFromLinks()
          }}
        >
          <label className="block">
            <span className="label">Link(s)</span>
            <textarea
              className="field min-h-[96px] resize-y font-mono text-[13px]"
              placeholder={'https://www.myinstants.com/de/instant/…\nOder direkter Link auf eine .mp3'}
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              autoFocus
              disabled={linkBusy}
            />
          </label>
          <ul className="space-y-1 text-[13px] text-muted">
            <li>• Myinstants: Sound öffnen, Link der Seite kopieren und hier einfügen.</li>
            <li>• Andere Seiten: direkter Link auf eine Audiodatei (.mp3, .wav, .ogg …).</li>
            <li>• Mehrere Links: einer pro Zeile.</li>
          </ul>
          {linkErrors.map((e, i) => (
            <Notice key={i} tone="warn">
              <span className="break-all">{e}</span>
            </Notice>
          ))}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={() => setLinkOpen(false)} disabled={linkBusy}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" icon={Link2} disabled={linkBusy || !linkText.trim()}>
              {linkBusy ? 'Lädt …' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="So hören deine Freunde die Sounds in Discord" wide>
        <div className="space-y-5 text-sm leading-relaxed">
          <p className="text-muted">
            Was der Browser abspielt, hörst erstmal nur du. Damit es im Sprachkanal ankommt, gibt es zwei Wege:
          </p>
          <div>
            <h3 className="mb-1 font-semibold">Variante A: Virtuelles Audiokabel (live)</h3>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                Ein virtuelles Kabel installieren, z. B.{' '}
                <a className="text-accent underline-offset-2 hover:underline" href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer">
                  VB-Audio Virtual Cable
                </a>
                .
              </li>
              <li>Unten als „Ausgang“ das Kabel wählen („CABLE Input“).</li>
              <li>In Discord unter Sprache &amp; Video das Kabel als Eingabegerät wählen („CABLE Output“).</li>
              <li>
                Damit Discord auch deine Stimme bekommt, im Tab <strong className="text-fg">Voice Changer</strong> das Mikrofon
                einschalten (Preset „Normal“ = unveränderte Stimme).
              </li>
            </ol>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Variante B: Discord-eigenes Soundboard</h3>
            <p className="text-muted">
              Sound über das Menü einer Kachel herunterladen und in den Server-Einstellungen von Discord unter „Soundboard“
              hochladen. Discord begrenzt Länge und Größe der Sounds – die aktuellen Limits stehen dort beim Upload.
            </p>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 font-semibold">Audio-Routing</h3>
            <AudioRouting compact />
            <div className="mt-4 space-y-3">
              <Toggle
                checked={settings.soundToOutput}
                onChange={(v) => update({ soundToOutput: v })}
                label="Sounds an den Ausgang senden"
                description="Aus: Sounds hörst nur du (zum Vorhören)."
              />
              <Toggle
                checked={settings.soundToMonitor}
                onChange={(v) => update({ soundToMonitor: v })}
                label="Sounds selbst mithören"
                description="Nur wirksam, wenn Ausgang und Mithören-Gerät verschieden sind."
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/** Runder Drück-Button in der Akzentfarbe; Ring um den Button zeigt den Fortschritt. */
function SoundButton({
  sound,
  playing,
  onPlay,
  onStop,
  onEdit,
}: {
  sound: Sound
  playing?: PlayingInfo
  onPlay: () => void
  onStop: () => void
  onEdit: () => void
}) {
  const ring = useRef<SVGCircleElement>(null)
  const [pressed, setPressed] = useState(false)
  const R = 48
  const C = 2 * Math.PI * R

  // Fortschritt als Ring
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const p = Math.min(1, (audio.ctx.currentTime - playing.start) / playing.duration)
      ring.current?.setAttribute('stroke-dashoffset', String(C * (1 - p)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [playing, C])

  // Kurz „gedrückt“ anzeigen – auch wenn per Tastenkürzel ausgelöst
  useEffect(() => {
    if (!playing) return
    setPressed(true)
    const t = setTimeout(() => setPressed(false), 130)
    return () => clearTimeout(t)
  }, [playing?.start])

  return (
    <li className="group relative flex flex-col items-center">
      <div className="relative aspect-square w-full max-w-[112px]">
        {/* Fortschrittsring */}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" className="stroke-line" strokeWidth="2.5" />
          {playing && (
            <circle
              ref={ring}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              className="stroke-fg"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C}
            />
          )}
        </svg>
        {/* Sockel + Button */}
        <div className="absolute inset-[9%] rounded-full bg-raised shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            onClick={onPlay}
            data-pressed={pressed || undefined}
            aria-label={`${sound.name} abspielen`}
            className="sound-btn absolute inset-[9%] rounded-full"
          />
        </div>
        {/* Aktionen */}
        <div className="absolute -right-1 -top-1 flex flex-col gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={MoreHorizontal}
            onClick={onEdit}
            aria-label={`${sound.name} bearbeiten`}
            className="h-7 w-7 rounded-full border border-line bg-surface opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          />
          {playing && (
            <Button
              size="sm"
              variant="ghost"
              icon={Square}
              onClick={onStop}
              aria-label={`${sound.name} stoppen`}
              className="h-7 w-7 rounded-full border border-line bg-surface"
            />
          )}
        </div>
      </div>
      <span className="mt-2.5 line-clamp-2 max-w-[140px] text-center text-[13px] font-medium leading-snug">{sound.name}</span>
      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="font-mono">{formatDuration(sound.duration)}</span>
        {sound.key && <span className="kbd">{keyLabel(sound.key)}</span>}
      </span>
    </li>
  )
}

function EditSoundModal({
  sound,
  sounds,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  sound: Sound | null
  sounds: Sound[]
  categories: string[]
  onClose: () => void
  onSave: (s: Sound) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<Sound | null>(sound)
  const [recording, setRecording] = useState(false)
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    setDraft(sound)
    setRecording(false)
    setKeyError('')
  }, [sound])

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setRecording(false)
        return
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        setDraft((d) => d && { ...d, key: null })
        setRecording(false)
        return
      }
      if (RESERVED_KEYS.has(e.code)) {
        setKeyError(`${keyLabel(e.code)} ist reserviert.`)
        return
      }
      const other = sounds.find((s) => s.key === e.code && s.id !== sound?.id)
      setKeyError(other ? `Taste war bei „${other.name}“ – dort wird sie entfernt.` : '')
      setDraft((d) => d && { ...d, key: e.code })
      setRecording(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, sounds, sound])

  if (!draft) return null

  const save = () => onSave({ ...draft, name: draft.name.trim() || 'Sound', category: draft.category.trim() })

  return (
    <Modal open={!!sound} onClose={onClose} title="Sound bearbeiten">
      <div className="space-y-4">
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Kategorie</span>
          <input
            className="field"
            list="sb-categories"
            placeholder="z. B. Memes, Fails, Siege"
            value={draft.category}
            maxLength={24}
            onChange={(e) => setDraft({ ...draft, category: e.target.value.trimStart() })}
          />
          <datalist id="sb-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <Slider
          label="Lautstärke"
          value={draft.volume}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v) => setDraft({ ...draft, volume: v })}
          format={(v) => `${Math.round(v * 100)} %`}
        />
        <div>
          <span className="label">Tastenkürzel</span>
          <div className="flex items-center gap-2">
            <Button onClick={() => setRecording(true)} variant={recording ? 'primary' : 'secondary'}>
              {recording ? 'Taste drücken …' : draft.key ? keyLabel(draft.key) : 'Keins'}
            </Button>
            {draft.key && !recording && (
              <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, key: null })}>
                Entfernen
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">{keyError || 'Esc bricht ab, Rücktaste entfernt das Kürzel.'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div className="flex gap-1">
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(draft.id)}>
              Löschen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              onClick={() => {
                const ext = draft.type.split('/')[1]?.replace('mpeg', 'mp3') ?? 'mp3'
                downloadFile(`${draft.name}.${ext}`, draft.blob, draft.type)
              }}
            >
              Datei
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={save}>
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
