import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { sessionsApi } from '@/api/sessions'
import { useTitle } from '@/hooks/useTitle'
import { usePermissions } from '@/hooks/usePermissions'
import { useSessionDetail } from '@/queries'
import { cn } from '@/lib/utils'
import { Loader2, Sword, Users } from 'lucide-react'
import CurrentPlayerCard from '@/components/auction/CurrentPlayerCard'
import BidChat from '@/components/auction/BidChat'
import FreeChat from '@/components/auction/FreeChat'
import { TeamGrid } from '@/components/auction/TeamRoster'
import ProgressCard from '@/components/auction/ProgressCard'
import PlayerPoolModal from '@/components/auction/PlayerPoolModal'
import { StatusSeal } from './AuctionSessionPage'
import { Heading } from '@/components/ui'

type Tab = 'bid' | 'teams'

export default function MobileAuctionPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>()
  const { canRunAuction, isCaptain, captainId: myCaptainId } = usePermissions()

  const [tab,       setTab]       = useState<Tab>('bid')
  const [showPool,  setShowPool]  = useState(false)
  const [starting,  setStarting]  = useState(false)

  const id = Number(sessionId)
  const { data: detail, isPending: loading, error: loadError, refresh: load } = useSessionDetail(id)
  const error = loadError ? (loadError instanceof Error ? loadError.message : 'Failed to load session') : ''

  useTitle(detail ? `${detail.auctionName} · Auction` : 'Auction')

  async function handleStart() {
    if (!detail) return
    setStarting(true)
    try { await sessionsApi.start(detail.session.id); await load() }
    catch { /* ignore */ } finally { setStarting(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (error || !detail) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <p className="text-zinc-500 text-sm">{error || 'Session not found.'}</p>
    </div>
  )

  const { session, purchases, captains, progress,
          auctionName, minIncrement, currentBid, bidHistory, chatMessages } = detail
  const isLive     = session.status === 'live'
  const isPaused   = session.status === 'paused'
  const isFinished = session.status === 'finished'
  const halfBudget = session.half_budget === 1
  const myPlayers  = purchases.filter(p => p.captain_id === myCaptainId)
  const isMyTeamFull = myPlayers.length >= progress.playersPerTeam

  const TABS: { id: Tab; label: string; Icon: typeof Sword }[] = [
    { id: 'bid',   label: 'Bid',   Icon: Sword },
    { id: 'teams', label: 'Teams', Icon: Users },
  ]

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-700 px-4 py-2.5 flex items-center justify-between gap-3"
        style={{ backgroundColor: 'var(--color-surface-head)' }}>
        <div className="flex flex-col min-w-0">
          <span className="font-display text-xs font-bold tracking-[0.06em] text-zinc-50 truncate">{auctionName}</span>
          {slug && (
            <Link to={`/t/${slug}`} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              ← {slug}
            </Link>
          )}
        </div>
        <StatusSeal status={session.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isFinished ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-4">
            <Heading size="md">Auction complete</Heading>
            <p className="text-sm text-zinc-500">{progress.sold} drafted · {progress.cycled} skipped</p>
          </div>
        ) : tab === 'bid' ? (
          <div className="h-full flex flex-col gap-3 p-3 overflow-y-auto">
            <div className="flex-shrink-0 space-y-3">
              <CurrentPlayerCard
                detail={detail}
                isLive={isLive}
                isPaused={isPaused}
                onStart={canRunAuction ? handleStart : undefined}
                starting={starting}
                currentBid={currentBid}
              />
              <ProgressCard
                progress={progress}
                captainCount={captains.length}
                onOpenPool={isLive ? () => setShowPool(true) : undefined}
              />
              <BidChat
                sessionId={id}
                bidHistory={bidHistory}
                currentBid={currentBid}
                minIncrement={minIncrement}
                isLive={isLive}
                canBid={isCaptain}
                captainId={myCaptainId}
                teamFull={isMyTeamFull}
                onLoad={load}
                className="max-h-72"
              />
            </div>
            <FreeChat
              sessionId={id}
              messages={chatMessages}
              onLoad={load}
              className="flex-1 min-h-48"
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <TeamGrid
              captains={captains}
              purchases={purchases}
              myCaptainId={myCaptainId ?? undefined}
              halfBudget={halfBudget}
              playersPerTeam={progress.playersPerTeam}
              cols={1}
            />
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      {!isFinished && (
        <div className="flex-shrink-0 border-t border-zinc-800 flex" style={{ backgroundColor: 'var(--color-surface-head)' }}>
          {TABS.map(({ id: tabId, label, Icon }) => (
            <button key={tabId} onClick={() => setTab(tabId)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 font-display text-[10px] font-bold uppercase tracking-[0.2em] transition-colors',
                tab === tabId ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
              )}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {showPool && (
        <PlayerPoolModal
          sessionId={id}
          canPromote={canRunAuction}
          onSetActive={load}
          onClose={() => setShowPool(false)}
        />
      )}
    </div>
  )
}
