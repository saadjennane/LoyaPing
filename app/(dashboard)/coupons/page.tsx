'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, UserPlus, Gift, Clock, CheckCircle2, XCircle, Ticket, AlertCircle, QrCode, Trash2, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Coupon, Client, LoyaltyTier } from '@/lib/types'
import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientFullName(c: Client | null | undefined): string {
  if (!c) return '—'
  const parts = [c.civility, c.first_name, c.last_name].filter(Boolean)
  if (parts.length > 1 || (parts.length === 1 && parts[0] !== c.civility)) return parts.join(' ')
  return c.phone_number
}

const EXPIRING_SOON_DAYS = 7

function isExpiringSoon(coupon: Coupon): boolean {
  const days = differenceInDays(parseISO(coupon.expires_at), new Date())
  return days >= 0 && days <= EXPIRING_SOON_DAYS
}

function daysLeft(coupon: Coupon): number {
  return differenceInDays(parseISO(coupon.expires_at), new Date())
}

// Count badge
function CountBadge({ n }: { n: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs rounded-full bg-black/10 font-normal">
      {n}
    </span>
  )
}

type DialogStep = 'search' | 'new_client' | 'reward'
type NewClientForm = { civility: string; first_name: string; last_name: string; phone_number: string }
const EMPTY_NEW_CLIENT: NewClientForm = { civility: '', first_name: '', last_name: '', phone_number: '' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const { t } = useI18n()
  const { status } = useConfigStatus()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [tiers, setTiers] = useState<LoyaltyTier[]>([])
  const [loading, setLoading] = useState(true)
  const [listSearch, setListSearch] = useState('')

  // Redeem dialog
  const [redeemOpen, setRedeemOpen]   = useState(false)
  const [redeemCode, setRedeemCode]   = useState('')
  const [redeeming, setRedeeming]     = useState(false)

  // Current tab (for bulk actions context)
  const [activeTab, setActiveTab] = useState('active')

  // Mobile select mode
  const [mobileSelectMode, setMobileSelectMode] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkReactivateOpen, setBulkReactivateOpen] = useState(false)
  const [bulkExtendOpen, setBulkExtendOpen] = useState(false)
  const [bulkDays, setBulkDays] = useState('30')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Offer dialog
  const [offerOpen, setOfferOpen] = useState(false)
  const [step, setStep] = useState<DialogStep>('search')
  const [allClients, setAllClients] = useState<Client[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [newClientForm, setNewClientForm] = useState<NewClientForm>(EMPTY_NEW_CLIENT)
  const [selectedTierId, setSelectedTierId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchCoupons = useCallback(async () => {
    const [couponsRes, tiersRes] = await Promise.all([
      fetch('/api/loyalty/coupons').then((r) => r.json()),
      fetch('/api/loyalty/tiers').then((r) => r.json()),
    ])
    setCoupons(couponsRes.data ?? [])
    setTiers(tiersRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCoupons() }, [fetchCoupons])

  // Fetch clients when dialog opens
  useEffect(() => {
    if (!offerOpen) return
    fetch('/api/clients').then((r) => r.json()).then((j) => setAllClients(j.data ?? []))
  }, [offerOpen])

  // Reset dialog on close
  useEffect(() => {
    if (!offerOpen) {
      setStep('search')
      setSearchQuery('')
      setSelectedClient(null)
      setNewClientForm(EMPTY_NEW_CLIENT)
      setSelectedTierId('')
      setSubmitting(false)
    }
  }, [offerOpen])

  // ── Derived lists ──────────────────────────────────────────────────────────
  const visibleCoupons = listSearch.trim()
    ? coupons.filter((c) => {
        const client = c.client as Client | undefined
        const q = listSearch.toLowerCase()
        return clientFullName(client).toLowerCase().includes(q) ||
               (client?.phone_number ?? '').includes(q)
      })
    : coupons

  const active       = visibleCoupons.filter((c) => c.status === 'active')
  const expiring     = visibleCoupons.filter((c) => c.status === 'active' && isExpiringSoon(c))
  const used         = visibleCoupons.filter((c) => c.status === 'used')
  const expired      = visibleCoupons.filter((c) => c.status === 'expired')

  const filteredClients = searchQuery.trim().length < 2
    ? []
    : allClients.filter((c) => {
        const q = searchQuery.toLowerCase()
        const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
        return c.phone_number.includes(q) || name.includes(q)
      }).slice(0, 6)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setRedeeming(true)
    const res = await fetch('/api/loyalty/coupons/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: redeemCode }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      toast.success('Coupon validé !')
      setRedeemOpen(false)
      setRedeemCode('')
      fetchCoupons()
    }
    setRedeeming(false)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setStep('reward')
  }

  const handleGoToNewClient = () => {
    const isPhone = /^[+\d\s]+$/.test(searchQuery.trim()) && searchQuery.trim().length > 3
    setNewClientForm({ civility: '', first_name: '', last_name: '', phone_number: isPhone ? searchQuery.trim() : '' })
    setStep('new_client')
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClientForm),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error); setSubmitting(false); return }
    setSelectedClient(json.data)
    setStep('reward')
    setSubmitting(false)
  }

  const handleOfferCoupon = async () => {
    if (!selectedClient || !selectedTierId) return
    setSubmitting(true)
    const res = await fetch(`/api/clients/${selectedClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock_reward', tier_id: selectedTierId }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(t('coupons.toast.offered', { name: clientFullName(selectedClient) }))
      setOfferOpen(false)
      fetchCoupons()
    }
    setSubmitting(false)
  }

  // ── Bulk helpers ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/loyalty/coupons/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} coupon(s) supprimé(s)`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      fetchCoupons()
    }
    setBulkDeleting(false)
  }

  const handleBulkReactivate = async () => {
    setBulkUpdating(true)
    const res = await fetch('/api/loyalty/coupons/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: 'reactivate', extend_days: parseInt(bulkDays) || 30 }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} coupon(s) réactivé(s)`)
      setSelectedIds(new Set())
      setBulkReactivateOpen(false)
      setBulkDays('30')
      fetchCoupons()
    }
    setBulkUpdating(false)
  }

  const handleBulkExtend = async () => {
    setBulkUpdating(true)
    const res = await fetch('/api/loyalty/coupons/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: 'extend', extend_days: parseInt(bulkDays) || 7 }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} coupon(s) prolongé(s) de ${bulkDays} jour(s)`)
      setSelectedIds(new Set())
      setBulkExtendOpen(false)
      setBulkDays('7')
      fetchCoupons()
    }
    setBulkUpdating(false)
  }

  // ── Mobile card renderer ───────────────────────────────────────────────────
  const renderMobileCards = (list: Coupon[], variant: 'active' | 'expiring' | 'used' | 'expired') => {
    if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
    if (list.length === 0) return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <Ticket className="h-8 w-8 opacity-30" />
        <p className="text-sm">{t('coupons.noCoupons')}</p>
      </div>
    )
    return (
      <div className="space-y-2 p-3">
        {list.map((coupon) => {
          const client = coupon.client as Client | undefined
          const tier = coupon.tier
          const days = daysLeft(coupon)
          const isSelected = selectedIds.has(coupon.id)
          return (
            <div
              key={coupon.id}
              className={`bg-card border rounded-xl p-3 flex items-center gap-3 cursor-pointer active:bg-muted/30 transition-colors ${
                isSelected ? 'border-indigo-400 bg-indigo-50/30' : 'border-border'
              }`}
              onClick={() => { if (mobileSelectMode) toggleSelect(coupon.id) }}
            >
              {mobileSelectMode && (
                <div className="shrink-0">
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-muted-foreground/40'
                  }`}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{clientFullName(client)}</div>
                  <CouponStatusBadge status={coupon.status} />
                </div>
                {client && <div className="text-xs text-muted-foreground">{client.phone_number}</div>}
                <div className="text-sm text-muted-foreground mt-0.5 truncate">{tier?.reward_description ?? '—'}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {variant !== 'used' && (
                    <span className={`text-xs ${days <= 3 && variant !== 'expired' ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {variant === 'expired'
                        ? `Expiré le ${format(parseISO(coupon.expires_at), 'd MMM yyyy', { locale: fr })}`
                        : `Expire le ${format(parseISO(coupon.expires_at), 'd MMM yyyy', { locale: fr })}`}
                    </span>
                  )}
                  {variant === 'expiring' && (
                    <Badge className={
                      days <= 1 ? 'bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5 py-0'
                      : days <= 3 ? 'bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px] px-1.5 py-0'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] px-1.5 py-0'
                    }>
                      {days === 0 ? t('coupons.expiresDay') : t('coupons.daysLeft', { count: days })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Table renderer ─────────────────────────────────────────────────────────
  const renderTable = (list: Coupon[], variant: 'active' | 'expiring' | 'used' | 'expired') => {
    if (loading) {
      return <div className="text-muted-foreground text-sm py-12 text-center">{t('common.loading')}</div>
    }
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Ticket className="h-8 w-8 opacity-30" />
          <p className="text-sm">{t('coupons.noCoupons')}</p>
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="pl-4 py-5 w-10" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                checked={list.length > 0 && list.every(c => selectedIds.has(c.id))}
                ref={(el) => {
                  if (el) el.indeterminate = list.some(c => selectedIds.has(c.id)) && !list.every(c => selectedIds.has(c.id))
                }}
                onChange={() => {
                  const allSelected = list.every(c => selectedIds.has(c.id))
                  if (allSelected) {
                    setSelectedIds(prev => { const next = new Set(prev); list.forEach(c => next.delete(c.id)); return next })
                  } else {
                    setSelectedIds(prev => { const next = new Set(prev); list.forEach(c => next.add(c.id)); return next })
                  }
                }}
              />
            </TableHead>
            <TableHead className="pl-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('coupons.columns.client')}</TableHead>
            <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('coupons.columns.reward')}</TableHead>
            <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('coupons.columns.created')}</TableHead>
            <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">
              {variant === 'used' ? t('coupons.columns.usedCol') : variant === 'expired' ? t('coupons.columns.expiredCol') : t('coupons.columns.expires')}
            </TableHead>
            {variant === 'expiring' && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('coupons.columns.delay')}</TableHead>}
            {(variant === 'active' || variant === 'expiring') && <TableHead className="pr-6 py-5" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((coupon) => {
            const client = coupon.client as Client | undefined
            const tier = coupon.tier
            const days = daysLeft(coupon)
            return (
              <TableRow key={coupon.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="pl-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    checked={selectedIds.has(coupon.id)}
                    onChange={() => toggleSelect(coupon.id)}
                  />
                </TableCell>
                <TableCell className="pl-6 py-4">
                  <div className="font-medium text-sm">{clientFullName(client)}</div>
                  {client && (
                    <div className="text-xs text-muted-foreground">{client.phone_number}</div>
                  )}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <span className="text-sm">{tier?.reward_description ?? '—'}</span>
                </TableCell>
                <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                  {format(parseISO(coupon.created_at), 'd MMM yyyy', { locale: fr })}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm">
                  {variant === 'used' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={days <= 3 && variant !== 'expired' ? 'text-red-600 font-medium' : ''}>
                      {format(parseISO(coupon.expires_at), 'd MMM yyyy', { locale: fr })}
                    </span>
                  )}
                </TableCell>
                {variant === 'expiring' && (
                  <TableCell className="px-6 py-4">
                    <Badge
                      className={
                        days <= 1
                          ? 'bg-red-100 text-red-700 hover:bg-red-100'
                          : days <= 3
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-100'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                      }
                    >
                      {days === 0 ? t('coupons.expiresDay') : t('coupons.daysLeft', { count: days })}
                    </Badge>
                  </TableCell>
                )}
                {(variant === 'active' || variant === 'expiring') && (
                  <TableCell className="pr-6 py-4 text-right">
                    <CouponStatusBadge status={coupon.status} />
                  </TableCell>
                )}
                {variant === 'used' && (
                  <TableCell className="pr-6 py-4">
                    <CouponStatusBadge status="used" />
                  </TableCell>
                )}
                {variant === 'expired' && (
                  <TableCell className="pr-6 py-4">
                    <CouponStatusBadge status="expired" />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  const dialogTitle =
    step === 'new_client' ? t('appointments.form.newClientTitle')
    : step === 'reward'   ? t('coupons.form.chooseTitle')
    : t('coupons.offerBtn')

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      {/* Loyalty not configured — blocking banner */}
      {status !== null && !status.loyalty_configured && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Programme de fidélité non configuré</p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
              Créez au moins un palier pour activer le système de fidélité et offrir des récompenses.
            </p>
            <a href="/settings/loyalty">
              <button className="mt-2 text-sm font-medium text-red-800 dark:text-red-300 underline">
                Configurer maintenant
              </button>
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{t('coupons.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {active.length !== 1 ? t('coupons.activePlural', { count: active.length }) : t('coupons.activeSingular', { count: active.length })}
            {' · '}
            {used.length !== 1 ? t('coupons.usedPlural', { count: used.length }) : t('coupons.usedSingular', { count: used.length })}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 items-end md:flex-row md:gap-2 md:items-center">
          <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm" onClick={() => setRedeemOpen(true)}>
            <QrCode className="h-4 w-4 mr-2" />Valider un coupon
          </Button>
          <Button variant="outline" onClick={() => setOfferOpen(true)}>
            <Gift className="h-4 w-4 mr-2" />{t('coupons.offerBtn')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher un client..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setMobileSelectMode(false) }} className="gap-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Mobile filter bar */}
        <div className="md:hidden flex items-center gap-2 p-3 border-b">
          <Select value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setMobileSelectMode(false) }}>
            <SelectTrigger className="h-9 flex-1 font-medium text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('coupons.tabs.active')} ({active.length})</SelectItem>
              <SelectItem value="expiring">{t('coupons.tabs.expiring')} ({expiring.length})</SelectItem>
              <SelectItem value="used">{t('coupons.tabs.used')} ({used.length})</SelectItem>
              <SelectItem value="expired">{t('coupons.tabs.expired')} ({expired.length})</SelectItem>
            </SelectContent>
          </Select>
          <button
            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            onClick={() => {
              if (mobileSelectMode) { setMobileSelectMode(false); setSelectedIds(new Set()) }
              else setMobileSelectMode(true)
            }}
          >
            {mobileSelectMode ? 'Annuler' : 'Sélectionner'}
          </button>
        </div>

        <TabsList className="hidden md:flex w-full justify-start border-b border-border bg-transparent h-auto p-0 rounded-none md:px-6 overflow-x-auto">
          <TabsTrigger value="active" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">
            <Gift className="h-3.5 w-3.5" />
            {t('coupons.tabs.active')}<CountBadge n={active.length} />
          </TabsTrigger>
          <TabsTrigger value="expiring" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">
            <Clock className="h-3.5 w-3.5" />
            {t('coupons.tabs.expiring')}<CountBadge n={expiring.length} />
          </TabsTrigger>
          <TabsTrigger value="used" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('coupons.tabs.used')}<CountBadge n={used.length} />
          </TabsTrigger>
          <TabsTrigger value="expired" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">
            <XCircle className="h-3.5 w-3.5" />
            {t('coupons.tabs.expired')}<CountBadge n={expired.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-0">
          <div className="md:hidden">{renderMobileCards(active, 'active')}</div>
          <div className="hidden md:block">{renderTable(active, 'active')}</div>
        </TabsContent>

        <TabsContent value="expiring" className="mt-0">
          <div className="md:hidden">{renderMobileCards(expiring, 'expiring')}</div>
          <div className="hidden md:block">{renderTable(expiring, 'expiring')}</div>
        </TabsContent>

        <TabsContent value="used" className="mt-0">
          <div className="md:hidden">{renderMobileCards(used, 'used')}</div>
          <div className="hidden md:block">{renderTable(used, 'used')}</div>
        </TabsContent>

        <TabsContent value="expired" className="mt-0">
          <div className="md:hidden">{renderMobileCards(expired, 'expired')}</div>
          <div className="hidden md:block">{renderTable(expired, 'expired')}</div>
        </TabsContent>
      </Tabs>

      {/* ── Offer coupon dialog ─────────────────────────────────────────────── */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {/* Step 1 — Search client */}
          {step === 'search' && (
            <div className="space-y-3 mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-9"
                  placeholder={t('coupons.form.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {searchQuery.trim().length >= 2 && (
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {filteredClients.length > 0
                    ? filteredClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => handleSelectClient(client)}
                          className="px-3 py-2.5 rounded-lg hover:bg-muted/60 cursor-pointer flex flex-col gap-0.5 border border-transparent hover:border-border transition-colors"
                        >
                          <span className="text-sm font-medium">{clientFullName(client)}</span>
                          {(client.first_name || client.last_name) && (
                            <span className="text-xs text-muted-foreground">{client.phone_number}</span>
                          )}
                        </div>
                      ))
                    : <p className="text-sm text-muted-foreground px-1 py-2">{t('coupons.form.noClients')}</p>}
                </div>
              )}
              <div className={searchQuery.trim().length >= 2 ? 'pt-2 border-t' : ''}>
                <Button
                  type="button" variant="ghost"
                  className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={handleGoToNewClient}
                >
                  <UserPlus className="h-4 w-4 mr-2" />{t('coupons.form.createNew')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — New client form */}
          {step === 'new_client' && (
            <div className="space-y-4 mt-2">
              <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground"
                onClick={() => setStep('search')}>
                {t('coupons.form.backBtn')}
              </Button>
              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="flex gap-2">
                  <Select
                    value={newClientForm.civility}
                    onValueChange={(v) => setNewClientForm({ ...newClientForm, civility: v === '_' ? '' : v })}
                  >
                    <SelectTrigger className="w-20 shrink-0">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Mme">Mme</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    autoFocus placeholder={t('common.firstName')}
                    value={newClientForm.first_name} required
                    onChange={(e) => setNewClientForm({ ...newClientForm, first_name: e.target.value })}
                  />
                  <Input
                    placeholder={t('common.lastName')}
                    value={newClientForm.last_name} required
                    onChange={(e) => setNewClientForm({ ...newClientForm, last_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('coupons.form.phoneLabel')}</Label>
                  <Input
                    placeholder="+212612345678"
                    value={newClientForm.phone_number} required
                    onChange={(e) => setNewClientForm({ ...newClientForm, phone_number: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? t('common.creating') : t('common.continue')}
                </Button>
              </form>
            </div>
          )}

          {/* Step 3 — Choose reward */}
          {step === 'reward' && selectedClient && (
            <div className="space-y-4 mt-2">
              {/* Client summary */}
              <div className="px-3 py-2.5 bg-muted/40 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{clientFullName(selectedClient)}</div>
                  {(selectedClient.first_name || selectedClient.last_name) && (
                    <div className="text-xs text-muted-foreground">{selectedClient.phone_number}</div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7"
                  onClick={() => { setSelectedClient(null); setStep('search') }}>
                  {t('coupons.form.changeBtn')}
                </Button>
              </div>

              {tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('coupons.form.noTiers')}
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{t('coupons.form.rewardLabel')}</Label>
                    <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('coupons.form.chooseReward')} />
                      </SelectTrigger>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.reward_description}
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({tier.required_points} {t('common.pts')} · valable {tier.validity_days}j)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!selectedTierId || submitting}
                    onClick={handleOfferCoupon}
                  >
                    {submitting ? t('common.sending') : t('coupons.form.offerBtn')}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk floating action bar ──────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{selectedIds.size} sélectionné(s)</span>
          <div className="w-px h-4 bg-border" />
          {(activeTab === 'active' || activeTab === 'expiring') && (
            <Button size="sm" variant="outline" onClick={() => { setBulkDays('7'); setBulkExtendOpen(true) }}>
              Prolonger
            </Button>
          )}
          {activeTab === 'expired' && (
            <Button size="sm" variant="outline" onClick={() => { setBulkDays('30'); setBulkReactivateOpen(true) }}>
              Réactiver
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button size="sm" variant="ghost" onClick={() => { setSelectedIds(new Set()); setMobileSelectMode(false) }}>Désélectionner</Button>
        </div>
      )}

      {/* ── Bulk delete confirm ────────────────────────────────────────────── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer {selectedIds.size} coupon(s) ?</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)}>Annuler</Button>
              <Button variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete}>
                {bulkDeleting ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk reactivate dialog ─────────────────────────────────────────── */}
      <Dialog open={bulkReactivateOpen} onOpenChange={(o) => { setBulkReactivateOpen(o); if (!o) setBulkDays('30') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Réactiver {selectedIds.size} coupon(s) expiré(s)</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Le statut repassera à « Actif » et la date d&apos;expiration sera repoussée.</p>
            <div className="space-y-1">
              <Label>Prolonger de (jours)</Label>
              <Input type="number" min="1" value={bulkDays} onChange={(e) => setBulkDays(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setBulkReactivateOpen(false)}>Annuler</Button>
              <Button disabled={bulkUpdating || !bulkDays} onClick={handleBulkReactivate}>
                {bulkUpdating ? 'Réactivation...' : `Réactiver (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk extend dialog ─────────────────────────────────────────────── */}
      <Dialog open={bulkExtendOpen} onOpenChange={(o) => { setBulkExtendOpen(o); if (!o) setBulkDays('7') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Prolonger {selectedIds.size} coupon(s)</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">La date d&apos;expiration sera repoussée du nombre de jours indiqué.</p>
            <div className="space-y-1">
              <Label>Prolonger de (jours)</Label>
              <Input type="number" min="1" value={bulkDays} onChange={(e) => setBulkDays(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setBulkExtendOpen(false)}>Annuler</Button>
              <Button disabled={bulkUpdating || !bulkDays} onClick={handleBulkExtend}>
                {bulkUpdating ? 'Prolongation...' : `Prolonger (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Redeem dialog ───────────────────────────────────────────────────── */}
      <Dialog open={redeemOpen} onOpenChange={(o) => { setRedeemOpen(o); if (!o) setRedeemCode('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider un coupon</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRedeem} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Code à 6 chiffres du client</Label>
              <Input
                autoFocus
                placeholder="123456"
                maxLength={6}
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl font-mono tracking-widest"
                required
              />
              <p className="text-xs text-muted-foreground text-center">Le client vous montre ce code depuis son portail client</p>
            </div>
            <Button type="submit" className="w-full bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white" disabled={redeeming || redeemCode.length < 6}>
              {redeeming ? 'Validation...' : 'Valider la récompense'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function CouponStatusBadge({ status }: { status: Coupon['status'] }) {
  const { t } = useI18n()
  if (status === 'active') return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('coupons.status.active')}</Badge>
  )
  if (status === 'used') return (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{t('coupons.status.used')}</Badge>
  )
  return (
    <Badge variant="outline" className="text-muted-foreground">{t('coupons.status.expired')}</Badge>
  )
}
