import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { audio } from './audio'
import { usePersistentState } from './storage'

export type Theme = 'dark' | 'light'
export type Accent = 'orange' | 'lime' | 'cyan' | 'pink' | 'yellow'

export const ACCENTS: { id: Accent; label: string; hex: string }[] = [
  { id: 'orange', label: 'Orange', hex: '#FF6B2C' },
  { id: 'lime', label: 'Lime', hex: '#B8F03C' },
  { id: 'cyan', label: 'Cyan', hex: '#2CD3E1' },
  { id: 'pink', label: 'Pink', hex: '#FF4D8D' },
  { id: 'yellow', label: 'Gelb', hex: '#FFC53D' },
]

export interface Settings {
  theme: Theme
  accent: Accent
  shortcuts: boolean
  outputId: string
  monitorId: string
  soundToOutput: boolean
  soundToMonitor: boolean
}

const DEFAULTS: Settings = {
  theme: 'dark',
  accent: 'orange',
  shortcuts: true,
  outputId: '',
  monitorId: '',
  soundToOutput: true,
  soundToMonitor: true,
}

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<Ctx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistentState<Settings>('settings', DEFAULTS)
  const settings = { ...DEFAULTS, ...stored }

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.dataset.accent = settings.accent
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'dark' ? '#0F1012' : '#F6F6F4')
  }, [settings.theme, settings.accent])

  useEffect(() => {
    audio.setRouting({
      outputId: settings.outputId,
      monitorId: settings.monitorId,
      soundToOutput: settings.soundToOutput,
      soundToMonitor: settings.soundToMonitor,
    })
  }, [settings.outputId, settings.monitorId, settings.soundToOutput, settings.soundToMonitor])

  const update = (patch: Partial<Settings>) => setStored((s) => ({ ...DEFAULTS, ...s, ...patch }))

  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings außerhalb von SettingsProvider')
  return ctx
}
