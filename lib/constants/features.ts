// Microsoft (Azure login + Outlook Calendar) is hidden for this release —
// Google only. The underlying routes and sync service remain in place.
export const MICROSOFT_ENABLED = false

// Google Calendar is one-way for this release: LoyaPing → Google only.
// When false, no watch channel is registered and Google events are never
// imported; calendar_watch_channels only stores the target calendar_id.
export const GOOGLE_CALENDAR_IMPORT_ENABLED = false
