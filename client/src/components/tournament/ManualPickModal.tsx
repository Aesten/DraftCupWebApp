import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bracketsApi, type Matchup } from '@/api/brackets'
import { type GameMap, type Faction } from '@/api/maps'
import { useToast } from '@/context/ToastContext'
import { Button, Modal, inputSmCls } from '@/components/ui'

import Aserai  from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire  from '@/assets/factions/Empire.webp'
import Khuzait from '@/assets/factions/Khuzait.webp'
import Sturgia from '@/assets/factions/Sturgia.webp'
import Vlandia from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

// ─── Faction circle selector ──────────────────────────────────────────────────

function FactionSelector({ side, factions, selected, onSelect }: {
  side:     'a' | 'b'
  factions: Faction[]
  selected: Faction | null
  onSelect: (f: Faction) => void
}) {
  const color = side === 'a' ? 'text-blue-400' : 'text-violet-400'
  const ring  = side === 'a' ? 'border-blue-400' : 'border-violet-400'
  const label = side === 'a' ? 'Side A' : 'Side B'

  return (
    <div className="flex flex-col items-center gap-3">
      <p className={cn('font-display text-[10px] font-semibold uppercase tracking-[0.2em]', color)}>{label}</p>
      <div className="flex flex-col gap-2">
        {factions.map(f => {
          const img  = FACTION_ICONS[f.name]
          const sel  = selected?.id === f.id
          return (
            <button key={f.id} onClick={() => onSelect(f)} className="flex flex-col items-center gap-1 group">
              <div className={cn(
                'w-12 h-12 rounded-full overflow-hidden border transition-colors',
                sel ? cn(ring, 'shadow-[0_0_0_2px_#0c0b09,0_0_0_3px_currentColor]', color) : 'border-zinc-700 group-hover:border-zinc-500',
              )}>
                {img
                  ? <img src={img} alt={f.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                      <span className="text-[9px] text-zinc-500">{f.name[0]}</span>
                    </div>
                }
              </div>
              <span className={cn('font-display text-[9px] leading-none', sel ? color : 'text-zinc-600 group-hover:text-zinc-400')}>
                {f.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function ManualPickModal({ round, slug, maps, factions, onSaved, onClose }: {
  round:    number
  slug:     string
  maps:     GameMap[]
  factions: Faction[]
  onSaved:  (m: Matchup) => void
  onClose:  () => void
}) {
  const { toast } = useToast()
  const [selectedMap, setSelectedMap] = useState<GameMap | null>(null)
  const [factionA,    setFactionA]    = useState<Faction | null>(null)
  const [factionB,    setFactionB]    = useState<Faction | null>(null)
  const [saving,      setSaving]      = useState(false)

  const canSave = !!selectedMap && !!factionA && !!factionB

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const m = await bracketsApi.setMatchup(slug, round, selectedMap.id, factionA.id, factionB.id)
      onSaved(m)
      toast(`Round ${round} set`)
      onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to save', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title={`Manual pick · Round ${round}`}
      onClose={() => { if (!saving) onClose() }}
      width="w-full max-w-lg"
      footer={
        <Button variant="primary" onClick={save} loading={saving} disabled={!canSave} icon={<Check className="w-4 h-4" />} className="w-full py-2.5">
          Save matchup
        </Button>
      }
    >
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <FactionSelector side="a" factions={factions} selected={factionA} onSelect={setFactionA} />

        <div className="flex flex-col items-center gap-2 min-w-[140px]">
          <div className="relative w-full">
            <select
              value={selectedMap?.id ?? ''}
              onChange={e => {
                const m = maps.find(m => m.id === Number(e.target.value))
                setSelectedMap(m ?? null)
              }}
              className={cn(inputSmCls, 'w-full appearance-none text-center pr-7 cursor-pointer')}
            >
              <option value="" disabled>Pick a map…</option>
              {maps.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          </div>

          {selectedMap && (
            <span className="font-display text-[11px] font-bold text-amber-400 text-center">{selectedMap.name}</span>
          )}

          <div className="mt-2 flex items-center gap-2 w-full">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="font-display text-[10px] font-bold text-zinc-600 tracking-[0.2em]">VS</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
        </div>

        <FactionSelector side="b" factions={factions} selected={factionB} onSelect={setFactionB} />
      </div>
    </Modal>
  )
}
