'use client'

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, ChevronLeft, ChevronRight,
  UserCheck, UserX, AlertTriangle, Trash2, ArrowLeft, AlertCircle, Search, Check, CalendarClock, RefreshCw, X,
  MoreHorizontal, Pencil, Sparkles, CalendarX, Clock, UserPlus, Gift, BellOff,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Appointment, AppointmentListItem, Cabin, Client, LoyaltyProgram, CustomerIndexItem, GiftCard, Service } from '@/lib/types'
import { ServiceSelector, WeekSlotGrid, type SelectedSlot } from '@/components/appointments/ServiceSlotPicker'
import { formatDuration, timeToMins, type BusinessHourRow } from '@/lib/scheduling/slots'
import CustomerAutocomplete from '@/components/CustomerAutocomplete'
import WhatsAppToggle from '@/components/WhatsAppToggle'
import type { CabinConflictInfo, ConflictResolution } from '@/lib/services/catalog'
import PhoneInput from '@/components/PhoneInput'
import { clientToIndexItem, useCustomerIndex } from '@/lib/hooks/useCustomerIndex'
import { useI18n } from '@/lib/i18n/provider'
import { useConfigStatus } from '@/lib/context/config-status'
import {
  format, startOfWeek, endOfWeek,
  addDays, subDays, isSameDay, parseISO,
  setHours, setMinutes, differenceInMinutes, startOfDay, startOfToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'

type AppView      = 'agenda' | 'semaine' | 'a_replanifier'
type StatusFilter = 'all' | 'upcoming' | 'show' | 'no_show' | 'unassigned'
type NotifFilter  = 'all' | 'failed_only'
type DetailApptMode = 'detail' | 'reschedule'

// ─── Availability exceptions ──────────────────────────────────────────────────

type AvailabilityException = {
  id: string
  business_id: string
  start_date: string       // 'yyyy-MM-dd'
  end_date: string         // 'yyyy-MM-dd'
  start_time: string | null  // 'HH:MM'
  end_time: string | null    // 'HH:MM'
  label?: string | null
  created_at: string
  updated_at: string
}

const HOUR_START = 0
const HOUR_END = 24
const HOUR_HEIGHT = 64 // px per hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientFullName(client: Client | null | undefined): string {
  if (!client) return '—'
  const parts = [client.civility, client.first_name, client.last_name].filter(Boolean)
  if (parts.length > 1 || (parts.length === 1 && parts[0] !== client.civility)) {
    return parts.join(' ')
  }
  return client.phone_number || 'Client sans nom'
}

function statusLabel(status: string, t: (k: string) => string): string {
  if (status === 'scheduled') return t('appointments.status.scheduled')
  if (status === 'confirmed') return 'Confirmé'
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
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  return 'bg-blue-100 text-blue-800 border-blue-300'
}

// ─── Overlap layout helper ────────────────────────────────────────────────────

function computeOverlapLayout(
  events: Array<{ id: string; start: string; end: string | null | undefined }>,
): Map<string, { colIdx: number; totalCols: number }> {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const columns: number[] = [] // columns[i] = endMs of the last event in column i
  const assigned: Array<{ id: string; startMs: number; endMs: number; colIdx: number }> = []

  for (const ev of sorted) {
    const startMs = parseISO(ev.start).getTime()
    const endMs   = ev.end ? parseISO(ev.end).getTime() : startMs + 60 * 60 * 1000

    let colIdx = 0
    while (columns[colIdx] !== undefined && columns[colIdx] > startMs) colIdx++
    columns[colIdx] = endMs
    assigned.push({ id: ev.id, startMs, endMs, colIdx })
  }

  const result = new Map<string, { colIdx: number; totalCols: number }>()
  for (const ev of assigned) {
    const overlapping = assigned.filter(
      (o) => o.startMs < ev.endMs && o.endMs > ev.startMs,
    )
    const totalCols = Math.max(...overlapping.map((o) => o.colIdx)) + 1
    result.set(ev.id, { colIdx: ev.colIdx, totalCols })
  }
  return result
}

// ─── Time Grid (1d / 3d / 7d) ────────────────────────────────────────────────

type DragSlot = { date: Date; startMins: number; endMins: number }

function TimeGrid({
  days,
  appointments,
  onSelect,
  defaultDuration,
  onCreateSlot,
  exceptions,
}: {
  days: Date[]
  appointments: Appointment[]
  onSelect: (a: Appointment) => void
  defaultDuration: number
  onCreateSlot: (date: Date, startMins: number, endMins: number) => void
  exceptions: AvailabilityException[]
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i) // 0..23
  const totalHeight = hours.length * HOUR_HEIGHT
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragSlot, setDragSlot] = useState<DragSlot | null>(null)
  const dragRef   = useRef<DragSlot | null>(null)

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
    }
  }, [])

  function minsFromClientY(clientY: number): number {
    const container = scrollRef.current!
    const rect = container.getBoundingClientRect()
    const relY = clientY - rect.top + container.scrollTop
    return Math.round((relY / HOUR_HEIGHT) * 60 / 15) * 15
  }

  function handleMouseDown(e: React.MouseEvent, day: Date) {
    if (e.button !== 0) return
    e.preventDefault()
    const startMins = Math.max(0, Math.min(24 * 60 - 15, minsFromClientY(e.clientY)))
    const endMins   = Math.min(24 * 60, startMins + defaultDuration)
    const slot: DragSlot = { date: day, startMins, endMins }
    dragRef.current = slot
    setDragSlot(slot)

    function onMouseMove(ev: MouseEvent) {
      const cur = dragRef.current
      if (!cur) return
      const rawMins = minsFromClientY(ev.clientY)
      const newEnd  = Math.max(cur.startMins + 15, Math.min(24 * 60, rawMins))
      const updated = { ...cur, endMins: newEnd }
      dragRef.current = updated
      setDragSlot({ ...updated })
    }

    function onMouseUp() {
      const s = dragRef.current
      dragRef.current = null
      setDragSlot(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (s) onCreateSlot(s.date, s.startMins, s.endMins)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function eventTop(isoDate: string): number {
    const d = parseISO(isoDate)
    const dayStart = setMinutes(setHours(startOfDay(d), 0), 0)
    const mins = differenceInMinutes(d, dayStart)
    return Math.max(0, (mins / 60) * HOUR_HEIGHT)
  }

  function eventHeight(startIso: string, endIso: string | null | undefined): number {
    if (!endIso) return HOUR_HEIGHT // default 1h
    const mins = differenceInMinutes(parseISO(endIso), parseISO(startIso))
    return Math.max(24, (mins / 60) * HOUR_HEIGHT)
  }

  function fmt2(n: number) { return String(n).padStart(2, '0') }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden select-none">
      {/* ── Header figé ── */}
      <div className="flex shrink-0 border-b">
        <div className="w-14 shrink-0 border-r bg-muted/20" />
        {days.map((day) => {
          const isToday = isSameDay(day, new Date())
          const dateStr = format(day, 'yyyy-MM-dd')
          const isUnavailable = exceptions.some(ex => !ex.start_time && dateStr >= ex.start_date && dateStr <= ex.end_date)
          return (
            <div
              key={day.toISOString()}
              className={`flex-1 border-r last:border-r-0 h-10 flex flex-col items-center justify-center text-xs font-medium relative ${
                isUnavailable ? 'bg-muted/40' : isToday ? 'bg-primary/10' : ''
              }`}
            >
              <span className={isUnavailable ? 'text-muted-foreground/50' : isToday ? 'text-primary' : 'text-muted-foreground'}>
                {format(day, 'EEE', { locale: fr })}
              </span>
              <span className={`font-bold ${isUnavailable ? 'text-muted-foreground/50 line-through' : isToday ? 'text-primary' : ''}`}>
                {format(day, 'd')}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div ref={scrollRef} className="flex overflow-y-auto max-h-[calc(100vh-240px)]">
        {/* Axe horaire */}
        <div className="w-14 shrink-0 border-r bg-muted/20 relative" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <div
              key={h}
              className="absolute w-full border-t text-[11px] text-muted-foreground px-1 pt-0.5"
              style={{ top: h * HOUR_HEIGHT }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Colonnes de jours */}
        {days.map((day) => {
          const dayAppts = appointments.filter((a) =>
            isSameDay(parseISO(a.scheduled_at), day)
          )
          const layout = computeOverlapLayout(
            dayAppts.map((a) => ({ id: a.id, start: a.scheduled_at, end: a.ended_at }))
          )
          const ghost = dragSlot && isSameDay(dragSlot.date, day) ? dragSlot : null
          const dateStr = format(day, 'yyyy-MM-dd')
          const dayFullException = exceptions.find(ex => !ex.start_time && dateStr >= ex.start_date && dateStr <= ex.end_date)
          const partialExceptions = exceptions.filter(ex => ex.start_time && ex.end_time && dateStr >= ex.start_date && dateStr <= ex.end_date)

          return (
            <div
              key={day.toISOString()}
              className="flex-1 border-r last:border-r-0 relative cursor-crosshair"
              style={{ height: totalHeight }}
              onMouseDown={(e) => handleMouseDown(e, day)}
            >
              {/* Full-day unavailability overlay */}
              {dayFullException && (
                <div className="absolute inset-0 pointer-events-none z-10"
                  style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0,0,0,0.04) 6px, rgba(0,0,0,0.04) 12px)' }}>
                  <div className="absolute inset-0 bg-muted/25" />
                  {dayFullException.label && (
                    <span className="absolute top-1 left-0 right-0 text-center text-[10px] text-muted-foreground/70 font-medium truncate px-1">
                      {dayFullException.label}
                    </span>
                  )}
                </div>
              )}
              {/* Partial unavailability overlays */}
              {partialExceptions.map((ex) => {
                const startMins = ex.start_time ? parseInt(ex.start_time.split(':')[0]) * 60 + parseInt(ex.start_time.split(':')[1]) : 0
                const endMins   = ex.end_time   ? parseInt(ex.end_time.split(':')[0])   * 60 + parseInt(ex.end_time.split(':')[1])   : 24 * 60
                return (
                  <div
                    key={ex.id}
                    className="absolute left-0 right-0 pointer-events-none z-10"
                    style={{
                      top:    (startMins / 60) * HOUR_HEIGHT,
                      height: ((endMins - startMins) / 60) * HOUR_HEIGHT,
                      background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0,0,0,0.04) 6px, rgba(0,0,0,0.04) 12px)',
                    }}
                  >
                    <div className="absolute inset-0 bg-muted/25" />
                  </div>
                )
              })}
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-dashed border-muted"
                  style={{ top: h * HOUR_HEIGHT }}
                />
              ))}

              {/* Ghost block during drag */}
              {ghost && (
                <div
                  className="absolute inset-x-0.5 rounded bg-[#3B5BDB]/15 border border-[#3B5BDB]/50 border-dashed pointer-events-none z-10"
                  style={{
                    top:    (ghost.startMins / 60) * HOUR_HEIGHT,
                    height: Math.max(HOUR_HEIGHT / 4, ((ghost.endMins - ghost.startMins) / 60) * HOUR_HEIGHT),
                  }}
                >
                  <span className="text-[10px] font-semibold text-[#3B5BDB] px-1 pt-0.5 block leading-tight">
                    {fmt2(Math.floor(ghost.startMins / 60))}:{fmt2(ghost.startMins % 60)}
                    {' – '}
                    {fmt2(Math.floor(ghost.endMins / 60))}:{fmt2(ghost.endMins % 60)}
                  </span>
                </div>
              )}

              {dayAppts.map((appt) => {
                const isUnassigned = appt.client_id === null
                const { colIdx, totalCols } = layout.get(appt.id) ?? { colIdx: 0, totalCols: 1 }
                const pctW = 100 / totalCols
                return (
                  <button
                    key={appt.id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onSelect(appt)}
                    className={isUnassigned
                      ? 'absolute rounded text-[11px] text-left px-1.5 py-0.5 overflow-hidden leading-tight border bg-red-50 text-red-700 border-red-300 border-dashed'
                      : `absolute rounded text-[11px] text-left px-1.5 py-0.5 overflow-hidden leading-tight border ${apptColorClass(appt.status)}`
                    }
                    style={{
                      top:    eventTop(appt.scheduled_at),
                      height: eventHeight(appt.scheduled_at, appt.ended_at),
                      left:   `calc(${colIdx * pctW}% + 2px)`,
                      width:  `calc(${pctW}% - 4px)`,
                    }}
                  >
                    {isUnassigned ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1 align-middle shrink-0" />
                        <span className="font-semibold">{format(parseISO(appt.scheduled_at), 'HH:mm')}</span>{' '}
                        {appt.notes || 'Sans client'}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{format(parseISO(appt.scheduled_at), 'HH:mm')}</span>{' '}
                        {clientFullName(appt.client as Client)}
                        {appt.reminderStatus?.hasFailed && ' ⚠'}
                        {(appt.services?.length ?? 0) > 0 && (
                          <span className="block truncate opacity-80">{appt.services!.map((sv) => sv.name).join(' + ')}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
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
  const [appView, setAppView] = useState<AppView>('agenda')
  const [anchor, setAnchor] = useState<Date>(new Date())

  // ── Shared filter state (all views) ──────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [notifFilter,  setNotifFilter]  = useState<NotifFilter>('all')
  const [gotoDate,     setGotoDate]     = useState('')
  const [gotoOpen,     setGotoOpen]     = useState(false)
  const [listItems,             setListItems]             = useState<AppointmentListItem[]>([])
  const [listLoading,           setListLoading]           = useState(false)
  const [listSearch,            setListSearch]            = useState('')
  const [pastFrom,              setPastFrom]              = useState<string>(() => format(subDays(new Date(), 3), 'yyyy-MM-dd'))
  const [futureTo,              setFutureTo]              = useState<string>(() => format(addDays(new Date(), 60), 'yyyy-MM-dd'))
  const [loadingMorePast,       setLoadingMorePast]       = useState(false)
  const [loadingMoreFuture,     setLoadingMoreFuture]     = useState(false)
  const [hasMorePast,           setHasMorePast]           = useState(false)
  const [hasMoreFuture,         setHasMoreFuture]         = useState(false)
  const [isTodayVisible,        setIsTodayVisible]        = useState(true)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailApptMode, setDetailApptMode] = useState<DetailApptMode>('detail')
  const [rescheduleDate, setRescheduleDate]           = useState('')
  const [rescheduleHour, setRescheduleHour]           = useState('')
  const [rescheduleMinute, setRescheduleMinute]       = useState('00')
  const [rescheduleEndHour, setRescheduleEndHour]     = useState('')
  const [rescheduleEndMinute, setRescheduleEndMinute] = useState('00')
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false)
  // Services edited in "Modifier" mode (ids of the catalog)
  const [editServiceIds,       setEditServiceIds]       = useState<string[]>([])

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
  const [apptWhatsapp, setApptWhatsapp]   = useState(true)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const [calendarConnected, setCalendarConnected] = useState<{ google: boolean; microsoft: boolean }>({ google: false, microsoft: false })
  const [syncing, setSyncing] = useState(false)
  const [defaultDuration, setDefaultDuration] = useState<number | null>(null)

  // ── Slot browser (intégré dans le modal Nouveau RDV) ─────────────────────
  const [businessHours,    setBusinessHours]    = useState<BusinessHourRow[] | null>(null)
  const [hoursConfigured,  setHoursConfigured]  = useState<boolean>(true)
  const [slotHoursLoading, setSlotHoursLoading] = useState(false)
  const [selectedSlot,     setSelectedSlot]     = useState<SelectedSlot | null>(null)
  const [slotWeek,         setSlotWeek]         = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))

  // ── Service catalog (soins + cabines) ─────────────────────────────────────
  const [cabins,             setCabins]             = useState<Cabin[]>([])
  const [services,           setServices]           = useState<Service[]>([])
  const [currency,           setCurrency]           = useState('MAD')
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [apptCabinId,        setApptCabinId]        = useState('')   // RDV sans soin only
  const [rescheduleSlot,     setRescheduleSlot]     = useState<SelectedSlot | null>(null)
  // Gift cards of the selected appointment's client (detail dialog)
  const [clientGiftCards,    setClientGiftCards]    = useState<GiftCard[]>([])
  const [giftCardBusy,       setGiftCardBusy]       = useState<string | null>(null)
  const [rescheduleWeek,     setRescheduleWeek]     = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  // ── Inline hours editor ────────────────────────────────────────────────────
  const [hoursDialogOpen, setHoursDialogOpen] = useState(false)
  const [hoursForm,       setHoursForm]       = useState<BusinessHourRow[]>([])
  const [hoursSaving,     setHoursSaving]     = useState(false)

  // ── Availability exceptions ───────────────────────────────────────────────
  const [exceptionsOpen,    setExceptionsOpen]    = useState(false)
  const [exceptions,        setExceptions]        = useState<AvailabilityException[]>([])
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exTab,             setExTab]             = useState<'add' | 'list'>('add')
  // Form
  const [exType,      setExType]      = useState<'day' | 'period'>('day')
  const [exStartDate, setExStartDate] = useState('')
  const [exEndDate,   setExEndDate]   = useState('')
  const [exStartTime, setExStartTime] = useState('')
  const [exEndTime,   setExEndTime]   = useState('')
  const [editingExId, setEditingExId] = useState<string | null>(null)
  const [exSubmitting, setExSubmitting] = useState(false)
  // Conflict
  const [conflictAppts,     setConflictAppts]     = useState<Appointment[]>([])
  const [conflictOpen,      setConflictOpen]       = useState(false)
  const [pendingException,  setPendingException]   = useState<Record<string, string | null> | null>(null)
  // Delete confirm
  const [exDeleteConfirm, setExDeleteConfirm] = useState<string | null>(null)

  // ── Assign client to unassigned appointment ───────────────────────────────
  const [assignClientItem, setAssignClientItem] = useState<CustomerIndexItem | null>(null)
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  const { addOrUpdate } = useCustomerIndex()

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const todayRef          = useRef<HTMLDivElement>(null)
  const agendaRef         = useRef<HTMLDivElement>(null)
  const initialScrollDone = useRef(false)
  const needsScrollAdjust = useRef<{ prevHeight: number; prevTop: number } | null>(null)

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
    setApptWhatsapp(true)
    setApptGiftCardId(null)
    setCreateSubmitting(false)
    setSelectedSlot(null)
    setSlotWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setSelectedServiceIds([])
    setApptCabinId('')
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
    const indexItem = clientToIndexItem(created)
    addOrUpdate(indexItem)
    setCreateItem(indexItem)
    setCreateStep('details')
    setCreateSubmitting(false)
  }

  const handleStartHourChange = (h: string) => {
    setApptHour(h)
    const duration = defaultDuration ?? 60 // fallback to 1h if no default set
    const startMins = parseInt(h) * 60 + parseInt(apptMinute)
    const endMins   = startMins + duration
    setApptEndHour(String(Math.floor(endMins / 60) % 24).padStart(2, '0'))
    setApptEndMinute(String(endMins % 60).padStart(2, '0'))
  }

  const handleStartMinuteChange = (m: string) => {
    setApptMinute(m)
    if (defaultDuration !== null && apptHour) {
      const startMins = parseInt(apptHour) * 60 + parseInt(m)
      const endMins   = startMins + defaultDuration
      setApptEndHour(String(Math.floor(endMins / 60) % 24).padStart(2, '0'))
      setApptEndMinute(String(endMins % 60).padStart(2, '0'))
    }
  }

  const handleCreateAppt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createItem || !apptDate || !apptHour) return
    setCreateSubmitting(true)
    const scheduled_at = new Date(`${apptDate}T${apptHour}:${apptMinute}:00`).toISOString()
    const hasServices = selectedServiceIds.length > 0
    if (!hasServices && (!apptCabinId || !apptEndHour)) {
      toast.error('Choisissez un soin, ou une cabine et une heure de fin')
      setCreateSubmitting(false)
      return
    }
    let ended_at: string | null = null
    if (!hasServices && apptEndHour) {
      const startTotalMins = parseInt(apptHour) * 60 + parseInt(apptMinute)
      const endTotalMinsRaw = parseInt(apptEndHour) * 60 + parseInt(apptEndMinute)
      const endTotalMinsNorm = endTotalMinsRaw % (24 * 60)
      // Next day if raw end ≥ 24 h (e.g. "24:15" from slot picker) OR
      // normalized end is before start (e.g. "00:15" when start is "23:45")
      const overMidnight = endTotalMinsRaw >= 24 * 60 || endTotalMinsNorm < startTotalMins
      const endH = String(Math.floor(endTotalMinsNorm / 60)).padStart(2, '0')
      const endM = String(endTotalMinsNorm % 60).padStart(2, '0')
      const endDate = overMidnight ? format(addDays(parseISO(apptDate), 1), 'yyyy-MM-dd') : apptDate
      ended_at = new Date(`${endDate}T${endH}:${endM}:00`).toISOString()
    }
    await submitBooking('/api/appointments', 'POST', {
      client_id: createItem.id,
      scheduled_at,
      // With services, the server derives cabin + end from the catalog
      ...(hasServices
        ? { service_ids: selectedServiceIds }
        : { cabin_id: apptCabinId, ended_at }),
      notes: apptNotes || null,
      whatsapp_enabled: apptWhatsapp,
      gift_card_id: apptGiftCardId,
    }, () => {
      toast.success(t('appointments.toast.created'))
      setCreateOpen(false)
      fetchAppointments()
      if (appView === 'agenda') void fetchListItems()
    })
    setCreateSubmitting(false)
  }

  // ── Cabin conflicts: push following appointments back, or overlap ─────────
  // The first attempt has no resolution; on a 409 with conflict details the
  // merchant chooses, and the same request is sent again with her choice.
  const [conflictDialog, setConflictDialog] = useState<{
    info: CabinConflictInfo
    resolve: (resolution: ConflictResolution) => void
  } | null>(null)

  const submitBooking = async (
    url: string,
    method: 'POST' | 'PATCH',
    payload: Record<string, unknown>,
    onSuccess: (json: { data?: { shifted?: number } }) => void,
    resolution?: ConflictResolution,
  ): Promise<void> => {
    const json = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, ...(resolution ? { conflict_resolution: resolution } : {}) }),
    }).then((r) => r.json()).catch(() => ({ error: 'Erreur réseau' }))
    if (json.conflict && !resolution) {
      setConflictDialog({
        info: json.conflict as CabinConflictInfo,
        resolve: (r) => { void submitBooking(url, method, payload, onSuccess, r) },
      })
      return
    }
    if (json.error) { toast.error(json.error); return }
    onSuccess(json)
  }

  const fetchAppointments = useCallback(async () => {
    const res = await fetch('/api/appointments?all=true')
    const json = await res.json()
    setAppointments(json.data ?? [])
    setLoading(false)
  }, [])

  const syncCalendar = async () => {
    setSyncing(true)
    try {
      const syncs: Promise<Response>[] = []
      if (calendarConnected.google)    syncs.push(fetch('/api/calendar/google/sync',    { method: 'POST' }))
      if (calendarConnected.microsoft) syncs.push(fetch('/api/calendar/microsoft/sync', { method: 'POST' }))
      await Promise.all(syncs)
      toast.success('Calendrier synchronisé')
      fetchAppointments()
    } catch { toast.error('Erreur lors de la synchronisation') }
    finally { setSyncing(false) }
  }

  const handleAssignClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !assignClientItem) return
    setAssignSubmitting(true)
    const res = await fetch(`/api/appointments/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: assignClientItem.id }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      toast.success('Client assigné')
      setAssignClientItem(null)
      setDetailOpen(false)
      fetchAppointments()
      if (appView === 'agenda') void fetchListItems()
    }
    setAssignSubmitting(false)
  }

  // ── Availability exceptions ───────────────────────────────────────────────

  const fetchExceptions = useCallback(async () => {
    setExceptionsLoading(true)
    try {
      const res  = await fetch('/api/availability-exceptions')
      const json = await res.json()
      if (json.data) setExceptions(json.data)
    } catch {}
    setExceptionsLoading(false)
  }, [])

  const resetExForm = () => {
    setExType('day')
    setExStartDate('')
    setExEndDate('')
    setExStartTime('')
    setExEndTime('')
    setEditingExId(null)
    setExDeleteConfirm(null)
  }

  const startEditException = (ex: AvailabilityException) => {
    setEditingExId(ex.id)
    setExType(ex.start_date === ex.end_date ? 'day' : 'period')
    setExStartDate(ex.start_date)
    setExEndDate(ex.end_date)
    setExStartTime(ex.start_time ?? '')
    setExEndTime(ex.end_time ?? '')
    setExTab('add')
  }

  const saveException = async (payload: Record<string, string | null>) => {
    setExSubmitting(true)
    try {
      const url    = editingExId ? `/api/availability-exceptions/${editingExId}` : '/api/availability-exceptions'
      const method = editingExId ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success(editingExId ? 'Indisponibilité modifiée' : 'Indisponibilité ajoutée')
        await fetchExceptions()
        resetExForm()
        setExTab('list')
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
    setExSubmitting(false)
  }

  const handleExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveEnd = exType === 'day' ? exStartDate : exEndDate
    if (!exStartDate || (exType === 'period' && !exEndDate)) return

    const payload: Record<string, string | null> = {
      start_date: exStartDate,
      end_date:   effectiveEnd,
      start_time: exStartTime || null,
      end_time:   exEndTime   || null,
    }

    // Conflict check only on create
    if (!editingExId) {
      const conflicts = appointments.filter((a) => {
        if (a.deleted_at) return false
        const apptDate = format(parseISO(a.scheduled_at), 'yyyy-MM-dd')
        if (apptDate < exStartDate || apptDate > effectiveEnd) return false
        if (!payload.start_time || !payload.end_time) return true
        const aS   = differenceInMinutes(parseISO(a.scheduled_at), startOfDay(parseISO(a.scheduled_at)))
        const aE   = a.ended_at
          ? differenceInMinutes(parseISO(a.ended_at), startOfDay(parseISO(a.ended_at)))
          : aS + (defaultDuration ?? 60)
        const exS  = timeToMins(payload.start_time)
        const exE  = timeToMins(payload.end_time)
        return aS < exE && aE > exS
      })
      if (conflicts.length > 0) {
        setConflictAppts(conflicts)
        setPendingException(payload)
        setConflictOpen(true)
        return
      }
    }
    await saveException(payload)
  }

  const handleDeleteException = async (id: string) => {
    const res  = await fetch(`/api/availability-exceptions/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
    } else {
      toast.success('Indisponibilité supprimée')
      setExceptions((prev) => prev.filter((e) => e.id !== id))
      setExDeleteConfirm(null)
    }
  }

  const formatExceptionLabel = (ex: AvailabilityException) => {
    const parseD = (d: string) => new Date(`${d}T12:00:00`)
    if (ex.start_date === ex.end_date)
      return format(parseD(ex.start_date), 'EEEE d MMMM yyyy', { locale: fr })
    return `Du ${format(parseD(ex.start_date), 'd MMM', { locale: fr })} au ${format(parseD(ex.end_date), 'd MMMM yyyy', { locale: fr })}`
  }

  useEffect(() => {
    fetchAppointments()
    fetchExceptions()
    // Fetch loyalty program to decide whether to show amount modal on SHOW
    fetch('/api/loyalty/programs').then((r) => r.json()).then((j) => {
      if (j.data) setLoyaltyProgram(j.data as LoyaltyProgram)
    }).catch(() => {})
    // Fetch calendar connection status
    fetch('/api/calendar').then((r) => r.json()).then((j) => {
      if (j.data) {
        setCalendarConnected({
          google:    !!j.data.google,
          microsoft: !!j.data.microsoft,
        })
      }
    }).catch(() => {})
    // Service catalog (active services only) + currency for prices
    Promise.all([
      fetch('/api/cabins').then((r) => r.json()),
      fetch('/api/services?active=true').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ]).then(([cabinsJson, servicesJson, profileJson]) => {
      setCabins(cabinsJson.data ?? [])
      setServices(servicesJson.data ?? [])
      if (profileJson.data?.currency) setCurrency(profileJson.data.currency)
    }).catch(() => {})
    // Fetch default appointment duration
    fetch('/api/settings/appointment-notifications').then((r) => r.json()).then((j) => {
      if (j.data?.default_duration_minutes) setDefaultDuration(j.data.default_duration_minutes)
    }).catch(() => {})
  }, [fetchAppointments])

  // Fetch business hours when create dialog or reschedule opens (onOpenChange not triggered on programmatic open)
  useEffect(() => {
    if (!createOpen && detailApptMode !== 'reschedule') return
    if (businessHours && defaultDuration) return
    setSlotHoursLoading(true)
    Promise.all([
      !businessHours   ? fetch('/api/settings/hours').then(r => r.json())                      : Promise.resolve(null),
      !defaultDuration ? fetch('/api/settings/appointment-notifications').then(r => r.json()) : Promise.resolve(null),
    ]).then(([hoursJson, notifJson]) => {
      if (hoursJson?.data) {
        setBusinessHours(hoursJson.data)
        setHoursConfigured(hoursJson.configured !== false)
      }
      if (notifJson?.data?.default_duration_minutes) setDefaultDuration(notifJson.data.default_duration_minutes)
      setSlotHoursLoading(false)
    }).catch(() => setSlotHoursLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, detailApptMode])

  // Load the client's gift cards when an appointment detail opens
  const selectedClientId = detailOpen ? selected?.client_id ?? null : null
  useEffect(() => {
    if (!selectedClientId) return
    let cancelled = false
    fetch(`/api/gift-cards?recipient_id=${selectedClientId}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setClientGiftCards(j.data ?? []) })
      .catch(() => {})
    return () => { cancelled = true; setClientGiftCards([]) }
  }, [selectedClientId])

  // WhatsApp on/off for one appointment (cancels or reschedules its messages)
  const [whatsappSaving, setWhatsappSaving] = useState(false)
  const toggleAppointmentWhatsapp = async (appt: Appointment, enabled: boolean) => {
    setWhatsappSaving(true)
    const json = await fetch(`/api/appointments/${appt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsapp_enabled: enabled }),
    }).then((r) => r.json()).catch(() => ({ error: 'Erreur réseau' }))
    setWhatsappSaving(false)
    if (json.error) { toast.error(json.error); return }
    setSelected((prev) => (prev && prev.id === appt.id ? { ...prev, whatsapp_enabled: enabled } : prev))
    setAppointments((prev) => prev.map((a) => (a.id === appt.id ? { ...a, whatsapp_enabled: enabled } : a)))
    setListItems((prev) => prev.map((i) => (i.id === appt.id ? { ...i, whatsapp_enabled: enabled } : i)))
    toast.success(enabled ? 'Messages WhatsApp réactivés pour ce RDV' : 'Aucun message WhatsApp ne sera envoyé pour ce RDV')
  }

  // Gift card ↔ appointment from the detail dialog:
  //   use     → reserved for this RDV (consumed directly if the RDV is already "show")
  //   release → available again (and no longer consumed)
  const linkGiftCard = async (card: GiftCard, appt: Appointment | null) => {
    const payload = appt
      ? (appt.status === 'show' ? { consumed: true, appointment_id: appt.id } : { appointment_id: appt.id })
      : (card.consumed_at ? { consumed: false } : { appointment_id: null })
    setGiftCardBusy(card.id)
    const json = await fetch(`/api/gift-cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()).catch(() => ({ error: 'Erreur réseau' }))
    setGiftCardBusy(null)
    if (json.error) { toast.error(json.error); return }
    setClientGiftCards((prev) => prev.map((c) => (c.id === card.id ? json.data : c)))
    toast.success(appt ? `Carte ${card.code} utilisée pour ce RDV` : `Carte ${card.code} remise à disposition`)
  }

  // Link any card to the open appointment by its code (e.g. card offered to
  // someone other than the appointment's client)
  const [giftCodeInput, setGiftCodeInput] = useState('')
  const linkGiftCardByCode = async (appt: Appointment) => {
    const code = giftCodeInput.trim()
    if (!code) return
    setGiftCardBusy('code')
    const json = await fetch(`/api/gift-cards?status=active&code=${encodeURIComponent(code)}`)
      .then((r) => r.json()).catch(() => ({ data: [] }))
    setGiftCardBusy(null)
    const card = (json.data ?? [])[0] as GiftCard | undefined
    if (!card) { toast.error('Carte introuvable ou déjà consommée'); return }
    if (card.consumed_appointment_id && card.consumed_appointment_id !== appt.id) {
      toast.error(`La carte ${card.code} est déjà réservée pour un autre RDV`)
      return
    }
    setClientGiftCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card]))
    setGiftCodeInput('')
    await linkGiftCard(card, appt)
  }

  // ── Create dialog: gift cards of the chosen client ────────────────────────
  const [createGiftCards,  setCreateGiftCards]  = useState<GiftCard[]>([])
  const [apptGiftCardId,   setApptGiftCardId]   = useState<string | null>(null)
  const createClientId = createOpen ? createItem?.id ?? null : null
  useEffect(() => {
    if (!createClientId) return
    let cancelled = false
    fetch(`/api/gift-cards?recipient_id=${createClientId}&status=active`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        // Only cards not already reserved for another appointment
        const cards = ((j.data ?? []) as GiftCard[]).filter((c) => !c.consumed_appointment_id)
        setCreateGiftCards(cards)
        // Drop a card chosen for a previously selected client
        setApptGiftCardId((prev) => (prev && cards.some((c) => c.id === prev) ? prev : null))
      })
      .catch(() => {})
    return () => { cancelled = true; setCreateGiftCards([]) }
  }, [createClientId])

  // Choosing a card adds its service to the appointment (same-cabin rule:
  // a service from another cabin replaces the current selection)
  const chooseGiftCard = (card: GiftCard | null) => {
    setApptGiftCardId(card?.id ?? null)
    if (!card?.service_id) return
    const cardService = services.find((sv) => sv.id === card.service_id)
    setSelectedServiceIds((prev) => {
      if (prev.includes(card.service_id!)) return prev
      const prevCabin = services.find((sv) => sv.id === prev[0])?.cabin_id
      return cardService && prevCabin && prevCabin !== cardService.cabin_id ? [card.service_id!] : [...prev, card.service_id!]
    })
    setSelectedSlot(null)
  }

  // Open the create dialog from a gift card: /appointments?new=1&client=…&gift_card=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clientId = params.get('client')
    if (params.get('new') !== '1' || !clientId) return
    const giftCardId = params.get('gift_card')
    window.history.replaceState(null, '', '/appointments')
    Promise.all([
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
      giftCardId ? fetch(`/api/gift-cards?recipient_id=${clientId}&status=active`).then((r) => r.json()) : Promise.resolve(null),
    ]).then(([clientJson, cardsJson]) => {
      if (!clientJson.data) { toast.error('Client introuvable'); return }
      resetCreate()
      setCreateItem(clientToIndexItem(clientJson.data))
      setCreateStep('details')
      setCreateOpen(true)
      const card = ((cardsJson?.data ?? []) as GiftCard[]).find((c) => c.id === giftCardId)
      if (card) {
        setApptGiftCardId(card.id)
        if (card.service_id) setSelectedServiceIds([card.service_id])
      }
    }).catch(() => toast.error('Impossible d\'ouvrir la prise de RDV'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open detail or apply filter from URL param (e.g. from dashboard click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id     = params.get('id')
    const filter = params.get('filter')

    if (id && appointments.length > 0) {
      const found = appointments.find(a => a.id === id)
      if (found) {
        setSelected(found)
        setDetailOpen(true)
        window.history.replaceState(null, '', '/appointments')
      }
    } else if (filter) {
      if (filter === 'today') {
        setAppView('agenda')
      } else if (filter === 'tomorrow') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = tomorrow.toISOString().slice(0, 10)
        setAppView('agenda')
        setGotoDate(tomorrowStr)
      } else if (filter === 'no_show') {
        setAppView('agenda')
        setStatusFilter('no_show')
      }
      window.history.replaceState(null, '', '/appointments')
    }
  }, [appointments])

  // ── List fetch ───────────────────────────────────────────────────────────
  const fetchListItems = useCallback(async () => {
    setListLoading(true)
    const sp = new URLSearchParams({ mode: 'upcoming' })
    if (gotoDate) {
      const start = format(subDays(parseISO(gotoDate), 3), 'yyyy-MM-dd')
      const end   = format(addDays(parseISO(gotoDate), 7),  'yyyy-MM-dd')
      sp.set('from', start)
      sp.set('to', end)
      setPastFrom(start)
      setFutureTo(end)
      setHasMorePast(true)
      setHasMoreFuture(true)
    } else {
      const start = format(subDays(new Date(), 3), 'yyyy-MM-dd')
      const end   = format(addDays(new Date(), 60), 'yyyy-MM-dd')
      sp.set('from', start)
      sp.set('to', end)
      setPastFrom(start)
      setFutureTo(end)
      setHasMorePast(true)
      setHasMoreFuture(false)
    }
    initialScrollDone.current = false
    if (statusFilter !== 'all') sp.set('statusFilter', statusFilter)
    if (notifFilter !== 'all') sp.set('notifFilter', notifFilter)
    const res  = await fetch(`/api/appointments/list?${sp}`)
    const json = await res.json()
    setListItems(json.data ?? [])
    setListLoading(false)
  }, [gotoDate, statusFilter, notifFilter])

  useEffect(() => {
    if (appView === 'agenda') void fetchListItems()
  }, [appView, fetchListItems])

  // ── Lazy load more past appointments ──────────────────────────────────────
  const loadMorePast = useCallback(async () => {
    if (loadingMorePast || !hasMorePast) return
    setLoadingMorePast(true)
    const newEnd   = format(subDays(parseISO(pastFrom), 1), 'yyyy-MM-dd')
    const newStart = format(subDays(parseISO(pastFrom), 7), 'yyyy-MM-dd')
    const sp = new URLSearchParams({ mode: 'upcoming', from: newStart, to: newEnd })
    if (statusFilter !== 'all') sp.set('statusFilter', statusFilter)
    if (notifFilter !== 'all') sp.set('notifFilter', notifFilter)
    const res  = await fetch(`/api/appointments/list?${sp}`)
    const json = await res.json()
    const newItems: AppointmentListItem[] = json.data ?? []
    if (newItems.length > 0) {
      needsScrollAdjust.current = {
        prevHeight: agendaRef.current?.scrollHeight ?? 0,
        prevTop:    agendaRef.current?.scrollTop    ?? 0,
      }
      setListItems(prev => [...newItems, ...prev])
      setPastFrom(newStart)
    } else {
      setHasMorePast(false)
    }
    setLoadingMorePast(false)
  }, [pastFrom, loadingMorePast, hasMorePast, statusFilter, notifFilter])

  // ── Lazy load more future appointments ────────────────────────────────────
  const loadMoreFuture = useCallback(async () => {
    if (loadingMoreFuture || !hasMoreFuture) return
    setLoadingMoreFuture(true)
    const newStart = format(addDays(parseISO(futureTo), 1), 'yyyy-MM-dd')
    const newEnd   = format(addDays(parseISO(futureTo), 7), 'yyyy-MM-dd')
    const sp = new URLSearchParams({ mode: 'upcoming', from: newStart, to: newEnd })
    if (statusFilter !== 'all') sp.set('statusFilter', statusFilter)
    if (notifFilter !== 'all') sp.set('notifFilter', notifFilter)
    const res  = await fetch(`/api/appointments/list?${sp}`)
    const json = await res.json()
    const newItems: AppointmentListItem[] = json.data ?? []
    if (newItems.length > 0) {
      setListItems(prev => [...prev, ...newItems])
      setFutureTo(newEnd)
    } else {
      setHasMoreFuture(false)
    }
    setLoadingMoreFuture(false)
  }, [futureTo, loadingMoreFuture, hasMoreFuture, statusFilter, notifFilter])

  // Preserve scroll position when prepending past items (runs sync after render)
  useLayoutEffect(() => {
    const adj = needsScrollAdjust.current
    if (adj && agendaRef.current) {
      agendaRef.current.scrollTop = adj.prevTop + (agendaRef.current.scrollHeight - adj.prevHeight)
      needsScrollAdjust.current = null
    }
  })

  // Auto-scroll to target date (only when using "Aller à une date")
  useEffect(() => {
    if (!listLoading && listItems.length > 0 && !initialScrollDone.current) {
      const t = setTimeout(() => {
        const container = agendaRef.current
        if (!container) return
        if (gotoDate) {
          // Scroll to first day group at or after gotoDate
          const groups = Array.from(container.querySelectorAll<HTMLElement>('[data-datekey]'))
          const target = groups.find((el) => (el.dataset.datekey ?? '') >= gotoDate)
          if (target) {
            const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
            container.scrollTop += offset
          }
        } else {
          // On initial load: scroll to today's section
          const today = todayRef.current
          if (today) {
            const offset = today.getBoundingClientRect().top - container.getBoundingClientRect().top
            container.scrollTop += offset
          }
        }
        initialScrollDone.current = true
      }, 50)
      return () => clearTimeout(t)
    }
  }, [listLoading, listItems.length, gotoDate])

  // Track whether today's section is visible — shows "Aujourd'hui" button when not
  useEffect(() => {
    const container = agendaRef.current
    if (!container) return
    const check = () => {
      const today = todayRef.current
      if (!today) { setIsTodayVisible(false); return }
      const cRect = container.getBoundingClientRect()
      const tRect = today.getBoundingClientRect()
      setIsTodayVisible(tRect.bottom > cRect.top && tRect.top < cRect.bottom)
    }
    check()
    container.addEventListener('scroll', check, { passive: true })
    return () => container.removeEventListener('scroll', check)
  }, [listItems.length])

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigate(dir: 1 | -1) {
    setAnchor((d) => addDays(d, dir * 7))
  }

  function getDays(): Date[] {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }

  function navLabel(): string {
    if (appView === 'semaine') {
      const start = startOfWeek(anchor, { weekStartsOn: 1 })
      const end = endOfWeek(anchor, { weekStartsOn: 1 })
      return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
    }
    return format(anchor, 'MMMM yyyy', { locale: fr })
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  // Sum of the appointment's service prices (undefined when it has no services)
  const servicesTotalFor = (id: string): number | undefined => {
    const appt = appointments.find((a) => a.id === id)
    if (!appt?.services?.length) return undefined
    return appt.services.reduce((sum, sv) => sum + Number(sv.price), 0)
  }

  // Call this when clicking SHOW — opens modal if loyalty type = 'montant'
  // (amount pre-filled with the services total, editable)
  const markShow = (id: string) => {
    if (loyaltyProgram?.type === 'montant') {
      setPendingShowId(id)
      setShowAmount(servicesTotalFor(id)?.toString() ?? '')
      setAmountModalOpen(true)
    } else {
      doMarkShow(id, servicesTotalFor(id))
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
      if (appView === 'agenda') void fetchListItems()
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
      if (appView === 'agenda') void fetchListItems()
    }
  }

  // Inline show/no-show from agenda row — optimistic, no full refetch
  const markShowInline = (id: string) => {
    if (loyaltyProgram?.type === 'montant') {
      setPendingShowId(id)
      setShowAmount(servicesTotalFor(id)?.toString() ?? '')
      setAmountModalOpen(true)
      return
    }
    const amount = servicesTotalFor(id)
    const prev = listItems.find((i) => i.id === id)?.status
    setListItems((items) => items.map((i) => i.id === id ? { ...i, status: 'show' as const } : i))
    fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'show', ...(amount !== undefined ? { amount } : {}) }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          if (prev) setListItems((items) => items.map((i) => i.id === id ? { ...i, status: prev } : i))
          toast.error(json.error)
        } else {
          const pts = json.data?.pointsCredited
          toast.success(pts ? t('appointments.toast.showPts', { pts }) : t('appointments.toast.show'))
        }
      })
      .catch(() => {
        if (prev) setListItems((items) => items.map((i) => i.id === id ? { ...i, status: prev } : i))
      })
  }

  const markNoShowInline = (id: string) => {
    const prev = listItems.find((i) => i.id === id)?.status
    setListItems((items) => items.map((i) => i.id === id ? { ...i, status: 'no_show' as const } : i))
    fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'no_show' }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          if (prev) setListItems((items) => items.map((i) => i.id === id ? { ...i, status: prev } : i))
          toast.error(json.error)
        } else {
          toast.info(t('appointments.toast.noShow'))
        }
      })
      .catch(() => {
        if (prev) setListItems((items) => items.map((i) => i.id === id ? { ...i, status: prev } : i))
      })
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
      if (appView === 'agenda') void fetchListItems()
    }
  }

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !rescheduleDate || !rescheduleHour) return
    setRescheduleSubmitting(true)
    const scheduled_at = new Date(`${rescheduleDate}T${rescheduleHour}:${rescheduleMinute}:00`).toISOString()
    const ended_at = rescheduleEndHour
      ? new Date(`${rescheduleDate}T${rescheduleEndHour}:${rescheduleEndMinute}:00`).toISOString()
      : null
    await submitBooking(`/api/appointments/${selected.id}`, 'PATCH', {
      scheduled_at,
      ended_at,
      // Only when changed: the server re-snapshots services from the catalog
      ...(servicesChanged && editServiceIds.length > 0 ? { service_ids: editServiceIds } : {}),
    }, (json) => {
      const shifted = json.data?.shifted ?? 0
      toast.success(shifted > 0 ? `RDV modifié · ${shifted} RDV suivant${shifted > 1 ? 's' : ''} repoussé${shifted > 1 ? 's' : ''}` : 'RDV modifié')
      setDetailOpen(false)
      setDetailApptMode('detail')
      fetchAppointments()
      if (appView === 'agenda') void fetchListItems()
    })
    setRescheduleSubmitting(false)
  }

  const [deleteAppt, setDeleteAppt] = useState<Appointment | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Bulk selection
  const [mobileSelectMode, setMobileSelectMode] = useState(false)
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
      if (appView === 'agenda') void fetchListItems()
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

  const reminderErrorCount = appointments.filter((a) => a.reminderStatus?.hasFailed).length
  const upcomingCount = appointments.filter((a) => new Date(a.scheduled_at) >= new Date() && a.status !== 'reschedule_requested').length
  const rescheduleItems = appointments.filter((a) => a.status === 'reschedule_requested')
  const rescheduleCount = rescheduleItems.length
  const days = appView === 'semaine' ? getDays() : []

  const handleCreateSlot = (date: Date, startMins: number, endMins: number) => {
    resetCreate()
    setApptDate(format(date, 'yyyy-MM-dd'))
    setApptHour(String(Math.floor(startMins / 60)).padStart(2, '0'))
    setApptMinute(String(startMins % 60).padStart(2, '0'))
    setApptEndHour(String(Math.floor(endMins / 60)).padStart(2, '0'))
    setApptEndMinute(String(endMins % 60).padStart(2, '0'))
    setCreateOpen(true)
  }

  const handleSelectSlot = (slot: SelectedSlot) => {
    const endMins = slot.startMins + servicesDuration
    setApptDate(format(slot.date, 'yyyy-MM-dd'))
    setApptHour(String(Math.floor(slot.startMins / 60)).padStart(2, '0'))
    setApptMinute(String(slot.startMins % 60).padStart(2, '0'))
    setApptEndHour(String(Math.floor(endMins / 60)).padStart(2, '0'))
    setApptEndMinute(String(endMins % 60).padStart(2, '0'))
    setSelectedSlot(slot)
    // Don't change step — user stays on current step (search or details)
  }

  const handleSelectRescheduleSlot = (slot: SelectedSlot) => {
    const endMins = (slot.startMins + rescheduleDuration) % (24 * 60)
    setRescheduleDate(format(slot.date, 'yyyy-MM-dd'))
    setRescheduleHour(String(Math.floor(slot.startMins / 60)).padStart(2, '0'))
    setRescheduleMinute(String(slot.startMins % 60).padStart(2, '0'))
    setRescheduleEndHour(String(Math.floor(endMins / 60)).padStart(2, '0'))
    setRescheduleEndMinute(String(endMins % 60).padStart(2, '0'))
    setRescheduleSlot(slot)
  }

  // ── Future exceptions (useMemo) ─────────────────────────────────────────
  const futureExceptions = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    return [...exceptions]
      .filter((ex) => ex.end_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }, [exceptions])

  // ── Selected services (create dialog) ─────────────────────────────────
  const selectedServices = useMemo(() => {
    const byId = new Map(services.map((sv) => [sv.id, sv]))
    return selectedServiceIds.map((id) => byId.get(id)).filter((sv): sv is Service => !!sv)
  }, [services, selectedServiceIds])
  const servicesDuration = selectedServices.reduce((sum, sv) => sum + sv.duration_minutes, 0)
  const servicesCabinId  = selectedServices[0]?.cabin_id ?? null

  // End time shown when services are selected (derived, not editable)
  const derivedEndLabel = (() => {
    if (servicesDuration === 0 || !apptHour) return null
    const endMins = (parseInt(apptHour) * 60 + parseInt(apptMinute) + servicesDuration) % (24 * 60)
    return `${String(Math.floor(endMins / 60)).padStart(2, '0')}h${String(endMins % 60).padStart(2, '0')}`
  })()

  // ── Reschedule: duration + cabin of the selected appointment ───────────
  // Services chosen in "Modifier" mode, and whether they differ from the booked ones
  const originalServiceIds = useMemo(
    () => [...(selected?.services ?? [])].sort((a, b) => a.position - b.position)
      .map((sv) => sv.service_id).filter((sid): sid is string => !!sid),
    [selected],
  )
  const editServices = useMemo(() => {
    const byId = new Map(services.map((sv) => [sv.id, sv]))
    return editServiceIds.map((sid) => byId.get(sid)).filter((sv): sv is Service => !!sv)
  }, [services, editServiceIds])
  const servicesChanged = editServiceIds.join(',') !== originalServiceIds.join(',')

  const rescheduleDuration = (() => {
    if (!selected) return 60
    if (servicesChanged && editServices.length > 0) {
      return editServices.reduce((sum, sv) => sum + sv.duration_minutes, 0)
    }
    const fromServices = (selected.services ?? []).reduce((sum, sv) => sum + sv.duration_minutes, 0)
    if (fromServices > 0) return fromServices
    return selected.ended_at
      ? Math.max(15, differenceInMinutes(parseISO(selected.ended_at), parseISO(selected.scheduled_at)))
      : (defaultDuration ?? 60)
  })()

  const cabinName = (id: string | null | undefined) =>
    id ? cabins.find((c) => c.id === id)?.name ?? null : null

  const filteredListItems = (listSearch.trim()
    ? listItems.filter(item => item.client_name.toLowerCase().includes(listSearch.toLowerCase()))
    : listItems
  ).filter(item => item.status !== 'reschedule_requested')


  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] lg:h-dvh overflow-hidden">
      {/* ─── Section fixe (header, search, banners) ─────── */}
      <div className="shrink-0 px-3 md:px-6 pt-3 md:pt-6 space-y-3 md:space-y-4">
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
          <p className="text-sm text-muted-foreground">{upcomingCount} à venir</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm" onClick={() => { resetCreate(); setCreateOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />{t('appointments.newBtn')}
          </Button>
        </div>
      </div>

      {/* Search — agenda view only */}
      {appView === 'agenda' && (
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
            onClick={() => { setAppView('agenda'); setNotifFilter('failed_only') }}
          >
            Voir
          </button>
        </div>
      )}
      </div>

      {/* ─── Tabs card (prend la hauteur restante) ───────── */}
      <div className="flex-1 min-h-0 px-3 md:px-6 pb-3 md:pb-6 pt-3 md:pt-4 flex flex-col">
      <Tabs value={appView} onValueChange={(v) => { setAppView(v as AppView); setSelectedIds(new Set()); setMobileSelectMode(false) }} className="flex-1 min-h-0 flex flex-col gap-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden">

        {/* Mobile : vue selector + bouton Sélectionner */}
        <div className="shrink-0 md:hidden flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Select value={appView} onValueChange={(v) => { setAppView(v as AppView); setSelectedIds(new Set()); setMobileSelectMode(false) }}>
            <SelectTrigger className="flex-1 h-9 font-medium text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agenda">Agenda</SelectItem>
              <SelectItem value="semaine">Semaine</SelectItem>
              {rescheduleCount > 0 && (
                <SelectItem value="a_replanifier">🔴 À replanifier ({rescheduleCount})</SelectItem>
              )}
            </SelectContent>
          </Select>
          {appView === 'agenda' && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
              onClick={() => {
                if (mobileSelectMode) { setMobileSelectMode(false); setSelectedIds(new Set()) }
                else setMobileSelectMode(true)
              }}
            >
              {mobileSelectMode ? 'Annuler' : 'Sélectionner'}
            </button>
          )}
          <button
            onClick={() => { fetchExceptions(); setExceptionsOpen(true) }}
            className="h-10 w-10 flex items-center justify-center rounded-md border border-input bg-background shrink-0"
            title="Indisponibilités"
          >
            <CalendarX className="h-5 w-5 text-muted-foreground" />
          </button>
          {(calendarConnected.google || calendarConnected.microsoft) && (
            <button
              onClick={syncCalendar}
              disabled={syncing}
              className="h-10 w-10 flex items-center justify-center rounded-md border border-input bg-background shrink-0"
            >
              <RefreshCw className={`h-5 w-5 text-muted-foreground ${syncing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Desktop : onglets */}
        <TabsList className="shrink-0 hidden md:flex w-full justify-start border-b border-border bg-transparent h-auto p-0 rounded-none px-6 overflow-x-auto">
          <TabsTrigger
            value="agenda"
            className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none"
          >
            Agenda
          </TabsTrigger>
          <TabsTrigger
            value="semaine"
            className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none"
          >
            Semaine
          </TabsTrigger>
          {rescheduleCount > 0 && (
            <TabsTrigger
              value="a_replanifier"
              className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#ef4444] data-[state=active]:text-red-600 data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-red-500 bg-transparent shadow-none flex-none flex items-center gap-2"
            >
              À replanifier
              <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-red-500 text-white text-[11px] font-bold px-1.5">
                {rescheduleCount}
              </span>
            </TabsTrigger>
          )}
          <div className="ml-auto flex items-center gap-1 pr-3 py-2">
            <button
              onClick={() => { fetchExceptions(); setExceptionsOpen(true) }}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Indisponibilités"
            >
              <CalendarX className="h-5 w-5" />
            </button>
            {(calendarConnected.google || calendarConnected.microsoft) && (
              <button
                onClick={syncCalendar}
                disabled={syncing}
                className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                title="Synchroniser le calendrier"
              >
                <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </TabsList>

        {/* Filtres + navigation (communs à toutes les vues) */}
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 md:px-6 py-2.5 border-b border-border">
          {/* Mobile : filtre statut */}
          <div className="md:hidden w-full">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-full font-medium text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['all', 'upcoming', 'show', 'no_show', 'unassigned'] as StatusFilter[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {key === 'unassigned' ? 'Non assigné' : key === 'upcoming' ? 'Planifié' : t(`appointments.filters.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop : pills statut */}
          {(['all', 'upcoming', 'show', 'no_show', 'unassigned'] as StatusFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`hidden md:inline-flex rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                statusFilter === key
                  ? key === 'unassigned'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-primary text-primary-foreground border-primary'
                  : key === 'unassigned'
                    ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                    : 'border-border bg-background hover:bg-muted'
              }`}
            >
              {key === 'unassigned' ? 'Non assigné' : key === 'upcoming' ? 'Planifié' : t(`appointments.filters.${key}`)}
            </button>
          ))}

          {/* WhatsApp error toggle */}
          <button
            onClick={() => setNotifFilter(notifFilter === 'failed_only' ? 'all' : 'failed_only')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
              notifFilter === 'failed_only'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            {t('appointments.filters.errorWA')}
          </button>

          {/* Aller à une date — agenda uniquement */}
          {appView === 'agenda' && (
            <div className="ml-auto flex items-center gap-1.5">
              {!listLoading && !loading && !isTodayVisible && (
                <button
                  className="h-8 rounded-md px-3 text-xs font-medium bg-[#3B5BDB] text-white hover:bg-[#2F4BC7] transition-colors whitespace-nowrap"
                  onClick={() => {
                    const container = agendaRef.current
                    const today     = todayRef.current
                    if (container && today) {
                      const offset = today.getBoundingClientRect().top - container.getBoundingClientRect().top
                      container.scrollBy({ top: offset, behavior: 'smooth' })
                    } else {
                      // Today not in current list — reset to normal view
                      setGotoDate('')
                    }
                  }}
                >
                  Aujourd&apos;hui
                </button>
              )}
              <Popover open={gotoOpen} onOpenChange={setGotoOpen}>
                <PopoverTrigger asChild>
                  <button className="h-8 border border-input rounded-md px-2 text-xs text-muted-foreground bg-background whitespace-nowrap">
                    {gotoDate
                      ? format(parseISO(gotoDate), 'd MMM yyyy', { locale: fr })
                      : 'Aller à une date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarPicker
                    mode="single"
                    selected={gotoDate ? parseISO(gotoDate) : undefined}
                    locale={fr}
                    onSelect={(day) => {
                      if (day) setGotoDate(format(day, 'yyyy-MM-dd'))
                      setGotoOpen(false)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {gotoDate && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => setGotoDate('')}>✕</Button>
              )}
            </div>
          )}

          {/* Navigation — semaine uniquement */}
          {appView === 'semaine' && (
            <div className="ml-auto flex items-center gap-1">
              {!getDays().some(d => isSameDay(d, new Date())) && (
                <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
                  {t('appointments.todayBtn')}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[180px] text-center capitalize">
                {navLabel()}
              </span>
              <Button variant="ghost" size="sm" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* ── Agenda ─────────────────────────────────────────────────────── */}
        <TabsContent value="agenda" className="mt-0 flex-1 min-h-0">
          <div ref={agendaRef} className="h-full overflow-y-auto">
          {hasMorePast && (
            <div className="flex justify-center pt-3 pb-1 px-4">
              <button
                disabled={loadingMorePast}
                onClick={() => loadMorePast()}
                className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
              >
                {loadingMorePast ? 'Chargement...' : 'Voir plus'}
              </button>
            </div>
          )}
          <div className="space-y-4 p-4 md:p-6">
            {loading ? (
              <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
            ) : listLoading ? (
              <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
            ) : filteredListItems.length === 0 ? (
              <div className="rounded-lg border text-center py-16 text-muted-foreground text-sm">
                {listSearch.trim() ? t('common.noResults') : t('appointments.noAppointments')}
              </div>
            ) : (
            <div className="space-y-6">
              {groupByDay(filteredListItems).map(({ dateKey, label, items: dayItems }) => (
                <div key={dateKey} data-datekey={dateKey} ref={label === 'groupToday' ? todayRef : undefined}>
                  {/* En-tête de jour */}
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-base font-bold capitalize">
                      {label === 'groupToday'
                        ? `Aujourd'hui – ${format(parseISO(dateKey), 'd MMMM yyyy', { locale: fr })}`
                        : label === 'groupTomorrow'
                          ? `Demain – ${format(parseISO(dateKey), 'd MMMM yyyy', { locale: fr })}`
                          : label}
                    </h3>
                    <span className="inline-flex items-center text-[11px] font-semibold text-[#3B5BDB] bg-[#EDF2FF] rounded-full px-2.5 py-0.5 uppercase tracking-wide whitespace-nowrap">
                      {dayItems.length} RDV
                    </span>
                  </div>

                  {/* Lignes */}
                  <div className="border rounded-xl overflow-hidden divide-y bg-card">
                    {dayItems.map((item) => {
                      const duration = item.ended_at
                        ? differenceInMinutes(parseISO(item.ended_at), parseISO(item.scheduled_at))
                        : null
                      const isUnassigned = item.client_id === null
                      const isSelected = selectedIds.has(item.id)
                      const isApptPastOrToday = parseISO(item.scheduled_at) <= new Date(new Date().setHours(23, 59, 59, 999))
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-muted/30'}`}
                        >
                          {/* Checkbox */}
                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            {mobileSelectMode ? (
                              <div
                                className={`h-5 w-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors ${
                                  isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-muted-foreground/40'
                                }`}
                                onClick={() => toggleSelect(item.id)}
                              >
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                            ) : (
                              <input
                                type="checkbox"
                                className="hidden md:block h-4 w-4 rounded border-gray-300 cursor-pointer"
                                checked={isSelected}
                                onChange={() => toggleSelect(item.id)}
                              />
                            )}
                          </div>

                          {/* Heure + durée */}
                          <div
                            className="w-24 shrink-0 cursor-pointer"
                            onClick={() => {
                              if (mobileSelectMode) { toggleSelect(item.id); return }
                              const full = appointments.find((a) => a.id === item.id)
                              if (full) { setSelected(full); setDetailOpen(true) }
                            }}
                          >
                            <div className="text-sm font-semibold tabular-nums leading-tight">
                              {format(parseISO(item.scheduled_at), 'HH:mm')}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-medium tabular-nums">
                              {item.ended_at && format(parseISO(item.ended_at), 'HH:mm')}
                              {item.ended_at && duration !== null && ' · '}
                              {duration !== null && `${duration} min`}
                            </div>
                          </div>

                          {/* Nom + notes */}
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                              if (mobileSelectMode) { toggleSelect(item.id); return }
                              const full = appointments.find((a) => a.id === item.id)
                              if (full) { setSelected(full); setDetailOpen(true) }
                            }}
                          >
                            <p className="text-sm line-clamp-2 leading-snug">
                              <span className={`font-semibold${isUnassigned ? ' text-orange-700' : ''}`}>
                                {isUnassigned ? (item.client_name === '—' ? 'Sans client' : item.client_name) : item.client_name}
                              </span>
                              {!item.whatsapp_enabled && (
                                <BellOff className="inline h-3.5 w-3.5 ml-1.5 text-muted-foreground align-[-2px]" aria-label="WhatsApp désactivé" />
                              )}
                              {item.services.length > 0 && (
                                <span className="font-normal text-[#3B5BDB] ml-1.5">{item.services.map((sv) => sv.name).join(' + ')}</span>
                              )}
                              {cabinName(item.cabin_id) && (
                                <span className="font-normal text-muted-foreground ml-1.5">· {cabinName(item.cabin_id)}</span>
                              )}
                              {item.notes && (
                                <span className="font-normal text-muted-foreground ml-1.5">{item.notes}</span>
                              )}
                            </p>
                          </div>

                          {/* Badge statut */}
                          <div className="hidden sm:block shrink-0">
                            {isUnassigned ? (
                              <span className="inline-flex items-center text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-3 py-1">
                                Non assigné
                              </span>
                            ) : item.reminderStatus.hasFailed ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                <AlertTriangle className="h-3 w-3" />Erreur WA
                              </span>
                            ) : (
                              <span className={`inline-flex items-center text-xs font-medium rounded-full px-3 py-1 border ${
                                item.status === 'show'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : item.status === 'no_show'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : item.status === 'confirmed'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                {statusLabel(item.status, t)}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {isApptPastOrToday ? (
                              <>
                                {/* ✓ Présent */}
                                <button
                                  title={t('appointments.actions.present')}
                                  onClick={() => markShowInline(item.id)}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                    item.status === 'show'
                                      ? 'bg-green-500 shadow-sm'
                                      : 'bg-green-100 hover:bg-green-200'
                                  }`}
                                >
                                  <Check className={`h-5 w-5 ${item.status === 'show' ? 'text-white' : 'text-green-600'}`} />
                                </button>
                                {/* ✗ Absent */}
                                <button
                                  title={t('appointments.actions.absent')}
                                  onClick={() => markNoShowInline(item.id)}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                    item.status === 'no_show'
                                      ? 'bg-red-400 shadow-sm'
                                      : 'bg-red-100 hover:bg-red-200'
                                  }`}
                                >
                                  <X className={`h-5 w-5 ${item.status === 'no_show' ? 'text-white' : 'text-red-500'}`} />
                                </button>
                                {/* … menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      const full = appointments.find((a) => a.id === item.id)
                                      if (full) {
                                        const d = parseISO(full.scheduled_at)
                                        setRescheduleDate(format(d, 'yyyy-MM-dd'))
                                        setRescheduleHour(format(d, 'HH'))
                                        setRescheduleMinute(format(d, 'mm'))
                                        if (full.ended_at) {
                                          const e = parseISO(full.ended_at)
                                          setRescheduleEndHour(format(e, 'HH'))
                                          setRescheduleEndMinute(format(e, 'mm'))
                                        } else {
                                          setRescheduleEndHour('')
                                          setRescheduleEndMinute('00')
                                        }
                                        setSelected(full)
                                        setDetailApptMode('reschedule')
                                        setDetailOpen(true)
                                      }
                                    }}>
                                      <CalendarClock className="h-4 w-4 mr-2" />Replanifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      const full = appointments.find((a) => a.id === item.id)
                                      if (full) { setSelected(full); setDetailApptMode('detail'); setDetailOpen(true) }
                                    }}>
                                      <Pencil className="h-4 w-4 mr-2" />Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        const full = appointments.find((a) => a.id === item.id)
                                        if (full) setDeleteAppt(full)
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            ) : (
                              <>
                                {/* Replanifier */}
                                <button
                                  title="Replanifier"
                                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const full = appointments.find((a) => a.id === item.id)
                                    if (full) {
                                      const d = parseISO(full.scheduled_at)
                                      setRescheduleDate(format(d, 'yyyy-MM-dd'))
                                      setRescheduleHour(format(d, 'HH'))
                                      setRescheduleMinute(format(d, 'mm'))
                                      if (full.ended_at) {
                                        const e = parseISO(full.ended_at)
                                        setRescheduleEndHour(format(e, 'HH'))
                                        setRescheduleEndMinute(format(e, 'mm'))
                                      } else {
                                        setRescheduleEndHour('')
                                        setRescheduleEndMinute('00')
                                      }
                                      setSelected(full)
                                      setDetailApptMode('reschedule')
                                      setDetailOpen(true)
                                    }
                                  }}
                                >
                                  <CalendarClock className="h-4 w-4" />
                                </button>
                                {/* Modifier */}
                                <button
                                  title="Modifier"
                                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const full = appointments.find((a) => a.id === item.id)
                                    if (full) { setSelected(full); setDetailApptMode('detail'); setDetailOpen(true) }
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                {/* Supprimer */}
                                <button
                                  title="Supprimer"
                                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                                  onClick={() => {
                                    const full = appointments.find((a) => a.id === item.id)
                                    if (full) setDeleteAppt(full)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMoreFuture && !listLoading && !loading && (
            <div className="flex justify-center pt-1 pb-3 px-4">
              <button
                disabled={loadingMoreFuture}
                onClick={() => loadMoreFuture()}
                className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
              >
                {loadingMoreFuture ? 'Chargement...' : 'Voir plus'}
              </button>
            </div>
          )}
          </div>
          </div>
        </TabsContent>

        {/* ── Semaine ────────────────────────────────────────────────────── */}
        <TabsContent value="semaine" className="mt-0 flex-1 min-h-0 overflow-y-auto">
          <div className="overflow-x-auto p-4 md:p-6">
            {loading ? (
              <div className="text-muted-foreground text-sm py-8 text-center">{t('common.loading')}</div>
            ) : (
              <TimeGrid
                days={days}
                appointments={appointments.filter(a => a.status !== 'reschedule_requested')}
                onSelect={(a) => { setSelected(a); setDetailOpen(true) }}
                defaultDuration={defaultDuration ?? 60}
                onCreateSlot={handleCreateSlot}
                exceptions={exceptions}
              />
            )}
          </div>
        </TabsContent>

        {/* ── À replanifier ──────────────────────────────────────────────── */}
        <TabsContent value="a_replanifier" className="mt-0 flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 md:p-6 space-y-4 max-w-2xl">
            {rescheduleItems.length === 0 ? (
              <div className="rounded-lg border text-center py-16 text-muted-foreground text-sm">
                Aucun RDV à replanifier
              </div>
            ) : (
              rescheduleItems.map((appt) => {
                const previousDate = appt.stored_previous_date
                  ? format(new Date(`${appt.stored_previous_date}T12:00:00`), 'EEEE d MMMM yyyy', { locale: fr })
                  : appt.scheduled_at
                    ? format(parseISO(appt.scheduled_at), 'EEEE d MMMM yyyy', { locale: fr })
                    : '—'
                const previousTime = appt.stored_previous_time
                  ? appt.stored_previous_time.slice(0, 5)
                  : appt.scheduled_at
                    ? format(parseISO(appt.scheduled_at), 'HH:mm')
                    : '—'
                const requestedAt = appt.reschedule_requested_at
                  ? format(parseISO(appt.reschedule_requested_at), "d MMMM 'à' HH:mm", { locale: fr })
                  : '—'
                const clientName = appt.client
                  ? clientFullName(appt.client)
                  : '—'

                return (
                  <div key={appt.id} className="rounded-xl border bg-card p-4 space-y-3">
                    {/* Client + demande */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{clientName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Demande le {requestedAt}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 shrink-0">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                        À replanifier
                      </span>
                    </div>

                    {/* Ancienne date/heure */}
                    <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                        Ancien créneau
                      </p>
                      <p className="text-sm font-medium capitalize">{previousDate} · {previousTime}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white flex-1"
                        onClick={() => {
                          setSelected(appt)
                          setDetailApptMode('reschedule')
                          setRescheduleDate(format(parseISO(appt.scheduled_at), 'yyyy-MM-dd'))
                          setRescheduleHour(format(parseISO(appt.scheduled_at), 'HH'))
                          setRescheduleMinute(format(parseISO(appt.scheduled_at), 'mm'))
                          setRescheduleEndHour(appt.ended_at ? format(parseISO(appt.ended_at), 'HH') : '')
                          setRescheduleEndMinute(appt.ended_at ? format(parseISO(appt.ended_at), 'mm') : '00')
                          setDetailOpen(true)
                        }}
                      >
                        <CalendarClock className="h-4 w-4 mr-1.5" />
                        Replanifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => setDeleteAppt(appt)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>

      </Tabs>
      </div>

      {/* Create RDV dialog — with integrated slot browser */}
      <Dialog open={createOpen} onOpenChange={(o) => {
        if (!o) resetCreate()
        setCreateOpen(o)
      }}>
        <DialogContent
          className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0"
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (document.querySelector('[data-autocomplete-portal]')) e.preventDefault()
          }}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle>
              {createStep === 'new_client' ? t('appointments.form.newClientTitle') : t('appointments.form.newApptTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-y-auto md:overflow-hidden">
            {/* ── Colonne gauche : soins + créneaux de la semaine ─── */}
            <div className="flex flex-col md:w-96 shrink-0 border-b md:border-b-0 md:border-r bg-muted/20 md:overflow-y-auto">
              <div className="px-3 pt-3 pb-3 border-b border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-[#3B5BDB]" />
                    Soins
                  </p>
                  <a href="/settings/services" className="text-[11px] text-[#3B5BDB] hover:underline">Gérer</a>
                </div>
                <ServiceSelector
                  cabins={cabins}
                  services={services}
                  selectedIds={selectedServiceIds}
                  onChange={(ids) => { setSelectedServiceIds(ids); setSelectedSlot(null) }}
                  currency={currency}
                />
              </div>

              {/* Hours not configured banner */}
              {!slotHoursLoading && businessHours && !hoursConfigured && (
                <div className="px-3 py-2 border-b border-amber-200/60 bg-amber-50/20">
                  <button
                    onClick={() => { setHoursForm([...businessHours]); setHoursDialogOpen(true) }}
                    className="text-[11px] text-amber-700 hover:text-amber-900 flex items-center gap-1.5 w-full"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    Horaires non configurés — Définir mes horaires
                  </button>
                </div>
              )}

              <div className="p-3">
                {slotHoursLoading ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Chargement...</p>
                ) : !businessHours ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Configurez vos <a href="/settings/appointments" className="text-[#3B5BDB] underline" onClick={() => setCreateOpen(false)}>horaires d&apos;ouverture</a> pour voir les créneaux.
                  </p>
                ) : servicesDuration === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Choisissez un ou plusieurs soins pour voir les créneaux disponibles.
                  </p>
                ) : (
                  <WeekSlotGrid
                    weekStart={slotWeek}
                    onWeekChange={setSlotWeek}
                    businessHours={businessHours}
                    exceptions={exceptions}
                    appointments={appointments}
                    cabinId={servicesCabinId}
                    duration={servicesDuration}
                    selected={selectedSlot}
                    onSelect={handleSelectSlot}
                  />
                )}
              </div>
            </div>

            {/* ── Colonne droite : formulaire ─────────────────────────── */}
            <div className="flex-1 px-6 py-5 md:overflow-y-auto">

              {/* Step 1 — select client */}
              {createStep === 'search' && (
                <div className="mt-2 space-y-2">
                  <CustomerAutocomplete
                    autoFocus
                    onSelect={handleSelectCreateItem}
                    onCreateNew={handleGoToNewClient}
                    placeholder={t('appointments.form.searchPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => handleGoToNewClient()}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#3B5BDB] font-medium border border-border rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    Créer un nouveau client
                  </button>
                  {/* Show selected slot as hint */}
                  {selectedSlot && apptDate && apptHour && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-[#3B5BDB] bg-[#EDF2FF] rounded-md px-2.5 py-1.5">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>
                        Créneau : {format(parseISO(apptDate), 'EEE d MMM', { locale: fr })} · {apptHour}h{apptMinute} → {apptEndHour}h{apptEndMinute}
                      </span>
                    </div>
                  )}
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
                  {/* Gift cards of this client: choosing one adds its service */}
                  {createGiftCards.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900 px-3 py-2.5">
                      <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <Gift className="h-3.5 w-3.5" />
                        {createGiftCards.length === 1 ? 'Carte cadeau disponible' : `${createGiftCards.length} cartes cadeaux disponibles`}
                      </p>
                      {createGiftCards.map((c) => {
                        const chosen = apptGiftCardId === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => chooseGiftCard(chosen ? null : c)}
                            className={`w-full flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                              chosen ? 'border-rose-400 bg-white dark:bg-rose-950/40' : 'border-transparent hover:bg-white/70 dark:hover:bg-rose-950/30'
                            }`}
                          >
                            <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${chosen ? 'border-rose-500 bg-rose-500 text-white' : 'border-muted-foreground/40'}`}>
                              {chosen && <Check className="h-2.5 w-2.5" />}
                            </span>
                            <span className="flex-1">{c.service_name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                          </button>
                        )
                      })}
                      <p className="text-[11px] text-muted-foreground">La carte sera marquée consommée quand le RDV passera en « présent ».</p>
                    </div>
                  )}
                  {/* Pill — slot pre-selected from left panel */}
                  {selectedSlot && apptDate && apptHour && (
                    <div className="flex items-center gap-1.5 text-xs text-[#3B5BDB] bg-[#EDF2FF] rounded-md px-2.5 py-1.5">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>
                        Créneau sélectionné : {format(parseISO(apptDate), 'EEE d MMM', { locale: fr })} · {apptHour}h{apptMinute} → {apptEndHour}h{apptEndMinute}
                      </span>
                    </div>
                  )}
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
                          <Select value={apptMinute} onValueChange={handleStartMinuteChange}>
                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <span className="text-muted-foreground pb-2 text-sm">→</span>
                      {/* End time — derived from services, manual otherwise */}
                      {selectedServiceIds.length > 0 ? (
                        <div className="space-y-1">
                          <Label>Fin</Label>
                          <div className="h-9 flex items-center text-sm">
                            {derivedEndLabel ?? '—'}
                            <span className="ml-1.5 text-xs text-muted-foreground">({formatDuration(servicesDuration)})</span>
                          </div>
                        </div>
                      ) : (
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
                      )}
                    </div>
                    {/* RDV sans soin — cabin chosen manually */}
                    {selectedServiceIds.length === 0 && (
                      <div className="space-y-1">
                        <Label>Cabine <span className="text-xs text-gray-400 font-normal">(RDV sans soin)</span></Label>
                        <Select value={apptCabinId} onValueChange={setApptCabinId}>
                          <SelectTrigger><SelectValue placeholder="Choisir une cabine" /></SelectTrigger>
                          <SelectContent>
                            {cabins.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={apptWhatsapp}
                        onChange={(e) => setApptWhatsapp(e.target.checked)}
                      />
                      Envoyer les messages WhatsApp (rappels, après le RDV)
                    </label>
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

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Inline hours configuration dialog ──────────────────────────────── */}
      <Dialog open={hoursDialogOpen} onOpenChange={setHoursDialogOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Horaires d&apos;ouverture
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            {[...hoursForm].sort((a, b) => a.day_of_week - b.day_of_week).map((row) => (
              <div key={row.day_of_week} className="flex items-center gap-2">
                <span className="w-20 text-sm shrink-0">
                  {['','Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'][row.day_of_week]}
                </span>
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => setHoursForm(f => f.map(r => r.day_of_week === row.day_of_week ? { ...r, is_closed: !r.is_closed } : r))}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${!row.is_closed ? 'bg-[#3B5BDB]' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${!row.is_closed ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                {!row.is_closed ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="time"
                      value={row.slot1_start ?? '09:00'}
                      onChange={(e) => setHoursForm(f => f.map(r => r.day_of_week === row.day_of_week ? { ...r, slot1_start: e.target.value } : r))}
                      className="text-sm border border-border rounded px-1.5 py-0.5 bg-background flex-1 min-w-0"
                    />
                    <span className="text-muted-foreground text-xs">→</span>
                    <input
                      type="time"
                      value={row.slot1_end ?? '18:00'}
                      onChange={(e) => setHoursForm(f => f.map(r => r.day_of_week === row.day_of_week ? { ...r, slot1_end: e.target.value } : r))}
                      className="text-sm border border-border rounded px-1.5 py-0.5 bg-background flex-1 min-w-0"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Fermé</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pour ajouter une coupure déjeuner, allez dans Paramètres → Rendez-vous.
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setHoursDialogOpen(false)}>Annuler</Button>
            <Button
              size="sm"
              disabled={hoursSaving}
              onClick={async () => {
                setHoursSaving(true)
                const hours = hoursForm.map(r => ({
                  day_of_week: r.day_of_week,
                  is_closed: r.is_closed,
                  slot1_start: r.is_closed ? null : (r.slot1_start ?? '09:00'),
                  slot1_end:   r.is_closed ? null : (r.slot1_end   ?? '18:00'),
                  slot2_start: null,
                  slot2_end:   null,
                }))
                const res = await fetch('/api/settings/hours', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ hours }),
                })
                if (res.ok) {
                  setBusinessHours(hoursForm)
                  setHoursConfigured(true)
                  setHoursDialogOpen(false)
                }
                setHoursSaving(false)
              }}
            >
              {hoursSaving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) { setDetailApptMode('detail'); setAssignClientItem(null) } }}>
        <DialogContent aria-describedby={undefined} className={detailApptMode === 'reschedule' ? 'sm:max-w-xl max-h-[90vh] overflow-y-auto' : undefined}>
          <DialogHeader>
            <DialogTitle>
              {detailApptMode === 'reschedule' ? 'Modifier le RDV' : t('appointments.detail.title')}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            detailApptMode === 'reschedule' ? (
              <form onSubmit={handleReschedule} className="space-y-4 mt-2">
                {/* Services */}
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-[#3B5BDB]" />Soins
                  </p>
                  <ServiceSelector
                    cabins={cabins}
                    services={services}
                    selectedIds={editServiceIds}
                    onChange={(ids) => { setEditServiceIds(ids); setRescheduleSlot(null) }}
                    currency={currency}
                  />
                  {servicesChanged && editServiceIds.length === 0 && (
                    <p className="text-xs text-amber-600">Choisissez au moins un soin, ou annulez pour garder les soins actuels.</p>
                  )}
                </div>
                {businessHours && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Créneaux libres pour {formatDuration(rescheduleDuration)}
                      {cabinName(editServices[0]?.cabin_id ?? selected.cabin_id) ? ` · ${cabinName(editServices[0]?.cabin_id ?? selected.cabin_id)}` : ''}
                    </p>
                    <WeekSlotGrid
                      weekStart={rescheduleWeek}
                      onWeekChange={setRescheduleWeek}
                      businessHours={businessHours}
                      exceptions={exceptions}
                      appointments={appointments}
                      cabinId={(servicesChanged ? editServices[0]?.cabin_id : null) ?? selected.cabin_id ?? null}
                      duration={rescheduleDuration}
                      excludeAppointmentId={selected.id}
                      selected={rescheduleSlot}
                      onSelect={handleSelectRescheduleSlot}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>{t('appointments.form.dateLabel')}</Label>
                  <Input type="date" required value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)} />
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label>Début</Label>
                    <div className="flex items-center gap-1">
                      <Select value={rescheduleHour} onValueChange={setRescheduleHour}>
                        <SelectTrigger className="w-20"><SelectValue placeholder="hh" /></SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground font-medium">:</span>
                      <Select value={rescheduleMinute} onValueChange={setRescheduleMinute}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <span className="text-muted-foreground pb-2 text-sm">→</span>
                  {((selected.services?.length ?? 0) > 0 || (servicesChanged && editServiceIds.length > 0)) ? (
                    <div className="space-y-1">
                      <Label>Fin</Label>
                      <div className="h-9 flex items-center text-sm text-muted-foreground">
                        Calculée ({formatDuration(rescheduleDuration)})
                      </div>
                    </div>
                  ) : (
                  <div className="space-y-1">
                    <Label>Fin</Label>
                    <div className="flex items-center gap-1">
                      <Select value={rescheduleEndHour} onValueChange={setRescheduleEndHour}>
                        <SelectTrigger className="w-20"><SelectValue placeholder="hh" /></SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground font-medium">:</span>
                      <Select value={rescheduleEndMinute} onValueChange={setRescheduleEndMinute}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => setDetailApptMode('detail')}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={rescheduleSubmitting || !rescheduleDate || !rescheduleHour || (servicesChanged && editServiceIds.length === 0)}>
                    <CalendarClock className="h-4 w-4 mr-2" />
                    {rescheduleSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-muted-foreground">{t('appointments.detail.client')}</div>
                  <div className="font-medium">
                    {selected.client_id === null
                      ? <span className="text-red-600 inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />Sans client</span>
                      : clientFullName(selected.client as Client)
                    }
                  </div>
                  <div className="text-muted-foreground">{t('appointments.detail.date')}</div>
                  <div className="capitalize">
                    {format(parseISO(selected.scheduled_at), 'EEEE dd MMMM yyyy', { locale: fr })}
                  </div>
                  <div className="text-muted-foreground">{t('appointments.detail.time')}</div>
                  <div>
                    {format(parseISO(selected.scheduled_at), 'HH:mm')}
                    {selected.ended_at && (
                      <span className="text-muted-foreground"> → {format(parseISO(selected.ended_at), 'HH:mm')}</span>
                    )}
                  </div>
                  {(selected.services?.length ?? 0) > 0 && (
                    <>
                      <div className="text-muted-foreground">Soins</div>
                      <div className="space-y-0.5">
                        {selected.services!.map((sv) => (
                          <div key={sv.id}>
                            {sv.name}{' '}
                            <span className="text-xs text-muted-foreground">· {formatDuration(sv.duration_minutes)} · {Number(sv.price)} {currency}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {cabinName(selected.cabin_id) && (
                    <>
                      <div className="text-muted-foreground">Cabine</div>
                      <div>{cabinName(selected.cabin_id)}</div>
                    </>
                  )}
                  {selected.notes && (
                    <>
                      <div className="text-muted-foreground">{t('appointments.detail.notes')}</div>
                      <div>{selected.notes}</div>
                    </>
                  )}
                  {selected.client_id !== null && (
                    <>
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
                    </>
                  )}
                </div>

                {/* WhatsApp on/off for this appointment */}
                {selected.client_id !== null && (
                  <WhatsAppToggle
                    label="Messages WhatsApp"
                    description="Rappels et message après le RDV"
                    checked={selected.whatsapp_enabled !== false}
                    disabled={whatsappSaving}
                    lockedReason={(selected.client as Client | undefined)?.whatsapp_enabled === false
                      ? 'Désactivés pour ce client (fiche client)'
                      : null}
                    onChange={(v) => toggleAppointmentWhatsapp(selected, v)}
                  />
                )}

                {/* Gift cards: the one used for this RDV, or the client's available ones */}
                {(() => {
                  const used      = clientGiftCards.filter((c) => c.consumed_appointment_id === selected.id)
                  const available = clientGiftCards.filter((c) => !c.consumed_at && !c.consumed_appointment_id)
                  if (selected.client_id === null) return null
                  return (
                    <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900 px-3 py-2.5">
                      {used.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-sm">
                          <Gift className="h-4 w-4 text-rose-500 shrink-0" />
                          <span className="flex-1">
                            {c.consumed_at ? 'Réglé avec la carte cadeau' : 'Carte cadeau réservée pour ce RDV'}{' '}
                            <span className="font-mono text-xs">{c.code}</span> · {c.service_name}
                          </span>
                          <button
                            type="button"
                            disabled={giftCardBusy === c.id}
                            onClick={() => linkGiftCard(c, null)}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            Retirer
                          </button>
                        </div>
                      ))}
                      {used.length === 0 && available.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-sm">
                          <Gift className="h-4 w-4 text-rose-500 shrink-0" />
                          <span className="flex-1">
                            Carte cadeau disponible : {c.service_name} <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                          </span>
                          <Button
                            type="button" size="sm" variant="outline" className="h-7 text-xs"
                            disabled={giftCardBusy === c.id}
                            onClick={() => linkGiftCard(c, selected)}
                          >
                            Utiliser pour ce RDV
                          </Button>
                        </div>
                      ))}
                      {used.length === 0 && (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => { e.preventDefault(); void linkGiftCardByCode(selected) }}
                        >
                          {available.length === 0 && <Gift className="h-4 w-4 text-rose-500 shrink-0" />}
                          <Input
                            value={giftCodeInput}
                            onChange={(e) => setGiftCodeInput(e.target.value)}
                            placeholder="Lier une carte par son code (CC-…)"
                            className="h-7 text-xs flex-1"
                          />
                          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs"
                            disabled={!giftCodeInput.trim() || giftCardBusy === 'code'}>
                            Lier
                          </Button>
                        </form>
                      )}
                    </div>
                  )
                })()}

                {/* Unassigned appointment — assign client or delete */}
                {selected.client_id === null ? (
                  <div className="space-y-3 pt-1 border-t">
                    <p className="text-xs text-muted-foreground">Ce RDV a été importé depuis votre calendrier mais aucun client n&apos;a été identifié. Assignez un client ou supprimez-le.</p>
                    <form onSubmit={handleAssignClient} className="space-y-2">
                      {assignClientItem ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
                          <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm font-medium truncate">{assignClientItem.display_name}</span>
                          <button
                            type="button"
                            onClick={() => setAssignClientItem(null)}
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <CustomerAutocomplete
                          autoFocus
                          onSelect={(_, item) => setAssignClientItem(item)}
                          placeholder="Rechercher un client..."
                        />
                      )}
                      <Button type="submit" className="w-full" disabled={assignSubmitting || !assignClientItem}>
                        <UserCheck className="h-4 w-4 mr-2" />
                        {assignSubmitting ? 'Assignation...' : 'Assigner ce client'}
                      </Button>
                    </form>
                    <Button
                      variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive w-full"
                      onClick={() => setDeleteAppt(selected)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />{t('appointments.detail.deleteBtn')}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Reminder status (from scheduled_messages outbox) */}
                    {selected.reminderStatus && (
                      selected.reminderStatus.hasFailed ||
                      selected.reminderStatus.remindersScheduled.r1 ||
                      selected.reminderStatus.remindersScheduled.r2 ||
                      selected.reminderStatus.remindersScheduled.r3 ||
                      selected.reminderStatus.lastReminderSentAt ||
                      selected.reminderStatus.nextReminderAt
                    ) && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('appointments.remindersTitle')}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(['r1', 'r2', 'r3'] as const).map((slot) => (
                            selected.reminderStatus!.remindersScheduled[slot] && (
                              <span key={slot} className="text-[11px] font-semibold text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                                {slot.toUpperCase()}
                              </span>
                            )
                          ))}
                          {selected.reminderStatus.hasFailed && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />{t('appointments.failedWA')}
                            </span>
                          )}
                        </div>
                        {selected.reminderStatus.lastReminderSentAt && (
                          <p className="text-xs text-muted-foreground">
                            {t('appointments.detail.lastReminderSent')} {format(parseISO(selected.reminderStatus.lastReminderSentAt), 'dd MMM à HH:mm', { locale: fr })}
                          </p>
                        )}
                        {selected.reminderStatus.nextReminderAt && (
                          <p className="text-xs text-muted-foreground">
                            {t('appointments.detail.nextReminder')} {format(parseISO(selected.reminderStatus.nextReminderAt), 'dd MMM à HH:mm', { locale: fr })}
                          </p>
                        )}
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
                    <div className="pt-1 border-t space-y-1">
                      <Button
                        variant="outline" size="sm" className="w-full"
                        onClick={() => {
                          const d = parseISO(selected.scheduled_at)
                          setRescheduleDate(format(d, 'yyyy-MM-dd'))
                          setRescheduleHour(format(d, 'HH'))
                          setRescheduleMinute(format(d, 'mm'))
                          if (selected.ended_at) {
                            const e = parseISO(selected.ended_at)
                            setRescheduleEndHour(format(e, 'HH'))
                            setRescheduleEndMinute(format(e, 'mm'))
                          } else {
                            setRescheduleEndHour('')
                            setRescheduleEndMinute('00')
                          }
                          setRescheduleSlot(null)
                          setRescheduleWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
                          setEditServiceIds(originalServiceIds)
                          setDetailApptMode('reschedule')
                        }}
                      >
                        <CalendarClock className="h-3.5 w-3.5 mr-2" />Modifier
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive w-full"
                        onClick={() => setDeleteAppt(selected)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />{t('appointments.detail.deleteBtn')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Cabin conflict: push following appointments back, or overlap */}
      <Dialog open={!!conflictDialog} onOpenChange={(o) => { if (!o) setConflictDialog(null) }}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />Chevauchement dans la cabine
            </DialogTitle>
          </DialogHeader>
          {conflictDialog && (() => {
            const { info, resolve } = conflictDialog
            const hhmm = (iso: string) => format(parseISO(iso), 'HH:mm')
            const day  = (iso: string) => format(parseISO(iso), 'EEE d MMM', { locale: fr })
            return (
              <div className="space-y-4 mt-1">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Ce RDV déborde sur :</p>
                  {info.conflicts.map((c) => (
                    <div key={c.id} className="text-sm">
                      <span className="font-medium">{c.client_name}</span>
                      <span className="text-muted-foreground capitalize"> · {day(c.scheduled_at)} {hhmm(c.scheduled_at)} → {hhmm(c.ended_at)}</span>
                    </div>
                  ))}
                </div>

                {info.shifts && info.shifts.length > 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Repousser {info.shifts.length === 1 ? 'le RDV suivant' : `les ${info.shifts.length} RDV suivants`} :
                    </p>
                    {info.shifts.map((sh) => (
                      <div key={sh.id} className="text-sm flex items-center gap-2">
                        <span className="flex-1 truncate">{sh.client_name}</span>
                        <span className="tabular-nums text-muted-foreground line-through">{hhmm(sh.from)}</span>
                        <span className="tabular-nums font-medium">→ {hhmm(sh.to)}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Leurs rappels WhatsApp sont reprogrammés à la nouvelle heure. Vérifiez l&apos;heure de fermeture.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Impossible de repousser automatiquement : un RDV qui chevauche commence avant ou est déjà passé.
                  </p>
                )}

                <div className="grid gap-2">
                  {info.shifts && info.shifts.length > 0 && (
                    <Button onClick={() => { setConflictDialog(null); resolve('shift') }}>
                      Repousser {info.shifts.length === 1 ? 'le RDV suivant' : `les ${info.shifts.length} RDV suivants`}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { setConflictDialog(null); resolve('overlap') }}>
                    Laisser chevaucher (je gère)
                  </Button>
                  <Button variant="ghost" onClick={() => setConflictDialog(null)}>Annuler</Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete appointment confirm dialog */}
      <Dialog open={!!deleteAppt} onOpenChange={(o) => !o && setDeleteAppt(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
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
        <DialogContent aria-describedby={undefined} className="max-w-sm">
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
              {pendingShowId && servicesTotalFor(pendingShowId) !== undefined && (
                <p className="text-xs text-muted-foreground">Pré-rempli avec le prix des soins, modifiable.</p>
              )}
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

      {/* ── Bulk floating action bar (agenda view only) ─────────────────────── */}
      {appView === 'agenda' && selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-border rounded-xl shadow-lg px-4 py-2.5">
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
          <Button size="sm" variant="ghost" onClick={() => { setSelectedIds(new Set()); setMobileSelectMode(false) }}>Désélectionner</Button>
        </div>
      )}

      {/* ── Bulk delete confirm ────────────────────────────────────────────── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
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

      {/* ── Availability exceptions dialog ──────────────────────────────────── */}
      <Dialog open={exceptionsOpen} onOpenChange={(o) => { if (!o) resetExForm(); setExceptionsOpen(o) }}>
        <DialogContent className="sm:max-w-md min-h-[580px] max-h-[85vh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarX className="h-4 w-4 text-muted-foreground" />
              Indisponibilités
            </DialogTitle>
          </DialogHeader>

          <Tabs value={exTab} onValueChange={(v) => { setExTab(v as 'add' | 'list'); setExDeleteConfirm(null) }} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-6 mt-4 mb-1">
              <TabsTrigger value="add" className="flex-1">
                {editingExId ? 'Modifier' : 'Ajouter'}
              </TabsTrigger>
              <TabsTrigger value="list" className="flex-1">
                Programmées
                {futureExceptions.length > 0 && (
                  <span className="ml-1.5 bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium">
                    {futureExceptions.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Add / Edit tab ── */}
            <TabsContent value="add" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <form onSubmit={handleExceptionSubmit} className="space-y-5">
                {/* Type selector */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Type d&apos;indisponibilité</p>
                  <div className="flex gap-6">
                    {(['day', 'period'] as const).map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="exType"
                          value={type}
                          checked={exType === type}
                          onChange={() => { setExType(type); setExEndDate('') }}
                          className="accent-[#3B5BDB]"
                        />
                        <span className="text-sm">{type === 'day' ? 'Un jour' : 'Une période'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Date fields */}
                {exType === 'day' ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date</label>
                    <input
                      type="date"
                      value={exStartDate}
                      onChange={(e) => setExStartDate(e.target.value)}
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Date début</label>
                      <input
                        type="date"
                        value={exStartDate}
                        onChange={(e) => { setExStartDate(e.target.value); if (exEndDate && e.target.value > exEndDate) setExEndDate('') }}
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Date fin</label>
                      <input
                        type="date"
                        value={exEndDate}
                        min={exStartDate}
                        onChange={(e) => setExEndDate(e.target.value)}
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                )}

                {/* Time fields (optional) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">Horaires <span className="font-normal">(optionnel)</span></p>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Sans horaire : {exType === 'day' ? 'journée complète' : 'journées complètes'} bloquée{exType === 'period' ? 's' : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Heure début</label>
                      <input
                        type="time"
                        value={exStartTime}
                        onChange={(e) => setExStartTime(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Heure fin</label>
                      <input
                        type="time"
                        value={exEndTime}
                        min={exStartTime || undefined}
                        onChange={(e) => setExEndTime(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  {editingExId && (
                    <Button type="button" variant="outline" className="flex-1" onClick={() => { resetExForm(); setExTab('list') }}>
                      Annuler
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className="flex-1 bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white"
                    disabled={exSubmitting || !exStartDate || (exType === 'period' && !exEndDate)}
                  >
                    {exSubmitting ? 'Enregistrement...' : editingExId ? 'Enregistrer les modifications' : 'Ajouter l\'indisponibilité'}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* ── Scheduled list tab ── */}
            <TabsContent value="list" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              {exceptionsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Chargement...</p>
              ) : futureExceptions.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <CalendarX className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-muted-foreground">Aucune indisponibilité programmée.</p>
                  <Button variant="outline" size="sm" onClick={() => setExTab('add')}>Ajouter</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {futureExceptions.map((ex) => (
                    <div key={ex.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize leading-snug">{formatExceptionLabel(ex)}</p>
                          {ex.start_time && ex.end_time && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {ex.start_time.slice(0, 5)} – {ex.end_time.slice(0, 5)}
                            </p>
                          )}
                          {!ex.start_time && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ex.start_date === ex.end_date ? 'Journée complète' : 'Journées complètes'}
                            </p>
                          )}
                        </div>
                        {exDeleteConfirm !== ex.id && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => startEditException(ex)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setExDeleteConfirm(ex.id)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {exDeleteConfirm === ex.id && (
                        <div className="bg-red-50 rounded-md px-3 py-2 space-y-2">
                          <p className="text-xs text-red-700 font-medium">Rendre cette période disponible ?</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setExDeleteConfirm(null)}>
                              Annuler
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" onClick={() => handleDeleteException(ex.id)}>
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ── Conflict warning dialog ─────────────────────────────────────────── */}
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              RDV déjà planifiés
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">
              {conflictAppts.length} rendez-vous {conflictAppts.length > 1 ? 'sont' : 'est'} déjà planifié{conflictAppts.length > 1 ? 's' : ''} sur cette période.
              L&apos;indisponibilité sera créée sans annuler ces rendez-vous.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConflictOpen(false)
                  setExceptionsOpen(false)
                  setAppView('agenda')
                }}
              >
                Voir les RDV
              </Button>
              <Button
                className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white"
                onClick={async () => {
                  setConflictOpen(false)
                  if (pendingException) { await saveException(pendingException); setPendingException(null) }
                }}
              >
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  )
}
