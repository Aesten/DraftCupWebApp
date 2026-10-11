import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn, imgSrc } from '@/lib/utils'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { type GameMap } from '@/api/maps'
import { useToast } from '@/context/ToastContext'
import { Button, Modal } from '@/components/ui'

export default function MapPoolModal({ maps, slug, project, onProjectUpdate, onClose }: {
  maps:            GameMap[]
  slug:            string
  project:         Tournament
  onProjectUpdate: (p: Tournament) => void
  onClose:         () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const currentPool: number[] = (() => {
    try { return JSON.parse(project.map_pool ?? '[]') } catch { return [] }
  })()

  const [selected, setSelected] = useState<Set<number>>(new Set(currentPool))

  const activeMaps = maps.filter(m => m.is_active)

  function toggle(id: number) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await tournamentsApi.update(slug, { map_pool: [...selected] })
      onProjectUpdate(updated)
      toast('Tournament map pool saved')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Tournament map pool"
      onClose={() => { if (!saving) onClose() }}
      width="w-full max-w-lg"
      className="max-h-[90vh] flex flex-col [&>div:nth-child(2)]:overflow-y-auto [&>div:nth-child(2)]:flex-1"
      footer={<>
        <p className={cn('flex-1 self-center text-xs font-mono', selected.size === 0 ? 'text-zinc-700' : 'text-zinc-500')}>
          {selected.size} map{selected.size !== 1 ? 's' : ''} selected
        </p>
        <Button variant="primary" onClick={save} loading={saving} disabled={selected.size === 0}>Save pool</Button>
      </>}
    >
      <p className="text-xs text-zinc-500 mb-3">Select which maps can be rolled for group stage rounds.</p>
      {activeMaps.length === 0 ? (
        <p className="text-sm text-zinc-600 italic">No active maps in the global pool.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {activeMaps.map(m => {
            const on = selected.has(m.id)
            return (
              <button key={m.id} onClick={() => toggle(m.id)}
                className={cn(
                  'relative rounded-sm overflow-hidden border transition-colors aspect-video text-left',
                  on ? 'border-amber-500 shadow-[inset_0_0_0_1px_#c8a24a]' : 'border-zinc-700 hover:border-zinc-500',
                )}>
                {m.image_path
                  ? <img src={imgSrc(m.image_path)} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 bg-zinc-800" />
                }
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />

                <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5">
                  <span className={cn('font-display text-[11px] font-bold truncate block', on ? 'text-amber-400' : 'text-zinc-100')}>
                    {m.name}
                  </span>
                </div>

                {on && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-amber-500 flex items-center justify-center rotate-45">
                    <Check className="w-2.5 h-2.5 text-zinc-950 -rotate-45" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
