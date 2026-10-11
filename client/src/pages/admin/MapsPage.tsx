import { useState, useRef } from 'react'
import { mapsApi, type GameMap } from '@/api/maps'
import { cn, imgSrc } from '@/lib/utils'
import { Loader2, Plus, Trash2, Pencil, Check, X, Upload, ImageIcon, ToggleLeft, ToggleRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { Button, Heading, Panel, inputCls, inputSmCls } from '@/components/ui'
import { qk, useInvalidate, useMaps } from '@/queries'

// ─── Map row ──────────────────────────────────────────────────────────────────

function MapRow({ map, onChanged }: {
  map: GameMap
  onChanged: () => Promise<void>
}) {
  const { toast } = useToast()
  const [editing,    setEditing]    = useState(false)
  const [editName,   setEditName]   = useState(map.name)
  const [editGameId, setEditGameId] = useState(map.game_id ?? '')
  const [editTags,   setEditTags]   = useState(map.tags ?? '')
  const [uploading,  setUploading]  = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveEdit() {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await mapsApi.update(map.id, {
        name:    editName.trim(),
        game_id: editGameId.trim() || null,
        tags:    editTags.trim() || undefined,
      })
      await onChanged()
      setEditing(false)
      toast('Map updated')
    } finally { setSaving(false) }
  }

  async function toggleActive() {
    const updated = await mapsApi.update(map.id, { is_active: map.is_active ? 0 : 1 })
    await onChanged()
    toast(updated.is_active ? 'Map activated' : 'Map deactivated')
  }

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      await mapsApi.uploadImage(map.id, file)
      await onChanged()
      toast('Image uploaded')
    } finally { setUploading(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await mapsApi.delete(map.id); await onChanged(); toast('Map deleted') }
    catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Cannot delete map', 'error')
      setDeleting(false)
    }
  }

  const tagList = map.tags ? map.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 group transition-colors',
      !map.is_active && 'opacity-50'
    )}>
      {/* Thumbnail */}
      <div className="w-12 h-9 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer"
        onClick={() => fileRef.current?.click()}>
        {uploading
          ? <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
          : map.image_path
            ? <img src={imgSrc(map.image_path)} alt={map.name} className="w-full h-full object-cover" />
            : <ImageIcon className="w-4 h-4 text-zinc-700" />
        }
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
      </div>

      {/* Name + tags */}
      {editing ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="Map name"
            className={cn(inputSmCls, 'flex-1')} />
          <input value={editGameId} onChange={e => setEditGameId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="game id (for !setmap)"
            className={cn(inputSmCls, 'w-36 font-mono')} />
          <input value={editTags} onChange={e => setEditTags(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="tags, comma-separated"
            className={cn(inputSmCls, 'w-44')} />
          <button onClick={saveEdit} disabled={saving} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1.5 text-zinc-500 hover:bg-zinc-800 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-xs font-bold tracking-[0.04em] text-zinc-100 truncate">{map.name}</p>
            {map.game_id && (
              <span className="text-[10px] font-mono text-amber-600 truncate">{map.game_id}</span>
            )}
          </div>
          {tagList.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {tagList.map(t => (
                <span key={t} className="font-display text-[8px] uppercase tracking-[0.15em] text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-sm">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={toggleActive} title={map.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            {map.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => { setEditName(map.name); setEditGameId(map.game_id ?? ''); setEditTags(map.tags ?? ''); setEditing(true) }}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Maps page ────────────────────────────────────────────────────────────────

export default function MapsPage() {
  const { toast } = useToast()
  const invalidate = useInvalidate()
  const { data: maps = [], isPending: loading } = useMaps()
  const refreshMaps = () => invalidate(qk.maps())
  const [newName,    setNewName]    = useState('')
  const [newGameId,  setNewGameId]  = useState('')
  const [newTags,    setNewTags]    = useState('')
  const [newImage,   setNewImage]   = useState<File | null>(null)
  const [newPreview, setNewPreview] = useState<string | null>(null)
  const [adding,     setAdding]     = useState(false)
  const [error,      setError]      = useState('')
  const newFileRef = useRef<HTMLInputElement>(null)

  function handleNewImage(file: File) {
    setNewImage(file)
    const url = URL.createObjectURL(file)
    setNewPreview(url)
  }

  async function addMap() {
    if (!newName.trim()) return
    setAdding(true); setError('')
    try {
      const m = await mapsApi.create(newName.trim(), newTags.trim() || undefined, newGameId.trim() || undefined)
      if (newImage) await mapsApi.uploadImage(m.id, newImage)
      await refreshMaps()
      setNewName(''); setNewGameId(''); setNewTags(''); setNewImage(null)
      if (newPreview) { URL.revokeObjectURL(newPreview); setNewPreview(null) }
      toast('Map added')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create map')
    } finally { setAdding(false) }
  }

  const activeMaps   = maps.filter(m =>  m.is_active)
  const inactiveMaps = maps.filter(m => !m.is_active)

  return (
    <div className="max-w-2xl mx-auto py-8 px-8 space-y-6">
      <div>
        <Heading className="mb-0.5">Maps</Heading>
        <p className="text-[13px] text-zinc-500">Global map pool. Active maps are available for matchup rolling and pick-ban.</p>
      </div>

      {/* Add new */}
      <Panel title="Add map" bodyClassName="p-4 gap-3">
        <div className="flex gap-2">
          {/* Image thumbnail picker */}
          <div
            className="w-12 h-10 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:border-zinc-600 transition-colors"
            onClick={() => newFileRef.current?.click()}
            title="Upload image">
            {newPreview
              ? <img src={newPreview} alt="preview" className="w-full h-full object-cover" />
              : <ImageIcon className="w-4 h-4 text-zinc-700" />
            }
            <input ref={newFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleNewImage(f) }} />
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="Map name…"
            className={cn(inputCls, 'flex-1')} />
          <input value={newGameId} onChange={e => setNewGameId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="game id (for !setmap)"
            className={cn(inputCls, 'w-36 font-mono')} />
          <input value={newTags} onChange={e => setNewTags(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMap()}
            placeholder="tags (e.g. siege, field)"
            className={cn(inputCls, 'w-44')} />
          <Button variant="primary" onClick={addMap} loading={adding} disabled={!newName.trim()} icon={<Plus className="w-4 h-4" />} aria-label="Add map" className="flex-shrink-0" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </Panel>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Active maps */}
          {activeMaps.length > 0 && (
            <Panel title={`${activeMaps.length} active`} bodyClassName="divide-y divide-zinc-800">
              {activeMaps.map(m => (
                <MapRow key={m.id} map={m} onChanged={refreshMaps} />
              ))}
            </Panel>
          )}

          {/* Inactive maps */}
          {inactiveMaps.length > 0 && (
            <Panel title={`${inactiveMaps.length} inactive`} bodyClassName="divide-y divide-zinc-800">
              {inactiveMaps.map(m => (
                <MapRow key={m.id} map={m} onChanged={refreshMaps} />
              ))}
            </Panel>
          )}

          {maps.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No maps yet. Add the first one above.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
