import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { Seal } from '@/components/ui'

/**
 * Top bar for the signed-in dashboards (host, auctioneer, captain):
 * logo on the left, context and a role seal on the right, sign out.
 * The public pages use PublicNav instead.
 */
export default function DashboardBar({ context, role, extra }: {
  context?: ReactNode
  role?:    string
  extra?:   ReactNode
}) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex-shrink-0 border-b border-zinc-700 px-[5%] py-2.5 flex items-center justify-between gap-3 shadow-[0_1px_0_#1a1712,0_2px_0_rgba(200,162,74,0.2)]"
      style={{ backgroundColor: 'var(--color-surface-head)' }}>
      <Link to="/" className="flex items-center flex-shrink-0">
        <img src={logo} alt="BDC" className="h-11 w-auto" />
      </Link>
      <div className="flex items-center gap-3.5 min-w-0">
        {context && <span className="font-display text-xs tracking-[0.06em] text-zinc-400 truncate">{context}</span>}
        {role && <Seal tone="neutral">{role}</Seal>}
        {extra}
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors whitespace-nowrap">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  )
}
