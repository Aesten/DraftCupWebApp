import { useState } from 'react'
import { Check, X, Dices } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bracketsApi, type Matchup } from '@/api/brackets'
import { type GameMap, type Faction } from '@/api/maps'
import { useToast } from '@/context/ToastContext'
import { Button, Modal } from '@/components/ui'

import Aserai  from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire  from '@/assets/factions/Empire.webp'
import Khuzait from '@/assets/factions/Khuzait.webp'
import Sturgia from '@/assets/factions/Sturgia.webp'
import Vlandia from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

function FactionCircle({ name }: { name: string | null | undefined }) {
  const src = name ? FACTION_ICONS[name] : undefined
  if (!src) return (
    <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
      <span className="text-[9px] text-zinc-500">?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className="w-9 h-9 rounded-full object-cover border border-amber-700 shadow-[0_0_0_2px_#0c0b09] flex-shrink-0" />
}

export default function RollModal({ round, slug, maps, usedMapIds, hardExcluded, factions, onRolled, onClose }: {
  round:        number
  slug:         string
  maps:         GameMap[]
  usedMapIds:   number[]
  hardExcluded: number[]
  factions:     Faction[]
  onRolled:     (m: Matchup) => void
  onClose:      () => void
}) {
  const { toast } = useToast()
  const [excluded,  setExcluded]  = useState<Set<number>>(new Set())
  const [rolling,   setRolling]   = useState(false)
  const [result,    setResult]    = useState<Matchup | null>(null)

  const available = maps.filter(m => !excluded.has(m.id))

  function toggle(id: number) {
    setExcluded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function roll() {
    if (available.length === 0 || rolling) return
    setRolling(true)
    try {
      const m = await bracketsApi.rollMatchup(slug, round, [...hardExcluded, ...excluded])
      setResult(m)
      onRolled(m)
      toast(`Round ${round} rolled`)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to roll', 'error')
    } finally { setRolling(false) }
  }

  const fa = result ? factions.find(f => f.id === result.faction_a_id) : null
  const fb = result ? factions.find(f => f.id === result.faction_b_id) : null

  return (
    <Modal
      title={`Roll · Round ${round}`}
      onClose={() => { if (!rolling) onClose() }}
      width="w-full max-w-md"
      className="max-h-[90vh] flex flex-col [&>div:nth-child(2)]:overflow-y-auto [&>div:nth-child(2)]:flex-1"
      footer={!result ? (
        <Button variant="primary" onClick={roll} loading={rolling} disabled={available.length === 0} icon={<Dices className="w-4 h-4" />} className="w-full py-2.5">
          Roll round {round}
        </Button>
      ) : (
        <Button onClick={onClose} className="w-full py-2.5">Done</Button>
      )}
    >
      {result ? (
        <div className="plaque flex items-center gap-3 px-3 py-2.5 rounded-sm">
          <FactionCircle name={fa?.name} />
          <div className="flex-1 min-w-0 text-center">
            <p className="font-display text-sm font-bold text-amber-400">{result.map_name}</p>
            <p className="text-xs text-zinc-500">{fa?.name ?? '?'} vs {fb?.name ?? '?'}</p>
          </div>
          <FactionCircle name={fb?.name} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Map pool</p>
            <span className="text-xs font-mono text-zinc-600">{available.length}/{maps.length}</span>
          </div>
          {maps.length === 0 ? (
            <p className="text-sm text-zinc-600 italic text-center py-4">No maps in tournament pool.</p>
          ) : (
            <div className="space-y-1">
              {maps.map(m => {
                const excl = excluded.has(m.id)
                const used = usedMapIds.includes(m.id)
                return (
                  <button key={m.id} onClick={() => toggle(m.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm text-left border transition-colors',
                      excl
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-600 opacity-50'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600',
                    )}>
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {excl ? <X className="w-3 h-3 text-zinc-600" /> : <Check className="w-3 h-3 text-amber-500" />}
                    </div>
                    <span className="flex-1 truncate">{m.name}</span>
                    {used && !excl && (
                      <span className="font-display text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 flex-shrink-0">
                        used
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
