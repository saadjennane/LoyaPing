'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * Shown where a WhatsApp message cannot be sent. Hover shows the reason
 * (e.g. "Numéro manquant" for a client without phone number).
 */
export default function WhatsAppErrorBadge({ reason = 'Numéro manquant', compact = false }: { reason?: string; compact?: boolean }) {
  return (
    <span
      title={reason}
      aria-label={`Erreur WhatsApp : ${reason}`}
      className={`inline-flex items-center gap-1 font-medium text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 rounded-full cursor-help ${
        compact ? 'text-[10px] px-1.5 py-0' : 'text-xs px-3 py-1'
      }`}
    >
      <AlertTriangle className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />Erreur WhatsApp
    </span>
  )
}
