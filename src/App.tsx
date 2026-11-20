import { useEffect, useState } from 'react'
import { BarChart3, Disc3, Mic, Settings as SettingsIcon, Volume2, type LucideIcon } from 'lucide-react'
import { Soundboard } from './features/soundboard/Soundboard'
import { Wheel } from './features/wheel/Wheel'
import { VoiceChanger } from './features/voice/VoiceChanger'
import { Stats } from './features/stats/Stats'
import { SettingsPage } from './features/settings/SettingsPage'
import { readJSON, writeJSON } from './lib/storage'
import { cn } from './lib/util'

export type TabId = 'soundboard' | 'wheel' | 'voice' | 'stats' | 'settings'

const TABS: { id: TabId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'soundboard', label: 'Soundboard', short: 'Sounds', icon: Volume2 },
  { id: 'wheel', label: 'Glücksrad', short: 'Rad', icon: Disc3 },
  { id: 'voice', label: 'Voice Changer', short: 'Voice', icon: Mic },
  { id: 'stats', label: 'Statistiken', short: 'Stats', icon: BarChart3 },
  { id: 'settings', label: 'Einstellungen', short: 'Setup', icon: SettingsIcon },
]

function initialTab(): TabId {
  if (location.hash.startsWith('#wheel=')) return 'wheel'
  const saved = readJSON<TabId>('tab', 'soundboard')
  return TABS.some((t) => t.id === saved) ? saved : 'soundboard'
}

export default function App() {
  const [tab, setTab] = useState<TabId>(initialTab)
  useEffect(() => writeJSON('tab', tab), [tab])

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Seitenleiste (Desktop) */}
      <nav aria-label="Hauptnavigation" className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent font-display text-sm font-bold text-on-accent">S</span>
          <span className="font-display text-[17px] font-semibold tracking-tight">Squad Night</span>
        </div>
        <ul className="flex flex-col gap-0.5 p-3">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  tab === t.id ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg',
                )}
              >
                {tab === t.id && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />}
                <t.icon size={17} strokeWidth={1.8} aria-hidden />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-auto px-5 pb-5 text-[12px] leading-relaxed text-muted">
          Alle Daten bleiben lokal in deinem Browser.
        </p>
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
          {/* Alle Tabs bleiben gemountet: Voice Changer und Sounds laufen beim Tab-Wechsel weiter. */}
          <div hidden={tab !== 'soundboard'}><Soundboard /></div>
          <div hidden={tab !== 'wheel'}><Wheel active={tab === 'wheel'} /></div>
          <div hidden={tab !== 'voice'}><VoiceChanger /></div>
          <div hidden={tab !== 'stats'}><Stats /></div>
          <div hidden={tab !== 'settings'}><SettingsPage /></div>
        </div>
      </main>

      {/* Tab-Leiste (Handy) */}
      <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 text-[11px]',
                  tab === t.id ? 'text-accent' : 'text-muted',
                )}
              >
                <t.icon size={20} strokeWidth={1.8} aria-hidden />
                {t.short}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
