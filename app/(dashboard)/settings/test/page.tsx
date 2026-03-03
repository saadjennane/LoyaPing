'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ShoppingBag, CalendarDays, Gift, Star, FlaskConical,
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHONE_PREFIXES } from '@/lib/constants/phone-prefixes'
import type { TestScenario } from '@/app/api/test/messages/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'sending' | 'sent' | 'error'

type ScenarioConfig = {
  key: TestScenario
  label: string
  hint?: string   // extra note (e.g. "boutons interactifs")
}

type ModuleGroup = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  moduleKey: string
  scenarios: ScenarioConfig[]
}

// ── Module / scenario definitions ─────────────────────────────────────────────

const GROUPS: ModuleGroup[] = [
  {
    key: 'orders',
    label: 'Commandes',
    icon: ShoppingBag,
    moduleKey: 'orders_enabled',
    scenarios: [
      { key: 'order_ready',      label: 'Commande prête' },
      { key: 'order_correction', label: 'Message de correction', hint: 'envoyé si la commande est annulée après notification' },
    ],
  },
  {
    key: 'appointments',
    label: 'Rendez-vous',
    icon: CalendarDays,
    moduleKey: 'appointments_enabled',
    scenarios: [
      { key: 'appointment_reminder_1', label: 'Rappel 1' },
      { key: 'appointment_reminder_2', label: 'Rappel 2' },
      { key: 'appointment_reminder_3', label: 'Rappel 3' },
    ],
  },
  {
    key: 'loyalty',
    label: 'Fidélité',
    icon: Gift,
    moduleKey: 'loyalty_enabled',
    scenarios: [
      { key: 'loyalty_tier',     label: 'Récompense palier' },
      { key: 'loyalty_birthday', label: 'Récompense anniversaire' },
    ],
  },
  {
    key: 'reviews',
    label: 'Avis',
    icon: Star,
    moduleKey: 'reviews_enabled',
    scenarios: [
      { key: 'review_request',  label: 'Demande d\'avis', hint: 'boutons interactifs 👍 / 👎' },
      { key: 'review_positive', label: 'Réponse positive' },
      { key: 'review_negative', label: 'Réponse négative' },
    ],
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TestMessagesPage() {
  const [prefix, setPrefix]           = useState('+33')
  const [localNumber, setLocalNumber] = useState('')
  const [phoneError, setPhoneError]   = useState('')

  const [modules,   setModules]   = useState<Record<string, boolean>>({})
  const [previews,  setPreviews]  = useState<Record<TestScenario, string | null>>({} as Record<TestScenario, string | null>)
  const [loadingPreviews, setLoadingPreviews] = useState(true)

  // Expanded state per group
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g.key, true]))
  )

  const [statuses, setStatuses] = useState<Record<TestScenario, Status>>({
    order_ready: 'idle', order_correction: 'idle',
    appointment_reminder_1: 'idle', appointment_reminder_2: 'idle', appointment_reminder_3: 'idle',
    loyalty_tier: 'idle', loyalty_birthday: 'idle',
    review_request: 'idle', review_positive: 'idle', review_negative: 'idle',
  })
  const [errors, setErrors] = useState<Record<TestScenario, string>>({
    order_ready: '', order_correction: '',
    appointment_reminder_1: '', appointment_reminder_2: '', appointment_reminder_3: '',
    loyalty_tier: '', loyalty_birthday: '',
    review_request: '', review_positive: '', review_negative: '',
  })

  const loadPreviews = useCallback(async () => {
    setLoadingPreviews(true)
    try {
      const [modulesRes, previewsRes, profileRes] = await Promise.all([
        fetch('/api/settings/modules').then((r) => r.json()),
        fetch('/api/test/messages').then((r) => r.json()),
        fetch('/api/settings/profile').then((r) => r.json()),
      ])
      if (modulesRes.data) setModules(modulesRes.data)
      if (previewsRes.data?.previews) setPreviews(previewsRes.data.previews)
      const defaultPrefix = profileRes.data?.default_phone_prefix
      if (defaultPrefix) setPrefix(defaultPrefix)
    } catch { /* silent */ } finally {
      setLoadingPreviews(false)
    }
  }, [])

  useEffect(() => { loadPreviews() }, [loadPreviews])

  const validatePhone = (): string | null => {
    const full = (prefix + localNumber).replace(/\s+/g, '').trim()
    if (!localNumber.trim()) { setPhoneError('Numéro requis.'); return null }
    if ((full.match(/\d/g) ?? []).length < 8) { setPhoneError('Numéro invalide.'); return null }
    setPhoneError('')
    return full
  }

  const runTest = async (scenario: TestScenario) => {
    const phone = validatePhone()
    if (!phone) return

    setStatuses((s) => ({ ...s, [scenario]: 'sending' }))
    setErrors((e) => ({ ...e, [scenario]: '' }))

    try {
      const res = await fetch('/api/test/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, scenario }),
      }).then((r) => r.json())

      if (res.error) {
        setStatuses((s) => ({ ...s, [scenario]: 'error' }))
        setErrors((e) => ({ ...e, [scenario]: res.error }))
      } else {
        setStatuses((s) => ({ ...s, [scenario]: 'sent' }))
        setTimeout(() => setStatuses((s) => ({ ...s, [scenario]: 'idle' })), 5000)
      }
    } catch {
      setStatuses((s) => ({ ...s, [scenario]: 'error' }))
      setErrors((e) => ({ ...e, [scenario]: 'Erreur réseau.' }))
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Tests WhatsApp</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Envoyez un message de test par scénario. Les messages utilisent votre configuration réelle et sont préfixés{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">[Test]</code>.
        </p>
      </div>

      {/* Phone input */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Label htmlFor="test-phone" className="text-sm font-medium">Numéro de destination</Label>
        <div className="flex gap-2 max-w-xs">
          <select
            value={prefix}
            onChange={(e) => { setPrefix(e.target.value); setPhoneError('') }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
            style={{ minWidth: '5.5rem' }}
          >
            {PHONE_PREFIXES.map((p, i) => (
              <option key={`${p.code}-${i}`} value={p.code}>{p.flag} {p.code}</option>
            ))}
          </select>
          <Input
            id="test-phone"
            type="tel"
            placeholder="6 12 34 56 78"
            value={localNumber}
            onChange={(e) => { setLocalNumber(e.target.value); setPhoneError('') }}
          />
        </div>
        {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
      </div>

      {/* Module groups */}
      <div className="space-y-4">
        {GROUPS.map(({ key, label, icon: Icon, moduleKey, scenarios }) => {
          const enabled = modules[moduleKey]
          if (!enabled) return null

          const isExpanded = expanded[key]

          return (
            <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-sm flex-1">{label}</span>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </button>

              {/* Scenarios */}
              {isExpanded && (
                <div className="border-t border-border divide-y divide-border">
                  {scenarios.map(({ key: sc, label: scLabel, hint }) => {
                    const preview    = loadingPreviews ? null : previews[sc]
                    const unavailable = !loadingPreviews && !preview
                    const status     = statuses[sc]

                    return (
                      <div key={sc} className={`px-5 py-4 space-y-2 ${unavailable ? 'opacity-50' : ''}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-medium">{scLabel}</p>
                            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                            {unavailable && (
                              <p className="text-xs text-muted-foreground">Non configuré ou désactivé</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {status === 'sent' && (
                              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />Envoyé
                              </span>
                            )}
                            {status === 'error' && (
                              <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                                <XCircle className="h-3.5 w-3.5" />Erreur
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={status === 'sending' || unavailable}
                              onClick={() => runTest(sc)}
                              className="gap-1.5"
                            >
                              {status === 'sending'
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Envoi…</>
                                : 'Tester'
                              }
                            </Button>
                          </div>
                        </div>

                        {/* Message preview */}
                        {preview && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
                            {preview}
                          </p>
                        )}

                        {errors[sc] && (
                          <p className="text-xs text-destructive">{errors[sc]}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {Object.entries(modules).filter(([k, v]) => k.endsWith('_enabled') && v).length === 0 && !loadingPreviews && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aucun module activé.{' '}
            <a href="/settings/modules" className="underline">Activer des modules</a>
          </p>
        </div>
      )}
    </div>
  )
}
