import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { auctionsApi, type Auction } from '@/api/auctions'
import { type Tournament } from '@/api/tournaments'
import { bracketsApi } from '@/api/brackets'
import { sessionsApi } from '@/api/sessions'
import { authApi } from '@/api/auth'
import {
  Loader2, Trash2, Radio, AlertCircle,
  Shuffle, Check, Lock, BarChart2, Swords,
} from 'lucide-react'
import { Tooltip, type ClassKey, type ViewRole } from './shared'
import GroupStageView from './GroupStageView'
import { useToast } from '@/context/ToastContext'
import CaptainList from './division/CaptainList'
import { BracketSection, KnockoutScoreRow } from './division/KnockoutSection'
import AuctionResultsModal from './division/AuctionResultsModal'
import PickBanModal from './division/PickBanModal'
import { Button, Input, buttonCls } from '@/components/ui'
import {
  qk, useInvalidate, useCaptains, useBrackets, useBracket, useSessions, useAuction, usePickBanByMatch,
} from '@/queries'

const MAX_CAPTAINS = 8

// ─── Division tab ─────────────────────────────────────────────────────────────

export default function DivisionTab({ auction, slug, role, project }: {
  auction: Auction; slug: string; role: ViewRole; project: Tournament
}) {
  const { toast }    = useToast()
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const invalidate   = useInvalidate()
  const canManage = role === 'admin' || role === 'host'
  const isCaptain = role === 'captain'

  // ── Server state (cached; other tabs and screens share these entries) ──
  const captainsQ = useCaptains(auction.id)
  const bracketsQ = useBrackets(slug)
  const sessionsQ = useSessions(auction.id)
  // Captains can't read the auction detail endpoint — they use the list row's status.
  const auctionQ  = useAuction(auction.id, role !== 'captain')
  const bracket   = bracketsQ.data?.find(b => b.auction_id === auction.id) ?? null
  const bracketQ  = useBracket(bracket?.id)

  const captains      = captainsQ.data ?? []
  const matches       = bracketQ.data?.matches ?? []
  const auctionStatus = auctionQ.data?.status ?? auction.status
  const activeSession = sessionsQ.data?.find(s => s.status === 'live' || s.status === 'paused') ?? null
  const finalsMatch   = matches.find(m => m.is_finals === 1) ?? null

  const pickBanQ       = usePickBanByMatch(finalsMatch?.id)
  const pickBanSession = pickBanQ.data ?? null
  // True until the pick-ban lookup for this finals match has answered, so the
  // button does not flash between "Start" and "View".
  const pickBanLoading = !!finalsMatch && pickBanQ.isPending

  // ── Local UI state ──
  const [goingLive,     setGoingLive]     = useState(false)
  const [shuffling,     setShuffling]     = useState(false)
  const [resetting,     setResetting]     = useState(false)
  const [resetConfirm,  setResetConfirm]  = useState(false)
  const [error,         setError]         = useState('')
  const [shownTokens,   setShownTokens]   = useState<Set<number>>(new Set())
  const [showResults,   setShowResults]   = useState(false)
  const [readying,       setReadying]       = useState(false)
  const [teamRenameVal,   setTeamRenameVal]   = useState('')
  const [teamRenameBusy,  setTeamRenameBusy]  = useState(false)
  const [startingPickBan,   setStartingPickBan]   = useState(false)
  const [showPickBanModal,  setShowPickBanModal]  = useState(false)

  const refreshCaptains = () => invalidate(qk.captains(auction.id))
  const refreshAuction  = () => invalidate(qk.auction(auction.id), qk.auctions(slug))
  const refreshBracket  = () => invalidate(bracket ? qk.bracket(bracket.id) : qk.brackets(slug), qk.pickBanAll())

  const captainsWithToken = captains.filter(c => c.token)
  const allTokensShown = captainsWithToken.length > 0 && captainsWithToken.every(c => shownTokens.has(c.id))
  function toggleAllTokens() {
    if (allTokensShown) {
      setShownTokens(new Set())
    } else {
      setShownTokens(new Set(captainsWithToken.map(c => c.id)))
    }
  }
  function toggleOneToken(id: number) {
    setShownTokens(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function addCaptain(data: { display_name: string; team_name?: string; budget: number; class: ClassKey | null }) {
    if (captains.length >= MAX_CAPTAINS) return
    await auctionsApi.addCaptain(auction.id, {
      display_name: data.display_name,
      team_name: data.team_name,
      budget: data.budget,
      class: data.class,
    })
    await refreshCaptains()
    toast('Captain added', 'success')
  }

  async function updateCaptain(id: number, data: { display_name?: string; team_name?: string | null; budget?: number; class?: ClassKey | null }) {
    await auctionsApi.updateCaptain(id, data)
    await refreshCaptains()
  }

  async function removeCaptain(id: number) {
    await auctionsApi.deleteCaptain(id)
    await refreshCaptains()
    toast('Captain removed', 'info')
  }

  async function genToken(captainId: number) {
    await authApi.generateCaptainToken(captainId)
    await refreshCaptains()
    toast('Token generated', 'success')
  }

  async function revokeToken(captainId: number) {
    await authApi.revokeCaptainToken(captainId)
    await refreshCaptains()
    toast('Token revoked', 'info')
  }

  async function handleReady() {
    setReadying(true); setError('')
    try {
      await auctionsApi.markReady(auction.id)
      await refreshAuction()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to mark ready')
    } finally { setReadying(false) }
  }

  async function handleUnready() {
    setReadying(true); setError('')
    try {
      await auctionsApi.markUnready(auction.id)
      await refreshAuction()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setReadying(false) }
  }

  async function goLive() {
    setGoingLive(true); setError('')
    try {
      const existing = await sessionsApi.listForAuction(auction.id)
      const resumable = existing.find(s => s.status === 'pending' || s.status === 'paused')
      let sessionId: number
      if (resumable) {
        await sessionsApi.goLive(resumable.id)
        sessionId = resumable.id
      } else {
        const { session } = await sessionsApi.create(auction.id)
        await sessionsApi.goLive(session.id)
        sessionId = session.id
      }
      await invalidate(qk.sessions(auction.id))
      navigate(`/t/${slug}/auction/${sessionId}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setGoingLive(false) }
  }

  async function shuffleBracket() {
    if (!bracket) return
    if (captains.length < MAX_CAPTAINS) {
      toast(`Need ${MAX_CAPTAINS} captains to shuffle (have ${captains.length})`, 'error')
      return
    }
    if (matches.length > 0 && !window.confirm('A bracket already exists. Re-shuffle and overwrite it?')) return
    setShuffling(true)
    try {
      await bracketsApi.generate(bracket.id, captains.map(c => c.id))
      await refreshBracket()
      toast('Bracket shuffled', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to generate', 'error')
    } finally { setShuffling(false) }
  }

  function handleResetClick() {
    const hasPlayed = matches.some(m => m.status === 'played')
    if (hasPlayed) {
      setResetConfirm(true)
    } else {
      doReset()
    }
  }

  async function doReset() {
    if (!bracket) return
    setResetting(true)
    try {
      await bracketsApi.reset(bracket.id)
      await refreshBracket()
      setResetConfirm(false)
      toast('Bracket reset', 'info')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to reset', 'error')
    } finally { setResetting(false) }
  }

  async function startPickBan() {
    if (!finalsMatch) return
    const mapPool: number[] = (() => { try { return JSON.parse(project.finals_map_pool) } catch { return [] } })()
    setStartingPickBan(true)
    try {
      await bracketsApi.createPickBan(finalsMatch.id, mapPool)
      await invalidate(qk.pickBanByMatch(finalsMatch.id))
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Failed to start pick-ban', 'error')
    } finally { setStartingPickBan(false) }
  }

  async function handleResult(matchId: number, scoreA: number, scoreB: number) {
    await bracketsApi.overrideResult(matchId, scoreA, scoreB)
    await refreshBracket()
  }

  const loading = captainsQ.isPending || bracketsQ.isPending || sessionsQ.isPending || (!!bracket && bracketQ.isPending)
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
    </div>
  )

  const groupAMatches    = matches.filter(m => m.group_label === 'A')
  const groupBMatches    = matches.filter(m => m.group_label === 'B')
  const knockoutMatches  = matches.filter(m => m.round >= 4)
  const canShuffle = canManage
  const canReset   = canManage && matches.length > 0

  const joinSessionLink = activeSession && (
    <Link to={`/t/${slug}/auction/${activeSession.id}`} className={buttonCls('danger')}>
      <Radio className="w-3.5 h-3.5" /> Join Session
    </Link>
  )

  return (
    <>
    <div className="flex gap-6">

      {/* ── Left column: controls + captains ── */}
      <div className="flex-none w-[28rem] space-y-4">

        {/* Go Live card */}
        <div className="panel flex items-center justify-between p-4">
          <div className="min-w-0 mr-3">
            <p className="font-display text-sm font-bold tracking-[0.04em] text-zinc-100 truncate">{auction.name}</p>
            <p className="text-xs text-zinc-600 font-mono mt-0.5">
              {project.players_per_team} players/team · {captains.length}/{MAX_CAPTAINS} · {auctionStatus}
              {activeSession && <span className="ml-1 text-amber-500/70">· session {activeSession.status}</span>}
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            {auctionStatus === 'finished' ? (
              <>
                <Button variant="gilt-outline" onClick={() => setShowResults(true)} disabled={!canManage}
                  title={canManage ? undefined : 'Only hosts and admins can edit rosters'}
                  icon={<BarChart2 className="w-3.5 h-3.5" />}>
                  Team compositions
                </Button>
                <Link to={`/t/${slug}?div=${auction.id}&view=teams`}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                  Public view →
                </Link>
              </>
            ) : canManage ? (
              auctionStatus === 'ready' && activeSession?.status === 'live' ? (
                <Tooltip label="Session is running — halt it first">
                  <Button variant="success" disabled icon={<Check className="w-3.5 h-3.5" />}>Ready</Button>
                </Tooltip>
              ) : auctionStatus === 'ready' && activeSession?.status === 'paused' ? (
                <Tooltip label="Session is paused — auctioneer can resume">
                  <Button variant="success" disabled icon={<Check className="w-3.5 h-3.5" />}>Ready</Button>
                </Tooltip>
              ) : auctionStatus === 'ready' ? (
                <Button variant="success" onClick={handleUnready} loading={readying} icon={<Check className="w-3.5 h-3.5" />}>Ready</Button>
              ) : captains.length < MAX_CAPTAINS ? (
                <Tooltip label={`Need all ${MAX_CAPTAINS} captains (${captains.length}/${MAX_CAPTAINS})`}>
                  <Button disabled icon={<Check className="w-3.5 h-3.5" />}>Mark Ready</Button>
                </Tooltip>
              ) : (
                <Button onClick={handleReady} loading={readying} icon={<Check className="w-3.5 h-3.5" />}>Mark Ready</Button>
              )
            ) : isCaptain ? (
              activeSession
                ? joinSessionLink
                : <span className="text-xs text-zinc-600 font-mono">Waiting for session…</span>
            ) : (
              auctionStatus === 'ready' ? (
                activeSession
                  ? joinSessionLink
                  : <Button variant="danger" onClick={goLive} loading={goingLive} icon={<Radio className="w-3.5 h-3.5" />}>Go live</Button>
              ) : (
                <Tooltip label="Host must mark the auction as ready first">
                  <Button disabled icon={<Radio className="w-3.5 h-3.5" />}>Go live</Button>
                </Tooltip>
              )
            )}
            {canManage && activeSession && (activeSession.status === 'live' || activeSession.status === 'paused') && (
              <Link to={`/t/${slug}/auction/${activeSession.id}`}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2">
                View session →
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-600/10 border border-red-700 rounded-sm px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* Captain slots */}
        <CaptainList
          captains={captains}
          canManage={canManage}
          shownTokens={shownTokens}
          allTokensShown={allTokensShown}
          onToggleAllTokens={toggleAllTokens}
          onToggleOneToken={toggleOneToken}
          onAdd={addCaptain}
          onUpdate={updateCaptain}
          onRemove={removeCaptain}
          onGenToken={genToken}
          onRevokeToken={revokeToken}
        />

        {/* ── Captain: rename own team ── */}
        {isCaptain && auction.id === user?.auctionId && (() => {
          const myCaptain = captains.find(c => c.id === user?.captainId)
          if (!myCaptain) return null
          const currentName = myCaptain.team_name ?? `${myCaptain.display_name}'s team`
          async function saveRename() {
            if (!teamRenameVal.trim() || teamRenameBusy) return
            setTeamRenameBusy(true)
            try {
              await auctionsApi.renameOwnTeam(myCaptain!.id, teamRenameVal.trim())
              await refreshCaptains()
              setTeamRenameVal('')
              toast('Team renamed', 'success')
            } catch (e: unknown) {
              toast(e instanceof Error ? e.message : 'Failed', 'error')
            } finally { setTeamRenameBusy(false) }
          }
          return (
            <div className="panel p-4 space-y-2.5">
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-zinc-500">Rename your team</p>
              <p className="text-xs text-zinc-500">Current: <span className="text-zinc-300 font-medium">{currentName}</span></p>
              <div className="flex gap-2">
                <Input
                  value={teamRenameVal}
                  onChange={e => setTeamRenameVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveRename()}
                  placeholder="New team name…"
                  className="flex-1"
                />
                <Button variant="gilt-outline" onClick={saveRename} loading={teamRenameBusy}
                  disabled={!teamRenameVal.trim()} icon={<Check className="w-3.5 h-3.5" />}>
                  Save
                </Button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Right column: bracket ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        <BracketSection title="Group A">
          <GroupStageView
            matches={groupAMatches}
            group="A"
            captains={captains}
            canManage={canManage}
            onResultUpdate={handleResult}
          />
        </BracketSection>

        <BracketSection title="Group B">
          <GroupStageView
            matches={groupBMatches}
            group="B"
            captains={captains}
            canManage={canManage}
            onResultUpdate={handleResult}
          />
        </BracketSection>

        <BracketSection title="Finals">
          {bracket ? (
            <div className="grid grid-cols-2 gap-4 px-4 py-4">
              {/* Semi-finals — left half */}
              <div className="space-y-1.5 self-center">
                {knockoutMatches.length > 0 ? (
                  knockoutMatches
                    .filter(m => m.is_finals !== 1)
                    .sort((a, b) => a.match_order - b.match_order)
                    .map(m => (
                      <KnockoutScoreRow key={m.id} match={m} captains={captains} canManage={canManage} onSave={handleResult} />
                    ))
                ) : (
                  <p className="text-xs text-zinc-700 italic">Scores will appear once bracket is generated.</p>
                )}
              </div>
              {/* Final + pick-ban — right half */}
              <div className="border-l border-zinc-800/60 pl-4 space-y-1.5 self-center">
                {finalsMatch && (
                  <KnockoutScoreRow match={finalsMatch} captains={captains} canManage={canManage} onSave={handleResult} />
                )}
                {/* Pick-ban trigger / join */}
                {finalsMatch && !pickBanLoading && (() => {
                  const bothFinalists = !!(finalsMatch.captain_a_id && finalsMatch.captain_b_id)
                  if (canManage) {
                    if (pickBanSession) return (
                      <Button variant="gilt-outline" size="sm" onClick={() => setShowPickBanModal(true)}
                        icon={<Swords className="w-3 h-3" />} className="mt-1 w-full">
                        View Pick-Ban
                      </Button>
                    )
                    return (
                      <Button variant="success" size="sm" onClick={startPickBan} loading={startingPickBan} disabled={!bothFinalists}
                        icon={<Swords className="w-3 h-3" />} className="mt-1 w-full">
                        {!bothFinalists ? 'Awaiting finalists' : 'Start Pick-Ban'}
                      </Button>
                    )
                  }
                  const myCapId = user?.captainId
                  const imFinalist = isCaptain && myCapId &&
                    (finalsMatch.captain_a_id === myCapId || finalsMatch.captain_b_id === myCapId)
                  if (imFinalist && pickBanSession && pickBanSession.status !== 'complete') return (
                    <Link to={`/pickban/${pickBanSession.id}`} className={buttonCls('gilt-outline', 'sm', 'mt-1 w-full')}>
                      <Swords className="w-3 h-3" /> Join Pick-Ban
                    </Link>
                  )
                  return null
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-zinc-700 italic">No bracket linked to this division</p>
            </div>
          )}
        </BracketSection>

        {/* ── Bottom action bar: shuffle / reset ── */}
        {bracket && canManage && (
          <div className="flex items-center justify-end gap-2">
            {canReset && (
              resetConfirm ? (
                <>
                  <span className="text-xs text-zinc-500">Reset all bracket data?</span>
                  <Button variant="danger" size="sm" onClick={doReset} loading={resetting} icon={<Check className="w-3 h-3" />}>
                    Confirm reset
                  </Button>
                  <Button size="sm" onClick={() => setResetConfirm(false)}>Cancel</Button>
                </>
              ) : (
                <Button variant="danger" size="sm" onClick={handleResetClick} icon={<Trash2 className="w-3.5 h-3.5" />}>
                  Reset bracket
                </Button>
              )
            )}

            {canShuffle ? (
              <Button size="sm" onClick={shuffleBracket} loading={shuffling} icon={<Shuffle className="w-3.5 h-3.5" />}>
                Shuffle bracket
              </Button>
            ) : (
              <Tooltip label="Reset the bracket to reshuffle">
                <Button size="sm" disabled icon={<Lock className="w-3.5 h-3.5" />}>Locked</Button>
              </Tooltip>
            )}
          </div>
        )}

      </div>
    </div>

    {showPickBanModal && pickBanSession && (
      <PickBanModal
        sessionId={pickBanSession.id}
        onDeleted={() => { invalidate(qk.pickBanAll()); setShowPickBanModal(false) }}
        onClose={() => setShowPickBanModal(false)}
      />
    )}

    {showResults && (
      <AuctionResultsModal
        auctionId={auction.id}
        auctionName={auction.name}
        canManage={canManage}
        playersPerTeam={project.players_per_team}
        onClose={() => setShowResults(false)}
        onAuctionChange={() => {
          // Reopen / wipe change status, sessions and rosters: refetch the auction subtree.
          invalidate(qk.auction(auction.id), qk.auctions(slug))
          setShowResults(false)
        }}
      />
    )}
    </>
  )
}
