'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, CalendarDays, Gift, Star, CheckCircle2, XCircle, Loader2, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHONE_PREFIXES } from '@/lib/constants/phone-prefixes'

type Scenario = 'orders' | 'appointments' | 'loyalty' | 'reviews'
type Status = 'idle' | 'sending' | 'sent' | 'error'

const SCENARIOS: {
  key: Scenario
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  moduleKey: string | null
}[] = [
  {
    key: 'orders',
    label: 'Commandes',
    description: 'Message "Votre commande est prête" envoyé quand une commande est marquée prête.',
    icon: ShoppingBag,
    moduleKey: 'orders_enabled',
  },
  {
    key: 'appointments',
    label: 'Rendez-vous',
    description: 'Rappel de rendez-vous envoyé automatiquement avant la date.',
    icon: CalendarDays,
    moduleKey: 'appointments_enabled',
  },
  {
    key: 'loyalty',
    label: 'Fidélité',
    description: 'Message "Récompense débloquée" envoyé quand un client atteint un palier.',
    icon: Gift,
    moduleKey: 'loyalty_enabled',
  },
  {
    key: 'reviews',
    label: 'Avis (boutons interactifs)',
    description: 'Message de satisfaction avec boutons 👍 / 👎 envoyé après interaction.',
    icon: Star,
    moduleKey: 'reviews_enabled',
  },
]

export default function TestMessagesPage() {
  const [prefix, setPrefix]           = useState('+33')
  const [localNumber, setLocalNumber] = useState('')
  const [phoneError, setPhoneError]   = useState('')
  const [modules, setModules]         = useState<Record<string, boolean>>({})
  const [statuses, setStatuses]       = useState<Record<Scenario, Status>>({
    orders: 'idle', appointments: 'idle', loyalty: 'idle', reviews: 'idle',
  })
  const [errors, setErrors] = useState<Record<Scenario, string>>({
    orders: '', appointments: '', loyalty: '', reviews: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/modules').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ]).then(([modulesRes, profileRes]) => {
      if (modulesRes.data) setModules(modulesRes.data)
      const defaultPrefix = profileRes.data?.default_phone_prefix
      if (defaultPrefix) setPrefix(defaultPrefix)
    }).catch(() => {})
  }, [])

  const validatePhone = () => {
    const full = (prefix + localNumber).replace(/\s+/g, '').trim()
    if (!localNumber.trim()) { setPhoneError('Numéro requis.'); return null }
    if ((full.match(/\d/g) ?? []).length < 8) { setPhoneError('Numéro invalide.'); return null }
    setPhoneError('')
    return full
  }

  const runTest = async (scenario: Scenario) => {
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
        // Reset to idle after 5s
        setTimeout(() => setStatuses((s) => ({ ...s, [scenario]: 'idle' })), 5000)
      }
    } catch {
      setStatuses((s) => ({ ...s, [scenario]: 'error' }))
      setErrors((e) => ({ ...e, [scenario]: 'Erreur réseau.' }))
    }
  }

  const visibleScenarios = SCENARIOS.filter(
    (s) => s.moduleKey === null || modules[s.moduleKey]
  )

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Tests WhatsApp</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Envoyez un message de test par scénario pour vérifier votre configuration WhatsApp.
          Les messages sont clairement marqués <code className="text-xs bg-muted px-1 py-0.5 rounded">[Test]</code>.
        </p>
      </div>

      {/* Phone input */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Label htmlFor="test-phone" className="text-sm font-medium">
          Numéro de destination
        </Label>
        <div className="flex gap-2 max-w-xs">
          <select
            value={prefix}
            onChange={(e) => { setPrefix(e.target.value); setPhoneError('') }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
            style={{ minWidth: '5.5rem' }}
          >
            {PHONE_PREFIXES.map((p, i) => (
              <option key={`${p.code}-${i}`} value={p.code}>
                {p.flag} {p.code}
              </option>
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
        <p className="text-xs text-muted-foreground">
          Pour le sandbox Vonage, ce numéro doit avoir envoyé <strong>Join year repay</strong> au +14157386102.
        </p>
      </div>

      {/* Scenario cards */}
      {visibleScenarios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aucun module activé. Activez des modules dans{' '}
            <a href="/settings/modules" className="underline">Paramètres → Modules</a>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleScenarios.map(({ key, label, description, icon: Icon }) => {
            const status = statuses[key]
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm font-medium">{label}</p>
                      {status === 'sent' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Envoyé
                        </span>
                      )}
                      {status === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          Erreur
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-3">{description}</p>

                    {errors[key] && (
                      <p className="text-xs text-destructive mb-2">{errors[key]}</p>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status === 'sending'}
                      onClick={() => runTest(key)}
                      className="gap-1.5"
                    >
                      {status === 'sending' ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Envoi…
                        </>
                      ) : (
                        'Tester'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
