import { useEffect, useRef, useState } from 'react'

/** Alle Schlüssel tragen dieses Präfix, damit Export/Löschen nur App-Daten erfasst. */
export const STORAGE_PREFIX = 'squadnight:'

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch {
    // Speicher voll oder blockiert (z. B. privater Modus) – App läuft trotzdem weiter.
  }
}

/** useState, das seinen Wert in localStorage spiegelt. */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial
    return readJSON(key, fallback)
  })
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    writeJSON(key, value)
  }, [key, value])
  return [value, setValue] as const
}

export function allAppKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(STORAGE_PREFIX)) keys.push(k)
    }
  } catch {
    /* ignore */
  }
  return keys
}
