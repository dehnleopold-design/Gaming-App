import { RefreshCw } from 'lucide-react'
import { looksLikeVirtualCable, supportsContextSinkId, supportsElementSinkId } from '../lib/audio'
import { useSettings } from '../lib/settings'
import { useDevices } from '../lib/useDevices'
import { Button, Notice, Select } from './ui'

/** Auswahl von Ausgang (→ Discord) und Mithören-Gerät. Von Soundboard, Voice Changer und Einstellungen genutzt. */
export function AudioRouting({ compact }: { compact?: boolean }) {
  const { settings, update } = useSettings()
  const { outputs, hasLabels, requestLabels, refresh } = useDevices()

  const opts = [
    { value: '', label: 'Standard-Ausgabegerät' },
    ...outputs
      .filter((d) => d.deviceId !== 'default' && d.deviceId !== '')
      .map((d, i) => ({
        value: d.deviceId,
        label: (d.label || `Ausgabegerät ${i + 1}`) + (looksLikeVirtualCable(d.label) ? '  · virtuelles Kabel' : ''),
      })),
  ]

  if (!supportsContextSinkId) {
    return (
      <Notice tone="warn">
        Dein Browser kann das Ausgabegerät nicht wählen. Alles läuft über das Standardgerät. Für die
        Discord-Anbindung über ein virtuelles Kabel bitte Chrome oder Edge verwenden.
      </Notice>
    )
  }

  return (
    <div className={compact ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-4 md:grid-cols-2'}>
      <Select
        label="Ausgang (für Discord)"
        value={settings.outputId}
        onChange={(v) => update({ outputId: v })}
        options={opts}
      />
      <Select
        label="Mithören (deine Kopfhörer)"
        value={settings.monitorId}
        onChange={(v) => update({ monitorId: v })}
        options={opts}
      />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {!hasLabels && (
          <Button size="sm" onClick={requestLabels}>
            Gerätenamen anzeigen
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>
          Neu laden
        </Button>
        {!hasLabels && (
          <span className="text-[13px] text-muted">Der Browser zeigt Namen erst nach Mikrofon-Freigabe.</span>
        )}
        {!supportsElementSinkId && (
          <span className="text-[13px] text-muted">Mithören läuft in diesem Browser immer über das Standardgerät.</span>
        )}
      </div>
    </div>
  )
}
