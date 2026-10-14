// Shared helpers for the gift card API (cartes cadeaux)
import { randomInt } from 'crypto'
import type { GiftCard } from '@/lib/types'
import { createServerClient } from '@/lib/supabase/server'

export const GIFT_CARD_SELECT =
  'id, business_id, code, buyer_client_id, recipient_client_id, service_id, service_name, service_price, amount_paid, notes, sold_at, consumed_at, consumed_appointment_id, created_at,' +
  ' consumed_appointment:appointments!gift_cards_consumed_appointment_id_fkey(id, scheduled_at),' +
  ' buyer:clients!gift_cards_buyer_client_id_fkey(id, civility, first_name, last_name, phone_number),' +
  ' recipient:clients!gift_cards_recipient_client_id_fkey(id, civility, first_name, last_name, phone_number)'

// No 0/O/1/I to keep codes easy to read out loud
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateGiftCardCode(): string {
  let code = ''
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `CC-${code}`
}

/** Row from GIFT_CARD_SELECT → GiftCard (NUMERIC columns come back as strings). */
export function toGiftCard(row: unknown): GiftCard {
  const r = row as GiftCard
  return { ...r, service_price: Number(r.service_price), amount_paid: Number(r.amount_paid) }
}

// ── Gift card ↔ appointment lifecycle ────────────────────────────────────────
// A card linked to an appointment but not consumed yet is "reserved" for it.
// It becomes consumed when the appointment is marked show, and is released
// (available again) when the appointment is deleted.

type Db = ReturnType<typeof createServerClient>

/** Reserves an available card (not consumed, not reserved) for an appointment. */
export async function reserveGiftCard(db: Db, cardId: string, appointmentId: string, businessId: string): Promise<boolean> {
  const { data, error } = await db
    .from('gift_cards')
    .update({ consumed_appointment_id: appointmentId })
    .eq('id', cardId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .is('consumed_at', null)
    .is('consumed_appointment_id', null)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/** Marks the cards reserved for this appointment as consumed. */
export async function consumeGiftCardsForAppointment(db: Db, appointmentId: string): Promise<void> {
  const { error } = await db
    .from('gift_cards')
    .update({ consumed_at: new Date().toISOString() })
    .eq('consumed_appointment_id', appointmentId)
    .is('consumed_at', null)
  if (error) throw error
}

/** Frees the cards reserved (not consumed) for deleted appointments. */
export async function releaseGiftCardsForAppointments(db: Db, appointmentIds: string[]): Promise<void> {
  if (appointmentIds.length === 0) return
  const { error } = await db
    .from('gift_cards')
    .update({ consumed_appointment_id: null })
    .in('consumed_appointment_id', appointmentIds)
    .is('consumed_at', null)
  if (error) throw error
}
