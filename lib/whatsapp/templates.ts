/**
 * WhatsApp message templates (Meta Cloud API).
 *
 * Meta only accepts free-form messages within 24 h of the client's last
 * message. Every business-initiated notification therefore carries a
 * fallback template, used by the Cloud API provider when that window is
 * closed. The merchant's own text (settings) is still sent inside the window.
 *
 * Each template below must be created and approved in WhatsApp Manager with
 * exactly this name, language and body (see docs/whatsapp-templates.md).
 * {{n}} placeholders are filled, in order, with the params given at send time.
 * Quick-reply button payloads are set at send time too.
 */

import { createServerClient } from '@/lib/supabase/server'

export const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'fr'

type TemplateDef = {
  name:     string
  category: 'UTILITY' | 'MARKETING'
  body:     string
  buttons?: string[]   // quick-reply titles (max 25 chars each)
}

export const WA_TEMPLATES = {
  order_ready: {
    name: 'loyaping_commande_prete', category: 'UTILITY',
    body: 'Bonjour {{1}}, votre commande {{2}} est prête. Vous pouvez venir la récupérer chez {{3}}.',
  },
  order_reminder: {
    name: 'loyaping_commande_rappel', category: 'UTILITY',
    body: 'Bonjour {{1}}, petit rappel : votre commande {{2}} vous attend chez {{3}}.',
  },
  order_ready_correction: {
    name: 'loyaping_commande_correction', category: 'UTILITY',
    body: 'Bonjour {{1}}, désolé, votre commande {{2}} n\'est finalement pas encore prête. {{3}} vous préviendra dès qu\'elle le sera.',
  },
  appointment_reminder: {
    name: 'loyaping_rdv_rappel', category: 'UTILITY',
    body: 'Bonjour {{1}}, nous vous rappelons votre rendez-vous chez {{2}} le {{3}} à {{4}}.',
  },
  appointment_reminder_confirm: {
    name: 'loyaping_rdv_rappel_confirmation', category: 'UTILITY',
    body: 'Bonjour {{1}}, nous vous rappelons votre rendez-vous chez {{2}} le {{3}} à {{4}}. Merci de confirmer votre présence.',
    buttons: ['✅ Je confirme', '🔁 Replanifier'],
  },
  appointment_post_show: {
    name: 'loyaping_rdv_merci', category: 'UTILITY',
    body: 'Bonjour {{1}}, merci pour votre visite chez {{2}} ! À très bientôt.',
  },
  appointment_post_no_show: {
    name: 'loyaping_rdv_absence', category: 'UTILITY',
    body: 'Bonjour {{1}}, nous ne vous avons pas vu à votre rendez-vous chez {{2}}. Répondez à ce message pour en fixer un nouveau.',
  },
  birthday: {
    name: 'loyaping_anniversaire', category: 'MARKETING',
    body: 'Joyeux anniversaire {{1}} ! 🎉 Pour l\'occasion, {{2}} vous offre {{3}}.',
  },
  reward_unlocked: {
    name: 'loyaping_recompense', category: 'UTILITY',
    body: 'Bonjour {{1}}, vous avez débloqué une récompense chez {{2}} : {{3}} 🎁',
  },
  review_request: {
    name: 'loyaping_avis', category: 'UTILITY',
    body: 'Bonjour {{1}}, avez-vous été satisfait(e) de votre dernière visite chez {{2}} ?',
    buttons: ['👍 Oui', '👎 Non'],
  },
  urgent_alert: {
    name: 'loyaping_alerte', category: 'UTILITY',
    body: 'LoyaPing : {{1}}. Ouvrez l\'application pour la traiter.',
  },
} satisfies Record<string, TemplateDef>

export type TemplateKey = keyof typeof WA_TEMPLATES

/** Template payload stored in the outbox and sent to the Cloud API. */
export type TemplateSpec = {
  name:            string
  language:        string
  params:          string[]
  buttonPayloads?: string[]
}

// Meta rejects empty params and params containing newlines, tabs or 4+ spaces
function sanitizeParam(value: string | null | undefined): string {
  const clean = (value ?? '').replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return clean || '-'
}

export function waTemplate(key: TemplateKey, params: Array<string | null | undefined>, buttonPayloads?: string[]): TemplateSpec {
  return {
    name:     WA_TEMPLATES[key].name,
    language: TEMPLATE_LANGUAGE,
    params:   params.map(sanitizeParam),
    ...(buttonPayloads?.length ? { buttonPayloads } : {}),
  }
}

/** First name used in template greetings, with a neutral fallback. */
export function greetingName(client: { first_name?: string | null; civility?: string | null; last_name?: string | null } | null | undefined): string {
  if (client?.first_name) return client.first_name
  if (client?.civility && client?.last_name) return `${client.civility} ${client.last_name}`
  return 'cher client'
}

/** Business display name for templates. */
export async function getBusinessName(businessId: string): Promise<string> {
  const db = createServerClient()
  const { data } = await db
    .from('business_profile')
    .select('name')
    .eq('business_id', businessId)
    .maybeSingle()
  return data?.name || 'notre établissement'
}
