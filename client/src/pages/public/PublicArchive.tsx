import { Link } from 'react-router-dom'
import PublicNav from '@/components/PublicNav'
import { Loader2, FolderOpen, ChevronRight } from 'lucide-react'
import { useTitle } from '@/hooks/useTitle'
import { usePublicTournaments } from '@/queries'
import { Heading, Rule, Seal } from '@/components/ui'

export default function PublicArchive() {
  useTitle('Tournament Archive')
  const { data: tournaments = [], isPending } = usePublicTournaments()

  return (
    <div className="min-h-screen">
      <PublicNav />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6 space-y-3">
          <Heading size="xl">All tournaments</Heading>
          <Rule />
          <p className="text-sm text-zinc-500">Browse past and active tournaments.</p>
        </div>

        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="panel w-16 h-16 flex items-center justify-center mx-auto">
              <FolderOpen className="w-7 h-7 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-600">No tournaments yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tournaments.map(t => (
              <Link key={t.id} to={`/t/${t.slug}`}
                className="panel flex items-center gap-4 p-4 hover:border-amber-700 transition-colors group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="font-display text-sm font-bold tracking-[0.06em] text-zinc-50 truncate">{t.name}</p>
                    {t.status === 'archived' && <Seal tone="pending">Archived</Seal>}
                  </div>
                  {t.description && (
                    <p className="text-[13px] text-zinc-500 mt-0.5 truncate">{t.description}</p>
                  )}
                  <p className="text-[11px] font-mono text-zinc-600 mt-1">
                    {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
