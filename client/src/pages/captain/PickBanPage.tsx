import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTitle } from '@/hooks/useTitle'
import { bracketsApi, type PickBanSession, type PickBanMapDetail, type PickBanCaptainDetail } from '@/api/brackets'
import { type Faction } from '@/api/maps'
import { useAuth } from '@/context/AuthContext'
import { usePickBanDetail, useFactions } from '@/queries'
import { cn, imgSrc } from '@/lib/utils'
import { Loader2, Shield, Swords, RotateCcw } from 'lucide-react'
import FinalsMatchupCard from '@/components/FinalsMatchupCard'
import { Button, Seal, buttonCls } from '@/components/ui'

import Aserai   from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire   from '@/assets/factions/Empire.webp'
import Khuzait  from '@/assets/factions/Khuzait.webp'
import Sturgia  from '@/assets/factions/Sturgia.webp'
import Vlandia  from '@/assets/factions/Vlandia.webp'

const FACTION_IMG: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

// ─── Side colours ─────────────────────────────────────────────────────────────

const SIDE = {
  a: { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-600',   label: 'Side A' },
  b: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-600', label: 'Side B' },
}

// ─── Map card ─────────────────────────────────────────────────────────────────

function MapCard({
  map, banned, bannedBy, selected, clickable, pending, onClick,
}: {
  map:       PickBanMapDetail
  banned?:   boolean
  bannedBy?: 'a' | 'b'
  selected?: boolean
  clickable?: boolean
  pending?:  boolean
  onClick?:  () => void
}) {
  return (
    <div
      onClick={clickable && !banned ? onClick : undefined}
      className={cn(
        'relative rounded-sm overflow-hidden border transition-colors duration-200 text-left',
        'aspect-[4/3] w-full flex flex-col justify-end',
        banned   && 'opacity-40 cursor-default border-zinc-800',
        selected && 'border-amber-500 shadow-[inset_0_0_0_1px_#c8a24a]',
        pending  && 'border-red-500 shadow-[inset_0_0_0_1px_#b8423a]',
        clickable && !banned && !pending && 'border-zinc-700 hover:border-red-500 cursor-pointer group',
        clickable && !banned && pending  && 'cursor-pointer',
        !clickable && !banned && !selected && !pending && 'border-zinc-800 cursor-default',
      )}
    >
      {/* Map image / placeholder */}
      {map.image_path ? (
        <img src={imgSrc(map.image_path)} alt={map.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-zinc-800" />
      )}

      {/* Shade for the label */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />

      {/* Banned overlay */}
      {banned && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/60 gap-1">
          <span className="font-display text-sm font-bold text-zinc-400 line-through">{map.name}</span>
          {bannedBy && (
            <span className={cn('font-display text-[8px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 border',
              bannedBy === 'a' ? 'text-blue-400 bg-blue-500/10 border-blue-600' : 'text-violet-400 bg-violet-500/10 border-violet-600'
            )}>
              Banned by {SIDE[bannedBy].label}
            </span>
          )}
        </div>
      )}

      {/* Hover ban hint — purely visual */}
      {clickable && !banned && !pending && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-red-600/10 pointer-events-none">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.15em] text-red-400 bg-zinc-950/80 border border-red-700 px-2 py-1">Click to ban</span>
        </div>
      )}

      {/* Map name bottom strip */}
      {!banned && (
        <div className="relative px-2 pb-2 pt-6">
          <p className={cn('font-display text-[11px] font-bold truncate', pending ? 'text-red-400' : selected ? 'text-amber-400' : 'text-zinc-100')}>
            {map.name}
          </p>
          {pending && <span className="font-display text-[8px] uppercase tracking-[0.2em] text-red-400">Selected</span>}
          {selected && <span className="font-display text-[8px] uppercase tracking-[0.2em] text-amber-400">Selected</span>}
        </div>
      )}
    </div>
  )
}

// ─── Faction card ─────────────────────────────────────────────────────────────

function FactionCard({ faction, selected, locked, onSelect, disabled }: {
  faction:  Faction
  selected: boolean
  locked?:  boolean
  onSelect: () => void
  disabled: boolean
}) {
  const img = FACTION_IMG[faction.name]
  return (
    <button
      onClick={onSelect}
      disabled={disabled || locked}
      className={cn(
        'flex flex-col items-center gap-1.5 transition-all duration-200 group',
        !selected && !disabled && !locked && 'hover:opacity-100 opacity-60',
        disabled && !selected && 'cursor-not-allowed',
      )}
    >
      <div className={cn(
        'w-14 h-14 rounded-full overflow-hidden border transition-colors duration-200',
        selected
          ? locked
            ? 'border-amber-500 shadow-[0_0_0_2px_#0c0b09,0_0_0_3px_#c8a24a]'
            : 'border-blue-400 shadow-[0_0_0_2px_#0c0b09,0_0_0_3px_#7c9cc0]'
          : 'border-zinc-700 group-hover:border-zinc-500',
      )}>
        {img ? (
          <img src={img} alt={faction.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-zinc-800" />
        )}
      </div>
      <span className={cn('font-display text-[10px] font-bold',
        selected ? (locked ? 'text-amber-400' : 'text-blue-400') : 'text-zinc-500')}>
        {faction.name}
      </span>
      {selected && locked && <span className="font-display text-[8px] uppercase tracking-[0.2em] text-amber-400 -mt-1">Locked</span>}
    </button>
  )
}

// ─── Captain ready card ───────────────────────────────────────────────────────

function captainStatus(side: 'a' | 'b', session: PickBanSession, banSeq: ('a' | 'b')[]) {
  const joined      = side === 'a' ? !!session.a_joined : !!session.b_joined
  const otherJoined = side === 'a' ? !!session.b_joined : !!session.a_joined
  const hasPicked   = side === 'a' ? session.a_pick !== null : session.b_pick !== null
  const otherPicked = side === 'a' ? session.b_pick !== null : session.a_pick !== null
  const isMyTurn    = session.status === 'banning' && banSeq[session.ban_turn] === side

  switch (session.status) {
    case 'waiting':
      if (!joined)      return { label: 'Waiting to join',        dot: 'bg-zinc-600', pulse: false, done: false }
      if (!otherJoined) return { label: 'Joined — awaiting opponent', dot: 'bg-green-400', pulse: false, done: false }
      return                   { label: 'Ready',                  dot: 'bg-green-400', pulse: false, done: false }
    case 'banning':
      return isMyTurn
        ?                      { label: 'Banning…',               dot: 'bg-current',  pulse: true,  done: false }
        :                      { label: 'Waiting…',               dot: 'bg-zinc-600', pulse: false, done: false }
    case 'picking':
      if (!hasPicked)   return { label: 'Picking faction…',       dot: 'bg-current',  pulse: true,  done: false }
      if (!otherPicked) return { label: 'Waiting for opponent…',  dot: 'bg-zinc-600', pulse: false, done: false }
      return                   { label: 'Locked in',              dot: 'bg-amber-400', pulse: false, done: false }
    case 'complete':
      return                   { label: 'Complete',               dot: 'bg-green-400', pulse: false, done: true }
    default:
      return                   { label: '—',                      dot: 'bg-zinc-600', pulse: false, done: false }
  }
}

function CaptainReadyCard({ side, captain, session, banSeq }: {
  side:    'a' | 'b'
  captain: PickBanCaptainDetail | null
  session: PickBanSession
  banSeq:  ('a' | 'b')[]
}) {
  const s      = SIDE[side]
  const status = captainStatus(side, session, banSeq)
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-sm border', s.bg, s.border)}>
      <div className={cn('w-2 h-2 rotate-45 flex-shrink-0',
        status.dot === 'bg-current' ? (side === 'a' ? 'bg-blue-400' : 'bg-violet-400') : status.dot,
        status.pulse && 'animate-pulse'
      )} />
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

// ─── Ban sequence stepper ─────────────────────────────────────────────────────

function BanStepper({ sequence, currentTurn }: { sequence: ('a' | 'b')[]; currentTurn: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {sequence.map((side, i) => (
        <div key={i} className={cn(
          'flex items-center justify-center w-6 h-6 rounded-sm font-display text-[10px] font-bold border transition-colors',
          i < currentTurn
            ? 'bg-zinc-700 border-zinc-600 text-zinc-500'          // done
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PickBanPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [acting,     setActing]     = useState(false)
  const [myPick,     setMyPick]     = useState<number | null>(null)
  const [resetting,  setResetting]  = useState(false)
  const [pendingBan, setPendingBan] = useState<number | null>(null)
  const [pendingPick, setPendingPick] = useState<number | null>(null)

  const isCaptain = user?.role === 'captain'
  const isHost    = user?.role === 'host' || user?.role === 'admin'

  const detailQ   = usePickBanDetail(Number(sessionId))
  const factionsQ = useFactions()
  const session   = detailQ.data?.session ?? null
  const bans      = detailQ.data?.bans ?? []
  const mapPool   = detailQ.data?.mapPool ?? []
  const captainA  = detailQ.data?.captainA ?? null
  const captainB  = detailQ.data?.captainB ?? null
  const chosenMap = detailQ.data?.chosenMap ?? null
  const factions  = factionsQ.data ?? []
  const load      = detailQ.refresh

  const pickBanTitle = captainA && captainB
    ? `${captainA.display_name} vs ${captainB.display_name} · Pick & Ban`
    : 'Pick & Ban'
  useTitle(pickBanTitle)

  // A session that cannot be read (deleted, or not ours) sends the captain home.
  useEffect(() => {
    if (detailQ.isError) navigate('/captain', { replace: true })
  }, [detailQ.isError, navigate])

  if (!session || factionsQ.isPending) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  const mySide = user?.captainId === session.captain_a_id ? 'a'
    : user?.captainId === session.captain_b_id ? 'b'
    : null

  const banSeq: ('a' | 'b')[] = JSON.parse(session.ban_sequence)
  const pool: number[]         = JSON.parse(session.map_pool)
  const myTurn     = session.status === 'banning' && banSeq[session.ban_turn] === mySide
  const bannedIds  = new Set(bans.map(b => b.map_id))
  const remaining  = pool.filter(id => !bannedIds.has(id))
  const hasJoined  = mySide === 'a' ? !!session.a_joined : mySide === 'b' ? !!session.b_joined : false
  const myPickDone = myPick !== null || (mySide === 'a' ? session.a_pick !== null : mySide === 'b' ? session.b_pick !== null : false)

  async function joinSession() {
    setActing(true)
    try { await bracketsApi.joinPickBan(session!.id); await load() }
    finally { setActing(false) }
  }

  async function submitBan(mapId: number) {
    if (!myTurn || acting) return
    setActing(true)
    try { await bracketsApi.ban(session!.id, mapId); await load() }
    finally { setActing(false) }
  }

  async function submitPick(factionId: number) {
    if (acting || myPickDone) return
    setActing(true)
    setMyPick(factionId)
    try {
      const res = await bracketsApi.pick(session!.id, factionId)
      if (res.revealed) await load()
    } finally { setActing(false) }
  }

  async function resetSession() {
    setResetting(true)
    try { await bracketsApi.deletePickBan(session!.id); window.history.back() }
    catch { /* ignore */ } finally { setResetting(false) }
  }

  const statusLabel: Record<string, string> = {
    waiting: 'Waiting for players',
    banning: 'Ban phase',
    picking:  'Pick phase',
    complete: 'Complete',
  }

  const factionA = factions.find(f => f.id === (session.a_pick as number))
  const factionB = factions.find(f => f.id === (session.b_pick as number))

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ── */}
      <div className="border-b border-zinc-700 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-[0_1px_0_#1a1712,0_2px_0_rgba(200,162,74,0.2)]"
        style={{ backgroundColor: 'var(--color-surface-head)' }}>
        <div className="flex items-center gap-3">
          <Swords className="w-5 h-5 text-amber-500" />
          <span className="font-display text-base font-bold uppercase tracking-[0.15em] text-zinc-50">Finals pick-ban</span>
        </div>
        <div className="flex items-center gap-3">
          <Seal tone={session.status === 'complete' ? 'finished' : 'gilt'}>{statusLabel[session.status] ?? session.status}</Seal>
          {isHost && session.status !== 'complete' && (
            <Button size="sm" variant="danger" onClick={resetSession} loading={resetting} title="Reset pick-ban session" icon={<RotateCcw className="w-3 h-3" />}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative z-20 flex-1 flex flex-col items-center px-6 py-6 gap-6 max-w-3xl mx-auto w-full">

        {/* Captain headers — always visible */}
        <div className="w-full grid grid-cols-2 gap-3">
          <CaptainReadyCard side="a" captain={captainA} session={session} banSeq={banSeq} />
          <CaptainReadyCard side="b" captain={captainB} session={session} banSeq={banSeq} />
        </div>

        {/* ── WAITING ── */}
        {session.status === 'waiting' && (
          <>
            {/* Map pool preview */}
            <div className="w-full space-y-2">
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600">Map Pool</p>
              <div className="grid grid-cols-5 gap-2">
                {mapPool.map(m => <MapCard key={m.id} map={m} />)}
              </div>
            </div>

            {isCaptain && mySide && !hasJoined && (
              <Button variant="primary" onClick={joinSession} loading={acting} icon={<Swords className="w-4 h-4" />} className="w-full py-3 text-xs">
                Join as {SIDE[mySide].label}
              </Button>
            )}
            {isCaptain && mySide && hasJoined && (
              <p className="text-sm text-zinc-500 italic">Joined. Waiting for the opponent…</p>
            )}
            {isHost && (
              <p className="text-xs text-zinc-600 italic">Watching. Captains are joining.</p>
            )}
          </>
        )}

        {/* ── BANNING ── */}
        {session.status === 'banning' && (
          <>
            <div className="w-full space-y-3 text-center">
              <BanStepper sequence={banSeq} currentTurn={session.ban_turn} />
              <p className={cn('font-display text-xs font-bold uppercase tracking-[0.12em]',
                myTurn ? 'text-red-400' : 'text-zinc-400')}>
                {myTurn
                  ? 'Your turn: select a map to ban'
                  : `Waiting for ${SIDE[banSeq[session.ban_turn] ?? 'a'].label} to ban…`}
              </p>
              <p className="text-xs font-mono text-zinc-600">
                Ban {session.ban_turn + 1} of {banSeq.length}
              </p>
            </div>

            <div className="w-full grid grid-cols-5 gap-2">
              {mapPool.map(m => {
                const ban = bans.find(b => b.map_id === m.id)
                const isPending = pendingBan === m.id
                return (
                  <MapCard
                    key={m.id}
                    map={m}
                    banned={!!ban}
                    bannedBy={ban?.captain_side}
                    clickable={myTurn && !ban && !acting}
                    pending={isPending}
                    onClick={() => setPendingBan(m.id)}
                  />
                )
              })}
            </div>
            {pendingBan !== null && (
              <div className="flex flex-col items-center gap-1 pt-1">
                <p className="text-[11px] italic text-zinc-500">This cannot be undone</p>
                <Button variant="danger" onClick={() => { const id = pendingBan; setPendingBan(null); submitBan(id) }} loading={acting} className="px-5 py-2.5 bg-red-600 text-zinc-50 hover:bg-red-500">
                  Confirm ban
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── PICKING ── */}
        {session.status === 'picking' && (
          <>
            {/* Chosen map (the survivor) */}
            {remaining.length === 1 && mapPool.find(m => m.id === remaining[0]) && (
              <div className="w-full space-y-2">
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600 text-center">Finals Map</p>
                <div className="max-w-xs mx-auto">
                  <MapCard map={mapPool.find(m => m.id === remaining[0])!} selected />
                </div>
              </div>
            )}

            {/* Faction picker */}
            {isCaptain && mySide && !myPickDone && (
              <div className="w-full space-y-2">
                <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-600 text-center">
                  Pick your faction — reveals simultaneously
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  {factions.map(f => (
                    <FactionCard
                      key={f.id}
                      faction={f}
                      selected={pendingPick === f.id}
                      disabled={acting}
                      onSelect={() => setPendingPick(f.id)}
                    />
                  ))}
                </div>
                {pendingPick !== null && (
                  <div className="flex flex-col items-center gap-1 pt-2">
                    <p className="text-[11px] italic text-zinc-500">This cannot be undone</p>
                    <Button variant="primary" onClick={() => { const id = pendingPick; setPendingPick(null); submitPick(id) }} loading={acting} className="px-5 py-2.5">
                      Lock in faction
                    </Button>
                  </div>
                )}
              </div>
            )}

            {myPickDone && !session.revealed && (
              <div className="text-center py-4 space-y-2">
                <Shield className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-zinc-200">Faction locked in</p>
                <p className="text-xs text-zinc-500 italic">Waiting for the opponent to pick…</p>
              </div>
            )}

            {isHost && (
              <p className="text-xs text-zinc-600 italic">Watching. Captains are picking factions.</p>
            )}
          </>
        )}

        {/* ── COMPLETE ── */}
        {session.status === 'complete' && session.revealed && (
          <div className="w-full space-y-4 animate-in fade-in duration-700">
            <FinalsMatchupCard
              mapImage={chosenMap?.image_path}
              mapName={chosenMap?.name}
              mapGameId={chosenMap?.game_id}
              factionAName={factionA?.name}
              factionBName={factionB?.name}
            />
            <Link to="/captain" className={buttonCls('secondary', 'md', 'w-full py-2.5')}>
              ← Back to dashboard
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
