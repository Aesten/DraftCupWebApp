import { useRef, useState } from 'react'
import { playersApi, type Player } from '@/api/players'
import { cn } from '@/lib/utils'
import { FileUp } from 'lucide-react'
import { CLASSES, type ClassKey, ClassBadge } from './shared'
import { useToast } from '@/context/ToastContext'
import { Button, Modal, inputCls } from '@/components/ui'

export default function ImportModal({ slug, onImported, onClose }: {
  slug: string; onImported: (players: Player[]) => void; onClose: () => void
}) {
  const { toast } = useToast()
  const [mode,    setMode]    = useState<'json' | 'csv'>('json')
  const [text,    setText]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Array<{ name: string; classes: ClassKey[] }>>([])
  const fileRef = useRef<HTMLInputElement>(null)

  function parse(raw: string, fmt: 'json' | 'csv') {
    setError(''); setPreview([])
    if (!raw.trim()) return
    try {
      if (fmt === 'json') {
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) throw new Error('Expected a JSON array')
        const parsed = arr.map((item: { name?: string; classes?: string[] }, i: number) => {
          if (!item.name) throw new Error(`Item ${i}: missing "name"`)
          const classes = (item.classes ?? []).map((c: string) => c.toLowerCase()).filter((c): c is ClassKey => CLASSES.includes(c as ClassKey))
          return { name: String(item.name), classes }
        })
        setPreview(parsed)
      } else {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
        const parsed = lines.map((line, i) => {
          const [name, inf, arc, cav] = line.split(',').map(s => s.trim())
          if (!name) throw new Error(`Line ${i + 1}: missing name`)
          const classes: ClassKey[] = []
          if (inf?.toLowerCase() === 'x') classes.push('inf')
          if (arc?.toLowerCase() === 'x') classes.push('arc')
          if (cav?.toLowerCase() === 'x') classes.push('cav')
          return { name, classes }
        })
        setPreview(parsed)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse error')
    }
  }

  function handleTextChange(val: string) { setText(val); parse(val, mode) }
  function handleModeChange(m: 'json' | 'csv') { setMode(m); parse(text, m) }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const content = e.target?.result as string
      const fmt = file.name.endsWith('.csv') ? 'csv' : 'json'
      setMode(fmt)
      setText(content)
      parse(content, fmt)
    }
    reader.readAsText(file)
  }

  async function submit() {
    if (!preview.length) return
    setLoading(true); setError('')
    try {
      const res = await playersApi.bulkAdd(slug, preview.map(p => ({ name: p.name, classes: p.classes.join(',') })))
      onImported(res.players)
      toast(`${res.players.length} players imported`)
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Import failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal
      title="Bulk import players"
      onClose={onClose}
      width="w-full max-w-lg"
      className="max-h-[85vh] flex flex-col [&>div:nth-child(2)]:overflow-auto [&>div:nth-child(2)]:flex-1"
      footer={<>
        <Button variant="primary" onClick={submit} loading={loading} disabled={!preview.length || !!error} className="flex-1 py-2.5">
          Import {preview.length > 0 ? `${preview.length} players` : ''}
        </Button>
        <Button onClick={onClose} className="py-2.5">Cancel</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-sm overflow-hidden border border-zinc-700">
            {(['json', 'csv'] as const).map(m => (
              <button key={m} onClick={() => handleModeChange(m)}
                className={cn('px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                  mode === m ? 'bg-zinc-700 text-zinc-50' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300')}>
                {m}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => fileRef.current?.click()} icon={<FileUp className="w-3.5 h-3.5" />}>Load file</Button>
          <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        <div className="p-3 rounded-sm bg-zinc-950 border border-zinc-800">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-1">Format</p>
          {mode === 'json'
            ? <code className="text-sm text-zinc-400">{`[{"name": "player1", "classes": ["inf", "cav"]}]`}</code>
            : <code className="text-sm text-zinc-400">name, is_inf, is_arc, is_cav<br/>player1, x, , x</code>
          }
        </div>

        <textarea value={text} onChange={e => handleTextChange(e.target.value)}
          rows={8} placeholder={mode === 'json' ? '[{"name": "...", "classes": [...]}]' : 'player1, x, , x'}
          className={cn(inputCls, 'resize-none font-mono text-xs')} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        {preview.length > 0 && (
          <div>
            <p className="text-sm font-mono text-zinc-500 mb-2">{preview.length} players to import</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {preview.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-sm bg-zinc-950 border border-zinc-800">
                  <span className="text-sm text-zinc-200 flex-1 truncate">{p.name}</span>
                  <div className="flex gap-1">{p.classes.map(c => <ClassBadge key={c} cls={c} />)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
