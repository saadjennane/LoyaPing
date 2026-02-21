import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhook, parseIncomingWebhook } from '@/lib/services/whatsapp'
import { handleIncomingMessage } from '@/lib/services/clients'

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

// POST — Incoming messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const msg = parseIncomingWebhook(body)

    if (msg) {
      // Non-blocking — don't await so we return 200 fast to Meta
      handleIncomingMessage(msg.from).catch((err) =>
        console.error('[webhook] handleIncomingMessage error:', err)
      )
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[webhook] error:', err)
    return NextResponse.json({ status: 'ok' }) // always 200 to Meta
  }
}
