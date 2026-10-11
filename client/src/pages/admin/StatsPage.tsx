import { useState, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { tournamentsApi, type StatsConfig } from '@/api/tournaments'
import { Loader2, Upload, Trash2, Settings2 } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import StatsConfigModal from '@/components/tournament/StatsConfigModal'
import { Button, Heading, Label, Seal } from '@/components/ui'
import { qk, useInvalidate, useTournaments, publicTournamentQuery, publicStatsQuery, statsUploadedQuery } from '@/queries'
import { useQuery } from '@tanstack/react-query'

interface Division { auctionId: number; name: string; tournamentName: string; slug: string }

const EMPTY_CONFIG: StatsConfig = { hiddenColumns: [], conditions: {}, gradients: {} }

export default function StatsPage() {
  const { toast }  = useToast()
  const invalidate = useInvalidate()
  const [uploading,  setUploading]  = useState<number | null>(null)
  const [deleting,   setDeleting]   = useState<number | null>(null)
  const [configFor,  setConfigFor]  = useState<Division | null>(null)
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  // ── Data: tournaments → their public overviews (divisions + rosters) → stats per uploaded division ──
  const tournamentsQ = useTournaments()
  const uploadedQ    = useQuery(statsUploadedQuery())
  const tournaments  = tournamentsQ.data ?? []
  const uploaded     = new Set(uploadedQ.data ?? [])

  const overviewQs = useQueries({ queries: tournaments.map(t => publicTournamentQuery(t.slug)) })

  const divisions: Division[] = []
  const playersByAuction: Record<number, Array<{ name: string; cost: number }>> = {}
  overviewQs.forEach((q, i) => {
    const t = tournaments[i]
    for (const d of q.data?.divisions ?? []) {
      divisions.push({ auctionId: d.auction.id, name: d.auction.name, tournamentName: t.name, slug: t.slug })
      playersByAuction[d.auction.id] = d.teams.flatMap(team => team.players.map(p => ({ name: p.player_name, cost: p.price })))
    }
  })

  const withStats = divisions.filter(d => uploaded.has(d.auctionId))
  const statsQs   = useQueries({ queries: withStats.map(d => publicStatsQuery(d.slug, d.auctionId)) })

  const configs:   Record<number, StatsConfig> = {}
  const statNames: Record<number, string[]>    = {}
  statsQs.forEach((q, i) => {
    const id = withStats[i].auctionId
    configs[id]   = q.data?.config ?? EMPTY_CONFIG
    statNames[id] = q.data?.rows.map(r => r.name) ?? []
  })

  const loading = tournamentsQ.isPending || uploadedQ.isPending || overviewQs.some(q => q.isPending)

  const refreshStats = (d: Division) => invalidate(qk.statsUploaded(), qk.publicStats(d.slug, d.auctionId))

  async function handleUpload(d: Division, file: File) {
    if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) { toast('File must be .csv or .json', 'error'); return }
    setUploading(d.auctionId)
    try {
      await tournamentsApi.uploadStats(d.auctionId, file)
      await refreshStats(d)
      toast('Stats uploaded', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error')
    } finally {
      setUploading(null)
    }
  }

  async function handleSaveConfig(cfg: StatsConfig) {
    if (!configFor) return
    try {
      await tournamentsApi.saveConfig(configFor.auctionId, cfg)
      await refreshStats(configFor)
      toast('Config saved', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    }
    setConfigFor(null)
  }

  async function handleDelete(d: Division) {
    setDeleting(d.auctionId)
    try {
      await tournamentsApi.deleteStats(d.auctionId)
      await refreshStats(d)
      toast('Stats removed', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
    </div>
  )

  // Group by tournament
  const byTournament = divisions.reduce<Record<string, Division[]>>((acc, d) => {
    ;(acc[d.tournamentName] ??= []).push(d)
    return acc
  }, {})

  return (
    <div className="p-8 max-w-2xl">
      <Heading className="mb-1">Division stats</Heading>
      <p className="text-[13px] text-zinc-500 mb-6">Upload a <span className="font-mono">.csv</span> or <span className="font-mono">.json</span> file per division. CSV is auto-converted to JSON and served on the public stats tab.</p>

      {Object.entries(byTournament).map(([tName, divs]) => (
        <div key={tName} className="mb-6">
          <div className="mb-2"><Label>{tName}</Label></div>
          <div className="flex flex-col gap-2">
            {divs.map(d => {
              const hasFile  = uploaded.has(d.auctionId)
              const busy     = uploading === d.auctionId || deleting === d.auctionId
              return (
                <div key={d.auctionId} className="panel flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-display text-xs font-bold tracking-[0.04em] text-zinc-100">{d.name}</span>
                  </div>

                  {hasFile && <Seal tone="success">Uploaded</Seal>}

                  {/* Upload / Replace */}
                  <input
                    ref={el => { fileRefs.current[d.auctionId] = el }}
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(d, f)
                      e.target.value = ''
                    }}
                  />
                  <Button size="sm" disabled={busy} loading={uploading === d.auctionId}
                    onClick={() => fileRefs.current[d.auctionId]?.click()} icon={<Upload className="w-3 h-3" />}>
                    {hasFile ? 'Replace' : 'Upload'}
                  </Button>

                  {/* Configure */}
                  {hasFile && (
                    <Button size="sm" disabled={busy} onClick={() => setConfigFor(d)} title="Configure columns & colors"
                      icon={<Settings2 className="w-3 h-3" />} aria-label="Configure" className="px-2" />
                  )}

                  {/* Delete */}
                  {hasFile && (
                    <Button size="sm" disabled={busy} loading={deleting === d.auctionId} onClick={() => handleDelete(d)}
                      icon={<Trash2 className="w-3 h-3" />} aria-label="Delete stats" className="px-2 hover:text-red-400 hover:border-red-700" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {divisions.length === 0 && (
        <p className="text-sm text-zinc-600 italic">No divisions found.</p>
      )}

      {configFor && (
        <StatsConfigModal
          initial={configs[configFor.auctionId] ?? EMPTY_CONFIG}
          divisionName={configFor.name}
          statNames={statNames[configFor.auctionId] ?? []}
          auctionPlayers={playersByAuction[configFor.auctionId] ?? []}
          otherConfigs={Object.entries(configs)
            .filter(([id]) => Number(id) !== configFor.auctionId)
            .map(([id, cfg]) => ({
              name: divisions.find(d => d.auctionId === Number(id))?.name ?? `Division ${id}`,
              config: cfg,
            }))}
          onSave={handleSaveConfig}
          onClose={() => setConfigFor(null)}
        />
      )}
    </div>
  )
}
