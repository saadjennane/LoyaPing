import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { UrgentEventType } from '@/lib/types'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

const MESSAGES: Record<UrgentEventType, string> = {
  reschedule:      '⚠️ Un client souhaite replanifier son rendez-vous.\nOuvrez LoyaPing pour traiter cette demande.',
  negative_review: '❌ Nouveau retour client négatif reçu.\nOuvrez LoyaPing pour consulter.',
}

/**
 * Records an urgent event and, if notifications are enabled, sends a WhatsApp
 * alert to the configured numbers (with 5-minute anti-spam grouping).
 */
export async function createAndNotifyUrgentEvent(
  type: UrgentEventType,
  entityId?: string,
  businessId: string = DEFAULT_BUSINESS_ID,
): Promise<void> {
  const db = createServerClient()

  // 1. Insert event as pending
  await db.from('urgent_events').insert({
    business_id: businessId,
    type,
    entity_id: entityId ?? null,
    status: 'pending',
  })

  // 2. Fetch urgent notification settings
  const { data: profile } = await db
    .from('business_profile')
    .select('urgent_notify_reschedule, urgent_notify_negative_review, urgent_whatsapp_number_1, urgent_whatsapp_number_2')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!profile) return

  const enabled =
    type === 'reschedule'
      ? profile.urgent_notify_reschedule
      : profile.urgent_notify_negative_review

  if (!enabled) return

  const numbers = [profile.urgent_whatsapp_number_1, profile.urgent_whatsapp_number_2].filter(Boolean) as string[]
  if (numbers.length === 0) return

  // 3. Anti-spam: if we already sent a notification in the last 5 min, skip
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recentSent } = await db
    .from('urgent_events')
    .select('id')
    .eq('business_id', businessId)
    .eq('status', 'sent')
    .gte('sent_at', fiveMinAgo)
    .limit(1)

  if (recentSent && recentSent.length > 0) {
    // A notification was already sent recently — the owner will see the badge
    return
  }

  // 4. Count all pending events (to send a grouped message if needed)
  const { count } = await db
    .from('urgent_events')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending')

  const pendingCount = count ?? 1

  const message =
    pendingCount > 1
      ? `⚠️ ${pendingCount} actions urgentes à traiter dans LoyaPing.`
      : MESSAGES[type]

  // 5. Send WhatsApp to all configured numbers
  await Promise.allSettled(
    numbers.map((to) => sendWhatsAppMessage({ to, text: message })),
  )

  // 6. Mark all pending events as sent
  await db
    .from('urgent_events')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('status', 'pending')
}
