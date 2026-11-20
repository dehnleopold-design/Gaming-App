import { useRef, useState } from 'react'
import { Download, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { AudioRouting } from '../../components/AudioRouting'
import { Button, Notice, PageHeader, Section, Toggle } from '../../components/ui'
import { ACCENTS, useSettings } from '../../lib/settings'
import { STORAGE_PREFIX, allAppKeys } from '../../lib/storage'
import { cn, downloadFile } from '../../lib/util'
import { exportSounds, parseSoundExport, soundDB } from '../soundboard/soundStore'

export function SettingsPage() {
  const { settings, update } = useSettings()
  const importRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const exportAll = async () => {
    const local: Record<string, string> = {}
    for (const k of allAppKeys()) local[k] = localStorage.getItem(k) ?? ''
    const sounds = JSON.parse(await exportSounds(await soundDB.all()))
    const data = JSON.stringify({ app: 'squad-night', kind: 'full', version: 1, local, sounds })
    downloadFile(`squad-night-backup-${new Date().toISOString().slice(0, 10)}.json`, data, 'application/json')
  }

  const importAll = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { kind?: string; local?: Record<string, string>; sounds?: unknown }
      if (data.kind !== 'full' || !data.local) throw new Error('Keine vollständige Squad-Night-Sicherung.')
      if (!confirm('Aktuelle Daten werden durch die Sicherung ersetzt. Fortfahren?')) return
      for (const k of allAppKeys()) localStorage.removeItem(k)
      for (const [k, v] of Object.entries(data.local)) if (k.startsWith(STORAGE_PREFIX)) localStorage.setItem(k, v)
      await soundDB.clear()
      if (data.sounds) for (const s of parseSoundExport(data.sounds)) await soundDB.save(s)
      location.reload()
    } catch (e) {
      setMessage({ tone: 'warn', text: (e as Error).message || 'Import fehlgeschlagen.' })
    }
  }

  const wipe = async () => {
    if (!confirm('Wirklich ALLE Daten löschen? Sounds, Räder, Statistiken und Einstellungen. Das lässt sich nicht rückgängig machen.')) return
    for (const k of allAppKeys()) localStorage.removeItem(k)
    await soundDB.clear().catch(() => undefined)
    location.reload()
  }

  return (
    <div>
      <PageHeader title="Einstellungen" />

      <div className="grid max-w-3xl gap-4">
        <Section title="Darstellung">
          <div className="space-y-5">
            <div>
              <span className="label">Theme</span>
              <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Theme">
                {(
                  [
                    ['dark', 'Dunkel', Moon],
                    ['light', 'Hell', Sun],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={settings.theme === id}
                    onClick={() => update({ theme: id })}
                    className={cn(
                      'flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
                      settings.theme === id ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    <Icon size={15} aria-hidden /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Akzentfarbe</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Akzentfarbe">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.accent === a.id}
                    onClick={() => update({ accent: a.id })}
                    className={cn(
                      'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors',
                      settings.accent === a.id ? 'border-fg' : 'border-line text-muted hover:text-fg',
                    )}
                  >
                    <span className="h-5 w-5 rounded-full" style={{ background: a.hex }} aria-hidden />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Bedienung">
          <Toggle
            checked={settings.shortcuts}
            onChange={(v) => update({ shortcuts: v })}
            label="Tastenkürzel"
            description="Soundboard-Tasten, Esc (alle stoppen), Leertaste (Glücksrad), Shift+1–9 und ^ (Voice Changer). Wirken nur, solange das Browserfenster den Fokus hat."
          />
        </Section>

        <Section title="Audio">
          <AudioRouting />
          <p className="mt-4 text-[13px] text-muted">Soundboard und Voice Changer nutzen denselben Ausgang – in Discord kommt beides zusammen an.</p>
        </Section>

        <Section title="Daten">
          <p className="mb-4 text-sm text-muted">
            Alles liegt nur in diesem Browser (localStorage und IndexedDB). Browserdaten löschen = App-Daten weg. Regelmäßig sichern.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={() => void exportAll()}>
              Alles exportieren
            </Button>
            <Button icon={Upload} onClick={() => importRef.current?.click()}>
              Sicherung importieren
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => void wipe()}>
              Alle Daten löschen
            </Button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importAll(f)
              e.target.value = ''
            }}
          />
          {message && (
            <div className="mt-4">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
