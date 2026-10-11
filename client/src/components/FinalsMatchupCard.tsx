import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn, imgSrc } from '@/lib/utils'

import Aserai   from '@/assets/factions/Aserai.webp'
import Battania from '@/assets/factions/Battania.webp'
import Empire   from '@/assets/factions/Empire.webp'
import Khuzait  from '@/assets/factions/Khuzait.webp'
import Sturgia  from '@/assets/factions/Sturgia.webp'
import Vlandia  from '@/assets/factions/Vlandia.webp'

const FACTION_ICONS: Record<string, string> = { Aserai, Battania, Empire, Khuzait, Sturgia, Vlandia }

function FactionIcon({ name }: { name: string | null | undefined }) {
  const src = name ? FACTION_ICONS[name] : undefined
  if (!src) return (
    <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
      <span className="text-xs text-zinc-500">?</span>
    </div>
  )
  return <img src={src} alt={name ?? ''} className="w-10 h-10 rounded-full object-cover border border-amber-700 shadow-[0_0_0_2px_#0c0b09] flex-shrink-0" />
}

/** The finals result: map image, crests and the server command. Bordered in gilt because it is the one that matters. */
export default function FinalsMatchupCard({ mapImage, mapName, mapGameId, factionAName, factionBName }: {
  mapImage:    string | null | undefined
  mapName:     string | null | undefined
  mapGameId:   string | null | undefined
  factionAName: string | null | undefined
  factionBName: string | null | undefined
}) {
  const [copied, setCopied] = useState(false)
  const ready = !!(mapName && factionAName && factionBName)
  const mapCmd = mapGameId ?? mapName?.toLowerCase().replace(/[^a-z0-9]/g, '')
  const command = ready
    ? `!setmap ${mapCmd} ${factionAName!.toLowerCase()} ${factionBName!.toLowerCase()}`
    : '!setmap <map> <fac1> <fac2>'

  function handleCopy() {
    if (!ready) return
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('panel overflow-hidden', ready && 'border-amber-700')}>
      <div className="relative overflow-hidden" style={{ aspectRatio: '1920/855' }}>
        {mapImage
          ? <img src={imgSrc(mapImage)} className="absolute inset-0 w-full h-full object-cover" alt="" />
          : <div className="absolute inset-0 bg-zinc-800" />
        }
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/10 to-zinc-950/70" />

        <div className="absolute top-1.5 left-2.5">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-400">Finals matchup</span>
        </div>

        {mapName && (
          <div className="absolute top-1.5 right-2.5">
            <span className="font-display text-[10px] font-bold text-amber-400">{mapName}</span>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <FactionIcon name={factionAName} />
          <span className="font-display text-sm font-bold text-zinc-100 tracking-[0.2em]">VS</span>
          <FactionIcon name={factionBName} />
        </div>

        <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950/75">
          <p className={cn('text-[10px] font-mono truncate flex-1 select-all', ready ? 'text-zinc-300' : 'text-zinc-600')}>
            {command}
          </p>
          {ready && (
            <button onClick={handleCopy} title="Copy"
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
