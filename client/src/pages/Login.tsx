import { useState } from 'react'
import { useTitle } from '@/hooks/useTitle'
import { Link } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { Button, Field, Rule } from '@/components/ui'

type LoginTab = 'host' | 'auctioneer' | 'captain'
const TABS: { id: LoginTab; label: string }[] = [
  { id: 'host',       label: 'Host'       },
  { id: 'auctioneer', label: 'Auctioneer' },
  { id: 'captain',    label: 'Captain'    },
]

function TokenForm({ label, onSubmit, submitLabel }: {
  label: string; onSubmit: (code: string) => Promise<void>; submitLabel: string
}) {
  const [suffix, setSuffix] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]    = useState('')
  const clean = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6)

  async function submit() {
    if (clean.length < 6) return
    setLoading(true); setError('')
    try { await onSubmit(`DRAFT-${clean}`) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Invalid code') }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit() }} autoComplete="off" className="space-y-3.5">
      <Field label={label}>
        <div className="flex items-center h-11 rounded-sm bg-zinc-950 border border-zinc-700 focus-within:border-amber-600 transition-colors">
          <span className="pl-3.5 pr-1 font-mono text-[15px] tracking-[0.1em] text-zinc-600 select-none flex-shrink-0">DRAFT-</span>
          <input value={clean} onChange={e => setSuffix(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="XXXXXX" maxLength={6} spellCheck={false} autoComplete="off"
            className="flex-1 min-w-0 h-full bg-transparent font-mono text-[15px] tracking-[0.25em] text-zinc-50 placeholder:text-zinc-700 focus:outline-none" />
          <span className={cn('pr-3 font-mono text-[11px] transition-colors', clean.length === 6 ? 'text-amber-400' : 'text-zinc-700')}>
            {clean.length}/6
          </span>
        </div>
      </Field>
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-600/10 border border-red-700 rounded-sm px-3.5 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      <Button type="submit" variant="primary" loading={loading} disabled={clean.length < 6} className="w-full h-11 text-xs tracking-[0.12em]">
        {submitLabel}
      </Button>
    </form>
  )
}

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  useTitle('Sign In')
  const [tab, setTab] = useState<LoginTab>('host')

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Link to="/" className="inline-block">
            <img src={logo} alt="BDC" className="h-14 w-auto" />
          </Link>
          <Rule className="w-full">Tournament platform</Rule>
        </div>

        <div className="panel border-zinc-700 shadow-[inset_0_0_0_1px_#0c0b09,inset_0_0_0_2px_#262219,0_20px_40px_rgba(0,0,0,0.5)] p-1.5">
          <div className="flex border-b border-zinc-800 mb-5">
            {TABS.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 py-2.5 -mb-px font-display text-[11px] font-bold uppercase tracking-[0.12em] border-b-2 transition-colors',
                  tab === t.id ? 'text-amber-400 border-amber-500' : 'text-zinc-500 border-transparent hover:text-zinc-300',
                )}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-5 pb-5">
            {tab === 'host'       && <TokenForm label="Host code"       submitLabel="Sign in"         onSubmit={c => authApi.loginHost(c).then(onSuccess)} />}
            {tab === 'auctioneer' && <TokenForm label="Auctioneer code" submitLabel="Enter session"   onSubmit={c => authApi.loginAuctioneer(c).then(onSuccess)} />}
            {tab === 'captain'    && <TokenForm label="Captain code"    submitLabel="Join tournament" onSubmit={c => authApi.loginCaptain(c).then(onSuccess)} />}
            <p className="mt-4 text-center text-[13px] italic text-zinc-600">Codes are issued by the tournament host.</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[13px]">
          <Link to="/" className="text-zinc-500 hover:text-zinc-300 transition-colors">← Home</Link>
          <a href="/admin-login" className="text-zinc-500 hover:text-zinc-300 transition-colors">Admin →</a>
        </div>
      </div>
    </div>
  )
}
