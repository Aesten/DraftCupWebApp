import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { tournamentsApi, type Tournament } from '@/api/tournaments'
import { authApi } from '@/api/auth'
import { useAuth } from '@/context/AuthContext'
import { Eye, EyeOff, Key, ShieldOff, RefreshCw, LogIn, Users, Link2, Check, Loader2 } from 'lucide-react'
import { SectionLabel, inputCls, inputSmCls, type ViewRole } from './shared'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui'
import { qk, useTournament } from '@/queries'
import { cn } from '@/lib/utils'

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({ token, busy, onGenerate, onRevoke, loginLabel, onLoginAs, showCopyUrl }: {
  token: string | null
  busy: boolean
  onGenerate: () => Promise<void>
  onRevoke: () => Promise<void>
  loginLabel?: string
  onLoginAs?: () => Promise<void>
  showCopyUrl?: boolean
}) {
  const [show,        setShow]        = useState(false)
  const [loginBusy,   setLoginBusy]   = useState(false)
  const [urlCopied,   setUrlCopied]   = useState(false)

  function copyLoginUrl() {
    if (!token) return
    navigator.clipboard.writeText(`${window.location.origin}/join?t=${token}`)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }

  async function handleLoginAs() {
    if (!onLoginAs) return
    setLoginBusy(true)
    try { await onLoginAs() }
    finally { setLoginBusy(false) }
  }

  // Tokens are in the format DRAFT-XXXXXX — show prefix, hide/reveal the 6-char suffix
  const suffix = token ? token.replace(/^DRAFT-/, '') : null

  return (
    <div className="space-y-2">
      <div className="panel flex items-center gap-2 p-3">
        {/* Token value */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {token ? (
            <>
              <code className="text-xs font-mono text-zinc-500">DRAFT-</code>
              <code className="text-xs font-mono text-zinc-200 tracking-[0.2em]">
                {show ? suffix : '••••••'}
              </code>
              <button onClick={() => setShow(s => !s)} className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-1">
                {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {showCopyUrl && (
                <button onClick={copyLoginUrl} title="Copy login URL"
                  className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-0.5">
                  {urlCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-zinc-700 italic">No token</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button size="sm" onClick={onGenerate} loading={busy} icon={token ? <RefreshCw className="w-3 h-3" /> : <Key className="w-3 h-3" />}>
            {token ? 'Regenerate' : 'Generate'}
          </Button>
          {token && (
            <Button size="sm" variant="ghost" onClick={onRevoke} disabled={busy} icon={<ShieldOff className="w-3 h-3" />} className="hover:text-red-400">
              Revoke
            </Button>
          )}
        </div>
      </div>

      {/* Login as */}
      {token && onLoginAs && (
        <Button size="sm" variant="ghost" onClick={handleLoginAs} loading={loginBusy} icon={<LogIn className="w-3 h-3" />} className="border-zinc-800 hover:border-zinc-700">
          {loginLabel ?? 'Sign in as this role'}
        </Button>
      )}
    </div>
  )
}

// ─── Description editor ───────────────────────────────────────────────────────

function DescriptionEditor({ project, onSave }: {
  project: Tournament; onSave: (p: Tournament) => void
}) {
  const [desc,   setDesc]   = useState(project.description ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = desc !== (project.description ?? '')

  async function save() {
    setSaving(true)
    try { const updated = await tournamentsApi.update(project.slug, { description: desc }); onSave(updated) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
        placeholder="Short description shown on the public page…"
        className={inputCls + ' resize-none'} />
      {dirty && (
        <Button size="sm" variant="primary" onClick={save} loading={saving}>Save</Button>
      )}
    </div>
  )
}

// ─── Config tab ───────────────────────────────────────────────────────────────

export default function ConfigTab({ slug, role }: { slug: string; role: ViewRole }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { refresh } = useAuth()
  const { toast } = useToast()
  const { data: project } = useTournament(slug)
  const [auctBusy, setAuctBusy] = useState(false)
  const [hostBusy, setHostBusy] = useState(false)
  const [pptEdit,  setPptEdit]  = useState(false)
  const [pptVal,   setPptVal]   = useState(String(project?.players_per_team ?? 6))
  const canManage = role === 'admin' || role === 'host'

  // Mutations here return the updated row (or a known field), so write it
  // straight into the cache instead of refetching.
  const setProject = (p: Tournament) => qc.setQueryData(qk.tournament(slug), p)

  if (!project) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
    </div>
  )

  async function savePpt() {
    if (!project) return
    const n = Math.max(1, parseInt(pptVal) || 6)
    const updated = await tournamentsApi.update(project.slug, { players_per_team: n })
    setProject(updated)
    setPptEdit(false)
    toast('Players per team updated')
  }

  return (
    <div className="space-y-8">

      {/* Admin-only: host token — highlighted with amber tint */}
      {role === 'admin' && (
        <div className="panel border-amber-800 bg-amber-950/40 p-4">
          <div className="flex items-center gap-2 mb-1">
            <SectionLabel>Host token</SectionLabel>
            <span className="text-[9px] font-display font-semibold uppercase tracking-[0.2em] text-amber-600 mb-2">admin only</span>
          </div>
          <p className="text-xs text-zinc-600 mb-3">Share with the host to let them sign in</p>
          <TokenRow
            token={project.host_token ?? null}
            busy={hostBusy}
            onGenerate={async () => {
              setHostBusy(true)
              try { const r = await authApi.generateHostToken(project.slug); setProject({ ...project, host_token: r.token }) }
              finally { setHostBusy(false) }
            }}
            onRevoke={async () => {
              setHostBusy(true)
              try { await authApi.revokeHostToken(project.slug); setProject({ ...project, host_token: null }) }
              finally { setHostBusy(false) }
            }}
            loginLabel="Sign in as host →"
            onLoginAs={async () => {
              if (!project.host_token) return
              await authApi.loginHost(project.host_token)
              await refresh()
              navigate('/host')
            }}
          />
        </div>
      )}

      <div>
        <SectionLabel>Auctioneer token</SectionLabel>
        <p className="text-xs text-zinc-600 mb-3">Shared by all auctioneers for this tournament</p>
        {canManage
          ? <TokenRow
              token={project.auctioneer_token ?? null}
              busy={auctBusy}
              showCopyUrl
              onGenerate={async () => {
                setAuctBusy(true)
                try { const r = await authApi.generateAuctioneerToken(project.slug); setProject({ ...project, auctioneer_token: r.token }) }
                finally { setAuctBusy(false) }
              }}
              onRevoke={async () => {
                setAuctBusy(true)
                try { await authApi.revokeAuctioneerToken(project.slug); setProject({ ...project, auctioneer_token: null }) }
                finally { setAuctBusy(false) }
              }}
              loginLabel="Sign in as auctioneer →"
              onLoginAs={async () => {
                if (!project.auctioneer_token) return
                await authApi.loginAuctioneer(project.auctioneer_token)
                await refresh()
                navigate('/auctioneer')
              }}
            />
          : <p className="text-sm text-zinc-500">{project.auctioneer_token ? 'Token set' : 'No token — contact host or admin'}</p>
        }
      </div>

      {canManage && (
        <div>
          <SectionLabel>Players per team</SectionLabel>
          <p className="text-xs text-zinc-600 mb-3">Number of players each captain must draft (excludes captain themselves)</p>
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-zinc-600 flex-shrink-0" />
            {pptEdit ? (
              <div className="flex items-center gap-2">
                <input value={pptVal} onChange={e => setPptVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePpt(); if (e.key === 'Escape') setPptEdit(false) }}
                  type="number" min={1} autoFocus
                  className={cn(inputSmCls, 'w-20 font-mono')} />
                <Button size="sm" variant="primary" onClick={savePpt}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setPptEdit(false); setPptVal(String(project.players_per_team ?? 6)) }}>Cancel</Button>
              </div>
            ) : (
              <button onClick={() => { setPptVal(String(project.players_per_team ?? 6)); setPptEdit(true) }}
                className="text-sm font-mono text-zinc-300 hover:text-zinc-100 transition-colors">
                {project.players_per_team ?? 6} <span className="text-zinc-600">— click to edit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <div>
          <SectionLabel>Tournament description</SectionLabel>
          <DescriptionEditor key={project.description ?? ''} project={project} onSave={setProject} />
        </div>
      )}
    </div>
  )
}
