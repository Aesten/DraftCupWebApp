import { useEffect } from 'react'
import { useNavigate, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTitle } from '@/hooks/useTitle'
import DashboardBar from '@/components/DashboardBar'

export default function HostLayout() {
  useTitle('Host Dashboard')
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && user.role === 'host' && !user.tournamentSlug) {
      logout().then(() => navigate('/login', { replace: true }))
    }
  }, [user, logout, navigate])

  if (!user) return null

  // Admin accessing /host: render outlet without host-specific chrome
  if (user.role === 'admin') return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-auto"><Outlet /></div>
    </div>
  )

  if (!user.tournamentSlug) return null

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <DashboardBar context={user.tournamentName ?? user.tournamentSlug} role="host" />
      <div className="flex-1 overflow-hidden">
        <Navigate to={`/host/tournaments/${user.tournamentSlug}`} replace />
        <Outlet />
      </div>
    </div>
  )
}
