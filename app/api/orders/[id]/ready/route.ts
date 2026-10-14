/**
 * PATCH /api/orders/:id/ready
 *
 * Hybrid outbox flow:
 *   1. Marks the order as ready in the DB.
 *   2. Cancels any existing SCHEDULED order_ready outbox entry for this order.
 *   3. Inserts a new SCHEDULED entry with send_at = now() + 60 s (cron fallback).
 *   4. Returns { scheduledMessageId, fallbackSendAt, cancelWindowSeconds: 10 }
 *      so the UI can:
 *        a) Start a 10-second countdown toast.
 *        b) After 10 s call POST /api/scheduled-messages/:id/send-now (immediate).
 *        c) If user cancels within 10 s call POST /api/scheduled-messages/:id/cancel.
 *
 * If a message is currently PROCESSING (being sent by a concurrent worker)
 * for this order, the endpoint returns 409 — the order should not be
 * double-notified.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  cancelExistingScheduledForEntity,
  createScheduledMessage,
} from '@/lib/services/outbox'
import { Orders } from '@/lib/posthog/orders'
import { getBusinessName, greetingName, waTemplate } from '@/lib/whatsapp/templates'

const DEFAULT_BUSINESS_ID =
  process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// Seconds before the cron fallback fires.
const FALLBACK_DELAY_SECONDS = 60
// Seconds the UI shows in the cancel countdown.
const CANCEL_WINDOW_SECONDS = 10

type Params = { params: Promise<{ id: string }> }

export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const { id: orderId } = await params
    const db = createServerClient()

    // ── 1. Fetch the order + client phone ─────────────────────────────────
    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('id, status, reference, business_id, client:clients(phone_number, first_name, last_name, civility)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const client = order.client as unknown as { phone_number: string | null; first_name: string | null; last_name: string | null; civility: string | null } | null

    // ── 2. Guard: reject if a message is currently being sent ─────────────
    const { data: processing } = await db
      .from('scheduled_messages')
      .select('id')
      .eq('entity_type',  'order')
      .eq('entity_id',    orderId)
      .eq('message_type', 'order_ready')
      .eq('status',       'PROCESSING')
      .maybeSingle()

    if (processing) {
      return NextResponse.json(
        { error: 'A notification is currently being sent for this order' },
        { status: 409 },
      )
    }

    // ── 3. Mark order as ready ────────────────────────────────────────────
    const { error: updateErr } = await db
      .from('orders')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('id', orderId)

    if (updateErr) throw updateErr

    // Client without phone: the order is ready, but there is nobody to notify
    if (!client?.phone_number) {
      Orders.orderReadyMarked({ order_id: orderId })
      return NextResponse.json({ data: { scheduledMessageId: null, mode: 'no_phone' } })
    }

    // ── 4. Build WhatsApp message body ────────────────────────────────────
    const { data: notifSettings } = await db
      .from('order_notification_settings')
      .select('ready_message')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    const ref = (order.reference as string | null) ?? ''
    const rawTemplate =
      notifSettings?.ready_message ??
      `Bonjour ! Votre commande${ref ? ` #${ref}` : ''} est prête. Vous pouvez venir la récupérer. Merci !`
    const body = rawTemplate
      .replace(/#{reference}/g,   ref)
      .replace(/\{\{civilite\}\}/gi, client?.civility   ?? '')
      .replace(/\{\{prenom\}\}/gi,   client?.first_name ?? '')
      .replace(/\{\{nom\}\}/gi,      client?.last_name  ?? '')

    // ── 5. Cancel any existing SCHEDULED message for this order ───────────
    await cancelExistingScheduledForEntity('order', orderId, 'order_ready')

    // ── 6. Create the outbox record (60 s fallback) ───────────────────────
    const sendAt = new Date(Date.now() + FALLBACK_DELAY_SECONDS * 1_000)

    const msg = await createScheduledMessage({
      entityType:  'order',
      entityId:    orderId,
      messageType: 'order_ready',
      to:          client.phone_number,
      body,
      sendAt,
      template: waTemplate('order_ready', [greetingName(client), ref, await getBusinessName(DEFAULT_BUSINESS_ID)]),
    })

    Orders.orderReadyMarked({ order_id: orderId })
    Orders.notificationSent({ order_id: orderId, reminder_number: 0, message_type: 'ready' })

    return NextResponse.json({
      data: {
        scheduledMessageId:  msg.id,
        fallbackSendAt:      msg.send_at,
        cancelWindowSeconds: CANCEL_WINDOW_SECONDS,
        mode:                'hybrid',
      },
    })
  } catch (err) {
    // Surface outbox conflict as 409
    if ((err as { code?: string }).code === 'OUTBOX_CONFLICT') {
      return NextResponse.json({ error: String(err) }, { status: 409 })
    }
    console.error('[orders/ready]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
