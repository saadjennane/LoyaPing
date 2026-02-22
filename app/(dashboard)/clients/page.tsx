'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, Edit2, Coins, Gift, Trash2, ExternalLink, Minus,
  Phone, Mail, Star, CalendarDays, ArrowLeft, MoreHorizontal,
  Cake, FileText, Activity, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Client, LoyaltyTier, Order, Appointment, Coupon, PointsLog, ClientDetailData, CustomerIndexItem } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import CustomerAutocomplete from '@/components/CustomerAutocomplete'
import PhoneInput from '@/components/PhoneInput'
import { useI18n } from '@/lib/i18n/provider'
import { useModules } from '@/lib/context/modules'
import { useClientFieldConfig } from '@/lib/context/client-field-config'
import { useCustomerIndex } from '@/lib/hooks/useCustomerIndex'

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientFullName(c: Client): string {
  const parts = [c.civility, c.first_name, c.last_name].filter(Boolean)
  if (parts.length > 1 || (parts.length === 1 && parts[0] !== c.civility)) return parts.join(' ')
  return c.phone_number
}

function getProgress(client: Client, tiers: LoyaltyTier[]) {
  if (!tiers.length) return { progress: 0, nextTier: null as LoyaltyTier | null, current: 0, target: 0 }
  const nextTier = tiers.find((t) => t.required_points > client.current_cycle_points) ?? null
  if (!nextTier) return {
    progress: 100, nextTier: null,
    current: client.current_cycle_points,
    target: tiers[tiers.length - 1]?.required_points ?? 0,
  }
  return {
    progress: Math.min((client.current_cycle_points / nextTier.required_points) * 100, 100),
    nextTier,
    current: client.current_cycle_points,
    target: nextTier.required_points,
  }
}

type ClientStatus = 'pending' | 'ready' | 'scheduled'
const STATUS_CONFIG: Record<ClientStatus, { labelKey: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pending:   { labelKey: 'clients.status.pending',   variant: 'secondary' },
  ready:     { labelKey: 'clients.status.ready',     variant: 'default' },
  scheduled: { labelKey: 'clients.status.scheduled', variant: 'outline' },
}

const APPT_LABEL_KEYS: Record<string, string> = {
  scheduled: 'clients.apptLabels.scheduled',
  show:      'clients.apptLabels.show',
  no_show:   'clients.apptLabels.no_show',
}

const SOURCE_LABEL_KEYS: Record<string, string> = {
  order:       'clients.pointsLog.order',
  appointment: 'clients.pointsLog.appointment',
  manual:      'clients.pointsLog.manual',
  undo:        'clients.pointsLog.undo',
}

type InfoForm = { civility: string; first_name: string; last_name: string; phone_number: string; email: string; birthday: string; notes: string }
const EMPTY_INFO: InfoForm = { civility: '', first_name: '', last_name: '', phone_number: '', email: '', birthday: '', notes: '' }

type DetailView = 'main' | 'edit_info' | 'edit_points' | 'unlock_reward' | 'delete_confirm'

// VIEW_TITLES keys — translated at render time via t('clients.actions.*Title')
type ViewTitleKey = Exclude<DetailView, 'main'>
const VIEW_TITLE_KEYS: Record<ViewTitleKey, string> = {
  edit_info:      'clients.actions.editInfoTitle',
  edit_points:    'clients.actions.editPointsTitle',
  unlock_reward:  'clients.actions.unlockRewardTitle',
  delete_confirm: 'clients.actions.deleteTitle',
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { t } = useI18n()
  const { modules } = useModules()
  const loyaltyOn = modules.loyalty_enabled
  const statusOn  = modules.orders_enabled || modules.appointments_enabled
  const { config } = useClientFieldConfig()
  const { addOrUpdate: addToIndex } = useCustomerIndex()
  const [clients, setClients] = useState<Client[]>([])
  const [tiers, setTiers] = useState<LoyaltyTier[]>([])
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [upcomingAppts, setUpcomingAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  // Detail dialog
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [detailData, setDetailData] = useState<ClientDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailView, setDetailView] = useState<DetailView>('main')

  // Inline forms within the detail dialog
  const [dvInfoForm, setDvInfoForm] = useState<InfoForm>(EMPTY_INFO)
  const [dvPointsValue, setDvPointsValue] = useState('')
  const [dvUnlockTierId, setDvUnlockTierId] = useState('')
  const [dvSubmitting, setDvSubmitting] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<InfoForm>(EMPTY_INFO)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  // Edit info dialog (table row actions)
  const [editInfo, setEditInfo] = useState<Client | null>(null)
  const [infoForm, setInfoForm] = useState<InfoForm>(EMPTY_INFO)
  const [infoSubmitting, setInfoSubmitting] = useState(false)

  // Edit points dialog (table row actions)
  const [editPoints, setEditPoints] = useState<Client | null>(null)
  const [pointsValue, setPointsValue] = useState('')
  const [pointsSubmitting, setPointsSubmitting] = useState(false)

  // Unlock reward dialog (table row actions)
  const [unlockClient, setUnlockClient] = useState<Client | null>(null)
  const [unlockTierId, setUnlockTierId] = useState('')
  const [unlockSubmitting, setUnlockSubmitting] = useState(false)

  // Delete confirm dialog (table row actions)
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Bulk selection
  const [mobileSelectMode, setMobileSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false)
  const [bulkPointsValue, setBulkPointsValue] = useState('')
  const [bulkPointsSubmitting, setBulkPointsSubmitting] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [clientsRes, tiersRes, ordersRes, apptsRes] = await Promise.all([
      fetch('/api/clients').then((r) => r.json()),
      fetch('/api/loyalty/tiers').then((r) => r.json()),
      fetch('/api/orders').then((r) => r.json()),
      fetch('/api/appointments').then((r) => r.json()),
    ])
    setClients(clientsRes.data ?? [])
    setTiers(tiersRes.data ?? [])
    setActiveOrders((ordersRes.data ?? []).filter((o: Order) => o.status !== 'completed'))
    setUpcomingAppts(apptsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  function getClientStatuses(clientId: string): ClientStatus[] {
    const s: ClientStatus[] = []
    if (activeOrders.some((o) => o.client_id === clientId && o.status === 'pending'))  s.push('pending')
    if (activeOrders.some((o) => o.client_id === clientId && o.status === 'ready'))    s.push('ready')
    if (upcomingAppts.some((a) => a.client_id === clientId))                           s.push('scheduled')
    return s
  }

  // ── Detail dialog ──────────────────────────────────────────────────────
  const openDetail = async (client: Client) => {
    setDetailClient(client)
    setDetailData(null)
    setDetailView('main')
    setDetailLoading(true)
    const res = await fetch(`/api/clients/${client.id}?detail=true`)
    const json = await res.json()
    setDetailData(json.data ?? null)
    setDetailLoading(false)
  }

  const closeDetail = () => {
    setDetailClient(null)
    setDetailView('main')
  }

  const goToDetailView = (view: Exclude<DetailView, 'main'>) => {
    if (!detailClient) return
    if (view === 'edit_info') {
      setDvInfoForm({
        civility:     detailClient.civility     ?? '',
        first_name:   detailClient.first_name   ?? '',
        last_name:    detailClient.last_name    ?? '',
        phone_number: detailClient.phone_number,
        email:        detailClient.email        ?? '',
        birthday:     detailClient.birthday     ?? '',
        notes:        detailClient.notes        ?? '',
      })
    }
    if (view === 'edit_points') setDvPointsValue('')
    if (view === 'unlock_reward') setDvUnlockTierId('')
    setDetailView(view)
  }

  // ── Inline: Edit info ─────────────────────────────────────────────────
  const handleDvInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!detailClient) return
    if (dvInfoForm.email && !isValidEmail(dvInfoForm.email)) { toast.error('Adresse email invalide'); return }
    setDvSubmitting(true)
    if (dvInfoForm.phone_number !== detailClient.phone_number) {
      const r = await fetch(`/api/clients/${detailClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: dvInfoForm.phone_number }),
      })
      const j = await r.json()
      if (j.error) { toast.error(j.error); setDvSubmitting(false); return }
    }
    const res = await fetch(`/api/clients/${detailClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:     'update_info',
        civility:   dvInfoForm.civility   || null,
        first_name: dvInfoForm.first_name || null,
        last_name:  dvInfoForm.last_name  || null,
        email:      dvInfoForm.email      || null,
        birthday:   dvInfoForm.birthday   || null,
        notes:      dvInfoForm.notes      || null,
      }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      const updated: Client = json.data
      const digits = updated.phone_number.replace(/\D/g, '')
      addToIndex({ id: updated.id, display_name: [updated.first_name, updated.last_name].filter(Boolean).join(' ') || updated.phone_number, phone: updated.phone_number, phone_digits: digits, phone_last4: digits.slice(-4), last_activity_at: null })
      toast.success(t('clients.toast.updated'))
      setDetailView('main')
      fetchAll()
      // Refresh detail
      const r2 = await fetch(`/api/clients/${detailClient.id}?detail=true`)
      const j2 = await r2.json()
      setDetailData(j2.data ?? null)
      // Update detailClient with new data
      const r3 = await fetch(`/api/clients/${detailClient.id}`)
      const j3 = await r3.json()
      if (j3.data) setDetailClient(j3.data)
    }
    setDvSubmitting(false)
  }

  // ── Inline: Edit points ───────────────────────────────────────────────
  const handleDvPoints = async (sign: 1 | -1) => {
    if (!detailClient || !dvPointsValue) return
    const delta = parseInt(dvPointsValue) * sign
    if (isNaN(delta) || delta === 0) return
    setDvSubmitting(true)
    const res = await fetch(`/api/clients/${detailClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points_delta: delta }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(`${delta > 0 ? '+' : ''}${delta} ${t('common.pts')} ${t('clients.toast.ptsApplied')}`)
      setDetailView('main')
      fetchAll()
      const r2 = await fetch(`/api/clients/${detailClient.id}?detail=true`)
      const j2 = await r2.json()
      setDetailData(j2.data ?? null)
      const r3 = await fetch(`/api/clients/${detailClient.id}`)
      const j3 = await r3.json()
      if (j3.data) setDetailClient(j3.data)
    }
    setDvSubmitting(false)
  }

  // ── Inline: Unlock reward ─────────────────────────────────────────────
  const handleDvUnlock = async () => {
    if (!detailClient || !dvUnlockTierId) return
    setDvSubmitting(true)
    const res = await fetch(`/api/clients/${detailClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock_reward', tier_id: dvUnlockTierId }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(t('clients.toast.rewardUnlocked'))
      setDetailView('main')
      const r2 = await fetch(`/api/clients/${detailClient.id}?detail=true`)
      const j2 = await r2.json()
      setDetailData(j2.data ?? null)
    }
    setDvSubmitting(false)
  }

  // ── Inline: Delete ────────────────────────────────────────────────────
  const handleDvDelete = async () => {
    if (!detailClient) return
    setDvSubmitting(true)
    const res = await fetch(`/api/clients/${detailClient.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else { toast.success(t('clients.toast.deleted')); closeDetail(); fetchAll() }
    setDvSubmitting(false)
  }

  // ── Table row: Create ─────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createForm.email && !isValidEmail(createForm.email)) { toast.error('Adresse email invalide'); return }
    setCreateSubmitting(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        civility:     createForm.civility   || null,
        first_name:   createForm.first_name || null,
        last_name:    createForm.last_name  || null,
        phone_number: createForm.phone_number,
        email:        createForm.email      || null,
        birthday:     createForm.birthday   || null,
        notes:        createForm.notes      || null,
      }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      const created: Client = json.data
      const digits = created.phone_number.replace(/\D/g, '')
      addToIndex({ id: created.id, display_name: [created.first_name, created.last_name].filter(Boolean).join(' ') || created.phone_number, phone: created.phone_number, phone_digits: digits, phone_last4: digits.slice(-4), last_activity_at: null })
      toast.success(t('clients.toast.added')); setCreateOpen(false); setCreateForm(EMPTY_INFO); fetchAll()
    }
    setCreateSubmitting(false)
  }

  // ── Table row: Edit info ──────────────────────────────────────────────
  const openEditInfo = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditInfo(client)
    setInfoForm({
      civility:     client.civility     ?? '',
      first_name:   client.first_name   ?? '',
      last_name:    client.last_name    ?? '',
      phone_number: client.phone_number,
      email:        client.email        ?? '',
      birthday:     client.birthday     ?? '',
      notes:        client.notes        ?? '',
    })
  }

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editInfo) return
    if (infoForm.email && !isValidEmail(infoForm.email)) { toast.error('Adresse email invalide'); return }
    setInfoSubmitting(true)
    if (infoForm.phone_number !== editInfo.phone_number) {
      const r = await fetch(`/api/clients/${editInfo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: infoForm.phone_number }),
      })
      const j = await r.json()
      if (j.error) { toast.error(j.error); setInfoSubmitting(false); return }
    }
    const res = await fetch(`/api/clients/${editInfo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:     'update_info',
        civility:   infoForm.civility   || null,
        first_name: infoForm.first_name || null,
        last_name:  infoForm.last_name  || null,
        email:      infoForm.email      || null,
        birthday:   infoForm.birthday   || null,
        notes:      infoForm.notes      || null,
      }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      const updated: Client = json.data
      const digits = updated.phone_number.replace(/\D/g, '')
      addToIndex({ id: updated.id, display_name: [updated.first_name, updated.last_name].filter(Boolean).join(' ') || updated.phone_number, phone: updated.phone_number, phone_digits: digits, phone_last4: digits.slice(-4), last_activity_at: null })
      toast.success(t('clients.toast.updated')); setEditInfo(null); fetchAll()
    }
    setInfoSubmitting(false)
  }

  // ── Table row: Edit points ────────────────────────────────────────────
  const openEditPoints = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation(); setEditPoints(client); setPointsValue('')
  }

  const handlePoints = async (sign: 1 | -1) => {
    if (!editPoints || !pointsValue) return
    const delta = parseInt(pointsValue) * sign
    if (isNaN(delta) || delta === 0) return
    setPointsSubmitting(true)
    const res = await fetch(`/api/clients/${editPoints.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points_delta: delta }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else { toast.success(`${delta > 0 ? '+' : ''}${delta} ${t('common.pts')} ${t('clients.toast.ptsApplied')}`); setEditPoints(null); fetchAll() }
    setPointsSubmitting(false)
  }

  // ── Table row: Unlock reward ──────────────────────────────────────────
  const openUnlock = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation(); setUnlockClient(client); setUnlockTierId('')
  }

  const handleUnlock = async () => {
    if (!unlockClient || !unlockTierId) return
    setUnlockSubmitting(true)
    const res = await fetch(`/api/clients/${unlockClient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock_reward', tier_id: unlockTierId }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else { toast.success(t('clients.toast.rewardUnlocked')); setUnlockClient(null); fetchAll() }
    setUnlockSubmitting(false)
  }

  // ── Bulk helpers ──────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === clients.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(clients.map((c) => c.id)))
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/clients/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} client(s) supprimé(s)`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      fetchAll()
    }
    setBulkDeleting(false)
  }

  const handleBulkAdjustPoints = async (sign: 1 | -1) => {
    const delta = parseInt(bulkPointsValue) * sign
    if (isNaN(delta) || delta === 0) return
    setBulkPointsSubmitting(true)
    const res = await fetch('/api/clients/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: 'adjust_points', delta }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${delta > 0 ? '+' : ''}${delta} pts appliqués à ${json.data.count} client(s)`)
      setSelectedIds(new Set())
      setBulkAdjustOpen(false)
      setBulkPointsValue('')
      fetchAll()
    }
    setBulkPointsSubmitting(false)
  }

  // ── Table row: Delete ─────────────────────────────────────────────────
  const openDelete = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation(); setDeleteClient(client)
  }

  const handleDelete = async () => {
    if (!deleteClient) return
    setDeleteSubmitting(true)
    const res = await fetch(`/api/clients/${deleteClient.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else { toast.success(t('clients.toast.deleted')); setDeleteClient(null); fetchAll() }
    setDeleteSubmitting(false)
  }

  // ─── Computed column visibility (only show if config enabled AND ≥1 value) ─
  const showEmailCol    = config.list_email         && clients.some(c => c.email)
  const showBirthdayCol = config.list_birthday      && clients.some(c => c.birthday)
  const showLastActCol  = config.list_last_activity && clients.some(c => c.last_activity)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">{t('clients.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length !== 1
              ? t('clients.clientCountPlural', { count: clients.length })
              : t('clients.clientCount', { count: clients.length })}
          </p>
        </div>
        <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />{t('clients.addBtn')}
        </Button>
      </div>

      {/* Global search — instant client lookup */}
      <div className="max-w-sm">
        <CustomerAutocomplete
          placeholder={t('clients.searchPlaceholder')}
          onSelect={(_id: string, item: CustomerIndexItem) => {
            const found = clients.find((c) => c.id === item.id)
            if (found) openDetail(found)
          }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('clients.noClients')}</p>
            ) : (
              <>
                {/* Sélectionner / Annuler toggle */}
                <div className="flex justify-end">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground py-1"
                    onClick={() => {
                      if (mobileSelectMode) { setMobileSelectMode(false); setSelectedIds(new Set()) }
                      else setMobileSelectMode(true)
                    }}
                  >
                    {mobileSelectMode ? 'Annuler' : 'Sélectionner'}
                  </button>
                </div>

                {clients.map((client) => {
                  const { progress, current, target } = getProgress(client, tiers)
                  const statuses = statusOn ? getClientStatuses(client.id) : []
                  const isSelected = selectedIds.has(client.id)
                  return (
                    <div
                      key={client.id}
                      className={`bg-card border rounded-lg p-3 flex items-center gap-3 cursor-pointer active:bg-muted/30 transition-colors ${
                        isSelected ? 'border-indigo-400 bg-indigo-50/30' : 'border-border'
                      }`}
                      onClick={() => {
                        if (mobileSelectMode) toggleSelect(client.id)
                        else openDetail(client)
                      }}
                    >
                      {/* Checkbox en mode sélection */}
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
                        <div className="font-medium text-sm truncate">{clientFullName(client)}</div>
                        <div className="text-xs text-muted-foreground">{client.phone_number}</div>
                        {loyaltyOn && tiers.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            <div className="text-xs text-muted-foreground tabular-nums">{current}/{target} pts</div>
                            <Progress value={progress} className="h-1" />
                          </div>
                        )}
                        {statuses.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {statuses.map((s) => (
                              <Badge key={s} variant={STATUS_CONFIG[s].variant} className="text-[10px] px-1.5 py-0">
                                {t(STATUS_CONFIG[s].labelKey)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions — masquées en mode sélection */}
                      {!mobileSelectMode && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {loyaltyOn && (
                            <span className="text-sm font-semibold tabular-nums text-indigo-600">
                              {client.loyalty_points}<span className="text-xs font-normal text-muted-foreground ml-0.5">pts</span>
                            </span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => openEditInfo(client, e)}>
                                <Edit2 className="h-4 w-4 mr-2" />{t('clients.actions.editInfo')}
                              </DropdownMenuItem>
                              {loyaltyOn && (
                                <DropdownMenuItem onClick={(e) => openEditPoints(client, e)}>
                                  <Coins className="h-4 w-4 mr-2" />{t('clients.actions.editPoints')}
                                </DropdownMenuItem>
                              )}
                              {loyaltyOn && (
                                <DropdownMenuItem onClick={(e) => openUnlock(client, e)}>
                                  <Gift className="h-4 w-4 mr-2" />{t('clients.actions.unlockReward')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => window.open(`${BASE_URL}/u/${client.magic_token}`, '_blank')}>
                                <ExternalLink className="h-4 w-4 mr-2" />{t('clients.clientSheet')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => openDelete(client, e)}>
                                <Trash2 className="h-4 w-4 mr-2" />{t('clients.actions.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="pl-4 py-5 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      checked={clients.length > 0 && selectedIds.size === clients.length}
                      ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < clients.length }}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="pl-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('clients.columns.client')}</TableHead>
                  {showEmailCol    && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('clients.columns.email')}</TableHead>}
                  {showBirthdayCol && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">Anniversaire</TableHead>}
                  {statusOn        && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('clients.columns.status')}</TableHead>}
                  {loyaltyOn       && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('clients.columns.points')}</TableHead>}
                  {loyaltyOn       && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold min-w-[180px]">{t('clients.columns.tier')}</TableHead>}
                  {showLastActCol  && <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">Dernière activité</TableHead>}
                  <TableHead className="pr-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold text-right">{t('clients.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3 + (showEmailCol ? 1 : 0) + (showBirthdayCol ? 1 : 0) + (statusOn ? 1 : 0) + (loyaltyOn ? 2 : 0) + (showLastActCol ? 1 : 0)} className="text-center text-muted-foreground py-12">
                      {t('clients.noClients')}
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => {
                    const { progress, nextTier, current, target } = getProgress(client, tiers)
                    const statuses = getClientStatuses(client.id)
                    return (
                      <TableRow
                        key={client.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openDetail(client)}
                      >
                        <TableCell className="pl-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                            checked={selectedIds.has(client.id)}
                            onChange={() => toggleSelect(client.id)}
                          />
                        </TableCell>
                        <TableCell className="pl-6 py-4">
                          <div className="font-medium">{clientFullName(client)}</div>
                          {(client.first_name || client.last_name) && (
                            <div className="text-xs text-muted-foreground">{client.phone_number}</div>
                          )}
                        </TableCell>
                        {showEmailCol && (
                          <TableCell className="px-6 py-4 text-muted-foreground text-sm">
                            {client.email ?? '—'}
                          </TableCell>
                        )}
                        {showBirthdayCol && (
                          <TableCell className="px-6 py-4 text-muted-foreground text-sm">
                            {client.birthday
                              ? format(parseISO(client.birthday), 'd MMM', { locale: fr })
                              : '—'}
                          </TableCell>
                        )}
                        {statusOn && (
                          <TableCell className="px-6 py-4">
                            {statuses.length === 0 ? (
                              <span className="text-muted-foreground text-sm">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {statuses.map((s) => (
                                  <Badge key={s} variant={STATUS_CONFIG[s].variant}>
                                    {t(STATUS_CONFIG[s].labelKey)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        )}
                        {loyaltyOn && (
                          <TableCell className="px-6 py-4">
                            <span className="font-semibold tabular-nums">{client.loyalty_points}</span>
                            <span className="text-xs text-muted-foreground ml-1">pts</span>
                          </TableCell>
                        )}
                        {loyaltyOn && (
                          <TableCell className="px-6 py-4">
                            {tiers.length > 0 ? (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span className="tabular-nums">{current}/{target} pts</span>
                                  {nextTier && (
                                    <span className="truncate max-w-[110px] ml-2">{nextTier.reward_description}</span>
                                  )}
                                </div>
                                <Progress value={progress} className="h-1.5" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        )}
                        {showLastActCol && (
                          <TableCell className="px-6 py-4 text-muted-foreground text-sm">
                            {client.last_activity
                              ? format(parseISO(client.last_activity), 'd MMM yyyy', { locale: fr })
                              : '—'}
                          </TableCell>
                        )}
                        <TableCell className="pr-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => openEditInfo(client, e)}>
                                <Edit2 className="h-4 w-4 mr-2" />{t('clients.actions.editInfo')}
                              </DropdownMenuItem>
                              {loyaltyOn && (
                                <DropdownMenuItem onClick={(e) => openEditPoints(client, e)}>
                                  <Coins className="h-4 w-4 mr-2" />{t('clients.actions.editPoints')}
                                </DropdownMenuItem>
                              )}
                              {loyaltyOn && (
                                <DropdownMenuItem onClick={(e) => openUnlock(client, e)}>
                                  <Gift className="h-4 w-4 mr-2" />{t('clients.actions.unlockReward')}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(`${BASE_URL}/u/${client.magic_token}`, '_blank') }}>
                                <ExternalLink className="h-4 w-4 mr-2" />{t('clients.clientSheet')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => openDelete(client, e)}>
                                <Trash2 className="h-4 w-4 mr-2" />{t('clients.actions.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* ── Create Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.newClientTitle')}</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 mt-2">
            <ClientFormFields
              form={createForm}
              onChange={setCreateForm}
              showBirthday={config.detail_birthday}
              showNotes={config.detail_notes}
            />
            <Button type="submit" className="w-full" disabled={createSubmitting}>
              {createSubmitting ? t('common.adding') : t('clients.addClientBtn')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Info Dialog (table row) ───────────────────────────────────── */}
      <Dialog open={!!editInfo} onOpenChange={(o) => !o && setEditInfo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.actions.editInfoTitle')}</DialogTitle></DialogHeader>
          <form onSubmit={handleInfoSubmit} className="space-y-3 mt-2">
            <ClientFormFields form={infoForm} onChange={setInfoForm} />
            {infoForm.phone_number !== editInfo?.phone_number && (
              <p className="text-xs text-amber-600">
                {t('clients.magicLinkWarning')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={infoSubmitting}>
              {infoSubmitting ? t('clients.form.saving') : t('clients.form.save')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Points Dialog (table row) ────────────────────────────────── */}
      <Dialog open={!!editPoints} onOpenChange={(o) => !o && setEditPoints(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.actions.editPointsTitle')}</DialogTitle></DialogHeader>
          {editPoints && (
            <div className="space-y-4 mt-2">
              <div className="rounded-md bg-muted/40 px-4 py-3 text-sm space-y-0.5">
                <div className="font-medium">{clientFullName(editPoints)}</div>
                <div className="text-muted-foreground">
                  {editPoints.current_cycle_points} {t('clients.ptsCycle')} · {editPoints.loyalty_points} {t('clients.ptsTotal')}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('clients.editPoints.label')}</Label>
                <Input type="number" min="1" placeholder="5" value={pointsValue} onChange={(e) => setPointsValue(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={pointsSubmitting || !pointsValue} onClick={() => handlePoints(-1)}>
                  <Minus className="h-4 w-4 mr-2" />{t('clients.editPoints.remove')}
                </Button>
                <Button disabled={pointsSubmitting || !pointsValue} onClick={() => handlePoints(1)}>
                  <Plus className="h-4 w-4 mr-2" />{t('clients.editPoints.add')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Unlock Reward Dialog (table row) ──────────────────────────────── */}
      <Dialog open={!!unlockClient} onOpenChange={(o) => !o && setUnlockClient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.actions.unlockRewardTitle')}</DialogTitle></DialogHeader>
          {unlockClient && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                {t('clients.unlock.createCoupon', { name: clientFullName(unlockClient) })}
              </p>
              {tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('clients.noTiers')}</p>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>{t('clients.unlock.tierLabel')}</Label>
                    <Select value={unlockTierId} onValueChange={setUnlockTierId}>
                      <SelectTrigger><SelectValue placeholder={t('clients.unlock.chooseTier')} /></SelectTrigger>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.required_points} {t('common.pts')} — {tier.reward_description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" disabled={!unlockTierId || unlockSubmitting} onClick={handleUnlock}>
                    {unlockSubmitting ? t('clients.unlock.unlocking') : t('clients.unlock.unlockBtn')}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog (table row) ─────────────────────────────── */}
      <Dialog open={!!deleteClient} onOpenChange={(o) => !o && setDeleteClient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('clients.actions.deleteTitle')}</DialogTitle></DialogHeader>
          {deleteClient && (
            <div className="space-y-4 mt-2">
              <p className="text-sm">
                {t('clients.deleteConfirm.body', { name: clientFullName(deleteClient) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDeleteClient(null)}>{t('common.cancel')}</Button>
                <Button variant="destructive" disabled={deleteSubmitting} onClick={handleDelete}>
                  {deleteSubmitting ? t('common.deleting') : t('common.delete')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk floating action bar ──────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{selectedIds.size} sélectionné(s)</span>
          <div className="w-px h-4 bg-border" />
          {loyaltyOn && (
            <Button size="sm" variant="outline" onClick={() => setBulkAdjustOpen(true)}>
              <Coins className="h-3.5 w-3.5 mr-1.5" />Ajuster les points
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
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer {selectedIds.size} client(s) ?</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Cette action est irréversible. Toutes les données associées (commandes, RDV, points) seront également supprimées.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)}>Annuler</Button>
              <Button variant="destructive" disabled={bulkDeleting} onClick={handleBulkDelete}>
                {bulkDeleting ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk adjust points ─────────────────────────────────────────────── */}
      <Dialog open={bulkAdjustOpen} onOpenChange={(o) => { setBulkAdjustOpen(o); if (!o) setBulkPointsValue('') }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuster les points de {selectedIds.size} client(s)</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Nombre de points</Label>
              <Input type="number" min="1" placeholder="5" value={bulkPointsValue} onChange={(e) => setBulkPointsValue(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={bulkPointsSubmitting || !bulkPointsValue} onClick={() => handleBulkAdjustPoints(-1)}>
                <Minus className="h-4 w-4 mr-2" />Retirer
              </Button>
              <Button disabled={bulkPointsSubmitting || !bulkPointsValue} onClick={() => handleBulkAdjustPoints(1)}>
                <Plus className="h-4 w-4 mr-2" />Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!detailClient} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <DialogHeader className="flex-row items-center gap-2 pr-8 space-y-0">
            {detailView !== 'main' && (
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 shrink-0 -ml-1"
                onClick={() => setDetailView('main')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle className="flex-1 truncate">
              {detailView === 'main'
                ? (detailClient ? clientFullName(detailClient) : t('clients.clientSheet'))
                : t(VIEW_TITLE_KEYS[detailView as ViewTitleKey])}
            </DialogTitle>
            {detailView === 'main' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => goToDetailView('edit_info')}>
                    <Edit2 className="h-4 w-4 mr-2" />{t('clients.actions.editInfo')}
                  </DropdownMenuItem>
                  {loyaltyOn && (
                    <DropdownMenuItem onClick={() => goToDetailView('edit_points')}>
                      <Coins className="h-4 w-4 mr-2" />{t('clients.actions.editPoints')}
                    </DropdownMenuItem>
                  )}
                  {loyaltyOn && (
                    <DropdownMenuItem onClick={() => goToDetailView('unlock_reward')}>
                      <Gift className="h-4 w-4 mr-2" />{t('clients.actions.unlockReward')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => goToDetailView('delete_confirm')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />{t('clients.actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </DialogHeader>

          {detailLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
          ) : detailClient ? (
            <>
              {/* ── Main view ────────────────────────────────────────── */}
              {detailView === 'main' && detailData && (
                <div className="space-y-4 mt-1">
                  {/* Compact header info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />{detailClient.phone_number}
                    </span>
                    {config.detail_birthday && detailClient.birthday && (
                      <span className="flex items-center gap-1.5">
                        <Cake className="h-3.5 w-3.5" />
                        {format(parseISO(detailClient.birthday), 'd MMM', { locale: fr })}
                      </span>
                    )}
                    {loyaltyOn && (
                      <span className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5" />
                        <strong className="text-foreground">{detailClient.loyalty_points}</strong> pts
                        &nbsp;·&nbsp;{detailClient.total_cycles_completed} cycle{detailClient.total_cycles_completed !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Tabs */}
                  <Tabs defaultValue="infos">
                    <TabsList className="w-full flex justify-start border-b border-border bg-transparent h-auto p-0 rounded-none overflow-x-auto">
                      <TabsTrigger value="infos" className="rounded-none px-5 py-5 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">Infos</TabsTrigger>
                      <TabsTrigger value="historique" className="rounded-none px-5 py-5 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">{t('clients.historyTab')}</TabsTrigger>
                      {loyaltyOn && <TabsTrigger value="fidelite" className="rounded-none px-5 py-5 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">{t('clients.fidelityTab')}</TabsTrigger>}
                    </TabsList>

                    {/* ── Infos ── */}
                    <TabsContent value="infos" className="mt-3 space-y-3 text-sm">
                      {config.detail_email && (
                        detailClient.email ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4 shrink-0" />{detailClient.email}
                          </div>
                        ) : (
                          <button
                            onClick={() => goToDetailView('edit_info')}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Ajouter un email
                          </button>
                        )
                      )}
                      {config.detail_birthday && !detailClient.birthday && (
                        <button
                          onClick={() => goToDetailView('edit_info')}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Ajouter un anniversaire
                        </button>
                      )}
                      {loyaltyOn && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Star className="h-4 w-4 shrink-0" />
                          <strong className="text-foreground">{detailClient.loyalty_points}</strong>&nbsp;pts
                          &nbsp;·&nbsp;{detailClient.total_cycles_completed} cycle{detailClient.total_cycles_completed !== 1 ? 's' : ''}
                        </div>
                      )}
                      {config.detail_last_activity && detailClient.last_activity && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Activity className="h-4 w-4 shrink-0" />
                          {format(parseISO(detailClient.last_activity), 'd MMM yyyy', { locale: fr })}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {t('clients.memberSince', { date: format(parseISO(detailClient.created_at), 'd MMM yyyy', { locale: fr }) })}
                      </div>
                      {config.detail_notes && (
                        detailClient.notes ? (
                          <div className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground whitespace-pre-wrap">
                            <FileText className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                            {detailClient.notes}
                          </div>
                        ) : (
                          <button
                            onClick={() => goToDetailView('edit_info')}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Ajouter une note
                          </button>
                        )
                      )}
                    </TabsContent>

                    {/* ── Historique ── */}
                    <TabsContent value="historique" className="mt-3 max-h-96 overflow-y-auto">
                      {detailData.pointsLog.length === 0 && detailData.appointments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">{t('clients.noActivity')}</p>
                      ) : (
                        <div className="space-y-0">
                          {(detailData.pointsLog as PointsLog[]).map((log) => (
                            <div key={log.id} className="flex items-center justify-between text-sm py-2 border-b last:border-b-0">
                              <div>
                                <span className="font-medium">{t(SOURCE_LABEL_KEYS[log.source_type] ?? log.source_type)}</span>
                                <div className="text-xs text-muted-foreground">
                                  {format(parseISO(log.created_at), 'd MMM yyyy à HH:mm', { locale: fr })}
                                </div>
                              </div>
                              <span className={`font-semibold tabular-nums text-sm ${log.points_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {log.points_delta > 0 ? '+' : ''}{log.points_delta} pts
                              </span>
                            </div>
                          ))}
                          {(detailData.appointments as Appointment[])
                            .filter((a) => !detailData.pointsLog.some((l) => l.source_id === a.id))
                            .map((appt) => (
                              <div key={appt.id} className="flex items-center justify-between text-sm py-2 border-b last:border-b-0">
                                <div>
                                  <span className="font-medium">{t(APPT_LABEL_KEYS[appt.status] ?? appt.status)}</span>
                                  {appt.notes && <span className="text-muted-foreground ml-1.5 text-xs">· {appt.notes}</span>}
                                  <div className="text-xs text-muted-foreground">
                                    {format(parseISO(appt.scheduled_at), 'd MMM yyyy à HH:mm', { locale: fr })}
                                  </div>
                                </div>
                                <span className="text-xs text-muted-foreground">—</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </TabsContent>

                    {/* ── Fidélité ── */}
                    {loyaltyOn && (
                      <TabsContent value="fidelite" className="mt-3 space-y-5">
                        {detailData.tiers.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">{t('clients.noProgram')}</p>
                        ) : (() => {
                          const { progress, nextTier, current, target } = getProgress(detailClient, detailData.tiers)
                          return (
                            <>
                              {/* Progress */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="tabular-nums font-medium">{current} / {target} pts</span>
                                  {nextTier ? (
                                    <span className="text-muted-foreground text-xs">→ {nextTier.reward_description}</span>
                                  ) : (
                                    <span className="text-green-600 font-medium text-xs">{t('clients.maxTier')}</span>
                                  )}
                                </div>
                                <Progress value={progress} className="h-2" />
                              </div>

                              {/* Paliers */}
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paliers</p>
                                {detailData.tiers.map((tier) => {
                                  const reached = detailClient.loyalty_points >= tier.required_points
                                  return (
                                    <div key={tier.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${reached ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30' : 'border-border bg-muted/30'}`}>
                                      <span className={`font-medium ${reached ? 'text-green-900 dark:text-green-300' : 'text-muted-foreground'}`}>{tier.reward_description}</span>
                                      <span className="text-xs text-muted-foreground">{tier.required_points} pts</span>
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Récompenses */}
                              {detailData.coupons.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Récompenses</p>
                                  {(detailData.coupons as Coupon[]).map((coupon) => {
                                    const isActive  = coupon.status === 'active'
                                    const isUsed    = coupon.status === 'used'
                                    const statusLabel = isActive ? 'Actif' : isUsed ? 'Utilisé' : 'Expiré'
                                    return (
                                      <div key={coupon.id} className={`rounded-md border px-3 py-2 text-sm ${isActive ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30' : 'border-border bg-muted/30'}`}>
                                        <div className="flex items-center justify-between">
                                          <span className={`font-medium ${isActive ? 'text-green-900 dark:text-green-300' : 'text-muted-foreground'}`}>
                                            {coupon.tier?.reward_description ?? '—'}
                                          </span>
                                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                                            {statusLabel}
                                          </span>
                                        </div>
                                        <div className="flex gap-4 mt-0.5 text-xs text-muted-foreground">
                                          <span>Débloqué le {format(parseISO(coupon.created_at), 'd MMM yyyy', { locale: fr })}</span>
                                          {!isUsed && (
                                            <span>{isActive ? 'Expire le' : 'Expiré le'} {format(parseISO(coupon.expires_at), 'd MMM yyyy', { locale: fr })}</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </TabsContent>
                    )}
                  </Tabs>
                </div>
              )}

              {/* ── Edit info inline ──────────────────────────────────── */}
              {detailView === 'edit_info' && (
                <form onSubmit={handleDvInfoSubmit} className="space-y-3 mt-2">
                  <ClientFormFields form={dvInfoForm} onChange={setDvInfoForm} />
                  {dvInfoForm.phone_number !== detailClient?.phone_number && (
                    <p className="text-xs text-amber-600">
                      {t('clients.magicLinkWarning')}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={dvSubmitting}>
                    {dvSubmitting ? t('clients.form.saving') : t('clients.form.save')}
                  </Button>
                </form>
              )}

              {/* ── Edit points inline ────────────────────────────────── */}
              {detailView === 'edit_points' && (
                <div className="space-y-4 mt-2">
                  <div className="rounded-md bg-muted/40 px-4 py-3 text-sm space-y-0.5">
                    <div className="font-medium">{clientFullName(detailClient)}</div>
                    <div className="text-muted-foreground">
                      {detailClient.current_cycle_points} {t('clients.ptsCycle')} · {detailClient.loyalty_points} {t('clients.ptsTotal')}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clients.editPoints.label')}</Label>
                    <Input
                      type="number" min="1" placeholder="5"
                      value={dvPointsValue}
                      onChange={(e) => setDvPointsValue(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" disabled={dvSubmitting || !dvPointsValue} onClick={() => handleDvPoints(-1)}>
                      <Minus className="h-4 w-4 mr-2" />{t('clients.editPoints.remove')}
                    </Button>
                    <Button disabled={dvSubmitting || !dvPointsValue} onClick={() => handleDvPoints(1)}>
                      <Plus className="h-4 w-4 mr-2" />{t('clients.editPoints.add')}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Unlock reward inline ──────────────────────────────── */}
              {detailView === 'unlock_reward' && (
                <div className="space-y-4 mt-2">
                  <p className="text-sm text-muted-foreground">
                    {t('clients.unlock.createCoupon', { name: clientFullName(detailClient) })}
                  </p>
                  {(detailData?.tiers ?? tiers).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('clients.noTiers')}</p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label>{t('clients.unlock.tierLabel')}</Label>
                        <Select value={dvUnlockTierId} onValueChange={setDvUnlockTierId}>
                          <SelectTrigger><SelectValue placeholder={t('clients.unlock.chooseTier')} /></SelectTrigger>
                          <SelectContent>
                            {(detailData?.tiers ?? tiers).map((tier) => (
                              <SelectItem key={tier.id} value={tier.id}>
                                {tier.required_points} {t('common.pts')} — {tier.reward_description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" disabled={!dvUnlockTierId || dvSubmitting} onClick={handleDvUnlock}>
                        {dvSubmitting ? t('clients.unlock.unlocking') : t('clients.unlock.unlockBtn')}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* ── Delete confirm inline ─────────────────────────────── */}
              {detailView === 'delete_confirm' && (
                <div className="space-y-4 mt-2">
                  <p className="text-sm">
                    {t('clients.deleteConfirm.body', { name: clientFullName(detailClient) })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setDetailView('main')}>{t('common.cancel')}</Button>
                    <Button variant="destructive" disabled={dvSubmitting} onClick={handleDvDelete}>
                      {dvSubmitting ? t('common.deleting') : t('common.delete')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Shared form fields component ─────────────────────────────────────────────

function ClientFormFields({
  form,
  onChange,
  showBirthday = true,
  showNotes = true,
}: {
  form: InfoForm
  onChange: (f: InfoForm) => void
  showBirthday?: boolean
  showNotes?: boolean
}) {
  const { t } = useI18n()

  const bdMonth = form.birthday ? parseInt(form.birthday.substring(5, 7), 10) : 0
  const bdDay   = form.birthday ? parseInt(form.birthday.substring(8, 10), 10) : 0
  const maxDays = bdMonth ? new Date(2000, bdMonth, 0).getDate() : 31

  function setBirthday(month: number, day: number) {
    if (!month || !day) onChange({ ...form, birthday: '' })
    else onChange({ ...form, birthday: `2000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` })
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label>{t('clients.form.civility')}</Label>
          <Select value={form.civility} onValueChange={(v) => onChange({ ...form, civility: v === 'none' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="Mr">Mr</SelectItem>
              <SelectItem value="Mme">Mme</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('clients.form.firstName')}</Label>
          <Input value={form.first_name} onChange={(e) => onChange({ ...form, first_name: e.target.value })} placeholder="Youssef" />
        </div>
        <div className="space-y-1">
          <Label>{t('clients.form.lastName')}</Label>
          <Input value={form.last_name} onChange={(e) => onChange({ ...form, last_name: e.target.value })} placeholder="Benali" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t('clients.form.phone')} <span className="text-destructive">*</span></Label>
        <PhoneInput
          required
          value={form.phone_number}
          onChange={(v) => onChange({ ...form, phone_number: v })}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('clients.form.email')}</Label>
        <Input
          type="email" placeholder="client@email.com"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
      </div>
      {showBirthday && (
        <div className="space-y-1">
          <Label>Anniversaire</Label>
          <div className="flex gap-2">
            <Select
              value={bdMonth ? String(bdMonth) : ''}
              onValueChange={(v) => {
                const m = parseInt(v, 10)
                const maxD = new Date(2000, m, 0).getDate()
                setBirthday(m, Math.min(bdDay || 1, maxD))
              }}
            >
              <SelectTrigger className="flex-1"><SelectValue placeholder="Mois" /></SelectTrigger>
              <SelectContent>
                {MONTHS_FR.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={bdDay ? String(bdDay) : ''}
              disabled={!bdMonth}
              onValueChange={(v) => setBirthday(bdMonth, parseInt(v, 10))}
            >
              <SelectTrigger className="w-20"><SelectValue placeholder="Jour" /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.birthday && (
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onChange({ ...form, birthday: '' })}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      {showNotes && (
        <div className="space-y-1">
          <Label>Notes</Label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={3}
            placeholder="Notes sur ce client…"
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
          />
        </div>
      )}
    </>
  )
}
