import { useState } from 'react'
import { Loader2, Check, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { auctionsApi } from '@/api/auctions'
import { useToast } from '@/context/ToastContext'
import { Button, Label, inputSmCls } from '@/components/ui'
import { qk, useInvalidate, useResults, useAvailablePlayers } from '@/queries'

export default function AuctionResultsModal({ auctionId, auctionName, canManage, playersPerTeam, onClose, onAuctionChange }: {
  auctionId:       number
  auctionName:     string
  canManage:       boolean
  playersPerTeam:  number
  onClose:         () => void
  onAuctionChange: () => void
}) {
  const { toast } = useToast()
  const invalidate = useInvalidate()
  const [editMode,       setEditMode]       = useState(false)
  const [addTarget,      setAddTarget]      = useState<{ captainId: number; playerId: number | null; price: string } | null>(null)
  const [busy,           setBusy]           = useState(false)
  const [confirm,        setConfirm]        = useState<'reopen' | 'wipe' | null>(null)

  const resultsQ = useResults(auctionId)
  const availQ   = useAvailablePlayers(auctionId, editMode)
  const teams        = resultsQ.data ?? []
  const availPlayers = availQ.data ?? []
  const loading      = resultsQ.isPending

  // Roster edits change both the results and which players are still free.
  const refreshRosters = () => invalidate(qk.results(auctionId), qk.availablePlayers(auctionId))

  async function removePurchase(purchaseId: number) {
    await auctionsApi.removePurchase(auctionId, purchaseId)
    await refreshRosters()
  }

  async function addPurchase() {
    if (!addTarget || !addTarget.playerId) return
    setBusy(true)
    try {
      await auctionsApi.addPurchase(auctionId, {
        captain_id: addTarget.captainId,
        player_id:  addTarget.playerId,
        price:      Number(addTarget.price) || 0,
      })
      setAddTarget(null)
      await refreshRosters()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false) }
  }

  async function handleReopen() {
    setBusy(true)
    try {
      await auctionsApi.reopen(auctionId)
      toast('Auction reopened', 'success')
      onAuctionChange(); onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false); setConfirm(null) }
  }

  function exportNames() {
    const data = teams.map(({ captain, players }) => ({
      captain: captain.display_name,
      players: players.map(p => p.player_name),
    }))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `${auctionName}-roster.json`
    a.click()
  }

  async function handleWipe() {
    setBusy(true)
    try {
      await auctionsApi.wipe(auctionId)
      toast('Auction wiped', 'success')
      onAuctionChange(); onClose()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed', 'error')
    } finally { setBusy(false); setConfirm(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel border-zinc-700 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_24px_48px_rgba(0,0,0,0.6)]">

        {/* Header */}
        <div className="panel-head flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div>
            <Label>Auction results</Label>
            <h2 className="font-display text-base font-bold tracking-[0.04em] text-zinc-50">{auctionName}</h2>
          </div>
          <div className="flex items-center gap-2">
            {!loading && teams.length > 0 && (
              <Button size="sm" variant="ghost" onClick={exportNames} title="Export names" icon={<Download className="w-4 h-4" />} aria-label="Export names" />
            )}
            {canManage && !confirm && (
              <Button size="sm" variant={editMode ? 'gilt-outline' : 'secondary'} onClick={() => setEditMode(e => !e)}>
                {editMode ? 'Done editing' : 'Edit rosters'}
              </Button>
            )}
            <button onClick={onClose} className="p-1 rounded-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {teams.map(({ captain, players }) => (
                <div key={captain.id} className="bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden">
                  {/* Team header */}
                  <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xs font-bold tracking-[0.04em] text-zinc-50 truncate">
                        {captain.team_name ?? `${captain.display_name}'s team`}
                      </p>
                      <p className="text-xs text-amber-300 truncate">{captain.display_name}</p>
                    </div>
                    <span className={cn('text-xs font-mono flex-shrink-0',
                      players.length < playersPerTeam ? 'text-red-500' : 'text-zinc-600')}>
                      {players.length}/{playersPerTeam}
                    </span>
                  </div>

                  {/* Player list */}
                  <ul className="divide-y divide-zinc-800/40">
                    {players.map(p => (
                      <li key={p.id} className="flex items-center gap-2 px-4 py-1.5">
                        <span className="text-xs text-zinc-300 flex-1 truncate">{p.player_name}</span>
                        <span className="text-xs font-mono text-zinc-500 tabular-nums">{p.price.toFixed(1)}</span>
                        {editMode && (
                          <button onClick={() => removePurchase(p.id)}
                            className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Add player row (edit mode) */}
                  {editMode && (
                    addTarget?.captainId === captain.id ? (
                      <div className="px-3 py-2 border-t border-zinc-800/60 flex items-center gap-1.5">
                        <select
                          value={addTarget.playerId ?? ''}
                          onChange={e => setAddTarget(t => t && ({ ...t, playerId: Number(e.target.value) || null }))}
                          className={cn(inputSmCls, 'flex-1 text-xs px-2 py-1')}>
                          <option value="">Select player…</option>
                          {availPlayers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.classes ? ` (${p.classes})` : ''}</option>
                          ))}
                        </select>
                        <input
                          type="number" min="0" step="0.1" placeholder="0.0"
                          value={addTarget.price}
                          onChange={e => setAddTarget(t => t && ({ ...t, price: e.target.value }))}
                          className={cn(inputSmCls, 'w-14 text-xs text-center px-1 py-1 font-mono [appearance:textfield]')} />
                        <button onClick={addPurchase} disabled={busy || !addTarget.playerId}
                          className="text-amber-400 hover:text-amber-300 disabled:opacity-40 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAddTarget(null)} className="text-zinc-600 hover:text-zinc-300 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddTarget({ captainId: captain.id, playerId: null, price: '0' })}
                        className="w-full px-4 py-1.5 text-left font-display text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 hover:text-amber-400 border-t border-zinc-800 transition-colors">
                        + add player
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin footer */}
        {canManage && (
          <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
            {confirm === null ? (
              <>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setConfirm('reopen')} className="hover:text-amber-400 hover:border-amber-700">Reopen auction</Button>
                  <Button size="sm" onClick={() => setConfirm('wipe')} className="hover:text-red-400 hover:border-red-700">Wipe auction</Button>
                </div>
                <p className="font-display text-[9px] uppercase tracking-[0.2em] text-zinc-600">admin only</p>
              </>
            ) : confirm === 'reopen' ? (
              <div className="flex items-center gap-3 w-full">
                <p className="text-xs text-zinc-400 flex-1">Reopen the auction and set the session to paused?</p>
                <Button size="sm" variant="gilt-outline" onClick={handleReopen} loading={busy}>Confirm reopen</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <p className="text-xs text-red-400 flex-1">This will delete all purchases and reset the auction. Irreversible.</p>
                <Button size="sm" variant="danger" onClick={handleWipe} loading={busy}>Confirm wipe</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
