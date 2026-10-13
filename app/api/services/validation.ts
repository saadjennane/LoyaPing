type ServiceFields = {
  cabin_id?:         string
  name?:             string
  price?:            number
  duration_minutes?: number
  is_active?:        boolean
  sort_order?:       number
}

/**
 * Validates a service payload. With `partial: false` (create), cabin_id,
 * name, price and duration_minutes are required.
 */
export function parseServiceFields(
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): { fields: ServiceFields } | { error: string } {
  const fields: ServiceFields = {}

  if ('cabin_id' in body || !partial) {
    if (typeof body.cabin_id !== 'string' || !body.cabin_id) return { error: 'La cabine est requise' }
    fields.cabin_id = body.cabin_id
  }
  if ('name' in body || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { error: 'Le nom du soin est requis' }
    fields.name = name
  }
  if ('price' in body || !partial) {
    const price = Number(body.price)
    if (body.price === '' || body.price === null || !Number.isFinite(price) || price < 0) {
      return { error: 'Le prix doit être un nombre positif' }
    }
    fields.price = Math.round(price * 100) / 100
  }
  if ('duration_minutes' in body || !partial) {
    const duration = Number(body.duration_minutes)
    if (!Number.isInteger(duration) || duration <= 0 || duration > 12 * 60) {
      return { error: 'La durée doit être un nombre de minutes entre 1 et 720' }
    }
    fields.duration_minutes = duration
  }
  if ('is_active' in body) fields.is_active = !!body.is_active
  if ('sort_order' in body) fields.sort_order = Number(body.sort_order) || 0

  return { fields }
}
