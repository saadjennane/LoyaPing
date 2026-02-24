'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AppointmentNotificationSettings } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M11.4 2H2v9.4h9.4V2z" fill="#F25022"/>
      <path d="M22 2h-9.4v9.4H22V2z" fill="#7FBA00"/>
      <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00A4EF"/>
      <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#FFB900"/>
    </svg>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

const DEFAULT_APPT_NOTIF: Omit<AppointmentNotificationSettings, 'business_id' | 'updated_at'> = {
  reminder1_enabled: true,  reminder1_delay_value: 24, reminder1_delay_unit: 'hours', reminder1_fixed_send_time: null, reminder1_message: 'Bonjour ! Rappel de votre rendez-vous demain. À bientôt !',
  reminder2_enabled: false, reminder2_delay_value: 2,  reminder2_delay_unit: 'hours', reminder2_fixed_send_time: null, reminder2_message: '',
  reminder3_enabled: false, reminder3_delay_value: 30, reminder3_delay_unit: 'minutes', reminder3_fixed_send_time: null, reminder3_message: '',
  post_messages_enabled: true,
  post_show_message:    'Merci pour votre visite ! À bientôt.',
  post_no_show_message: 'Vous avez manqué votre rendez-vous. Contactez-nous pour en planifier un nouveau.',
}

type CalendarStatus = { provider: string; account_email: string | null; connected_at: string } | null

export default function AppointmentsSettingsPage() {
  const { t } = useI18n()
  const { refresh: refreshStatus } = useConfigStatus()

  const [apptNotif, setApptNotif] = useState(DEFAULT_APPT_NOTIF)
  const [apptLoading, setApptLoading] = useState(false)
  const [apptSaving, setApptSaving]   = useState(false)

  const [businessTimezone, setBusinessTimezone] = useState('Africa/Casablanca')

  const [calendarStatus, setCalendarStatus]         = useState<{ google: CalendarStatus; microsoft: CalendarStatus }>({ google: null, microsoft: null })
  const [calendarLoading, setCalendarLoading]       = useState(false)
  const [calendarDisconnecting, setCalendarDisconnecting] = useState<string | null>(null)

  // Google calendar picker
  const [googleCalendars, setGoogleCalendars]     = useState<{ id: string; summary: string; primary: boolean }[]>([])
  const [selectedGoogleCalId, setSelectedGoogleCalId] = useState('primary')
  const [googleCalSaving, setGoogleCalSaving]     = useState(false)

  // Microsoft calendar picker
  const [msCalendars, setMsCalendars]             = useState<{ id: string; name: string; isDefaultCalendar: boolean }[]>([])
  const [selectedMsCalId, setSelectedMsCalId]     = useState('primary')
  const [msCalSaving, setMsCalSaving]             = useState(false)

  const fetchApptNotif = useCallback(async () => {
    setApptLoading(true)
    const res  = await fetch('/api/settings/appointment-notifications')
    const json = await res.json()
    if (json.data) {
      const d = json.data as AppointmentNotificationSettings
      setApptNotif({
        reminder1_enabled: d.reminder1_enabled, reminder1_delay_value: d.reminder1_delay_value, reminder1_delay_unit: d.reminder1_delay_unit, reminder1_fixed_send_time: d.reminder1_fixed_send_time ?? null, reminder1_message: d.reminder1_message,
        reminder2_enabled: d.reminder2_enabled, reminder2_delay_value: d.reminder2_delay_value, reminder2_delay_unit: d.reminder2_delay_unit, reminder2_fixed_send_time: d.reminder2_fixed_send_time ?? null, reminder2_message: d.reminder2_message,
        reminder3_enabled: d.reminder3_enabled, reminder3_delay_value: d.reminder3_delay_value, reminder3_delay_unit: d.reminder3_delay_unit, reminder3_fixed_send_time: d.reminder3_fixed_send_time ?? null, reminder3_message: d.reminder3_message,
        post_messages_enabled: d.post_messages_enabled,
        post_show_message:     d.post_show_message,
        post_no_show_message:  d.post_no_show_message,
      })
    }
    setApptLoading(false)
  }, [])

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true)
    const res  = await fetch('/api/calendar')
    const json = await res.json()
    if (json.data) {
      setCalendarStatus(json.data)

      // Fetch Google calendar list if connected
      if (json.data.google) {
        fetch('/api/calendar/google/calendars')
          .then(r => r.json())
          .then(cJson => {
            if (cJson.data) {
              setGoogleCalendars(cJson.data.calendars ?? [])
              setSelectedGoogleCalId(cJson.data.selectedId ?? 'primary')
            }
          })
          .catch(() => {})
      }

      // Fetch Microsoft calendar list if connected
      if (json.data.microsoft) {
        fetch('/api/calendar/microsoft/calendars')
          .then(r => r.json())
          .then(cJson => {
            if (cJson.data) {
              setMsCalendars(cJson.data.calendars ?? [])
              setSelectedMsCalId(cJson.data.selectedId ?? 'primary')
            }
          })
          .catch(() => {})
      }
    }
    setCalendarLoading(false)
  }, [])

  useEffect(() => {
    fetchApptNotif()
    fetchCalendar()
    fetch('/api/settings/profile').then(r => r.json()).then(json => {
      if (json.data?.timezone) setBusinessTimezone(json.data.timezone)
    })
  }, [fetchApptNotif, fetchCalendar])

  const handleSaveApptNotif = async (e: React.FormEvent) => {
    e.preventDefault()
    setApptSaving(true)
    const res  = await fetch('/api/settings/appointment-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apptNotif),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else { refreshStatus(); toast.success(t('settings.toast.apptNotifSaved')) }
    setApptSaving(false)
  }

  const handleDisconnectCalendar = async (provider: 'google' | 'microsoft') => {
    setCalendarDisconnecting(provider)
    const res  = await fetch(`/api/calendar/disconnect?provider=${provider}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(t('settings.toast.calendarDisconnected', { name: provider === 'google' ? 'Google Calendar' : 'Outlook Calendar' }))
      setCalendarStatus((s) => ({ ...s, [provider]: null }))
      if (provider === 'google') setGoogleCalendars([])
      if (provider === 'microsoft') setMsCalendars([])
    }
    setCalendarDisconnecting(null)
  }

  const handleChangeGoogleCalendar = async (calId: string) => {
    setGoogleCalSaving(true)
    setSelectedGoogleCalId(calId)
    const res = await fetch('/api/calendar/google/watch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_id: calId }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else toast.success('Calendrier Google mis à jour')
    setGoogleCalSaving(false)
  }

  const handleChangeMsCalendar = async (calId: string) => {
    setMsCalSaving(true)
    setSelectedMsCalId(calId)
    const res = await fetch('/api/calendar/microsoft/watch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_id: calId }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else toast.success('Calendrier Outlook mis à jour')
    setMsCalSaving(false)
  }

  const apptReminders = [
    { num: 1, enabled: apptNotif.reminder1_enabled, delayValue: apptNotif.reminder1_delay_value, delayUnit: apptNotif.reminder1_delay_unit, fixedSendTime: apptNotif.reminder1_fixed_send_time, message: apptNotif.reminder1_message,
      setEnabled: (v: boolean) => setApptNotif({ ...apptNotif, reminder1_enabled: v }),
      setDelayValue: (v: number) => setApptNotif({ ...apptNotif, reminder1_delay_value: v }),
      setDelayUnit: (v: string) => setApptNotif({ ...apptNotif, reminder1_delay_unit: v as AppointmentNotificationSettings['reminder1_delay_unit'], reminder1_fixed_send_time: null }),
      setFixedSendTime: (v: string | null) => setApptNotif({ ...apptNotif, reminder1_fixed_send_time: v }),
      setMessage: (v: string) => setApptNotif({ ...apptNotif, reminder1_message: v }),
    },
    { num: 2, enabled: apptNotif.reminder2_enabled, delayValue: apptNotif.reminder2_delay_value, delayUnit: apptNotif.reminder2_delay_unit, fixedSendTime: apptNotif.reminder2_fixed_send_time, message: apptNotif.reminder2_message,
      setEnabled: (v: boolean) => setApptNotif({ ...apptNotif, reminder2_enabled: v }),
      setDelayValue: (v: number) => setApptNotif({ ...apptNotif, reminder2_delay_value: v }),
      setDelayUnit: (v: string) => setApptNotif({ ...apptNotif, reminder2_delay_unit: v as AppointmentNotificationSettings['reminder2_delay_unit'], reminder2_fixed_send_time: null }),
      setFixedSendTime: (v: string | null) => setApptNotif({ ...apptNotif, reminder2_fixed_send_time: v }),
      setMessage: (v: string) => setApptNotif({ ...apptNotif, reminder2_message: v }),
    },
    { num: 3, enabled: apptNotif.reminder3_enabled, delayValue: apptNotif.reminder3_delay_value, delayUnit: apptNotif.reminder3_delay_unit, fixedSendTime: apptNotif.reminder3_fixed_send_time, message: apptNotif.reminder3_message,
      setEnabled: (v: boolean) => setApptNotif({ ...apptNotif, reminder3_enabled: v }),
      setDelayValue: (v: number) => setApptNotif({ ...apptNotif, reminder3_delay_value: v }),
      setDelayUnit: (v: string) => setApptNotif({ ...apptNotif, reminder3_delay_unit: v as AppointmentNotificationSettings['reminder3_delay_unit'], reminder3_fixed_send_time: null }),
      setFixedSendTime: (v: string | null) => setApptNotif({ ...apptNotif, reminder3_fixed_send_time: v }),
      setMessage: (v: string) => setApptNotif({ ...apptNotif, reminder3_message: v }),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Rendez-vous</h2>
        <p className="text-sm text-muted-foreground">Rappels WhatsApp, messages post-RDV et synchronisation calendrier.</p>
      </div>

      {/* Calendar sync — compact */}
      {!calendarLoading && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {!calendarStatus.google && !calendarStatus.microsoft && (
              <>
                <a href="/api/calendar/google/connect">
                  <Button variant="outline" size="sm" className="gap-2">
                    <GoogleLogo />Sync Google Calendar
                  </Button>
                </a>
                <a href="/api/calendar/microsoft/connect">
                  <Button variant="outline" size="sm" className="gap-2">
                    <MicrosoftLogo />Sync Outlook Calendar
                  </Button>
                </a>
              </>
            )}
            {calendarStatus.google && (
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive border-destructive/40"
                disabled={calendarDisconnecting === 'google'}
                onClick={() => handleDisconnectCalendar('google')}>
                <GoogleLogo />
                {calendarDisconnecting === 'google' ? t('settings.disconnecting') : 'Unsync Google Calendar'}
              </Button>
            )}
            {calendarStatus.microsoft && (
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive border-destructive/40"
                disabled={calendarDisconnecting === 'microsoft'}
                onClick={() => handleDisconnectCalendar('microsoft')}>
                <MicrosoftLogo />
                {calendarDisconnecting === 'microsoft' ? t('settings.disconnecting') : 'Unsync Outlook Calendar'}
              </Button>
            )}
          </div>

          {/* Google calendar picker */}
          {calendarStatus.google && googleCalendars.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <GoogleLogo />
                <span className="text-xs text-muted-foreground">Calendrier synchronisé :</span>
              </div>
              <Select value={selectedGoogleCalId} onValueChange={handleChangeGoogleCalendar} disabled={googleCalSaving}>
                <SelectTrigger className="h-7 text-xs w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {googleCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.summary}{c.primary ? ' (principal)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Outlook calendar picker */}
          {calendarStatus.microsoft && msCalendars.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <MicrosoftLogo />
                <span className="text-xs text-muted-foreground">Calendrier synchronisé :</span>
              </div>
              <Select value={selectedMsCalId} onValueChange={handleChangeMsCalendar} disabled={msCalSaving}>
                <SelectTrigger className="h-7 text-xs w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {msCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.isDefaultCalendar ? ' (principal)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Appointment notifications */}
      {apptLoading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <form onSubmit={handleSaveApptNotif} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rappels avant le rendez-vous</CardTitle>
              <p className="text-sm text-muted-foreground">Envoyés par WhatsApp avant l&apos;heure du rendez-vous.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {apptReminders.map((r) => (
                <div key={r.num} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Rappel {r.num}</span>
                    <Toggle checked={r.enabled} onChange={r.setEnabled} />
                  </div>
                  {r.enabled && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground shrink-0">Envoyer</span>
                        <Input type="number" min="1" className="h-7 w-20 text-xs" value={r.delayValue} onChange={(e) => r.setDelayValue(parseInt(e.target.value) || 1)} />
                        <Select value={r.delayUnit} onValueChange={r.setDelayUnit}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Heures</SelectItem>
                            <SelectItem value="days">Jours</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground shrink-0">avant le RDV</span>
                      </div>
                      {r.delayUnit === 'days' && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground shrink-0">À l&apos;heure fixe (optionnel)</span>
                            <Input type="time" className="h-7 w-28 text-xs" value={r.fixedSendTime ?? ''} onChange={(e) => r.setFixedSendTime(e.target.value || null)} />
                            {r.fixedSendTime && <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => r.setFixedSendTime(null)}>✕</button>}
                          </div>
                          {r.fixedSendTime && (
                            <p className="text-xs text-muted-foreground pl-0.5">Heure locale — fuseau : {businessTimezone}</p>
                          )}
                        </div>
                      )}
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                        placeholder={`Message du rappel ${r.num}...`}
                        value={r.message}
                        onChange={(e) => r.setMessage(e.target.value)}
                        rows={2}
                      />
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Messages post-rendez-vous</CardTitle>
                  <p className="text-sm text-muted-foreground">Envoyés automatiquement après avoir marqué un RDV comme honoré ou manqué.</p>
                </div>
                <Toggle checked={apptNotif.post_messages_enabled} onChange={(v) => setApptNotif({ ...apptNotif, post_messages_enabled: v })} />
              </div>
            </CardHeader>
            {apptNotif.post_messages_enabled && (
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Message après &quot;Honoré&quot; ✓</Label>
                  <textarea className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" placeholder="Merci pour votre visite ! À bientôt." value={apptNotif.post_show_message} onChange={(e) => setApptNotif({ ...apptNotif, post_show_message: e.target.value })} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Message après &quot;Non honoré&quot; ✗</Label>
                  <textarea className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" placeholder="Vous avez manqué votre rendez-vous. Contactez-nous pour en planifier un nouveau." value={apptNotif.post_no_show_message} onChange={(e) => setApptNotif({ ...apptNotif, post_no_show_message: e.target.value })} rows={3} />
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-dashed">
            <CardContent className="pt-4 text-sm text-muted-foreground space-y-2">
              <p>Pour que les rappels fonctionnent, ajoutez ce cron job (toutes les minutes) :</p>
              <code className="block bg-muted p-2 rounded text-xs font-mono">GET /api/jobs/appointment-reminders?secret=CRON_SECRET</code>
            </CardContent>
          </Card>

          <Button type="submit" disabled={apptSaving}>{apptSaving ? t('settings.saving') : t('settings.saveApptNotif')}</Button>
        </form>
      )}

    </div>
  )
}
