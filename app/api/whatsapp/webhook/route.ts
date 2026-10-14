import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse, after } from 'next/server'
import { verifyWebhook, parseWebhookEvents, recordInboundMessage } from '@/lib/services/whatsapp'
import { handleBusinessEcho, handleIncomingMessage } from '@/lib/services/clients'

// GET — Meta webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const result = verifyWebhook(mode, token, challenge)
  if (result) {
    return new NextResponse(result, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * Verifies X-Hub-Signature-256 when WHATSAPP_APP_SECRET is set.
 * With a Coexistence provider the Meta app (and its secret) may belong to the
 * provider — leave the variable unset in that case.
 */
function hasValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return true
  if (!header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = header.slice('sha256='.length)
  return expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

// POST — Incoming messages (client messages + Coexistence echoes)
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    if (!hasValidSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      return new NextResponse('Invalid signature', { status: 401 })
    }

    const events = parseWebhookEvents(JSON.parse(rawBody))

    // Process after responding so Meta gets its 200 fast; after() keeps the
    // function alive on Vercel until processing completes.
    if (events.length > 0) {
      after(async () => {
        for (const ev of events) {
          try {
            if (ev.kind === 'message') {
              await recordInboundMessage(ev.from, new Date(ev.timestamp * 1000 || Date.now()))
              await handleIncomingMessage(ev.from, ev.body, ev.buttonId)
            } else {
              await handleBusinessEcho(ev.to, ev.body)
            }
          } catch (err) {
            console.error('[webhook] event processing error:', err)
          }
        }
      })
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[webhook] error:', err)
    return NextResponse.json({ status: 'ok' }) // always 200 to Meta
  }
}
