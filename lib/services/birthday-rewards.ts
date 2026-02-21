import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from './whatsapp'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

// Coupon validity for birthday rewards (30 days)
const BIRTHDAY_COUPON_VALIDITY_DAYS = 30

export async function processBirthdayRewards(): Promise<{
  processed: number
  sent: number
  skipped: number
  errors: number
}> {
  const db = createServerClient()

  // 1. Check if birthday rewards are enabled for this business
  const { data: program, error: progErr } = await db
    .from('loyalty_programs')
    .select('birthday_reward_enabled, birthday_reward_title, birthday_message_enabled, birthday_message_template')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .maybeSingle()

  if (progErr || !program || !program.birthday_reward_enabled) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  const { birthday_reward_title, birthday_message_enabled, birthday_message_template } = program

  // 2. Today's MM-DD (e.g. "03-15" for March 15)
  const today     = new Date()
  const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const thisYear  = today.getFullYear()
  const yearStart = `${thisYear}-01-01T00:00:00Z`

  // 3. Fetch all clients with a birthday set
  const { data: clients, error: clientsErr } = await db
    .from('clients')
    .select('id, phone_number, birthday')
    .eq('business_id', DEFAULT_BUSINESS_ID)
    .not('birthday', 'is', null)

  if (clientsErr || !clients) {
    return { processed: 0, sent: 0, skipped: 0, errors: 1 }
  }

  // 4. Filter to clients whose birthday is today (MM-DD match)
  //    birthday is stored as YYYY-MM-DD → compare substring(5)
  const todayBirthdays = clients.filter(
    (c) => c.birthday && (c.birthday as string).substring(5) === todayMMDD
  )

  if (todayBirthdays.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  let sent = 0, skipped = 0, errors = 0

  for (const client of todayBirthdays) {
    try {
      // 5. Deduplication: already rewarded this calendar year?
      const { data: existing } = await db
        .from('coupons')
        .select('id')
        .eq('client_id', client.id)
        .eq('source', 'birthday')
        .gte('created_at', yearStart)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      // 6. Create birthday coupon (no tier_id = custom reward)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + BIRTHDAY_COUPON_VALIDITY_DAYS)

      const { error: couponErr } = await db
        .from('coupons')
        .insert({
          client_id:  client.id,
          tier_id:    null,
          status:     'active',
          source:     'birthday',
          expires_at: expiresAt.toISOString(),
        })

      if (couponErr) {
        errors++
        continue
      }

      // 7. Optional WhatsApp message
      if (birthday_message_enabled && birthday_message_template) {
        const rewardTitle = birthday_reward_title ?? 'un cadeau'
        const message = birthday_message_template
          .replace(/#{cadeau}/g, rewardTitle)
          .replace(/#{reward}/g, rewardTitle)

        await sendWhatsAppMessage({ to: client.phone_number, text: message })
      }

      sent++
    } catch {
      errors++
    }
  }

  return { processed: todayBirthdays.length, sent, skipped, errors }
}
