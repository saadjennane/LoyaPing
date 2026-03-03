'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, UserPlus, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useCustomerIndex } from '@/lib/hooks/useCustomerIndex'
import type { CustomerIndexItem } from '@/lib/types'

type Props = {
  onSelect:    (id: string, item: CustomerIndexItem) => void
  onCreateNew?: (phone?: string) => void
  placeholder?: string
  autoFocus?:  boolean
  disabled?:   boolean
}

export default function CustomerAutocomplete({
  onSelect,
  onCreateNew,
  placeholder = 'Nom ou numéro de téléphone…',
  autoFocus,
  disabled,
}: Props) {
  const { status, search } = useCustomerIndex()

  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<CustomerIndexItem[]>([])
  const [open, setOpen]           = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const wrapperRef  = useRef<HTMLDivElement>(null)
  const portalRef   = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep latest handlers in refs so the native listener always sees fresh values
  const resultsRef      = useRef(results)
  const handleSelectRef = useRef<(item: CustomerIndexItem) => void>(() => {})
  const handleCreateRef = useRef<() => void>(() => {})

  // ── Search ───────────────────────────────────────────────────────────────

  const runSearch = useCallback(
    (q: string) => { setResults(search(q)); setActiveIdx(-1) },
    [search],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 80)
  }

  const handleFocus = () => {
    setOpen(true)
    if (status === 'ready' && query.trim()) runSearch(query)
  }

  useEffect(() => {
    if (status === 'ready' && query.trim()) runSearch(query)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection ────────────────────────────────────────────────────────────

  const handleSelect = useCallback((item: CustomerIndexItem) => {
    setQuery('')
    setOpen(false)
    onSelect(item.id, item)
  }, [onSelect])

  const handleCreateNew = useCallback(() => {
    const trimmed = query.trim()
    const isPhone = /^\+?[\d\s().-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 5
    setOpen(false)
    onCreateNew?.(isPhone ? trimmed : undefined)
  }, [query, onCreateNew])

  // Keep refs in sync so the native pointerdown listener below always sees latest values
  useEffect(() => { resultsRef.current      = results      }, [results])
  useEffect(() => { handleSelectRef.current = handleSelect }, [handleSelect])
  useEffect(() => { handleCreateRef.current = handleCreateNew }, [handleCreateNew])

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const totalItems = results.length + (onCreateNew ? 1 : 0)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, totalItems - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIdx >= 0 && activeIdx < results.length) {
          handleSelect(results[activeIdx])
        } else if (activeIdx === results.length && onCreateNew) {
          handleCreateNew()
        }
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  // ── Click outside ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target as Node) &&
        portalRef.current  && !portalRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Dropdown position ─────────────────────────────────────────────────────

  const isLoading    = status === 'loading'
  const isEmpty      = query.trim() === ''
  const hasContent   = isLoading || results.length > 0 || (!isEmpty && !!onCreateNew)
  const showDropdown = open && hasContent

  useLayoutEffect(() => {
    if (!showDropdown || !wrapperRef.current) {
      setDropdownPos(null)
      return
    }

    const update = () => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const vvTop  = window.visualViewport?.offsetTop  ?? 0
      const vvLeft = window.visualViewport?.offsetLeft ?? 0
      setDropdownPos({
        top:   rect.bottom + 4 + vvTop,
        left:  rect.left       + vvLeft,
        width: rect.width,
      })
    }

    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [showDropdown])

  // ── Native pointerdown on portal ─────────────────────────────────────────
  // React 18 synthetic events (onMouseDown etc.) don't fire on elements
  // portaled to document.body (outside the React root container).
  // Solution: attach a native pointerdown listener directly to the portal div.
  // stopPropagation() prevents the event from reaching document, so Radix's
  // DismissableLayer never detects an "outside click" → dialog stays open.

  useEffect(() => {
    const el = portalRef.current
    if (!el) return

    const handler = (e: PointerEvent) => {
      // Prevent bubbling to document (where Radix listens for outside clicks)
      e.stopPropagation()
      e.preventDefault()

      const target = e.target as Element | null

      // Result item click
      const itemEl = target?.closest('[data-item-id]')
      if (itemEl) {
        const id   = itemEl.getAttribute('data-item-id')
        const item = resultsRef.current.find((r) => r.id === id)
        if (item) handleSelectRef.current(item)
        return
      }

      // Create-new button click
      if (target?.closest('[data-create-btn]')) {
        handleCreateRef.current()
      }
    }

    el.addEventListener('pointerdown', handler)
    return () => el.removeEventListener('pointerdown', handler)
  // Re-attach whenever the portal mounts (showDropdown toggles)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className="relative">
      {/* Input */}
      <div className="relative">
        {isLoading ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        )}
        <Input
          autoFocus={autoFocus}
          disabled={disabled}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? 'Chargement…' : placeholder}
          className="pl-9"
        />
      </div>

      {/* Dropdown — portaled to document.body (escapes Radix transform ancestor).
          Interaction handled via native pointerdown listener (see above). */}
      {showDropdown && dropdownPos && createPortal(
        <div
          ref={portalRef}
          data-autocomplete-portal="true"
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
        >
          {/* Loading */}
          {isLoading && (
            <div className="px-3 py-3 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Chargement de l&apos;index…
            </div>
          )}

          {/* Results */}
          {results.map((item, i) => (
            <div
              key={item.id}
              data-item-id={item.id}
              className={`px-3 py-2.5 cursor-pointer flex flex-col gap-0.5 transition-colors ${
                i === activeIdx ? 'bg-indigo-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="text-sm font-medium text-gray-900">{item.display_name}</span>
              {item.display_name !== item.phone && (
                <span className="text-xs text-gray-500">{item.phone}</span>
              )}
            </div>
          ))}

          {/* No results */}
          {!isLoading && !isEmpty && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">Aucun client trouvé</div>
          )}

          {/* Create new */}
          {onCreateNew && !isEmpty && (
            <div
              data-create-btn="true"
              className={`px-3 py-2.5 cursor-pointer flex items-center gap-2 border-t transition-colors ${
                activeIdx === results.length ? 'bg-blue-50' : 'hover:bg-blue-50'
              }`}
            >
              <UserPlus className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm text-blue-600 font-medium">
                Créer &ldquo;{query.trim()}&rdquo;
              </span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
