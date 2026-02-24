'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, MessageSquare, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHONE_PREFIXES } from '@/lib/constants/phone-prefixes'

// ─── Types ────────────────────────────────────────────────────────────────────

type Modules = {
  orders_enabled:       boolean
  appointments_enabled: boolean
  loyalty_enabled:      boolean
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingStep7() {
  const router = useRouter()

  const [modules,     setModules]     = useState<Modules>({ orders_enabled: false, appointments_enabled: false, loyalty_enabled: false })
  const [stepTotal,   setStepTotal]   = useState(7)
  const [prefix,      setPrefix]      = useState('+33')
  const [localNumber, setLocalNumber] = useState('')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/modules').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ]).then(([modulesRes, profileRes]) => {
      const data = modulesRes.data
      if (data) {
        setModules({
          orders_enabled:       !!data.orders_enabled,
          appointments_enabled: !!data.appointments_enabled,
          loyalty_enabled:      !!data.loyalty_enabled,
        })
        const numModules = [data.orders_enabled, data.appointments_enabled, data.loyalty_enabled].filter(Boolean).length
        setStepTotal(numModules + 4)
      }
      const defaultPrefix = profileRes.data?.default_phone_prefix
      if (defaultPrefix) setPrefix(defaultPrefix)
    }).catch(() => {})
  }, [])

  const handleSendTest = async () => {
    setError('')
    const fullPhone = (prefix + localNumber).replace(/\s+/g, '').trim()
    if (!localNumber.trim()) { setError('Veuillez entrer votre numéro de téléphone.'); return }
    if ((fullPhone.match(/\d/g) ?? []).length < 8) { setError('Numéro invalide.'); return }

    setSending(true)
    try {
      const res = await fetch('/api/test/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: fullPhone }),
      }).then((r) => r.json())

      if (res.error) { setError(res.error); return }
      setSent(true)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setSending(false)
    }
  }

  const goToDashboard = async () => {
    await fetch('/api/settings/onboarding-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    }).catch(() => {})
    router.push('/')
  }

  const checklist = [
    { label: 'Informations générales',     done: true },
    { label: 'Modules configurés',          done: true },
    { label: 'Commandes',                   done: modules.orders_enabled,       conditional: true },
    { label: 'Rendez-vous',                 done: modules.appointments_enabled,  conditional: true },
    { label: 'Programme de fidélité',       done: modules.loyalty_enabled,       conditional: true },
    { label: 'Portail client personnalisé', done: true },
  ].filter((item) => !item.conditional || item.done)

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <Button
          type="button" variant="ghost" size="sm" className="shrink-0"
          onClick={() => router.push('/onboarding/step-6')}
        >
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">
          Étape {stepTotal} sur {stepTotal}
        </span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
        </div>
        <Button size="sm" onClick={goToDashboard} className="shrink-0 gap-1.5">
          Accéder au tableau de bord
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-12 space-y-10">

          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Votre système est prêt !</h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Testez votre configuration avant de commencer.
            </p>
          </div>

          {/* ── Section 1: Summary checklist ────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Récapitulatif
            </h2>
            <div className="space-y-3">
              {checklist.map(({ label }) => (
                <div key={label} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm text-foreground font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 2: Test messages ─────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Test en conditions réelles
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Entrez votre numéro pour recevoir une simulation réelle sur WhatsApp.
                Les messages seront clairement marqués comme tests.
              </p>
            </div>

            {!sent ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="test-phone">Numéro de téléphone</Label>
                  <div className="flex gap-2 max-w-xs">
                    {/* Country code dropdown */}
                    <select
                      value={prefix}
                      onChange={(e) => { setPrefix(e.target.value); setError('') }}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                      style={{ minWidth: '5.5rem' }}
                    >
                      {PHONE_PREFIXES.map((p, i) => (
                        <option key={`${p.code}-${i}`} value={p.code}>
                          {p.flag} {p.code}
                        </option>
                      ))}
                    </select>
                    {/* Local number */}
                    <Input
                      id="test-phone"
                      type="tel"
                      placeholder="6 12 34 56 78"
                      value={localNumber}
                      onChange={(e) => { setLocalNumber(e.target.value); setError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendTest() }}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                {/* Preview of messages to be sent */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Messages qui seront envoyés :</p>
                  <div className="space-y-1.5 pl-1">
                    {modules.orders_enabled && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>[Message de test] Votre commande est prête.</span>
                      </div>
                    )}
                    {modules.appointments_enabled && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>[Message de test] Rappel de rendez-vous.</span>
                      </div>
                    )}
                    {modules.loyalty_enabled && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>[Message de test] Récompense débloquée.</span>
                      </div>
                    )}
                    {!modules.orders_enabled && !modules.appointments_enabled && !modules.loyalty_enabled && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>[Message de test] Bienvenue sur LoyaPing !</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSendTest}
                  disabled={sending}
                  variant="outline"
                  className="gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4" />
                      Envoyer les messages de test
                    </>
                  )}
                </Button>
              </div>
            ) : (
              /* Success feedback */
              <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Messages envoyés avec succès !
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                    Vérifiez votre WhatsApp dans quelques instants.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Final actions ─────────────────────────────── */}
          <div className="space-y-3 pb-8">
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={goToDashboard}
            >
              Finaliser et accéder au tableau de bord
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={goToDashboard}
            >
              Passer le test
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
