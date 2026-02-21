'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Minus, Upload, X, Globe, MapPin, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BusinessProfile, BusinessHours } from '@/lib/types'
import { PHONE_PREFIXES, splitPhonePrefix } from '@/lib/constants/phone-prefixes'
import { useI18n } from '@/lib/i18n/provider'
import { WORLD_CURRENCIES, WORLD_CURRENCY_CODES } from '@/lib/currencies'
import TimezoneSelect from '@/components/TimezoneSelect'
import { DEFAULT_TIMEZONE } from '@/lib/data/timezones'

// ─── Constants ─────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

type DayState = {
  day_of_week: number
  is_closed:   boolean
  slot1_start: string
  slot1_end:   string
  slot2_start: string
  slot2_end:   string
}

const DEFAULT_HOURS: DayState[] = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i + 1,
  is_closed:   i === 6,
  slot1_start: i === 6 ? '' : '09:00',
  slot1_end:   i === 6 ? '' : '18:00',
  slot2_start: '',
  slot2_end:   '',
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function HoursEditor({ hours, onChange }: { hours: DayState[]; onChange: (h: DayState[]) => void }) {
  const { t } = useI18n()
  const update = (idx: number, patch: Partial<DayState>) => {
    onChange(hours.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }
  const hasSlot2 = (d: DayState) => !!(d.slot2_start || d.slot2_end)

  return (
    <div className="space-y-2">
      {hours.map((day, idx) => (
        <div key={day.day_of_week} className="flex items-start gap-3 py-2 border-b last:border-0">
          <div className="w-24 shrink-0 pt-1">
            <span className="text-sm font-medium">{DAY_NAMES[idx]}</span>
          </div>
          <div className="flex items-center gap-2 pt-0.5 shrink-0">
            <Toggle
              checked={!day.is_closed}
              onChange={(open) => update(idx, {
                is_closed:   !open,
                slot1_start: !open ? '' : (day.slot1_start || '09:00'),
                slot1_end:   !open ? '' : (day.slot1_end   || '18:00'),
                slot2_start: !open ? '' : day.slot2_start,
                slot2_end:   !open ? '' : day.slot2_end,
              })}
            />
            <span className={`text-xs ${day.is_closed ? 'text-muted-foreground' : 'text-foreground'}`}>
              {day.is_closed ? t('settings.closed') : t('settings.open')}
            </span>
          </div>
          {!day.is_closed && (
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Input type="time" className="h-7 w-28 text-xs" value={day.slot1_start} onChange={(e) => update(idx, { slot1_start: e.target.value })} required />
                <span className="text-muted-foreground text-xs">—</span>
                <Input type="time" className="h-7 w-28 text-xs" value={day.slot1_end} onChange={(e) => update(idx, { slot1_end: e.target.value })} required />
                {!hasSlot2(day) && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Ajouter un créneau" onClick={() => update(idx, { slot2_start: '12:00', slot2_end: '14:00' })}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {hasSlot2(day) && (
                <div className="flex items-center gap-1.5">
                  <Input type="time" className="h-7 w-28 text-xs" value={day.slot2_start} onChange={(e) => update(idx, { slot2_start: e.target.value })} />
                  <span className="text-muted-foreground text-xs">—</span>
                  <Input type="time" className="h-7 w-28 text-xs" value={day.slot2_end} onChange={(e) => update(idx, { slot2_end: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Supprimer ce créneau" onClick={() => update(idx, { slot2_start: '', slot2_end: '' })}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  const { t } = useI18n()

  const [profile, setProfile] = useState<Omit<BusinessProfile, 'updated_at'>>({
    business_id: '', name: '', logo_url: null, phone: null, email: null, website: null,
    currency: 'MAD', order_number_prefix: '', order_number_next: 1, address: null,
    primary_color: null, secondary_color: null, default_phone_prefix: '+33',
    google_maps_url: null, waze_url: null,
    instagram_url: null, tiktok_url: null, facebook_url: null, youtube_url: null,
    timezone: DEFAULT_TIMEZONE,
  })
  const [phonePrefix, setPhonePrefix]   = useState('+33')
  const [phoneNumber, setPhoneNumber]   = useState('')
  const [currencyCustom, setCurrencyCustom] = useState('')
  const [hours, setHours]               = useState<DayState[]>(DEFAULT_HOURS)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [logoFile, setLogoFile]         = useState<File | null>(null)
  const [logoPreview, setLogoPreview]   = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  // Section visibility state
  const [showGoogleMaps, setShowGoogleMaps] = useState(false)
  const [showWaze, setShowWaze]             = useState(false)
  const [showWebsite, setShowWebsite]       = useState(false)
  const [showSocial, setShowSocial]         = useState(false)
  const [showHours, setShowHours]           = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [profileRes, hoursRes] = await Promise.all([
      fetch('/api/settings/profile').then((r) => r.json()),
      fetch('/api/settings/hours').then((r) => r.json()),
    ])
    if (profileRes.data) {
      const p = profileRes.data as BusinessProfile
      const isPreset = WORLD_CURRENCY_CODES.has(p.currency)
      setProfile({
        business_id: p.business_id, name: p.name, logo_url: p.logo_url,
        phone: p.phone, email: p.email, website: p.website,
        currency: isPreset ? p.currency : 'autre',
        order_number_prefix: p.order_number_prefix ?? '',
        order_number_next:   p.order_number_next   ?? 1,
        address:             p.address             ?? null,
        primary_color:       p.primary_color       ?? null,
        secondary_color:     p.secondary_color     ?? null,
        default_phone_prefix: p.default_phone_prefix ?? '+33',
        google_maps_url:     p.google_maps_url     ?? null,
        waze_url:            p.waze_url            ?? null,
        instagram_url:       p.instagram_url       ?? null,
        tiktok_url:          p.tiktok_url          ?? null,
        facebook_url:        p.facebook_url        ?? null,
        youtube_url:         p.youtube_url         ?? null,
        timezone:            p.timezone            ?? DEFAULT_TIMEZONE,
      })
      if (!isPreset) setCurrencyCustom(p.currency)
      const split = splitPhonePrefix(p.phone)
      setPhonePrefix(split.prefix)
      setPhoneNumber(split.number)
      setLogoFile(null)
      setLogoPreview(null)
      // Auto-expand sections if data exists
      setShowGoogleMaps(!!(p.google_maps_url))
      setShowWaze(!!(p.waze_url))
      setShowWebsite(!!(p.website))
      setShowSocial(!!(p.instagram_url || p.tiktok_url || p.facebook_url || p.youtube_url))
    }
    if (hoursRes.data) {
      setHours((hoursRes.data as BusinessHours[]).map((h) => ({
        day_of_week: h.day_of_week, is_closed: h.is_closed,
        slot1_start: h.slot1_start ?? '', slot1_end: h.slot1_end ?? '',
        slot2_start: h.slot2_start ?? '', slot2_end: h.slot2_end ?? '',
      })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    return () => { if (logoPreview) URL.revokeObjectURL(logoPreview) }
  }, [logoPreview])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error(t('settings.errors.fileTooLarge')); return }
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setProfile((p) => ({ ...p, logo_url: null }))
  }

  const handleRemoveLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoFile(null); setLogoPreview(null)
    setProfile((p) => ({ ...p, logo_url: null }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function validateHours(): string | null {
    for (const day of hours) {
      if (day.is_closed) continue
      if (!day.slot1_start || !day.slot1_end) return `${DAY_NAMES[day.day_of_week - 1]} : l'heure d'ouverture et de fermeture sont requises`
      if (day.slot1_start >= day.slot1_end) return `${DAY_NAMES[day.day_of_week - 1]} : l'heure de début doit être avant l'heure de fin`
      if (day.slot2_start || day.slot2_end) {
        if (!day.slot2_start || !day.slot2_end) return `${DAY_NAMES[day.day_of_week - 1]} : remplissez le 2ème créneau ou supprimez-le`
        if (day.slot2_start < day.slot1_end) return `${DAY_NAMES[day.day_of_week - 1]} : les créneaux se chevauchent`
        if (day.slot2_start >= day.slot2_end) return `${DAY_NAMES[day.day_of_week - 1]} : le 2ème créneau est invalide`
      }
    }
    return null
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateHours()
    if (err) { toast.error(err); return }
    const finalCurrency = profile.currency === 'autre' ? currencyCustom.trim() : profile.currency
    if (!finalCurrency) { toast.error(t('settings.errors.currencyRequired')); return }
    const gmUrl = profile.google_maps_url?.trim() || null
    const wzUrl = profile.waze_url?.trim() || null
    if (profile.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) { toast.error('Adresse email invalide'); return }
    if (gmUrl && !/^https?:\/\//i.test(gmUrl)) { toast.error(t('settings.errors.gmapsUrl')); return }
    if (wzUrl && !/^https?:\/\//i.test(wzUrl)) { toast.error(t('settings.errors.wazeUrl')); return }

    setSaving(true)
    let finalLogoUrl = profile.logo_url
    if (logoFile) {
      const fd = new FormData()
      fd.append('file', logoFile)
      const uploadRes = await fetch('/api/settings/upload-logo', { method: 'POST', body: fd }).then((r) => r.json())
      if (uploadRes.error) { toast.error(uploadRes.error); setSaving(false); return }
      finalLogoUrl = uploadRes.data.url
      setProfile((p) => ({ ...p, logo_url: finalLogoUrl }))
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoFile(null); setLogoPreview(null)
    }

    const [profileRes, hoursRes] = await Promise.all([
      fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name, logo_url: finalLogoUrl,
          phone: phoneNumber.trim() ? `${phonePrefix}${phoneNumber.trim()}` : null,
          email: profile.email, website: profile.website, currency: finalCurrency,
          order_number_prefix: profile.order_number_prefix, order_number_next: profile.order_number_next,
          address: profile.address, primary_color: profile.primary_color, secondary_color: profile.secondary_color,
          default_phone_prefix: profile.default_phone_prefix,
          google_maps_url: profile.google_maps_url, waze_url: profile.waze_url,
          instagram_url: profile.instagram_url, tiktok_url: profile.tiktok_url,
          facebook_url: profile.facebook_url, youtube_url: profile.youtube_url,
          timezone: profile.timezone,
        }),
      }).then((r) => r.json()),
      fetch('/api/settings/hours', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours }),
      }).then((r) => r.json()),
    ])

    if (profileRes.error) toast.error(profileRes.error)
    else if (hoursRes.error) toast.error(hoursRes.error)
    else toast.success(t('settings.toast.infosSaved'))
    setSaving(false)
  }

  const displayLogoSrc = logoPreview ?? profile.logo_url
  const selectCurrencyVal = WORLD_CURRENCY_CODES.has(profile.currency) ? profile.currency : 'autre'

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Organisation</h2>
        <p className="text-sm text-muted-foreground">Informations de votre entreprise et horaires d&apos;ouverture.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">

        {/* ── Bloc 1 : Informations générales ─────────────────────────────── */}
        <Card>
          <div className="px-6 pt-6 pb-1">
            <h3 className="text-sm font-semibold">Informations générales</h3>
          </div>
          <CardContent className="space-y-6 pt-4">

            {/* Nom */}
            <div className="space-y-2">
              <Label>Nom de l&apos;entreprise <span className="text-destructive">*</span></Label>
              <Input required placeholder="Ma Boutique" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {displayLogoSrc ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={displayLogoSrc} alt="Logo" className="h-full w-full object-contain p-1" />
                      <button type="button" onClick={handleRemoveLogo} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <Upload className="h-7 w-7 text-muted-foreground/40" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {displayLogoSrc ? 'Changer le logo' : 'Choisir une image'}
                  </Button>
                  {logoFile && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{logoFile.name}</p>}
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, SVG · max 2 Mo</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Indicatif + Devise */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Indicatif par défaut</Label>
                <p className="text-xs text-muted-foreground">Utilisé lors de la création de clients.</p>
                <select value={profile.default_phone_prefix} onChange={(e) => setProfile({ ...profile, default_phone_prefix: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring">
                  {PHONE_PREFIXES.map((p, i) => <option key={`${p.code}-${i}`} value={p.code}>{p.flag} {p.code} — {p.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <p className="text-xs text-muted-foreground invisible">placeholder</p>
                <div className="flex gap-2">
                  <Select value={selectCurrencyVal} onValueChange={(v) => setProfile({ ...profile, currency: v !== 'autre' ? v : 'autre' })}>
                    <SelectTrigger className="flex-1 min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORLD_CURRENCIES.map(({ code, flag, name }) => (
                        <SelectItem key={code} value={code}>{flag} {code} — {name}</SelectItem>
                      ))}
                      <SelectItem value="autre">Autre...</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectCurrencyVal === 'autre' && (
                    <Input className="w-32 uppercase" placeholder="DZD, TND…" value={currencyCustom} onChange={(e) => setCurrencyCustom(e.target.value.toUpperCase())} required maxLength={5} />
                  )}
                </div>
              </div>
            </div>

            {/* Fuseau horaire */}
            <div className="space-y-2">
              <Label>Fuseau horaire</Label>
              <p className="text-xs text-muted-foreground">
                Utilisé pour programmer vos envois WhatsApp (rappels, anniversaires) à la bonne heure locale.
              </p>
              <TimezoneSelect
                value={profile.timezone}
                onChange={(tz) => setProfile((p) => ({ ...p, timezone: tz }))}
              />
            </div>

          </CardContent>
        </Card>

        {/* ── Bloc 2 : Contact ─────────────────────────────────────────────── */}
        <Card>
          <div className="px-6 pt-6 pb-1">
            <h3 className="text-sm font-semibold">Contact</h3>
          </div>
          <CardContent className="space-y-6 pt-4">

            {/* Email + Téléphone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="contact@boutique.ma" value={profile.email ?? ''} onChange={(e) => setProfile({ ...profile, email: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <div className="flex gap-1.5">
                  <select value={phonePrefix} onChange={(e) => { setPhonePrefix(e.target.value); setProfile({ ...profile, default_phone_prefix: e.target.value }) }} className="h-9 w-24 shrink-0 rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring">
                    {PHONE_PREFIXES.map((p, i) => <option key={`${p.code}-${i}`} value={p.code}>{p.flag} {p.code}</option>)}
                  </select>
                  <Input type="tel" placeholder="600000000" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="font-mono" />
                </div>
              </div>
            </div>

            {/* Adresse */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Adresse</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="12 rue de la Paix, 75001 Paris" className="pl-9" value={profile.address ?? ''} onChange={(e) => setProfile({ ...profile, address: e.target.value || null })} />
                </div>
              </div>

              {/* Toggle buttons */}
              {(!showGoogleMaps || !showWaze) && (
                <div className="flex flex-wrap gap-2">
                  {!showGoogleMaps && (
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowGoogleMaps(true)}>
                      <MapPin className="h-3.5 w-3.5" />Ajouter lien Google Maps
                    </Button>
                  )}
                  {!showWaze && (
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowWaze(true)}>
                      <MapPin className="h-3.5 w-3.5" />Ajouter lien Waze
                    </Button>
                  )}
                </div>
              )}

              {/* Google Maps input */}
              {showGoogleMaps && (
                <div className="space-y-1.5 rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Google Maps</Label>
                    <button type="button" onClick={() => { setShowGoogleMaps(false); setProfile((p) => ({ ...p, google_maps_url: null })) }} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input placeholder="https://maps.app.goo.gl/..." value={profile.google_maps_url ?? ''} onChange={(e) => setProfile({ ...profile, google_maps_url: e.target.value || null })} />
                  <p className="text-xs text-muted-foreground">Ouvrez Google Maps → Partager → Copier le lien.</p>
                </div>
              )}

              {/* Waze input */}
              {showWaze && (
                <div className="space-y-1.5 rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Waze</Label>
                    <button type="button" onClick={() => { setShowWaze(false); setProfile((p) => ({ ...p, waze_url: null })) }} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input placeholder="https://waze.com/ul?..." value={profile.waze_url ?? ''} onChange={(e) => setProfile({ ...profile, waze_url: e.target.value || null })} />
                  <p className="text-xs text-muted-foreground">Waze → recherchez votre adresse → Partager → Copier le lien.</p>
                </div>
              )}
            </div>

            {/* Site web */}
            {!showWebsite ? (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowWebsite(true)}>
                <Globe className="h-3.5 w-3.5" />Ajouter un site web
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Site web</Label>
                  <button type="button" onClick={() => { setShowWebsite(false); setProfile((p) => ({ ...p, website: null })) }} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="url" placeholder="https://www.maboutique.ma" className="pl-9" value={profile.website ?? ''} onChange={(e) => setProfile({ ...profile, website: e.target.value || null })} />
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {/* ── Bloc 3 : Réseaux sociaux (collapsible) ───────────────────────── */}
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSocial(!showSocial)}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-semibold">Réseaux sociaux</p>
              <p className="text-xs text-muted-foreground mt-0.5">Instagram, TikTok, Facebook, YouTube</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showSocial ? '' : '-rotate-90'}`} />
          </button>
          {showSocial && (
            <CardContent className="space-y-3 pt-0 pb-6">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <Input type="url" placeholder="https://instagram.com/moncommerce" className="pl-9" value={profile.instagram_url ?? ''} onChange={(e) => setProfile({ ...profile, instagram_url: e.target.value || null })} />
              </div>
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
                <Input type="url" placeholder="https://tiktok.com/@moncommerce" className="pl-9" value={profile.tiktok_url ?? ''} onChange={(e) => setProfile({ ...profile, tiktok_url: e.target.value || null })} />
              </div>
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <Input type="url" placeholder="https://facebook.com/moncommerce" className="pl-9" value={profile.facebook_url ?? ''} onChange={(e) => setProfile({ ...profile, facebook_url: e.target.value || null })} />
              </div>
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <Input type="url" placeholder="https://youtube.com/@moncommerce" className="pl-9" value={profile.youtube_url ?? ''} onChange={(e) => setProfile({ ...profile, youtube_url: e.target.value || null })} />
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── Bloc 4 : Numérotation des commandes ──────────────────────────── */}
        <Card>
          <div className="px-6 pt-6 pb-1">
            <h3 className="text-sm font-semibold">Numérotation des commandes</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Les références sont générées automatiquement si le vendeur ne les saisit pas.</p>
          </div>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Préfixe <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                <Input placeholder="ex: CMD" value={profile.order_number_prefix} maxLength={10} className="uppercase" onChange={(e) => setProfile({ ...profile, order_number_prefix: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-2">
                <Label>Prochain numéro</Label>
                <Input type="number" min={1} step={1} value={profile.order_number_next} onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) setProfile({ ...profile, order_number_next: n }) }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Aperçu :{' '}
              <span className="font-mono font-medium text-foreground">{profile.order_number_prefix ? `${profile.order_number_prefix}-` : ''}{String(profile.order_number_next).padStart(3, '0')}</span>
              ,{' '}
              <span className="font-mono text-foreground">{profile.order_number_prefix ? `${profile.order_number_prefix}-` : ''}{String(profile.order_number_next + 1).padStart(3, '0')}</span>
              , ...
            </p>
          </CardContent>
        </Card>

        {/* ── Bloc 5 : Horaires d'ouverture (collapsible) ──────────────────── */}
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHours(!showHours)}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-sm font-semibold">Horaires d&apos;ouverture</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cliquez sur <strong>+</strong> pour ajouter une coupure (ex : pause déjeuner).</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showHours ? '' : '-rotate-90'}`} />
          </button>
          {showHours && (
            <CardContent className="pt-0 pb-6">
              <HoursEditor hours={hours} onChange={setHours} />
            </CardContent>
          )}
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? t('settings.saving') : t('settings.saveInfos')}
        </Button>

      </form>
    </div>
  )
}
