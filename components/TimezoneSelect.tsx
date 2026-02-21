'use client'

/**
 * TimezoneSelect — searchable combobox for IANA timezone selection.
 *
 * Implemented with pure React + Tailwind (no cmdk/Command dependency)
 * since those aren't in the project yet.
 *
 * UX decisions:
 *  - Click the trigger button → opens a floating panel
 *  - Type in the search input → filters by value or label (case-insensitive)
 *  - Click an option (or press Enter/ArrowUp/ArrowDown) → selects and closes
 *  - Click outside / press Escape → closes without change
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import TIMEZONES, { type TimezoneOption } from '@/lib/data/timezones'

type Props = {
  value:    string
  onChange: (tz: string) => void
  disabled?: boolean
}

const MAX_VISIBLE = 80  // show at most 80 options to avoid long lists

export default function TimezoneSelect({ value, onChange, disabled }: Props) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState(0)

  const wrapperRef  = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)
  const listRef     = useRef<HTMLUListElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setSearch('')
      setCursor(0)
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  const filtered: TimezoneOption[] = search.trim()
    ? TIMEZONES.filter((t) =>
        t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.value.toLowerCase().includes(search.toLowerCase()),
      ).slice(0, MAX_VISIBLE)
    : TIMEZONES.slice(0, MAX_VISIBLE)

  const select = useCallback((tz: string) => {
    onChange(tz)
    setOpen(false)
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[cursor]) select(filtered[cursor].value)
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  // Scroll cursor item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const selectedLabel =
    TIMEZONES.find((t) => t.value === value)?.label ?? value

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCursor(0) }}
              placeholder="Rechercher un fuseau…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            className="max-h-60 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat</li>
            ) : (
              filtered.map((tz, i) => (
                <li
                  key={tz.value}
                  role="option"
                  aria-selected={tz.value === value}
                  onMouseDown={(e) => { e.preventDefault(); select(tz.value) }}
                  onMouseEnter={() => setCursor(i)}
                  className={[
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                    i === cursor ? 'bg-accent text-accent-foreground' : '',
                    tz.value === value ? 'font-medium' : '',
                  ].join(' ')}
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${tz.value === value ? 'opacity-100' : 'opacity-0'}`} />
                  {tz.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
