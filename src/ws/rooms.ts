// ─── Broadcast-only WebSocket rooms ──────────────────────────────────────────
// Clients connect to receive "state changed, re-fetch now" signals.
// Every mutation goes through HTTP and is validated there; the socket carries
// no state and accepts no commands, so the server stays the single authority.

interface Client {
  ws: { send: (data: string) => void }
}

interface Room {
  onOpen:    (ws: { send: (data: string) => void }, roomId: number) => void
  onClose:   (ws: object) => void
  broadcast: (roomId: number) => void
  clientCount: (roomId: number) => number
}

function getRaw(ws: object): object {
  return (ws as any).raw ?? ws
}

export function createRoom(messageType: string): Room {
  const clientsByRoom = new Map<number, Set<Client>>()
  const clientById    = new Map<string, { client: Client; roomId: number }>()
  const WS_ID         = Symbol(`wsId:${messageType}`)
  const message       = JSON.stringify({ type: messageType })

  function getClients(roomId: number): Set<Client> {
    let set = clientsByRoom.get(roomId)
    if (!set) { set = new Set(); clientsByRoom.set(roomId, set) }
    return set
  }

  return {
    onOpen(ws, roomId) {
      const wsId = crypto.randomUUID();
      (getRaw(ws) as any)[WS_ID] = wsId
      const client: Client = { ws }
      getClients(roomId).add(client)
      clientById.set(wsId, { client, roomId })
      // Sync the newcomer immediately instead of waiting for the next mutation.
      try { ws.send(message) } catch { /* disconnected */ }
    },

    onClose(ws) {
      const wsId  = (getRaw(ws) as any)[WS_ID] as string | undefined
      const entry = wsId ? clientById.get(wsId) : undefined
      if (!wsId || !entry) return
      const clients = getClients(entry.roomId)
      clients.delete(entry.client)
      clientById.delete(wsId)
      if (clients.size === 0) clientsByRoom.delete(entry.roomId)
    },

    broadcast(roomId) {
      const clients = clientsByRoom.get(roomId)
      if (!clients) return
      clients.forEach((client) => {
        try { client.ws.send(message) } catch { clients.delete(client) }
      })
    },

    clientCount(roomId) {
      return clientsByRoom.get(roomId)?.size ?? 0
    },
  }
}

export const auctionRoom = createRoom('session_updated')
export const pickBanRoom = createRoom('pickban_updated')
