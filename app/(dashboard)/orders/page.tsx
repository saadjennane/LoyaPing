'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, CheckCircle, Package, ArrowLeft,
  AlertTriangle, MessageSquare, Trash2, BellOff, Undo2, AlertCircle, Search, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Order, Client, OrderMessage, CustomerIndexItem } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import CustomerAutocomplete from '@/components/CustomerAutocomplete'
import PhoneInput from '@/components/PhoneInput'
import { useCustomerIndex } from '@/lib/hooks/useCustomerIndex'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'

type Step = 'search' | 'new_client' | 'order'

// ─── helpers ────────────────────────────────────────────────────────────────

function clientFullName(c: Client | undefined): string {
  if (!c) return ''
  const name = [c.civility, c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.phone_number
}

function TimelineItem({ done, label, date }: { done: boolean; label: string; date: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 ${
        done ? 'bg-green-500 border-green-500' : 'bg-white border-border'
      }`} />
      <div>
        <div className={`text-sm ${done ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</div>
        {date && (
          <div className="text-xs text-muted-foreground">
            {format(new Date(date), 'dd MMM yyyy, HH:mm', { locale: fr })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── countdown toast ─────────────────────────────────────────────────────────

function CountdownToast({
  toastId,
  message,
  icon: Icon,
  onUndo,
  undoLabel,
}: {
  toastId: string | number
  message: string
  icon: React.ElementType
  onUndo: () => void
  undoLabel: string
}) {
  const DURATION = 10
  const [remaining, setRemaining] = useState(DURATION)

  useEffect(() => {
    const id = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bg-popover border border-border rounded-xl shadow-md px-4 py-3 flex flex-col gap-2.5 min-w-[300px]">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm text-foreground">{message}</span>
        <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">{remaining}s</span>
        <button
          onClick={() => { toast.dismiss(toastId); onUndo() }}
          className="text-xs font-semibold text-primary hover:underline shrink-0 ml-1"
        >
          {undoLabel}
        </button>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full"
          style={{
            width: `${(remaining / DURATION) * 100}%`,
            transition: remaining < DURATION ? 'width 1s linear' : 'none',
          }}
        />
      </div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { t } = useI18n()
  const { status } = useConfigStatus()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [showFailedOnly, setShowFailedOnly] = useState(false)
  const [listSearch, setListSearch] = useState('')

  // New order dialog
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('search')
  const [selectedItem, setSelectedItem] = useState<CustomerIndexItem | null>(null)
  const [newClientForm, setNewClientForm] = useState({ civility: '', first_name: '', last_name: '', phone_number: '' })
  const [orderForm, setOrderForm] = useState({ reference: '', amount: '', completed_immediately: false })
  const [submitting, setSubmitting] = useState(false)

  const { addOrUpdate } = useCustomerIndex()

  // Detail dialog
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Delete order
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Bulk selection
  const [mobileSelectMode, setMobileSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)

  // Correction modal (shown after READY → PENDING downgrade when message was already sent)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionOrderId, setCorrectionOrderId] = useState<string | null>(null)
  const [correctionSending, setCorrectionSending] = useState(false)

  // ── data fetching ──────────────────────────────────────────────────────────

  const fetchOrders = async () => {
    const res = await fetch('/api/orders')
    const json = await res.json()
    setOrders(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  // Auto-open detail or apply filter from URL params (e.g. from dashboard click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id     = params.get('id')
    const filter = params.get('filter')

    if (id && orders.length > 0) {
      const found = orders.find(o => o.id === id)
      if (found) {
        setSelectedOrder(found)
        setDetailOpen(true)
        window.history.replaceState(null, '', '/orders')
      }
    } else if (filter) {
      const validTabs = ['pending', 'ready', 'non_retrieved', 'completed']
      if (validTabs.includes(filter)) {
        setActiveTab(filter)
        window.history.replaceState(null, '', '/orders')
      }
    }
  }, [orders])

  useEffect(() => {
    if (!open) {
      setStep('search')
      setSelectedItem(null)
      setNewClientForm({ civility: '', first_name: '', last_name: '', phone_number: '' })
      setOrderForm({ reference: '', amount: '', completed_immediately: false })
      setSubmitting(false)
    }
  }, [open])

  // Reset filter when leaving "Prêtes" tab
  useEffect(() => {
    if (activeTab !== 'ready') setShowFailedOnly(false)
  }, [activeTab])

  // Clear selection on tab change
  useEffect(() => { setSelectedIds(new Set()) }, [activeTab])

  // ── derived ────────────────────────────────────────────────────────────────

  const pendingOrders      = orders.filter(o => o.status === 'pending')
  const readyOrders        = orders.filter(o => o.status === 'ready')
  const completedOrders    = orders.filter(o => o.status === 'completed')
  const nonRetrievedOrders = readyOrders.filter(o => (o.reminders_count ?? 0) >= 3)

  const failedOrders = readyOrders.filter(o =>
    o.messages?.some(m => m.status === 'failed')
  )

  const filterBySearch = (list: Order[]) => {
    if (!listSearch.trim()) return list
    const q = listSearch.toLowerCase()
    return list.filter(o => {
      const c = o.client as Client | undefined
      const name = clientFullName(c).toLowerCase()
      const phone = c?.phone_number ?? ''
      const ref = o.reference ?? ''
      return name.includes(q) || phone.includes(q) || ref.toLowerCase().includes(q)
    })
  }
  const filteredPending      = filterBySearch(pendingOrders)
  const filteredReady        = filterBySearch(readyOrders)
  const filteredCompleted    = filterBySearch(completedOrders)
  const filteredNonRetrieved = filterBySearch(nonRetrievedOrders)

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleSelectItem = (id: string, item: CustomerIndexItem) => {
    void id
    setSelectedItem(item)
    setStep('order')
  }

  const handleGoToNewClient = (phone?: string) => {
    setNewClientForm({ civility: '', first_name: '', last_name: '', phone_number: phone ?? '' })
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
    const created: Client = json.data
    // Update the customer index with the new client
    const phoneDigits = created.phone_number.replace(/\D/g, '')
    const indexItem: CustomerIndexItem = {
      id:               created.id,
      display_name:     [created.first_name, created.last_name].filter(Boolean).join(' ') || created.phone_number,
      phone:            created.phone_number,
      phone_digits:     phoneDigits,
      phone_last4:      phoneDigits.slice(-4),
      last_activity_at: created.created_at,
    }
    addOrUpdate(indexItem)
    setSelectedItem(indexItem)
    setStep('order')
    setSubmitting(false)
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem) return
    setSubmitting(true)
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedItem.id,
        reference: orderForm.reference,
        amount: parseFloat(orderForm.amount) || 0,
        completed_immediately: orderForm.completed_immediately,
      }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(orderForm.completed_immediately ? t('orders.createdAndPickedToast') : t('orders.createdToast'))
      setOpen(false)
      fetchOrders()
    }
    setSubmitting(false)
  }

  // ── Mark order as READY — outbox hybrid 10s flow ──────────────────────────
  // 1. PATCH /api/orders/:id/ready → marks ready + creates outbox row (60s cron fallback)
  // 2. Show 10s countdown toast with Annuler
  // 3. If user cancels → cancel outbox row + revert order to pending
  // 4. After 10s → send-now dispatches immediately (before cron fires at +60s)
  const markReady = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()

    if (status !== null && !status.orders_configured) {
      toast.error('Envoi WhatsApp désactivé', {
        description: 'Configurez le message "Commande prête" pour envoyer des notifications.',
        action: { label: 'Configurer', onClick: () => { window.location.href = '/settings/orders' } },
      })
      return
    }

    // Optimistic: move to READY immediately so the UI feels instant
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'ready' as const, ready_at: new Date().toISOString() } : o
    ))
    setDetailOpen(false)

    const res = await fetch(`/api/orders/${id}/ready`, { method: 'PATCH' })
    const json = await res.json()

    if (json.error) {
      toast.error(json.error)
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, status: 'pending' as const, ready_at: null } : o
      ))
      return
    }

    const { scheduledMessageId } = json.data ?? {}
    if (!scheduledMessageId) {
      // Should not happen — cron fallback will send at +60s anyway
      toast.success(t('orders.readyToast'))
      return
    }

    const handle = { timer: undefined as ReturnType<typeof setTimeout> | undefined }

    // Undo: cancel the outbox message + revert order to pending.
    // If cancel returns 409, the message was already claimed/sent — do NOT
    // revert and offer a correction message instead.
    const doCancel = async () => {
      clearTimeout(handle.timer)
      const cancelRes = await fetch(`/api/scheduled-messages/${scheduledMessageId}/cancel`, { method: 'POST' })
      const cancelJson = await cancelRes.json()

      if (!cancelJson.cancelled) {
        // Too late — notification already dispatched or being dispatched.
        toast.error('Trop tard : notification déjà envoyée ou en cours d\'envoi.', { duration: 5_000 })
        setCorrectionOrderId(id)
        setCorrectionOpen(true)
        return
      }

      // Successfully cancelled — revert order to pending.
      const r2 = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      })
      const j2 = await r2.json()
      if (j2.error) { toast.error(`Annulation impossible : ${j2.error}`); return }
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, status: 'pending' as const, ready_at: null } : o
      ))
      toast.success(t('orders.cancelledToast'))
    }

    toast.custom(
      (toastId) => (
        <CountdownToast
          toastId={toastId}
          message={t('orders.readyToast')}
          icon={CheckCircle}
          onUndo={doCancel}
          undoLabel={t('orders.undoLabel')}
        />
      ),
      { duration: 10_000 },
    )

    // After 10s: call send-now for immediate dispatch.
    // 409 = already sent by cron or cancelled by user — both fine.
    handle.timer = setTimeout(async () => {
      try {
        await fetch(`/api/scheduled-messages/${scheduledMessageId}/send-now`, { method: 'POST' })
      } catch {
        // Cron fallback at +60s will handle any network failure here
      }
      fetchOrders()
    }, 10_000)
  }

  // ── Downgrade READY → PENDING; proposes correction message if already sent ─
  const markPending = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()

    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error); return }

    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'pending' as const, ready_at: null } : o
    ))
    setDetailOpen(false)

    if (json.data?.readyMessageSent) {
      setCorrectionOrderId(id)
      setCorrectionOpen(true)
    } else {
      toast.success(t('orders.backToQueueToast'))
    }
  }

  // ── Send correction / excuse message ────────────────────────────────────────
  const handleSendCorrection = async () => {
    if (!correctionOrderId) return
    setCorrectionSending(true)
    const res = await fetch(`/api/orders/${correctionOrderId}/ready-correction`, { method: 'POST' })
    const json = await res.json()
    if (json.error) toast.error(`Erreur : ${json.error}`)
    else toast.success("Message d\u2019excuse envoy\u00e9.")
    setCorrectionSending(false)
    setCorrectionOpen(false)
    setCorrectionOrderId(null)
  }

  const markPickedUp = (id: string, ref: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const refStr = ref ? ` #${ref}` : ''

    // Optimistic update — show as completed immediately
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: 'completed' as const, completed_at: new Date().toISOString() } : o
    ))
    setDetailOpen(false)

    // 10-second undo window — API is called only after the delay
    const handle = { timer: undefined as ReturnType<typeof setTimeout> | undefined }

    const onUndo = () => {
      clearTimeout(handle.timer)
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, status: 'ready' as const, completed_at: null, picked_up_at: null } : o
      ))
      toast.success(t('orders.cancelledToast'))
    }

    toast.custom(
      (toastId) => (
        <CountdownToast
          toastId={toastId}
          message={`Commande${refStr} marquée récupérée`}
          icon={Package}
          onUndo={onUndo}
          undoLabel={t('orders.undoLabel')}
        />
      ),
      { duration: 10_000 },
    )

    handle.timer = setTimeout(async () => {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'picked_up' }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
        setOrders(prev => prev.map(o =>
          o.id === id ? { ...o, status: 'ready' as const, completed_at: null, picked_up_at: null } : o
        ))
        return
      }
      const pts = json.data?.pointsCredited
      const ptsStr = pts ? ` — ${pts} pts crédités` : ''
      toast.success(`Commande${refStr} confirmée${ptsStr}`)
      fetchOrders()
    }, 10_000)
  }

  const revertCompleted = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready_revert' }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      const pts = json.data?.pointsReverted ?? 0
      toast.success(pts > 0
        ? `Commande remise à « Prête ». ${pts} point${pts > 1 ? 's' : ''} déduit${pts > 1 ? 's' : ''}.`
        : 'Commande remise à « Prête ».'
      )
      setDetailOpen(false)
      fetchOrders()
    }
  }

  const handleDeleteOrder = async () => {
    if (!deleteOrder) return
    setDeleteSubmitting(true)
    const res = await fetch(`/api/orders/${deleteOrder.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else { toast.success(t('orders.deletedToast')); setDeleteOrder(null); setDetailOpen(false); fetchOrders() }
    setDeleteSubmitting(false)
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

  const handleBulkStatusUpdate = async (status: 'ready' | 'completed') => {
    setBulkStatusUpdating(true)
    const res = await fetch('/api/orders/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), status }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} commande(s) mise(s) à jour`)
      setSelectedIds(new Set())
      fetchOrders()
    }
    setBulkStatusUpdating(false)
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/orders/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} commande(s) supprimée(s)`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      fetchOrders()
    }
    setBulkDeleting(false)
  }

  // ── render helpers ─────────────────────────────────────────────────────────

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':   return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50">{t('orders.status.pending')}</Badge>
      case 'ready':     return <Badge className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-50">{t('orders.status.ready')}</Badge>
      case 'completed': return <Badge className="bg-[#EEF2FF] text-[#3B5BDB] border border-blue-200 hover:bg-[#EEF2FF]">{t('orders.status.completed')}</Badge>
      default:          return <Badge variant="outline">{status}</Badge>
    }
  }

  const msgBadge = (messages?: OrderMessage[]) => {
    if (!messages || messages.length === 0) return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-600 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />{t('orders.message.pending')}
      </span>
    )
    const last = messages[messages.length - 1]
    return last.status === 'sent' ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-700 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{t('orders.message.sent')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />{t('orders.message.failed')}
      </span>
    )
  }

  const tabCount = (n: number, isActive?: boolean, red?: boolean) => (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 text-[10px] rounded-full font-semibold ${
      red ? 'bg-red-100 text-red-700'
      : isActive ? 'bg-[#EEF2FF] text-[#3B5BDB]'
      : 'bg-muted text-muted-foreground'
    }`}>
      {n}
    </span>
  )

  const renderTable = (orderList: Order[], opts?: { withFilter?: boolean }) => {
    const displayList = opts?.withFilter && showFailedOnly
      ? orderList.filter(o => o.messages?.some(m => m.status === 'failed'))
      : orderList

    if (orderList.length === 0) {
      return (
        <div className="py-12 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {t('orders.noOrders')}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {/* Filter bar — only for "Prêtes" tab */}
        {opts?.withFilter && (
          <div className="flex items-center justify-end md:px-4 md:pt-3">
            <button
              onClick={() => setShowFailedOnly(!showFailedOnly)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                showFailedOnly
                  ? 'bg-red-50 border-red-200 text-red-700 font-medium'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('orders.failedFilter')}
              {failedOrders.length > 0 && (
                <span className={`rounded-full px-1.5 font-medium ${
                  showFailedOnly ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {failedOrders.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {displayList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('common.noResults')}</p>
          ) : displayList.map(order => {
            const client = order.client as Client | undefined
            const isNonRetrieved = (order.reminders_count ?? 0) >= 3 && order.status === 'ready'
            const isSelected = selectedIds.has(order.id)
            return (
              <div
                key={order.id}
                className={`bg-card border rounded-xl p-3 flex items-center gap-3 cursor-pointer active:bg-muted/50 shadow-sm transition-colors ${
                  isSelected ? 'border-indigo-400 bg-indigo-50/30' : 'border-border'
                }`}
                onClick={() => {
                  if (mobileSelectMode) toggleSelect(order.id)
                  else { setSelectedOrder(order); setDetailOpen(true) }
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{order.reference ? `#${order.reference}` : '—'}</span>
                    {statusBadge(order.status)}
                    {isNonRetrieved && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700">
                        <BellOff className="h-3 w-3" />{t('orders.reminders3')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{client ? clientFullName(client) : '—'}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'dd MMM, HH:mm', { locale: fr })}</div>
                </div>
                {!mobileSelectMode && (
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {order.status === 'pending' && (
                      <Button size="sm" className="h-8 text-xs bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white gap-1" onClick={e => markReady(order.id, e)}>
                        <CheckCircle className="h-3.5 w-3.5" />{t('orders.readyBtn')}
                      </Button>
                    )}
                    {order.status === 'ready' && (
                      <Button size="sm" className="h-8 text-xs" onClick={e => markPickedUp(order.id, order.reference ?? '', e)}>
                        <Package className="h-3.5 w-3.5 mr-1" />{t('orders.pickedUpBtn')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="pl-4 py-5 w-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    checked={displayList.length > 0 && displayList.every(o => selectedIds.has(o.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = displayList.some(o => selectedIds.has(o.id)) && !displayList.every(o => selectedIds.has(o.id))
                    }}
                    onChange={() => {
                      const allSelected = displayList.every(o => selectedIds.has(o.id))
                      if (allSelected) {
                        setSelectedIds(prev => { const next = new Set(prev); displayList.forEach(o => next.delete(o.id)); return next })
                      } else {
                        setSelectedIds(prev => { const next = new Set(prev); displayList.forEach(o => next.add(o.id)); return next })
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="pl-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('orders.columns.reference')}</TableHead>
                <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('orders.columns.client')}</TableHead>
                <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('orders.columns.amount')}</TableHead>
                <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold">{t('orders.columns.date')}</TableHead>
                <TableHead className="px-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold w-28">{t('orders.columns.whatsapp')}</TableHead>
                <TableHead className="pr-6 py-5 text-xs uppercase tracking-wider text-muted-foreground font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : (
                displayList.map(order => {
                  const client = order.client as Client | undefined
                  const isNonRetrieved = (order.reminders_count ?? 0) >= 3 && order.status === 'ready'
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => { setSelectedOrder(order); setDetailOpen(true) }}
                    >
                      <TableCell className="pl-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                        />
                      </TableCell>
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-2">
                          {order.reference ? <span className="font-bold text-foreground">{`#${order.reference}`}</span> : <span className="text-muted-foreground text-xs">—</span>}
                          {isNonRetrieved && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-700 font-medium">
                              <BellOff className="h-3 w-3" />{t('orders.reminders3')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="font-semibold text-sm text-foreground">{client ? clientFullName(client) : '—'}</div>
                        {client && (
                          <div className="text-xs text-muted-foreground">{client.phone_number}</div>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {order.amount > 0 ? <span className="font-semibold text-foreground">{order.amount} MAD</span> : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="text-sm text-foreground">{format(new Date(order.created_at), 'dd MMM yyyy', { locale: fr })}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'HH:mm', { locale: fr })}</div>
                      </TableCell>
                      <TableCell className="px-6 py-4">{msgBadge(order.messages)}</TableCell>
                      <TableCell className="pr-6 py-4 text-right">
                        <div className="flex gap-2 justify-end items-center" onClick={e => e.stopPropagation()}>
                          {order.status === 'pending' && (
                            <Button size="sm" className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white gap-1.5" onClick={e => markReady(order.id, e)}>
                              <CheckCircle className="h-3.5 w-3.5" />{t('orders.readyBtn')}
                            </Button>
                          )}
                          {order.status === 'ready' && (
                            <>
                              <Button
                                size="icon" variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                                title={t('orders.markPending')}
                                onClick={e => markPending(order.id, e)}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" onClick={e => markPickedUp(order.id, order.reference ?? '', e)}>
                                <Package className="h-3.5 w-3.5 mr-1" />{t('orders.pickedUpBtn')}
                              </Button>
                            </>
                          )}
                          {order.status === 'completed' && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                              title="Remettre à prête"
                              onClick={e => revertCompleted(order.id, e)}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title={t('common.delete')}
                            onClick={e => { e.stopPropagation(); setDeleteOrder(order) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">

      {/* WhatsApp config banner */}
      {status !== null && !status.orders_configured && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            Le module Commandes est activé, mais l&apos;envoi WhatsApp n&apos;est pas configuré. Vous pouvez gérer les commandes, mais aucun message ne sera envoyé.{' '}
            <a href="/settings/orders" className="font-medium underline">Configurer maintenant</a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">{t('orders.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingOrders.length > 0
              ? <><span className="font-semibold text-foreground">{pendingOrders.length}</span> en cours</>
              : 'Aucune commande en cours'
            }
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm"><Plus className="h-4 w-4 mr-2" />{t('orders.newBtn')}</Button>
          </DialogTrigger>
          <DialogContent
            aria-describedby={undefined}
            className="max-h-[85dvh] overflow-y-auto"
            onInteractOutside={(e) => {
              if (document.querySelector('[data-autocomplete-portal]')) e.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle>{step === 'new_client' ? 'Nouveau client' : t('orders.newBtn')}</DialogTitle>
            </DialogHeader>

            {/* Step 1 — Search (instant, local index) */}
            {step === 'search' && (
              <div className="mt-2 space-y-3">
                <CustomerAutocomplete
                  autoFocus
                  onSelect={handleSelectItem}
                  onCreateNew={handleGoToNewClient}
                  placeholder={t('orders.form.searchPlaceholder')}
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => handleGoToNewClient()}>
                  <Plus className="h-4 w-4 mr-2" />Nouveau client
                </Button>
              </div>
            )}

            {/* Step 2 — New client */}
            {step === 'new_client' && (
              <div className="space-y-4 mt-2">
                <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground"
                  onClick={() => setStep('search')}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />{t('common.back')}
                </Button>
                <form onSubmit={handleCreateClient} className="space-y-4">
                  <div className="flex flex-none gap-2">
                    <Select value={newClientForm.civility}
                      onValueChange={v => setNewClientForm({ ...newClientForm, civility: v === '_' ? '' : v })}>
                      <SelectTrigger className="w-20 shrink-0"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">—</SelectItem>
                        <SelectItem value="Mr">Mr</SelectItem>
                        <SelectItem value="Mme">Mme</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input autoFocus placeholder={t('common.firstName')} value={newClientForm.first_name} required
                      onChange={e => setNewClientForm({ ...newClientForm, first_name: e.target.value })} />
                    <Input placeholder={t('common.lastName')} value={newClientForm.last_name} required
                      onChange={e => setNewClientForm({ ...newClientForm, last_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('common.phone')}</Label>
                    <PhoneInput
                      required
                      value={newClientForm.phone_number}
                      onChange={v => setNewClientForm({ ...newClientForm, phone_number: v })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('common.creating') : t('common.continue')}
                  </Button>
                </form>
              </div>
            )}

            {/* Step 3 — Order details */}
            {step === 'order' && selectedItem && (
              <div className="space-y-4 mt-2">
                <div className="px-3 py-2.5 bg-muted/30 rounded-lg">
                  <div className="text-sm font-medium">{selectedItem.display_name}</div>
                  {selectedItem.display_name !== selectedItem.phone && (
                    <div className="text-xs text-muted-foreground">{selectedItem.phone}</div>
                  )}
                </div>
                <form onSubmit={handleCreateOrder} className="space-y-4">
                  <div className="space-y-1">
                    <Label>
                      {t('orders.form.referenceLabel')}{' '}
                      <span className="ml-1 text-xs text-muted-foreground font-normal">{t('orders.form.referenceHint')}</span>
                    </Label>
                    <Input autoFocus placeholder="CMD-001" value={orderForm.reference}
                      onChange={e => setOrderForm({ ...orderForm, reference: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('orders.form.amountLabel')} <span className="ml-1 text-xs text-muted-foreground font-normal">{t('common.optional')}</span></Label>
                    <Input type="number" placeholder="0" value={orderForm.amount}
                      onChange={e => setOrderForm({ ...orderForm, amount: e.target.value })} />
                  </div>
                  {/* Immediately completed toggle */}
                  <label className="flex items-start gap-2.5 cursor-pointer py-2 px-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border cursor-pointer accent-primary shrink-0"
                      checked={orderForm.completed_immediately}
                      onChange={e => setOrderForm({ ...orderForm, completed_immediately: e.target.checked })}
                    />
                    <div>
                      <div className="text-sm font-medium">{t('orders.form.immediateLabel')}</div>
                      <div className="text-xs text-muted-foreground">{t('orders.form.immediateHint')}</div>
                    </div>
                  </label>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('orders.form.creating') : t('orders.form.createBtn')}
                  </Button>
                </form>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Warning banner — failed notifications */}
      {failedOrders.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {failedOrders.length === 1
              ? t('orders.failedBanner.singular')
              : t('orders.failedBanner.plural', { count: failedOrders.length })}
          </span>
          <Button variant="outline" size="sm"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 h-7"
            onClick={() => { setActiveTab('ready'); setShowFailedOnly(true) }}>
            {t('common.see')}
          </Button>
        </div>
      )}

      {/* Tabs */}
      {loading ? (
        <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setMobileSelectMode(false) }} className="gap-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Mobile : dropdown + bouton Sélectionner */}
          <div className="md:hidden flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Select value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); setMobileSelectMode(false) }}>
              <SelectTrigger className="flex-1 h-9 font-medium text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t('orders.tabs.pending')} ({filteredPending.length})</SelectItem>
                <SelectItem value="ready">{t('orders.tabs.ready')} ({filteredReady.length})</SelectItem>
                <SelectItem value="non_retrieved">{t('orders.tabs.nonRetrieved')} ({filteredNonRetrieved.length})</SelectItem>
                <SelectItem value="completed">{t('orders.tabs.completed')} ({filteredCompleted.length})</SelectItem>
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

          {/* Desktop : onglets */}
          <TabsList className="hidden md:flex w-full justify-start border-b border-border bg-transparent h-auto p-0 rounded-none px-6 overflow-x-auto">
            <TabsTrigger
              value="pending"
              className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2"
            >
              {t('orders.tabs.pending')}{tabCount(filteredPending.length, activeTab === 'pending')}
            </TabsTrigger>
            <TabsTrigger
              value="ready"
              className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2"
            >
              {t('orders.tabs.ready')}{tabCount(filteredReady.length, activeTab === 'ready')}
              {failedOrders.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
            </TabsTrigger>
            <TabsTrigger
              value="non_retrieved"
              className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2"
            >
              {t('orders.tabs.nonRetrieved')}
              {filteredNonRetrieved.length > 0 && tabCount(filteredNonRetrieved.length, activeTab === 'non_retrieved', true)}
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2"
            >
              {t('orders.tabs.completed')}{tabCount(filteredCompleted.length, activeTab === 'completed')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-0">
            {renderTable(filteredPending)}
          </TabsContent>

          <TabsContent value="ready" className="mt-0">
            {renderTable(filteredReady, { withFilter: true })}
          </TabsContent>

          <TabsContent value="non_retrieved" className="mt-0">
            {filteredNonRetrieved.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <BellOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {t('orders.noRetrievedAfterReminders')}
              </div>
            ) : renderTable(filteredNonRetrieved)}
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            {renderTable(filteredCompleted)}
          </TabsContent>
        </Tabs>
      )}

      {/* Order detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          {selectedOrder && (() => {
            const client = selectedOrder.client as Client | undefined
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {selectedOrder.reference ? `#${selectedOrder.reference}` : 'Commande'}
                    {statusBadge(selectedOrder.status)}
                    {(selectedOrder.reminders_count ?? 0) >= 3 && selectedOrder.status === 'ready' && (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1">
                        <BellOff className="h-3 w-3" />{t('orders.nonRetrieved')}
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-1">
                  {client && (
                    <div className="text-sm space-y-0.5">
                      <div className="font-medium">{clientFullName(client)}</div>
                      <div className="text-muted-foreground">{client.phone_number}</div>
                      {selectedOrder.amount > 0 && (
                        <div className="text-muted-foreground">{selectedOrder.amount} MAD</div>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('orders.timeline.historyTitle')}</p>
                    <div className="space-y-3">
                      <TimelineItem done label={t('orders.timeline.created')} date={selectedOrder.created_at} />
                      <TimelineItem
                        done={!!selectedOrder.ready_at}
                        label={t('orders.timeline.ready')}
                        date={selectedOrder.ready_at}
                      />
                      {(selectedOrder.reminders_count ?? 0) > 0 && (
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 h-4 w-4 rounded-full border-2 bg-amber-400 border-amber-400 shrink-0" />
                          <div className="text-sm text-foreground">
                            {(selectedOrder.reminders_count ?? 0) > 1
                              ? t('orders.remindersPlural', { count: selectedOrder.reminders_count ?? 0 })
                              : t('orders.remindersSingular', { count: selectedOrder.reminders_count ?? 0 })}
                          </div>
                        </div>
                      )}
                      <TimelineItem
                        done={!!(selectedOrder.completed_at || selectedOrder.picked_up_at)}
                        label={t('orders.timeline.pickedUp')}
                        date={selectedOrder.completed_at ?? selectedOrder.picked_up_at}
                      />
                    </div>
                  </div>
                  {selectedOrder.messages && selectedOrder.messages.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t('orders.whatsappMessages')}</p>
                      <div className="space-y-2">
                        {selectedOrder.messages.map((msg: OrderMessage) => (
                          <div key={msg.id} className="flex items-center justify-between text-sm py-1">
                            <div className="flex items-center gap-2 text-foreground">
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>
                                {msg.type === 'ready_correction'
                                  ? t('orders.excuseMessage')
                                  : t('orders.readyNotif')}
                              </span>
                            </div>
                            <div className="flex items-center flex-none gap-2">
                              <Badge variant="outline" className={
                                msg.status === 'sent'
                                  ? 'border-green-200 text-green-700 bg-green-50 text-xs'
                                  : 'border-red-200 text-red-700 bg-red-50 text-xs'
                              }>
                                {msg.status === 'sent' ? t('orders.message.sent') : t('orders.message.failed')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(selectedOrder.status === 'pending' || selectedOrder.status === 'ready' || selectedOrder.status === 'completed') && (
                    <div className="flex flex-col gap-2 pt-3 border-t">
                      {selectedOrder.status === 'pending' && (
                        <Button className="w-full" variant="outline" onClick={() => markReady(selectedOrder.id)}>
                          <CheckCircle className="h-4 w-4 mr-1" />{t('orders.markReady')}
                        </Button>
                      )}
                      {selectedOrder.status === 'ready' && (
                        <>
                          <Button className="w-full" onClick={() => markPickedUp(selectedOrder.id, selectedOrder.reference ?? '')}>
                            <Package className="h-4 w-4 mr-1" />{t('orders.markPickedUp')}
                          </Button>
                          <Button className="w-full" variant="outline" onClick={() => markPending(selectedOrder.id)}>
                            <Undo2 className="h-4 w-4 mr-1" />{t('orders.markPending')}
                          </Button>
                        </>
                      )}
                      {selectedOrder.status === 'completed' && (
                        <Button className="w-full" variant="outline" onClick={() => revertCompleted(selectedOrder.id)}>
                          <Undo2 className="h-4 w-4 mr-1" />Remettre à prête
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Correction / excuse dialog — shown when downgrading after message was sent */}
      <Dialog open={correctionOpen} onOpenChange={(o) => { if (!o) { setCorrectionOpen(false); setCorrectionOrderId(null) } }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('orders.correctionDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              {t('orders.correctionDialog.body')}
            </p>
            <div className="grid grid-cols-2 flex-none gap-2">
              <Button variant="outline" onClick={() => { setCorrectionOpen(false); setCorrectionOrderId(null); toast(t('orders.cancelledToast')) }}>
                {t('orders.correctionDialog.noSend')}
              </Button>
              <Button disabled={correctionSending} onClick={handleSendCorrection}>
                {correctionSending ? t('common.sending') : t('common.send')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk floating action bar ──────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{selectedIds.size} sélectionnée(s)</span>
          <div className="w-px h-4 bg-border" />
          {activeTab === 'pending' && (
            <Button size="sm" className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white" disabled={bulkStatusUpdating} onClick={() => handleBulkStatusUpdate('ready')}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Marquer Prêtes
            </Button>
          )}
          {(activeTab === 'ready' || activeTab === 'non_retrieved') && (
            <Button size="sm" className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white" disabled={bulkStatusUpdating} onClick={() => handleBulkStatusUpdate('completed')}>
              <Package className="h-3.5 w-3.5 mr-1.5" />Marquer Récupérées
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
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer {selectedIds.size} commande(s) ?</DialogTitle></DialogHeader>
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

      {/* Delete order confirm dialog */}
      <Dialog open={!!deleteOrder} onOpenChange={(o) => !o && setDeleteOrder(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('orders.deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          {deleteOrder && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                {deleteOrder.reference
                  ? t('orders.deleteDialog.body', { ref: deleteOrder.reference })
                  : t('orders.deleteDialog.bodyNoRef')}
              </p>
              <div className="grid grid-cols-2 flex-none gap-2">
                <Button variant="outline" onClick={() => setDeleteOrder(null)}>{t('common.cancel')}</Button>
                <Button variant="destructive" disabled={deleteSubmitting} onClick={handleDeleteOrder}>
                  {deleteSubmitting ? t('common.deleting') : t('common.delete')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
