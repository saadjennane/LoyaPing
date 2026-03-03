// WhatsApp Service Layer
// Abstraction over any WhatsApp provider (WhatsApp Cloud API, Twilio, etc.)
// Phase 1: WhatsApp Cloud API (Meta) - swap provider by implementing sendMessage differently

export type WhatsAppMessage = {
  to: string    // phone in E.164 format e.g. +212612345678
  text: string
}

export type WhatsAppButtonMessage = {
  to: string
  body: string  // message text shown above the buttons
  buttons: Array<{ id: string; title: string }>  // max 3 buttons
}

// =========================================
// SEND TEXT MESSAGE (provider abstraction)
// =========================================
export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<{ success: boolean; messageId?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'cloud_api'

  switch (provider) {
    case 'cloud_api':
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
      return sendButtonsViaCloudApi(msg)
    case 'vonage':
      return sendButtonsViaVonage(msg)
    case 'mock':
      console.log(`[WhatsApp MOCK Buttons] → ${msg.to}: ${msg.body} [${msg.buttons.map((b) => b.title).join(' | ')}]`)
      return { success: true, messageId: `mock_${Date.now()}` }
    default:
      // Fallback to plain text for providers without button support
      return sendWhatsAppMessage({ to: msg.to, text: msg.body })
  }
}

async function sendButtonsViaCloudApi(msg: WhatsAppButtonMessage) {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID')
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v22.0'

  const body = {
    messaging_product: 'whatsapp',
    to: msg.to.replace(/\s+/g, ''),
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
  }

  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    console.error('[WhatsApp] Cloud API buttons error:', errText)
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return { success: true, messageId: data?.messages?.[0]?.id as string | undefined }
}

// =========================================
// META CLOUD API
// =========================================
async function sendViaCloudApi(msg: WhatsAppMessage) {
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    throw new Error('Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID')
  }

  const body = {
    messaging_product: 'whatsapp',
    to: msg.to.replace(/\s+/g, ''),
    type: 'text',
    text: { body: msg.text },
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v22.0'

  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    console.error('[WhatsApp] Cloud API error:', errText)
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return { success: true, messageId: data?.messages?.[0]?.id as string | undefined }
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
// PARSE INCOMING MESSAGE
// =========================================
export type IncomingWhatsAppMessage = {
  from: string      // E.164 phone
  body: string
  messageId: string
  timestamp: number
  buttonId?: string // set when the user tapped an interactive button reply
}

export function parseIncomingWebhook(payload: unknown): IncomingWhatsAppMessage | null {
  try {
    const p = payload as Record<string, unknown>
    const entry = (p?.entry as unknown[])?.[0] as Record<string, unknown>
    const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
    const value = changes?.value as Record<string, unknown>
    const messages = value?.messages as unknown[]
    if (!messages || messages.length === 0) return null

    const msg = messages[0] as Record<string, unknown>

    // Plain text message
    if (msg.type === 'text') {
      return {
        from: msg.from as string,
        body: (msg.text as Record<string, unknown>)?.body as string ?? '',
        messageId: msg.id as string,
        timestamp: Number(msg.timestamp),
      }
    }

    // Interactive button reply (user tapped a quick-reply button)
    if (msg.type === 'interactive') {
      const interactive = msg.interactive as Record<string, unknown>
      if (interactive?.type === 'button_reply') {
        const reply = interactive.button_reply as Record<string, unknown>
        return {
          from: msg.from as string,
          body: (reply?.title as string) ?? '',
          messageId: msg.id as string,
          timestamp: Number(msg.timestamp),
          buttonId: reply?.id as string,
        }
      }
    }

    return null
  } catch {
    return null
  }
}
