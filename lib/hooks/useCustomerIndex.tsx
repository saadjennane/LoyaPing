'use client'

import {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, type ReactNode,
} from 'react'
import type { CustomerIndexItem } from '@/lib/types'

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'loyaping_customer_index'
const STORAGE_TTL = 24 * 60 * 60 * 1000  // 24 h
const MAX_RESULTS = 12

// ── Search algorithm (pure, local, no network) ────────────────────────────────

function searchItems(query: string, items: CustomerIndexItem[]): CustomerIndexItem[] {
  const q = query.trim().toLowerCase()

  if (!q) return []

  const qDigits = q.replace(/\D/g, '')

  const scored: { item: CustomerIndexItem; score: number }[] = []
  for (const item of items) {
    const name = item.display_name.toLowerCase()
    const digits = item.phone_digits
    const last4 = item.phone_last4
    let score = 0

    // Name match
    if (name.startsWith(q)) score = Math.max(score, 4)
    else if (name.includes(q)) score = Math.max(score, 3)

    // Phone match (digit-only queries or mixed)
    if (qDigits.length >= 2) {
      if (digits.startsWith(qDigits)) score = Math.max(score, 4)
      else if (digits.includes(qDigits)) score = Math.max(score, 3)
      else if (qDigits.length >= 3 && last4.startsWith(qDigits)) score = Math.max(score, 2)
    }

    if (score > 0) scored.push({ item, score })
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.item.last_activity_at ?? '') > (a.item.last_activity_at ?? '') ? 1 : -1
    })
    .slice(0, MAX_RESULTS)
    .map((s) => s.item)
}

// ── Context ──────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'ready' | 'error'

type CustomerIndexContextValue = {
  status:          Status
  search:          (query: string) => CustomerIndexItem[]
  refreshIndex:    () => void
  addOrUpdate:     (item: CustomerIndexItem) => void
  removeFromIndex: (id: string) => void
}

const CustomerIndexContext = createContext<CustomerIndexContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

export function CustomerIndexProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CustomerIndexItem[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const etagRef = useRef<string | null>(null)
  const loadingRef = useRef(false)

  const loadIndex = useCallback(async (force = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setStatus('loading')

    // Try localStorage cache first (skip if force refresh)
    if (!force && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { items: CustomerIndexItem[]; loadedAt: number; etag?: string }
          if (Date.now() - parsed.loadedAt < STORAGE_TTL) {
            setItems(parsed.items)
            etagRef.current = parsed.etag ?? null
            setStatus('ready')
            loadingRef.current = false
            return
          }
        }
      } catch { /* ignore */ }
    }

    // Fetch from server (with ETag for conditional requests)
    try {
      const headers: HeadersInit = {}
      if (etagRef.current) headers['If-None-Match'] = etagRef.current

      const res = await fetch('/api/customers/index', { headers })

      if (res.status === 304) {
        // Not modified — keep current items
        setStatus('ready')
        loadingRef.current = false
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const newItems: CustomerIndexItem[] = json.data
      const newEtag = res.headers.get('ETag') ?? null
      etagRef.current = newEtag
      setItems(newItems)
      setStatus('ready')

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ items: newItems, loadedAt: Date.now(), etag: newEtag }),
        )
      } catch { /* quota exceeded — ignore */ }
    } catch {
      setStatus('error')
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { loadIndex() }, [loadIndex])

  const refreshIndex = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    etagRef.current = null
    loadIndex(true)
  }, [loadIndex])

  const addOrUpdate = useCallback((item: CustomerIndexItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id)
      const next = idx >= 0
        ? prev.map((i) => (i.id === item.id ? item : i))
        : [item, ...prev]
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ items: next, loadedAt: Date.now(), etag: etagRef.current }),
        )
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const removeFromIndex = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ items: next, loadedAt: Date.now(), etag: etagRef.current }),
        )
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const search = useCallback(
    (query: string) => searchItems(query, items),
    [items],
  )

  return (
    <CustomerIndexContext.Provider value={{ status, search, refreshIndex, addOrUpdate, removeFromIndex }}>
      {children}
    </CustomerIndexContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCustomerIndex(): CustomerIndexContextValue {
  const ctx = useContext(CustomerIndexContext)
  if (!ctx) throw new Error('useCustomerIndex must be used within CustomerIndexProvider')
  return ctx
}
