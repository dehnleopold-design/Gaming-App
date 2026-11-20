import type { StatsAdapter } from './types'

export const ADAPTERS: StatsAdapter[] = [
  {
    id: 'manual',
    name: 'Manuell',
    status: 'available',
    phase: 1,
    provides: ['Beliebige Spiele', 'Frei definierbare Werte (Kills, Tode, Punkte …)', 'Sieg/Niederlage pro Spieler'],
    limits: ['Alles wird von Hand eingetragen'],
  },
  {
    id: 'steam',
    name: 'Steam Web API',
    status: 'planned',
    phase: 2,
    provides: ['Profil', 'Spielzeit pro Spiel', 'Erfolge'],
    limits: ['Keine Match-Verläufe für die meisten Spiele', 'Profil muss öffentlich sein', 'API-Key nötig (nur im Backend)'],
  },
  {
    id: 'riot',
    name: 'Riot API (League of Legends)',
    status: 'planned',
    phase: 2,
    provides: ['Match-Verlauf', 'KDA, CS, Gold, Champion pro Match'],
    limits: ['API-Key nötig, für dauerhaften Betrieb Freigabe durch Riot', 'Valorant-Daten nur mit Sonderfreigabe'],
  },
  {
    id: 'cs2-gsi',
    name: 'CS2 Live (Game State Integration)',
    status: 'planned',
    phase: 3,
    provides: ['Live: Runde, Punktestand, Kills/Tode, Leben, Geld'],
    limits: ['Braucht ein kleines Hilfsprogramm auf dem Spiel-PC', 'Nur eigene Daten bzw. Zuschauer-Daten'],
  },
  {
    id: 'xbox',
    name: 'Xbox (inoffiziell, z. B. OpenXBL)',
    status: 'unofficial',
    phase: 3,
    provides: ['Erfolge, Gamerscore, zuletzt gespielt'],
    limits: ['Kein offizieller Zugang ohne Microsoft-Partnerschaft', 'Keine Live-Match-Statistiken', 'Abhängig von Drittanbieter'],
  },
]
