import { api } from './client'
import type {
  AuctionSession, SessionBid, SessionChatMessage, SessionDetail,
  QueueEntryWithClasses, PurchaseWithClasses,
} from '@shared/types'

export type { AuctionSession, SessionBid, SessionChatMessage, SessionDetail }
/** Queue entries as returned by the session endpoints (always carry player_classes). */
export type SessionQueueEntry = QueueEntryWithClasses
export type SessionPurchase   = PurchaseWithClasses

export const sessionsApi = {
  listForAuction: (auctionId: number) =>
    api.get<AuctionSession[]>(`/api/sessions/auction/${auctionId}`),
  get: (id: number) =>
    api.get<SessionDetail>(`/api/sessions/${id}`),
  create: (auctionId: number) =>
    api.post<{ session: AuctionSession; queue: SessionQueueEntry[] }>(`/api/sessions/auction/${auctionId}`),
  goLive: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/sessions/${id}/live`),
  pause: (id: number) =>
    api.post<{ ok: boolean; status: string }>(`/api/sessions/${id}/pause`),
  start: (id: number) =>
    api.post<{ activePlayer: SessionQueueEntry }>(`/api/sessions/${id}/start`),
  advance: (id: number, data: { action: 'sold' | 'skipped'; captain_id?: number; price?: number; expected_bid_id?: number }) =>
    api.post<{ session: AuctionSession; activePlayer: SessionQueueEntry | null; upcoming: SessionQueueEntry[] }>(`/api/sessions/${id}/advance`, data),
  bid: (id: number, data: { amount: number; captain_id?: number }) =>
    api.post<{ bid: SessionBid }>(`/api/sessions/${id}/bid`, data),
  revokeBid: (id: number, bidId: number) =>
    api.delete<{ ok: boolean }>(`/api/sessions/${id}/bids/${bidId}`),
  chat: (id: number, content: string) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/chat`, { content }),
  syncPool: (id: number) =>
    api.post<{ ok: boolean; count: number }>(`/api/sessions/${id}/sync-pool`),
  toggleHalfBudget: (id: number) =>
    api.post<{ ok: boolean; half_budget: number }>(`/api/sessions/${id}/half-budget`),
  assign: (id: number, data: { captain_id: number; player_queue_id: number }) =>
    api.post(`/api/sessions/${id}/assign`, data),
  refund: (id: number, purchaseId: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/refund`, { purchase_id: purchaseId }),
  getPendingPlayers: (id: number) =>
    api.get<(SessionQueueEntry & { player_classes: string })[]>(`/api/sessions/${id}/pending-players`),
  setActive: (id: number, queueEntryId: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/set-active`, { queue_entry_id: queueEntryId }),
  finish: (id: number) =>
    api.post<{ ok: boolean }>(`/api/sessions/${id}/finish`),
}