import { List } from 'lucide-react'
import { type SessionDetail } from '@/api/sessions'
import { Panel } from '@/components/ui'

export default function ProgressCard({ progress, captainCount, onOpenPool, className }: {
  progress:     SessionDetail['progress']
  captainCount: number
  onOpenPool?:  () => void
  className?:   string
}) {
  const needed = progress.playersPerTeam * captainCount
  const pct    = needed > 0 ? Math.min(100, (progress.sold / needed) * 100) : 0

  return (
    <Panel
      title="Progress"
      meta={<span className="font-mono text-xs font-semibold text-zinc-100">{progress.sold} / {needed}</span>}
      className={className}
      bodyClassName="justify-center gap-2 px-3.5 py-3"
    >
      <div className="h-[7px] p-px border border-zinc-800 bg-zinc-950">
        <div className="h-full bg-gradient-to-r from-amber-700 to-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>{progress.cycled} skipped</span>
        {onOpenPool ? (
          <button onClick={onOpenPool} className="flex items-center gap-1 text-zinc-500 hover:text-amber-400 transition-colors">
            <List className="w-3 h-3" />
            {progress.poolRemaining} remaining in the pool
          </button>
        ) : (
          <span>{progress.poolRemaining} remaining in the pool</span>
        )}
      </div>
    </Panel>
  )
}
