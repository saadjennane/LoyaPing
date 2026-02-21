// ─── i18n utility ─────────────────────────────────────────────────────────────

export type Translations = Record<string, unknown>

/** Navigate a nested object by dot-separated key, return the string or the key itself as fallback */
export function getTranslation(obj: Translations, key: string): string {
  const parts = key.split('.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return key
    current = current[part]
  }
  return typeof current === 'string' ? current : key
}

/** Replace {{variable}} placeholders with provided values */
export function interpolate(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? `{{${name}}}`))
}
