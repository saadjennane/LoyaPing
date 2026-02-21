'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, MapPin, Mail, Globe, Share2, Star, ShoppingBag, CalendarDays, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

// ─── Predefined themes ────────────────────────────────────────────────────────

const THEMES = [
  { name: 'Indigo',    primary: '#3B5BDB', secondary: '#EEF2FF' },
  { name: 'Ardoise',   primary: '#334155', secondary: '#F1F5F9' },
  { name: 'Émeraude',  primary: '#059669', secondary: '#ECFDF5' },
  { name: 'Rose',      primary: '#E11D48', secondary: '#FFF1F2' },
  { name: 'Ambre',     primary: '#D97706', secondary: '#FFFBEB' },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

type RawProfile = {
  name:            string
  currency:        string
  logo_url:        string | null
  phone:           string | null
  email:           string | null
  website:         string | null
  address:         string | null
  google_maps_url: string | null
  instagram_url:   string | null
  tiktok_url:      string | null
  facebook_url:    string | null
  youtube_url:     string | null
  primary_color:   string | null
  secondary_color: string | null
  order_number_prefix: string
  [key: string]: unknown
}

type Modules = {
  orders_enabled:       boolean
  appointments_enabled: boolean
  loyalty_enabled:      boolean
}

type Visibility = {
  logo:    boolean
  phone:   boolean
  address: boolean
  email:   boolean
  website: boolean
  social:  boolean
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

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

// ─── Portal Preview ───────────────────────────────────────────────────────────

type PreviewProps = {
  profile:     RawProfile
  primaryColor:   string
  secondaryColor: string
  visibility:  Visibility
  modules:     Modules
}

function PortalPreview({ profile, primaryColor, secondaryColor, visibility, modules }: PreviewProps) {
  const initials = profile.name
    ? profile.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : 'VC'

  const hasSocial = !!(profile.instagram_url || profile.tiktok_url || profile.facebook_url || profile.youtube_url)
  const hasAddress = !!(profile.address || profile.google_maps_url)

  const infoItems = [
    { key: 'phone',   icon: Phone,   active: !!profile.phone   && visibility.phone   },
    { key: 'address', icon: MapPin,  active: hasAddress        && visibility.address  },
    { key: 'email',   icon: Mail,    active: !!profile.email   && visibility.email   },
    { key: 'website', icon: Globe,   active: !!profile.website && visibility.website  },
    { key: 'social',  icon: Share2,  active: hasSocial         && visibility.social  },
  ].filter((item) => item.active)

  // Badge background derived from secondary color (with fallback)
  const badgeBg = secondaryColor && secondaryColor !== '#EEF2FF' ? secondaryColor : primaryColor + '18'

  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] shrink-0">
        <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
          {/* Notch */}
          <div className="h-6 bg-gray-800 flex items-center justify-center">
            <div className="w-16 h-3 bg-black rounded-full" />
          </div>

          {/* Screen — matches step-5 bg-gray-50 */}
          <div className="bg-gray-50 overflow-y-auto text-gray-900" style={{ height: 520 }}>
            <div className="px-3 py-4 space-y-3">

              {/* Business header card — same card-with-banner layout as step-5 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-10 w-full rounded-t-2xl" style={{ backgroundColor: primaryColor }} />
                <div className="px-3 pb-3">
                  <div className="flex items-end gap-2 -mt-5 mb-1">
                    {visibility.logo && profile.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.logo_url}
                        alt="logo"
                        className="h-12 w-12 rounded-xl object-cover border-2 border-white shadow shrink-0"
                      />
                    ) : (
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-base font-bold border-2 border-white shadow shrink-0"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="text-sm font-bold text-gray-900 leading-tight pb-0.5">
                      {profile.name || 'Votre commerce'}
                    </div>
                  </div>
                  {infoItems.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-0.5">
                      {infoItems.map(({ key, icon: Icon }) => (
                        <div
                          key={key}
                          className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: primaryColor + '18' }}
                        >
                          <Icon className="h-3 w-3" style={{ color: primaryColor }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Loyalty block — same style as step-5 */}
              {modules.loyalty_enabled && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-[11px] font-semibold text-gray-700">Ma fidélité</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold" style={{ color: primaryColor }}>60 pts</span>
                      <span className="text-gray-400">Prochain palier à 100 pts</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: '60%', backgroundColor: primaryColor }} />
                    </div>
                    <div className="text-[10px] text-gray-400">100 pts — Café offert</div>
                  </div>
                </div>
              )}

              {/* Orders block */}
              {modules.orders_enabled && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <ShoppingBag className="h-3 w-3" style={{ color: primaryColor }} />
                    <span className="text-[11px] font-semibold text-gray-700">Ma commande</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div className="text-[10px] text-gray-500">CMD-042 · En préparation</div>
                    <div className="flex gap-1">
                      {['Reçue', 'Préparée', 'Prête'].map((s, i) => (
                        <div key={s} className="flex-1">
                          <div className="h-1 rounded-full" style={{ backgroundColor: i <= 1 ? primaryColor : '#E5E7EB' }} />
                          <p className="text-[8px] text-center mt-0.5 text-gray-400">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Appointments block */}
              {modules.appointments_enabled && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
                    <CalendarDays className="h-3 w-3" style={{ color: primaryColor }} />
                    <span className="text-[11px] font-semibold text-gray-700">Mon rendez-vous</span>
                  </div>
                  <div className="px-3 py-2.5 space-y-1">
                    <div className="text-[10px] text-gray-500">12 juin · 15h00</div>
                    <div
                      className="text-[9px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-0.5"
                      style={{ backgroundColor: badgeBg, color: primaryColor }}
                    >
                      <Check className="h-2 w-2" />
                      Confirmé
                    </div>
                  </div>
                </div>
              )}

              {!modules.loyalty_enabled && !modules.orders_enabled && !modules.appointments_enabled && (
                <div className="text-center py-6">
                  <p className="text-[10px] text-gray-300">Activez des modules pour les voir ici</p>
                </div>
              )}

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

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: RawProfile = {
  name: '', currency: 'MAD', logo_url: null, phone: null, email: null,
  website: null, address: null, google_maps_url: null,
  instagram_url: null, tiktok_url: null, facebook_url: null, youtube_url: null,
  primary_color: null, secondary_color: null, order_number_prefix: 'CMD',
}

export default function OnboardingStep6() {
  const router = useRouter()

  const [profile,        setProfile]        = useState<RawProfile>(DEFAULT_PROFILE)
  const [modules,        setModules]        = useState<Modules>({ orders_enabled: false, appointments_enabled: false, loyalty_enabled: false })
  const [primaryColor,   setPrimaryColor]   = useState('#3B5BDB')
  const [secondaryColor, setSecondaryColor] = useState('#EEF2FF')
  const [visibility,     setVisibility]     = useState<Visibility>({ logo: true, phone: true, address: true, email: true, website: true, social: true })
  const [prevStep,       setPrevStep]       = useState('/onboarding/step-2')
  const [stepCurrent,    setStepCurrent]    = useState(6)
  const [stepTotal,      setStepTotal]      = useState(7)
  const [saving,         setSaving]         = useState(false)

  // Fetch profile + seed colors
  useEffect(() => {
    fetch('/api/settings/profile')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        setProfile(data)
        if (data.primary_color)   setPrimaryColor(data.primary_color)
        if (data.secondary_color) setSecondaryColor(data.secondary_color)
      })
      .catch(() => {})
  }, [])

  // Fetch modules + compute prevStep + dynamic total
  useEffect(() => {
    fetch('/api/settings/modules')
      .then((r) => r.json())
      .then(({ data }) => {
        if (!data) return
        setModules({
          orders_enabled:       !!data.orders_enabled,
          appointments_enabled: !!data.appointments_enabled,
          loyalty_enabled:      !!data.loyalty_enabled,
        })
        const numModules = [data.orders_enabled, data.appointments_enabled, data.loyalty_enabled].filter(Boolean).length
        setStepTotal(4 + numModules)       // total = fixed steps (1+2+portal+test) + modules
        setStepCurrent(3 + numModules)     // portal is always second-to-last
        if      (data.loyalty_enabled)      setPrevStep('/onboarding/step-5')
        else if (data.appointments_enabled) setPrevStep('/onboarding/step-4')
        else if (data.orders_enabled)       setPrevStep('/onboarding/step-3')
        else                                setPrevStep('/onboarding/step-2')
      })
      .catch(() => {})
  }, [])

  const handleContinue = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          primary_color:   primaryColor,
          secondary_color: secondaryColor,
        }),
      })
    } catch (_) {
      // Non-blocking — settings can be adjusted later
    } finally {
      setSaving(false)
    }
    router.push('/onboarding/step-7')
  }

  // Which optional fields were filled in Step 1
  const hasSocial  = !!(profile.instagram_url || profile.tiktok_url || profile.facebook_url || profile.youtube_url)
  const hasAddress = !!(profile.address || profile.google_maps_url)

  const filledFields: { key: keyof Visibility; label: string }[] = [
    { key: 'logo',    label: 'Logo'            },
    { key: 'phone',   label: 'Téléphone'       },
    { key: 'address', label: 'Adresse'         },
    { key: 'email',   label: 'Email'           },
    { key: 'website', label: 'Site web'        },
    { key: 'social',  label: 'Réseaux sociaux' },
  ].filter(({ key }) => {
    if (key === 'logo')    return !!profile.logo_url
    if (key === 'phone')   return !!profile.phone
    if (key === 'address') return hasAddress
    if (key === 'email')   return !!profile.email
    if (key === 'website') return !!profile.website
    if (key === 'social')  return hasSocial
    return false
  })

  const activeTheme = THEMES.find((t) => t.primary === primaryColor && t.secondary === secondaryColor)

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-background px-8 py-3 flex items-center gap-4 shrink-0">
        <Button
          type="button" variant="ghost" size="sm" className="shrink-0"
          onClick={() => router.push(prevStep)}
        >
          ← Retour
        </Button>
        <span className="text-sm text-muted-foreground font-medium shrink-0">Étape {stepCurrent} sur {stepTotal}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(stepCurrent / stepTotal) * 100}%` }} />
        </div>
        <Button size="sm" disabled={saving} onClick={handleContinue} className="shrink-0">
          {saving ? 'Enregistrement…' : 'Continuer →'}
        </Button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex justify-center px-8">
        <div className="w-full max-w-[1100px] h-full">
          <div className="grid grid-cols-[1fr_480px] gap-16 h-full">

            {/* ── LEFT: Portal Preview ─────────────────────────────── */}
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Aperçu du portail client
              </h2>
              <PortalPreview
                profile={profile}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                visibility={visibility}
                modules={modules}
              />
              <p className="text-center text-xs text-muted-foreground">
                L&apos;aperçu se met à jour en temps réel.
              </p>
            </div>

            {/* ── RIGHT: Customization panel ───────────────────────── */}
            <div className="overflow-y-auto py-10 space-y-8 pr-1">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Personnalisez votre portail client
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Voici l&apos;interface que vos clients verront depuis leur lien ou QR code.
                </p>
              </div>

              {/* ── Section 1: Colours ──────────────────────────────── */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Couleurs du portail
                </p>

                {/* Predefined theme swatches */}
                <div className="grid grid-cols-5 gap-2">
                  {THEMES.map((theme) => {
                    const active = activeTheme?.name === theme.name
                    return (
                      <button
                        key={theme.name}
                        type="button"
                        onClick={() => { setPrimaryColor(theme.primary); setSecondaryColor(theme.secondary) }}
                        className={`relative rounded-xl border-2 p-2.5 flex flex-col items-center gap-1.5 transition-all ${
                          active
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex gap-1">
                          <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: theme.primary }} />
                          <div className="w-4 h-4 rounded-full shadow-sm border border-border" style={{ backgroundColor: theme.secondary }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{theme.name}</span>
                        {active && (
                          <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Custom color pickers */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Couleur principale</Label>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-lg border border-border overflow-hidden cursor-pointer shrink-0 shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => { setPrimaryColor(e.target.value) }}
                          className="opacity-0 w-full h-full cursor-pointer"
                          aria-label="Couleur principale"
                        />
                      </div>
                      <span className="text-sm font-mono text-muted-foreground">{primaryColor}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Couleur secondaire</Label>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-lg border border-border overflow-hidden cursor-pointer shrink-0 shadow-sm"
                        style={{ backgroundColor: secondaryColor }}
                      >
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => { setSecondaryColor(e.target.value) }}
                          className="opacity-0 w-full h-full cursor-pointer"
                          aria-label="Couleur secondaire"
                        />
                      </div>
                      <span className="text-sm font-mono text-muted-foreground">{secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Visibility toggles ───────────────────── */}
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Informations affichées
                </p>
                <p className="text-xs text-muted-foreground pb-3">
                  Choisissez ce qui sera visible par vos clients.
                </p>

                {/* Business name — always on */}
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">Nom du commerce</p>
                    <p className="text-xs text-muted-foreground">{profile.name || '—'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground italic">Toujours visible</span>
                </div>

                {/* Dynamic toggles */}
                {filledFields.length > 0 ? (
                  filledFields.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between py-3 border-t border-border/50">
                      <p className="text-sm font-medium">{label}</p>
                      <Toggle
                        checked={visibility[key]}
                        onChange={(v) => setVisibility((prev) => ({ ...prev, [key]: v }))}
                      />
                    </div>
                  ))
                ) : (
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs text-muted-foreground italic">
                      Aucune information complémentaire renseignée.
                      Complétez votre profil dans les paramètres pour afficher téléphone, adresse, etc.
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground pt-4 border-t border-border/50">
                  Vous pouvez modifier ces informations plus tard.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
