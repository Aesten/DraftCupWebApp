import { useAuth } from '@/context/AuthContext'
import TournamentDetail from '@/components/tournament/TournamentDetail'
import { useTitle } from '@/hooks/useTitle'
import DashboardBar from '@/components/DashboardBar'

export default function AuctioneerShell() {
  useTitle('Auctioneer Dashboard')
  const { user } = useAuth()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <DashboardBar context={user?.projectSlug} role="auctioneer" />
      <div className="flex-1 overflow-hidden">
        {user?.projectSlug
          ? <TournamentDetail slug={user.projectSlug} roleOverride="auctioneer" />
          : (
            <div className="flex items-center justify-center h-full text-zinc-600">
              <p className="text-sm italic">No tournament assigned to this token.</p>
            </div>
          )
        }
      </div>
    </div>
  )
}
