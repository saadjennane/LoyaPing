'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Plus, Search, Check, Trash2, X, UserPlus, Gift, CalendarDays, CalendarPlus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import CustomerAutocomplete from '@/components/CustomerAutocomplete'
import PhoneInput from '@/components/PhoneInput'
import { clientToIndexItem, useCustomerIndex } from '@/lib/hooks/useCustomerIndex'
import type { Client, CustomerIndexItem, GiftCard, Service } from '@/lib/types'
import { formatDuration } from '@/lib/scheduling/slots'

type Filter = 'active' | 'consumed' | 'all'

type RecipientAppointment = {
  id: string
  scheduled_at: string
  status: string
  services: Array<{ name: string; position: number }>
}

const NO_APPOINTMENT = '__none__'

// Most recent appointment that already started (list is sorted newest first)
function lastStartedAppointment(appts: RecipientAppointment[]): RecipientAppointment | undefined {
  const now = Date.now()
  return appts.find((a) => new Date(a.scheduled_at).getTime() <= now && a.status !== 'no_show')
}

function apptLabel(a: { scheduled_at: string }): string {
  return format(parseISO(a.scheduled_at), "EEE d MMM yyyy 'à' HH'h'mm", { locale: fr })
}

function personName(p: GiftCard['buyer']): string {
  if (!p) return 'Client supprimé'
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
  return name || p.phone_number || 'Client sans nom'
}

// ─── Client picker (existing client or quick creation) ───────────────────────

function ClientPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: CustomerIndexItem | null
  onChange: (item: CustomerIndexItem | null) => void
}) {
  const { addOrUpdate } = useCustomerIndex()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone_number: '' })
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.first_name.trim() || !form.phone_number) return
    setSaving(true)
    const json = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then((r) => r.json())
    setSaving(false)
    if (json.error) { toast.error(json.error); return }
    const created: Client = json.data
    const item = clientToIndexItem(created)
    addOrUpdate(item)
    onChange(item)
    setCreating(false)
    setForm({ first_name: '', last_name: '', phone_number: '' })
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
          <span className="flex-1 text-sm font-medium truncate">{value.display_name}</span>
          {value.display_name !== value.phone && <span className="text-xs text-muted-foreground">{value.phone}</span>}
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground" aria-label="Changer">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : creating ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex gap-2">
            <Input autoFocus placeholder="Prénom" value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <Input placeholder="Nom" value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <PhoneInput value={form.phone_number} onChange={(v) => setForm({ ...form, phone_number: v })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>Annuler</Button>
            <Button type="button" size="sm" disabled={saving || !form.first_name.trim() || !form.phone_number} onClick={handleCreate}>
              {saving ? 'Création…' : 'Créer le client'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <CustomerAutocomplete
            onSelect={(_, item) => onChange(item)}
            onCreateNew={(phone) => { setForm({ first_name: '', last_name: '', phone_number: phone ?? '' }); setCreating(true) }}
            placeholder="Nom ou téléphone…"
          />
          <button type="button" onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-xs text-[#3B5BDB] hover:underline">
            <UserPlus className="h-3 w-3" />Nouveau client
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GiftCardsPage() {
  const [cards,    setCards]    = useState<GiftCard[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [currency, setCurrency] = useState('MAD')
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<Filter>('active')
  const [search,   setSearch]   = useState('')

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [buyer,      setBuyer]      = useState<CustomerIndexItem | null>(null)
  const [recipient,  setRecipient]  = useState<CustomerIndexItem | null>(null)
  const [serviceId,  setServiceId]  = useState('')
  const [amount,     setAmount]     = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const [deleteCard, setDeleteCard] = useState<GiftCard | null>(null)

  // Consume dialog: pick the appointment where the card was used
  const [consumeCard,    setConsumeCard]    = useState<GiftCard | null>(null)
  const [consumeAppts,   setConsumeAppts]   = useState<RecipientAppointment[]>([])
  const [consumeApptId,  setConsumeApptId]  = useState(NO_APPOINTMENT)
  const [consumeLoading, setConsumeLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/gift-cards').then((r) => r.json()),
      fetch('/api/services?active=true').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ]).then(([cardsJson, servicesJson, profileJson]) => {
      if (cancelled) return
      if (cardsJson.error) toast.error(cardsJson.error)
      setCards(cardsJson.data ?? [])
      setServices(servicesJson.data ?? [])
      if (profileJson.data?.currency) setCurrency(profileJson.data.currency)
    }).catch(() => {
      if (!cancelled) toast.error('Erreur de chargement')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => ({
    active:   cards.filter((c) => !c.consumed_at).length,
    consumed: cards.filter((c) => c.consumed_at).length,
    all:      cards.length,
  }), [cards])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cards
      .filter((c) => filter === 'all' || (filter === 'active' ? !c.consumed_at : !!c.consumed_at))
      .filter((c) => !q || [c.code, c.service_name, personName(c.buyer), personName(c.recipient), c.recipient?.phone_number ?? '', c.buyer?.phone_number ?? '']
        .some((v) => v.toLowerCase().includes(q)))
  }, [cards, filter, search])

  const resetCreate = () => {
    setBuyer(null); setRecipient(null); setServiceId(''); setAmount(''); setNotes(''); setSaving(false)
  }

  const handleServiceChange = (id: string) => {
    setServiceId(id)
    const service = services.find((s) => s.id === id)
    if (service) setAmount(String(service.price))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buyer || !recipient || !serviceId) return
    setSaving(true)
    const json = await fetch('/api/gift-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_client_id:     buyer.id,
        recipient_client_id: recipient.id,
        service_id:          serviceId,
        amount_paid:         amount,
        notes,
      }),
    }).then((r) => r.json())
    setSaving(false)
    if (json.error) { toast.error(json.error); return }
    setCards((prev) => [json.data, ...prev])
    setCreateOpen(false)
    resetCreate()
    toast.success(`Carte cadeau ${json.data.code} enregistrée`)
  }

  // Check clicked: unchecking is immediate; checking asks which appointment
  const handleCheck = async (card: GiftCard) => {
    if (card.consumed_at) { void setConsumed(card, false); return }
    if (!card.recipient_client_id) { void setConsumed(card, true); return }

    setConsumeCard(card)
    setConsumeAppts([])
    setConsumeApptId(NO_APPOINTMENT)
    setConsumeLoading(true)
    const json = await fetch(`/api/appointments?client_id=${card.recipient_client_id}`).then((r) => r.json()).catch(() => ({ data: [] }))
    const appts: RecipientAppointment[] = json.data ?? []
    setConsumeAppts(appts)
    // Preselect the reserved appointment, else the last one that started
    const reserved = card.consumed_appointment_id && appts.find((a) => a.id === card.consumed_appointment_id)
    setConsumeApptId(reserved ? reserved.id : lastStartedAppointment(appts)?.id ?? NO_APPOINTMENT)
    setConsumeLoading(false)
  }

  const setConsumed = async (card: GiftCard, consumed: boolean, appointmentId?: string) => {
    const previous = card.consumed_at
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, consumed_at: consumed ? new Date().toISOString() : null } : c)))
    const json = await fetch(`/api/gift-cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumed, ...(appointmentId ? { appointment_id: appointmentId } : {}) }),
    }).then((r) => r.json()).catch(() => ({ error: 'Erreur réseau' }))
    if (json.error) {
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, consumed_at: previous } : c)))
      toast.error(json.error)
      return
    }
    setCards((prev) => prev.map((c) => (c.id === card.id ? json.data : c)))
    if (consumed) {
      toast.success(`${card.code} marquée consommée`, {
        action: { label: 'Annuler', onClick: () => setConsumed({ ...card, consumed_at: json.data.consumed_at }, false) },
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteCard) return
    const json = await fetch(`/api/gift-cards/${deleteCard.id}`, { method: 'DELETE' }).then((r) => r.json())
    if (json.error) { toast.error(json.error); return }
    setCards((prev) => prev.filter((c) => c.id !== deleteCard.id))
    setDeleteCard(null)
    toast.success('Carte cadeau supprimée')
  }

  const selectedService = services.find((s) => s.id === serviceId)

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Cartes cadeaux</h2>
          <p className="text-sm text-muted-foreground">{counts.active} à consommer</p>
        </div>
        <Button className="bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shadow-sm" onClick={() => { resetCreate(); setCreateOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />Nouvelle carte
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border bg-card p-0.5 text-sm">
          {([
            ['active', 'À consommer'],
            ['consumed', 'Consommées'],
            ['all', 'Toutes'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md transition-colors ${filter === key ? 'bg-[#EEF2FF] text-[#3B5BDB] font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label} <span className="text-xs opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom, code, soin…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : visible.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <Gift className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {cards.length === 0 ? 'Aucune carte cadeau vendue pour l\'instant.' : 'Aucune carte ne correspond.'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {visible.map((card) => {
              const consumed = !!card.consumed_at
              return (
                <div key={card.id} className={`flex items-start gap-3 px-4 py-3 ${consumed ? 'bg-muted/20' : ''}`}>
                  {/* Consumed check */}
                  <button
                    onClick={() => handleCheck(card)}
                    title={consumed ? 'Marquer comme non consommée' : 'Marquer comme consommée'}
                    aria-pressed={consumed}
                    className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                      consumed ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/40 hover:border-green-500'
                    }`}
                  >
                    {consumed && <Check className="h-3.5 w-3.5" />}
                  </button>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${consumed ? 'line-through text-muted-foreground' : ''}`}>{card.service_name}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.code}</span>
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Pour</span> <span className="font-medium">{personName(card.recipient)}</span>
                      <span className="text-muted-foreground"> · offerte par </span>{personName(card.buyer)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendue le {format(parseISO(card.sold_at), 'd MMM yyyy', { locale: fr })} · {card.amount_paid} {currency}
                      {consumed && <> · <span className="text-green-700">consommée le {format(parseISO(card.consumed_at!), 'd MMM yyyy', { locale: fr })}</span></>}
                    </p>
                    {card.consumed_appointment ? (
                      <Link
                        href={`/appointments?id=${card.consumed_appointment.id}`}
                        className="inline-flex items-center gap-1 text-xs text-[#3B5BDB] hover:underline"
                      >
                        <CalendarDays className="h-3 w-3" />
                        {consumed ? 'RDV du ' : 'Réservée · RDV du '}{apptLabel(card.consumed_appointment)}
                      </Link>
                    ) : !consumed && card.recipient_client_id && (
                      <Link
                        href={`/appointments?new=1&client=${card.recipient_client_id}&gift_card=${card.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#3B5BDB] hover:underline"
                      >
                        <CalendarPlus className="h-3 w-3" />Prendre RDV
                      </Link>
                    )}
                    {card.notes && <p className="text-xs text-muted-foreground italic">{card.notes}</p>}
                  </div>

                  <button
                    onClick={() => setDeleteCard(card)}
                    className="mt-0.5 text-muted-foreground hover:text-destructive"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetCreate(); setCreateOpen(o) }}>
        <DialogContent
          aria-describedby={undefined}
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => { if (document.querySelector('[data-autocomplete-portal]')) e.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>Nouvelle carte cadeau</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <ClientPicker label="Offerte par" value={buyer} onChange={setBuyer} />
            <ClientPicker label="Pour" value={recipient} onChange={setRecipient} />
            <div className="space-y-1.5">
              <Label>Soin</Label>
              {services.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun soin configuré. <a href="/settings/services" className="text-[#3B5BDB] underline">Créer le catalogue</a>
                </p>
              ) : (
                <Select value={serviceId} onValueChange={handleServiceChange}>
                  <SelectTrigger><SelectValue placeholder="Choisir un soin" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {formatDuration(s.duration_minutes)} · {s.price} {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Montant payé ({currency})</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedService ? String(selectedService.price) : '0'} />
            </div>
            <div className="space-y-1.5">
              <Label>Note <span className="text-xs text-muted-foreground font-normal">(facultatif)</span></Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Message, occasion…" />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !buyer || !recipient || !serviceId}>
              {saving ? 'Enregistrement…' : 'Enregistrer la vente'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Consume: link the appointment */}
      <Dialog open={!!consumeCard} onOpenChange={(o) => { if (!o) setConsumeCard(null) }}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Carte utilisée lors de quel RDV ?</DialogTitle>
          </DialogHeader>
          {consumeCard && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                « {consumeCard.service_name} » pour {personName(consumeCard.recipient)} ({consumeCard.code})
              </p>
              {consumeLoading ? (
                <p className="text-sm text-muted-foreground">Chargement des RDV…</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {[{ id: NO_APPOINTMENT } as RecipientAppointment, ...consumeAppts].map((a) => {
                    const isNone = a.id === NO_APPOINTMENT
                    const selected = consumeApptId === a.id
                    const services = isNone ? '' : [...(a.services ?? [])].sort((x, y) => x.position - y.position).map((sv) => sv.name).join(' + ')
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setConsumeApptId(a.id)}
                        className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                          selected ? 'border-[#3B5BDB] bg-[#EEF2FF]' : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        {isNone ? (
                          <span className="text-muted-foreground">Sans RDV</span>
                        ) : (
                          <>
                            <span className="font-medium capitalize">{apptLabel(a)}</span>
                            {services && <span className="block text-xs text-muted-foreground">{services}</span>}
                          </>
                        )}
                      </button>
                    )
                  })}
                  {consumeAppts.length === 0 && (
                    <p className="text-xs text-muted-foreground px-1">Aucun RDV pour ce client.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setConsumeCard(null)}>Annuler</Button>
                <Button
                  disabled={consumeLoading}
                  onClick={() => {
                    const card = consumeCard
                    setConsumeCard(null)
                    void setConsumed(card, true, consumeApptId === NO_APPOINTMENT ? undefined : consumeApptId)
                  }}
                >
                  <Check className="h-4 w-4 mr-1.5" />Marquer consommée
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteCard} onOpenChange={(o) => { if (!o) setDeleteCard(null) }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette carte cadeau ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {deleteCard && <>« {deleteCard.service_name} » pour {personName(deleteCard.recipient)} ({deleteCard.code}).</>}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteCard(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
