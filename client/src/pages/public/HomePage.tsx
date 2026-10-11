import { Link } from 'react-router-dom'
import PublicNav from '@/components/PublicNav'
import { Loader2, ChevronRight } from 'lucide-react'
import { useTitle } from '@/hooks/useTitle'
import { usePublicTournaments } from '@/queries'
import { Heading, Rule } from '@/components/ui'

export default function HomePage() {
  useTitle('BDC')
  const { data: tournaments = [], isPending } = usePublicTournaments()

  return (
    <div className="min-h-screen">
      <PublicNav />

      <main className="px-[5%] py-14 max-w-3xl">
        {isPending ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <Heading size="lg" className="text-zinc-600">Coming soon</Heading>
            <p className="text-sm text-zinc-600">No tournaments available yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <Heading>Tournaments</Heading>
            <Rule />
            <div className="space-y-2">
              {tournaments.map(t => (
                <Link key={t.id} to={`/t/${t.slug}`}
                  className="panel flex items-center justify-between gap-4 px-4 py-3.5 hover:border-amber-700 transition-colors group">
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold tracking-[0.06em] text-zinc-50 truncate">{t.name}</p>
                    {t.description && (
                      <p className="text-[13px] text-zinc-500 mt-0.5">{t.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
