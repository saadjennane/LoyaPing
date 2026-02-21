'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

// ─── Types ────────────────────────────────────────────────────────────────────

type DelayUnit = 'minutes' | 'hours' | 'days'

type Reminder = {
  enabled:       boolean
  message:       string
  delayValue:    number
  delayUnit:     DelayUnit
  fixedSendTime: string
}

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

// ─── Calendar logos ───────────────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M11.4 2H2v9.4h9.4V2z" fill="#F25022"/>
      <path d="M22 2h-9.4v9.4H22V2z" fill="#7FBA00"/>
      <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00A4EF"/>
      <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#FFB900"/>
    </svg>
  )
}

// ─── WhatsApp Preview ─────────────────────────────────────────────────────────

function renderMsg(text: string, businessName: string): string {
  return (
    text
      .replace(/\{businessName\}/g, businessName || 'votre commerce')
      .replace(/\{date\}/g, '12 juin')
      .replace(/\{heure\}/g, '15h00')
      .replace(/#{[^}]+}/g, '[variable]')
      .trim()
  ) || '…'
}

function WaBubble({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex justify-start">
      <div className="bg-white rounded-xl rounded-tl-none px-3 py-2 max-w-[90%] shadow-sm">
        <p className="text-gray-800 text-xs leading-relaxed whitespace-pre-wrap">{text}</p>
        <p className="text-[10px] text-gray-400 text-right mt-1">{time}</p>
      </div>
    </div>
  )
}

function WaSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="bg-white/80 text-gray-400 text-[9px] rounded-full px-2.5 py-0.5 shadow-sm italic">
        {label}
      </span>
    </div>
  )
}

function formatBefore(val: number, unit: DelayUnit): string {
  if (unit === 'minutes') return `${val} minute${val > 1 ? 's' : ''} avant le rendez-vous`
  if (unit === 'hours')   return `${val} heure${val > 1 ? 's' : ''} avant le rendez-vous`
  return `${val} jour${val > 1 ? 's' : ''} avant le rendez-vous`
}

const BUBBLE_TIMES = ['09:00', '13:00', '14:30']

function WhatsAppPreview({ businessName, reminders }: { businessName: string; reminders: Reminder[] }) {
  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] shrink-0">
        <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
          {/* Notch */}
          <div className="h-6 bg-gray-800 flex items-center justify-center">
            <div className="w-16 h-3 bg-black rounded-full" />
          </div>

          {/* Screen */}
          <div className="flex flex-col bg-[#ECE5DD]" style={{ height: 520 }}>
            {/* Generic header — no business name */}
            <div className="bg-[#075E54] flex items-center gap-2 px-3 py-2 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#128C7E] flex items-center justify-center text-white text-xs font-bold shrink-0">
                C
              </div>
              <div>
                <div className="text-white text-xs font-semibold leading-tight">Client</div>
                <div className="text-green-300 text-[10px]">Conversation</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4 space-y-2">
              <WaSeparator label="Rendez-vous · 12 juin à 15h00" />

              {reminders.every((r) => !r.enabled) && (
                <div className="flex items-center justify-center h-32">
                  <p className="text-[10px] text-gray-400 text-center px-4">
                    Ajoutez un rappel pour voir l&apos;aperçu
                  </p>
                </div>
              )}

              {reminders.map((r, i) =>
                r.enabled ? (
                  <div key={i} className="space-y-2">
                    <WaSeparator label={formatBefore(r.delayValue, r.delayUnit)} />
                    <WaBubble
                      text={renderMsg(r.message || '…', businessName)}
                      time={BUBBLE_TIMES[i] ?? '10:00'}
                    />
                  </div>
                ) : null
              )}
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

// ─── Reminder card ────────────────────────────────────────────────────────────

type ReminderCardProps = {
  index:    number
  reminder: Reminder
  onChange: (r: Reminder) => void
  onRemove: () => void
}

function ReminderCard({ index, reminder, onChange, onRemove }: ReminderCardProps) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={reminder.enabled}
            onChange={(v) => onChange({ ...reminder, enabled: v })}
          />
          <span className="text-sm font-medium">Rappel {index + 1}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Supprimer ce rappel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Delay row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">Envoyer</span>
        <Input
          type="number"
          min={1}
          value={reminder.delayValue}
          onChange={(e) => onChange({ ...reminder, delayValue: Math.max(1, Number(e.target.value)) })}
          className="h-7 w-16 text-xs text-center"
        />
        <select
          value={reminder.delayUnit}
          onChange={(e) => onChange({
            ...reminder,
            delayUnit:     e.target.value as DelayUnit,
            fixedSendTime: e.target.value === 'days' ? reminder.fixedSendTime : '',
          })}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="minutes">minutes</option>
          <option value="hours">heures</option>
          <option value="days">jours</option>
        </select>
        <span className="text-xs text-muted-foreground shrink-0">avant le rendez-vous</span>
      </div>

      {/* Fixed send time — only for days */}
      {reminder.delayUnit === 'days' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Envoyer à une heure fixe <span className="font-normal">(optionnel)</span>
          </Label>
          <Input
            type="time"
            value={reminder.fixedSendTime}
            onChange={(e) => onChange({ ...reminder, fixedSendTime: e.target.value })}
            className="h-7 w-28 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Si vide, le message sera envoyé exactement {reminder.delayValue}{' '}
            jour{reminder.delayValue > 1 ? 's' : ''} avant le rendez-vous.
          </p>
        </div>
      )}

      {/* Message */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Message du rappel</Label>
        <textarea
          rows={3}
          value={reminder.message}
          onChange={(e) => onChange({ ...reminder, message: e.target.value })}
          placeholder="Votre message de rappel…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
        <p className="text-[11px] text-muted-foreground">
          Utilisez{' '}
          <code className="bg-muted px-1 rounded text-[10px] font-mono">{'{date}'}</code>,{' '}
          <code className="bg-muted px-1 rounded text-[10px] font-mono">{'{heure}'}</code>,{' '}
          <code className="bg-muted px-1 rounded text-[10px] font-mono">{'{businessName}'}</code>{' '}
          dans votre message.
        </p>
      </div>
    </div>
  )
}

// ─── Reminder defaults ────────────────────────────────────────────────────────

const REMINDER_DEFAULTS: Reminder[] = [
  {
    enabled:       true,
    message:       'Bonjour, nous vous rappelons votre rendez-vous chez {businessName} le {date} à {heure}. À bientôt !',
    delayValue:    24,
    delayUnit:     'hours',
    fixedSendTime: '',
  },
  {
    enabled:       true,
    message:       'Rappel : votre rendez-vous chez {businessName} est le {date} à {heure}.',
    delayValue:    2,
    delayUnit:     'hours',
    fixedSendTime: '',
  },
  {
    enabled:       true,
    message:       'Dernier rappel : votre rendez-vous chez {businessName} est dans 30 minutes ({heure}).',
    delayValue:    30,
    delayUnit:     'minutes',
    fixedSendTime: '',
  },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingStep4() {
  const router = useRouter()

  const [businessName, setBusinessName] = useState('')
  const [reminders,    setReminders]    = useState<Reminder[]>([{ ...REMINDER_DEFAULTS[0] }])
  const [showCalendar, setShowCalendar] = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [prevStep,     setPrevStep]     = useState('/onboarding/step-2')
  const [nextStep,     setNextStep]     = useState('/onboarding/step-5')
  const [stepLabel,    setStepLabel]    = useState({ current: 4, total: 5 })
  const redirected = useRef(false)

  // Guard: skip this step if Rendez-vous was not enabled in step 2
  useEffect(() => {
    fetch('/api/settings/modules')
      .then((r) => r.json())
      .then(({ data }) => {
        const numModules = [data?.orders_enabled, data?.appointments_enabled, data?.loyalty_enabled].filter(Boolean).length
        const total = 4 + numModules
        const current = 3 + (data?.orders_enabled ? 1 : 0)
        setStepLabel({ current, total })
        const next = data?.loyalty_enabled ? '/onboarding/step-5' : '/onboarding/step-6'
        if (!data?.appointments_enabled && !redirected.current) {
          redirected.current = true
          router.replace(next)
        }
        setNextStep(next)
        setPrevStep(data?.orders_enabled ? '/onboarding/step-3' : '/onboarding/step-2')
      })
      .catch(() => {})
  }, [router])

  // Reload saved data if previously configured
  useEffect(() => {
    fetch('/api/settings/appointment-notifications')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data?.updated_at) return // not yet saved — keep defaults
        const loaded: Reminder[] = []
        for (const n of [1, 2, 3] as const) {
          const msg: string      = data[`reminder${n}_message`]          ?? ''
          const enabled: boolean = data[`reminder${n}_enabled`]          ?? false
          const fixedTime: string = data[`reminder${n}_fixed_send_time`] ?? ''
          if (msg.trim() || enabled) {
            loaded.push({
              enabled,
              message:       msg,
              delayValue:    data[`reminder${n}_delay_value`] ?? 24,
              delayUnit:     (data[`reminder${n}_delay_unit`] ?? 'hours') as DelayUnit,
              fixedSendTime: fixedTime,
            })
          }
        }
        if (loaded.length > 0) setReminders(loaded)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/settings/profile')
      .then((r) => r.json())
      .then(({ data }) => {
        const name: string = data?.name?.trim() || ''
        if (name) setBusinessName(name)
      })
      .catch(() => {})
  }, [])

  const addReminder = () => {
    if (reminders.length >= 3) return
    setReminders((prev) => [...prev, { ...REMINDER_DEFAULTS[prev.length] }])
  }

  const updateReminder = (idx: number, r: Reminder) =>
    setReminders((prev) => prev.map((x, i) => (i === idx ? r : x)))

  const removeReminder = (idx: number) =>
    setReminders((prev) => prev.filter((_, i) => i !== idx))

  const handleContinue = async () => {
    setSaving(true)
    try {
      const body = {
        reminder1_enabled:         reminders[0]?.enabled       ?? false,
        reminder1_delay_value:     reminders[0]?.delayValue    ?? 24,
        reminder1_delay_unit:      reminders[0]?.delayUnit     ?? 'hours',
        reminder1_fixed_send_time: reminders[0]?.fixedSendTime || null,
        reminder1_message:         reminders[0]?.message       ?? '',
        reminder2_enabled:         reminders[1]?.enabled       ?? false,
        reminder2_delay_value:     reminders[1]?.delayValue    ?? 2,
        reminder2_delay_unit:      reminders[1]?.delayUnit     ?? 'hours',
        reminder2_fixed_send_time: reminders[1]?.fixedSendTime || null,
        reminder2_message:         reminders[1]?.message       ?? '',
        reminder3_enabled:         reminders[2]?.enabled       ?? false,
        reminder3_delay_value:     reminders[2]?.delayValue    ?? 30,
        reminder3_delay_unit:      reminders[2]?.delayUnit     ?? 'minutes',
        reminder3_fixed_send_time: reminders[2]?.fixedSendTime || null,
        reminder3_message:         reminders[2]?.message       ?? '',
      }
      const res = await fetch('/api/settings/appointment-notifications', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      }).then((r) => r.json())
      if (res.error) { toast.error(res.error); return }
      router.push(nextStep)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <Button
          type="button" variant="ghost" size="sm" className="shrink-0"
          onClick={() => router.push(prevStep)}
        >
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape {stepLabel.current} sur {stepLabel.total}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(stepLabel.current / stepLabel.total) * 100}%` }} />
        </div>
        <Button size="sm" disabled={saving} onClick={handleContinue} className="shrink-0">
          {saving ? 'Enregistrement…' : 'Continuer →'}
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex justify-center px-8">
        <div className="w-full max-w-[1100px] h-full">
          <div className="grid grid-cols-[1fr_480px] gap-16 h-full">

            {/* ── LEFT: WhatsApp Preview — fixed, vertically centered ── */}
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Aperçu des rappels WhatsApp
              </h2>
              <WhatsAppPreview businessName={businessName} reminders={reminders} />
              <p className="text-center text-xs text-muted-foreground">
                L&apos;aperçu se met à jour en temps réel.
              </p>
            </div>

            {/* ── RIGHT: Form — scrollable ───────────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-8 pr-1">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Configurez vos rappels de rendez-vous
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Envoyez des rappels automatiques pour réduire les absences.
                </p>
              </div>

              {/* ── Section 1 : Calendar sync ─────────────────────────── */}
              {showCalendar ? (
                <div className="rounded-xl border p-5 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Synchronisation du calendrier{' '}
                      <span className="font-normal normal-case text-muted-foreground">(optionnel)</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connectez votre agenda pour synchroniser automatiquement vos rendez-vous.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a href="/api/calendar/google/connect">
                      <Button variant="outline" size="sm" className="gap-2">
                        <GoogleLogo />
                        Connecter Google Calendar
                      </Button>
                    </a>
                    <a href="/api/calendar/microsoft/connect">
                      <Button variant="outline" size="sm" className="gap-2">
                        <MicrosoftLogo />
                        Connecter Outlook Calendar
                      </Button>
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCalendar(false)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Ignorer pour le moment →
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Vous pourrez connecter votre agenda plus tard dans les paramètres.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Synchronisation du calendrier ignorée — configurable plus tard dans les paramètres.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCalendar(true)}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    Afficher
                  </button>
                </div>
              )}

              {/* ── Section 2 : Reminders ─────────────────────────────── */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rappels avant rendez-vous
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajoutez jusqu&apos;à 3 rappels avant le rendez-vous.
                  </p>
                </div>

                {reminders.map((r, i) => (
                  <ReminderCard
                    key={i}
                    index={i}
                    reminder={r}
                    onChange={(updated) => updateReminder(i, updated)}
                    onRemove={() => removeReminder(i)}
                  />
                ))}

                {reminders.length < 3 && (
                  <button
                    type="button"
                    onClick={addReminder}
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un rappel
                  </button>
                )}
              </div>

              {/* Note */}
              <p className="text-xs text-muted-foreground text-center pb-2">
                Vous pourrez modifier ces réglages plus tard dans les paramètres.
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
