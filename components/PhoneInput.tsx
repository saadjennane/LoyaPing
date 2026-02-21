'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PHONE_PREFIXES, splitPhonePrefix } from '@/lib/constants/phone-prefixes'

const STORAGE_KEY = 'loyaping_phone_prefix'

function getStoredPrefix(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? '+212' } catch { return '+212' }
}

type Props = {
  value:      string
  onChange:   (value: string) => void
  required?:  boolean
  disabled?:  boolean
  autoFocus?: boolean
}

export default function PhoneInput({ value, onChange, required, disabled, autoFocus }: Props) {
  // Parse initial value; fall back to stored prefix for empty forms
  const init = () => {
    if (value) return splitPhonePrefix(value, getStoredPrefix())
    return { prefix: getStoredPrefix(), number: '' }
  }

  const [prefix, setPrefix] = useState<string>(() => init().prefix)
  const [local,  setLocal]  = useState<string>(() => init().number)
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sync if value is set externally (e.g. pre-fill from phone search)
  useEffect(() => {
    if (value && value !== `${prefix}${local}`) {
      const parsed = splitPhonePrefix(value, prefix)
      setPrefix(parsed.prefix)
      setLocal(parsed.number)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const combine = (p: string, l: string) => onChange(l ? `${p}${l}` : '')

  const handlePrefixSelect = (code: string) => {
    setPrefix(code)
    setOpen(false)
    setSearch('')
    try { localStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
    combine(code, local)
  }

  const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d]/g, '')
    setLocal(val)
    combine(prefix, val)
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentPrefix = PHONE_PREFIXES.find(p => p.code === prefix)
  const filtered = search.trim()
    ? PHONE_PREFIXES.filter(p =>
        p.label.toLowerCase().includes(search.toLowerCase()) ||
        p.code.includes(search)
      )
    : PHONE_PREFIXES

  return (
    <div ref={wrapperRef} className="relative flex">
      {/* Prefix trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 h-9 border border-r-0 rounded-l-md bg-gray-50 hover:bg-gray-100 text-sm shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="text-base leading-none">{currentPrefix?.flag ?? '🌍'}</span>
        <span className="text-gray-600 text-xs font-mono">{prefix}</span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>

      {/* Local number */}
      <Input
        autoFocus={autoFocus}
        required={required}
        disabled={disabled}
        value={local}
        onChange={handleLocalChange}
        placeholder="612345678"
        inputMode="numeric"
        className="rounded-l-none"
      />

      {/* Country dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un pays…"
                className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-md outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          {/* List */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={`${p.code}-${p.label}`}
                type="button"
                onClick={() => handlePrefixSelect(p.code)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                  p.code === prefix ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
                }`}
              >
                <span className="text-base leading-none">{p.flag}</span>
                <span className="flex-1 truncate">{p.label}</span>
                <span className="text-gray-400 text-xs font-mono shrink-0">{p.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Aucun résultat</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
