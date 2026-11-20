import { useCallback, useEffect, useState } from 'react'
import { listDevices, type DeviceLists } from './audio'

export function useDevices() {
  const [devices, setDevices] = useState<DeviceLists>({ inputs: [], outputs: [], hasLabels: false })

  const refresh = useCallback(async () => {
    try {
      setDevices(await listDevices())
    } catch {
      /* ignore */
    }
  }, [])

  /** Gerätenamen gibt der Browser erst nach einer Mikrofon-Freigabe heraus. */
  const requestLabels = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* abgelehnt */
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    void refresh()
    const md = navigator.mediaDevices
    md?.addEventListener?.('devicechange', refresh)
    return () => md?.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  return { ...devices, refresh, requestLabels }
}
