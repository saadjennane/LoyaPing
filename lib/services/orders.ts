import { createServerClient } from '@/lib/supabase/server'
import { creditPoints } from '@/lib/services/loyalty'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import type { Order, LoyaltyProgram } from '@/lib/types'

// Select fragment reused across queries
const ORDER_SELECT = '*, client:clients(id, civility, first_name, last_name, phone_number, magic_token), messages:order_messages(*)'

// =========================================
// MARK ORDER AS READY — schedules WhatsApp, does NOT send immediately
// Returns notificationId + scheduledFor so the client can show the Undo toast
// =========================================
export async function markOrderReady(
  orderId: string,
): Promise<{ order: Order; notificationId: string; scheduledFor: string }> {
  const db = createServerClient()

  const { data: order, error } = await db
    .from('orders')
    .update({ status: 'ready', ready_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('*, client:clients(*)')
    .single()

  if (error || !order) throw new Error('Order not found or already updated')

  // Schedule the WhatsApp send for 10 seconds from now
  const scheduledFor = new Date(Date.now() + 10_000).toISOString()

  const { data: notif, error: notifError } = await db
    .from('order_scheduled_notifications')
    .insert({
      order_id:      orderId,
      business_id:   order.business_id,
      type:          'READY',
      status:        'SCHEDULED',
      scheduled_for: scheduledFor,
    })
    .select('id')
    .single()

  if (notifError) throw notifError

  return { order: order as Order, notificationId: notif.id, scheduledFor }
}

// =========================================
// CANCEL READY NOTIFICATION — cancels scheduled send and reverts order to PENDING
// Throws if the window has already passed
// =========================================
export async function cancelReadyNotification(orderId: string): Promise<void> {
  const db = createServerClient()

  const { data: notif } = await db
    .from('order_scheduled_notifications')
    .select('id, scheduled_for')
    .eq('order_id', orderId)
    .eq('type', 'READY')
    .eq('status', 'SCHEDULED')
    .maybeSingle()

  if (!notif) throw new Error('Aucune notification annulable trouvée')

  if (new Date(notif.scheduled_for) <= new Date()) {
    throw new Error("Fenêtre d'annulation expirée — le message a déjà été programmé pour envoi")
  }

  await db
    .from('order_scheduled_notifications')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', notif.id)

  await db.from('orders').update({ status: 'pending', ready_at: null }).eq('id', orderId)
}

// =========================================
// DOWNGRADE READY → PENDING
// - Auto-cancels any still-SCHEDULED notification
// - Returns readyMessageSent so the caller can offer to send a correction
// =========================================
export async function downgradeReadyToPending(
  orderId: string,
): Promise<{ readyMessageSent: boolean }> {
  const db = createServerClient()

  // Cancel any pending SCHEDULED notification
  const { data: pendingNotif } = await db
    .from('order_scheduled_notifications')
    .select('id')
    .eq('order_id', orderId)
    .eq('type', 'READY')
    .eq('status', 'SCHEDULED')
    .maybeSingle()

  if (pendingNotif) {
    await db
      .from('order_scheduled_notifications')
      .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
      .eq('id', pendingNotif.id)
  }

  // Check whether a READY message was already SENT
  const { data: sentNotif } = await db
    .from('order_scheduled_notifications')
    .select('id')
    .eq('order_id', orderId)
    .eq('type', 'READY')
    .eq('status', 'SENT')
    .maybeSingle()

  await db.from('orders').update({ status: 'pending', ready_at: null }).eq('id', orderId)

  return { readyMessageSent: !!sentNotif }
}

// =========================================
// SEND READY CORRECTION (excuse message after erroneous READY notification)
// Uses order_ready_correction_template from business settings
// =========================================
export async function sendReadyCorrection(orderId: string): Promise<void> {
  const db = createServerClient()

  const { data: order, error } = await db
    .from('orders')
    .select('id, business_id, reference, client:clients(phone_number)')
    .eq('id', orderId)
    .single()

  if (error || !order) throw new Error('Order not found')

  const client = (
    Array.isArray(order.client) ? order.client[0] : order.client
  ) as { phone_number: string }

  const { data: settings } = await db
    .from('order_notification_settings')
    .select('order_ready_correction_template')
    .eq('business_id', order.business_id)
    .maybeSingle()

  const message =
    settings?.order_ready_correction_template ??
    "Bonjour, nous sommes désolés : une erreur s'est produite. Votre commande n'est pas encore prête. Nous vous préviendrons dès qu'elle sera disponible."

  let msgStatus: 'sent' | 'failed' = 'failed'
  let msgError: string | null = null

  try {
    const result = await sendWhatsAppMessage({ to: client.phone_number, text: message })
    if (result.success) {
      msgStatus = 'sent'
    } else {
      msgError = "Échec de l'envoi (provider)"
    }
  } catch (err) {
    msgError = String(err)
  }

  await db.from('order_messages').insert({
    order_id:      orderId,
    type:          'ready_correction',
    status:        msgStatus,
    error_message: msgError,
  })

  if (msgStatus === 'failed') {
    throw new Error(msgError ?? "Envoi du message d'excuse échoué")
  }
}

// =========================================
// PROCESS SCHEDULED READY NOTIFICATIONS (cron worker)
// Called by GET /api/jobs/order-ready-notifications every minute.
// For each SCHEDULED notif whose scheduled_for <= now:
//   - Verifies the order is still READY
//   - Sends WhatsApp if yes, marks CANCELLED if no
// =========================================
export async function processScheduledReadyNotifications(): Promise<{
  sent: number
  failed: number
  cancelled: number
}> {
  const db = createServerClient()

  const { data: notifications } = await db
    .from('order_scheduled_notifications')
    .select('id, order_id, business_id')
    .eq('type', 'READY')
    .eq('status', 'SCHEDULED')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50)

  if (!notifications || notifications.length === 0) return { sent: 0, failed: 0, cancelled: 0 }

  let sent = 0, failed = 0, cancelled = 0

  for (const notif of notifications) {
    const { data: order } = await db
      .from('orders')
      .select('id, status, reference, business_id, client:clients(phone_number)')
      .eq('id', notif.order_id)
      .single()

    if (!order || order.status !== 'ready') {
      await db
        .from('order_scheduled_notifications')
        .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
        .eq('id', notif.id)
      cancelled++
      continue
    }

    const client = (
      Array.isArray(order.client) ? order.client[0] : order.client
    ) as { phone_number: string }

    const { data: notifSettings } = await db
      .from('order_notification_settings')
      .select('ready_message')
      .eq('business_id', order.business_id)
      .maybeSingle()

    const ref = order.reference ?? ''
    const rawMsg =
      notifSettings?.ready_message ??
      `Bonjour ! Votre commande${ref ? ` #${ref}` : ''} est prête. Vous pouvez venir la récupérer. Merci !`
    const message = rawMsg.replace(/#{reference}/g, ref)

    let msgStatus: 'sent' | 'failed' = 'failed'
    let msgError: string | null = null

    try {
      const result = await sendWhatsAppMessage({ to: client.phone_number, text: message })
      if (result.success) {
        msgStatus = 'sent'
      } else {
        msgError = "Échec de l'envoi (provider)"
      }
    } catch (err) {
      msgError = String(err)
    }

    await db.from('order_messages').insert({
      order_id:      notif.order_id,
      type:          'ready_notification',
      status:        msgStatus,
      error_message: msgError,
    })

    const sendTime = new Date().toISOString()
    if (msgStatus === 'sent') {
      await Promise.all([
        db
          .from('order_scheduled_notifications')
          .update({ status: 'SENT', sent_at: sendTime })
          .eq('id', notif.id),
        db
          .from('orders')
          .update({ ready_sent_at: sendTime })
          .eq('id', notif.order_id),
      ])
      sent++
    } else {
      await db
        .from('order_scheduled_notifications')
        .update({ status: 'FAILED', meta: { error: msgError } })
        .eq('id', notif.id)
      failed++
    }
  }

  return { sent, failed, cancelled }
}

// =========================================
// DOWNGRADE COMPLETED → READY
// - Reverts status, clears timestamps
// - If points_credited: deducts exact points from client via points_log
// =========================================
export async function downgradeCompletedToReady(
  orderId: string,
): Promise<{ pointsReverted: number }> {
  const db = createServerClient()

  const { data: order, error } = await db
    .from('orders')
    .select('id, client_id, business_id, points_credited')
    .eq('id', orderId)
    .eq('status', 'completed')
    .single()
  if (error || !order) throw new Error('Commande introuvable ou déjà modifiée')

  let pointsReverted = 0

  if (order.points_credited) {
    // Find the exact points_log entry for this order
    const { data: log } = await db
      .from('points_log')
      .select('id, points_delta, cycle_points_before, cycle_points_after')
      .eq('client_id', order.client_id)
      .eq('business_id', order.business_id)
      .eq('source_type', 'order')
      .eq('source_id', orderId)
      .maybeSingle()

    if (log) {
      const { data: client } = await db
        .from('clients')
        .select('loyalty_points, current_cycle_points')
        .eq('id', order.client_id)
        .single()

      if (client) {
        await db.from('clients').update({
          loyalty_points:       (client.loyalty_points as number) - log.points_delta,
          current_cycle_points: log.cycle_points_before,
        }).eq('id', order.client_id)

        await db.from('points_log').insert({
          client_id:           order.client_id,
          business_id:         order.business_id,
          source_type:         'undo',
          source_id:           log.id,
          points_delta:        -log.points_delta,
          cycle_points_before: log.cycle_points_after,
          cycle_points_after:  log.cycle_points_before,
        })

        pointsReverted = log.points_delta
      }
    }
  }

  await db.from('orders').update({
    status:          'ready',
    picked_up_at:    null,
    completed_at:    null,
    points_credited: false,
  }).eq('id', orderId)

  return { pointsReverted }
}

// =========================================
// MARK ORDER AS COMPLETED (picked up) → credit points
// =========================================
export async function markOrderPickedUp(orderId: string): Promise<Order & { pointsCredited: number }> {
  const db = createServerClient()

  const { data: order, error } = await db
    .from('orders')
    .select('*, client:clients(*)')
    .eq('id', orderId)
    .eq('status', 'ready')
    .single()

  if (error || !order) throw new Error('Order not found or not in ready state')
  if (order.points_credited) throw new Error('Points already credited')

  const now = new Date().toISOString()
  await db
    .from('orders')
    .update({
      status:          'completed',
      picked_up_at:    now,
      completed_at:    now,
      points_credited: true,
    })
    .eq('id', orderId)

  const program = await db
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', order.business_id)
    .eq('is_active', true)
    .maybeSingle()
    .then((r) => r.data as LoyaltyProgram | null)

  let pointsToCredit = 0
  if (program) {
    if (program.type === 'passage') {
      pointsToCredit = program.points_per_visit ?? 1
    } else if (program.type === 'montant') {
      const cap = program.conversion_amount_per_point
      if (cap && cap > 0) {
        pointsToCredit = Math.floor(order.amount / cap)
      } else if (program.conversion_rate && program.conversion_rate > 0) {
        pointsToCredit = Math.floor(order.amount * program.conversion_rate)
      }
    }
  }

  if (pointsToCredit > 0) {
    await creditPoints({
      clientId:   order.client_id,
      businessId: order.business_id,
      points:     pointsToCredit,
      sourceType: 'order',
      sourceId:   orderId,
      program:    program ?? undefined,
    })
  }

  return { ...(order as Order), pointsCredited: pointsToCredit }
}

// =========================================
// COMPLETE ORDER IMMEDIATELY at creation (no WhatsApp) → credit points
// =========================================
export async function markOrderCompletedImmediately(
  orderId: string,
  businessId: string,
  clientId: string,
  amount: number,
): Promise<void> {
  const db = createServerClient()

  const program = await db
    .from('loyalty_programs')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle()
    .then((r) => r.data as LoyaltyProgram | null)

  let pointsToCredit = 0
  if (program) {
    if (program.type === 'passage') {
      pointsToCredit = program.points_per_visit ?? 1
    } else if (program.type === 'montant') {
      const cap = program.conversion_amount_per_point
      if (cap && cap > 0) {
        pointsToCredit = Math.floor(amount / cap)
      } else if (program.conversion_rate && program.conversion_rate > 0) {
        pointsToCredit = Math.floor(amount * program.conversion_rate)
      }
    }
  }

  if (pointsToCredit > 0) {
    await db.from('orders').update({ points_credited: true }).eq('id', orderId)
    await creditPoints({
      clientId,
      businessId,
      points:     pointsToCredit,
      sourceType: 'order',
      sourceId:   orderId,
      program:    program ?? undefined,
    })
  }
}

// =========================================
// LIST ORDERS for a business
// All pending/ready + last 50 completed, with messages joined
// =========================================
export async function getActiveOrders(businessId: string): Promise<Order[]> {
  const db = createServerClient()

  const [activeRes, recentRes] = await Promise.all([
    db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('business_id', businessId)
      .in('status', ['pending', 'ready'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (activeRes.error) throw activeRes.error

  const active = (activeRes.data ?? []) as Order[]
  const recent = (recentRes.data ?? []) as Order[]

  return [...active, ...recent]
}
