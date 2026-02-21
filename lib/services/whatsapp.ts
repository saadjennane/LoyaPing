// WhatsApp Service Layer
// Abstraction over any WhatsApp provider (WhatsApp Cloud API, Twilio, etc.)
// Phase 1: WhatsApp Cloud API (Meta) - swap provider by implementing sendMessage differently

export type WhatsAppMessage = {
  to: string    // phone in E.164 format e.g. +212612345678
  text: string
}

// =========================================
// SEND MESSAGE (provider abstraction)
// =========================================
export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<{ success: boolean; messageId?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'cloud_api'

  switch (provider) {
    case 'cloud_api':
      return sendViaCloudApi(msg)
    case 'twilio':
      return sendViaTwilio(msg)
    case 'mock':
      return sendViaMock(msg)
    default:
      throw new Error(`Unknown WhatsApp provider: ${provider}`)
  }
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

  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
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
    if (msg.type !== 'text') return null

    return {
      from: msg.from as string,
      body: (msg.text as Record<string, unknown>)?.body as string ?? '',
      messageId: msg.id as string,
      timestamp: Number(msg.timestamp),
    }
  } catch {
    return null
  }
}
