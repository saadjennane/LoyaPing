'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Cabin, Service } from '@/lib/types'
import { formatDuration } from '@/lib/scheduling/slots'

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240]

type ServiceForm = {
  id:               string | null   // null = create
  cabin_id:         string
  name:             string
  price:            string
  duration_minutes: string
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}

export default function SettingsServicesPage() {
  const [cabins,   setCabins]   = useState<Cabin[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [currency, setCurrency] = useState('MAD')
  const [loading,  setLoading]  = useState(true)

  // Cabin rename / create
  const [editingCabinId,   setEditingCabinId]   = useState<string | null>(null)
  const [cabinNameDraft,   setCabinNameDraft]   = useState('')
  const [newCabinName,     setNewCabinName]     = useState('')
  const [addingCabin,      setAddingCabin]      = useState(false)

  // Service dialog
  const [serviceForm,   setServiceForm]   = useState<ServiceForm | null>(null)
  const [serviceSaving, setServiceSaving] = useState(false)
  const [deleteService, setDeleteService] = useState<Service | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/cabins').then((r) => r.json()),
      fetch('/api/services').then((r) => r.json()),
      fetch('/api/settings/profile').then((r) => r.json()),
    ]).then(([cabinsJson, servicesJson, profileJson]) => {
      if (cancelled) return
      if (cabinsJson.error)   toast.error(cabinsJson.error)
      if (servicesJson.error) toast.error(servicesJson.error)
      setCabins(cabinsJson.data ?? [])
      setServices(servicesJson.data ?? [])
      if (profileJson.data?.currency) setCurrency(profileJson.data.currency)
    }).catch(() => {
      if (!cancelled) toast.error('Erreur de chargement')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const servicesByCabin = useMemo(() => {
    const map = new Map<string, Service[]>()
    for (const s of services) map.set(s.cabin_id, [...(map.get(s.cabin_id) ?? []), s])
    return map
  }, [services])

  // ── Cabins ────────────────────────────────────────────────────────────────

  const handleAddCabin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCabinName.trim()) return
    const json = await fetch('/api/cabins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCabinName }),
    }).then((r) => r.json())
    if (json.error) { toast.error(json.error); return }
    setCabins((prev) => [...prev, json.data])
    setNewCabinName('')
    setAddingCabin(false)
    toast.success('Cabine ajoutée')
  }

  const handleRenameCabin = async (id: string) => {
    const json = await fetch(`/api/cabins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cabinNameDraft }),
    }).then((r) => r.json())
    if (json.error) { toast.error(json.error); return }
    setCabins((prev) => prev.map((c) => (c.id === id ? json.data : c)))
    setEditingCabinId(null)
  }

  const handleDeleteCabin = async (cabin: Cabin) => {
    const json = await fetch(`/api/cabins/${cabin.id}`, { method: 'DELETE' }).then((r) => r.json())
    if (json.error) { toast.error(json.error); return }
    setCabins((prev) => prev.filter((c) => c.id !== cabin.id))
    toast.success('Cabine supprimée')
  }

  // ── Services ──────────────────────────────────────────────────────────────

  const openCreateService = (cabinId: string) =>
    setServiceForm({ id: null, cabin_id: cabinId, name: '', price: '', duration_minutes: '60' })

  const openEditService = (s: Service) =>
    setServiceForm({
      id:               s.id,
      cabin_id:         s.cabin_id,
      name:             s.name,
      price:            String(s.price),
      duration_minutes: String(s.duration_minutes),
    })

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serviceForm) return
    setServiceSaving(true)
    const payload = {
      cabin_id:         serviceForm.cabin_id,
      name:             serviceForm.name,
      price:            serviceForm.price,
      duration_minutes: Number(serviceForm.duration_minutes),
    }
    const json = await fetch(serviceForm.id ? `/api/services/${serviceForm.id}` : '/api/services', {
      method: serviceForm.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json())
    setServiceSaving(false)
    if (json.error) { toast.error(json.error); return }
    setServices((prev) => serviceForm.id
      ? prev.map((s) => (s.id === serviceForm.id ? json.data : s))
      : [...prev, json.data])
    setServiceForm(null)
    toast.success(serviceForm.id ? 'Soin modifié' : 'Soin ajouté')
  }

  const handleToggleService = async (s: Service, isActive: boolean) => {
    setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: isActive } : x)))
    const json = await fetch(`/api/services/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    }).then((r) => r.json())
    if (json.error) {
      toast.error(json.error)
      setServices((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_active: !isActive } : x)))
    }
  }

  const handleDeleteService = async () => {
    if (!deleteService) return
    const json = await fetch(`/api/services/${deleteService.id}`, { method: 'DELETE' }).then((r) => r.json())
    if (json.error) { toast.error(json.error); return }
    setServices((prev) => prev.filter((s) => s.id !== deleteService.id))
    setDeleteService(null)
    toast.success('Soin supprimé')
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    )
  }

  // Duration options include the current value even if non-standard
  const durationOptions = serviceForm && !DURATION_OPTIONS.includes(Number(serviceForm.duration_minutes))
    ? [...DURATION_OPTIONS, Number(serviceForm.duration_minutes)].sort((a, b) => a - b)
    : DURATION_OPTIONS

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Soins & cabines</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Chaque soin appartient à une cabine. Sa durée inclut le temps de nettoyage : c&apos;est elle qui détermine les créneaux proposés à la prise de RDV.
        </p>
      </div>

      {cabins.map((cabin) => {
        const cabinServices = servicesByCabin.get(cabin.id) ?? []
        const isEditing = editingCabinId === cabin.id
        return (
          <div key={cabin.id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Cabin header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              {isEditing ? (
                <form
                  className="flex items-center gap-2 flex-1"
                  onSubmit={(e) => { e.preventDefault(); handleRenameCabin(cabin.id) }}
                >
                  <Input autoFocus className="h-8" value={cabinNameDraft} onChange={(e) => setCabinNameDraft(e.target.value)} />
                  <Button type="submit" size="icon" variant="ghost" className="h-8 w-8"><Check className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingCabinId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <h3 className="text-sm font-semibold flex-1">{cabin.name}</h3>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8" title="Renommer"
                    onClick={() => { setEditingCabinId(cabin.id); setCabinNameDraft(cabin.name) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Supprimer la cabine"
                    onClick={() => handleDeleteCabin(cabin)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>

            {/* Services */}
            <div className="divide-y">
              {cabinServices.length === 0 && (
                <p className="px-4 py-4 text-sm text-muted-foreground">Aucun soin dans cette cabine.</p>
              )}
              {cabinServices.map((s) => (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.is_active ? '' : 'opacity-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDuration(s.duration_minutes)} · {s.price} {currency}
                    </div>
                  </div>
                  <Toggle checked={s.is_active} onChange={(v) => handleToggleService(s, v)} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifier" onClick={() => openEditService(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Supprimer"
                    onClick={() => setDeleteService(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t">
              <Button size="sm" variant="ghost" className="text-[#3B5BDB] -ml-2" onClick={() => openCreateService(cabin.id)}>
                <Plus className="h-4 w-4 mr-1" />Ajouter un soin
              </Button>
            </div>
          </div>
        )
      })}

      {/* Add cabin */}
      {addingCabin ? (
        <form onSubmit={handleAddCabin} className="flex items-center gap-2">
          <Input autoFocus placeholder="Nom de la cabine" value={newCabinName} onChange={(e) => setNewCabinName(e.target.value)} />
          <Button type="submit" disabled={!newCabinName.trim()}>Ajouter</Button>
          <Button type="button" variant="ghost" onClick={() => { setAddingCabin(false); setNewCabinName('') }}>Annuler</Button>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setAddingCabin(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Ajouter une cabine
        </Button>
      )}

      {/* Create / edit service */}
      <Dialog open={!!serviceForm} onOpenChange={(o) => { if (!o) setServiceForm(null) }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{serviceForm?.id ? 'Modifier le soin' : 'Nouveau soin'}</DialogTitle>
          </DialogHeader>
          {serviceForm && (
            <form onSubmit={handleSaveService} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Nom</Label>
                <Input
                  autoFocus required placeholder="Soin visage hydratant"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Durée</Label>
                  <Select
                    value={serviceForm.duration_minutes}
                    onValueChange={(v) => setServiceForm({ ...serviceForm, duration_minutes: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((m) => (
                        <SelectItem key={m} value={String(m)}>{formatDuration(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prix ({currency})</Label>
                  <Input
                    type="number" min="0" step="0.01" required placeholder="0"
                    value={serviceForm.price}
                    onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cabine</Label>
                <Select
                  value={serviceForm.cabin_id}
                  onValueChange={(v) => setServiceForm({ ...serviceForm, cabin_id: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cabins.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">La durée inclut le temps de nettoyage de la cabine.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setServiceForm(null)}>Annuler</Button>
                <Button type="submit" disabled={serviceSaving}>
                  {serviceSaving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete service confirm */}
      <Dialog open={!!deleteService} onOpenChange={(o) => { if (!o) setDeleteService(null) }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer ce soin ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            « {deleteService?.name} » ne sera plus proposé. Les RDV déjà pris avec ce soin ne sont pas modifiés.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteService(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteService}>Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
