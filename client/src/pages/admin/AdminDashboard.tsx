import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTitle } from '@/hooks/useTitle'
import { useAuth } from '@/context/AuthContext'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { authApi } from '@/api/auth'
import { qk, useInvalidate, useTournaments } from '@/queries'
import { cn } from '@/lib/utils'
import TournamentDetail from '@/components/tournament/TournamentDetail'
import MapsPage from './MapsPage'
import StatsPage from './StatsPage'
import {
  LogOut, FolderOpen, Map, BarChart2,
  Loader2, Plus, Trash2, Star,
  AlertCircle, Pencil
} from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { Button, Field, Input, Modal, Label, Heading } from '@/components/ui'

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenu {
  x: number; y: number
  items: { label: string; icon: React.ElementType; danger?: boolean; onClick: () => void }[]
}

function ContextMenu({ menu, onClose }: { menu: CtxMenu; onClose: () => void }) {
  useEffect(() => {
    const tid = setTimeout(() => {
      const close = (e: MouseEvent) => {
        const el = document.getElementById('ctx-menu-root')
        if (el && el.contains(e.target as Node)) return
        onClose()
      }
      window.addEventListener('mousedown', close)
      window.addEventListener('contextmenu', close)
      return () => {
        window.removeEventListener('mousedown', close)
        window.removeEventListener('contextmenu', close)
      }
    }, 0)
    return () => clearTimeout(tid)
  }, [onClose])

  const x = Math.min(menu.x, window.innerWidth  - 184)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 34 - 8)

  return (
    <div
      id="ctx-menu-root"
      className="fixed z-50 min-w-[176px] bg-zinc-800 border border-zinc-700 rounded-sm shadow-xl py-1 overflow-hidden"
      style={{ left: x, top: y }}
    >
      {menu.items.map((item, i) => (
        <button key={i} onClick={() => { item.onClick(); onClose() }}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-2 text-xs transition-colors text-left',
            item.danger
              ? 'text-red-400 hover:bg-red-600/10'
              : 'text-zinc-300 hover:bg-zinc-700'
          )}>
          <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ─── Tournament create / rename ───────────────────────────────────────────────

function TournamentModal({ initial, onSave, onClose }: {
  initial?: { name: string; description: string; slug: string }
  onSave: (t: Tournament) => void
  onClose: () => void
}) {
  const [name,        setName]    = useState(initial?.name ?? '')
  const [description, setDesc]    = useState(initial?.description ?? '')
  const [loading,     setLoading] = useState(false)
  const [error,       setError]   = useState('')
  const isEdit = !!initial

  async function submit() {
    if (!name.trim()) return
    setLoading(true); setError('')
    try {
      const t = isEdit
        ? await tournamentsApi.update(initial!.slug, { name: name.trim(), description: description.trim() || undefined })
        : await tournamentsApi.create({ name: name.trim(), description: description.trim() || undefined })
      onSave(t)
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal title={isEdit ? 'Rename tournament' : 'New tournament'} onClose={onClose} width="w-full max-w-sm">
      <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-4">
        <Field label="Tournament name">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. BDC XVII" autoFocus />
        </Field>
        <Field label="Description (optional)">
          <Input value={description} onChange={e => setDesc(e.target.value)} placeholder="Short description" />
        </Field>
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-600/10 border border-red-700 rounded-sm px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()} icon={<Plus className="w-4 h-4" />} className="flex-1 py-2.5">
            {isEdit ? 'Save' : 'Create'}
          </Button>
          <Button type="button" onClick={onClose} className="py-2.5">Cancel</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminView = { type: 'tournament'; slug: string } | { type: 'maps' } | { type: 'stats' } | null

type ModalState =
  | { type: 'create' }
  | { type: 'rename'; tournament: Tournament }
  | null

// ─── Main shell ───────────────────────────────────────────────────────────────

export default function AdminShell() {
  useTitle('Admin Dashboard')
  const { logout } = useAuth()
  const navigate   = useNavigate()

  const invalidate = useInvalidate()
  const { data: tournaments = [], isPending: loading } = useTournaments()
  // `undefined` = nothing chosen yet: open on the featured tournament, if any.
  const [chosenView,  setView]        = useState<AdminView | undefined>(undefined)
  const [modal,       setModal]       = useState<ModalState>(null)
  const [ctxMenu,     setCtxMenu]     = useState<CtxMenu | null>(null)

  const featured = tournaments.find(t => t.is_featured)
  const view: AdminView = chosenView !== undefined ? chosenView
    : featured ? { type: 'tournament', slug: featured.slug } : null

  const refreshList = () => invalidate(qk.tournaments(), qk.featured(), qk.publicList())

  function openCtx(e: React.MouseEvent, t: Tournament) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        {
          label: t.is_featured ? 'Remove from featured' : 'Set as featured',
          icon: Star,
          onClick: async () => {
            await authApi.setFeaturedTournament(t.is_featured ? null : t.id)
            await refreshList()
          },
        },
        { label: 'Rename', icon: Pencil, onClick: () => setModal({ type: 'rename', tournament: t }) },
        {
          label: 'Delete tournament', icon: Trash2, danger: true,
          onClick: async () => {
            await tournamentsApi.delete(t.slug)
            if (view?.type === 'tournament' && view.slug === t.slug) setView(null)
            await refreshList()
          },
        },
      ],
    })
  }

  async function handleLogout() { await logout(); navigate('/admin-login', { replace: true }) }

  const focusedSlug = view?.type === 'tournament' ? view.slug : null

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Modals */}
      {modal?.type === 'create' && (
        <TournamentModal
          onSave={t => { refreshList(); setView({ type: 'tournament', slug: t.slug }) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'rename' && (
        <TournamentModal
          initial={{ name: modal.tournament.name, description: modal.tournament.description ?? '', slug: modal.tournament.slug }}
          onSave={() => { refreshList(); invalidate(qk.tournament(modal.tournament.slug)) }}
          onClose={() => setModal(null)}
        />
      )}

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-zinc-800 flex flex-col shadow-[1px_0_0_#1a1712,2px_0_0_rgba(200,162,74,0.15)]" style={{ backgroundColor: 'var(--color-surface-head)' }}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-zinc-800 flex-shrink-0">
          <Link to="/" className="inline-block">
            <img src={logo} alt="BDC" className="h-11 w-auto" />
          </Link>
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600 mt-1">Admin console</p>
        </div>

        {/* Tournaments section */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-4">
          <div className="px-3">
            <div className="flex items-center justify-between mb-1.5">
              <Label>Tournaments</Label>
              <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'create' })} title="New tournament"
                icon={<Plus className="w-3 h-3" />} className="px-2 py-1 hover:text-amber-400">New</Button>
            </div>

            {loading
              ? <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 text-zinc-600 animate-spin" /></div>
              : tournaments.length === 0
                ? <p className="text-xs text-zinc-600 py-2 italic">No tournaments yet</p>
                : tournaments.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setView({ type: 'tournament', slug: t.slug })}
                      onContextMenu={e => openCtx(e, t)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer select-none transition-colors text-[13px] border-l-2',
                        focusedSlug === t.slug ? 'bg-zinc-800 text-zinc-50 border-amber-500' : 'text-zinc-500 border-transparent hover:bg-zinc-800 hover:text-zinc-300'
                      )}
                    >
                      <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                      <span className="flex-1 truncate">{t.name}</span>
                      {!!t.is_featured && <span className="lozenge" title="Featured" />}
                      {t.status === 'archived' && <span className="font-display text-[8px] uppercase tracking-[0.15em] text-zinc-600">arc</span>}
                    </div>
                  ))
            }
          </div>

          {/* Global section */}
          <div className="px-3">
            <div className="mb-1.5"><Label>Global</Label></div>
            {([['maps', 'Maps', Map], ['stats', 'Stats', BarChart2]] as const).map(([id, label, Icon]) => (
              <button key={id}
                onClick={() => setView({ type: id })}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-sm w-full text-left text-[13px] transition-colors border-l-2',
                  view?.type === id ? 'bg-zinc-800 text-zinc-50 border-amber-500' : 'text-zinc-500 border-transparent hover:bg-zinc-800 hover:text-zinc-300'
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="p-3 border-t border-zinc-800 flex-shrink-0">
          <button onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-sm text-[13px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto">
        {view === null && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-2">
            <Heading size="xl" className="text-zinc-700">Select</Heading>
            <p className="text-sm text-zinc-600">Choose a tournament, or open Maps or Stats</p>
          </div>
        )}
        {view?.type === 'tournament' && (
          <TournamentDetail slug={view.slug} roleOverride="admin" />
        )}
        {view?.type === 'maps'  && <MapsPage />}
        {view?.type === 'stats' && <StatsPage />}
      </div>
    </div>
  )
}
