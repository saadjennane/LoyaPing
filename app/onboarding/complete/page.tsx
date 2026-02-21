'use client'

import { useRouter } from 'next/navigation'
import { ShoppingBag, CalendarDays, Gift, ArrowRight, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OnboardingComplete() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-4 flex items-center gap-4">
        <span className="text-sm text-muted-foreground font-medium shrink-0">Configuration terminée</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: '100%' }} />
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-8 py-10">
        <div className="w-full max-w-lg text-center space-y-10">

          {/* Success icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">Votre espace est prêt !</h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Félicitations, votre commerce est configuré sur LoyaPing.
              Vous pouvez maintenant accueillir vos premiers clients.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              {
                icon: Gift,
                title: 'Programme fidélité',
                desc: 'Vos clients accumulent des points à chaque visite.',
              },
              {
                icon: ShoppingBag,
                title: 'Commandes',
                desc: 'Notifications WhatsApp automatiques à la préparation.',
              },
              {
                icon: CalendarDays,
                title: 'Rendez-vous',
                desc: 'Rappels envoyés avant chaque rendez-vous.',
              },
              {
                icon: Palette,
                title: 'Portail client',
                desc: 'Votre espace fidélité aux couleurs de votre marque.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={() => router.push('/')}
            >
              Accéder au tableau de bord
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground">
              Tous les paramètres sont modifiables à tout moment dans{' '}
              <button
                type="button"
                onClick={() => router.push('/settings/organization')}
                className="underline hover:text-foreground"
              >
                Paramètres
              </button>.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
