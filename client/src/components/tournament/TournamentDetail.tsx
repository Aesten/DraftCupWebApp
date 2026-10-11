import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { bracketsApi } from '@/api/brackets'
import { auctionsApi, type Auction } from '@/api/auctions'
import { Loader2, Users, Map, Settings, Layers, Plus, Pencil, Trash2 } from 'lucide-react'
import { type ViewRole } from './shared'
import { Button, Field, Input, Modal, Heading } from '@/components/ui'
import { qk, useInvalidate, useTournament, useAuctions } from '@/queries'
import PlayersTab  from './PlayersTab'
import MatchupsTab from './MatchupsTab'
import ConfigTab   from './ConfigTab'
import DivisionTab from './DivisionTab'
import { cn } from '@/lib/utils'

type TabId = 'players' | 'matchups' | 'config' | `division:${number}`

export interface TournamentDetailProps {
  slug:          string
  roleOverride?: ViewRole
}

// ─── Setup Division modal ─────────────────────────────────────────────────────

function SetupDivisionModal({ slug, onCreated, onClose }: {
  slug: string
  onCreated: (auction: Auction) => Promise<void>
  onClose: () => void
}) {
  const [name,  setName]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!name.trim()) return
    setBusy(true); setError('')
    try {
      const auction = await auctionsApi.create(slug, {
        name: name.trim(),
      })
      await bracketsApi.create(slug, {
        name:       name.trim(),
        auction_id: auction.id,
      })
      await onCreated(auction)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create division')
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title="Setup division"
      onClose={onClose}
      width="w-full max-w-sm"
      footer={<>
        <Button onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={create} loading={busy} disabled={!name.trim()} className="flex-1">Create</Button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">A division bundles an auction and a bracket together under one tab.</p>
        <Field label="Name">
          <Input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            autoFocus placeholder="e.g. Division A…" />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}

const TAB_CLS = 'flex items-center gap-1.5 px-3.5 py-2.5 -mb-px font-display text-[11px] font-bold uppercase tracking-[0.12em] border-b-2 transition-colors whitespace-nowrap'
const tabCls = (active: boolean) => cn(TAB_CLS, active ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')

// ─── Tournament detail ────────────────────────────────────────────────────────

export default function TournamentDetail({ slug, roleOverride }: TournamentDetailProps) {
  const { user } = useAuth()
  const role: ViewRole = roleOverride ?? (
    user?.role === 'auctioneer' ? 'auctioneer' :
    user?.role === 'captain'    ? 'captain'    :
    user?.role === 'admin'      ? 'admin'      : 'host'
  )

  const invalidate = useInvalidate()
  const projectQ   = useTournament(slug)
  const auctionsQ  = useAuctions(slug)
  const project    = projectQ.data
  const auctions   = auctionsQ.data ?? []

  // `null` = no tab chosen yet: fall back to the role's natural landing tab.
  const [chosenTab,     setChosenTab]     = useState<TabId | null>(null)
  const [showDivModal,  setShowDivModal]  = useState(false)
  const [ctxMenu,       setCtxMenu]       = useState<{ id: number; name: string; status: Auction['status']; x: number; y: number } | null>(null)
  const [renameTarget,  setRenameTarget]  = useState<{ id: number; name: string } | null>(null)
  const [renameBusy,    setRenameBusy]    = useState(false)
  const [deleteBusy,    setDeleteBusy]    = useState(false)
  const ctxRef = useRef<HTMLDivElement>(null)

  const visibleAuctions = auctions.filter(a => role !== 'captain' || a.id === user?.auctionId)
  const defaultTab: TabId =
    (role === 'auctioneer' || role === 'captain') && visibleAuctions.length > 0
      ? `division:${visibleAuctions[0].id}`
      : 'players'
  const tabIsValid = (t: TabId) => !t.startsWith('division:') || visibleAuctions.some(a => `division:${a.id}` === t)
  const tab: TabId = chosenTab && tabIsValid(chosenTab) ? chosenTab : defaultTab

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    function onDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ctxMenu])

  async function handleRename() {
    if (!renameTarget) return
    setRenameBusy(true)
    try {
      await auctionsApi.update(renameTarget.id, { name: renameTarget.name })
      await invalidate(qk.auctions(slug), qk.auction(renameTarget.id))
      setRenameTarget(null)
    } catch { /* ignore */ } finally { setRenameBusy(false) }
  }

  async function handleDelete(id: number) {
    setDeleteBusy(true)
    setCtxMenu(null)
    try {
      await auctionsApi.delete(id)
      if (tab === `division:${id}`) setChosenTab('players')
      await invalidate(qk.auctions(slug), qk.brackets(slug))
    } catch { /* ignore */ } finally { setDeleteBusy(false) }
  }

  async function handleDivisionCreated(auction: Auction) {
    await invalidate(qk.auctions(slug), qk.brackets(slug))
    setChosenTab(`division:${auction.id}`)
    setShowDivModal(false)
  }

  if (projectQ.isPending || auctionsQ.isPending) return (
    <div className="flex items-center justify-center h-full py-24">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  )

  if (!project || auctionsQ.isError) return (
    <div className="flex items-center justify-center h-full py-24 text-zinc-600">
      <p className="text-sm">Failed to load tournament.</p>
    </div>
  )

  const canManage = role === 'admin' || role === 'host'

  const staticTabs: { id: TabId; label: string; icon: React.ElementType }[] = (role === 'auctioneer' || role === 'captain')
    ? [{ id: 'players', label: 'Player pool', icon: Users }]
    : [
        { id: 'players',  label: 'Player pool',   icon: Users    },
        { id: 'matchups', label: 'Matchups',       icon: Map      },
        { id: 'config',   label: 'Configuration', icon: Settings },
      ]

  const activeAuction = tab.startsWith('division:')
    ? auctions.find(a => a.id === Number(tab.split(':')[1])) ?? null
    : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800">
        <div className="w-full px-[5%] pt-5 pb-0">
          <Heading className="mb-0.5">{project.name}</Heading>
          <p className="text-xs text-zinc-600 font-mono mb-3">/{project.slug}</p>

          <div className="flex items-center gap-0.5 overflow-x-auto">
            {staticTabs.map(t => (
              <button key={t.id} onClick={() => setChosenTab(t.id)} className={tabCls(tab === t.id)}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}

            {/* Division separator + tabs */}
            {(auctions.length > 0 || canManage) && (
              <>
                <div className="w-px h-5 bg-zinc-700 mx-1.5 flex-shrink-0" />
                {visibleAuctions.map(a => (
                  <button key={a.id}
                    onClick={() => setChosenTab(`division:${a.id}`)}
                    onContextMenu={canManage ? e => { e.preventDefault(); setCtxMenu({ id: a.id, name: a.name, status: a.status, x: e.clientX, y: e.clientY }) } : undefined}
                    className={tabCls(tab === `division:${a.id}`)}>
                    <Layers className="w-3.5 h-3.5" />{a.name}
                  </button>
                ))}
                {canManage && (
                  auctions.length === 0
                    ? <button onClick={() => setShowDivModal(true)} className={tabCls(false)}>
                        <Plus className="w-3.5 h-3.5" /> Setup division
                      </button>
                    : <button onClick={() => setShowDivModal(true)} className={cn(tabCls(false), 'px-2.5 text-zinc-600')} title="Add division">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content — only the active tab is mounted; the query cache keeps a
          previously visited tab's data so switching back shows it at once. */}
      <div className="flex-1 overflow-auto">
        {activeAuction ? (
          <div className="pl-[5%] pr-[5%] py-6 max-w-[80vw]">
            <DivisionTab key={activeAuction.id} auction={activeAuction} slug={slug} role={role} project={project} />
          </div>
        ) : (
          <div className="pl-[5%] py-6">
            {tab === 'players'  && <div className="max-w-[50vw]"><PlayersTab  slug={slug} role={role} /></div>}
            {tab === 'matchups' && <div className="max-w-[70vw]"><MatchupsTab slug={slug} role={role} /></div>}
            {tab === 'config'   && <div className="max-w-[40vw]"><ConfigTab   slug={slug} role={role} /></div>}
          </div>
        )}
      </div>

      {showDivModal && (
        <SetupDivisionModal
          slug={slug}
          onCreated={handleDivisionCreated}
          onClose={() => setShowDivModal(false)}
        />
      )}

      {/* Division context menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-sm shadow-xl py-1 w-44"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <button
            onClick={() => { setRenameTarget({ id: ctxMenu.id, name: ctxMenu.name }); setCtxMenu(null) }}
            disabled={ctxMenu.status !== 'setup'}
            title={ctxMenu.status !== 'setup' ? 'Cannot rename after auction has started' : undefined}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Pencil className="w-3.5 h-3.5" /> Rename
          </button>
          <button
            onClick={() => handleDelete(ctxMenu.id)}
            disabled={ctxMenu.status !== 'setup' || deleteBusy}
            title={ctxMenu.status !== 'setup' ? 'Cannot delete after auction has started' : undefined}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <Modal
          title="Rename division"
          onClose={() => setRenameTarget(null)}
          width="w-80"
          footer={<>
            <Button onClick={() => setRenameTarget(null)} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={handleRename} loading={renameBusy} disabled={!renameTarget.name.trim()} className="flex-1">Rename</Button>
          </>}
        >
          <Input
            autoFocus
            value={renameTarget.name}
            onChange={e => setRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null) }}
          />
        </Modal>
      )}
    </div>
  )
}
