import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// POST /api/test/messages
// Body: { phone: string }
// Sends test WhatsApp messages for each enabled module
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    const cleaned = (phone ?? '').replace(/\s+/g, '').trim()
    if (!cleaned) {
      return NextResponse.json({ error: 'Numéro de téléphone requis.' }, { status: 400 })
    }
    // Basic sanity: at least 8 digits
    if ((cleaned.match(/\d/g) ?? []).length < 8) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }

    const db = createServerClient()

    // Fetch business name & modules in parallel
    const [profileRes, modulesRes] = await Promise.all([
      db.from('business_profile').select('name').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
      db.from('business_modules').select('orders_enabled,appointments_enabled,loyalty_enabled').eq('business_id', DEFAULT_BUSINESS_ID).maybeSingle(),
    ])

    const businessName = profileRes.data?.name?.trim() || 'votre commerce'
    const modules      = modulesRes.data ?? { orders_enabled: false, appointments_enabled: false, loyalty_enabled: false }

    const messages: string[] = []

    if (modules.orders_enabled) {
      messages.push(`[Message de test] Votre commande chez ${businessName} est prête. Vous pouvez venir la récupérer !`)
    }
    if (modules.appointments_enabled) {
      messages.push(`[Message de test] Rappel : rendez-vous chez ${businessName} le 12 juin à 15h00. À bientôt !`)
    }
    if (modules.loyalty_enabled) {
      messages.push(`[Message de test] Félicitations ! Vous avez débloqué votre récompense chez ${businessName}. Venez en profiter !`)
    }
    if (messages.length === 0) {
      messages.push(`[Message de test] Bienvenue sur LoyaPing ! Votre espace ${businessName} est prêt.`)
    }

    for (let i = 0; i < messages.length; i++) {
      if (i > 0) await delay(600)
      const result = await sendWhatsAppMessage({ to: cleaned, text: messages[i] })
      if (!result.success) {
        return NextResponse.json(
          { error: 'Une erreur est survenue lors de l\'envoi. Veuillez réessayer.' },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({ data: { sent: messages.length } })
  } catch {
    return NextResponse.json(
      { error: 'Une erreur est survenue. Veuillez réessayer.' },
      { status: 500 }
    )
  }
}
