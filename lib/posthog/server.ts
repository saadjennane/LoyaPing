import { PostHog } from 'posthog-node'

const DISTINCT_ID = process.env.DEFAULT_BUSINESS_ID ?? 'unknown'

let _client: PostHog | null = null

function getClient(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null
  if (!_client) {
    _client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host:          process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com',
      flushAt:       1,
      flushInterval: 0,
    })
  }
  return _client
}

/**
 * Fire-and-forget server-side event capture.
 * No-ops silently if NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function capture(event: string, properties?: Record<string, unknown>): void {
  const client = getClient()
  if (!client) return
  client.capture({ distinctId: DISTINCT_ID, event, properties })
  client.flush().catch(() => {})
}
