import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Order, OrderNotificationSettings } from '@/lib/types'
import { Orders } from '@/lib/posthog/orders'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

function delayMs(value: number, unit: string): number {
  if (unit === 'minutes') return value * 60_000
  if (unit === 'hours') return value * 3_600_000
  return value * 86_400_000 // days
}

function interpolate(template: string, reference: string): string {
  return template.replace(/#{reference}/g, reference)
}

// GET /api/jobs/order-reminders?secret=CRON_SECRET
// Run every minute via cron
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = createServerClient()
    const now = new Date()

    // Fetch all ready orders with clients
    const { data: orders, error: ordersError } = await db
      .from('orders')
      .select('*, client:clients(phone_number)')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .eq('status', 'ready')
      .not('ready_at', 'is', null) // only orders where ready notification was sent
      .is('deleted_at', null)

    if (ordersError) throw ordersError
    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, timestamp: now.toISOString() })
    }

    // Fetch notification settings
    const { data: settings } = await db
      .from('order_notification_settings')
      .select('*')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    if (!settings) {
      return NextResponse.json({ ok: true, sent: 0, note: 'No notification settings', timestamp: now.toISOString() })
    }

    const notifSettings = settings as OrderNotificationSettings

    const reminders = [
      {
        num: 1,
        enabled:    notifSettings.reminder1_enabled,
        delayValue: notifSettings.reminder1_delay_value,
        delayUnit:  notifSettings.reminder1_delay_unit,
        message:    notifSettings.reminder1_message,
        sentField:  'reminder1_sent_at' as keyof Order,
      },
      {
        num: 2,
        enabled:    notifSettings.reminder2_enabled,
        delayValue: notifSettings.reminder2_delay_value,
        delayUnit:  notifSettings.reminder2_delay_unit,
        message:    notifSettings.reminder2_message,
        sentField:  'reminder2_sent_at' as keyof Order,
      },
      {
        num: 3,
        enabled:    notifSettings.reminder3_enabled,
        delayValue: notifSettings.reminder3_delay_value,
        delayUnit:  notifSettings.reminder3_delay_unit,
        message:    notifSettings.reminder3_message,
        sentField:  'reminder3_sent_at' as keyof Order,
      },
    ]

    let totalSent = 0

    for (const order of orders as Order[]) {
      const readySentAt = order.ready_at
      if (!readySentAt) continue

      const readyMs = new Date(readySentAt).getTime()
      const client = order.client as { phone_number: string } | undefined
      if (!client?.phone_number) continue

      for (const reminder of reminders) {
        if (!reminder.enabled) continue
        if (!reminder.message.trim()) continue

        // Already sent?
        const alreadySent = order[reminder.sentField]
        if (alreadySent) continue

        // Enforce order: reminder N requires reminder N-1 to have been sent
        if (reminder.num === 2 && !order.reminder1_sent_at) continue
        if (reminder.num === 3 && !order.reminder2_sent_at) continue

        // Time threshold reached?
        const threshold = readyMs + delayMs(reminder.delayValue, reminder.delayUnit)
        if (now.getTime() < threshold) continue

        // Send
        const text = interpolate(reminder.message, order.reference ?? '')
        const reminderNum = reminder.num as 1 | 2 | 3
        let success = false
        let sendError = ''
        try {
          const result = await sendWhatsAppMessage({ to: client.phone_number, text })
          success = result.success
        } catch (err) {
          success = false
          sendError = String(err)
        }

        if (success) {
          Orders.notificationSent({ order_id: order.id, reminder_number: reminderNum, message_type: 'reminder' })
        } else {
          Orders.notificationFailed({ order_id: order.id, reminder_number: reminderNum, message_type: 'reminder', error: sendError })
        }

        if (success) {
          const sentAt = now.toISOString()
          await db.from('orders').update({
            [`reminder${reminder.num}_sent_at`]: sentAt,
            reminders_count: (order.reminders_count ?? 0) + 1,
          }).eq('id', order.id)

          // Update local object so next reminder in loop sees updated state
          ;(order as Record<string, unknown>)[`reminder${reminder.num}_sent_at`] = sentAt
          order.reminders_count = (order.reminders_count ?? 0) + 1
          totalSent++
        }

        // Only send one reminder per order per cron run
        break
      }
    }

    return NextResponse.json({ ok: true, sent: totalSent, timestamp: now.toISOString() })
  } catch (err) {
    console.error('[cron/order-reminders] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
