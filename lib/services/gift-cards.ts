// Shared helpers for the gift card API (cartes cadeaux)
import { randomInt } from 'crypto'
import type { GiftCard } from '@/lib/types'

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
