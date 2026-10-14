'use client'

import { BellOff, MessageCircle } from 'lucide-react'

/**
 * On/off switch for WhatsApp messages (appointment or client level).
 * `lockedReason` shows the switch disabled with an explanation (e.g. the
 * client disabled WhatsApp, so the appointment-level switch has no effect).
 */
export default function WhatsAppToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  lockedReason,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
  disabled?: boolean
  lockedReason?: string | null
}) {
  const locked = !!lockedReason
  const on = checked && !locked
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      {on
        ? <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
        : <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{lockedReason ?? description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || locked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          on ? 'bg-green-500' : 'bg-muted-foreground/30'
        }`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}
