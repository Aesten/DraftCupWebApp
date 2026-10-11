import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionChatMessage } from '@/api/sessions'
import { usePermissions } from '@/hooks/usePermissions'
import { Panel, Button } from '@/components/ui'

const ROLE_COLOR: Record<string, string> = {
  admin:      'text-red-400',
  host:       'text-blue-400',
  auctioneer: 'text-violet-400',
  captain:    'text-amber-400',
}

export default function FreeChat({ sessionId, messages, onLoad, className }: {
  sessionId:  number
  messages:   SessionChatMessage[]
  onLoad?:    () => void
  className?: string
}) {
  const [text,       setText]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { canChat } = usePermissions()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function handleSend() {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      await Promise.race([sessionsApi.chat(sessionId, text.trim()), timeout])
      setText(''); onLoad?.()
    } catch { /* ignore */ } finally { setSubmitting(false) }
  }

  return (
    <Panel title="Chat" className={className}>
      <div className="flex-1 overflow-y-auto px-3.5 py-2 space-y-1.5 min-h-0">
        {messages.length === 0
          ? <p className="text-xs italic text-zinc-600 py-1 text-center">No messages yet</p>
          : messages.map(msg => (
              <div key={msg.id} className="text-[13px] leading-snug">
                <span className={cn('font-semibold mr-1.5', ROLE_COLOR[msg.author_role] ?? 'text-zinc-400')}>
                  {msg.author_name}
                </span>
                <span className="text-zinc-400 break-words">{msg.content}</span>
              </div>
            ))
        }
        <div ref={bottomRef} />
      </div>
      {canChat && (
        <div className="border-t border-zinc-800 flex items-center gap-1.5 p-2 flex-shrink-0">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
            placeholder="Message…" maxLength={500}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-sm bg-zinc-950 border border-zinc-800 text-[13px] text-zinc-100 placeholder:text-zinc-600 placeholder:italic focus:outline-none focus:border-zinc-600"
          />
          <Button size="sm" onClick={handleSend} loading={submitting} disabled={!text.trim()} icon={<Send className="w-3.5 h-3.5" />} className="py-2" aria-label="Send" />
        </div>
      )}
    </Panel>
  )
}
