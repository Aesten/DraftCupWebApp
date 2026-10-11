import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi, type MeResponse, type Role } from '@/api/auth'
import { ApiError } from '@/api/client'

interface AuthState {
  user:    MeResponse | null
  loading: boolean
  error:   string | null
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>
  logout:  () => Promise<void>
  isRole:  (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Stable identity string: when it changes, cached server data may no longer apply. */
function identityOf(user: MeResponse | null): string {
  if (!user) return ''
  return [user.role, user.tournamentId, user.projectId, user.captainId].join(':')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null })
  const identityRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const user = await authApi.me()
      setState({ user, loading: false, error: null })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setState({ user: null, loading: false, error: null })
      } else {
        setState({ user: null, loading: false, error: 'Failed to load session' })
      }
    }
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    setState({ user: null, loading: false, error: null })
    // Everything fetched while signed in (tokens, private rosters…) leaves with the user.
    qc.clear()
  }, [qc])

  const isRole = useCallback(
    (...roles: Role[]) => !!state.user && roles.includes(state.user.role),
    [state.user]
  )

  useEffect(() => { refresh() }, [refresh])

  // Signing in (or switching role via "sign in as") changes what the server
  // returns for the same URLs, so drop what was cached under the old identity.
  useEffect(() => {
    if (state.loading) return
    const id = identityOf(state.user)
    if (identityRef.current !== null && identityRef.current !== id) qc.invalidateQueries()
    identityRef.current = id
  }, [state.loading, state.user, qc])

  return (
    <AuthContext.Provider value={{ ...state, refresh, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
