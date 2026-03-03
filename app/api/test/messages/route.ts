import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/lib/services/whatsapp'
import { REVIEW_BTN_POSITIVE, REVIEW_BTN_NEGATIVE } from '@/lib/services/clients'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export type TestScenario =
  // Orders
  | 'order_ready'
  | 'order_correction'
  // Appointments
  | 'appointment_reminder_1'
  | 'appointment_reminder_2'
  | 'appointment_reminder_3'
  // Loyalty
  | 'loyalty_tier'
  | 'loyalty_birthday'
  // Reviews
  | 'review_request'
  | 'review_positive'
  | 'review_negative'

export type ScenarioResult = {
  scenario: TestScenario
  success: boolean
  text?: string
  error?: string
}

// GET /api/test/messages — returns preview of all messages from settings (no send)
export async function GET() {
  try {
    const db = createServerClient()

    const [
      profileRes,
      orderNotifRes,
      apptNotifRes,
      loyaltyProgramRes,
      loyaltyTierRes,
      reviewRes,
    ] = await Promise.all([
      db.from('business_profile').select('name').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('order_notification_settings').select('ready_message,order_ready_correction_template,reminder1_enabled,reminder1_message,reminder2_enabled,reminder2_message,reminder3_enabled,reminder3_message').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('appointment_notification_settings').select('reminder1_enabled,reminder1_message,reminder2_enabled,reminder2_message,reminder3_enabled,reminder3_message').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('loyalty_programs').select('birthday_message_enabled,birthday_message_template,birthday_reward_title').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('loyalty_tiers').select('id,reward_title,reward_description,notification_message_template').eq('business_id', DEFAULT_BUSINESS_ID).eq('notify_on_tier', true).order('threshold', { ascending: true }).limit(1).maybeSingle(),
      db.from('review_settings').select('is_active,satisfaction_message,positive_message,negative_message,google_review_link').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
    ])

    const businessName = profileRes.data?.name?.trim() || 'votre commerce'
    const on = orderNotifRes.data
    const an = apptNotifRes.data
    const lp = loyaltyProgramRes.data
    const lt = loyaltyTierRes.data
    const rv = reviewRes.data

    const tierLabel = lt?.reward_title ?? lt?.reward_description ?? 'Palier atteint'
    const expiryDate = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const birthdayReward = lp?.birthday_reward_title ?? 'un cadeau'

    const previews: Record<TestScenario, string | null> = {
      order_ready:              on?.ready_message?.replace(/#{reference}/g, 'TEST-001') ?? `Votre commande #TEST-001 est prête. Vous pouvez venir la récupérer. Merci !`,
      order_correction:         on?.order_ready_correction_template ?? `Nous sommes désolés : une erreur s'est produite. Votre commande n'est pas encore prête. Nous vous préviendrons dès qu'elle sera disponible.`,
      appointment_reminder_1:   (an?.reminder1_enabled && an?.reminder1_message) ? an.reminder1_message : null,
      appointment_reminder_2:   (an?.reminder2_enabled && an?.reminder2_message) ? an.reminder2_message : null,
      appointment_reminder_3:   (an?.reminder3_enabled && an?.reminder3_message) ? an.reminder3_message : null,
      loyalty_tier:             lt ? (lt.notification_message_template ?? `Félicitations ! Vous avez atteint le palier "${tierLabel}".`).replace(/#{reward_title}/g, tierLabel).replace(/#{expiry_date}/g, expiryDate) : null,
      loyalty_birthday:         (lp?.birthday_message_enabled && lp?.birthday_message_template) ? lp.birthday_message_template.replace(/#{cadeau}/g, birthdayReward).replace(/#{reward}/g, birthdayReward) : null,
      review_request:           rv?.is_active ? (rv.satisfaction_message ?? `Étiez-vous satisfait(e) de votre expérience chez ${businessName} ?`).replace(/\{name\}/g, 'Client') : null,
      review_positive:          rv?.is_active ? ((rv.positive_message ?? 'Super ! Vous pouvez nous laisser un avis 🙏') + (rv.google_review_link ? `\n${rv.google_review_link}` : '')) : null,
      review_negative:          rv?.is_active ? (rv.negative_message ?? 'Merci pour votre retour. Nous allons y remédier rapidement !') : null,
    }

    return NextResponse.json({ data: { previews, businessName } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/test/messages — sends a test message for a specific scenario
// Body: { phone: string, scenario: TestScenario }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, scenario } = body as { phone: string; scenario?: TestScenario }

    const cleaned = (phone ?? '').replace(/\s+/g, '').trim()
    if (!cleaned) {
      return NextResponse.json({ error: 'Numéro de téléphone requis.' }, { status: 400 })
    }
    if ((cleaned.match(/\d/g) ?? []).length < 8) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }

    // Re-use GET logic to resolve the message text
    const previewRes = await GET()
    const previewJson = await previewRes.json()
    if (previewJson.error) throw new Error(previewJson.error)
    const previews = previewJson.data.previews as Record<TestScenario, string | null>

    const sendText = async (text: string) => {
      const result = await sendWhatsAppMessage({ to: cleaned, text: `[Test] ${text}` })
      if (!result.success) throw new Error('Échec envoi')
      return text
    }

    const sendButtons = async (body: string) => {
      const result = await sendWhatsAppButtons({
        to: cleaned,
        body: `[Test] ${body}`,
        buttons: [
          { id: REVIEW_BTN_POSITIVE, title: '👍 Oui' },
          { id: REVIEW_BTN_NEGATIVE, title: '👎 Non' },
        ],
      })
      if (!result.success) throw new Error('Échec envoi')
      return body
    }

    if (scenario) {
      const text = previews[scenario]
      if (!text) {
        return NextResponse.json(
          { error: 'Ce scénario n\'est pas configuré ou est désactivé.' },
          { status: 422 },
        )
      }

      let sentText: string
      if (scenario === 'review_request') {
        sentText = await sendButtons(text)
      } else {
        sentText = await sendText(text)
      }

      return NextResponse.json({ data: { sent: true, text: sentText } })
    }

    // Legacy: no scenario → send all available (backward-compat)
    const results: ScenarioResult[] = []
    const allScenarios: TestScenario[] = [
      'order_ready', 'appointment_reminder_1', 'loyalty_tier', 'review_request',
    ]
    let first = true
    for (const sc of allScenarios) {
      const text = previews[sc]
      if (!text) continue
      if (!first) await new Promise((r) => setTimeout(r, 600))
      first = false
      try {
        if (sc === 'review_request') {
          await sendButtons(text)
        } else {
          await sendText(text)
        }
        results.push({ scenario: sc, success: true, text })
      } catch (err) {
        results.push({ scenario: sc, success: false, error: String(err) })
      }
    }

    return NextResponse.json({ data: { sent: results.filter((r) => r.success).length, results } })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) || 'Une erreur est survenue. Veuillez réessayer.' },
      { status: 500 },
    )
  }
}
