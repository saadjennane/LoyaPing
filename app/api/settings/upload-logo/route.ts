import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'
const BUCKET = 'logos'
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']

// POST /api/settings/upload-logo
// Body: multipart/form-data with field "file"
// Returns: { data: { url: string } }
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Format non supporté (JPEG, PNG, WebP, SVG, GIF)' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Le fichier ne doit pas dépasser 2 Mo' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${DEFAULT_BUSINESS_ID}/logo.${ext}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const db = createServerClient()

    // Upsert — overwrite existing logo file
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)

    // Bust cache by appending timestamp query param
    const url = `${publicUrl}?t=${Date.now()}`

    return NextResponse.json({ data: { url } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
