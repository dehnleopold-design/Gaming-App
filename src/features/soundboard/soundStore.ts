import { audio } from '../../lib/audio'
import { idb } from '../../lib/idb'
import { base64ToBlob, blobToBase64, uid } from '../../lib/util'

export const TILE_COLORS = ['#FF6B2C', '#FFC53D', '#B8F03C', '#3DDC97', '#2CD3E1', '#4D8DFF', '#A77BFF', '#FF4D8D'] as const

export interface Sound {
  id: string
  name: string
  blob: Blob
  type: string
  duration: number
  color: string
  volume: number
  key: string | null
  category: string
  createdAt: number
}

/** Tasten, die für andere Funktionen reserviert sind. */
export const RESERVED_KEYS = new Set(['Escape', 'Space', 'Backquote', 'Tab', 'Enter'])

const DEFAULT_KEYS = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyZ', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
]

export function nextFreeKey(sounds: Sound[]): string | null {
  const used = new Set(sounds.map((s) => s.key))
  return DEFAULT_KEYS.find((k) => !used.has(k)) ?? null
}

const MAX_BYTES = 20 * 1024 * 1024
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|webm|flac)$/i

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)
}

const buffers = new Map<string, AudioBuffer>()

async function decode(blob: Blob): Promise<AudioBuffer> {
  return audio.ctx.decodeAudioData(await blob.arrayBuffer())
}

export async function getBuffer(s: Sound): Promise<AudioBuffer> {
  let b = buffers.get(s.id)
  if (!b) {
    b = await decode(s.blob)
    buffers.set(s.id, b)
  }
  return b
}

export function forgetBuffer(id: string) {
  buffers.delete(id)
}

export async function createSoundFromFile(file: File, existing: Sound[]): Promise<Sound> {
  if (file.size > MAX_BYTES) throw new Error(`„${file.name}“ ist größer als 20 MB.`)
  const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' })
  let buffer: AudioBuffer
  try {
    buffer = await decode(blob)
  } catch {
    throw new Error(`„${file.name}“ konnte nicht gelesen werden. Ist es eine Audiodatei?`)
  }
  const id = uid()
  buffers.set(id, buffer)
  return {
    id,
    name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Sound',
    blob,
    type: blob.type,
    duration: buffer.duration,
    color: TILE_COLORS[existing.length % TILE_COLORS.length]!,
    volume: 1,
    key: nextFreeKey(existing),
    category: '',
    createdAt: Date.now(),
  }
}

export const soundDB = {
  all: async () => (await idb.getAll<Sound>()).sort((a, b) => a.createdAt - b.createdAt),
  save: (s: Sound) => idb.put(s),
  remove: (id: string) => {
    forgetBuffer(id)
    return idb.delete(id)
  },
  clear: () => {
    buffers.clear()
    return idb.clear()
  },
}

interface ExportedSound extends Omit<Sound, 'blob'> {
  data: string
}

export async function exportSounds(sounds: Sound[]): Promise<string> {
  const list: ExportedSound[] = []
  for (const { blob, ...meta } of sounds) list.push({ ...meta, data: await blobToBase64(blob) })
  return JSON.stringify({ app: 'squad-night', kind: 'soundboard', version: 1, sounds: list })
}

export function parseSoundExport(json: unknown): Sound[] {
  const obj = json as { kind?: string; sounds?: ExportedSound[] }
  if (obj?.kind !== 'soundboard' || !Array.isArray(obj.sounds)) throw new Error('Keine gültige Soundboard-Datei.')
  return obj.sounds.map(({ data, ...meta }) => ({ ...meta, blob: base64ToBlob(data, meta.type) }))
}
