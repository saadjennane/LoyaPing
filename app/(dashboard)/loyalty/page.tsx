'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Gift, Trash2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { LoyaltyProgram, LoyaltyTier } from '@/lib/types'

export default function LoyaltyPage() {
  const [program, setProgram] = useState<LoyaltyProgram | null>(null)
  const [tiers, setTiers] = useState<LoyaltyTier[]>([])
  const [loading, setLoading] = useState(true)

  // Program form
  const [progForm, setProgForm] = useState({ type: 'passage', currency: 'MAD', conversion_rate: '0.1' })
  const [savingProg, setSavingProg] = useState(false)

  // Tier form
  const [tierForm, setTierForm] = useState({ tier_order: '1', required_points: '', reward_description: '', validity_days: '30' })
  const [savingTier, setSavingTier] = useState(false)

  // Redeem dialog
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const fetchData = async () => {
    const [progRes, tiersRes] = await Promise.all([
      fetch('/api/loyalty/programs').then((r) => r.json()),
      fetch('/api/loyalty/tiers').then((r) => r.json()),
    ])
    setProgram(progRes.data)
    setTiers(tiersRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (program) {
      setProgForm({
        type: program.type,
        currency: program.currency ?? 'MAD',
        conversion_rate: String(program.conversion_rate ?? 0.1),
      })
    }
  }, [program])

  const saveProgram = async () => {
    setSavingProg(true)
    const res = await fetch('/api/loyalty/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: progForm.type,
        currency: progForm.type === 'montant' ? progForm.currency : null,
        conversion_rate: progForm.type === 'montant' ? parseFloat(progForm.conversion_rate) : null,
      }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else { toast.success('Programme enregistré'); fetchData() }
    setSavingProg(false)
  }

  const saveTier = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingTier(true)
    const res = await fetch('/api/loyalty/tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier_order: parseInt(tierForm.tier_order),
        required_points: parseInt(tierForm.required_points),
        reward_description: tierForm.reward_description,
        validity_days: parseInt(tierForm.validity_days),
      }),
    })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else { toast.success('Palier enregistré'); fetchData() }
    setSavingTier(false)
  }

  const deleteTier = async (id: string) => {
    const res = await fetch(`/api/loyalty/tiers?id=${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.error) toast.error(json.error)
    else { toast.success('Palier supprimé'); fetchData() }
  }

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
    }
    setRedeeming(false)
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Chargement...</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Programme Fidélité</h2>
          <p className="text-sm text-gray-500">Configuration et paliers</p>
        </div>
        <Button variant="outline" onClick={() => setRedeemOpen(true)}>
          <QrCode className="h-4 w-4 mr-2" />
          Valider un coupon
        </Button>
      </div>

      <Tabs defaultValue="program">
        <TabsList className="w-full flex justify-start border-b border-slate-100 bg-transparent h-auto p-0 rounded-none px-2 md:px-6 overflow-x-auto">
          <TabsTrigger value="program" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">Programme</TabsTrigger>
          <TabsTrigger value="tiers" className="rounded-none px-6 py-7 text-base font-medium text-muted-foreground data-[state=active]:shadow-[inset_0_-3px_0_#3B5BDB] data-[state=active]:text-[#3B5BDB] data-[state=active]:font-bold data-[state=active]:bg-transparent hover:text-[#3B5BDB] bg-transparent shadow-none flex-none gap-2">Paliers ({tiers.length}/5)</TabsTrigger>
        </TabsList>

        <TabsContent value="program" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration du programme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Type de fidélité</Label>
                <Select value={progForm.type} onValueChange={(v) => setProgForm({ ...progForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passage">Par passage (1 pt / visite)</SelectItem>
                    <SelectItem value="montant">Par montant dépensé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {progForm.type === 'montant' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Devise</Label>
                    <Input
                      value={progForm.currency}
                      onChange={(e) => setProgForm({ ...progForm, currency: e.target.value })}
                      placeholder="MAD"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Taux (pts par unité)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={progForm.conversion_rate}
                      onChange={(e) => setProgForm({ ...progForm, conversion_rate: e.target.value })}
                      placeholder="0.1"
                    />
                    <p className="text-xs text-gray-400">Ex: 0.1 = 1 pt par 10 MAD</p>
                  </div>
                </div>
              )}

              <Button onClick={saveProgram} disabled={savingProg}>
                {savingProg ? 'Enregistrement...' : 'Enregistrer'}
              </Button>

              {program && (
                <div className="flex items-center gap-2 pt-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Actif</Badge>
                  <span className="text-sm text-gray-500">
                    {program.type === 'passage' ? '1 point par passage' : `${program.conversion_rate} pts par ${program.currency}`}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers" className="space-y-4 mt-4">
          {/* Add/edit tier */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajouter / modifier un palier</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveTier} className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Palier (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={tierForm.tier_order}
                    onChange={(e) => setTierForm({ ...tierForm, tier_order: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Points requis</Label>
                  <Input
                    type="number"
                    min="1"
                    value={tierForm.required_points}
                    onChange={(e) => setTierForm({ ...tierForm, required_points: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Récompense</Label>
                  <Input
                    placeholder="Ex: Café offert, -20% sur votre prochain achat..."
                    value={tierForm.reward_description}
                    onChange={(e) => setTierForm({ ...tierForm, reward_description: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Validité (jours)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={tierForm.validity_days}
                    onChange={(e) => setTierForm({ ...tierForm, validity_days: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full" disabled={savingTier}>
                    <Plus className="h-4 w-4 mr-1" />
                    {savingTier ? 'Enregistrement...' : 'Enregistrer le palier'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Tier list */}
          {tiers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Aucun palier configuré
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tiers.map((tier) => (
                <Card key={tier.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center">
                        {tier.tier_order}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{tier.reward_description}</div>
                        <div className="text-xs text-gray-400">
                          {tier.required_points} pts · valide {tier.validity_days}j
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400 hover:text-red-600"
                      onClick={() => deleteTier(tier.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Redeem dialog */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider un coupon</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRedeem} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Code à 6 chiffres</Label>
              <Input
                placeholder="123456"
                maxLength={6}
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl font-mono tracking-widest"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={redeeming}>
              {redeeming ? 'Validation...' : 'Valider'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
