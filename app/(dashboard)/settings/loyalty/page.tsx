'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Minus, AlertCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LoyaltyProgram, LoyaltyTier } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'
import { WORLD_CURRENCIES } from '@/lib/currencies'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

type TierForm = {
  required_points: string
  reward_title: string
  validity_days: string
  notification_message_template: string
}
const EMPTY_TIER: TierForm = { required_points: '', reward_title: '', validity_days: '', notification_message_template: '' }

export default function LoyaltySettingsPage() {
  const { t } = useI18n()
  const { refresh: refreshStatus } = useConfigStatus()

  const [loyaltyProgForm, setLoyaltyProgForm] = useState({
    type: 'passage' as 'passage' | 'montant',
    points_per_visit: '1',
    currency: 'MAD',
    conversion_amount_per_point: '10',
    notify_on_tier: true,
  })
  const [loyaltyTiers, setLoyaltyTiers] = useState<TierForm[]>([{ ...EMPTY_TIER }])
  const [loading, setLoading]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [tiersOpen, setTiersOpen]       = useState(false)
  const [birthdayOpen, setBirthdayOpen] = useState(false)
  const [birthdayForm, setBirthdayForm] = useState({
    birthday_reward_enabled:   false,
    birthday_reward_title:     '',
    birthday_message_enabled:  false,
    birthday_message_template: '',
    birthday_send_hour:        9,
  })

  const [businessTimezone, setBusinessTimezone] = useState('Africa/Casablanca')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [progRes, tiersRes, profileRes] = await Promise.all([
      fetch('/api/loyalty/programs').then((r) => r.json()),
      fetch('/api/loyalty/tiers').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ])
    if (profileRes.data?.timezone) setBusinessTimezone(profileRes.data.timezone)
    if (progRes.data) {
      const p = progRes.data as LoyaltyProgram
      const isPreset = WORLD_CURRENCIES.some((c) => c.code === (p.currency ?? ''))
      setLoyaltyProgForm({
        type:                        p.type,
        points_per_visit:            String(p.points_per_visit ?? 1),
        currency:                    isPreset ? (p.currency ?? 'MAD') : 'MAD',
        conversion_amount_per_point: String(p.conversion_amount_per_point ?? 10),
        notify_on_tier:              p.notify_on_tier ?? true,
      })
      setBirthdayForm({
        birthday_reward_enabled:   p.birthday_reward_enabled   ?? false,
        birthday_reward_title:     p.birthday_reward_title     ?? '',
        birthday_message_enabled:  p.birthday_message_enabled  ?? false,
        birthday_message_template: p.birthday_message_template ?? '',
        birthday_send_hour:        p.birthday_send_hour        ?? 9,
      })
      if (p.birthday_reward_enabled) setBirthdayOpen(true)
    }
    const tiers = (tiersRes.data ?? []) as LoyaltyTier[]
    const loaded: TierForm[] = [...tiers]
      .sort((a, b) => a.tier_order - b.tier_order)
      .map((t) => ({
        required_points:               String(t.required_points),
        reward_title:                  t.reward_title ?? '',
        validity_days:                 t.validity_days ? String(t.validity_days) : '',
        notification_message_template: t.notification_message_template ?? '',
      }))
    setLoyaltyTiers(loaded.length > 0 ? loaded : [{ ...EMPTY_TIER }])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const points = parseInt(loyaltyProgForm.points_per_visit) || 1
    const cap    = parseFloat(loyaltyProgForm.conversion_amount_per_point) || 0

    if (loyaltyProgForm.type === 'passage' && points < 1) {
      toast.error(t('settings.errors.pointsPerVisit')); setSaving(false); return
    }
    if (loyaltyProgForm.type === 'montant' && cap <= 0) {
      toast.error(t('settings.errors.amountPerPoint')); setSaving(false); return
    }

    const filledPoints = loyaltyTiers.map((ti) => parseInt(ti.required_points)).filter((v) => !isNaN(v) && v > 0)
    const isAscending  = filledPoints.every((v, i) => i === 0 || v > filledPoints[i - 1])
    if (!isAscending) { toast.error(t('settings.errors.tiersAscending')); setSaving(false); return }

    const progRes = await fetch('/api/loyalty/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:                        loyaltyProgForm.type,
        currency:                    loyaltyProgForm.type === 'montant' ? loyaltyProgForm.currency : null,
        conversion_amount_per_point: loyaltyProgForm.type === 'montant' ? cap : null,
        points_per_visit:            loyaltyProgForm.type === 'passage' ? points : null,
        notify_on_tier:              loyaltyProgForm.notify_on_tier,
        birthday_reward_enabled:     birthdayForm.birthday_reward_enabled,
        birthday_reward_title:       birthdayForm.birthday_reward_title.trim() || null,
        birthday_message_enabled:    birthdayForm.birthday_message_enabled,
        birthday_message_template:   birthdayForm.birthday_message_template.trim() || null,
        birthday_send_hour:          birthdayForm.birthday_send_hour,
      }),
    }).then((r) => r.json())
    if (progRes.error) { toast.error(progRes.error); setSaving(false); return }

    const tiersToSave = loyaltyTiers
      .map((ti, i) => ({ ...ti, tier_order: i + 1 }))
      .filter((ti) => ti.required_points.trim() !== '' && parseInt(ti.required_points) > 0)
      .map((ti) => ({
        tier_order:                    ti.tier_order,
        required_points:               parseInt(ti.required_points),
        reward_title:                  ti.reward_title.trim() || null,
        reward_description:            ti.reward_title.trim() || 'Récompense',
        validity_days:                 ti.validity_days.trim() ? parseInt(ti.validity_days) : null,
        notification_message_template: ti.notification_message_template,
        is_enabled:                    true,
      }))

    const tiersRes = await fetch('/api/loyalty/tiers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiers: tiersToSave }),
    }).then((r) => r.json())
    if (tiersRes.error) { toast.error(tiersRes.error); setSaving(false); return }

    refreshStatus()
    toast.success(t('settings.toast.loyaltySaved'))
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>

  const filledPts  = loyaltyTiers.map((ti) => parseInt(ti.required_points)).filter((v) => !isNaN(v) && v > 0)
  const isAscOk    = filledPts.every((v, i) => i === 0 || v > filledPts[i - 1])

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Fidélité</h2>
        <p className="text-sm text-muted-foreground">Programme de fidélité, paliers et récompenses.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Programme */}
        <Card>
          <CardHeader><CardTitle className="text-base">Mode de fidélité</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              {(['passage', 'montant'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setLoyaltyProgForm((f) => ({ ...f, type: mode }))}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${loyaltyProgForm.type === mode ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-muted-foreground/40'}`}>
                  {mode === 'passage' ? '🎯 Par passage' : '💰 Par montant'}
                  <div className="text-xs font-normal text-muted-foreground mt-0.5">
                    {mode === 'passage' ? 'Points fixes par visite' : 'Points selon le montant dépensé'}
                  </div>
                </button>
              ))}
            </div>

            {loyaltyProgForm.type === 'passage' && (
              <div className="space-y-1">
                <Label>Points crédités par visite / RDV</Label>
                <Input type="number" min="1" className="w-36" value={loyaltyProgForm.points_per_visit} onChange={(e) => setLoyaltyProgForm((f) => ({ ...f, points_per_visit: e.target.value }))} required />
              </div>
            )}

            {loyaltyProgForm.type === 'montant' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Devise</Label>
                  <Select value={loyaltyProgForm.currency} onValueChange={(v) => setLoyaltyProgForm((f) => ({ ...f, currency: v }))}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORLD_CURRENCIES.map(({ code, flag, name }) => (
                        <SelectItem key={code} value={code}>{flag} {code} — {name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Règle de conversion</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">1 point tous les</span>
                    <Input type="number" min="0.01" step="0.01" className="w-24" value={loyaltyProgForm.conversion_amount_per_point} onChange={(e) => setLoyaltyProgForm((f) => ({ ...f, conversion_amount_per_point: e.target.value }))} required />
                    <span className="text-sm text-muted-foreground">{loyaltyProgForm.currency}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Ex : {loyaltyProgForm.conversion_amount_per_point} {loyaltyProgForm.currency} dépensés = 1 point.</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <div className="text-sm font-medium">Envoyer un message quand un palier est atteint</div>
                <div className="text-xs text-muted-foreground">Via WhatsApp, avec le modèle configuré par palier</div>
              </div>
              <Toggle checked={loyaltyProgForm.notify_on_tier} onChange={(v) => setLoyaltyProgForm((f) => ({ ...f, notify_on_tier: v }))} />
            </div>
          </CardContent>
        </Card>

        {/* Paliers — section collapsible */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setTiersOpen((o) => !o)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Gestion des paliers</CardTitle>
                {filledPts.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {filledPts.length} palier{filledPts.length > 1 ? 's' : ''} configuré{filledPts.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${tiersOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>

          {tiersOpen && (
            <CardContent className="space-y-3 pt-0">
              {loyaltyTiers.map((tier, idx) => (
                <Card key={idx} className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold">{idx + 1}</span>
                        Palier {idx + 1}
                      </CardTitle>
                      {loyaltyTiers.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setLoyaltyTiers((prev) => prev.filter((_, i) => i !== idx))}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Points requis</Label>
                        <Input type="number" min="1" placeholder="ex: 10" value={tier.required_points} onChange={(e) => { const next = [...loyaltyTiers]; next[idx] = { ...next[idx], required_points: e.target.value }; setLoyaltyTiers(next) }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Récompense</Label>
                        <Input placeholder="ex: -10%, Café offert…" value={tier.reward_title} onChange={(e) => { const next = [...loyaltyTiers]; next[idx] = { ...next[idx], reward_title: e.target.value }; setLoyaltyTiers(next) }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Validité (jours) <span className="text-muted-foreground font-normal">— vide = pas d&apos;expiration</span></Label>
                      <Input type="number" min="1" placeholder="Aucune expiration" className="w-44" value={tier.validity_days} onChange={(e) => { const next = [...loyaltyTiers]; next[idx] = { ...next[idx], validity_days: e.target.value }; setLoyaltyTiers(next) }} />
                    </div>
                    {loyaltyProgForm.notify_on_tier && (
                      <div className="space-y-1">
                        <Label className="text-xs">Message WhatsApp (palier atteint)</Label>
                        <textarea
                          className="flex min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                          placeholder={`Félicitations ! Vous avez atteint le palier "${tier.reward_title || 'Récompense'}".`}
                          value={tier.notification_message_template}
                          rows={2}
                          onChange={(e) => { const next = [...loyaltyTiers]; next[idx] = { ...next[idx], notification_message_template: e.target.value }; setLoyaltyTiers(next) }}
                        />
                        <p className="text-xs text-muted-foreground">Variables : <code className="bg-muted px-1 rounded">#{'{expiry_date}'}</code>, <code className="bg-muted px-1 rounded">#{'{reward_title}'}</code></p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {!isAscOk && filledPts.length > 1 && (
                <div className="flex items-center gap-2 text-amber-600 text-xs px-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Les points requis doivent être croissants d&apos;un palier à l&apos;autre.
                </div>
              )}

              {loyaltyTiers.length < 5 && (
                <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setLoyaltyTiers((prev) => [...prev, { ...EMPTY_TIER }])}>
                  <Plus className="h-4 w-4 mr-2" /> Ajouter un palier
                </Button>
              )}
            </CardContent>
          )}
        </Card>

        {/* Cadeau d'anniversaire — section collapsible */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setBirthdayOpen((o) => !o)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Cadeau d&apos;anniversaire</CardTitle>
                {birthdayForm.birthday_reward_enabled && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Activé
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${birthdayOpen ? 'rotate-180' : ''}`} />
            </div>
            <p className="text-sm text-muted-foreground font-normal mt-0.5">
              Offrir automatiquement un cadeau le jour d&apos;anniversaire du client.
            </p>
          </CardHeader>

          {birthdayOpen && (
            <CardContent className="space-y-4 pt-0">
              {/* Toggle principal */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-sm font-medium">Activer le cadeau d&apos;anniversaire</div>
                  <div className="text-xs text-muted-foreground">Un coupon est automatiquement créé le jour J</div>
                </div>
                <Toggle
                  checked={birthdayForm.birthday_reward_enabled}
                  onChange={(v) => setBirthdayForm((f) => ({ ...f, birthday_reward_enabled: v }))}
                />
              </div>

              {birthdayForm.birthday_reward_enabled && (
                <>
                  {/* Description du cadeau */}
                  <div className="space-y-1">
                    <Label>Description du cadeau</Label>
                    <Input
                      placeholder="ex : Café offert, -15%, Dessert offert…"
                      value={birthdayForm.birthday_reward_title}
                      onChange={(e) => setBirthdayForm((f) => ({ ...f, birthday_reward_title: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ce texte est affiché dans le portail client et utilisé dans le message WhatsApp.
                    </p>
                  </div>

                  {/* Toggle message */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <div className="text-sm font-medium">Envoyer un message WhatsApp</div>
                      <div className="text-xs text-muted-foreground">Envoyé automatiquement le matin du jour d&apos;anniversaire</div>
                    </div>
                    <Toggle
                      checked={birthdayForm.birthday_message_enabled}
                      onChange={(v) => setBirthdayForm((f) => ({ ...f, birthday_message_enabled: v }))}
                    />
                  </div>

                  {birthdayForm.birthday_message_enabled && (
                    <div className="space-y-3">
                      {/* Heure d'envoi */}
                      <div className="space-y-1">
                        <Label className="text-xs">Heure d&apos;envoi</Label>
                        <div className="flex items-center gap-2">
                          <Select
                            value={String(birthdayForm.birthday_send_hour)}
                            onValueChange={(v) => setBirthdayForm((f) => ({ ...f, birthday_send_hour: parseInt(v) }))}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, h) => (
                                <SelectItem key={h} value={String(h)}>
                                  {String(h).padStart(2, '0')}h00
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">{businessTimezone}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Heure locale selon le fuseau configuré dans Organisation.
                        </p>
                      </div>

                      <div className="space-y-1">
                      <Label className="text-xs">Message</Label>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                        placeholder={`Joyeux anniversaire ! 🎂 Nous avons le plaisir de vous offrir ${birthdayForm.birthday_reward_title || 'un cadeau'} pour célébrer votre journée.`}
                        rows={3}
                        value={birthdayForm.birthday_message_template}
                        onChange={(e) => setBirthdayForm((f) => ({ ...f, birthday_message_template: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Variable disponible : <code className="bg-muted px-1 rounded">#{'{cadeau}'}</code> — remplacée par la description du cadeau.
                      </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          )}
        </Card>

        <Button type="submit" disabled={saving}>{saving ? t('settings.saving') : t('settings.saveLoyalty')}</Button>
      </form>
    </div>
  )
}
