'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Trash2, RotateCcw, Package, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Order, Appointment, Client } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useI18n } from '@/lib/i18n/provider'

function clientFullName(c: Client | null | undefined): string {
  if (!c) return '—'
  const name = [c.civility, c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.phone_number
}

export default function TrashPage() {
  const { t } = useI18n()

  const [trashOrders, setTrashOrders] = useState<Order[]>([])
  const [trashAppts, setTrashAppts]   = useState<Appointment[]>([])
  const [loading, setLoading]         = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/trash')
    const json = await res.json()
    setTrashOrders(json.data?.orders ?? [])
    setTrashAppts(json.data?.appointments ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrash() }, [fetchTrash])

  const handleAction = async (action: 'restore' | 'delete', type: 'order' | 'appointment', id: string) => {
    const setter = action === 'restore' ? setRestoringId : setDeletingId
    setter(id)
    const res  = await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, type, id }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else {
      toast.success(action === 'restore' ? t('settings.toast.restored') : t('settings.toast.deletedPermanently'))
      fetchTrash()
    }
    setter(null)
  }

  const trashTotal = trashOrders.length + trashAppts.length

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Corbeille</h2>
        <p className="text-sm text-muted-foreground">Restaurez ou supprimez définitivement les éléments supprimés.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : trashTotal === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Trash2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">{t('settings.trashEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trashOrders.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {t('settings.deletedOrders')}
                  <Badge variant="outline" className="ml-auto">{trashOrders.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {trashOrders.map((order) => (
                  <div key={order.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">#{order.reference}</div>
                      <div className="text-xs text-muted-foreground">
                        {clientFullName(order.client as Client)} ·{' '}
                        {order.deleted_at ? `Supprimé ${format(parseISO(order.deleted_at), 'd MMM yyyy', { locale: fr })}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" disabled={restoringId === order.id} onClick={() => handleAction('restore', 'order', order.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {restoringId === order.id ? '...' : t('settings.restore')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deletingId === order.id} onClick={() => handleAction('delete', 'order', order.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {trashAppts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {t('settings.deletedAppts')}
                  <Badge variant="outline" className="ml-auto">{trashAppts.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {trashAppts.map((appt) => (
                  <div key={appt.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{format(parseISO(appt.scheduled_at), 'dd MMM yyyy à HH:mm', { locale: fr })}</div>
                      <div className="text-xs text-muted-foreground">
                        {clientFullName(appt.client as Client)} ·{' '}
                        {appt.deleted_at ? `Supprimé ${format(parseISO(appt.deleted_at), 'd MMM yyyy', { locale: fr })}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" disabled={restoringId === appt.id} onClick={() => handleAction('restore', 'appointment', appt.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {restoringId === appt.id ? '...' : t('settings.restore')}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={deletingId === appt.id} onClick={() => handleAction('delete', 'appointment', appt.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
