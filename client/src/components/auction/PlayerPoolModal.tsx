import { useState } from 'react'
import { Loader2, ArrowUp, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi } from '@/api/sessions'
import { CLASS_COLOR, CLASS_ICON, parseClasses, type ClassKey } from '@/components/tournament/shared'
import { Button, Modal, inputSmCls } from '@/components/ui'
import { usePendingPlayers } from '@/queries'

const CLASSES: ClassKey[] = ['inf', 'arc', 'cav']
const CLASS_LABEL: Record<ClassKey, string> = { inf: 'Infantry', arc: 'Archer', cav: 'Cavalry' }
const ROW_COLS = '1fr 1.5rem 1.5rem 1.5rem auto'

export default function PlayerPoolModal({ sessionId, canPromote, onSetActive, onClose }: {
  sessionId:   number
  canPromote:  boolean
  onSetActive: () => void
  onClose:     () => void
}) {
  const { data: players = [], isPending: loading } = usePendingPlayers(sessionId)
  const [promoting,    setPromoting]    = useState<number | null>(null)
  const [search,       setSearch]       = useState('')
  const [classFilter,  setClassFilter]  = useState<ClassKey | null>(null)

  async function handleSetActive(entryId: number) {
    setPromoting(entryId)
    try {
      await sessionsApi.setActive(sessionId, entryId)
      onSetActive()
      onClose()
    } catch { /* ignore */ }
    finally { setPromoting(null) }
  }

  const q = search.trim().toLowerCase()
  const visible = players.filter(p => {
    if (q && !p.player_name.toLowerCase().includes(q)) return false
    if (classFilter && !parseClasses(p.player_classes).includes(classFilter)) return false
    return true
  })

  return (
    <Modal
      title="Player pool"
      onClose={onClose}
      width="w-full max-w-md"
      className="h-[70vh] flex flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:p-0"
      footer={<>
        <p className="flex-1 text-[11px] italic text-zinc-600">Queue order is hidden. This list is alphabetical.</p>
        <span className="font-mono text-[11px] text-zinc-600">{visible.length} / {players.length}</span>
      </>}
    >
      {/* Filters */}
      <div className="px-4 py-2.5 border-b border-zinc-800 flex gap-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className={cn(inputSmCls, 'w-full pl-7 text-xs')} />
        </div>
        {CLASSES.map(cls => (
          <button key={cls} onClick={() => setClassFilter(classFilter === cls ? null : cls)}
            className={cn(
              'px-2.5 py-1.5 rounded-sm border font-display text-[10px] font-bold uppercase tracking-[0.1em] transition-colors',
              classFilter === cls ? CLASS_COLOR[cls] : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300',
            )}>
            {CLASS_LABEL[cls]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-zinc-600 italic text-center py-10">
            {players.length === 0 ? 'No players remaining in pool' : 'No matches'}
          </p>
        ) : visible.map(p => {
          const active = parseClasses(p.player_classes)
          return (
            <div key={p.id} className="grid items-center px-4 py-2 gap-x-2 border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors"
              style={{ gridTemplateColumns: ROW_COLS }}>
              <span className="text-sm text-zinc-200 truncate">{p.player_name}</span>
              {CLASSES.map(cls => {
                const Icon = CLASS_ICON[cls]
                return (
                  <div key={cls} className="flex items-center justify-center">
                    {active.includes(cls) && (
                      <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded-sm border', CLASS_COLOR[cls])}>
                        <Icon className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                )
              })}
              {canPromote ? (
                <Button size="sm" variant="gilt-outline" onClick={() => handleSetActive(p.id)} loading={promoting === p.id}
                  icon={<ArrowUp className="w-3 h-3" />}>
                  Send to top
                </Button>
              ) : <span />}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
