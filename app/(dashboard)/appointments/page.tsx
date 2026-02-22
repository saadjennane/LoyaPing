'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, ChevronLeft, ChevronRight, Calendar, List,
  UserCheck, UserX, AlertTriangle, Trash2, ArrowLeft, AlertCircle, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import type { Appointment, AppointmentListItem, Client, LoyaltyProgram, ReminderSend, CustomerIndexItem } from '@/lib/types'
import CustomerAutocomplete from '@/components/CustomerAutocomplete'
import PhoneInput from '@/components/PhoneInput'
import { useCustomerIndex } from '@/lib/hooks/useCustomerIndex'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addMonths, subDays, isSameDay, isSameMonth, parseISO,
  setHours, setMinutes, differenceInMinutes, startOfDay, startOfToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'

type ViewMode = 'calendar' | 'list'
type CalMode = '1day' | '3day' | '7day' | 'month'
type ListTab      = 'upcoming' | 'history'
type StatusFilter = 'all' | 'upcoming' | 'show' | 'no_show'
type NotifFilter  = 'all' | 'failed_only'

const HOUR_START = 7
const HOUR_END = 21
const HOUR_HEIGHT = 64 // px per hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientFullName(client: Client | null | undefined): string {
  if (!client) return '—'
  const parts = [client.civility, client.first_name, client.last_name].filter(Boolean)
  if (parts.length > 1 || (parts.length === 1 && parts[0] !== client.civility)) {
    return parts.join(' ')
  }
  return client.phone_number
}

function statusLabel(status: string, t: (k: string) => string): string {
  if (status === 'scheduled') return t('appointments.status.scheduled')
  if (status === 'show') return t('appointments.status.show')
  if (status === 'no_show') return t('appointments.status.no_show')
  return status
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'show') return 'default'
  if (status === 'no_show') return 'destructive'
  return 'secondary'
}

function apptColorClass(status: string) {
  if (status === 'show') return 'bg-green-100 text-green-800 border-green-300'
  if (status === 'no_show') return 'bg-red-100 text-red-800 border-red-300'
  return 'bg-blue-100 text-blue-800 border-blue-300'
}

function hasReminderError(appt: Appointment): boolean {
  return appt.reminders?.some((r) => r.status === 'failed') ?? false
}

// ─── Time Grid (1d / 3d / 7d) ────────────────────────────────────────────────

function TimeGrid({
  days,
  appointments,
  onSelect,
}: {
  days: Date[]
  appointments: Appointment[]
  onSelect: (a: Appointment) => void
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  function apptTop(appt: Appointment): number {
    const d = parseISO(appt.scheduled_at)
    const dayStart = setMinutes(setHours(startOfDay(d), HOUR_START), 0)
    const mins = differenceInMinutes(d, dayStart)
    return Math.max(0, (mins / 60) * HOUR_HEIGHT)
  }

  return (
    <div className="flex border rounded-lg overflow-hidden">
      {/* Time axis */}
      <div className="w-14 shrink-0 border-r bg-muted/20">
        <div className="h-10 border-b" />
        <div className="relative" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute w-full border-t text-[11px] text-muted-foreground px-1 pt-0.5"
              style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
            >
              {h}:00
            </div>
          ))}
        </div>
      </div>

      {/* Day columns */}
      {days.map((day) => {
        const dayAppts = appointments.filter((a) =>
          isSameDay(parseISO(a.scheduled_at), day)
        )
        const isToday = isSameDay(day, new Date())

        return (
          <div key={day.toISOString()} className="flex-1 border-r last:border-r-0 min-w-0">
            <div
              className={`h-10 border-b flex flex-col items-center justify-center text-xs font-medium ${
                isToday ? 'bg-primary/10' : ''
              }`}
            >
              <span className={isToday ? 'text-primary' : 'text-muted-foreground'}>
                {format(day, 'EEE', { locale: fr })}
              </span>
              <span className={`font-bold ${isToday ? 'text-primary' : ''}`}>
                {format(day, 'd')}
              </span>
            </div>
            <div className="relative" style={{ height: totalHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-dashed border-muted"
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                />
              ))}
              {dayAppts.map((appt) => (
                <button
                  key={appt.id}
                  onClick={() => onSelect(appt)}
                  className={`absolute left-0.5 right-0.5 rounded text-[11px] text-left px-1.5 py-0.5 truncate leading-tight border ${apptColorClass(appt.status)}`}
                  style={{ top: apptTop(appt), minHeight: 24 }}
                >
                  <span className="font-semibold">
                    {format(parseISO(appt.scheduled_at), 'HH:mm')}
                  </span>{' '}
                  {clientFullName(appt.client as Client)}
                  {hasReminderError(appt) && ' ⚠'}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Month Grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  anchor,
  appointments,
  onSelect,
}: {
  anchor: Date
  appointments: Appointment[]
  onSelect: (a: Appointment) => void
}) {
  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days: Date[] = []
  let cur = gridStart
  while (cur <= gridEnd) {
    days.push(cur)
    cur = addDays(cur, 1)
  }

  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/20">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayAppts = appointments.filter((a) =>
            isSameDay(parseISO(a.scheduled_at), day)
          )
          const inMonth = isSameMonth(day, anchor)
          const isToday = isSameDay(day, new Date())

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[100px] border-b border-r p-1 last:border-r-0 ${
                !inMonth ? 'bg-muted/10' : ''
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : !inMonth
                    ? 'text-muted-foreground'
                    : ''
                }`}
              >
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayAppts.slice(0, 3).map((appt) => (
                  <button
                    key={appt.id}
                    onClick={() => onSelect(appt)}
                    className={`w-full text-left text-[10px] rounded px-1 truncate ${apptColorClass(appt.status)}`}
                  >
                    {format(parseISO(appt.scheduled_at), 'HH:mm')}{' '}
                    {clientFullName(appt.client as Client)}
                    {hasReminderError(appt) && ' ⚠'}
                  </button>
                ))}
                {dayAppts.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayAppts.length - 3} autres
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Time picker options ───────────────────────────────────────────────────────
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

// ─── Main Page ────────────────────────────────────────────────────────────────

// ── Grouping helper for list views ────────────────────────────────────────────

function groupByDay(
  items: AppointmentListItem[],
): Array<{ dateKey: string; label: string; items: AppointmentListItem[] }> {
  const map = new Map<string, AppointmentListItem[]>()
  for (const item of items) {
    const key = format(parseISO(item.scheduled_at), 'yyyy-MM-dd')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  const today    = startOfToday()
  const tomorrow = addDays(today, 1)
  return Array.from(map.entries()).map(([dateKey, dayItems]) => {
    const d = parseISO(dateKey)
    let label: string
    if (isSameDay(d, today))    label = 'groupToday'
    else if (isSameDay(d, tomorrow)) label = 'groupTomorrow'
    else label = format(d, 'EEEE dd MMMM', { locale: fr })
    return {
      dateKey,
      label,
      items: [...dayItems].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    }
  })
}

export default function AppointmentsPage() {
  const { t } = useI18n()
  const { status } = useConfigStatus()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [calMode, setCalMode] = useState<CalMode>('7day')
  const [anchor, setAnchor] = useState<Date>(new Date())

  // ── List view state ───────────────────────────────────────────────────────
  const [listTab,               setListTab]               = useState<ListTab>('upcoming')
  const [upcomingStatusFilter,  setUpcomingStatusFilter]  = useState<StatusFilter>('all')
  const [upcomingNotifFilter,   setUpcomingNotifFilter]   = useState<NotifFilter>('all')
  const [historyStatusFilter,   setHistoryStatusFilter]   = useState<StatusFilter>('all')
  const [historyNotifFilter,    setHistoryNotifFilter]    = useState<NotifFilter>('all')
  const [upcomingGotoDate,      setUpcomingGotoDate]      = useState('')
  const [historyGotoDate,       setHistoryGotoDate]       = useState('')
  const [listItems,             setListItems]             = useState<AppointmentListItem[]>([])
  const [listLoading,           setListLoading]           = useState(false)
  const [listSearch,            setListSearch]            = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Loyalty program (to determine if amount modal is needed on SHOW)
  const [loyaltyProgram, setLoyaltyProgram] = useState<LoyaltyProgram | null>(null)

  // Amount modal state (shown when loyalty type = 'montant')
  const [amountModalOpen, setAmountModalOpen] = useState(false)
  const [pendingShowId, setPendingShowId] = useState<string | null>(null)
  const [showAmount, setShowAmount] = useState('')
  const [showSubmitting, setShowSubmitting] = useState(false)

  // ── Create RDV dialog ────────────────────────────────────────────────────
  type CreateStep = 'search' | 'new_client' | 'details'
  const [createOpen, setCreateOpen]       = useState(false)
  const [createStep, setCreateStep]       = useState<CreateStep>('search')
  const [createItem, setCreateItem]       = useState<CustomerIndexItem | null>(null)
  const [newClientForm, setNewClientForm] = useState({ civility: '', first_name: '', last_name: '', phone_number: '' })
  const [apptDate, setApptDate]           = useState('')
  const [apptHour, setApptHour]           = useState('')
  const [apptMinute, setApptMinute]       = useState('00')
  const [apptEndHour, setApptEndHour]     = useState('')
  const [apptEndMinute, setApptEndMinute] = useState('00')
  const [apptNotes, setApptNotes]         = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const { addOrUpdate } = useCustomerIndex()

  const resetCreate = () => {
    setCreateStep('search')
    setCreateItem(null)
    setNewClientForm({ civility: '', first_name: '', last_name: '', phone_number: '' })
    setApptDate('')
    setApptHour('')
    setApptMinute('00')
    setApptEndHour('')
    setApptEndMinute('00')
    setApptNotes('')
    setCreateSubmitting(false)
  }

  const handleSelectCreateItem = (_id: string, item: CustomerIndexItem) => {
    setCreateItem(item)
    setCreateStep('details')
  }

  const handleGoToNewClient = (phone?: string) => {
    setNewClientForm({ civility: '', first_name: '', last_name: '', phone_number: phone ?? '' })
    setCreateStep('new_client')
  }

  const handleCreateNewClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateSubmitting(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClientForm),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error); setCreateSubmitting(false); return }
    const created: Client = json.data
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
    setCreateItem(indexItem)
    setCreateStep('details')
    setCreateSubmitting(false)
  }

  const handleStartHourChange = (h: string) => {
    setApptHour(h)
    // Auto-set end hour to start + 1h
    setApptEndHour(String((parseInt(h) + 1) % 24).padStart(2, '0'))
  }

  const handleCreateAppt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createItem || !apptDate || !apptHour) return
    setCreateSubmitting(true)
    const scheduled_at = new Date(`${apptDate}T${apptHour}:${apptMinute}:00`).toISOString()
    const ended_at = apptEndHour
      ? new Date(`${apptDate}T${apptEndHour}:${apptEndMinute}:00`).toISOString()
      : null
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: createItem.id, scheduled_at, ended_at, notes: apptNotes || null }),
    })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(t('appointments.toast.created'))
      setCreateOpen(false)
      fetchAppointments()
      if (viewMode === 'list') void fetchListItems()
    }
    setCreateSubmitting(false)
  }

  const fetchAppointments = useCallback(async () => {
    const res = await fetch('/api/appointments?all=true')
    const json = await res.json()
    setAppointments(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAppointments()
    // Fetch loyalty program to decide whether to show amount modal on SHOW
    fetch('/api/loyalty/programs').then((r) => r.json()).then((j) => {
      if (j.data) setLoyaltyProgram(j.data as LoyaltyProgram)
    }).catch(() => {})
  }, [fetchAppointments])

  // ── List fetch ───────────────────────────────────────────────────────────
  const fetchListItems = useCallback(async () => {
    setListLoading(true)
    const sp = new URLSearchParams({ mode: listTab })
    const gotoDate = listTab === 'upcoming' ? upcomingGotoDate : historyGotoDate
    if (gotoDate) {
      if (listTab === 'upcoming') {
        sp.set('from', gotoDate)
        sp.set('to', format(addDays(parseISO(gotoDate), 30), 'yyyy-MM-dd'))
      } else {
        sp.set('from', format(subDays(parseISO(gotoDate), 30), 'yyyy-MM-dd'))
        sp.set('to', gotoDate)
      }
    }
    const sf = listTab === 'upcoming' ? upcomingStatusFilter : historyStatusFilter
    const nf = listTab === 'upcoming' ? upcomingNotifFilter  : historyNotifFilter
    if (sf !== 'all') sp.set('statusFilter', sf)
    if (nf !== 'all') sp.set('notifFilter',  nf)
    const res  = await fetch(`/api/appointments/list?${sp}`)
    const json = await res.json()
    setListItems(json.data ?? [])
    setListLoading(false)
  }, [listTab, upcomingGotoDate, historyGotoDate, upcomingStatusFilter, historyStatusFilter, upcomingNotifFilter, historyNotifFilter])

  useEffect(() => {
    if (viewMode === 'list') void fetchListItems()
  }, [viewMode, fetchListItems])

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigate(dir: 1 | -1) {
    if (calMode === '1day') setAnchor((d) => addDays(d, dir))
    else if (calMode === '3day') setAnchor((d) => addDays(d, dir * 3))
    else if (calMode === '7day') setAnchor((d) => addDays(d, dir * 7))
    else setAnchor((d) => addMonths(d, dir))
  }

  function getDays(): Date[] {
    if (calMode === '1day') return [anchor]
    if (calMode === '3day') return [anchor, addDays(anchor, 1), addDays(anchor, 2)]
    if (calMode === '7day') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    }
    return []
  }

  function navLabel(): string {
    if (calMode === '1day') return format(anchor, 'EEEE dd MMMM yyyy', { locale: fr })
    if (calMode === '3day') {
      const end = addDays(anchor, 2)
      return `${format(anchor, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
    }
    if (calMode === '7day') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      const end = endOfWeek(anchor, { weekStartsOn: 1 })
      return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
    }
    return format(anchor, 'MMMM yyyy', { locale: fr })
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  // Call this when clicking SHOW — opens modal if loyalty type = 'montant'
  const markShow = (id: string) => {
    if (loyaltyProgram?.type === 'montant') {
      setPendingShowId(id)
      setShowAmount('')
      setAmountModalOpen(true)
    } else {
      doMarkShow(id, undefined)
    }
  }

  const doMarkShow = async (id: string, amount: number | undefined) => {
    setShowSubmitting(true)
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'show', ...(amount !== undefined ? { amount } : {}) }),
    })
    const json = await res.json()
    setShowSubmitting(false)
    if (json.error) {
      toast.error(json.error)
    } else {
      const pts = json.data?.pointsCredited
      toast.success(pts ? t('appointments.toast.showPts', { pts }) : t('appointments.toast.show'))
      setAmountModalOpen(false)
      setDetailOpen(false)
      fetchAppointments()
      if (viewMode === 'list') void fetchListItems()
    }
  }

  const handleConfirmShow = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingShowId) return
    const amount = parseFloat(showAmount)
    doMarkShow(pendingShowId, isNaN(amount) ? 0 : amount)
  }

  const markNoShow = async (id: string) => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'no_show' }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      toast.info(t('appointments.toast.noShow'))
      setDetailOpen(false)
      fetchAppointments()
      if (viewMode === 'list') void fetchListItems()
    }
  }

  const forceStatus = async (id: string, status: 'show' | 'no_show' | 'scheduled') => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, force: true }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      const labels: Record<string, string> = { show: t('appointments.toast.forceShow'), no_show: t('appointments.toast.forceNoShow'), scheduled: t('appointments.toast.forceScheduled') }
      toast.success(labels[status] ?? t('appointments.toast.statusUpdated'))
      setDetailOpen(false)
      fetchAppointments()
      if (viewMode === 'list') void fetchListItems()
    }
  }

  const [deleteAppt, setDeleteAppt] = useState<Appointment | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)

  const handleDeleteAppt = async () => {
    if (!deleteAppt) return
    setDeleteSubmitting(true)
    const res = await fetch(`/api/appointments/${deleteAppt.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) { toast.error(json.error) }
    else {
      toast.success(t('appointments.toast.deleted'))
      setDeleteAppt(null)
      setDetailOpen(false)
      fetchAppointments()
      if (viewMode === 'list') void fetchListItems()
    }
    setDeleteSubmitting(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkStatusUpdate = async (status: 'show' | 'no_show') => {
    setBulkStatusUpdating(true)
    const res = await fetch('/api/appointments/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), status }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} RDV mis à jour`)
      setSelectedIds(new Set())
      void fetchListItems()
    }
    setBulkStatusUpdating(false)
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const res = await fetch('/api/appointments/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(`${json.data.count} RDV supprimé(s)`)
      setSelectedIds(new Set())
      setBulkDeleteConfirm(false)
      void fetchListItems()
    }
    setBulkDeleting(false)
  }

  const reminderErrorCount = appointments.filter(hasReminderError).length
  const days = viewMode === 'calendar' && calMode !== 'month' ? getDays() : []

  const filteredListItems = listSearch.trim()
    ? listItems.filter(item => item.client_name.toLowerCase().includes(listSearch.toLowerCase()))
    : listItems

  // Switch to list view automatically on small screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('list')
    }
  }, [])

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      {/* WhatsApp config banner */}
      {status !== null && !status.appointments_configured && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            Le module Rendez-vous est activé, mais les rappels WhatsApp ne sont pas configurés. Vous pouvez gérer les RDV, mais aucun rappel ne sera envoyé.{' '}
            <a href="/settings/appointments" className="font-medium underline">Configurer maintenant</a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('appointments.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('appointments.total', { count: appointments.length })}</p>
        </div>
        <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm" onClick={() => { resetCreate(); setCreateOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />{t('appointments.newBtn')}
        </Button>
      </div>

      {/* Search — list view only */}
      {viewMode === 'list' && (
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
      )}

      {/* Warning banner — reminder errors */}
      {!loading && reminderErrorCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            {reminderErrorCount === 1
              ? t('appointments.reminderErrorBanner.singular')
              : t('appointments.reminderErrorBanner.plural', { count: reminderErrorCount })}
          </span>
          <button
            className="ml-auto font-semibold underline underline-offset-2 hover:text-amber-900"
            onClick={() => { setViewMode('list'); setListTab('upcoming'); setUpcomingNotifFilter('failed_only') }}
          >
            Voir
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View toggle + list sub-tabs on the same row */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <List className="h-3.5 w-3.5" />{t('appointments.listView')}
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 border-l ${
                viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />{t('appointments.calendarView')}
            </button>
          </div>

          {viewMode === 'list' && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setListTab('upcoming')}
                className={`px-4 py-1.5 text-sm font-medium whitespace-nowrap ${
                  listTab === 'upcoming' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {t('appointments.upcoming')}
              </button>
              <button
                onClick={() => setListTab('history')}
                className={`px-4 py-1.5 text-sm font-medium border-l ${
                  listTab === 'history' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {t('appointments.history')}
              </button>
            </div>
          )}
        </div>

        {viewMode === 'calendar' && (
          <>
            <div className="flex rounded-md border overflow-hidden">
              {(['1day', '3day', '7day', 'month'] as CalMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setCalMode(m)}
                  className={`px-3 py-1.5 text-sm border-l first:border-l-0 ${
                    calMode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {t(`appointments.calModes.${m}`)}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              {t('appointments.todayBtn')}
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[220px] text-center capitalize">
                {navLabel()}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : viewMode === 'list' ? (
        // ── List View — sub-tabs: À venir / Historique ─────────────────────
        <div className="space-y-4">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status pills */}
            {([ 'all', 'upcoming', 'show', 'no_show'] as StatusFilter[]).map((key) => {
              const label   = t(`appointments.filters.${key}`)
              const current = listTab === 'upcoming' ? upcomingStatusFilter : historyStatusFilter
              const active  = current === key
              return (
                <button
                  key={key}
                  onClick={() => listTab === 'upcoming' ? setUpcomingStatusFilter(key) : setHistoryStatusFilter(key)}
                  className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                    active ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              )
            })}

            {/* WhatsApp error toggle */}
            {(() => {
              const nf     = listTab === 'upcoming' ? upcomingNotifFilter : historyNotifFilter
              const active = nf === 'failed_only'
              return (
                <button
                  onClick={() => {
                    const next: NotifFilter = active ? 'all' : 'failed_only'
                    listTab === 'upcoming' ? setUpcomingNotifFilter(next) : setHistoryNotifFilter(next)
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                    active ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t('appointments.filters.errorWA')}
                </button>
              )
            })()}

            {/* Go-to date */}
            {(() => {
              const appliedDate = listTab === 'upcoming' ? upcomingGotoDate : historyGotoDate
              const clearDate = () => listTab === 'upcoming' ? setUpcomingGotoDate('') : setHistoryGotoDate('')
              return (
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="relative h-8 border border-input rounded-md px-2 bg-background flex items-center min-w-[9rem]">
                    <span className="text-xs whitespace-nowrap pointer-events-none select-none text-muted-foreground">
                      {appliedDate
                        ? format(parseISO(appliedDate), 'd MMM yyyy', { locale: fr })
                        : 'Aller à une date'}
                    </span>
                    <input
                      type="date"
                      value={appliedDate}
                      onChange={(e) => {
                        const val = e.target.value
                        if (listTab === 'upcoming') setUpcomingGotoDate(val)
                        else setHistoryGotoDate(val)
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    />
                  </div>
                  {appliedDate && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={clearDate}>
                      ✕
                    </Button>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Day-grouped content */}
          {listLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
          ) : filteredListItems.length === 0 ? (
            <div className="rounded-lg border text-center py-16 text-muted-foreground text-sm">
              {listSearch.trim() ? t('common.noResults') : t('appointments.noAppointments')}
            </div>
          ) : (
            <div className="space-y-6">
              {groupByDay(filteredListItems).map(({ dateKey, label, items: dayItems }) => (
                <div key={dateKey}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize">
                    {label === 'groupToday' ? t('appointments.groupToday') : label === 'groupTomorrow' ? t('appointments.groupTomorrow') : label}
                  </h3>
                  <div className="border rounded-lg overflow-hidden divide-y">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => {
                          const full = appointments.find((a) => a.id === item.id)
                          if (full) { setSelected(full); setDetailOpen(true) }
                        }}
                      >
                        {/* Checkbox */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </div>
                        {/* Time */}
                        <span className="tabular-nums text-sm font-semibold w-12 shrink-0 text-muted-foreground">
                          {format(parseISO(item.scheduled_at), 'HH:mm')}
                        </span>
                        {/* Client */}
                        <span className="flex-1 text-sm font-medium truncate">{item.client_name}</span>
                        {/* Status badge */}
                        <Badge variant={statusVariant(item.status)}>
                          {statusLabel(item.status, t)}
                        </Badge>
                        {/* Reminders sent */}
                        {item.reminders_sent > 0 && !item.notification_failed && (
                          <span className="text-xs text-green-600 font-medium shrink-0">
                            {item.reminders_sent > 1
                              ? t('appointments.remindersPlural', { count: item.reminders_sent })
                              : t('appointments.remindersSingular', { count: item.reminders_sent })}
                          </span>
                        )}
                        {/* WA error badge */}
                        {item.notification_failed && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium shrink-0">
                            <AlertTriangle className="h-3.5 w-3.5" />{t('appointments.failedWA')}
                          </span>
                        )}
                        {/* Quick actions */}
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {item.status === 'scheduled' && (
                            <>
                              <Button size="sm" variant="ghost" title={t('appointments.actions.absent')} onClick={() => markNoShow(item.id)}>
                                <UserX className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title={t('appointments.actions.present')} onClick={() => markShow(item.id)}>
                                <UserCheck className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title={t('common.delete')}
                            onClick={() => {
                              const full = appointments.find((a) => a.id === item.id)
                              if (full) setDeleteAppt(full)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : calMode === 'month' ? (
        // ── Month Grid ─────────────────────────────────────────────────────
        <MonthGrid
          anchor={anchor}
          appointments={appointments}
          onSelect={(a) => { setSelected(a); setDetailOpen(true) }}
        />
      ) : (
        // ── Time Grid ──────────────────────────────────────────────────────
        <div className="overflow-x-auto">
          <TimeGrid
            days={days}
            appointments={appointments}
            onSelect={(a) => { setSelected(a); setDetailOpen(true) }}
          />
        </div>
      )}

      {/* Create RDV dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetCreate(); setCreateOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createStep === 'new_client' ? t('appointments.form.newClientTitle') : t('appointments.form.newApptTitle')}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1 — select client */}
          {createStep === 'search' && (
            <div className="mt-2">
              <CustomerAutocomplete
                autoFocus
                onSelect={handleSelectCreateItem}
                onCreateNew={handleGoToNewClient}
                placeholder={t('appointments.form.searchPlaceholder')}
              />
            </div>
          )}

          {/* Step 2 — create new client */}
          {createStep === 'new_client' && (
            <div className="space-y-4 mt-2">
              <Button type="button" variant="ghost" size="sm" className="-ml-2 text-gray-500"
                onClick={() => setCreateStep('search')}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />{t('common.back')}
              </Button>
              <form onSubmit={handleCreateNewClient} className="space-y-4">
                <div className="flex gap-2">
                  <Select value={newClientForm.civility}
                    onValueChange={(v) => setNewClientForm({ ...newClientForm, civility: v === '_' ? '' : v })}>
                    <SelectTrigger className="w-20 shrink-0"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">—</SelectItem>
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Mme">Mme</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input autoFocus placeholder={t('common.firstName')} value={newClientForm.first_name} required
                    onChange={(e) => setNewClientForm({ ...newClientForm, first_name: e.target.value })} />
                  <Input placeholder={t('common.lastName')} value={newClientForm.last_name} required
                    onChange={(e) => setNewClientForm({ ...newClientForm, last_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('common.phone')}</Label>
                  <PhoneInput
                    required
                    value={newClientForm.phone_number}
                    onChange={v => setNewClientForm({ ...newClientForm, phone_number: v })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createSubmitting}>
                  {createSubmitting ? t('common.creating_ellipsis') : t('common.continue')}
                </Button>
              </form>
            </div>
          )}

          {/* Step 3 — appointment details */}
          {createStep === 'details' && createItem && (
            <div className="space-y-4 mt-2">
              <div className="px-3 py-2.5 bg-muted/30 rounded-lg">
                <div className="text-sm font-medium">{createItem.display_name}</div>
                {createItem.display_name !== createItem.phone && (
                  <div className="text-xs text-gray-500">{createItem.phone}</div>
                )}
              </div>
              <form onSubmit={handleCreateAppt} className="space-y-4">
                <div className="space-y-1">
                  <Label>{t('appointments.form.dateLabel')}</Label>
                  <Input type="date" required value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)} />
                </div>
                <div className="flex items-end gap-2">
                  {/* Start time */}
                  <div className="space-y-1">
                    <Label>Début</Label>
                    <div className="flex items-center gap-1">
                      <Select value={apptHour} onValueChange={handleStartHourChange}>
                        <SelectTrigger className="w-20"><SelectValue placeholder="hh" /></SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground font-medium">:</span>
                      <Select value={apptMinute} onValueChange={setApptMinute}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <span className="text-muted-foreground pb-2 text-sm">→</span>
                  {/* End time */}
                  <div className="space-y-1">
                    <Label>Fin</Label>
                    <div className="flex items-center gap-1">
                      <Select value={apptEndHour} onValueChange={setApptEndHour}>
                        <SelectTrigger className="w-20"><SelectValue placeholder="hh" /></SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground font-medium">:</span>
                      <Select value={apptEndMinute} onValueChange={setApptEndMinute}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('appointments.form.notesLabel')} <span className="text-xs text-gray-400 font-normal">{t('appointments.form.notesHint')}</span></Label>
                  <Input placeholder="Coupe + couleur…" value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={createSubmitting}>
                  {createSubmitting ? t('appointments.form.creating') : t('appointments.form.createBtn')}
                </Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('appointments.detail.title')}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="text-muted-foreground">{t('appointments.detail.client')}</div>
                <div className="font-medium">{clientFullName(selected.client as Client)}</div>
                <div className="text-muted-foreground">{t('appointments.detail.date')}</div>
                <div className="capitalize">
                  {format(parseISO(selected.scheduled_at), 'EEEE dd MMMM yyyy', { locale: fr })}
                </div>
                <div className="text-muted-foreground">{t('appointments.detail.time')}</div>
                <div>{format(parseISO(selected.scheduled_at), 'HH:mm')}</div>
                {selected.notes && (
                  <>
                    <div className="text-muted-foreground">{t('appointments.detail.notes')}</div>
                    <div>{selected.notes}</div>
                  </>
                )}
                <div className="text-muted-foreground">{t('appointments.detail.status')}</div>
                <div>
                  <Badge variant={statusVariant(selected.status)}>
                    {statusLabel(selected.status, t)}
                  </Badge>
                </div>
                {selected.show_at && (
                  <>
                    <div className="text-muted-foreground">{t('appointments.detail.showAt')}</div>
                    <div className="text-sm">{format(parseISO(selected.show_at), 'dd MMM à HH:mm', { locale: fr })}</div>
                  </>
                )}
                {selected.no_show_at && (
                  <>
                    <div className="text-muted-foreground">{t('appointments.detail.noShowAt')}</div>
                    <div className="text-sm">{format(parseISO(selected.no_show_at), 'dd MMM à HH:mm', { locale: fr })}</div>
                  </>
                )}
              </div>

              {/* Reminder history */}
              {selected.reminders && selected.reminders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('appointments.remindersTitle')}
                  </p>
                  {(selected.reminders as ReminderSend[]).map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                        r.status === 'failed'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-green-50 text-green-800'
                      }`}
                    >
                      {r.status === 'failed' ? (
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <span className="mt-0.5">✓</span>
                      )}
                      <div>
                        <span className="font-medium">
                          {r.status === 'failed' ? t('orders.message.failed') : t('orders.message.sent')}
                        </span>
                        {' · '}
                        {format(parseISO(r.sent_at), 'dd MMM à HH:mm', { locale: fr })}
                        {r.error_message && (
                          <p className="text-amber-700 mt-0.5">{r.error_message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selected.status === 'scheduled' && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => markNoShow(selected.id)}>
                    <UserX className="h-4 w-4 mr-2" />{t('appointments.actions.absent')}
                  </Button>
                  <Button className="flex-1" onClick={() => markShow(selected.id)}>
                    <UserCheck className="h-4 w-4 mr-2" />{t('appointments.actions.present')}
                  </Button>
                </div>
              )}
              {selected.status === 'show' && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">{t('appointments.actions.correctStatus')}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => forceStatus(selected.id, 'no_show')}>
                      <UserX className="h-4 w-4 mr-1.5" />{t('appointments.actions.markAbsent')}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => forceStatus(selected.id, 'scheduled')}>
                      {t('appointments.actions.resetScheduled')}
                    </Button>
                  </div>
                </div>
              )}
              {selected.status === 'no_show' && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">{t('appointments.actions.correctStatus')}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => forceStatus(selected.id, 'show')}>
                      <UserCheck className="h-4 w-4 mr-1.5" />{t('appointments.actions.markPresent')}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => forceStatus(selected.id, 'scheduled')}>
                      {t('appointments.actions.resetScheduled')}
                    </Button>
                  </div>
                </div>
              )}
              <div className="pt-1 border-t">
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive w-full"
                  onClick={() => setDeleteAppt(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />{t('appointments.detail.deleteBtn')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete appointment confirm dialog */}
      <Dialog open={!!deleteAppt} onOpenChange={(o) => !o && setDeleteAppt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('appointments.deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          {deleteAppt && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                {t('appointments.deleteDialog.body', { date: format(parseISO(deleteAppt.scheduled_at), 'dd MMM yyyy à HH:mm', { locale: fr }) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDeleteAppt(null)}>{t('common.cancel')}</Button>
                <Button variant="destructive" disabled={deleteSubmitting} onClick={handleDeleteAppt}>
                  {deleteSubmitting ? t('common.deleting') : t('common.delete')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Amount modal — shown only when loyalty type = 'montant' */}
      <Dialog open={amountModalOpen} onOpenChange={(o) => { if (!o && !showSubmitting) { setAmountModalOpen(false); setPendingShowId(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('appointments.amountModal.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleConfirmShow} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>
                Montant ({loyaltyProgram?.currency ?? ''}){' '}
                {loyaltyProgram?.conversion_amount_per_point && (
                  <span className="font-normal text-muted-foreground text-xs">
                    {t('appointments.amountModal.perPoint', { amount: loyaltyProgram.conversion_amount_per_point, currency: loyaltyProgram.currency ?? '' })}
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                autoFocus
                value={showAmount}
                onChange={(e) => setShowAmount(e.target.value)}
              />
              {showAmount && loyaltyProgram?.conversion_amount_per_point && (
                <p className="text-xs text-muted-foreground">
                  {t('appointments.amountModal.pointsPreview', { points: Math.floor(parseFloat(showAmount) / loyaltyProgram.conversion_amount_per_point) })}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={showSubmitting}
                onClick={() => { setAmountModalOpen(false); setPendingShowId(null) }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={showSubmitting}>
                <UserCheck className="h-4 w-4 mr-1.5" />
                {showSubmitting ? t('appointments.amountModal.validating') : t('appointments.amountModal.validate')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk floating action bar (list view only) ──────────────────────── */}
      {viewMode === 'list' && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{selectedIds.size} sélectionné(s)</span>
          <div className="w-px h-4 bg-border" />
          <Button size="sm" variant="outline" disabled={bulkStatusUpdating} onClick={() => handleBulkStatusUpdate('show')}>
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />Marquer Présent
          </Button>
          <Button size="sm" variant="outline" disabled={bulkStatusUpdating} onClick={() => handleBulkStatusUpdate('no_show')}>
            <UserX className="h-3.5 w-3.5 mr-1.5" />Marquer Absent
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Supprimer
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Désélectionner</Button>
        </div>
      )}

      {/* ── Bulk delete confirm ────────────────────────────────────────────── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Supprimer {selectedIds.size} RDV ?</DialogTitle></DialogHeader>
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
    </div>
  )
}
