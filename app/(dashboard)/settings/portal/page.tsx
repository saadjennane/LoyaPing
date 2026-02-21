'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Smartphone, Monitor, Globe, MapPin, Phone, Check, Lock, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BusinessProfile } from '@/lib/types'
import { useI18n } from '@/lib/i18n/provider'

const PRESET_CURRENCIES = ['MAD', 'EUR', 'USD']

const PORTAL_THEMES = [
  { name: 'Indigo',   primary: '#6366f1', secondary: '#e0e7ff' },
  { name: 'Violet',   primary: '#8b5cf6', secondary: '#ede9fe' },
  { name: 'Rose',     primary: '#f43f5e', secondary: '#ffd7df' },
  { name: 'Corail',   primary: '#f97316', secondary: '#ffedd5' },
  { name: 'Ambre',    primary: '#d97706', secondary: '#fef3c7' },
  { name: 'Émeraude', primary: '#10b981', secondary: '#d1fae5' },
  { name: 'Océan',    primary: '#0ea5e9', secondary: '#e0f2fe' },
  { name: 'Ardoise',  primary: '#475569', secondary: '#f1f5f9' },
  { name: 'Bordeaux', primary: '#be123c', secondary: '#ffe4e6' },
  { name: 'Forêt',    primary: '#166534', secondary: '#dcfce7' },
] as const

type ProfileSnap = Pick<BusinessProfile, 'name' | 'logo_url' | 'phone' | 'email' | 'website' | 'address' | 'primary_color' | 'secondary_color' | 'currency'>

const PORTAL_FAKE_TIERS = [
  { pts: 100, label: 'Café offert',                  reached: true  },
  { pts: 200, label: '-10% sur la prochaine visite', reached: false },
  { pts: 500, label: 'Cadeau surprise',              reached: false },
]
const PORTAL_FAKE_PTS = 120

function PortalPreview({ profile }: { profile: ProfileSnap }) {
  const primary  = profile.primary_color ?? '#6366f1'
  const name     = profile.name || 'Ma Boutique'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')

  const nextTier = PORTAL_FAKE_TIERS.find((t) => !t.reached)
  const maxPts   = nextTier?.pts ?? PORTAL_FAKE_TIERS[PORTAL_FAKE_TIERS.length - 1].pts
  const pct      = Math.min((PORTAL_FAKE_PTS / maxPts) * 100, 100)

  return (
    <div className="px-3 py-4 space-y-3 text-[13px] text-gray-900">

      {/* Business header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-10 w-full rounded-t-2xl" style={{ backgroundColor: primary }} />
        <div className="px-3 pb-3">
          <div className="flex items-end gap-2 -mt-5 mb-2">
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo_url} alt="Logo" className="h-12 w-12 rounded-xl object-cover border-2 border-white shadow shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-base font-bold border-2 border-white shadow shrink-0" style={{ backgroundColor: primary }}>
                {initials}
              </div>
            )}
            <div className="text-sm font-bold text-gray-900 leading-tight pb-0.5">{name}</div>
          </div>
          {/* Icon row */}
          <div className="flex items-center gap-1">
            {[MapPin, Phone, Globe].map((Icon, i) => (
              <div key={i} className="flex items-center justify-center h-7 w-7 rounded-full">
                <Icon className="h-3.5 w-3.5" style={{ color: primary }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Loyalty block — matches real portal */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gray-50">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-gray-700">Ma fidélité</span>
        </div>
        <div className="px-3 py-2.5 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-semibold" style={{ color: primary }}>{PORTAL_FAKE_PTS} pts</span>
            {nextTier
              ? <span className="text-gray-400">Prochain palier à {nextTier.pts} pts</span>
              : <span className="text-green-600">Tous les paliers atteints !</span>}
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: primary }} />
          </div>
          <div className="space-y-1 pt-1">
            {PORTAL_FAKE_TIERS.map((tier, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs py-0.5 ${tier.reached ? '' : 'text-gray-400'}`}>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={tier.reached ? { borderColor: primary, backgroundColor: primary } : { borderColor: '#d1d5db' }}>
                  {tier.reached ? <Check className="h-2.5 w-2.5 text-white" /> : <Lock className="h-2 w-2 text-gray-300" />}
                </div>
                <span className={tier.reached ? 'font-medium text-gray-900' : ''}>{tier.pts} pts — {tier.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-center text-gray-300">Propulsé par LoyaPing</p>
    </div>
  )
}

export default function PortalPage() {
  const { t } = useI18n()

  const [profile, setProfile] = useState<ProfileSnap>({
    name: '', logo_url: null, phone: null, email: null, website: null,
    address: null, primary_color: null, secondary_color: null, currency: 'MAD',
  })
  const [currencyCustom, setCurrencyCustom] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/settings/profile').then((r) => r.json())
    if (res.data) {
      const p = res.data as BusinessProfile
      const isPreset = PRESET_CURRENCIES.includes(p.currency)
      setProfile({
        name: p.name, logo_url: p.logo_url, phone: p.phone, email: p.email,
        website: p.website, address: p.address ?? null,
        primary_color: p.primary_color ?? null, secondary_color: p.secondary_color ?? null,
        currency: isPreset ? p.currency : 'autre',
      })
      if (!isPreset) setCurrencyCustom(p.currency)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:            profile.name || 'Boutique',
        currency:        PRESET_CURRENCIES.includes(profile.currency) ? profile.currency : (currencyCustom || 'MAD'),
        primary_color:   profile.primary_color,
        secondary_color: profile.secondary_color,
      }),
    }).then((r) => r.json())
    if (res.error) toast.error(res.error)
    else toast.success(t('settings.toast.appearanceSaved'))
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Portail client</h2>
        <p className="text-sm text-muted-foreground">Personnalisez l&apos;espace fidélité visible par vos clients.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8 items-start">
        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Couleurs de marque</CardTitle>
              <p className="text-sm text-muted-foreground">Personnalisent l&apos;espace fidélité, la barre de progression et les boutons.</p>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Thèmes prédéfinis</span>
                <div className="flex flex-wrap gap-1.5">
                  {PORTAL_THEMES.map((theme) => {
                    const isActive = profile.primary_color?.toLowerCase() === theme.primary && profile.secondary_color?.toLowerCase() === theme.secondary
                    return (
                      <button key={theme.name} type="button" onClick={() => setProfile({ ...profile, primary_color: theme.primary, secondary_color: theme.secondary })}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs transition-all ${isActive ? 'border-gray-800 bg-gray-50 font-medium shadow-sm' : 'border-gray-200 text-muted-foreground hover:border-gray-300 hover:bg-gray-50'}`}>
                        <div className="relative w-3.5 h-3.5 rounded-full overflow-hidden border border-black/10 shrink-0">
                          <div className="absolute inset-y-0 left-0 w-1/2" style={{ backgroundColor: theme.primary }} />
                          <div className="absolute inset-y-0 right-0 w-1/2" style={{ backgroundColor: theme.secondary }} />
                        </div>
                        {theme.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t" />

              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'primary_color'   as const, label: 'Principale', defaultVal: '#6366f1' },
                  { key: 'secondary_color' as const, label: 'Secondaire', defaultVal: '#e0e7ff' },
                ] as const).map(({ key, label, defaultVal }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={profile[key] ?? defaultVal} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-input p-0.5 shrink-0" />
                      <Input placeholder={defaultVal} value={profile[key] ?? ''} maxLength={7} onChange={(e) => setProfile({ ...profile, [key]: e.target.value || null })} className="font-mono text-xs h-8" />
                      {profile[key] && <button type="button" onClick={() => setProfile({ ...profile, [key]: null })} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={saving}>{saving ? t('settings.saving') : t('settings.saveAppearance')}</Button>
        </form>

        {/* Live preview */}
        <div className="space-y-3 xl:sticky xl:top-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Aperçu en temps réel</span>
            <div className="flex items-center gap-1 rounded-lg border border-border p-1 bg-muted/40">
              <button type="button" onClick={() => setPreviewMode('mobile')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === 'mobile' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Smartphone className="h-3.5 w-3.5" />Mobile
              </button>
              <button type="button" onClick={() => setPreviewMode('desktop')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === 'desktop' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Monitor className="h-3.5 w-3.5" />Desktop
              </button>
            </div>
          </div>

          {previewMode === 'mobile' ? (
            <div className="flex justify-center">
              <div className="relative w-[320px] shrink-0">
                <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
                  <div className="h-6 bg-gray-800 flex items-center justify-center"><div className="w-16 h-3 bg-black rounded-full" /></div>
                  <div className="bg-gray-50 overflow-y-auto" style={{ height: 560 }}><PortalPreview profile={profile} /></div>
                  <div className="h-5 bg-gray-800 flex items-center justify-center"><div className="w-20 h-1 bg-gray-600 rounded-full" /></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 shadow-lg overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200">
                <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><div className="w-3 h-3 rounded-full bg-yellow-400" /><div className="w-3 h-3 rounded-full bg-green-400" /></div>
                <div className="flex-1 mx-4 bg-white rounded border border-gray-200 px-3 py-1 text-xs text-gray-400 font-mono">loyaping.com/c/…</div>
              </div>
              <div className="overflow-y-auto bg-gray-50" style={{ height: 520 }}>
                <div className="max-w-md mx-auto"><PortalPreview profile={profile} /></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
