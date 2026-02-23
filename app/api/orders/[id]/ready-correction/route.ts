/**
 * POST /api/orders/:id/ready-correction
 *
 * Queues a correction/apology message via the outbox so it benefits from
 * the same retry/audit guarantees as any other WhatsApp notification.
 *
 * Body (all optional):
 *   {
 *     mode?:       'apology_only' | 'apology_and_revert'  (default: 'apology_only')
 *     customText?: string  — overrides the default apology text
 *   }
 *
 * mode='apology_only'       — sends message, order status unchanged
 * mode='apology_and_revert' — sends message AND sets order back to pending
 *
 * The correction message (message_type='order_ready_correction') goes into
 * scheduled_messages with send_at=now() so the cron worker dispatches it
 * within the next minute at most. The UI may also call send-now on the
 * returned scheduledMessageId for immediate dispatch.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createScheduledMessage } from '@/lib/services/outbox'

const DEFAULT_BUSINESS_ID =
  process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: orderId } = await params

    const body = await req.json().catch(() => ({}))
    const mode       = (body.mode as string | undefined) ?? 'apology_only'
    const customText = body.customText as string | undefined

    const db = createServerClient()

    // ── 1. Fetch order + client phone ─────────────────────────────────────
    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('id, reference, status, client:clients(phone_number)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const client = order.client as unknown as { phone_number: string } | null
    if (!client?.phone_number) {
      return NextResponse.json(
        { error: 'Order has no associated client phone number' },
        { status: 422 },
      )
    }

    // ── 2. Build apology text ─────────────────────────────────────────────
    const ref = (order.reference as string | null) ?? ''

    // Check if business has a custom correction message configured.
    const { data: notifSettings } = await db
      .from('order_notification_settings')
      .select('correction_message')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .maybeSingle()

    const defaultText =
      `Bonjour ! Nous vous prions de nous excuser` +
      (ref ? ` pour la commande #${ref}` : '') +
      `. Elle n'est pas encore prête. Nous vous préviendrons dès qu'elle sera disponible. Merci de votre compréhension !`

    const messageBody =
      customText ??
      (notifSettings as Record<string, string> | null)?.correction_message ??
      defaultText

    // ── 3. Optionally revert order ────────────────────────────────────────
    if (mode === 'apology_and_revert') {
      await db
        .from('orders')
        .update({ status: 'pending', ready_at: null })
        .eq('id', orderId)
    }

    // ── 4. Queue correction message in outbox ─────────────────────────────
    // send_at=now() → dispatched by the cron within the next minute.
    // message_type is distinct so it doesn't conflict with order_ready entries.
    const msg = await createScheduledMessage({
      entityType:  'order',
      entityId:    orderId,
      messageType: 'order_ready_correction',
      to:          client.phone_number,
      body:        messageBody,
      sendAt:      new Date(),
    })

    return NextResponse.json({
      data: {
        scheduledMessageId: msg.id,
        mode,
      },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'OUTBOX_CONFLICT') {
      // A correction message is already queued for this order — idempotent.
      return NextResponse.json(
        { error: 'A correction message is already scheduled for this order' },
        { status: 409 },
      )
    }
    console.error('[orders/ready-correction]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
