'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { OrderNotificationSettings } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

const DEFAULT_ORDER_NOTIF: Omit<OrderNotificationSettings, 'business_id' | 'updated_at'> = {
  ready_message:                   'Bonjour ! Votre commande #{reference} est prête. Vous pouvez venir la récupérer. Merci !',
  reminder1_enabled:               true,  reminder1_delay_value: 2,   reminder1_delay_unit: 'hours',
  reminder1_message:               'Rappel : votre commande #{reference} est toujours disponible.',
  reminder2_enabled:               false, reminder2_delay_value: 24,  reminder2_delay_unit: 'hours', reminder2_message: '',
  reminder3_enabled:               false, reminder3_delay_value: 48,  reminder3_delay_unit: 'hours', reminder3_message: '',
  order_ready_correction_template: "Bonjour, nous sommes désolés : une erreur s'est produite. Votre commande n'est pas encore prête. Nous vous préviendrons dès qu'elle sera disponible.",
}

export default function OrdersSettingsPage() {
  const { t } = useI18n()
  const { refresh: refreshStatus } = useConfigStatus()

  const [orderNotif, setOrderNotif] = useState(DEFAULT_ORDER_NOTIF)
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/settings/order-notifications')
    const json = await res.json()
    if (json.data) {
      const d = json.data as OrderNotificationSettings
      setOrderNotif({
        ready_message:                   d.ready_message,
        reminder1_enabled:               d.reminder1_enabled, reminder1_delay_value: d.reminder1_delay_value, reminder1_delay_unit: d.reminder1_delay_unit, reminder1_message: d.reminder1_message,
        reminder2_enabled:               d.reminder2_enabled, reminder2_delay_value: d.reminder2_delay_value, reminder2_delay_unit: d.reminder2_delay_unit, reminder2_message: d.reminder2_message,
        reminder3_enabled:               d.reminder3_enabled, reminder3_delay_value: d.reminder3_delay_value, reminder3_delay_unit: d.reminder3_delay_unit, reminder3_message: d.reminder3_message,
        order_ready_correction_template: d.order_ready_correction_template ?? DEFAULT_ORDER_NOTIF.order_ready_correction_template,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res  = await fetch('/api/settings/order-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderNotif),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else { refreshStatus(); toast.success(t('settings.toast.orderNotifSaved')) }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>

  const reminders = [
    { num: 1, enabled: orderNotif.reminder1_enabled, delayValue: orderNotif.reminder1_delay_value, delayUnit: orderNotif.reminder1_delay_unit, message: orderNotif.reminder1_message,
      setEnabled:    (v: boolean) => setOrderNotif({ ...orderNotif, reminder1_enabled: v }),
      setDelayValue: (v: number)  => setOrderNotif({ ...orderNotif, reminder1_delay_value: v }),
      setDelayUnit:  (v: string)  => setOrderNotif({ ...orderNotif, reminder1_delay_unit: v as OrderNotificationSettings['reminder1_delay_unit'] }),
      setMessage:    (v: string)  => setOrderNotif({ ...orderNotif, reminder1_message: v }),
    },
    { num: 2, enabled: orderNotif.reminder2_enabled, delayValue: orderNotif.reminder2_delay_value, delayUnit: orderNotif.reminder2_delay_unit, message: orderNotif.reminder2_message,
      setEnabled:    (v: boolean) => setOrderNotif({ ...orderNotif, reminder2_enabled: v }),
      setDelayValue: (v: number)  => setOrderNotif({ ...orderNotif, reminder2_delay_value: v }),
      setDelayUnit:  (v: string)  => setOrderNotif({ ...orderNotif, reminder2_delay_unit: v as OrderNotificationSettings['reminder2_delay_unit'] }),
      setMessage:    (v: string)  => setOrderNotif({ ...orderNotif, reminder2_message: v }),
    },
    { num: 3, enabled: orderNotif.reminder3_enabled, delayValue: orderNotif.reminder3_delay_value, delayUnit: orderNotif.reminder3_delay_unit, message: orderNotif.reminder3_message,
      setEnabled:    (v: boolean) => setOrderNotif({ ...orderNotif, reminder3_enabled: v }),
      setDelayValue: (v: number)  => setOrderNotif({ ...orderNotif, reminder3_delay_value: v }),
      setDelayUnit:  (v: string)  => setOrderNotif({ ...orderNotif, reminder3_delay_unit: v as OrderNotificationSettings['reminder3_delay_unit'] }),
      setMessage:    (v: string)  => setOrderNotif({ ...orderNotif, reminder3_message: v }),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Commandes</h2>
        <p className="text-sm text-muted-foreground">Messages WhatsApp envoyés lors de la gestion des commandes.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Message "Commande prête" */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message &quot;Commande prête&quot;</CardTitle>
            <p className="text-sm text-muted-foreground">
              Envoyé par WhatsApp quand vous marquez une commande comme prête.
              Utilisez <code className="bg-muted px-1 py-0.5 rounded text-xs">#{'{reference}'}</code> pour insérer la référence.
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Bonjour ! Votre commande #{reference} est prête..."
              value={orderNotif.ready_message}
              onChange={(e) => setOrderNotif({ ...orderNotif, ready_message: e.target.value })}
              required
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Rappels automatiques */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rappels automatiques</CardTitle>
            <p className="text-sm text-muted-foreground">Envoyés si la commande n&apos;est pas récupérée après le délai configuré.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {reminders.map((r) => (
              <div key={r.num} className="space-y-3 pb-4 border-b last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Rappel {r.num}</span>
                  <Toggle checked={r.enabled} onChange={r.setEnabled} />
                </div>
                {r.enabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">Délai après notification &quot;prête&quot; :</span>
                      <Input type="number" min="1" className="h-7 w-20 text-xs" value={r.delayValue} onChange={(e) => r.setDelayValue(parseInt(e.target.value) || 1)} />
                      <Select value={r.delayUnit} onValueChange={r.setDelayUnit}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">Minutes</SelectItem>
                          <SelectItem value="hours">Heures</SelectItem>
                          <SelectItem value="days">Jours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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

        {/* Message correction erreur Ready */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message correction erreur &quot;Prête&quot;</CardTitle>
            <p className="text-sm text-muted-foreground">
              Envoyé si vous repassez une commande de &ldquo;Prête&rdquo; à &ldquo;En attente&rdquo; après que le message initial a déjà été envoyé.
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              value={orderNotif.order_ready_correction_template}
              onChange={(e) => setOrderNotif({ ...orderNotif, order_ready_correction_template: e.target.value })}
              required
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Cron note */}
        <Card className="border-dashed">
          <CardContent className="pt-4 text-sm text-muted-foreground space-y-2">
            <p>Pour que les rappels et l&apos;envoi différé fonctionnent, ajoutez ces cron jobs (toutes les minutes) :</p>
            <code className="block bg-muted p-2 rounded text-xs font-mono">GET /api/jobs/order-reminders?secret=CRON_SECRET</code>
            <code className="block bg-muted p-2 rounded text-xs font-mono">GET /api/jobs/order-ready-notifications?secret=CRON_SECRET</code>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>{saving ? t('settings.saving') : t('settings.saveOrderNotif')}</Button>
      </form>
    </div>
  )
}
