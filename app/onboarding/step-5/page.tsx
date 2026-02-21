'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X, Star, Lock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY   = '#3B5BDB'
const FAKE_PTS  = 60

// ─── Types ────────────────────────────────────────────────────────────────────

type LoyaltyType = 'passage' | 'montant'

type Tier = {
  required_points:    number
  reward_description: string
  validity_days:      number | ''
}

// ─── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function MobilePreview({ tiers }: { tiers: Tier[] }) {
  const validTiers = tiers.filter((t) => t.required_points > 0 && t.reward_description.trim())
  const nextTier   = validTiers.find((t) => t.required_points > FAKE_PTS)
  const maxPts     = nextTier?.required_points ?? validTiers[validTiers.length - 1]?.required_points ?? 100
  const pct        = validTiers.length > 0 ? Math.min((FAKE_PTS / maxPts) * 100, 100) : 0

  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] shrink-0">
        <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
          {/* Notch */}
          <div className="h-6 bg-gray-800 flex items-center justify-center">
            <div className="w-16 h-3 bg-black rounded-full" />
          </div>

          {/* Screen */}
          <div className="bg-gray-50 overflow-y-auto text-gray-900" style={{ height: 520 }}>
            <div className="px-3 py-4 space-y-3">

              {/* Business header */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-10 w-full rounded-t-2xl" style={{ backgroundColor: PRIMARY }} />
                <div className="px-3 pb-3">
                  <div className="flex items-end gap-2 -mt-5 mb-1">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-base font-bold border-2 border-white shadow shrink-0"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      VC
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-tight pb-0.5">Votre commerce</div>
                  </div>
                </div>
              </div>

              {/* Loyalty block */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] font-semibold text-gray-700">Ma fidélité</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  {validTiers.length === 0 ? (
                    <div className="py-3 flex flex-col items-center gap-1">
                      <Star className="h-4 w-4 text-gray-200" />
                      <p className="text-[10px] text-gray-300 text-center">
                        Ajoutez un palier pour voir l&apos;aperçu
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Points + next tier label */}
                      <div className="flex justify-between text-[11px]">
                        <span className="font-semibold" style={{ color: PRIMARY }}>{FAKE_PTS} pts</span>
                        {nextTier && (
                          <span className="text-gray-400">Prochain palier à {nextTier.required_points} pts</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PRIMARY }} />
                      </div>

                      {/* Tier list */}
                      <div className="space-y-1 pt-0.5">
                        {validTiers.map((tier, i) => {
                          const reached = FAKE_PTS >= tier.required_points
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-1.5 text-[10px] py-0.5 ${reached ? '' : 'text-gray-400'}`}
                            >
                              <div
                                className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                                style={
                                  reached
                                    ? { borderColor: PRIMARY, backgroundColor: PRIMARY }
                                    : { borderColor: '#d1d5db' }
                                }
                              >
                                {reached
                                  ? <Check className="h-2 w-2 text-white" />
                                  : <Lock className="h-1.5 w-1.5 text-gray-300" />
                                }
                              </div>
                              <span className={reached ? 'font-medium text-gray-900' : ''}>
                                {tier.required_points} pts — {tier.reward_description}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="text-center text-[9px] text-gray-300">Propulsé par LoyaPing</p>
            </div>
          </div>

          {/* Home bar */}
          <div className="h-5 bg-gray-800 flex items-center justify-center">
            <div className="w-20 h-1 bg-gray-600 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tier card ────────────────────────────────────────────────────────────────

type TierCardProps = {
  index:     number
  tier:      Tier
  error?:    string
  onChange:  (t: Tier) => void
  onRemove:  () => void
  canRemove: boolean
}

function TierCard({ index, tier, error, onChange, onRemove, canRemove }: TierCardProps) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${error ? 'border-destructive/60 bg-destructive/5' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Palier {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Supprimer ce palier"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`pts-${index}`} className="text-xs text-muted-foreground">
            Points requis
          </Label>
          <Input
            id={`pts-${index}`}
            type="number"
            min={1}
            value={tier.required_points || ''}
            onChange={(e) => onChange({ ...tier, required_points: Math.max(1, Number(e.target.value) || 1) })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`validity-${index}`} className="text-xs text-muted-foreground">
            Validité <span className="font-normal">(jours, optionnel)</span>
          </Label>
          <Input
            id={`validity-${index}`}
            type="number"
            min={1}
            placeholder="Illimitée"
            value={tier.validity_days}
            onChange={(e) =>
              onChange({
                ...tier,
                validity_days: e.target.value === '' ? '' : Math.max(1, Number(e.target.value)),
              })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`reward-${index}`} className="text-xs text-muted-foreground">
          Récompense débloquée
        </Label>
        <Input
          id={`reward-${index}`}
          type="text"
          placeholder="Ex : Café offert, -10% sur votre prochaine visite…"
          value={tier.reward_description}
          onChange={(e) => onChange({ ...tier, reward_description: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      {tier.validity_days === '' && (
        <p className="text-[11px] text-muted-foreground">
          Si vide, la récompense n&apos;a pas de date d&apos;expiration.
        </p>
      )}

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  )
}

// ─── Notification preview ─────────────────────────────────────────────────────

function NotificationPreview({ template, rewardName, expiryLabel }: { template: string; rewardName: string; expiryLabel: string }) {
  const rendered = template
    .replace(/\{rewardName\}/g, rewardName)
    .replace(/\{expirationDate\}/g, expiryLabel)
    .trim() || '…'

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5 border border-dashed space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">Aperçu</p>
      <p className="text-xs text-foreground leading-relaxed">{rendered}</p>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIER: Tier = { required_points: 100, reward_description: '', validity_days: '' }

const DEFAULT_NOTIFICATION_TEMPLATE =
  "Félicitations ! Vous venez de débloquer {rewardName}. Offre valable jusqu'au {expirationDate}."

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingStep5() {
  const router = useRouter()

  const [loyaltyType,    setLoyaltyType]    = useState<LoyaltyType>('passage')
  const [pointsPerVisit, setPointsPerVisit] = useState(10)
  const [conversionRate, setConversionRate] = useState<number | ''>(1)
  const [tiers,          setTiers]          = useState<Tier[]>([{ ...DEFAULT_TIER }])
  const [notifyOnTier,   setNotifyOnTier]   = useState(false)
  const [notifTemplate,  setNotifTemplate]  = useState(DEFAULT_NOTIFICATION_TEMPLATE)
  const [currency,       setCurrency]       = useState('unité')
  const [saving,         setSaving]         = useState(false)
  const [prevStep,       setPrevStep]       = useState('/onboarding/step-2')
  const [stepLabel,      setStepLabel]      = useState({ current: 5, total: 5 })
  const redirected = useRef(false)

  // ── Birthday state ─────────────────────────────────────────────────────────
  const [birthdayRewardEnabled,   setBirthdayRewardEnabled]   = useState(false)
  const [birthdayRewardTitle,     setBirthdayRewardTitle]     = useState('')
  const [birthdayMessageEnabled,  setBirthdayMessageEnabled]  = useState(false)
  const [birthdayMessageTemplate, setBirthdayMessageTemplate] = useState('')
  const [birthdaySendHour,        setBirthdaySendHour]        = useState(9)
  const [businessTimezone,        setBusinessTimezone]        = useState('Africa/Casablanca')

  // Reload saved loyalty data if previously configured
  useEffect(() => {
    Promise.all([
      fetch('/api/loyalty/programs').then((r) => r.json()),
      fetch('/api/loyalty/tiers').then((r) => r.json()),
    ]).then(([progRes, tiersRes]) => {
      if (progRes.data) {
        const p = progRes.data
        setLoyaltyType(p.type as LoyaltyType)
        if (p.points_per_visit != null) setPointsPerVisit(p.points_per_visit)
        if (p.conversion_rate  != null) setConversionRate(p.conversion_rate)
        setNotifyOnTier(!!p.notify_on_tier)
        setBirthdayRewardEnabled(!!p.birthday_reward_enabled)
        setBirthdayRewardTitle(p.birthday_reward_title ?? '')
        setBirthdayMessageEnabled(!!p.birthday_message_enabled)
        setBirthdayMessageTemplate(p.birthday_message_template ?? '')
        if (p.birthday_send_hour != null) setBirthdaySendHour(p.birthday_send_hour)
      }
      if (Array.isArray(tiersRes.data) && tiersRes.data.length > 0) {
        setTiers(
          tiersRes.data.map((t: Record<string, unknown>) => ({
            required_points:    Number(t.required_points),
            reward_description: String(t.reward_description ?? ''),
            validity_days:      t.validity_days != null ? Number(t.validity_days) : '',
          }))
        )
        const template = tiersRes.data[0]?.notification_message_template
        if (template) setNotifTemplate(template)
      }
    }).catch(() => {})
  }, [])

  // Fetch currency + timezone from step 1
  useEffect(() => {
    fetch('/api/settings/profile')
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.currency) setCurrency(data.currency)
        if (data?.timezone) setBusinessTimezone(data.timezone)
      })
      .catch(() => {})
  }, [])

  // Guard: skip this step if Fidélité was not enabled in step 2
  useEffect(() => {
    fetch('/api/settings/modules')
      .then((r) => r.json())
      .then(({ data }) => {
        const numModules = [data?.orders_enabled, data?.appointments_enabled, data?.loyalty_enabled].filter(Boolean).length
        const total = 4 + numModules
        const current = 3 + (data?.orders_enabled ? 1 : 0) + (data?.appointments_enabled ? 1 : 0)
        setStepLabel({ current, total })
        if (!data?.loyalty_enabled && !redirected.current) {
          redirected.current = true
          router.replace('/onboarding/step-6')
        }
        if (data?.appointments_enabled)      setPrevStep('/onboarding/step-4')
        else if (data?.orders_enabled)       setPrevStep('/onboarding/step-3')
        else                                 setPrevStep('/onboarding/step-2')
      })
      .catch(() => {})
  }, [router])

  // ── Tier helpers ──────────────────────────────────────────────────────────────

  const updateTier = (idx: number, t: Tier) =>
    setTiers((prev) => prev.map((x, i) => (i === idx ? t : x)))

  const addTier = () => {
    if (tiers.length >= 5) return
    const lastPts = tiers[tiers.length - 1]?.required_points ?? 0
    setTiers((prev) => [...prev, { ...DEFAULT_TIER, required_points: lastPts + 100 }])
  }

  const removeTier = (idx: number) =>
    setTiers((prev) => prev.filter((_, i) => i !== idx))

  // ── Validation ────────────────────────────────────────────────────────────────

  const tierErrors = tiers.map((t, i) => {
    if (!t.required_points || t.required_points <= 0) return 'Points requis manquants.'
    if (!t.reward_description.trim())                  return 'Récompense manquante.'
    if (i > 0 && t.required_points <= tiers[i - 1].required_points)
      return `Doit être supérieur au palier ${i} (${tiers[i - 1].required_points} pts).`
    return null
  })

  const isValid =
    tiers.length > 0 &&
    tierErrors.every((e) => e === null) &&
    (loyaltyType === 'passage' ? pointsPerVisit > 0 : Number(conversionRate) > 0)

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleFinalise = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const rate = Number(conversionRate) || 1

      const progRes = await fetch('/api/loyalty/programs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:                        loyaltyType,
          points_per_visit:            loyaltyType === 'passage' ? pointsPerVisit : null,
          conversion_rate:             loyaltyType === 'montant'  ? rate : null,
          conversion_amount_per_point: loyaltyType === 'montant'  ? (rate > 0 ? 1 / rate : null) : null,
          notify_on_tier:              notifyOnTier,
          birthday_reward_enabled:     birthdayRewardEnabled,
          birthday_reward_title:       birthdayRewardTitle.trim() || null,
          birthday_message_enabled:    birthdayMessageEnabled,
          birthday_message_template:   birthdayMessageTemplate.trim() || null,
          birthday_send_hour:          birthdaySendHour,
        }),
      }).then((r) => r.json())

      if (progRes.error) { toast.error(progRes.error); return }

      const tiersPayload = tiers.map((t, i) => ({
        tier_order:                    i + 1,
        required_points:               t.required_points,
        reward_title:                  t.reward_description,
        reward_description:            t.reward_description,
        validity_days:                 t.validity_days === '' ? null : Number(t.validity_days),
        notification_message_template: notifyOnTier ? notifTemplate : '',
        is_enabled:                    true,
      }))

      const tiersRes = await fetch('/api/loyalty/tiers', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tiers: tiersPayload }),
      }).then((r) => r.json())

      if (tiersRes.error) { toast.error(tiersRes.error); return }

      router.push('/onboarding/step-6')
    } finally {
      setSaving(false)
    }
  }

  const hasExpiry = tiers.some((t) => t.validity_days !== '' && Number(t.validity_days) > 0)

  const previewRewardName = tiers[0]?.reward_description.trim() || 'votre récompense'
  const previewExpiryLabel = (() => {
    const days = Number(tiers[0]?.validity_days)
    if (!days) return '—'
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  })()

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <Button
          type="button" variant="ghost" size="sm" className="shrink-0"
          onClick={() => router.push(prevStep)}
        >
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape {stepLabel.current} sur {stepLabel.total}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(stepLabel.current / stepLabel.total) * 100}%` }} />
        </div>
        <Button size="sm" disabled={!isValid || saving} onClick={handleFinalise} className="shrink-0">
          {saving ? 'Enregistrement…' : 'Finaliser →'}
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex justify-center px-8">
        <div className="w-full max-w-[1100px] h-full">
          <div className="grid grid-cols-[1fr_480px] gap-16 h-full">

            {/* ── LEFT: Live Preview — fixed, vertically centered ──────── */}
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Aperçu du portail client
              </h2>
              <MobilePreview tiers={tiers} />
              <p className="text-center text-xs text-muted-foreground">
                L&apos;aperçu se met à jour en temps réel.
              </p>
            </div>

            {/* ── RIGHT: Form — scrollable ───────────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-8 pr-1">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Configurez votre programme de fidélité
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Définissez comment vos clients gagnent des points et débloquent des récompenses.
                </p>
              </div>

              {/* ── Section 1 : Points system ─────────────────────────── */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Système de points
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Comment vos clients gagnent-ils des points ?
                  </p>
                </div>

                {/* Type selector — radio cards */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    {
                      value: 'passage' as LoyaltyType,
                      label: 'Par passage',
                      desc:  'Points fixes à chaque visite ou commande',
                    },
                    {
                      value: 'montant' as LoyaltyType,
                      label: 'Par montant',
                      desc:  'Points proportionnels au montant dépensé',
                    },
                  ] as const).map(({ value, label, desc }) => {
                    const active = loyaltyType === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLoyaltyType(value)}
                        className={`text-left rounded-xl border-2 p-4 transition-all duration-150 ${
                          active
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              active ? 'border-primary' : 'border-muted-foreground/40'
                            }`}
                          >
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                          </div>
                          <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                            {label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground ml-5">{desc}</p>
                      </button>
                    )
                  })}
                </div>

                {/* Type-specific config */}
                {loyaltyType === 'passage' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="points-per-visit">Points gagnés par passage</Label>
                    <Input
                      id="points-per-visit"
                      type="number"
                      min={1}
                      value={pointsPerVisit}
                      onChange={(e) => setPointsPerVisit(Math.max(1, Number(e.target.value) || 1))}
                      className="max-w-[140px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Chaque passage créditera automatiquement ce nombre de points.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="conversion-rate">Combien de points vaut 1 {currency} ?</Label>
                    <Input
                      id="conversion-rate"
                      type="number"
                      min={0.01}
                      step={0.1}
                      placeholder="1"
                      value={conversionRate}
                      onChange={(e) =>
                        setConversionRate(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="max-w-[140px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ex : <strong>1</strong> → 1 {currency} = 1 point &nbsp;·&nbsp;
                      <strong>0.1</strong> → 10 {currency}s = 1 point.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Section 2 : Reward tiers ──────────────────────────── */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Récompenses
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Créez jusqu&apos;à 5 paliers pour récompenser vos clients fidèles.
                    Au moins un palier est requis.
                  </p>
                </div>

                <div className="space-y-3">
                  {tiers.map((tier, i) => (
                    <TierCard
                      key={i}
                      index={i}
                      tier={tier}
                      error={tierErrors[i] ?? undefined}
                      onChange={(updated) => updateTier(i, updated)}
                      onRemove={() => removeTier(i)}
                      canRemove={tiers.length > 1}
                    />
                  ))}

                  {tiers.length < 5 && (
                    <button
                      type="button"
                      onClick={addTier}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter un palier
                    </button>
                  )}
                </div>
              </div>

              {/* ── Section 3 : Notification ──────────────────────────── */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notification de récompense
                </p>

                <div className="flex items-center gap-3">
                  <Toggle checked={notifyOnTier} onChange={setNotifyOnTier} />
                  <span className="text-sm leading-tight">
                    Envoyer une notification quand une récompense est débloquée
                  </span>
                </div>

                {notifyOnTier && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="notif-template">Message de notification</Label>
                      <textarea
                        id="notif-template"
                        rows={4}
                        value={notifTemplate}
                        onChange={(e) => setNotifTemplate(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        Utilisez{' '}
                        <code className="bg-muted px-1 rounded text-[11px] font-mono">{'{rewardName}'}</code>{' '}
                        et{' '}
                        <code className="bg-muted px-1 rounded text-[11px] font-mono">{'{expirationDate}'}</code>{' '}
                        dans votre message.{' '}
                        {!hasExpiry && (
                          <span className="italic">
                            La date d&apos;expiration ne s&apos;affiche que si une validité est définie sur au moins un palier.
                          </span>
                        )}
                      </p>
                    </div>
                    <NotificationPreview template={notifTemplate} rewardName={previewRewardName} expiryLabel={previewExpiryLabel} />
                  </div>
                )}
              </div>

              {/* ── Section 4 : Birthday ──────────────────────────────── */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cadeau d&apos;anniversaire
                </p>

                <div className="flex items-center gap-3">
                  <Toggle checked={birthdayRewardEnabled} onChange={setBirthdayRewardEnabled} />
                  <span className="text-sm leading-tight">
                    Offrir automatiquement un cadeau le jour d&apos;anniversaire du client
                  </span>
                </div>

                {birthdayRewardEnabled && (
                  <div className="space-y-4 pl-1">
                    {/* Description du cadeau */}
                    <div className="space-y-1.5">
                      <Label htmlFor="birthday-title">Description du cadeau</Label>
                      <Input
                        id="birthday-title"
                        placeholder="ex : Café offert, -15%, Dessert offert…"
                        value={birthdayRewardTitle}
                        onChange={(e) => setBirthdayRewardTitle(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Affiché dans le portail client et utilisé dans le message WhatsApp.
                      </p>
                    </div>

                    {/* Toggle message WhatsApp */}
                    <div className="flex items-center gap-3">
                      <Toggle checked={birthdayMessageEnabled} onChange={setBirthdayMessageEnabled} />
                      <span className="text-sm leading-tight">
                        Envoyer un message WhatsApp le jour J
                      </span>
                    </div>

                    {birthdayMessageEnabled && (
                      <div className="space-y-4 pl-1">
                        {/* Heure d'envoi */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Heure d&apos;envoi</Label>
                          <div className="flex items-center gap-2">
                            <Select
                              value={String(birthdaySendHour)}
                              onValueChange={(v) => setBirthdaySendHour(parseInt(v))}
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
                        </div>

                        {/* Message */}
                        <div className="space-y-1.5">
                          <Label htmlFor="birthday-message" className="text-xs">Message</Label>
                          <textarea
                            id="birthday-message"
                            rows={3}
                            value={birthdayMessageTemplate}
                            onChange={(e) => setBirthdayMessageTemplate(e.target.value)}
                            placeholder={`Joyeux anniversaire ! 🎂 Nous avons le plaisir de vous offrir ${birthdayRewardTitle || 'un cadeau'} pour célébrer votre journée.`}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            Variable disponible : <code className="bg-muted px-1 rounded">#{'{cadeau}'}</code> — remplacée par la description du cadeau.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Note */}
              <p className="text-xs text-muted-foreground text-center pb-4">
                Vous pourrez modifier votre programme de fidélité à tout moment dans les paramètres.
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
