import { useEffect, useLayoutEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { sessionsApi, type AuctionSession } from '@/api/sessions'
import PublicNav from '@/components/PublicNav'
import { Loader2, Radio, Pause, RefreshCw, ChevronRight, Trophy, Flag } from 'lucide-react'
import { useTitle } from '@/hooks/useTitle'
import { usePermissions } from '@/hooks/usePermissions'
import { useSessionDetail } from '@/queries'
import CurrentPlayerCard from '@/components/auction/CurrentPlayerCard'
import AuctioneerControls from '@/components/auction/AuctioneerControls'
import BidChat from '@/components/auction/BidChat'
import FreeChat from '@/components/auction/FreeChat'
import { TeamGrid, MyStatsPanel } from '@/components/auction/TeamRoster'
import UpcomingPanel from '@/components/auction/UpcomingPanel'
import ProgressCard from '@/components/auction/ProgressCard'
import PlayerPoolModal from '@/components/auction/PlayerPoolModal'
import { Button, Seal, Heading, buttonCls, Panel } from '@/components/ui'

// ─── Status seal ──────────────────────────────────────────────────────────────

export function StatusSeal({ status }: { status: AuctionSession['status'] }) {
  if (status === 'live')     return <Seal tone="live" mark>Live</Seal>
  if (status === 'paused')   return <Seal tone="paused">Paused</Seal>
  if (status === 'finished') return <Seal tone="finished">Finished</Seal>
  return <Seal tone="pending">Pending</Seal>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuctionSessionPage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>()
  const navigate            = useNavigate()
  const perms               = usePermissions()

  useEffect(() => {
    if (window.innerWidth < 768) navigate(`/t/${slug}/auction/${sessionId}/mobile`, { replace: true })
  }, [])

  const [halting,     setHalting]     = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [starting,    setStarting]    = useState(false)
  const [finishing,   setFinishing]   = useState(false)
  const [showPool,    setShowPool]    = useState(false)

  const id = Number(sessionId)
  // Cached session state, refetched on every WebSocket push and on reconnect.
  const { data: detail, isPending: loading, error: loadError, refresh: load } = useSessionDetail(id)
  const error = loadError ? (loadError instanceof Error ? loadError.message : 'Failed to load session') : ''

  // Scale the entire page so it looks proportionally the same across monitor widths.
  // 1920px is the design baseline. On wider viewports every rem/px visually grows.
  // transform:scale is used (not zoom) so that compensated width/height prevent overflow.
  const [scale, setScale] = useState(() => Math.max(1, window.innerWidth / 1920))

  useTitle(detail ? `${detail.auctionName} · Auction` : 'Auction')
  useLayoutEffect(() => {
    const apply = () => setScale(Math.max(1, window.innerWidth / 1920))
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  async function run(setBusy: (b: boolean) => void, fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn(); await load() }
    catch { /* the server message is shown by the next load */ }
    finally { setBusy(false) }
  }

  const handleHalt     = () => run(setHalting,   () => sessionsApi.pause(id))
  const handleResume   = () => run(setHalting,   () => sessionsApi.goLive(id))
  const handleSyncPool = () => run(setSyncing,   () => sessionsApi.syncPool(id))
  const handleStart    = () => run(setStarting,  () => sessionsApi.start(id))
  const handleFinish   = () => run(setFinishing, () => sessionsApi.finish(id))
  const handleRefund   = (purchaseId: number) => run(() => {}, () => sessionsApi.refund(id, purchaseId))

  const { canRunAuction, canPause, canRevokeBids, isCaptain, captainId: myCaptainId } = perms

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (error || !detail) return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">{error || 'Session not found.'}</p>
      </div>
    </div>
  )

  const { session, activePlayer, upcoming, purchases, captains, progress, auctionName, minIncrement, cooldownRemainingMs, currentBid, bidHistory, chatMessages } = detail
  const isPending  = session.status === 'pending'
  const isPaused   = session.status === 'paused'
  const isLive     = session.status === 'live'
  const isFinished = session.status === 'finished'
  const halfBudget = session.half_budget === 1

  const incomplete = captains.filter(c => purchases.filter(p => p.captain_id === c.id).length < progress.playersPerTeam)
  const finishTooltip = incomplete.length > 0
    ? `Incomplete teams: ${incomplete.map(c => c.team_name || c.display_name).join(', ')}`
    : undefined

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
    <div className="flex flex-col overflow-hidden"
      style={{
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        width:  `${100 / scale}vw`,
        height: `${100 / scale}vh`,
      }}
    >
      {/* Nav */}
      <PublicNav extra={
        <div className="flex items-center gap-2">
          <StatusSeal status={session.status} />
          {canRunAuction && isPending && (
            <Button onClick={handleSyncPool} loading={syncing} icon={<RefreshCw className="w-3 h-3" />}>Sync pool</Button>
          )}
          {canPause && isLive && (
            <Button onClick={handleHalt} loading={halting} icon={<Pause className="w-3 h-3" />}>Halt</Button>
          )}
          {canRunAuction && isPaused && (
            <Button variant="success" onClick={handleResume} loading={halting} icon={<Radio className="w-3 h-3" />}>Resume</Button>
          )}
          {canRunAuction && (isLive || isPaused) && (
            <Button variant="danger" onClick={handleFinish} loading={finishing} disabled={incomplete.length > 0}
              title={finishTooltip} icon={<Flag className="w-3 h-3" />}>
              End auction
            </Button>
          )}
          {slug && (
            <Link to={`/t/${slug}`} className="text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors mx-1">← Back</Link>
          )}
        </div>
      } />

      {/* Breadcrumb */}
      <div className="border-b border-zinc-800 flex-shrink-0">
        <div className="w-full px-[5%] py-1.5 flex items-center gap-2 text-[13px] text-zinc-600">
          <span>{slug}</span>
          <ChevronRight className="w-3 h-3 text-zinc-700" />
          <span className="font-display text-xs tracking-[0.06em] text-zinc-300">{auctionName}</span>
        </div>
      </div>

      {/* Content — fills remaining viewport, no page scroll */}
      <div className="flex-1 overflow-hidden w-full px-[5%] py-3">

        {/* Finished */}
        {isFinished && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <Trophy className="w-12 h-12 text-amber-500" />
            <Heading size="xl">Auction complete</Heading>
            <p className="text-sm text-zinc-500">{progress.sold} drafted · {progress.cycled} skipped</p>
            <Link to={`/t/${slug}?div=${session.auction_id}&view=teams`} className={buttonCls('primary', 'md', 'mt-2 px-5 py-2.5')}>
              View team compositions <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ── Non-captain layout ──────────────────────────────────────────────────
            Left  : free chat (flex 4)
            Center: player box → controls/progress row → team grid (flex 13)
            Right : upcoming → bid ledger (flex 3)
        */}
        {!isFinished && !isCaptain && (
          <div className="h-full flex gap-3">

            <div style={{ flex: 4 }} className="min-w-0 min-h-0 flex flex-col">
              <FreeChat sessionId={id} messages={chatMessages} onLoad={load} className="flex-1 min-h-0" />
            </div>

            <div className="min-w-0 flex flex-col gap-3" style={{ flex: 13 }}>
              <CurrentPlayerCard
                detail={detail}
                isLive={isLive}
                isPaused={isPaused}
                onStart={canRunAuction ? handleStart : undefined}
                starting={starting}
                currentBid={currentBid}
                className="flex-none"
              />
              {canRunAuction && isLive && (
                <div className="flex-none flex gap-3">
                  <div className="flex-1 min-w-0">
                    <AuctioneerControls
                      sessionId={id}
                      captains={captains}
                      minIncrement={minIncrement}
                      cooldownRemainingMs={cooldownRemainingMs}
                      currentBid={currentBid}
                      activePlayer={activePlayer}
                      halfBudget={halfBudget}
                      onRefresh={load}
                      onToggleHalfBudget={load}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length}
                      onOpenPool={() => setShowPool(true)} className="h-full" />
                  </div>
                </div>
              )}
              {canRunAuction && isPaused && (
                <div className="flex-none flex gap-3">
                  <div className="flex-1 min-w-0">
                    <Panel className="h-full border-amber-800" bodyClassName="flex-row items-center gap-3 px-4 py-3">
                      <Pause className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Session paused</p>
                        <p className="text-xs text-zinc-500">Use <span className="text-zinc-300">Resume</span> in the top bar to continue bidding</p>
                      </div>
                    </Panel>
                  </div>
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length} className="h-full" />
                  </div>
                </div>
              )}
              {!canRunAuction && (
                <ProgressCard progress={progress} captainCount={captains.length} className="flex-none" />
              )}
              <TeamGrid
                captains={captains}
                purchases={purchases}
                myCaptainId={myCaptainId ?? undefined}
                halfBudget={halfBudget}
                playersPerTeam={progress.playersPerTeam}
                onRefund={canRunAuction && isLive ? handleRefund : undefined}
                className="flex-1 min-h-0"
              />
            </div>

            <div style={{ flex: 3 }} className="min-w-0 flex flex-col gap-3">
              <UpcomingPanel upcoming={upcoming} />
              <BidChat
                sessionId={id}
                bidHistory={bidHistory}
                currentBid={currentBid}
                minIncrement={minIncrement}
                isLive={isLive}
                canBid={false}
                canRevoke={canRevokeBids}
                onLoad={load}
                className="flex-1 min-h-0"
              />
            </div>
          </div>
        )}

        {/* ── Captain layout ────────────────────────────────────────────────────
            4 columns: teams[0..3] | center (flex 2) | upcoming + bid ledger | teams[4..7]
        */}
        {!isFinished && isCaptain && (() => {
          const myCapData    = myCaptainId != null ? captains.find(c => c.id === myCaptainId) ?? null : null
          const myPlayers    = purchases.filter(p => p.captain_id === myCaptainId)
          const isMyTeamFull = myPlayers.length >= progress.playersPerTeam
          const half         = Math.ceil(captains.length / 2)
          const leftCaps     = captains.slice(0, half)
          const rightCaps    = captains.slice(half)
          return (
            <div className="h-full flex gap-3">
              <div style={{ flex: 1 }} className="min-w-0 min-h-0">
                <TeamGrid captains={leftCaps} purchases={purchases} myCaptainId={myCaptainId ?? undefined}
                  halfBudget={halfBudget} playersPerTeam={progress.playersPerTeam} cols={1} className="h-full" />
              </div>

              <div className="w-px bg-zinc-800 flex-shrink-0 self-stretch" />

              <div style={{ flex: 2 }} className="min-w-0 min-h-0 flex flex-col gap-3">
                <CurrentPlayerCard detail={detail} isLive={isLive} isPaused={isPaused} starting={starting} currentBid={currentBid} className="flex-none" />
                <div className="flex-none flex gap-3">
                  {myCapData && (
                    <div className="flex-1 min-w-0">
                      <MyStatsPanel captain={myCapData} players={myPlayers} halfBudget={halfBudget} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <ProgressCard progress={progress} captainCount={captains.length}
                      onOpenPool={isLive ? () => setShowPool(true) : undefined} className="h-full" />
                  </div>
                </div>
                <FreeChat sessionId={id} messages={chatMessages} onLoad={load} className="flex-1 min-h-0" />
              </div>

              <div style={{ flex: 1 }} className="min-w-0 min-h-0 flex flex-col gap-3">
                <UpcomingPanel upcoming={upcoming} />
                <BidChat
                  sessionId={id}
                  bidHistory={bidHistory}
                  currentBid={currentBid}
                  minIncrement={minIncrement}
                  isLive={isLive}
                  canBid={true}
                  captainId={myCaptainId}
                  teamFull={isMyTeamFull}
                  onLoad={load}
                  className="flex-1 min-h-0"
                />
              </div>

              <div className="w-px bg-zinc-800 flex-shrink-0 self-stretch" />

              <div style={{ flex: 1 }} className="min-w-0 min-h-0">
                <TeamGrid captains={rightCaps} purchases={purchases} myCaptainId={myCaptainId ?? undefined}
                  halfBudget={halfBudget} playersPerTeam={progress.playersPerTeam} cols={1} className="h-full" />
              </div>
            </div>
          )
        })()}
      </div>

      {showPool && (
        <PlayerPoolModal
          sessionId={id}
          canPromote={canRunAuction}
          onSetActive={load}
          onClose={() => setShowPool(false)}
        />
      )}
    </div>
    </div>
  )
}
