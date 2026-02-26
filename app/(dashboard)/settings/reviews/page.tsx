'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ReviewSettings } from '@/lib/types'
import { useModules } from '@/lib/context/modules'

type DelayUnit = 'minutes' | 'hours' | 'days'

function toHours(value: number, unit: DelayUnit): number {
  if (unit === 'minutes') return Math.round(value / 60) || 1
  if (unit === 'days')    return value * 24
  return value
}

function fromHours(hours: number): { value: number; unit: DelayUnit } {
  if (hours >= 24 && hours % 24 === 0) return { value: hours / 24, unit: 'days' }
  return { value: hours, unit: 'hours' }
}

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

const DEFAULTS: Omit<ReviewSettings, 'business_id' | 'updated_at'> = {
  is_active:                     false,
  min_interactions:              3,
  delay_after_interaction_hours: 24,
  satisfaction_message:          'Bonjour {name} ! Étiez-vous satisfait(e) de votre dernière visite ?',
  positive_message:              'Super ! Vous pouvez nous laisser un avis ici 🙏',
  negative_message:              'Merci pour votre retour. Nous allons y remédier rapidement !',
  reminder_enabled:              false,
  reminder_delay_hours:          48,
  google_review_link:            null,
}

export default function ReviewsSettingsPage() {
  const { modules, setModules } = useModules()
  const [settings, setSettings] = useState<Omit<ReviewSettings, 'business_id' | 'updated_at'>>(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [togglingModule, setTogglingModule] = useState(false)

  // Local delay display (value + unit) — converted to/from hours on load/save
  const [delayValue, setDelayValue] = useState(24)
  const [delayUnit,  setDelayUnit]  = useState<DelayUnit>('hours')

  useEffect(() => {
    fetch('/api/settings/reviews')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          const { business_id: _b, updated_at: _u, ...rest } = data
          setSettings(rest)
          const { value, unit } = fromHours(rest.delay_after_interaction_hours ?? 24)
          setDelayValue(value)
          setDelayUnit(unit)
        }
        setLoading(false)
      })
  }, [])

  const save = async () => {
    setSaving(true)
    const payload = { ...settings, delay_after_interaction_hours: toHours(delayValue, delayUnit) }
    const res  = await fetch('/api/settings/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (json.error) toast.error('Erreur lors de la sauvegarde')
    else            toast.success('Paramètres sauvegardés')
    setSaving(false)
  }

  const toggleModule = async () => {
    setTogglingModule(true)
    const next = !modules.reviews_enabled
    const res  = await fetch('/api/settings/modules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modules, reviews_enabled: next }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      setModules({ ...modules, reviews_enabled: next })
      toast.success(next ? 'Module Reviews activé' : 'Module Reviews désactivé')
    }
    setTogglingModule(false)
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Chargement...</div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Paramètres Reviews</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Configuration du module demandes d'avis</p>
      </div>

      {/* ── Activation du module ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Module Reviews</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Affiche le module Reviews dans la navigation
              </p>
            </div>
            <Toggle
              checked={modules.reviews_enabled}
              onChange={toggleModule}
              disabled={togglingModule}
            />
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium">Envoi automatique actif</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active l'envoi automatique des demandes d'avis WhatsApp
              </p>
            </div>
            <Toggle
              checked={settings.is_active}
              onChange={(v) => setSettings((s) => ({ ...s, is_active: v }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Conditions d'envoi ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conditions d'envoi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="min_interactions">Nb min. d'interactions</Label>
              <Input
                id="min_interactions"
                type="number"
                min={1}
                max={99}
                value={settings.min_interactions}
                onChange={(e) => setSettings((s) => ({ ...s, min_interactions: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-xs text-muted-foreground">
                Nombre d'achats / RDV avant d'envoyer la demande
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Délai après interaction</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={delayValue}
                  onChange={(e) => setDelayValue(parseInt(e.target.value) || 1)}
                  className="w-24 shrink-0"
                />
                <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as DelayUnit)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Heures</SelectItem>
                    <SelectItem value="days">Jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Délai avant l'envoi de la demande d'avis
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Messages WhatsApp ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Messages WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="satisfaction_msg">Message de satisfaction</Label>
            <Textarea
              id="satisfaction_msg"
              rows={3}
              value={settings.satisfaction_message}
              onChange={(e) => setSettings((s) => ({ ...s, satisfaction_message: e.target.value }))}
              placeholder="Bonjour {name} ! Êtes-vous satisfait(e) ?"
            />
            <p className="text-xs text-muted-foreground">
              Utilisez <code className="text-xs bg-muted px-1 rounded">{'{name}'}</code> pour le prénom du client.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="positive_msg">Message après retour positif 👍</Label>
            <Textarea
              id="positive_msg"
              rows={3}
              value={settings.positive_message}
              onChange={(e) => setSettings((s) => ({ ...s, positive_message: e.target.value }))}
              placeholder="Super ! Laissez-nous un avis..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="negative_msg">Message après retour négatif 👎</Label>
            <Textarea
              id="negative_msg"
              rows={3}
              value={settings.negative_message}
              onChange={(e) => setSettings((s) => ({ ...s, negative_message: e.target.value }))}
              placeholder="Merci pour votre retour..."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Lien Google ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lien Google Reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="google_link">URL de votre page Google Reviews</Label>
          <Input
            id="google_link"
            type="url"
            value={settings.google_review_link ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, google_review_link: e.target.value || null }))}
            placeholder="https://g.page/r/..."
          />
          <p className="text-xs text-muted-foreground">
            Envoyé dans le message positif pour rediriger le client vers votre fiche Google.
          </p>
        </CardContent>
      </Card>

      {/* ── Relance ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Relance unique</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Activer la relance</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Une seule relance si pas de réponse ni de clic
              </p>
            </div>
            <Toggle
              checked={settings.reminder_enabled}
              onChange={(v) => setSettings((s) => ({ ...s, reminder_enabled: v }))}
            />
          </div>

          {settings.reminder_enabled && (
            <div className="space-y-1.5">
              <Label htmlFor="reminder_delay">Délai avant relance (h)</Label>
              <Input
                id="reminder_delay"
                type="number"
                min={1}
                max={720}
                value={settings.reminder_delay_hours}
                onChange={(e) => setSettings((s) => ({ ...s, reminder_delay_hours: parseInt(e.target.value) || 48 }))}
              />
            </div>
          )}
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
