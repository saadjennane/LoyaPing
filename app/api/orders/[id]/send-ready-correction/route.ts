import { NextRequest, NextResponse } from 'next/server'
import { sendReadyCorrection } from '@/lib/services/orders'

type Params = { params: Promise<{ id: string }> }

// POST /api/orders/:id/send-ready-correction
// Sends the "excuse" WhatsApp message after a READY → PENDING downgrade.
// Uses the order_ready_correction_template from business settings.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await sendReadyCorrection(id)
    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
