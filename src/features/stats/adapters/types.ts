/**
 * Adapter-Schnittstelle für Statistik-Quellen.
 * Phase 1 nutzt nur den manuellen Adapter. Weitere Quellen (Steam, Riot,
 * CS2 Game State Integration, ggf. Xbox über Drittanbieter) implementieren
 * dieselbe Schnittstelle – API-Keys gehören dabei ausschließlich ins Backend.
 */

export interface StatField {
  key: string
  label: string
}

export interface PlayerResult {
  playerId: string
  /** true = Sieg, false = Niederlage, null = nicht erfasst */
  win: boolean | null
  stats: Record<string, number>
}

export interface Match {
  id: string
  game: string
  date: string // ISO-Datum (YYYY-MM-DD)
  results: PlayerResult[]
  source: string // Adapter-ID
}

export interface Player {
  id: string
  name: string
  color: string
}

export type AdapterStatus = 'available' | 'planned' | 'unofficial'

export interface StatsAdapter {
  id: string
  name: string
  status: AdapterStatus
  /** Was die Quelle liefern kann – ehrlich, ohne Übertreibung. */
  provides: string[]
  /** Was sie NICHT liefern kann. */
  limits: string[]
  phase: 1 | 2 | 3
  /** Lädt Matches; in Phase 1 nur beim manuellen Adapter implementiert. */
  fetchMatches?: () => Promise<Match[]>
}
