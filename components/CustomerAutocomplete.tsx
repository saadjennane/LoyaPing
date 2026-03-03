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

  const wrapperRef      = useRef<HTMLDivElement>(null)
  const portalTargetRef = useRef<HTMLDivElement>(null)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSelect = (item: CustomerIndexItem) => {
    setQuery('')
    setOpen(false)
    onSelect(item.id, item)
  }

  const handleCreateNew = () => {
    const trimmed = query.trim()
    const isPhone = /^\+?[\d\s().-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 5
    setOpen(false)
    onCreateNew?.(isPhone ? trimmed : undefined)
  }

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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Dropdown visibility ───────────────────────────────────────────────────

  const isLoading    = status === 'loading'
  const isEmpty      = query.trim() === ''
  const hasContent   = isLoading || results.length > 0 || (!isEmpty && !!onCreateNew)
  const showDropdown = open && hasContent

  // Compute position AFTER DOM paint so getBoundingClientRect() is accurate.
  // useLayoutEffect fires synchronously after DOM mutations, before browser paint.
  // We portal into portalTargetRef (inside the Dialog's DOM subtree) so Radix
  // does NOT interpret clicks as "outside" — which previously caused the dialog
  // to dismiss and reset the step before the selection was processed.
  useLayoutEffect(() => {
    if (showDropdown && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    } else {
      setDropdownPos(null)
    }
  }, [showDropdown])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={wrapperRef} className="relative">
      {/*
        Hidden portal mount point — rendered inside the Dialog's DOM subtree.
        The dropdown is portaled here so Radix's DismissableLayer sees it as
        "inside" the dialog (contains() → true) and won't fire onInteractOutside.
      */}
      <div ref={portalTargetRef} />

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

      {/* Dropdown — portaled into the mount point, position:fixed for overflow escape */}
      {showDropdown && dropdownPos && portalTargetRef.current && createPortal(
        <div
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
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
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
              onMouseDown={(e) => { e.preventDefault(); handleCreateNew() }}
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
        portalTargetRef.current,
      )}
    </div>
  )
}
