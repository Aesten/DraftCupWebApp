import { useState } from 'react'
import { useTitle } from '@/hooks/useTitle'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { AlertCircle } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { Button, Rule, inputCls } from '@/components/ui'
import { cn } from '@/lib/utils'

export default function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  useTitle('Admin Sign In')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function submit() {
    if (!password) return
    setLoading(true); setError('')
    try {
      await authApi.loginAdmin(password)
      onSuccess()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xs flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="BDC" className="h-12 w-auto" />
          <Rule className="w-full">Admin console</Rule>
        </div>

        {/* Isolated form with a unique id keeps admin credentials separate from host credentials */}
        <form
          id="admin-console-login"
          onSubmit={e => { e.preventDefault(); submit() }}
          autoComplete="on"
          className="panel border-zinc-700 p-5 space-y-3"
        >
          <input
            name="admin-console-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className={cn(inputCls, 'font-mono py-2.5')}
          />
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-600/10 border border-red-700 rounded-sm px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
          <Button type="submit" loading={loading} disabled={!password} className="w-full py-2.5">Enter console</Button>
        </form>

        <p className="text-center">
          <a href="/login" className="text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors">← Back to sign in</a>
        </p>
      </div>
    </div>
  )
}
