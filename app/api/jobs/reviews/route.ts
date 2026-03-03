import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppButtons } from '@/lib/services/whatsapp'
import { REVIEW_BTN_POSITIVE, REVIEW_BTN_NEGATIVE } from '@/lib/services/clients'
import { Reviews } from '@/lib/posthog/reviews'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// How long before we can re-ask a client who already answered or ignored
const COOLDOWN_DAYS = 30

// GET /api/jobs/reviews — run hourly via cron
// Sends review request to eligible clients + handles reminders
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createServerClient()
    const now = new Date()

    // 1. Fetch review settings
    const { data: settings } = await db
      .from('review_settings')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (!settings?.is_active) {
      return NextResponse.json({ ok: true, sent: 0, note: 'Reviews module inactive' })
    }

    const {
      min_interactions,
      delay_after_interaction_hours,
      satisfaction_message,
      reminder_enabled,
      reminder_delay_hours,
    } = settings

    // 2. Candidates: clients who haven't given a positive response
    //    and weren't asked in the last COOLDOWN_DAYS
    const cooldownThreshold = new Date(
      now.getTime() - COOLDOWN_DAYS * 86_400_000
    ).toISOString()

    const { data: clients, error: clientsError } = await db
      .from('clients')
      .select('id, first_name, phone_number, last_review_request_at, review_reminder_sent, review_intent')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .not('phone_number', 'is', null)
      .or(`review_intent.is.null,review_intent.eq.false`)
      .or(`last_review_request_at.is.null,last_review_request_at.lt.${cooldownThreshold}`)

    if (clientsError) throw clientsError
    if (!clients || clients.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reminders: 0, timestamp: now.toISOString() })
    }

    const delayThreshold = new Date(
      now.getTime() - delay_after_interaction_hours * 3_600_000
    ).toISOString()

    let totalSent = 0
    let totalReminders = 0

    for (const client of clients) {
      try {
        // ── Reminder path ────────────────────────────────────────────────
        // Client was already asked but hasn't responded — send reminder once
        if (
          reminder_enabled &&
          client.last_review_request_at &&
          !client.review_reminder_sent &&
          !client.review_intent
        ) {
          const reminderThreshold = new Date(
            new Date(client.last_review_request_at).getTime() + reminder_delay_hours * 3_600_000
          ).toISOString()

          if (now.toISOString() >= reminderThreshold) {
            const name = client.first_name ?? ''
            const body = satisfaction_message.replace(/\{name\}/g, name)

            await sendWhatsAppButtons({
              to: client.phone_number,
              body,
              buttons: [
                { id: REVIEW_BTN_POSITIVE, title: '👍 Oui' },
                { id: REVIEW_BTN_NEGATIVE, title: '👎 Non' },
              ],
            })

            await db.from('reviews_events').insert({
              business_id: DEFAULT_BUSINESS_ID,
              client_id: client.id,
              type: 'reminder_sent',
            })

            await db.from('clients')
              .update({ review_reminder_sent: true })
              .eq('id', client.id)

            Reviews.requestSent({
              client_id: client.id,
              related_order_or_appointment_id: null,
              estimated_message_cost: null,
            })

            totalReminders++
            continue
          }
        }

        // Already asked — skip unless cooldown passed (handled by query above)
        if (client.last_review_request_at) continue

        // ── New request path ─────────────────────────────────────────────
        // Count completed interactions
        const [ordersRes, apptsRes] = await Promise.all([
          db.from('orders')
            .select('id, updated_at')
            .eq('client_id', client.id)
            .eq('status', 'picked_up')
            .is('deleted_at', null),
          db.from('appointments')
            .select('id, scheduled_at')
            .eq('client_id', client.id)
            .eq('status', 'show')
            .is('deleted_at', null),
        ])

        const totalInteractions =
          (ordersRes.data?.length ?? 0) + (apptsRes.data?.length ?? 0)

        if (totalInteractions < min_interactions) continue

        // Most recent completed interaction must be old enough
        const timestamps = [
          ...(ordersRes.data ?? []).map((o) => o.updated_at),
          ...(apptsRes.data ?? []).map((a) => a.scheduled_at),
        ].filter(Boolean).sort().reverse()

        if (!timestamps[0] || timestamps[0] > delayThreshold) continue

        // Send the satisfaction message with interactive buttons
        const name = client.first_name ?? ''
        const body = satisfaction_message.replace(/\{name\}/g, name)

        await sendWhatsAppButtons({
          to: client.phone_number,
          body,
          buttons: [
            { id: REVIEW_BTN_POSITIVE, title: '👍 Oui' },
            { id: REVIEW_BTN_NEGATIVE, title: '👎 Non' },
          ],
        })

        await db.from('reviews_events').insert({
          business_id: DEFAULT_BUSINESS_ID,
          client_id: client.id,
          type: 'request_sent',
        })

        await db.from('clients')
          .update({
            last_review_request_at: now.toISOString(),
            review_reminder_sent: false,
          })
          .eq('id', client.id)

        Reviews.requestSent({
          client_id: client.id,
          related_order_or_appointment_id: null,
          estimated_message_cost: null,
        })

        totalSent++
      } catch (err) {
        console.error(`[cron/reviews] Error for client ${client.id}:`, err)
      }
    }

    return NextResponse.json({
      ok: true,
      sent: totalSent,
      reminders: totalReminders,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[cron/reviews] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
