import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Plus, Trash2, Trophy, UserPlus, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, EmptyState, Modal, Notice, PageHeader, Section, Select } from '../../components/ui'
import { useSettings } from '../../lib/settings'
import { usePersistentState } from '../../lib/storage'
import { cn, downloadFile, uid } from '../../lib/util'
import { ADAPTERS } from './adapters/registry'
import type { Match, Player, PlayerResult, StatField } from './adapters/types'

const PLAYER_COLORS = ['#FF6B2C', '#2CD3E1', '#B8F03C', '#FF4D8D', '#FFC53D', '#A77BFF', '#3DDC97', '#4D8DFF']

const DEFAULT_FIELDS: StatField[] = [
  { key: 'kills', label: 'Kills' },
  { key: 'deaths', label: 'Tode' },
  { key: 'points', label: 'Punkte' },
]

const today = () => new Date().toISOString().slice(0, 10)
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: d }) : '–')

/** Liest eine CSS-Farbvariable als rgb()-String – Recharts braucht echte Farbwerte. */
function useCssColor(name: string): string {
  const { settings } = useSettings()
  const [c, setC] = useState('rgb(255 107 44)')
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (v) setC(`rgb(${v.split(/\s+/).join(', ')})`)
  }, [name, settings.accent, settings.theme])
  return c
}

interface PlayerSummary {
  player: Player
  played: number
  wins: number
  losses: number
  winRate: number
  avg: Record<string, number>
}

export function Stats() {
  const [players, setPlayers] = usePersistentState<Player[]>('stats.players', [])
  const [fields, setFields] = usePersistentState<StatField[]>('stats.fields', DEFAULT_FIELDS)
  const [matches, setMatches] = usePersistentState<Match[]>('stats.matches', [])
  const [game, setGame] = useState('')
  const [trendPlayer, setTrendPlayer] = useState('')
  const [barField, setBarField] = useState('')
  const [adding, setAdding] = useState(false)
  const [newPlayer, setNewPlayer] = useState('')
  const [newField, setNewField] = useState('')

  const accent = useCssColor('--accent')
  const lineColor = useCssColor('--line')
  const mutedColor = useCssColor('--muted')
  const surface = useCssColor('--surface')

  const games = useMemo(() => Array.from(new Set(matches.map((m) => m.game))).sort((a, b) => a.localeCompare(b, 'de')), [matches])
  const filtered = useMemo(
    () => matches.filter((m) => !game || m.game === game).sort((a, b) => a.date.localeCompare(b.date)),
    [matches, game],
  )

  const summaries: PlayerSummary[] = useMemo(() => {
    return players
      .map((player) => {
        const res = filtered.flatMap((m) => m.results.filter((r) => r.playerId === player.id))
        const wins = res.filter((r) => r.win === true).length
        const losses = res.filter((r) => r.win === false).length
        const avg: Record<string, number> = {}
        for (const f of fields) {
          const vals = res.map((r) => r.stats[f.key]).filter((v): v is number => typeof v === 'number')
          avg[f.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN
        }
        return { player, played: res.length, wins, losses, winRate: wins + losses ? wins / (wins + losses) : NaN, avg }
      })
      .sort((a, b) => (b.winRate || 0) - (a.winRate || 0) || b.wins - a.wins || b.played - a.played)
  }, [players, filtered, fields])

  const activeTrendPlayer = trendPlayer || summaries.find((s) => s.played > 0)?.player.id || ''
  const activeBarField = barField || fields[0]?.key || ''

  const trend = useMemo(() => {
    let w = 0
    let l = 0
    return filtered
      .map((m) => m.results.find((r) => r.playerId === activeTrendPlayer))
      .map((r, i) => ({ r, m: filtered[i]! }))
      .filter(({ r }) => r)
      .map(({ r, m }, i) => {
        if (r!.win === true) w++
        if (r!.win === false) l++
        return { n: i + 1, label: `${m.date.slice(8, 10)}.${m.date.slice(5, 7)}.`, winRate: w + l ? Math.round((w / (w + l)) * 100) : null }
      })
  }, [filtered, activeTrendPlayer])

  const bars = summaries
    .filter((s) => s.played > 0)
    .map((s) => ({ name: s.player.name, value: Number.isFinite(s.avg[activeBarField]!) ? Number(s.avg[activeBarField]!.toFixed(2)) : 0 }))

  const addPlayer = () => {
    const name = newPlayer.trim()
    if (!name) return
    setPlayers([...players, { id: uid(), name: name.slice(0, 24), color: PLAYER_COLORS[players.length % PLAYER_COLORS.length]! }])
    setNewPlayer('')
  }

  const removePlayer = (id: string) => {
    const used = matches.some((m) => m.results.some((r) => r.playerId === id))
    if (used && !confirm('Spieler hat Matches. Trotzdem entfernen? Seine Einträge werden aus allen Matches gelöscht.')) return
    setPlayers(players.filter((p) => p.id !== id))
    setMatches(matches.map((m) => ({ ...m, results: m.results.filter((r) => r.playerId !== id) })).filter((m) => m.results.length > 0))
  }

  const addField = () => {
    const label = newField.trim()
    if (!label) return
    const key = label.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-') + '-' + uid().slice(0, 4)
    setFields([...fields, { key, label: label.slice(0, 20) }])
    setNewField('')
  }

  const exportCsv = () => {
    const esc = (v: string | number) => {
      const s = String(v)
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Datum', 'Spiel', 'Spieler', 'Ergebnis', ...fields.map((f) => f.label)]
    const rows = [...matches]
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((m) =>
        m.results.map((r) => [
          m.date,
          m.game,
          players.find((p) => p.id === r.playerId)?.name ?? '?',
          r.win === true ? 'Sieg' : r.win === false ? 'Niederlage' : '',
          ...fields.map((f) => (r.stats[f.key] !== undefined ? String(r.stats[f.key]).replace('.', ',') : '')),
        ]),
      )
    // Semikolon + BOM: öffnet sich in deutschem Excel direkt korrekt.
    const csv = '﻿' + [header, ...rows].map((row) => row.map(esc).join(';')).join('\r\n')
    downloadFile(`squad-night-statistiken-${today()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  const tooltipStyle = { background: surface, border: `1px solid ${lineColor}`, borderRadius: 8, fontSize: 13 }

  return (
    <div>
      <PageHeader
        title="Statistiken"
        description="Matches eintragen und auswerten. Automatische Quellen folgen in Phase 2/3 – siehe Verbindungen."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={matches.length === 0}>
              CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)} disabled={players.length === 0}>
              Match eintragen
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {players.length === 0 ? (
            <EmptyState icon={UserPlus} title="Leg zuerst Spieler an">
              Rechts unter „Spieler“ deine Freunde eintragen, dann Matches erfassen.
            </EmptyState>
          ) : matches.length === 0 ? (
            <EmptyState icon={BarChart3} title="Noch keine Matches" action={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Erstes Match eintragen</Button>}>
              Nach dem ersten Eintrag erscheinen hier Rangliste, Siegquote und Trends.
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  className="w-full sm:w-56"
                  label="Spiel"
                  value={game}
                  onChange={setGame}
                  options={[{ value: '', label: 'Alle Spiele' }, ...games.map((g) => ({ value: g, label: g }))]}
                />
                <p className="pb-2 text-[13px] text-muted">{filtered.length} Matches</p>
              </div>

              {/* Kennzahlen */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
                {[
                  ['Matches', String(filtered.length)],
                  ['Spieler aktiv', String(summaries.filter((s) => s.played > 0).length)],
                  ['Beste Siegquote', summaries[0] && Number.isFinite(summaries[0].winRate) ? `${Math.round(summaries[0].winRate * 100)} %` : '–'],
                  ['Spitze', summaries[0] && summaries[0].played > 0 ? summaries[0].player.name : '–'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface p-4">
                    <p className="text-[12px] uppercase tracking-wider text-muted">{k}</p>
                    <p className="mt-1 truncate font-display text-2xl font-semibold">{v}</p>
                  </div>
                ))}
              </div>

              {/* Rangliste */}
              <Section title="Rangliste">
                <div className="-mx-4 -my-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[12px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-2.5 font-medium">#</th>
                        <th className="px-2 py-2.5 font-medium">Spieler</th>
                        <th className="px-2 py-2.5 text-right font-medium">Matches</th>
                        <th className="px-2 py-2.5 text-right font-medium">S / N</th>
                        <th className="px-2 py-2.5 text-right font-medium">Siegquote</th>
                        {fields.map((f) => (
                          <th key={f.key} className="px-2 py-2.5 text-right font-medium">
                            Ø {f.label}
                          </th>
                        ))}
                        <th className="w-4" />
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[13px]">
                      {summaries.map((s, i) => (
                        <tr key={s.player.id} className={cn('border-b border-line last:border-0', s.played === 0 && 'text-muted')}>
                          <td className="px-4 py-2.5">{i === 0 && s.played > 0 ? <Trophy size={14} className="text-accent" aria-label="Platz 1" /> : i + 1}</td>
                          <td className="px-2 py-2.5 font-sans">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.player.color }} aria-hidden />
                              {s.player.name}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right">{s.played}</td>
                          <td className="px-2 py-2.5 text-right">
                            {s.wins} / {s.losses}
                          </td>
                          <td className="px-2 py-2.5 text-right">{Number.isFinite(s.winRate) ? `${Math.round(s.winRate * 100)} %` : '–'}</td>
                          {fields.map((f) => (
                            <td key={f.key} className="px-2 py-2.5 text-right">
                              {fmt(s.avg[f.key]!)}
                            </td>
                          ))}
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Diagramme */}
              <div className="grid gap-6 xl:grid-cols-2">
                <Section
                  title="Siegquote über Zeit"
                  aside={
                    <select
                      className="rounded border border-line bg-bg px-2 py-1 text-[13px]"
                      value={activeTrendPlayer}
                      onChange={(e) => setTrendPlayer(e.target.value)}
                      aria-label="Spieler für Trend"
                    >
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  }
                >
                  {trend.length < 2 ? (
                    <p className="py-10 text-center text-sm text-muted">Ab zwei Matches dieses Spielers gibt es einen Trend.</p>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer>
                        <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke={lineColor} vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: mutedColor, fontSize: 11 }} stroke={lineColor} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fill: mutedColor, fontSize: 11 }} stroke={lineColor} tickLine={false} unit="%" />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} %`, 'Siegquote']} labelFormatter={(l) => `Match vom ${l}`} />
                          <Line type="monotone" dataKey="winRate" stroke={accent} strokeWidth={2} dot={{ r: 2.5, fill: accent }} connectNulls isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Section>

                <Section
                  title="Durchschnitt pro Spieler"
                  aside={
                    fields.length > 0 && (
                      <select
                        className="rounded border border-line bg-bg px-2 py-1 text-[13px]"
                        value={activeBarField}
                        onChange={(e) => setBarField(e.target.value)}
                        aria-label="Wert für Diagramm"
                      >
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    )
                  }
                >
                  {bars.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted">Keine Werte erfasst.</p>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer>
                        <BarChart data={bars} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke={lineColor} vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: mutedColor, fontSize: 11 }} stroke={lineColor} tickLine={false} interval={0} />
                          <YAxis tick={{ fill: mutedColor, fontSize: 11 }} stroke={lineColor} tickLine={false} />
                          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: lineColor, opacity: 0.4 }} formatter={(v) => [fmt(Number(v), 2), 'Ø']} />
                          <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Section>
              </div>

              {/* Matchliste */}
              <Section title="Matches">
                <ul className="-my-2 divide-y divide-line">
                  {[...filtered].reverse().map((m) => (
                    <li key={m.id} className="flex items-start gap-3 py-2.5">
                      <time className="w-20 shrink-0 pt-0.5 font-mono text-[12px] text-muted">{m.date.split('-').reverse().join('.')}</time>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{m.game}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
                          {m.results.map((r) => (
                            <span key={r.playerId}>
                              {players.find((p) => p.id === r.playerId)?.name ?? '?'}{' '}
                              <span className={cn('font-mono', r.win === true && 'text-ok', r.win === false && 'text-danger')}>
                                {r.win === true ? 'S' : r.win === false ? 'N' : '–'}
                              </span>
                            </span>
                          ))}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        aria-label="Match löschen"
                        onClick={() => confirm('Match löschen?') && setMatches(matches.filter((x) => x.id !== m.id))}
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            </>
          )}
        </div>

        {/* Seitenleiste */}
        <div className="space-y-4">
          <Section title="Spieler">
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addPlayer()
              }}
            >
              <input className="field h-9 py-0" placeholder="Name" maxLength={24} value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} aria-label="Neuer Spieler" />
              <Button type="submit" variant="primary" icon={Plus} aria-label="Spieler hinzufügen" disabled={!newPlayer.trim()} />
            </form>
            {players.length === 0 ? (
              <p className="text-sm text-muted">Noch niemand eingetragen.</p>
            ) : (
              <ul className="space-y-1">
                {players.map((p) => (
                  <li key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-raised">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    <button type="button" onClick={() => removePlayer(p.id)} className="text-muted hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label={`${p.name} entfernen`}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Erfasste Werte">
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <li key={f.key} className="flex items-center gap-1 rounded-full border border-line py-0.5 pl-3 pr-1 text-[13px]">
                  {f.label}
                  <button type="button" className="rounded-full p-0.5 text-muted hover:text-danger" onClick={() => setFields(fields.filter((x) => x.key !== f.key))} aria-label={`${f.label} entfernen`}>
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addField()
              }}
            >
              <input className="field h-9 py-0" placeholder="z. B. Assists, Platz" maxLength={20} value={newField} onChange={(e) => setNewField(e.target.value)} aria-label="Neuer Wert" />
              <Button type="submit" icon={Plus} aria-label="Wert hinzufügen" disabled={!newField.trim()} />
            </form>
            <p className="mt-2 text-[12px] text-muted">Entfernte Werte bleiben in alten Matches gespeichert, werden aber nicht mehr angezeigt.</p>
          </Section>

          <Section title="Verbindungen">
            <ul className="space-y-3">
              {ADAPTERS.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        a.status === 'available' && 'bg-ok/15 text-ok',
                        a.status === 'planned' && 'bg-raised text-muted',
                        a.status === 'unofficial' && 'bg-accent/15 text-accent',
                      )}
                    >
                      {a.status === 'available' ? 'Aktiv' : a.status === 'planned' ? `Phase ${a.phase}` : 'Inoffiziell'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {a.provides.join(' · ')}
                    <br />
                    <span className="text-muted/80">Grenzen: {a.limits.join(' · ')}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <AddMatchModal
        open={adding}
        onClose={() => setAdding(false)}
        players={players}
        fields={fields}
        games={games}
        onSave={(m) => {
          setMatches([...matches, m])
          setAdding(false)
        }}
      />
    </div>
  )
}

function AddMatchModal({
  open,
  onClose,
  players,
  fields,
  games,
  onSave,
}: {
  open: boolean
  onClose: () => void
  players: Player[]
  fields: StatField[]
  games: string[]
  onSave: (m: Match) => void
}) {
  const [game, setGame] = useState('')
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState<Record<string, { on: boolean; win: boolean | null; stats: Record<string, string> }>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setGame((g) => g || games[games.length - 1] || '')
    setDate(today())
    setError('')
    setRows(Object.fromEntries(players.map((p) => [p.id, { on: true, win: null, stats: {} }])))
  }, [open, players, games])

  const setRow = (id: string, patch: Partial<{ on: boolean; win: boolean | null; stats: Record<string, string> }>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }))

  const save = () => {
    if (!game.trim()) return setError('Bitte ein Spiel angeben.')
    const results: PlayerResult[] = players
      .filter((p) => rows[p.id]?.on)
      .map((p) => {
        const row = rows[p.id]!
        const stats: Record<string, number> = {}
        for (const f of fields) {
          const raw = row.stats[f.key]?.replace(',', '.').trim()
          if (raw) {
            const n = Number(raw)
            if (Number.isFinite(n)) stats[f.key] = n
          }
        }
        return { playerId: p.id, win: row.win, stats }
      })
    if (results.length === 0) return setError('Mindestens ein Spieler muss dabei sein.')
    onSave({ id: uid(), game: game.trim().slice(0, 40), date, results, source: 'manual' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Match eintragen" wide>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <label>
            <span className="label">Spiel</span>
            <input className="field" list="stats-games" value={game} maxLength={40} onChange={(e) => setGame(e.target.value)} placeholder="z. B. Lethal Company" />
            <datalist id="stats-games">
              {games.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label>
            <span className="label">Datum</span>
            <input type="date" className="field font-mono" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </label>
        </div>

        <div className="space-y-2">
          {players.map((p) => {
            const row = rows[p.id]
            if (!row) return null
            return (
              <div key={p.id} className={cn('rounded-lg border border-line p-3', !row.on && 'opacity-50')}>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={row.on} onChange={(e) => setRow(p.id, { on: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                    {p.name}
                  </label>
                  <div className="flex overflow-hidden rounded-md border border-line text-[13px]" role="radiogroup" aria-label={`Ergebnis ${p.name}`}>
                    {(
                      [
                        [true, 'Sieg'],
                        [false, 'Niederlage'],
                        [null, '–'],
                      ] as const
                    ).map(([v, l]) => (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={row.win === v}
                        disabled={!row.on}
                        onClick={() => setRow(p.id, { win: v })}
                        className={cn(
                          'px-3 py-1.5 transition-colors',
                          row.win === v ? (v === true ? 'bg-ok/20 text-ok' : v === false ? 'bg-danger/15 text-danger' : 'bg-raised text-fg') : 'text-muted hover:text-fg',
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {row.on && fields.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {fields.map((f) => (
                      <label key={f.key}>
                        <span className="mb-1 block text-[11px] text-muted">{f.label}</span>
                        <input
                          inputMode="decimal"
                          className="field h-8 py-0 font-mono text-[13px]"
                          value={row.stats[f.key] ?? ''}
                          onChange={(e) => setRow(p.id, { stats: { ...row.stats, [f.key]: e.target.value.replace(/[^0-9,.-]/g, '') } })}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <Notice tone="warn">{error}</Notice>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={save}>
            Speichern
          </Button>
        </div>
      </div>
    </Modal>
  )
}
