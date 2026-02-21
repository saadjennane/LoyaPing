'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Box, CalendarDays, Star, Check, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#3B5BDB'

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked }: { checked: boolean }) {
  return (
    <div className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-muted-foreground/25'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </div>
  )
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

type Modules = { orders: boolean; appointments: boolean; loyalty: boolean }

function MobilePreview({ modules }: { modules: Modules }) {
  const hasAny = modules.orders || modules.appointments || modules.loyalty

  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] shrink-0">
        <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
          {/* Notch */}
          <div className="h-6 bg-gray-800 flex items-center justify-center">
            <div className="w-16 h-3 bg-black rounded-full" />
          </div>

          {/* Screen */}
          <div className="bg-gray-50 overflow-y-auto text-gray-900" style={{ height: 520 }}>
            <div className="px-3 py-4 space-y-2.5">

              {/* Business header */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-10 w-full rounded-t-2xl" style={{ backgroundColor: PRIMARY }} />
                <div className="px-3 pb-3">
                  <div className="flex items-end gap-2 -mt-5 mb-1">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-base font-bold border-2 border-white shadow shrink-0" style={{ backgroundColor: PRIMARY }}>
                      VC
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-tight pb-0.5">Votre commerce</div>
                  </div>
                </div>
              </div>

              {/* Empty state */}
              {!hasAny && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-6 flex flex-col items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Star className="h-4 w-4 text-gray-300" />
                  </div>
                  <p className="text-[10px] text-gray-300 text-center">Activez un module pour voir l&apos;aperçu</p>
                </div>
              )}

              {/* Orders block */}
              {modules.orders && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <Box className="h-3 w-3 text-gray-500" />
                    <span className="text-[11px] font-semibold text-gray-700">Mes commandes</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-2">
                    {/* Fake order */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-800">CMD-042</p>
                        <p className="text-[10px] text-gray-400">En cours de préparation</p>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                        En attente
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Appointments block */}
              {modules.appointments && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <CalendarDays className="h-3 w-3 text-gray-500" />
                    <span className="text-[11px] font-semibold text-gray-700">Mes rendez-vous</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    {/* Fake appointment */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-800">Vendredi 14 mars</p>
                        <p className="text-[10px] text-gray-400">10h00 · Confirmé</p>
                      </div>
                      <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}15` }}>
                        <CalendarDays className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Loyalty block */}
              {modules.loyalty && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-[11px] font-semibold text-gray-700">Ma fidélité</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold" style={{ color: PRIMARY }}>60 pts</span>
                      <span className="text-gray-400">Prochain palier à 100 pts</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '60%', backgroundColor: PRIMARY }} />
                    </div>
                    <div className="space-y-1 pt-0.5">
                      {[
                        { pts: 100, label: 'Café offert', reached: false },
                        { pts: 250, label: '-10% sur la prochaine visite', reached: false },
                      ].map((tier, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: '#d1d5db' }}>
                            <Lock className="h-1.5 w-1.5 text-gray-300" />
                          </div>
                          <span>{tier.pts} pts — {tier.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-center text-[9px] text-gray-300">Propulsé par LoyaPing</p>
            </div>
          </div>

          {/* Home bar */}
          <div className="h-5 bg-gray-800 flex items-center justify-center">
            <div className="w-20 h-1 bg-gray-600 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Module cards config ───────────────────────────────────────────────────────

type ModuleKey = 'orders' | 'appointments' | 'loyalty'

const MODULES: {
  key:      ModuleKey
  icon:     React.ElementType
  title:    string
  desc:     string
  examples: string
  note?:    string
}[] = [
  {
    key:      'orders',
    icon:     Box,
    title:    'Commandes',
    desc:     'Prévenez vos clients quand leur commande est prête.',
    examples: 'Idéal pour pressing, restaurants à emporter, pâtisseries, fleuristes, boutiques de retouches.',
  },
  {
    key:      'appointments',
    icon:     CalendarDays,
    title:    'Rendez-vous',
    desc:     'Réduisez les absences grâce aux rappels automatiques.',
    examples: 'Parfait pour salons de coiffure, cabinets médicaux, esthéticiennes, coachs sportifs, consultants.',
  },
  {
    key:      'loyalty',
    icon:     Star,
    title:    'Fidélité',
    desc:     'Récompensez vos clients et augmentez leur retour.',
    examples: 'Offrez un café, une réduction ou une séance gratuite à vos clients les plus fidèles.',
    note:     'Incitez-les à revenir pour débloquer des récompenses encore plus intéressantes.',
  },
]

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function OnboardingStep2() {
  const router = useRouter()

  const [enabled, setEnabled] = useState<Record<ModuleKey, boolean>>({
    orders:       false,
    appointments: false,
    loyalty:      false,
  })
  const [saving, setSaving] = useState(false)

  const toggle = (key: ModuleKey) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))

  const anyEnabled = Object.values(enabled).some(Boolean)

  const handleContinue = async () => {
    if (!anyEnabled) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/modules', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          orders_enabled:       enabled.orders,
          appointments_enabled: enabled.appointments,
          loyalty_enabled:      enabled.loyalty,
        }),
      }).then((r) => r.json())

      if (res.error) { toast.error(res.error); return }
      if (enabled.orders)        router.push('/onboarding/step-3')
      else if (enabled.appointments) router.push('/onboarding/step-4')
      else                       router.push('/onboarding/step-5')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => router.push('/onboarding')}>
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape 2 sur 5</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: '40%' }} />
        </div>
        <Button size="sm" disabled={!anyEnabled || saving} onClick={handleContinue} className="shrink-0">
          {saving ? 'Enregistrement…' : 'Continuer →'}
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex justify-center px-8">
        <div className="w-full max-w-[1100px] h-full">
          <div className="grid grid-cols-[1fr_480px] gap-16 h-full">

            {/* ── LEFT: Live Preview — fixed, vertically centered ──────── */}
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Aperçu du portail client
              </h2>
              <MobilePreview modules={enabled} />
              <p className="text-center text-xs text-muted-foreground">
                Voici ce que verront vos clients selon les modules actifs.
              </p>
            </div>

            {/* ── RIGHT: Form — scrollable ───────────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-6 pr-1">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Choisissez comment développer votre activité
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Activez un ou plusieurs modules selon votre façon de travailler.
                  Vous pourrez les modifier plus tard.
                </p>
              </div>

              {/* Module cards */}
              <div className="space-y-3">
                {MODULES.map(({ key, icon: Icon, title, desc, examples, note }) => {
                  const active = enabled[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      className={`w-full text-left rounded-xl border-2 p-5 transition-all duration-150 flex items-start gap-4 ${
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      {/* Icon */}
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        active ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        {active
                          ? <Check className="h-5 w-5 text-primary" />
                          : <Icon className="h-5 w-5 text-muted-foreground" />
                        }
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className={`text-sm font-semibold leading-tight ${active ? 'text-primary' : 'text-foreground'}`}>
                          {title}
                        </p>
                        <p className="text-sm text-foreground">{desc}</p>
                        <p className="text-xs text-muted-foreground">{examples}</p>
                        {note && <p className="text-xs text-muted-foreground italic">{note}</p>}
                      </div>

                      {/* Toggle */}
                      <div className="shrink-0 mt-0.5 pointer-events-none">
                        <Toggle checked={active} />
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Helper */}
              {!anyEnabled && (
                <p className="text-xs text-muted-foreground text-center">
                  Veuillez activer au moins un module pour continuer.
                </p>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
