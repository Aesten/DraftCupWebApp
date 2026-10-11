import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type SessionDetail, type SessionBid } from '@/api/sessions'
import { CLASS_COLOR, CLASS_ICON, CLASS_LABEL, parseClasses } from '@/components/tournament/shared'
import { Panel, Button } from '@/components/ui'
import { toUnits, fromUnits } from '@shared/money'

const CLASS_FULL: Record<string, string> = { inf: 'Infantry', arc: 'Archery', cav: 'Cavalry' }

/**
 * The player on the block. Name set large in the display face, class marks
 * beneath, and the leading bid on a gilt plaque to the right.
 */
export default function CurrentPlayerCard({
  detail, isLive, isPaused, onStart, starting, currentBid, className,
}: {
  detail:      SessionDetail
  isLive:      boolean
  isPaused:    boolean
  onStart?:    () => void
  starting?:   boolean
  currentBid:  SessionBid | null
  className?:  string
}) {
  const { activePlayer, session, progress, minIncrement } = detail
  const label   = isPaused ? 'Session paused' : isLive ? 'Now up for auction' : 'Waiting to start'
  const classes = parseClasses(activePlayer?.player_classes ?? '')
  const nextMin = fromUnits((currentBid ? toUnits(currentBid.amount) : 0) + toUnits(minIncrement))

  return (
    <Panel
      title={label}
      meta={activePlayer && <span className="font-mono text-[11px] text-zinc-600">{progress.done + 1} of {progress.total}</span>}
      className={className}
    >
      {activePlayer ? (
        <div className="flex items-center justify-between gap-6 px-6 py-4">
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <span className="hairline-r h-px w-10" />
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Player</span>
            </div>
            <p className="font-display text-4xl font-bold leading-none tracking-[0.02em] text-zinc-50 truncate">
              {activePlayer.player_name}
            </p>
            {classes.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                {classes.map(cls => {
                  const Icon = CLASS_ICON[cls]
                  return (
                    <span key={cls} title={CLASS_LABEL[cls]}
                      className={cn('inline-flex items-center justify-center w-9 h-9 rounded-sm border', CLASS_COLOR[cls])}>
                      <Icon className="w-5 h-5" />
                    </span>
                  )
                })}
                <span className="text-sm text-zinc-500 ml-1">{classes.map(c => CLASS_FULL[c]).join(' · ')}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Leading bid</span>
            {currentBid ? (
              <div className="plaque flex items-baseline gap-3.5 px-4 py-2 rounded-sm">
                <span className="font-display text-base font-semibold text-zinc-100">{currentBid.captain_name}</span>
                <span className="font-mono text-3xl font-bold leading-none text-amber-400">{currentBid.amount.toFixed(1)}</span>
              </div>
            ) : (
              <div className="flex items-center px-4 py-2.5 rounded-sm border border-zinc-800 bg-zinc-950/60">
                <span className="text-sm italic text-zinc-600">No bids yet</span>
              </div>
            )}
            {isLive && (
              <span className="text-xs text-zinc-600">
                next bid at least <span className="font-mono text-zinc-400">{nextMin.toFixed(1)}</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-6">
          <p className="text-sm italic text-zinc-600">No player active</p>
          {isLive && (onStart ? (
            <Button variant="primary" onClick={onStart} loading={starting} icon={<Play className="w-3.5 h-3.5" />}>Start auction</Button>
          ) : (
            <p className="text-xs italic text-zinc-600">Waiting for the auctioneer to start the auction…</p>
          ))}
          {session.status === 'pending' && (
            <p className="text-xs text-zinc-600">Waiting for the session to go live</p>
          )}
        </div>
      )}
    </Panel>
  )
}
