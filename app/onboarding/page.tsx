'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, X, MapPin, Phone, Globe, Mail, Star, Check, Lock, ChevronDown, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import TimezoneSelect from '@/components/TimezoneSelect'
import PhoneInput from '@/components/PhoneInput'
import { WORLD_CURRENCIES } from '@/lib/currencies'
import { PHONE_PREFIXES } from '@/lib/constants/phone-prefixes'
import { detectBrowserTimezone, DEFAULT_TIMEZONE } from '@/lib/data/timezones'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#3B5BDB'

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

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

function HoursEditor({ hours, onChange }: { hours: DayState[]; onChange: (h: DayState[]) => void }) {
  const update = (idx: number, patch: Partial<DayState>) =>
    onChange(hours.map((d, i) => i === idx ? { ...d, ...patch } : d))
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
              {day.is_closed ? 'Fermé' : 'Ouvert'}
            </span>
          </div>
          {!day.is_closed && (
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Input type="time" className="h-7 w-28 text-xs" value={day.slot1_start} onChange={(e) => update(idx, { slot1_start: e.target.value })} />
                <span className="text-muted-foreground text-xs">—</span>
                <Input type="time" className="h-7 w-28 text-xs" value={day.slot1_end} onChange={(e) => update(idx, { slot1_end: e.target.value })} />
                {!hasSlot2(day) && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => update(idx, { slot2_start: '12:00', slot2_end: '14:00' })}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {hasSlot2(day) && (
                <div className="flex items-center gap-1.5">
                  <Input type="time" className="h-7 w-28 text-xs" value={day.slot2_start} onChange={(e) => update(idx, { slot2_start: e.target.value })} />
                  <span className="text-muted-foreground text-xs">—</span>
                  <Input type="time" className="h-7 w-28 text-xs" value={day.slot2_end} onChange={(e) => update(idx, { slot2_end: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => update(idx, { slot2_start: '', slot2_end: '' })}>
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

// ─── Live Preview ─────────────────────────────────────────────────────────────

const FAKE_TIERS = [
  { pts: 100, label: 'Café offert',          reached: true  },
  { pts: 250, label: '-10% sur la prochaine visite', reached: false },
]
const FAKE_PTS = 60

function MobilePreview({ name, logoUrl, address, phone, email, website }: { name: string; logoUrl: string | null; address: string; phone: string; email: string; website: string }) {
  const displayName = name.trim() || 'Votre commerce'
  const initials = displayName
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('')

  const nextTier = FAKE_TIERS.find((t) => !t.reached)
  const maxPts   = nextTier?.pts ?? FAKE_TIERS[FAKE_TIERS.length - 1].pts
  const pct      = Math.min((FAKE_PTS / maxPts) * 100, 100)

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

              {/* Business header card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-10 w-full rounded-t-2xl" style={{ backgroundColor: PRIMARY }} />
                <div className="px-3 pb-3">
                  <div className="flex items-end gap-2 -mt-5 mb-2">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-xl object-cover border-2 border-white shadow shrink-0" />
                    ) : (
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-base font-bold border-2 border-white shadow shrink-0"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="text-sm font-bold text-gray-900 leading-tight pb-0.5">{displayName}</div>
                  </div>
                  {/* Icon row — conditional on filled fields */}
                  {(address.trim() || phone || email.trim() || website.trim()) && (
                    <div className="flex items-center gap-1">
                      {address.trim() && (
                        <div className="flex items-center justify-center h-7 w-7 rounded-full">
                          <MapPin className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
                        </div>
                      )}
                      {phone && (
                        <div className="flex items-center justify-center h-7 w-7 rounded-full">
                          <Phone className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
                        </div>
                      )}
                      {website.trim() && (
                        <div className="flex items-center justify-center h-7 w-7 rounded-full">
                          <Globe className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
                        </div>
                      )}
                      {email.trim() && (
                        <div className="flex items-center justify-center h-7 w-7 rounded-full">
                          <Mail className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Loyalty block */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span className="text-[11px] font-semibold text-gray-700">Ma fidélité</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold" style={{ color: PRIMARY }}>{FAKE_PTS} pts</span>
                    {nextTier && <span className="text-gray-400">Prochain palier à {nextTier.pts} pts</span>}
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PRIMARY }} />
                  </div>
                  <div className="space-y-1 pt-0.5">
                    {FAKE_TIERS.map((tier, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-[10px] py-0.5 ${tier.reached ? '' : 'text-gray-400'}`}>
                        <div
                          className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={tier.reached ? { borderColor: PRIMARY, backgroundColor: PRIMARY } : { borderColor: '#d1d5db' }}
                        >
                          {tier.reached
                            ? <Check className="h-2 w-2 text-white" />
                            : <Lock className="h-1.5 w-1.5 text-gray-300" />}
                        </div>
                        <span className={tier.reached ? 'font-medium text-gray-900' : ''}>{tier.pts} pts — {tier.label}</span>
                      </div>
                    ))}
                  </div>
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingStep1() {
  const router = useRouter()

  const [name,          setName]          = useState('')
  const [currency,      setCurrency]      = useState('EUR')
  const [email,         setEmail]         = useState('')
  const [website,       setWebsite]       = useState('')
  const [phone,         setPhone]         = useState('')
  const [address,       setAddress]       = useState('')
  const [instagramUrl,  setInstagramUrl]  = useState('')
  const [tiktokUrl,     setTiktokUrl]     = useState('')
  const [facebookUrl,   setFacebookUrl]   = useState('')
  const [youtubeUrl,    setYoutubeUrl]    = useState('')
  const [hours,         setHours]         = useState<DayState[]>(DEFAULT_HOURS)
  const [logoFile,      setLogoFile]      = useState<File | null>(null)
  const [logoUrl,       setLogoUrl]       = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [defaultPrefix, setDefaultPrefix] = useState('+33')
  const [showContact,   setShowContact]   = useState(false)
  const [showSocial,    setShowSocial]    = useState(false)
  const [showHours,     setShowHours]     = useState(false)
  // Prefilled once from browser; user can override freely after that.
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)

  const fileRef = useRef<HTMLInputElement>(null)

  // Detect browser timezone once on mount (client-side only).
  // We never overwrite after the user has manually changed the value,
  // so we use a ref to track whether the user has interacted.
  const tzPrefilled = useRef(false)
  useEffect(() => {
    if (tzPrefilled.current) return
    tzPrefilled.current = true
    setTimezone(detectBrowserTimezone())
  }, [])

  const handleLogoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoUrl(URL.createObjectURL(file))
  }, [])

  const removeLogo = () => {
    setLogoFile(null)
    setLogoUrl(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const isValid = name.trim().length >= 2

  const handleContinue = async () => {
    if (!isValid) return
    if (email && !isValidEmail(email)) { toast.error('Adresse email invalide'); return }

    setSaving(true)
    try {
      let finalLogoUrl: string | null = null

      if (logoFile) {
        const fd = new FormData()
        fd.append('file', logoFile)
        const up = await fetch('/api/settings/upload-logo', { method: 'POST', body: fd }).then((r) => r.json())
        if (up.error) { toast.error(up.error); setSaving(false); return }
        finalLogoUrl = up.url ?? null
      }

      const [res] = await Promise.all([
        fetch('/api/settings/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:          name.trim(),
            currency,
            email:         email.trim()        || null,
            website:       website.trim()       || null,
            phone:         phone               || null,
            address:              address.trim()      || null,
            default_phone_prefix: defaultPrefix,
            instagram_url:        instagramUrl.trim() || null,
            tiktok_url:    tiktokUrl.trim()     || null,
            facebook_url:  facebookUrl.trim()   || null,
            youtube_url:   youtubeUrl.trim()    || null,
            timezone,
            ...(finalLogoUrl ? { logo_url: finalLogoUrl } : {}),
          }),
        }).then((r) => r.json()),
        fetch('/api/settings/hours', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hours }),
        }),
      ])

      if (res.error) { toast.error(res.error); return }

      router.push('/onboarding/step-2')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape 1 sur 5</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: '20%' }} />
        </div>
        <Button size="sm" disabled={!isValid || saving} onClick={handleContinue} className="shrink-0">
          {saving ? 'Enregistrement…' : 'Continuer →'}
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex justify-center px-8">
        <div className="w-full max-w-[1100px] h-full">
          <div className="grid grid-cols-[1fr_480px] gap-16 h-full">

            {/* ── LEFT: Live Preview — fixed, vertically centered ──────── */}
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Aperçu de votre portail client
                </h2>
              </div>
              <MobilePreview name={name} logoUrl={logoUrl} address={address} phone={phone} email={email} website={website} />
              <p className="text-center text-xs text-muted-foreground">
                Voici comment vos clients verront votre commerce.
              </p>
            </div>

            {/* ── RIGHT: Form — scrollable ───────────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-8 pr-1">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Bienvenue 👋</h1>
                <p className="text-base text-muted-foreground mt-1">Commençons par votre commerce</p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  Ces informations apparaîtront dans votre portail client et vos messages clients.
                </p>
              </div>

              {/* ── Bloc : Informations générales ──────────────────────── */}
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informations générales</p>

                {/* Nom */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    Nom du commerce <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="Ex : Ma Boutique"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={name.trim().length > 0 && name.trim().length < 2 ? 'border-destructive' : ''}
                    autoFocus
                  />
                  {name.trim().length > 0 && name.trim().length < 2 && (
                    <p className="text-xs text-destructive">Veuillez entrer le nom de votre commerce.</p>
                  )}
                </div>

                {/* Logo */}
                <div className="space-y-1.5">
                  <Label>Logo <span className="text-muted-foreground font-normal">(facultatif)</span></Label>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  {logoUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-lg object-contain border border-border bg-muted" />
                      <div>
                        <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-primary hover:underline block">
                          Changer
                        </button>
                        <button type="button" onClick={removeLogo} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 mt-0.5">
                          <X className="h-3 w-3" />Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2.5 px-4 py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors w-full">
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>Importer un logo</span>
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">Recommandé pour renforcer votre image de marque.</p>
                </div>

                {/* Devise + Indicatif */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Devise</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WORLD_CURRENCIES.map(({ code, flag, name }) => (
                          <SelectItem key={code} value={code}>{flag} {code} — {name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Indicatif par défaut</Label>
                    <select value={defaultPrefix} onChange={(e) => setDefaultPrefix(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring">
                      {PHONE_PREFIXES.map((p, i) => <option key={`${p.code}-${i}`} value={p.code}>{p.flag} {p.code} — {p.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Fuseau horaire */}
                <div className="space-y-1.5">
                  <Label>Fuseau horaire</Label>
                  <TimezoneSelect value={timezone} onChange={setTimezone} />
                  <p className="text-xs text-muted-foreground">
                    Utilisé pour programmer vos envois WhatsApp (rappels, anniversaires) à la bonne heure locale.
                  </p>
                </div>
              </div>

              {/* ── Bloc : Contact (collapsible) ───────────────────────── */}
              <div className="rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowContact(!showContact)}
                  className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Email, téléphone, adresse, site web</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showContact ? '' : '-rotate-90'}`} />
                </button>
                {showContact && (
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    {/* Email + Téléphone */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="contact@moncommerce.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Téléphone</Label>
                        <PhoneInput value={phone} onChange={setPhone} />
                      </div>
                    </div>

                    {/* Adresse */}
                    <div className="space-y-1.5">
                      <Label htmlFor="address">Adresse</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="address" placeholder="12 rue des Fleurs, Paris" className="pl-9" value={address} onChange={(e) => setAddress(e.target.value)} />
                      </div>
                    </div>

                    {/* Site web */}
                    <div className="space-y-1.5">
                      <Label htmlFor="website">Site web</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input id="website" type="url" placeholder="https://www.moncommerce.com" className="pl-9" value={website} onChange={(e) => setWebsite(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Bloc : Réseaux sociaux (collapsible) ───────────────────── */}
              <div className="rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSocial(!showSocial)}
                  className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Réseaux sociaux</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Instagram, TikTok, Facebook, YouTube</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showSocial ? '' : '-rotate-90'}`} />
                </button>
                {showSocial && (
                  <div className="px-4 pb-4 space-y-3 border-t pt-4">
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      <Input type="url" placeholder="https://instagram.com/moncommerce" className="pl-9" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} />
                    </div>
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                      </svg>
                      <Input type="url" placeholder="https://tiktok.com/@moncommerce" className="pl-9" value={tiktokUrl} onChange={(e) => setTiktokUrl(e.target.value)} />
                    </div>
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <Input type="url" placeholder="https://facebook.com/moncommerce" className="pl-9" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} />
                    </div>
                    <div className="relative">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      <Input type="url" placeholder="https://youtube.com/@moncommerce" className="pl-9" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Bloc : Horaires d'ouverture (collapsible) ──────────────── */}
              <div className="rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHours(!showHours)}
                  className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Horaires d&apos;ouverture</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Cliquez sur <strong>+</strong> pour ajouter une coupure.</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showHours ? '' : '-rotate-90'}`} />
                </button>
                {showHours && (
                  <div className="px-4 pb-4 border-t pt-4">
                    <HoursEditor hours={hours} onChange={setHours} />
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
