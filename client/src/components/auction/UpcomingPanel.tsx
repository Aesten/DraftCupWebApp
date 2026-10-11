import { type SessionDetail } from '@/api/sessions'
import { ClassBadge, parseClasses } from '@/components/tournament/shared'
import { Panel } from '@/components/ui'

const NUMERAL = ['I', 'II', 'III', 'IV', 'V']

export default function UpcomingPanel({ upcoming }: { upcoming: SessionDetail['upcoming'] }) {
  if (!upcoming.length) return null
  return (
    <Panel title="Up next" className="flex-shrink-0">
      {upcoming.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2.5 px-3.5 py-1.5 border-b border-zinc-800/60 last:border-b-0">
          <span className="font-display text-[10px] text-zinc-600 w-4 flex-shrink-0">{NUMERAL[i] ?? i + 1}</span>
          <span className="text-[13px] text-zinc-400 truncate flex-1">{p.player_name}</span>
          {p.player_classes && (
            <span className="inline-flex items-center gap-0.5">
              {parseClasses(p.player_classes).map(c => <ClassBadge key={c} cls={c} />)}
            </span>
          )}
        </div>
      ))}
    </Panel>
  )
}
