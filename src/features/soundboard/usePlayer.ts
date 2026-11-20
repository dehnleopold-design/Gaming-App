import { useCallback, useRef, useState } from 'react'
import { audio } from '../../lib/audio'
import { getBuffer, type Sound } from './soundStore'

export interface PlayingInfo {
  /** AudioContext-Zeit des letzten Starts */
  start: number
  duration: number
}

/** Spielt Sounds über den Soundboard-Bus der gemeinsamen Audio-Engine. */
export function usePlayer(overlap: boolean) {
  const sources = useRef(new Map<string, Set<AudioBufferSourceNode>>())
  const [playing, setPlaying] = useState<Record<string, PlayingInfo>>({})

  const stop = useCallback((id: string) => {
    sources.current.get(id)?.forEach((src) => {
      try {
        src.stop()
      } catch {
        /* bereits gestoppt */
      }
    })
  }, [])

  const stopAll = useCallback(() => {
    for (const id of sources.current.keys()) stop(id)
  }, [stop])

  const play = useCallback(
    async (s: Sound) => {
      await audio.resume()
      if (!overlap) stopAll()
      const ctx = audio.ctx
      const buffer = await getBuffer(s)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = s.volume
      src.connect(gain).connect(audio.soundBus)

      let set = sources.current.get(s.id)
      if (!set) sources.current.set(s.id, (set = new Set()))
      set.add(src)
      src.onended = () => {
        set!.delete(src)
        gain.disconnect()
        if (set!.size === 0) {
          sources.current.delete(s.id)
          setPlaying((p) => {
            const next = { ...p }
            delete next[s.id]
            return next
          })
        }
      }
      src.start()
      setPlaying((p) => ({ ...p, [s.id]: { start: ctx.currentTime, duration: buffer.duration } }))
    },
    [overlap, stopAll],
  )

  return { play, stop, stopAll, playing }
}
