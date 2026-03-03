import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppButtons } from '@/lib/services/whatsapp'
import { REVIEW_BTN_POSITIVE, REVIEW_BTN_NEGATIVE } from '@/lib/services/clients'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Scenario = 'orders' | 'appointments' | 'loyalty' | 'reviews'

// POST /api/test/messages
// Body: { phone: string, scenario?: Scenario }
// If scenario is provided, tests only that module.
// If omitted, tests all enabled modules (backward-compatible).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, scenario } = body as { phone: string; scenario?: Scenario }

    const cleaned = (phone ?? '').replace(/\s+/g, '').trim()
    if (!cleaned) {
      return NextResponse.json({ error: 'Numéro de téléphone requis.' }, { status: 400 })
    }
    if ((cleaned.match(/\d/g) ?? []).length < 8) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }

    const db = createServerClient()

    const [profileRes, modulesRes, reviewSettingsRes] = await Promise.all([
      db.from('business_profile').select('name').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('business_modules').select('orders_enabled,appointments_enabled,loyalty_enabled').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('review_settings').select('satisfaction_message,is_active').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
    ])

    const businessName = profileRes.data?.name?.trim() || 'votre commerce'
    const modules      = modulesRes.data ?? { orders_enabled: false, appointments_enabled: false, loyalty_enabled: false }
    const reviewMsg    = reviewSettingsRes.data?.satisfaction_message ?? `Êtes-vous satisfait(e) de votre expérience chez ${businessName} ?`

    type Result = { scenario: Scenario; success: boolean; error?: string }
    const results: Result[] = []

    const testText = async (sc: Scenario, text: string) => {
      const r = await sendWhatsAppMessage({ to: cleaned, text: `[Test] ${text}` })
      results.push({ scenario: sc, success: r.success })
    }

    const testButtons = async (sc: Scenario, msgBody: string) => {
      try {
        const r = await sendWhatsAppButtons({
          to: cleaned,
          body: `[Test] ${msgBody}`,
          buttons: [
            { id: REVIEW_BTN_POSITIVE, title: '👍 Oui' },
            { id: REVIEW_BTN_NEGATIVE, title: '👎 Non' },
          ],
        })
        results.push({ scenario: sc, success: r.success })
      } catch (err) {
        results.push({ scenario: sc, success: false, error: String(err) })
      }
    }

    if (scenario) {
      // ── Single scenario ──────────────────────────────────────────────────────
      switch (scenario) {
        case 'orders':
          await testText('orders', `Votre commande chez ${businessName} est prête. Vous pouvez venir la récupérer !`)
          break
        case 'appointments':
          await testText('appointments', `Rappel : rendez-vous chez ${businessName} demain à 10h00. À bientôt !`)
          break
        case 'loyalty':
          await testText('loyalty', `Félicitations ! Vous avez débloqué votre récompense chez ${businessName}. Venez en profiter !`)
          break
        case 'reviews':
          await testButtons('reviews', reviewMsg.replace(/\{name\}/g, 'Client'))
          break
      }
    } else {
      // ── All enabled modules (backward-compatible) ────────────────────────────
      let first = true
      const run = async (fn: () => Promise<void>) => {
        if (!first) await delay(600)
        first = false
        await fn()
      }

      if (modules.orders_enabled) {
        await run(() => testText('orders', `Votre commande chez ${businessName} est prête. Vous pouvez venir la récupérer !`))
      }
      if (modules.appointments_enabled) {
        await run(() => testText('appointments', `Rappel : rendez-vous chez ${businessName} demain à 10h00. À bientôt !`))
      }
      if (modules.loyalty_enabled) {
        await run(() => testText('loyalty', `Félicitations ! Vous avez débloqué votre récompense chez ${businessName}. Venez en profiter !`))
      }
      if (reviewSettingsRes.data?.is_active) {
        await run(() => testButtons('reviews', reviewMsg.replace(/\{name\}/g, 'Client')))
      }
      if (results.length === 0) {
        await run(() => testText('orders', `Bienvenue sur LoyaPing ! Votre espace ${businessName} est prêt.`))
      }
    }

    const anyFailed = results.some((r) => !r.success)
    if (anyFailed) {
      return NextResponse.json(
        { error: 'Une erreur est survenue lors de l\'envoi. Veuillez réessayer.', results },
        { status: 502 },
      )
    }

    return NextResponse.json({ data: { sent: results.length, results } })
  } catch {
    return NextResponse.json(
      { error: 'Une erreur est survenue. Veuillez réessayer.' },
      { status: 500 },
    )
  }
}
