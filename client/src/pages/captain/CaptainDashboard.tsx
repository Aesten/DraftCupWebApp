import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTitle } from '@/hooks/useTitle'
import { auctionsApi } from '@/api/auctions'
import { Loader2, Check, Radio, Swords } from 'lucide-react'
import DashboardBar from '@/components/DashboardBar'
import { Panel, Button, Input, buttonCls, Label } from '@/components/ui'
import { useSessions, useMyPickBan } from '@/queries'

export default function CaptainDashboard() {
  useTitle('Captain Dashboard')
  const { user, refresh } = useAuth()

  const [renameValue,  setRenameValue]  = useState(user?.teamName ?? '')
  const [renameSaving, setRenameSaving] = useState(false)
  const [renameDone,   setRenameDone]   = useState(false)

  const sessionsQ = useSessions(user?.auctionId)
  const pickBanQ  = useMyPickBan()
  const liveSession = sessionsQ.data?.find(s => s.status === 'live' || s.status === 'paused') ?? null
  const pickBan     = pickBanQ.data
  const loading     = sessionsQ.isPending || pickBanQ.isPending
  const teamName    = user?.teamName ?? ''

  async function handleRename() {
    if (!user?.captainId || !renameValue.trim() || renameSaving) return
    setRenameSaving(true)
    try {
      await auctionsApi.renameOwnTeam(user.captainId, renameValue.trim())
      await refresh()   // the team name lives on the session payload
      setRenameDone(true)
      setTimeout(() => setRenameDone(false), 2000)
    } catch { /* ignore */ }
    finally { setRenameSaving(false) }
  }

  const pickBanActive = pickBan && pickBan.session.status !== 'complete'

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardBar context={user?.displayName} role="captain" />

      <div className="flex-1 flex items-start justify-center px-[5%] py-12">
        {loading ? (
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin mt-8" />
        ) : (
          <div className="w-full max-w-sm space-y-4">
            {user?.auctionName && <Label>{user.auctionName}</Label>}

            <Panel title="Your team" bodyClassName="p-4 gap-3">
              <p className="font-display text-base font-bold tracking-[0.04em] text-zinc-50">
                {teamName || `${user?.displayName}'s team`}
              </p>
              <div className="flex gap-2">
                <Input
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                  placeholder="New team name…"
                  className="flex-1 min-w-0"
                />
                <Button onClick={handleRename} loading={renameSaving}
                  disabled={!renameValue.trim() || renameValue.trim() === teamName}
                  icon={renameDone ? <Check className="w-3.5 h-3.5 text-green-400" /> : undefined}>
                  {renameDone ? 'Saved' : 'Save'}
                </Button>
              </div>
            </Panel>

            <Panel title="Auction" bodyClassName="p-4">
              {liveSession ? (
                <Link to={`/t/${user?.tournamentSlug}/auction/${liveSession.id}`} className={buttonCls('primary', 'md', 'w-full py-2.5')}>
                  <Radio className="w-3.5 h-3.5" /> Join live auction
                </Link>
              ) : (
                <p className="text-sm text-zinc-600 italic">No live auction at the moment.</p>
              )}
            </Panel>

            <Panel title="Finals" bodyClassName="p-4">
              {pickBanActive ? (
                <Link to={`/pickban/${pickBan!.session.id}`} className={buttonCls('gilt-outline', 'md', 'w-full py-2.5')}>
                  <Swords className="w-3.5 h-3.5" /> Join finals pick-ban
                </Link>
              ) : (
                <p className="text-sm text-zinc-600 italic">
                  {pickBan ? 'Pick-ban session complete.' : 'Not a finalist yet.'}
                </p>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
