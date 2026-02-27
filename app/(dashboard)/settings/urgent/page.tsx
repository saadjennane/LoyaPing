'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-green-500' : 'bg-muted-foreground/30'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

type Settings = {
  urgent_notify_reschedule:      boolean
  urgent_notify_negative_review: boolean
  urgent_whatsapp_number_1:      string
  urgent_whatsapp_number_2:      string
}

const DEFAULTS: Settings = {
  urgent_notify_reschedule:      false,
  urgent_notify_negative_review: false,
  urgent_whatsapp_number_1:      '',
  urgent_whatsapp_number_2:      '',
}

export default function UrgentSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    fetch('/api/settings/urgent')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          setSettings({
            urgent_notify_reschedule:      data.urgent_notify_reschedule      ?? false,
            urgent_notify_negative_review: data.urgent_notify_negative_review ?? false,
            urgent_whatsapp_number_1:      data.urgent_whatsapp_number_1      ?? '',
            urgent_whatsapp_number_2:      data.urgent_whatsapp_number_2      ?? '',
          })
        }
        setLoading(false)
      })
  }, [])

  const anyToggleEnabled = settings.urgent_notify_reschedule || settings.urgent_notify_negative_review
  const hasNumber        = !!(settings.urgent_whatsapp_number_1.trim() || settings.urgent_whatsapp_number_2.trim())
  const validationError  = anyToggleEnabled && !hasNumber
    ? 'Veuillez renseigner au moins un numéro WhatsApp pour activer les alertes.'
    : null

  const save = async () => {
    if (validationError) { toast.error(validationError); return }
    setSaving(true)
    const res  = await fetch('/api/settings/urgent', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const json = await res.json()
    if (json.error) toast.error('Erreur lors de la sauvegarde')
    else            toast.success('Paramètres sauvegardés')
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Chargement...</div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Urgences</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Recevez une alerte WhatsApp lors d'événements critiques
        </p>
      </div>

      {/* Numéros à prévenir */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Numéros à prévenir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Numéros WhatsApp au format international (ex : +212612345678). Maximum 2 numéros.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="number1">Numéro WhatsApp 1</Label>
            <Input
              id="number1"
              type="tel"
              placeholder="+212612345678"
              value={settings.urgent_whatsapp_number_1}
              onChange={(e) => setSettings((s) => ({ ...s, urgent_whatsapp_number_1: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="number2">Numéro WhatsApp 2 <span className="text-muted-foreground">(optionnel)</span></Label>
            <Input
              id="number2"
              type="tel"
              placeholder="+212612345678"
              value={settings.urgent_whatsapp_number_2}
              onChange={(e) => setSettings((s) => ({ ...s, urgent_whatsapp_number_2: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alertes WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Replanification de RDV</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                M'avertir lorsqu'un client souhaite replanifier son rendez-vous
              </p>
            </div>
            <Toggle
              checked={settings.urgent_notify_reschedule}
              onChange={(v) => setSettings((s) => ({ ...s, urgent_notify_reschedule: v }))}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium">Avis négatif</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                M'avertir lorsqu'un client laisse un avis négatif
              </p>
            </div>
            <Toggle
              checked={settings.urgent_notify_negative_review}
              onChange={(v) => setSettings((s) => ({ ...s, urgent_notify_negative_review: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}

      {/* Pending events quick-links */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
        <CardContent className="pt-4 pb-4 space-y-2">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Traiter les urgences en attente</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/appointments"
              className="text-xs underline underline-offset-2 text-amber-800 dark:text-amber-300 hover:text-amber-900"
            >
              RDV à replanifier →
            </Link>
            <Link
              href="/reviews"
              className="text-xs underline underline-offset-2 text-amber-800 dark:text-amber-300 hover:text-amber-900"
            >
              Avis négatifs →
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white"
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  )
}
