'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShoppingBag, Calendar, Ticket, Phone, AlertTriangle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetailRef =
  | { type: 'order'; id: string; clientName: string }
  | { type: 'appointment'; id: string; clientName: string }
  | { type: 'coupon'; id: string; clientName: string; rewardTitle: string | null; expiresAt: string | null }

type Props = {
  detail: DetailRef | null
  onClose: () => void
  onRefresh: () => void
}

type OrderDetail = {
  id: string
  reference: string | null
  status: 'pending' | 'ready' | 'completed'
  amount: number
  ready_at: string | null
  created_at: string
  reminders_count: number
  client: { first_name: string | null; last_name: string | null; phone_number: string } | null
}

type AppointmentDetail = {
  id: string
  scheduled_at: string
  status: 'scheduled' | 'show' | 'no_show'
  notes: string | null
  client: { first_name: string | null; last_name: string | null; phone_number: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function phone(client: { phone_number: string } | null | undefined): string | null {
  return client?.phone_number ?? null
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function expiresLabel(iso: string | null): string {
  if (!iso) return 'Sans expiration'
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0) return 'Expiré'
  if (diff === 0) return "Expire aujourd'hui"
  if (diff === 1) return 'Expire demain'
  if (diff <= 7) return `${diff} jours restants`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    ready:     'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    completed: 'bg-muted text-muted-foreground',
    scheduled: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
    show:      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    no_show:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    active:    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    used:      'bg-muted text-muted-foreground',
    expired:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  }
  const labels: Record<string, string> = {
    pending: 'En attente', ready: 'Prête', completed: 'Récupérée',
    scheduled: 'Prévu', show: 'Présent', no_show: 'Absent',
    active: 'Actif', used: 'Utilisé', expired: 'Expiré',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="space-y-3 py-2 animate-pulse">
      {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
    </div>
  )
}

// ── Order Panel ───────────────────────────────────────────────────────────────

function OrderPanel({ id, onClose, onRefresh }: { id: string; onClose: () => void; onRefresh: () => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setOrder(j.data ?? null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const doAction = async (action: 'ready' | 'picked_up' | 'pending') => {
    setSubmitting(true)
    try {
      let res: Response
      if (action === 'ready') {
        res = await fetch(`/api/orders/${id}/ready`, { method: 'PATCH' })
      } else {
        res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action }),
        })
      }
      const json = await res.json()
      if (json.error) { toast.error(json.error); return }
      const msg =
        action === 'ready'     ? 'Commande marquée prête !'
        : action === 'picked_up' ? 'Commande récupérée !'
        : 'Commande remise en attente.'
      toast.success(msg)
      onRefresh()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PanelSkeleton />
  if (!order) return <p className="text-sm text-muted-foreground py-4 text-center">Commande introuvable.</p>

  const clientPhone = phone(Array.isArray(order.client) ? order.client[0] : order.client)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={order.status} />
        {order.reference && <span className="text-xs text-muted-foreground">#{order.reference}</span>}
        {order.reminders_count >= 3 && (
          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />{order.reminders_count} rappels
          </span>
        )}
      </div>

      <div className="bg-muted/30 rounded-xl p-4 space-y-2.5">
        {clientPhone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{clientPhone}</span>
          </div>
        )}
        {order.amount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Montant</span>
            <span className="font-medium">{order.amount.toLocaleString('fr-FR')} €</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Créée le</span>
          <span>{formatDateTime(order.created_at)}</span>
        </div>
        {order.ready_at && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prête le</span>
            <span>{formatDateTime(order.ready_at)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {order.status === 'pending' && (
          <Button
            onClick={() => doAction('ready')}
            disabled={submitting}
            className="w-full bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white"
          >
            Marquer prête
          </Button>
        )}
        {order.status === 'ready' && (
          <>
            <Button onClick={() => doAction('picked_up')} disabled={submitting} className="w-full">
              Marquer récupérée
            </Button>
            <Button variant="outline" onClick={() => doAction('pending')} disabled={submitting} className="w-full">
              Remettre en attente
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Appointment Panel ─────────────────────────────────────────────────────────

function AppointmentPanel({ id, onClose, onRefresh }: { id: string; onClose: () => void; onRefresh: () => void }) {
  const [appt, setAppt] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/appointments/${id}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setAppt(j.data ?? null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const doAction = async (status: 'show' | 'no_show' | 'scheduled', force = false) => {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { status }
      if (force) body.force = true
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) { toast.error(json.error); return }
      const msg =
        status === 'show'      ? 'RDV marqué présent.'
        : status === 'no_show' ? 'RDV marqué absent.'
        : 'RDV remis en prévu.'
      toast.success(msg)
      onRefresh()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PanelSkeleton />
  if (!appt) return <p className="text-sm text-muted-foreground py-4 text-center">Rendez-vous introuvable.</p>

  const clientPhone = phone(Array.isArray(appt.client) ? appt.client[0] : appt.client)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge status={appt.status} />
      </div>

      <div className="bg-muted/30 rounded-xl p-4 space-y-2.5">
        {clientPhone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{clientPhone}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Date</span>
          <span className="font-medium capitalize">{formatDate(appt.scheduled_at)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Heure</span>
          <span className="font-medium">{formatTime(appt.scheduled_at)}</span>
        </div>
        {appt.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Notes : </span>
            <span>{appt.notes}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {appt.status === 'scheduled' && (
          <>
            <Button
              onClick={() => doAction('show')}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              Marquer présent
            </Button>
            <Button
              variant="outline"
              onClick={() => doAction('no_show')}
              disabled={submitting}
              className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              Marquer absent
            </Button>
          </>
        )}
        {appt.status === 'show' && (
          <>
            <Button
              variant="outline"
              onClick={() => doAction('no_show', true)}
              disabled={submitting}
              className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              Corriger : Absent
            </Button>
            <Button
              variant="outline"
              onClick={() => doAction('scheduled', true)}
              disabled={submitting}
              className="w-full"
            >
              Remettre en prévu
            </Button>
          </>
        )}
        {appt.status === 'no_show' && (
          <>
            <Button
              variant="outline"
              onClick={() => doAction('show', true)}
              disabled={submitting}
              className="w-full border-green-200 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
            >
              Corriger : Présent
            </Button>
            <Button
              variant="outline"
              onClick={() => doAction('scheduled', true)}
              disabled={submitting}
              className="w-full"
            >
              Remettre en prévu
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Coupon Panel ──────────────────────────────────────────────────────────────

function CouponPanel({
  id, rewardTitle, expiresAt, onClose, onRefresh,
}: {
  id: string
  rewardTitle: string | null
  expiresAt: string | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [mode, setMode] = useState<'detail' | 'extend' | 'delete'>('detail')
  const [extendDays, setExtendDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)

  const doExtend = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/loyalty/coupons/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], action: 'extend', extend_days: extendDays }),
      })
      const json = await res.json()
      if (json.error) { toast.error(json.error); return }
      toast.success('Coupon prolongé !')
      onRefresh()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const doDelete = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/loyalty/coupons/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      const json = await res.json()
      if (json.error) { toast.error(json.error); return }
      toast.success('Coupon supprimé.')
      onRefresh()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'extend') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Prolonger ce coupon de :</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={365}
            value={extendDays}
            onChange={(e) => setExtendDays(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 h-9 border border-border rounded-lg px-2 text-center text-sm bg-background"
          />
          <span className="text-sm text-muted-foreground">jours</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={() => setMode('detail')} disabled={submitting} className="w-full">
            Annuler
          </Button>
          <Button onClick={doExtend} disabled={submitting} className="w-full">
            Prolonger
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'delete') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Cette action est irréversible. Le coupon sera supprimé définitivement.</p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={() => setMode('detail')} disabled={submitting} className="w-full">
            Annuler
          </Button>
          <Button variant="destructive" onClick={doDelete} disabled={submitting} className="w-full">
            Supprimer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge status="active" />
      </div>

      <div className="bg-muted/30 rounded-xl p-4 space-y-2.5">
        {rewardTitle && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Récompense</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">{rewardTitle}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Expiration</span>
          <span>{expiresLabel(expiresAt)}</span>
        </div>
        {expiresAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span>{new Date(expiresAt).toLocaleDateString('fr-FR')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button variant="outline" onClick={() => { setExtendDays(7); setMode('extend') }} className="w-full">
          Prolonger
        </Button>
        <Button
          variant="outline"
          onClick={() => setMode('delete')}
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          Supprimer
        </Button>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function DashboardDetailPanel({ detail, onClose, onRefresh }: Props) {
  const typeConfig = {
    order:       { title: 'Commande',       Icon: ShoppingBag, iconBg: 'bg-orange-100 dark:bg-orange-950/50', iconColor: 'text-orange-600 dark:text-orange-400' },
    appointment: { title: 'Rendez-vous',    Icon: Calendar,    iconBg: 'bg-violet-100 dark:bg-violet-950/50', iconColor: 'text-violet-600 dark:text-violet-400' },
    coupon:      { title: 'Coupon fidélité', Icon: Ticket,      iconBg: 'bg-amber-100 dark:bg-amber-950/50',  iconColor: 'text-amber-600 dark:text-amber-400' },
  }

  const cfg = detail ? typeConfig[detail.type] : null

  return (
    <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2.5">
              {cfg && (
                <div className={`w-7 h-7 rounded-lg ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                  <cfg.Icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                </div>
              )}
              {cfg?.title}
            </div>
          </DialogTitle>
          {detail && (
            <DialogDescription className="text-sm font-medium text-foreground">
              {detail.clientName}
            </DialogDescription>
          )}
        </DialogHeader>

        {detail?.type === 'order' && (
          <OrderPanel id={detail.id} onClose={onClose} onRefresh={onRefresh} />
        )}
        {detail?.type === 'appointment' && (
          <AppointmentPanel id={detail.id} onClose={onClose} onRefresh={onRefresh} />
        )}
        {detail?.type === 'coupon' && (
          <CouponPanel
            id={detail.id}
            rewardTitle={detail.rewardTitle}
            expiresAt={detail.expiresAt}
            onClose={onClose}
            onRefresh={onRefresh}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
