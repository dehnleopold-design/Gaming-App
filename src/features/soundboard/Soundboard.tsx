import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Download,
  ExternalLink,
  FileAudio,
  HelpCircle,
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
  TILE_COLORS,
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
          await audio.resume()
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
            <Button variant="primary" icon={Plus} onClick={() => fileInput.current?.click()}>
              Sounds hinzufügen
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
              <Button variant="primary" icon={Plus} onClick={() => fileInput.current?.click()}>
                Datei wählen
              </Button>
            </div>
          }
        >
          Sound auf Myinstants herunterladen → hier reinziehen. MP3, WAV, OGG und M4A bis 20&nbsp;MB.
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((s) => (
              <SoundTile
                key={s.id}
                sound={s}
                playing={playing[s.id]}
                onPlay={() => trigger(s)}
                onStop={() => stop(s.id)}
                onEdit={() => setEditing(s)}
              />
            ))}
            <li>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-full min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[13px] text-muted transition-colors hover:border-muted hover:text-fg"
              >
                <Plus size={18} aria-hidden />
                Hinzufügen
              </button>
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

function SoundTile({
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
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const p = Math.min(1, (audio.ctx.currentTime - playing.start) / playing.duration)
      if (bar.current) bar.current.style.transform = `scaleX(${p})`
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [playing])

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onPlay}
        className={cn(
          'relative flex h-full min-h-[104px] w-full flex-col justify-between overflow-hidden rounded-lg border bg-surface p-3 text-left transition-colors',
          playing ? 'border-fg/40 bg-raised' : 'border-line hover:border-muted/60 hover:bg-raised',
        )}
        aria-label={`${sound.name} abspielen`}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: sound.color }} aria-hidden />
        <span className="line-clamp-2 pr-6 font-medium leading-snug">{sound.name}</span>
        <span className="mt-3 flex items-center justify-between gap-2 text-[12px] text-muted">
          <span className="font-mono">{formatDuration(sound.duration)}</span>
          {sound.key && <span className="kbd">{keyLabel(sound.key)}</span>}
        </span>
        {playing && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-line" aria-hidden>
            <span ref={bar} className="block h-full origin-left" style={{ background: sound.color, transform: 'scaleX(0)' }} />
          </span>
        )}
      </button>
      <div className="absolute right-1.5 top-1.5 flex gap-0.5">
        {playing && (
          <Button size="sm" variant="ghost" icon={Square} onClick={onStop} aria-label={`${sound.name} stoppen`} className="h-7 w-7 bg-surface" />
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={MoreHorizontal}
          onClick={onEdit}
          aria-label={`${sound.name} bearbeiten`}
          className="h-7 w-7 opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
        />
      </div>
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
        <div>
          <span className="label">Farbe</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
            {TILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draft.color === c}
                aria-label={c}
                onClick={() => setDraft({ ...draft, color: c })}
                className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface', draft.color === c && 'ring-2 ring-fg')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
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
