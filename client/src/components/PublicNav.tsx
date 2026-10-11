import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/api/auth'
import { Loader2, LogOut } from 'lucide-react'
import logo from '@/assets/logos/bdc_logo_nobg.png'
import { useFeatured } from '@/queries'
import { buttonCls } from '@/components/ui'

const DASHBOARD: Record<Role, string> = {
  admin:      '/admin',
  host:       '/host',
  auctioneer: '/auctioneer',
  captain:    '/captain',
}

const DASHBOARD_LABEL: Record<Role, string> = {
  admin:      'Dashboard',
  host:       'Dashboard',
  auctioneer: 'Dashboard',
  captain:    'Captain controls',
}

interface Props {
  extra?: ReactNode
  center?: ReactNode
}

function buildLogoHref(slug: string | undefined, user: ReturnType<typeof useAuth>['user']): string {
  if (!slug) return '/'
  if (user?.role === 'captain' && user.auctionId) {
    return `/t/${slug}?div=${user.auctionId}&tab=bracket`
  }
  return `/t/${slug}`
}

/** Top bar: iron band with a gilt hairline under it. */
export default function PublicNav({ extra, center }: Props) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const featured = useFeatured()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  const logoHref = buildLogoHref(featured.data?.slug, user)

  return (
    <header className="relative flex-shrink-0 sticky top-0 z-30 border-b border-zinc-700 shadow-[0_1px_0_#1a1712,0_2px_0_rgba(200,162,74,0.2)]"
      style={{ backgroundColor: 'var(--color-surface-head)' }}>
      <div className="w-full px-[5%] py-2.5 flex items-center justify-between gap-3">
        <Link to={logoHref} className="flex items-center flex-shrink-0">
          <img src={logo} alt="BDC" className="h-11 w-auto" />
        </Link>

        {center && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">{center}</div>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          {extra}

          {loading ? (
            <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
          ) : user ? (
            <>
              <Link to={DASHBOARD[user.role]} className={buttonCls('primary')}>
                {DASHBOARD_LABEL[user.role]}
              </Link>
              <button onClick={handleLogout} title="Sign out"
                className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-300 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <Link to="/login" className={buttonCls('secondary')}>Sign in</Link>
          )}
        </div>
      </div>
    </header>
  )
}
