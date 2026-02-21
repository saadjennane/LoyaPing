import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Appointment, Client, ReminderConfig } from '@/lib/types'

// =========================================
// PROCESS DUE REMINDERS
// Called by cron job (e.g., every minute via /api/jobs/reminders)
// =========================================
export async function processDueReminders(): Promise<{ sent: number; errors: number }> {
  const db = createServerClient()

  const now = new Date()

  // Fetch all active reminder configs
  const { data: configs } = await db
    .from('reminder_configs')
    .select('*')
    .eq('is_active', true)

  if (!configs || configs.length === 0) return { sent: 0, errors: 0 }

  let sent = 0
  let errors = 0

  for (const config of configs as ReminderConfig[]) {
    // Find scheduled appointments that need this reminder
    // Reminder should fire when: now >= scheduled_at - offset_minutes
    // AND it hasn't been sent yet
    const cutoffTime = new Date(now.getTime() + config.offset_minutes * 60 * 1000)

    const { data: appointments } = await db
      .from('appointments')
      .select('*, client:clients(*)')
      .eq('business_id', config.business_id)
      .eq('status', 'scheduled')
      .lte('scheduled_at', cutoffTime.toISOString())
      .gte('scheduled_at', now.toISOString()) // don't send reminders for past appointments

    if (!appointments) continue

    for (const appt of appointments as (Appointment & { client: Client })[]) {
      // Check if already sent
      const { data: existingSend } = await db
        .from('reminder_sends')
        .select('id')
        .eq('appointment_id', appt.id)
        .eq('reminder_config_id', config.id)
        .maybeSingle()

      if (existingSend) continue // already sent

      try {
        await sendWhatsAppMessage({
          to: appt.client.phone_number,
          text: config.message,
        })

        await db.from('reminder_sends').insert({
          appointment_id: appt.id,
          reminder_config_id: config.id,
        })

        sent++
      } catch (err) {
        console.error(`[reminders] Failed to send reminder for appt ${appt.id}:`, err)
        errors++
      }
    }
  }

  return { sent, errors }
}
