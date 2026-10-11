import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { bracketsApi, type PickBanSession, type PickBanMapDetail, type PickBanCaptainDetail } from '@/api/brackets'
import { cn, imgSrc } from '@/lib/utils'
import { qk, usePickBanDetail, useFactions } from '@/queries'
import { Loader2, Swords, Check, X, Trash2 } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import FinalsMatchupCard from '@/components/FinalsMatchupCard'
import { Button, Seal, inputSmCls } from '@/components/ui'


const SIDE = {
  a: { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-600',   label: 'Side A' },
  b: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-600', label: 'Side B' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MapCard({ map, banned, bannedBy, selected }: {
  map: PickBanMapDetail; banned?: boolean; bannedBy?: 'a' | 'b'; selected?: boolean
}) {
  return (
    <div className={cn(
      'relative rounded-sm overflow-hidden border aspect-[4/3] flex flex-col justify-end',
      banned   && 'opacity-40 border-zinc-800',
      selected && 'border-amber-500 shadow-[inset_0_0_0_1px_#c8a24a]',
      !banned && !selected && 'border-zinc-800',
    )}>
      {map.image_path
        ? <img src={imgSrc(map.image_path)} alt={map.name} className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-zinc-800" />
      }
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />
      {banned && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/60 gap-1">
          <span className="font-display text-xs font-bold text-zinc-400 line-through">{map.name}</span>
          {bannedBy && (
            <span className={cn('font-display text-[8px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 border',
              bannedBy === 'a' ? 'text-blue-400 bg-blue-500/10 border-blue-600' : 'text-violet-400 bg-violet-500/10 border-violet-600'
            )}>
              Banned by {SIDE[bannedBy].label}
            </span>
          )}
        </div>
      )}
      {!banned && (
        <div className="relative px-2 pb-2 pt-6">
          <p className={cn('font-display text-[11px] font-bold truncate', selected ? 'text-amber-400' : 'text-zinc-100')}>{map.name}</p>
          {selected && <span className="font-display text-[8px] uppercase tracking-[0.2em] text-amber-400">Selected</span>}
        </div>
      )}
    </div>
  )
}

function captainStatus(side: 'a' | 'b', session: PickBanSession, banSeq: ('a' | 'b')[]) {
  const joined      = side === 'a' ? !!session.a_joined : !!session.b_joined
  const otherJoined = side === 'a' ? !!session.b_joined : !!session.a_joined
  const hasPicked   = side === 'a' ? session.a_pick !== null : session.b_pick !== null
  const otherPicked = side === 'a' ? session.b_pick !== null : session.a_pick !== null
  const isMyTurn    = session.status === 'banning' && banSeq[session.ban_turn] === side

  switch (session.status) {
    case 'waiting':
      if (!joined)      return { label: 'Waiting to join',           dot: 'bg-zinc-600',  pulse: false, done: false }
      if (!otherJoined) return { label: 'Joined — awaiting opponent', dot: 'bg-green-400', pulse: false, done: false }
      return                   { label: 'Ready',                     dot: 'bg-green-400', pulse: false, done: false }
    case 'banning':
      return isMyTurn
        ?                      { label: 'Banning…',                  dot: 'bg-side',      pulse: true,  done: false }
        :                      { label: 'Waiting…',                  dot: 'bg-zinc-600',  pulse: false, done: false }
    case 'picking':
      if (!hasPicked)   return { label: 'Picking faction…',          dot: 'bg-side',      pulse: true,  done: false }
      if (!otherPicked) return { label: 'Waiting for opponent…',     dot: 'bg-zinc-600',  pulse: false, done: false }
      return                   { label: 'Locked in',                 dot: 'bg-amber-400', pulse: false, done: false }
    case 'complete':
      return                   { label: 'Complete',                  dot: 'bg-green-400', pulse: false, done: true }
    default:
      return                   { label: '—',                         dot: 'bg-zinc-600',  pulse: false, done: false }
  }
}

function CaptainCard({ side, captain, session, banSeq }: {
  side: 'a' | 'b'; captain: PickBanCaptainDetail | null; session: PickBanSession; banSeq: ('a' | 'b')[]
}) {
  const s      = SIDE[side]
  const status = captainStatus(side, session, banSeq)
  const dotCn  = status.dot === 'bg-side' ? (side === 'a' ? 'bg-blue-400' : 'bg-violet-400') : status.dot
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-sm border', s.bg, s.border)}>
      <div className={cn('w-2 h-2 rotate-45 flex-shrink-0', dotCn, status.pulse && 'animate-pulse')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={cn('font-display text-xs font-bold tracking-[0.04em] truncate', status.done ? 'text-green-300' : s.text)}>
            {captain?.display_name || captain?.team_name || s.label}
          </p>
          <span className={cn('font-display text-[8px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 border flex-shrink-0', s.text, s.border,
            side === 'a' ? 'bg-blue-500/10' : 'bg-violet-500/10')}>
            {s.label}
          </span>
        </div>
        <p className="text-xs text-zinc-500">{status.label}</p>
      </div>
    </div>
  )
}

function BanStepper({ sequence, currentTurn }: { sequence: ('a' | 'b')[]; currentTurn: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {sequence.map((side, i) => (
        <div key={i} className={cn(
          'flex items-center justify-center w-6 h-6 rounded-sm font-display text-[10px] font-bold border transition-colors',
          i < currentTurn
            ? 'bg-zinc-700 border-zinc-600 text-zinc-500'
            : i === currentTurn
              ? side === 'a'
                ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                : 'bg-violet-500/20 border-violet-400 text-violet-300'
              : side === 'a'
                ? 'bg-zinc-900 border-blue-600/50 text-blue-400/50'
                : 'bg-zinc-900 border-violet-600/50 text-violet-400/50',
        )}>
          {side.toUpperCase()}
        </div>
      ))}
    </div>
  )
}


const selectCn = cn(inputSmCls, 'w-full cursor-pointer')

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function PickBanModal({ sessionId, onDeleted, onClose }: {
  sessionId: number
  onDeleted: () => void
  onClose:   () => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const detailQ   = usePickBanDetail(sessionId)
  const factionsQ = useFactions()
  const session   = detailQ.data?.session ?? null
  const bans      = detailQ.data?.bans ?? []
  const mapPool   = detailQ.data?.mapPool ?? []
  const captainA  = detailQ.data?.captainA ?? null
  const captainB  = detailQ.data?.captainB ?? null
  const chosenMap = detailQ.data?.chosenMap ?? null
  const factions  = factionsQ.data ?? []
  const loading   = detailQ.isPending || factionsQ.isPending

  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // Override controls
  const [overrideMap, setOverrideMap] = useState<number | ''>('')
  const [overrideA,   setOverrideA]   = useState<number | ''>('')
  const [overrideB,   setOverrideB]   = useState<number | ''>('')
  const [saving,      setSaving]      = useState(false)
  const overrideInit = useRef(false)

  const mouseDownOnBackdrop = useRef(false)

  // Seed the override selects from the result the first time it is complete.
  useEffect(() => {
    if (!session || overrideInit.current || session.status !== 'complete') return
    overrideInit.current = true
    if (session.chosen_map_id) setOverrideMap(session.chosen_map_id)
    if (typeof session.a_pick === 'number') setOverrideA(session.a_pick)
    if (typeof session.b_pick === 'number') setOverrideB(session.b_pick)
  }, [session])

  async function doDelete() {
    setDeleting(true)
    try {
      await bracketsApi.deletePickBan(sessionId)
      onDeleted()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
      setDeleting(false)
    }
  }

  async function saveOverride() {
    if (overrideMap === '' || overrideA === '' || overrideB === '') return
    setSaving(true)
    try {
      const data = await bracketsApi.overridePickBan(sessionId, {
        chosen_map_id: overrideMap as number,
        a_pick:        overrideA as number,
        b_pick:        overrideB as number,
      })
      // The override returns the full detail: write it straight into the cache.
      qc.setQueryData(qk.pickBan(sessionId), data)
      toast('Result updated', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setSaving(false) }
  }

  const banSeq: ('a' | 'b')[] = session ? JSON.parse(session.ban_sequence) : []
  const pool:    number[]      = session ? JSON.parse(session.map_pool) : []
  const bannedIds = new Set(bans.map(b => b.map_id))
  const remaining = pool.filter(id => !bannedIds.has(id))

  const factionA = session?.status === 'complete' && session.revealed
    ? factions.find(f => f.id === (session.a_pick as number)) : null
  const factionB = session?.status === 'complete' && session.revealed
    ? factions.find(f => f.id === (session.b_pick as number)) : null


  const statusLabel: Record<string, string> = {
    waiting: 'Waiting for players', banning: 'Ban phase', picking: 'Pick phase', complete: 'Complete',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && !deleting && e.target === e.currentTarget) onClose() }}
    >
      <div className="panel border-zinc-700 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.6)]">

        {/* Header */}
        <div className="panel-head flex items-center justify-between px-5 py-2.5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Swords className="w-4 h-4 text-amber-500" />
            <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-zinc-50">Finals pick-ban</span>
            {session && (
              <Seal tone={session.status === 'complete' ? 'finished' : 'gilt'}>{statusLabel[session.status] ?? session.status}</Seal>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session && !confirmDel && (
              <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)} disabled={deleting} icon={<Trash2 className="w-3 h-3" />}>Delete</Button>
            )}
            {confirmDel && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Delete session?</span>
                <Button size="sm" variant="danger" onClick={doDelete} loading={deleting} icon={<Check className="w-3 h-3" />}>Confirm</Button>
                <Button size="sm" onClick={() => setConfirmDel(false)}>Cancel</Button>
              </div>
            )}
            <button onClick={onClose} className="p-1 rounded-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors ml-1" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : !session ? null : (
            <div className="flex flex-col gap-5 px-5 py-5">

              {/* Captains */}
              <div className="grid grid-cols-2 gap-3">
                <CaptainCard side="a" captain={captainA} session={session} banSeq={banSeq} />
                <CaptainCard side="b" captain={captainB} session={session} banSeq={banSeq} />
              </div>

              {/* Event log */}
              {bans.length > 0 && (() => {
                const captainName = (side: 'a' | 'b') => {
                  const cap = side === 'a' ? captainA : captainB
                  return cap?.display_name || cap?.team_name || `Side ${side.toUpperCase()}`
                }
                const sortedBans = [...bans].sort((a, b) => a.ban_index - b.ban_index)
                const survivingMap = remaining.length === 1 ? mapPool.find(m => m.id === remaining[0]) : null
                const factionA = session.status === 'complete' && session.revealed ? factions.find(f => f.id === (session.a_pick as number)) : null
                const factionB = session.status === 'complete' && session.revealed ? factions.find(f => f.id === (session.b_pick as number)) : null
                return (
                  <div className="panel p-3 space-y-1.5">
                    <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600 mb-2">Event log</p>
                    {sortedBans.map((ban, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={ban.captain_side === 'a' ? 'text-blue-400 font-semibold' : 'text-violet-400 font-semibold'}>
                          {captainName(ban.captain_side)}
                        </span>
                        <span className="text-zinc-500">banned</span>
                        <span className="text-zinc-300">{ban.map_name}</span>
                      </div>
                    ))}
                    {survivingMap && (
                      <div className="flex items-center gap-2 text-xs pt-0.5 border-t border-zinc-800 mt-1.5">
                        <span className="text-zinc-500">Surviving map:</span>
                        <span className="text-amber-400 font-semibold">{survivingMap.name}</span>
                      </div>
                    )}
                    {factionA && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-blue-400 font-semibold">{captainName('a')}</span>
                        <span className="text-zinc-500">picked</span>
                        <span className="text-zinc-300">{factionA.name}</span>
                      </div>
                    )}
                    {factionB && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-violet-400 font-semibold">{captainName('b')}</span>
                        <span className="text-zinc-500">picked</span>
                        <span className="text-zinc-300">{factionB.name}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* WAITING */}
              {session.status === 'waiting' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600">Map Pool</p>
                  <div className="grid grid-cols-5 gap-2">
                    {mapPool.map(m => <MapCard key={m.id} map={m} />)}
                  </div>
                  <p className="text-xs text-zinc-700 font-mono text-center pt-1">Watching — captains are joining</p>
                </div>
              )}

              {/* BANNING */}
              {session.status === 'banning' && (
                <div className="space-y-3">
                  <BanStepper sequence={banSeq} currentTurn={session.ban_turn} />
                  <p className="text-sm text-zinc-400 text-center">
                    Waiting for {SIDE[banSeq[session.ban_turn] ?? 'a'].label} to ban…
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {mapPool.map(m => {
                      const ban = bans.find(b => b.map_id === m.id)
                      return <MapCard key={m.id} map={m} banned={!!ban} bannedBy={ban?.captain_side} />
                    })}
                  </div>
                </div>
              )}

              {/* PICKING */}
              {session.status === 'picking' && (
                <div className="space-y-3">
                  {remaining.length === 1 && mapPool.find(m => m.id === remaining[0]) && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600 text-center">Finals Map</p>
                      <div className="max-w-[140px] mx-auto">
                        <MapCard map={mapPool.find(m => m.id === remaining[0])!} selected />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-zinc-700 font-mono text-center">Captains are picking factions…</p>
                </div>
              )}

              {/* COMPLETE */}
              {session.status === 'complete' && session.revealed && (() => {
                return (
                  <div className="space-y-4">
                    <FinalsMatchupCard
                      mapImage={chosenMap?.image_path}
                      mapName={chosenMap?.name}
                      mapGameId={chosenMap?.game_id}
                      factionAName={factionA?.name}
                      factionBName={factionB?.name}
                    />

                    {/* Override result */}
                    <div className="panel p-4 space-y-3">
                      <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-500">Override result</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <p className="text-[10px] text-zinc-600">Map</p>
                          <select value={overrideMap} onChange={e => setOverrideMap(Number(e.target.value))} className={selectCn}>
                            {mapPool.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-blue-400/70">Side A faction</p>
                          <select value={overrideA} onChange={e => setOverrideA(Number(e.target.value))} className={selectCn}>
                            {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-violet-400/70">Side B faction</p>
                          <select value={overrideB} onChange={e => setOverrideB(Number(e.target.value))} className={selectCn}>
                            {factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <Button variant="primary" onClick={saveOverride} loading={saving}
                        disabled={overrideMap === '' || overrideA === '' || overrideB === ''}
                        icon={<Check className="w-3.5 h-3.5" />} className="w-full py-2.5">
                        Save override
                      </Button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
