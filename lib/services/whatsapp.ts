// WhatsApp Service Layer
// Abstraction over any WhatsApp provider (WhatsApp Cloud API, Twilio, etc.)
// Cloud API also covers Coexistence numbers (e.g. EasyCoexistence): same API,
// the WhatsApp Business app keeps working on the number.

import { createServerClient } from '@/lib/supabase/server'
import type { TemplateSpec } from '@/lib/whatsapp/templates'

export type WhatsAppMessage = {
  to: string    // phone in E.164 format e.g. +212612345678
  text: string
  // Fallback used by the Cloud API outside the 24 h customer service window
  template?: TemplateSpec | null
}

export type WhatsAppButtonMessage = {
  to: string
  body: string  // message text shown above the buttons
  buttons: Array<{ id: string; title: string }>  // max 3 buttons
  template?: TemplateSpec | null
}

/** "212 612-345 678" / "212612345678" → "+212612345678" */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits ? `+${digits}` : phone
}

// =========================================
// 24 H CUSTOMER SERVICE WINDOW
// =========================================

// Margin so a message queued at 23h59 doesn't reach Meta after the window closed
const SERVICE_WINDOW_MS = 24 * 60 * 60_000 - 10 * 60_000

/** Records an inbound client message (opens the 24 h window). */
export async function recordInboundMessage(phone: string, at = new Date()): Promise<void> {
  const db = createServerClient()
  const { error } = await db
    .from('whatsapp_windows')
    .upsert({ phone: normalizePhone(phone), last_inbound_at: at.toISOString() })
  if (error) console.error('[WhatsApp] recordInboundMessage error:', error.message)
}

/** True when the client wrote to us within the last 24 h. */
export async function isServiceWindowOpen(phone: string): Promise<boolean> {
  const db = createServerClient()
  const { data, error } = await db
    .from('whatsapp_windows')
    .select('last_inbound_at')
    .eq('phone', normalizePhone(phone))
    .maybeSingle()
  if (error || !data) return false
  return Date.now() - new Date(data.last_inbound_at).getTime() < SERVICE_WINDOW_MS
}

// =========================================
// SEND TEXT MESSAGE (provider abstraction)
// =========================================
export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<{ success: boolean; messageId?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'cloud_api'

  switch (provider) {
    case 'cloud_api':
      if (msg.template && !(await isServiceWindowOpen(msg.to))) {
        return sendTemplateViaCloudApi(msg.to, msg.template)
      }
      return sendViaCloudApi(msg)
    case 'twilio':
      return sendViaTwilio(msg)
    case 'vonage':
      return sendViaVonage(msg)
    case 'mock':
      return sendViaMock(msg)
    default:
      throw new Error(`Unknown WhatsApp provider: ${provider}`)
  }
}

// =========================================
// SEND INTERACTIVE BUTTON MESSAGE
// =========================================
export async function sendWhatsAppButtons(msg: WhatsAppButtonMessage): Promise<{ success: boolean; messageId?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'cloud_api'

  switch (provider) {
    case 'cloud_api':
      if (msg.template && !(await isServiceWindowOpen(msg.to))) {
        return sendTemplateViaCloudApi(msg.to, msg.template)
      }
      return sendButtonsViaCloudApi(msg)
    case 'vonage':
      return sendButtonsViaVonage(msg)
    case 'mock':
      console.log(`[WhatsApp MOCK Buttons] → ${msg.to}: ${msg.body} [${msg.buttons.map((b) => b.title).join(' | ')}]`)
      return { success: true, messageId: `mock_${Date.now()}` }
    default:
      // Fallback to plain text for providers without button support
      return sendWhatsAppMessage({ to: msg.to, text: msg.body, template: msg.template })
  }
}

// =========================================
// META CLOUD API
// Env: WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_API_VERSION (default v22.0), WHATSAPP_API_BASE_URL (default graph.facebook.com)
// =========================================
async function postToCloudApi(payload: Record<string, unknown>, label: string) {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID')
  }

  const baseUrl = (process.env.WHATSAPP_API_BASE_URL ?? 'https://graph.facebook.com').replace(/\/+$/, '')
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v22.0'

  const res = await fetch(`${baseUrl}/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[WhatsApp] Cloud API ${label} error:`, errText)
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return { success: true, messageId: data?.messages?.[0]?.id as string | undefined }
}

// Cloud API expects digits only (no "+")
const cloudApiRecipient = (to: string) => normalizePhone(to).replace(/^\+/, '')

async function sendViaCloudApi(msg: WhatsAppMessage) {
  return postToCloudApi({
    to: cloudApiRecipient(msg.to),
    type: 'text',
    text: { body: msg.text },
  }, 'text')
}

async function sendButtonsViaCloudApi(msg: WhatsAppButtonMessage) {
  return postToCloudApi({
    to: cloudApiRecipient(msg.to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: msg.body },
      action: {
        buttons: msg.buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  }, 'buttons')
}

async function sendTemplateViaCloudApi(to: string, template: TemplateSpec) {
  const components: Array<Record<string, unknown>> = []
  if (template.params.length > 0) {
    components.push({
      type: 'body',
      parameters: template.params.map((text) => ({ type: 'text', text })),
    })
  }
  ;(template.buttonPayloads ?? []).forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    })
  })

  return postToCloudApi({
    to: cloudApiRecipient(to),
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  }, `template ${template.name}`)
}

// =========================================
// TWILIO (stub — fill in if switching provider)
// =========================================
async function sendViaTwilio(msg: WhatsAppMessage) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM // e.g. whatsapp:+14155238886

  if (!accountSid || !authToken || !from) {
    throw new Error('Missing Twilio environment variables')
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To: `whatsapp:${msg.to}`,
        Body: msg.text,
      }),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    const errMsg = data?.message ?? data?.code ?? `HTTP ${res.status}`
    console.error('[WhatsApp] Twilio error:', data)
    throw new Error(`Twilio error: ${errMsg}`)
  }

  return { success: true, messageId: data?.sid as string | undefined }
}

// =========================================
// VONAGE MESSAGES API
// Env vars: VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_WHATSAPP_FROM (number without +)
// Set VONAGE_SANDBOX=true to use the sandbox endpoint (messages-sandbox.nexmo.com)
// Note: sandbox requires the recipient to have sent the passphrase to +14157386102 first
// =========================================
async function sendViaVonage(msg: WhatsAppMessage) {
  const apiKey    = process.env.VONAGE_API_KEY
  const apiSecret = process.env.VONAGE_API_SECRET
  const from      = process.env.VONAGE_WHATSAPP_FROM

  if (!apiKey || !apiSecret || !from) {
    throw new Error('Missing VONAGE_API_KEY, VONAGE_API_SECRET or VONAGE_WHATSAPP_FROM')
  }

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  // Vonage expects plain digits — strip whatsapp: prefix and leading +
  const stripVonage = (n: string) => n.replace(/^whatsapp:/i, '').replace(/^\+/, '').replace(/\s+/g, '')
  const to   = stripVonage(msg.to)
  const from_ = stripVonage(from)

  const isSandbox = process.env.VONAGE_SANDBOX === 'true'
  const endpoint = isSandbox
    ? 'https://messages-sandbox.nexmo.com/v1/messages'
    : 'https://api.nexmo.com/v1/messages'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      channel:      'whatsapp',
      message_type: 'text',
      to,
      from:         from_,
      text:         msg.text,
    }),
  })

  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* empty body */ }

  if (!res.ok) {
    const errMsg = data?.title ?? data?.detail ?? data?.error_title ?? `HTTP ${res.status}`
    console.error('[WhatsApp] Vonage error:', JSON.stringify(data))
    throw new Error(`Vonage error ${res.status}: ${errMsg}`)
  }

  return { success: true, messageId: data?.message_uuid as string | undefined }
}

// =========================================
// VONAGE — interactive buttons
// Uses message_type: "custom" to pass the raw WhatsApp interactive payload.
// Note: sandbox does NOT support interactive messages — falls back to text.
// =========================================
async function sendButtonsViaVonage(msg: WhatsAppButtonMessage) {
  const apiKey    = process.env.VONAGE_API_KEY
  const apiSecret = process.env.VONAGE_API_SECRET
  const from      = process.env.VONAGE_WHATSAPP_FROM

  if (!apiKey || !apiSecret || !from) {
    throw new Error('Missing VONAGE_API_KEY, VONAGE_API_SECRET or VONAGE_WHATSAPP_FROM')
  }

  // Sandbox doesn't support interactive messages → plain text fallback
  if (process.env.VONAGE_SANDBOX === 'true') {
    const btnList = msg.buttons.map((b) => b.title).join(' / ')
    return sendWhatsAppMessage({ to: msg.to, text: `${msg.body}\n\n${btnList}` })
  }

  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const stripVonage = (n: string) => n.replace(/^whatsapp:/i, '').replace(/^\+/, '').replace(/\s+/g, '')
  const to   = stripVonage(msg.to)
  const from_ = stripVonage(from)

  const res = await fetch('https://api.nexmo.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      channel:      'whatsapp',
      message_type: 'custom',
      to,
      from: from_,
      custom: {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: msg.body },
          action: {
            buttons: msg.buttons.map((b) => ({
              type:  'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
    }),
  })

  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* empty body */ }

  if (!res.ok) {
    const errMsg = data?.title ?? data?.detail ?? data?.error_title ?? `HTTP ${res.status}`
    console.error('[WhatsApp] Vonage buttons error:', JSON.stringify(data))
    throw new Error(`Vonage error ${res.status}: ${errMsg}`)
  }

  return { success: true, messageId: data?.message_uuid as string | undefined }
}

// =========================================
// MOCK (dev / testing)
// =========================================
async function sendViaMock(msg: WhatsAppMessage) {
  console.log(`[WhatsApp MOCK] → ${msg.to}: ${msg.text}`)
  return { success: true, messageId: `mock_${Date.now()}` }
}

// =========================================
// VERIFY WEBHOOK (Meta verification)
// =========================================
export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null
): string | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge
  }
  return null
}

// =========================================
// PARSE INCOMING WEBHOOK (Cloud API)
// =========================================
export type WhatsAppWebhookEvent =
  | {
      kind: 'message'           // a client wrote to us
      from: string              // E.164 phone
      body: string
      messageId: string
      timestamp: number
      buttonId?: string         // interactive button id or template quick-reply payload
    }
  | {
      kind: 'echo'              // the merchant wrote from the WhatsApp Business app (Coexistence)
      to: string                // E.164 phone of the client
      body: string
      messageId: string
    }

type Json = Record<string, unknown>

function textOfMessage(msg: Json): { body: string; buttonId?: string } {
  switch (msg.type) {
    case 'text':
      return { body: ((msg.text as Json)?.body as string) ?? '' }
    case 'interactive': {
      const interactive = msg.interactive as Json
      const reply = (interactive?.button_reply ?? interactive?.list_reply) as Json | undefined
      return { body: (reply?.title as string) ?? '', buttonId: reply?.id as string | undefined }
    }
    case 'button': {
      // Quick-reply button of a template message
      const button = msg.button as Json
      return { body: (button?.text as string) ?? '', buttonId: button?.payload as string | undefined }
    }
    default:
      return { body: `(${String(msg.type ?? 'message')})` }
  }
}

/** Extracts client messages and merchant echoes from a Cloud API webhook payload. */
export function parseWebhookEvents(payload: unknown): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = []
  try {
    for (const entry of ((payload as Json)?.entry as Json[]) ?? []) {
      for (const change of (entry?.changes as Json[]) ?? []) {
        const value = change?.value as Json

        for (const msg of (value?.messages as Json[]) ?? []) {
          const { body, buttonId } = textOfMessage(msg)
          events.push({
            kind: 'message',
            from: normalizePhone(msg.from as string),
            body,
            messageId: msg.id as string,
            timestamp: Number(msg.timestamp),
            ...(buttonId ? { buttonId } : {}),
          })
        }

        // smb_message_echoes: messages typed in the WhatsApp Business app
        for (const echo of (value?.message_echoes as Json[]) ?? []) {
          events.push({
            kind: 'echo',
            to: normalizePhone(echo.to as string),
            body: textOfMessage(echo).body,
            messageId: echo.id as string,
          })
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] parseWebhookEvents error:', err)
  }
  return events
}
