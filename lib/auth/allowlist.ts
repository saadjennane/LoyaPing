// Accounts allowed to use the merchant app (Google / email login).
// Supabase sign-ups are open, so any authenticated user is NOT enough:
// only these emails get access. Override with ALLOWED_EMAILS
// (comma-separated) in the environment.
const DEFAULT_ALLOWED_EMAILS = ['saadjennane@gmail.com', 'ber.houda@gmail.com']

function allowedEmails(): string[] {
  const fromEnv = process.env.ALLOWED_EMAILS
  const list = fromEnv ? fromEnv.split(',') : DEFAULT_ALLOWED_EMAILS
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  return allowedEmails().includes(email.trim().toLowerCase())
}
