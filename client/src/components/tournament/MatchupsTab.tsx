import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { type Matchup } from '@/api/brackets'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { type GameMap, type Faction } from '@/api/maps'
import { cn, imgSrc } from '@/lib/utils'
import { Map, Dices, Settings2, Lock, Pencil, Swords, Loader2 } from 'lucide-react'
import { SectionLabel, EmptyState, type ViewRole } from './shared'
import { useToast } from '@/context/ToastContext'
import { Button, Modal, PanelHead } from '@/components/ui'
import { qk, useInvalidate, useTournament, useMaps, useFactions, useMatchups } from '@/queries'
import MapPoolModal from './MapPoolModal'
import RollModal from './RollModal'
import ManualPickModal from './ManualPickModal'

import Aserai  from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire  from '@/assets/factions/Empire.webp'
import Khuzait from '@/assets/factions/Khuzait.webp'
import Sturgia from '@/assets/factions/Sturgia.webp'
import Vlandia from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

function FactionCircle({ name }: { name: string | undefined | null }) {
  const src = name ? FACTION_ICONS[name] : undefined
  const base = 'w-7 h-7 rounded-full flex-shrink-0'
  if (!src) return (
    <div className={cn(base, 'bg-zinc-800 border border-zinc-700 flex items-center justify-center')}>
      <span className="text-[8px] text-zinc-500">?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className={cn(base, 'object-cover border border-amber-700 shadow-[0_0_0_2px_#0c0b09]')} />
}

// ─── Matchup display card ─────────────────────────────────────────────────────

function MatchupDisplayCard({ matchup }: {
  matchup: Matchup | undefined
}) {
  const rolled = !!matchup?.map_name

  return (
    <div className="relative h-40 overflow-hidden">
      {matchup?.map_image
        ? <img src={imgSrc(matchup.map_image)} alt={matchup.map_name ?? ''} className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 bg-zinc-800" />
      }
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/65 via-zinc-950/10 to-zinc-950/60" />

      {/* Map name — top right */}
      {rolled && (
        <div className="absolute top-2 right-3">
          <span className="font-display text-sm font-bold text-amber-400">{matchup!.map_name}</span>
        </div>
      )}

      {/* VS row — centered */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="flex items-center gap-3 w-full">
          {/* Side A */}
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {matchup?.faction_a_name ?? ''}
            </span>
            <FactionCircle name={matchup?.faction_a_name} />
          </div>
          <span className="font-display text-sm font-bold text-zinc-100 tracking-[0.2em] flex-shrink-0 px-1">VS</span>
          {/* Side B */}
          <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
            <FactionCircle name={matchup?.faction_b_name} />
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {matchup?.faction_b_name ?? ''}
            </span>
          </div>
        </div>
      </div>

      {/* Not rolled */}
      {!matchup && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-zinc-600 text-xs italic">Not rolled yet</p>
        </div>
      )}
    </div>
  )
}

// ─── Round slot ───────────────────────────────────────────────────────────────

function RoundSlot({ round, label, slug, poolMaps, usedInOtherRounds, hardExcluded, factions, matchup, canManage, onRolled }: {
  round:             number
  label:             string
  slug:              string
  poolMaps:          GameMap[]
  usedInOtherRounds: number[]
  hardExcluded:      number[]
  factions:          Faction[]
  matchup:           Matchup | undefined
  canManage:         boolean
  onRolled:          (m: Matchup) => void
}) {
  const [showRoll,   setShowRoll]   = useState(false)
  const [showManual, setShowManual] = useState(false)

  return (
    <div className="panel overflow-hidden">
      <PanelHead meta={canManage && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setShowManual(true)} icon={<Pencil className="w-2.5 h-2.5" />} className="px-2 py-1">Manual</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowRoll(true)} icon={<Dices className="w-2.5 h-2.5" />} className="px-2 py-1">{matchup ? 'Reroll' : 'Roll'}</Button>
        </>
      )}>
        {label}
      </PanelHead>

      <MatchupDisplayCard matchup={matchup} />

      {showRoll && (
        <RollModal
          round={round} slug={slug}
          maps={poolMaps} usedMapIds={usedInOtherRounds}
          hardExcluded={hardExcluded} factions={factions}
          onRolled={m => { onRolled(m); setShowRoll(false) }}
          onClose={() => setShowRoll(false)}
        />
      )}
      {showManual && (
        <ManualPickModal
          round={round} slug={slug}
          maps={poolMaps} factions={factions}
          onSaved={m => { onRolled(m); setShowManual(false) }}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  )
}

// ─── Finals map pool modal ────────────────────────────────────────────────────

const FINALS_POOL_SIZE = 5

function FinalsPoolModal({ maps, slug, project, matchups, onProjectUpdate, onClose }: {
  maps:            GameMap[]
  slug:            string
  project:         Tournament
  matchups:        Matchup[]
  onProjectUpdate: (p: Tournament) => void
  onClose:         () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const currentPool: number[] = (() => {
    try { return JSON.parse(project.finals_map_pool ?? '[]') } catch { return [] }
  })()
  const tournamentPool: number[] = (() => {
    try { return JSON.parse(project.map_pool ?? '[]') } catch { return [] }
  })()
  const usedMapIds = new Set(
    matchups.filter(m => m.round >= 1 && m.round <= 4 && m.map_id).map(m => m.map_id!)
  )

  const [pool, setPool] = useState<number[]>(currentPool)

  function toggle(mapId: number) {
    if (!tournamentPool.includes(mapId)) return
    setPool(prev => {
      if (prev.includes(mapId)) return prev.filter(id => id !== mapId)
      if (prev.length >= FINALS_POOL_SIZE) return prev
      return [...prev, mapId]
    })
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await tournamentsApi.update(slug, { finals_map_pool: pool })
      onProjectUpdate(updated)
      toast('Finals map pool saved')
      onClose()
    } finally { setSaving(false) }
  }

  const activeMaps = maps.filter(m => m.is_active)

  return (
    <Modal
      title="Finals map pool"
      onClose={() => { if (!saving) onClose() }}
      width="w-full max-w-sm"
      className="max-h-[90vh] flex flex-col [&>div:nth-child(2)]:overflow-y-auto [&>div:nth-child(2)]:flex-1"
      footer={<>
        <span className={cn('flex-1 self-center text-xs font-mono', pool.length === FINALS_POOL_SIZE ? 'text-green-400' : 'text-zinc-600')}>
          {pool.length}/{FINALS_POOL_SIZE} selected
        </span>
        <Button variant="primary" onClick={save} loading={saving} disabled={pool.length === 0}>Save</Button>
      </>}
    >
      <p className="text-xs text-zinc-500 mb-3">Select {FINALS_POOL_SIZE} maps for the pick-ban phase.</p>
      <div className="space-y-1">
        {activeMaps.map(m => {
          const selected = pool.includes(m.id)
          const inPool   = tournamentPool.includes(m.id)
          const used     = usedMapIds.has(m.id)
          const full     = pool.length >= FINALS_POOL_SIZE && !selected
          const disabled = !inPool || (full && !selected)

          return (
            <button key={m.id} onClick={() => toggle(m.id)} disabled={disabled}
              title={!inPool ? 'Not in tournament pool' : undefined}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-sm border text-sm text-left transition-colors',
                selected
                  ? 'bg-amber-500/10 border-amber-700 text-amber-300'
                  : disabled
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-700 cursor-not-allowed opacity-50'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600',
              )}>
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {selected && <span className="lozenge" />}
              </div>
              <span className="flex-1 truncate">{m.name}</span>
              {used && <span className="text-[9px] font-mono text-zinc-500 italic">used</span>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

// ─── Finals map pool display ──────────────────────────────────────────────────

function FinalsPoolSection({ maps, slug, project, matchups, onProjectUpdate, canManage }: {
  maps:            GameMap[]
  slug:            string
  project:         Tournament
  matchups:        Matchup[]
  onProjectUpdate: (p: Tournament) => void
  canManage:       boolean
}) {
  const [showModal, setShowModal] = useState(false)

  const currentPool: number[] = (() => {
    try { return JSON.parse(project.finals_map_pool ?? '[]') } catch { return [] }
  })()

  const allRolled = Array.from({ length: ROUND_COUNT }, (_, i) => i + 1)
    .every(r => matchups.find(m => m.round === r))

  const selectedMaps = currentPool
    .map(id => maps.find(m => m.id === id))
    .filter(Boolean) as GameMap[]

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-mono',
          currentPool.length === FINALS_POOL_SIZE ? 'text-green-400' : 'text-zinc-600')}>
          {currentPool.length}/{FINALS_POOL_SIZE} maps selected
        </span>
        {canManage && allRolled && (
          <Button size="sm" onClick={() => setShowModal(true)} icon={<Settings2 className="w-3 h-3" />}>Edit pool</Button>
        )}
      </div>

      {!allRolled ? (
        <div className="flex items-center gap-2 text-zinc-600">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <p className="text-sm">Available once all 4 group stage matchups are rolled.</p>
        </div>
      ) : selectedMaps.length === 0 ? (
        <p className="text-sm text-zinc-700 italic">No maps selected yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedMaps.map(m => (
            <div key={m.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-zinc-800 border border-zinc-700">
              <Swords className="w-3 h-3 text-amber-600 flex-shrink-0" />
              <span className="font-display text-[11px] font-bold text-zinc-100">{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FinalsPoolModal
          maps={maps} slug={slug} project={project} matchups={matchups}
          onProjectUpdate={onProjectUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─── Matchups tab ─────────────────────────────────────────────────────────────

const ROUND_COUNT = 4

export default function MatchupsTab({ slug, role }: { slug: string; role: ViewRole }) {
  const canManage = role === 'admin' || role === 'host'
  const qc         = useQueryClient()
  const invalidate = useInvalidate()
  const projectQ   = useTournament(slug)
  const mapsQ      = useMaps()
  const factionsQ  = useFactions()
  const matchupsQ  = useMatchups(slug)
  const [showPoolModal, setShowPoolModal] = useState(false)

  const project  = projectQ.data
  const maps     = mapsQ.data ?? []
  const factions = factionsQ.data ?? []
  const matchups = matchupsQ.data ?? []

  // Modals hand back the updated row; write it into the cache directly.
  const onProjectUpdate = (p: Tournament) => qc.setQueryData(qk.tournament(slug), p)
  function onRolled(m: Matchup) {
    qc.setQueryData(qk.matchups(slug), (prev: Matchup[] | undefined) => {
      const list = prev ?? []
      const i = list.findIndex(x => x.round === m.round && x.bracket_id === m.bracket_id)
      return i >= 0 ? list.map((x, idx) => idx === i ? m : x) : [...list, m]
    })
    invalidate(qk.matchups(slug))
  }

  if (!project || mapsQ.isPending || factionsQ.isPending || matchupsQ.isPending) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
    </div>
  )

  const tournamentPool: number[] = (() => {
    try { return JSON.parse(project.map_pool ?? '[]') } catch { return [] }
  })()

  const poolMaps     = maps.filter(m => m.is_active && tournamentPool.includes(m.id))
  const poolIdSet    = new Set(poolMaps.map(m => m.id))
  const hardExcluded = maps.filter(m => m.is_active && !poolIdSet.has(m.id)).map(m => m.id)

  function getUsedIds(excludingRound: number): number[] {
    return matchups.filter(m => m.round !== excludingRound && m.map_id).map(m => m.map_id!)
  }

  const poolConfigured = tournamentPool.length > 0

  return (
    <div className="space-y-8">
      {/* Group stage */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Group stage matchups</SectionLabel>
            <p className="text-sm text-zinc-600">4 rounds · map + faction assignment for each</p>
          </div>
          {canManage && (
            <Button onClick={() => setShowPoolModal(true)} icon={<Settings2 className="w-3.5 h-3.5" />}>
              {poolConfigured ? `Map pool (${tournamentPool.length})` : 'Configure map pool'}
            </Button>
          )}
        </div>

        {!poolConfigured && canManage ? (
          <EmptyState icon={Map} message="Configure the tournament map pool before rolling matchups." />
        ) : maps.filter(m => m.is_active).length === 0 ? (
          <EmptyState icon={Map} message="No active maps. Admin manages the global map pool." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(r => (
              <RoundSlot
                key={r}
                round={r} label={`Round ${r}`} slug={slug}
                poolMaps={poolMaps}
                usedInOtherRounds={getUsedIds(r)}
                hardExcluded={hardExcluded}
                factions={factions}
                matchup={matchups.find(m => m.round === r)}
                canManage={canManage}
                onRolled={onRolled}
              />
            ))}
          </div>
        )}
      </div>

      {/* Semi-finals */}
      <div className="space-y-4">
        <div>
          <SectionLabel>Semi-finals matchup</SectionLabel>
          <p className="text-sm text-zinc-600">Map + faction assignment for semi-finals</p>
        </div>
        {poolConfigured && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-start-1">
              <RoundSlot
                round={4} label="Semi-Finals" slug={slug}
                poolMaps={poolMaps}
                usedInOtherRounds={getUsedIds(4)}
                hardExcluded={hardExcluded}
                factions={factions}
                matchup={matchups.find(m => m.round === 4)}
                canManage={canManage}
                onRolled={onRolled}
              />
            </div>
          </div>
        )}
        {!poolConfigured && canManage && (
          <p className="text-sm text-zinc-700 italic">Configure the map pool first.</p>
        )}
      </div>

      {/* Finals */}
      <div className="space-y-4">
        <div>
          <SectionLabel>Finals matchup</SectionLabel>
          <p className="text-sm text-zinc-600">5-map pool for the pick-ban phase</p>
        </div>
        <FinalsPoolSection
          maps={maps} slug={slug} project={project} matchups={matchups}
          onProjectUpdate={onProjectUpdate} canManage={canManage}
        />
      </div>

      {showPoolModal && (
        <MapPoolModal
          maps={maps} slug={slug} project={project}
          onProjectUpdate={onProjectUpdate}
          onClose={() => setShowPoolModal(false)}
        />
      )}
    </div>
  )
}
