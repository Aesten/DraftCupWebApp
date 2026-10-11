import { useEffect, useRef, useState } from 'react'
import { Check, SkipForward, Edit2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionBid, type SessionDetail } from '@/api/sessions'
import { getDisplayRemaining } from './BudgetHelpers'
import { Panel, Button, Modal, Field, inputSmCls } from '@/components/ui'
import { toUnits, fromUnits } from '@shared/money'

export default function AuctioneerControls({
  sessionId, captains, minIncrement, cooldownRemainingMs, currentBid, activePlayer, halfBudget, onRefresh, onToggleHalfBudget,
}: {
  sessionId:          number
  captains:           SessionDetail['captains']
  minIncrement:       number
  cooldownRemainingMs: number   // from the server; the server also enforces it on sale
  currentBid:         SessionBid | null
  activePlayer:       { player_name: string } | null
  halfBudget:         boolean
  onRefresh:          () => void
  onToggleHalfBudget: () => void
}) {
  const [showOverride,   setShowOverride]   = useState(false)
  const [captainId,      setCaptainId]      = useState<string>('')
  const [price,          setPrice]          = useState(String(minIncrement))
  const [busy,           setBusy]           = useState(false)
  const [skipping,       setSkipping]       = useState(false)
  const [toggling,       setToggling]       = useState(false)
  const [error,          setError]          = useState('')
  const [modalError,     setModalError]     = useState('')
  const [cooldownLeft,   setCooldownLeft]   = useState(0)
  const cooldownInterval    = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownEndsAt      = useRef(0)

  // Count down from the server's remaining cooldown for the current top bid.
  // This is display only: the server refuses the sale while the cooldown runs.
  useEffect(() => {
    if (cooldownInterval.current) clearInterval(cooldownInterval.current)
    cooldownInterval.current = null
    if (!currentBid || cooldownRemainingMs <= 0) { setCooldownLeft(0); return }
    cooldownEndsAt.current = Date.now() + cooldownRemainingMs
    setCooldownLeft(Math.ceil(cooldownRemainingMs / 1000))
    cooldownInterval.current = setInterval(() => {
      const remaining = Math.ceil((cooldownEndsAt.current - Date.now()) / 1000)
      if (remaining <= 0) {
        setCooldownLeft(0)
        clearInterval(cooldownInterval.current!)
        cooldownInterval.current = null
      } else {
        setCooldownLeft(remaining)
      }
    }, 200)
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current)
    }
  }, [currentBid?.id, cooldownRemainingMs])

  useEffect(() => {
    setShowOverride(false); setCaptainId(''); setPrice(String(minIncrement)); setError('')
  }, [activePlayer?.player_name, minIncrement])

  async function handleConfirm() {
    setBusy(true); setError('')
    try {
      if (!currentBid) { setError('No bid to confirm'); setBusy(false); return }
      // Tell the server which bid we are confirming: if a newer one landed in
      // the meantime the sale is refused and we re-fetch to show it.
      await sessionsApi.advance(sessionId, { action: 'sold', expected_bid_id: currentBid.id })
      onRefresh()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); onRefresh() }
    finally { setBusy(false) }
  }

  async function handleSkip() {
    setSkipping(true); setError('')
    try { await sessionsApi.advance(sessionId, { action: 'skipped' }); onRefresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setSkipping(false) }
  }

  async function handleSetBid() {
    setBusy(true); setModalError('')
    try {
      if (!captainId) { setModalError('Select a captain'); setBusy(false); return }
      // Snap to the increment grid: the server only accepts whole multiples,
      // and an override may sit at or below the current top so there is no
      // other floor to enforce here.
      const raw    = price === '' ? minIncrement : Number(price)
      const step   = toUnits(minIncrement)
      const amount = step > 0 ? Math.max(0, fromUnits(Math.round(toUnits(raw) / step) * step)) : Math.max(0, raw)
      await sessionsApi.bid(sessionId, { amount, captain_id: Number(captainId) })
      onRefresh(); setShowOverride(false)
    } catch (e: unknown) { setModalError(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(false) }
  }

  async function handleToggleHalfBudget() {
    setToggling(true)
    try { await sessionsApi.toggleHalfBudget(sessionId); onToggleHalfBudget() }
    catch { /* ignore */ } finally { setToggling(false) }
  }

  function openOverride() {
    setCaptainId(''); setPrice(String(minIncrement)); setModalError(''); setShowOverride(true)
  }

  return (
    <>
      <Panel
        title="Controls"
        meta={
          <button onClick={handleToggleHalfBudget} disabled={toggling}
            className={cn(
              'font-display text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-1 rounded-sm border transition-colors',
              halfBudget
                ? 'text-amber-400 border-amber-700 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-zinc-500 border-zinc-700 bg-zinc-800 hover:text-zinc-300',
            )}>
            {halfBudget ? 'Half budget' : 'Full budget'}
          </button>
        }
        bodyClassName="p-3 gap-2.5"
      >
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
          </p>
        )}
        <div className="flex gap-1.5">
          <Button variant="primary" onClick={handleConfirm} loading={busy}
            disabled={!activePlayer || !currentBid || cooldownLeft > 0}
            icon={<Check className="w-3 h-3" />} className="flex-1 py-2.5">
            {cooldownLeft > 0 ? `Sold · ${cooldownLeft}s` : 'Sold'}
          </Button>
          <Button onClick={handleSkip} loading={skipping} disabled={busy || !activePlayer}
            icon={<SkipForward className="w-3 h-3" />} className="flex-1 py-2.5">
            Skip
          </Button>
          <Button onClick={openOverride} disabled={!activePlayer}
            icon={<Edit2 className="w-3 h-3" />} className="flex-1 py-2.5">
            Override
          </Button>
        </div>
      </Panel>

      {showOverride && (
        <Modal
          title="Override bid"
          onClose={() => setShowOverride(false)}
          width="w-80"
          footer={<>
            <Button onClick={() => setShowOverride(false)} icon={<X className="w-3 h-3" />} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={handleSetBid} loading={busy} icon={<Check className="w-3 h-3" />} className="flex-1">Set bid</Button>
          </>}
        >
          <div className="space-y-3">
            {modalError && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />{modalError}
              </p>
            )}
            <Field label="Captain">
              <select value={captainId} onChange={e => setCaptainId(e.target.value)} className={cn(inputSmCls, 'w-full text-xs')}>
                <option value="">Select captain…</option>
                {captains.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name} — {getDisplayRemaining(c, halfBudget).toFixed(1)} left</option>
                ))}
              </select>
            </Field>
            <Field label="Price">
              <input value={price} onChange={e => setPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSetBid() }}
                type="number" step={minIncrement} min={0} placeholder="Price"
                className={cn(inputSmCls, 'w-full font-mono [appearance:textfield]')}
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  )
}
