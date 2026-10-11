import { useAuth } from '@/context/AuthContext'
import type { Role } from '@shared/types'

/**
 * One place that turns "who is logged in" into "what may they do".
 * Components read these booleans instead of comparing roles themselves.
 * Server routes enforce the same rules; this only decides what to show.
 */
export function usePermissions() {
  const { user, loading } = useAuth()
  const role: Role | null = user?.role ?? null

  const isAdmin      = role === 'admin'
  const isHost       = role === 'host'
  const isAuctioneer = role === 'auctioneer'
  const isCaptain    = role === 'captain'

  return {
    loading,
    role,
    user,
    isAdmin,
    isHost,
    isAuctioneer,
    isCaptain,
    /** Edit tournament setup: players, captains, brackets, config. */
    canManage:      isAdmin || isHost,
    /** Run the live auction: start, sell, skip, refund, half-budget. */
    canRunAuction:  isAdmin || isAuctioneer,
    /** Pause a live session. */
    canPause:       isAdmin || isHost || isAuctioneer,
    /** Delete a bid from the ledger. */
    canRevokeBids:  isAdmin || isHost || isAuctioneer,
    canChat:        role !== null,
    captainId:      isCaptain ? user?.captainId ?? null : null,
    auctionId:      isCaptain ? user?.auctionId ?? null : null,
  }
}
