import { useEffect, useRef, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionBid } from '@/api/sessions'
import { Panel, Button } from '@/components/ui'
import { toUnits, fromUnits } from '@shared/money'

const QUICK_STEPS = [0.1, 0.2, 0.5, 1.0, 2.0]

/** The bidding ledger: every bid on the current player, top bid marked in gilt, quick-bid steps for captains. */
export default function BidChat({
  sessionId, bidHistory, currentBid, minIncrement, isLive, canBid, canRevoke, captainId, teamFull, onLoad, className,
}: {
  sessionId:    number
  bidHistory:   SessionBid[]
  currentBid:   SessionBid | null
  minIncrement: number
  isLive:       boolean
  canBid:       boolean
  canRevoke?:   boolean
  captainId?:   number | null
  teamFull?:    boolean
  onLoad?:      () => void
  className?:   string
}) {
  const [amount,     setAmount]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cooldown,   setCooldown]   = useState(false)
  const [error,      setError]      = useState('')
  const bottomRef    = useRef<HTMLDivElement>(null)
  const inFlightRef  = useRef(false)   // synchronous guard — prevents double-fire before re-render
  const cooldownRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest server-confirmed top bid, readable from async callbacks without stale closures.
  const topAmountRef = useRef(currentBid?.amount ?? 0)
  // Amount the quick buttons increment from: the confirmed top, or our own bid
  // while it is in flight, so rapid clicks step up instead of repeating a value.
  const lastBidRef   = useRef(currentBid?.amount ?? 0)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [bidHistory.length])
  useEffect(() => {
    topAmountRef.current = currentBid?.amount ?? 0
    if (!inFlightRef.current) lastBidRef.current = topAmountRef.current
  }, [currentBid])
  useEffect(() => () => { if (errorTimer.current) clearTimeout(errorTimer.current) }, [])

  const nextMin = fromUnits((currentBid ? toUnits(currentBid.amount) : 0) + toUnits(minIncrement))

  // A rejection must stay visible long enough to be read, even while other
  // captains' bids keep arriving; it is only replaced by our next attempt.
  function showError(msg: string) {
    setError(msg)
    if (errorTimer.current) clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 6000)
  }

  async function submitBid(val: number) {
    if (inFlightRef.current || cooldown) return
    inFlightRef.current = true
    lastBidRef.current = val   // optimistic: next click increments from this
    setCooldown(true)
    if (cooldownRef.current) clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setCooldown(false), 1000)
    setSubmitting(true); setError('')
    try { await sessionsApi.bid(sessionId, { amount: val }); setAmount(''); onLoad?.() }
    catch (e: unknown) {
      lastBidRef.current = topAmountRef.current  // revert to the real top, not a stale prop
      showError(e instanceof Error ? e.message : 'Failed')
      onLoad?.()   // the rejection usually means someone outbid us: show it
    }
    finally { inFlightRef.current = false; setSubmitting(false) }
  }

  async function handleBid() {
    const val = parseFloat(amount)
    if (isNaN(val)) { showError('Enter a valid amount'); return }
    await submitBid(val)
  }

  return (
    <Panel
      title="Bidding"
      meta={currentBid && (
        <span className="font-mono text-xs font-bold text-amber-400" title={currentBid.captain_name}>
          {currentBid.amount.toFixed(1)}
        </span>
      )}
      className={className}
    >
      <div className="flex-1 overflow-y-auto min-h-0">
        {bidHistory.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-xs italic text-zinc-600">No bids yet</p>
          </div>
        ) : bidHistory.map((bid) => {
          const isMe  = bid.captain_id === captainId
          const isTop = currentBid ? bid.id === currentBid.id : false
          return (
            <div key={bid.id} className={cn(
              'group flex items-center justify-between gap-2 px-3.5 py-1.5 border-b border-zinc-800/60',
              isTop && 'bg-amber-500/[0.06] border-l-2 border-l-amber-500 pl-3',
              isMe && !isTop && 'bg-amber-500/[0.03]',
            )}>
              {/* An auctioneer override is marked by colour alone, the same violet used for
                  "Auctioneer" everywhere else (chat, dashboards) — not a text badge. */}
              <span className={cn('text-[13px] truncate',
                bid.is_override ? 'text-violet-400' : isTop ? 'text-zinc-100' : isMe ? 'text-amber-300' : 'text-zinc-500',
                isTop && 'font-semibold',
              )} title={bid.is_override ? 'Set by the auctioneer' : undefined}>
                {bid.captain_name}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={cn('font-mono text-xs', isTop ? 'text-amber-400 font-bold' : 'text-zinc-600')}>
                  {bid.amount.toFixed(1)}
                </span>
                {canRevoke && (
                  <button
                    onClick={() => { sessionsApi.revokeBid(sessionId, bid.id).then(() => onLoad?.()).catch(() => {}) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-sm text-zinc-600 hover:text-red-400 hover:bg-red-600/10"
                    title="Revoke bid"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {canBid && isLive && teamFull && (
        <div className="border-t border-green-800 bg-green-950 px-4 py-2.5 flex-shrink-0">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-green-400 text-center">Roster complete</p>
        </div>
      )}

      {canBid && isLive && !teamFull && (
        <div className="border-t border-zinc-800 p-2.5 flex-shrink-0 space-y-2">
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
            </p>
          )}
          <div className="flex gap-1">
            {QUICK_STEPS.map(d => (
              <Button key={d} variant="gilt-outline" size="sm"
                onClick={() => submitBid(fromUnits(toUnits(lastBidRef.current) + toUnits(d)))}
                disabled={submitting || cooldown}
                className="flex-1 min-w-0 px-0 py-2 font-mono tracking-normal text-[11px]">
                +{d.toFixed(1)}
              </Button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input value={amount} onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBid() }}
              type="number" step={minIncrement} min={nextMin}
              placeholder={`Min ${nextMin.toFixed(1)}`}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-sm bg-zinc-950 border border-zinc-700 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 placeholder:italic placeholder:font-sans focus:outline-none focus:border-amber-600 [appearance:textfield]"
            />
            <Button variant="primary" onClick={handleBid} loading={submitting} disabled={!amount}>Bid</Button>
          </div>
        </div>
      )}

      {!canBid && !isLive && (
        <div className="border-t border-zinc-800 px-4 py-2 flex-shrink-0">
          <p className="text-xs italic text-zinc-600 text-center">Session not live</p>
        </div>
      )}
    </Panel>
  )
}
