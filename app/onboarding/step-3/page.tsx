'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

// ─── Types ────────────────────────────────────────────────────────────────────

type DelayUnit = 'hours' | 'days'

type Reminder = {
  enabled:    boolean
  message:    string
  delayValue: number
  delayUnit:  DelayUnit
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

// ─── WhatsApp Preview ─────────────────────────────────────────────────────────

function renderMsg(text: string, businessName: string): string {
  return (
    text
      .replace(/\{businessName\}/g, businessName || 'votre commerce')
      .replace(/#{reference}/g, 'CMD-042')
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

function formatDelay(val: number, unit: DelayUnit): string {
  return unit === 'hours'
    ? `${val} heure${val > 1 ? 's' : ''} plus tard`
    : `${val} jour${val > 1 ? 's' : ''} plus tard`
}

type PreviewProps = {
  businessName:  string
  readyMsg:      string
  reminders:     Reminder[]
  correctionMsg: string
}

function WhatsAppPreview({ businessName, readyMsg, reminders, correctionMsg }: PreviewProps) {
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
            {/* Generic WhatsApp header — no business name */}
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
              <WaSeparator label="Aujourd'hui" />

              {/* 1. Ready message */}
              <WaBubble text={renderMsg(readyMsg, businessName)} time="10:30" />

              {/* 2–4. Reminders (only when enabled) */}
              {reminders.map((r, i) =>
                r.enabled ? (
                  <div key={i} className="space-y-2">
                    <WaSeparator label={formatDelay(r.delayValue, r.delayUnit)} />
                    <WaBubble text={renderMsg(r.message || '…', businessName)} time="12:30" />
                  </div>
                ) : null
              )}

              {/* 5. Correction message */}
              <div className="space-y-1 pt-1">
                <p className="text-[9px] text-gray-400 text-center">— Message de correction —</p>
                <WaBubble text={renderMsg(correctionMsg, businessName)} time="11:00" />
              </div>
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
      {/* Header row: toggle + label + remove */}
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
          onChange={(e) => onChange({ ...reminder, delayUnit: e.target.value as DelayUnit })}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="hours">heures</option>
          <option value="days">jours</option>
        </select>
        <span className="text-xs text-muted-foreground shrink-0">après la notification &quot;prête&quot;</span>
      </div>

      {/* Message textarea */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Message du rappel</Label>
        <textarea
          rows={3}
          value={reminder.message}
          onChange={(e) => onChange({ ...reminder, message: e.target.value })}
          placeholder="Votre message de rappel…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>
    </div>
  )
}

// ─── Reminder defaults ────────────────────────────────────────────────────────

const REMINDER_DEFAULTS: Reminder[] = [
  {
    enabled:    true,
    message:    'Rappel : votre commande est toujours disponible. Venez la récupérer dès que possible.',
    delayValue: 2,
    delayUnit:  'hours',
  },
  {
    enabled:    true,
    message:    '',
    delayValue: 24,
    delayUnit:  'hours',
  },
  {
    enabled:    true,
    message:    '',
    delayValue: 48,
    delayUnit:  'hours',
  },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingStep3() {
  const router = useRouter()

  const [businessName,  setBusinessName]  = useState('')
  const [readyMsg,      setReadyMsg]      = useState(
    'Bonjour, votre commande chez votre commerce est prête. Vous pouvez venir la récupérer.'
  )
  const [reminders,     setReminders]     = useState<Reminder[]>([])
  const [correctionMsg, setCorrectionMsg] = useState(
    "Désolé, il s'agit d'une erreur : votre commande chez votre commerce n'est pas encore prête. Nous vous recontacterons dès que possible."
  )
  const [saving,      setSaving]      = useState(false)
  const [nextStep,    setNextStep]    = useState('/onboarding/step-4')
  const [stepTotal,   setStepTotal]   = useState(5)
  const redirected = useRef(false)

  // Guard: skip this step if Commandes was not enabled in step 2
  useEffect(() => {
    fetch('/api/settings/modules')
      .then((r) => r.json())
      .then(({ data }) => {
        const numModules = [data?.orders_enabled, data?.appointments_enabled, data?.loyalty_enabled].filter(Boolean).length
        setStepTotal(4 + numModules)
        if (!data?.orders_enabled && !redirected.current) {
          redirected.current = true
          router.replace(
            data?.appointments_enabled ? '/onboarding/step-4' :
            data?.loyalty_enabled      ? '/onboarding/step-5' :
                                         '/onboarding/step-6'
          )
        }
        setNextStep(
          data?.appointments_enabled ? '/onboarding/step-4' :
          data?.loyalty_enabled      ? '/onboarding/step-5' :
                                       '/onboarding/step-6'
        )
      })
      .catch(() => {})
  }, [router])

  // Reload saved data if previously configured
  useEffect(() => {
    fetch('/api/settings/order-notifications')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data?.updated_at) return // not yet saved — keep business-name defaults
        setReadyMsg(data.ready_message)
        setCorrectionMsg(data.order_ready_correction_template)
        const loaded: Reminder[] = []
        for (const n of [1, 2, 3] as const) {
          const msg: string     = data[`reminder${n}_message`]    ?? ''
          const enabled: boolean = data[`reminder${n}_enabled`]   ?? false
          if (msg.trim() || enabled) {
            loaded.push({
              enabled,
              message:    msg,
              delayValue: data[`reminder${n}_delay_value`] ?? 2,
              delayUnit:  (data[`reminder${n}_delay_unit`] ?? 'hours') as DelayUnit,
            })
          }
        }
        if (loaded.length > 0) setReminders(loaded)
      })
      .catch(() => {})
  }, [])

  // Fetch business name from step 1 to personalise default messages
  useEffect(() => {
    fetch('/api/settings/profile')
      .then((r) => r.json())
      .then(({ data }) => {
        const name: string = data?.name?.trim() || ''
        if (name) {
          setBusinessName(name)
          setReadyMsg(
            `Bonjour, votre commande chez ${name} est prête. Vous pouvez venir la récupérer.`
          )
          setCorrectionMsg(
            `Désolé, il s'agit d'une erreur : votre commande chez ${name} n'est pas encore prête. Nous vous recontacterons dès que possible.`
          )
        }
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

  const isValid = readyMsg.trim().length > 0 && correctionMsg.trim().length > 0

  const handleContinue = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const body = {
        ready_message:                   readyMsg,
        reminder1_enabled:               reminders[0]?.enabled    ?? false,
        reminder1_delay_value:           reminders[0]?.delayValue ?? 2,
        reminder1_delay_unit:            reminders[0]?.delayUnit  ?? 'hours',
        reminder1_message:               reminders[0]?.message    ?? '',
        reminder2_enabled:               reminders[1]?.enabled    ?? false,
        reminder2_delay_value:           reminders[1]?.delayValue ?? 24,
        reminder2_delay_unit:            reminders[1]?.delayUnit  ?? 'hours',
        reminder2_message:               reminders[1]?.message    ?? '',
        reminder3_enabled:               reminders[2]?.enabled    ?? false,
        reminder3_delay_value:           reminders[2]?.delayValue ?? 48,
        reminder3_delay_unit:            reminders[2]?.delayUnit  ?? 'hours',
        reminder3_message:               reminders[2]?.message    ?? '',
        order_ready_correction_template: correctionMsg,
      }
      const res = await fetch('/api/settings/order-notifications', {
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
          onClick={() => router.push('/onboarding/step-2')}
        >
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape 3 sur {stepTotal}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(3 / stepTotal) * 100}%` }} />
        </div>
        <Button size="sm" disabled={!isValid || saving} onClick={handleContinue} className="shrink-0">
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
                Aperçu de la conversation WhatsApp
              </h2>
              <WhatsAppPreview
                businessName={businessName}
                readyMsg={readyMsg}
                reminders={reminders}
                correctionMsg={correctionMsg}
              />
              <p className="text-center text-xs text-muted-foreground">
                L&apos;aperçu se met à jour en temps réel.
              </p>
            </div>

            {/* ── RIGHT: Form — scrollable ───────────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-8 pr-1">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Configurez vos messages de commande
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ces messages seront envoyés quand vous marquez une commande comme prête,
                  en cas de rappel, ou de correction d&apos;erreur.
                </p>
              </div>

              {/* ── Section 1 : Message "Commande prête" ─────────────── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Commande prête
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="ready-msg">
                    Message lorsque la commande est prête{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <textarea
                    id="ready-msg"
                    rows={4}
                    value={readyMsg}
                    onChange={(e) => setReadyMsg(e.target.value)}
                    className={`w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none ${
                      !readyMsg.trim() ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Envoyé quand vous cliquez sur &quot;Prête&quot;. Utilisez{' '}
                    <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{'#{reference}'}</code>{' '}
                    pour inclure le numéro de commande.
                  </p>
                </div>
              </div>

              {/* ── Section 2 : Rappels ───────────────────────────────── */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rappels{' '}
                    <span className="font-normal normal-case text-muted-foreground">(optionnel)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajoutez jusqu&apos;à 3 rappels si le client ne vient pas récupérer sa commande.
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

              {/* ── Section 3 : Message de correction ────────────────── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Message en cas d&apos;erreur
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="correction-msg">
                    Message envoyé si la commande a été marquée prête par erreur{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <textarea
                    id="correction-msg"
                    rows={4}
                    value={correctionMsg}
                    onChange={(e) => setCorrectionMsg(e.target.value)}
                    className={`w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none ${
                      !correctionMsg.trim() ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisable si vous corrigez un statut marqué par erreur.
                  </p>
                </div>
              </div>

              {/* Note */}
              <p className="text-xs text-muted-foreground text-center pb-2">
                Vous pourrez modifier ces messages plus tard dans les paramètres.
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
