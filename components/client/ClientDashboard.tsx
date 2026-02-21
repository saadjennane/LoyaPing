'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Gift, Calendar, Package, Star, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import type { ClientPageData, Coupon } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import QRCodeComponent from '@/components/client/QRCodeDisplay'

export default function ClientDashboard({ data }: { data: ClientPageData }) {
  const { client, business, program, tiers, coupons, appointments, orders } = data
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null)
  const [redemptionCode, setRedemptionCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const getProgressToNextTier = () => {
    if (!program || tiers.length === 0) return null
    const nextTier = tiers.find((t) => t.required_points > client.current_cycle_points)
    if (!nextTier) return { progress: 100, label: 'Cycle complété !', tier: tiers[tiers.length - 1] }
    const progress = Math.min((client.current_cycle_points / nextTier.required_points) * 100, 100)
    return { progress, label: nextTier.reward_description, tier: nextTier }
  }

  const progressInfo = getProgressToNextTier()

  const handleUseCoupon = async (coupon: Coupon) => {
    setActiveCoupon(coupon)
    setRedemptionCode(null)
    setLoading(true)

    const res = await fetch('/api/loyalty/coupons/generate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupon_id: coupon.id }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error(json.error)
      setActiveCoupon(null)
    } else {
      setRedemptionCode(json.data.code)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="text-center py-4">
          <h1 className="text-2xl font-bold text-indigo-600">{business.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Votre espace personnel</p>
        </div>

        {/* Loyalty progress */}
        {program && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Fidélité
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{client.current_cycle_points} pts</span>
                {progressInfo && (
                  <span className="text-gray-500">
                    {progressInfo.progress < 100
                      ? `${progressInfo.tier?.required_points} pts → ${progressInfo.label}`
                      : 'Cycle complété !'}
                  </span>
                )}
              </div>

              {progressInfo && (
                <Progress value={progressInfo.progress} className="h-2" />
              )}

              {tiers.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-gray-400 mb-2">Paliers</p>
                  <div className="space-y-1">
                    {tiers.map((tier) => {
                      const reached = client.current_cycle_points >= tier.required_points
                      return (
                        <div
                          key={tier.id}
                          className={`flex items-center gap-2 text-xs py-1 ${reached ? 'text-green-700' : 'text-gray-400'}`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${reached ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                            {reached && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span>{tier.required_points} pts — {tier.reward_description}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400 pt-1">
                {client.total_cycles_completed} cycle{client.total_cycles_completed !== 1 ? 's' : ''} complété{client.total_cycles_completed !== 1 ? 's' : ''}
                {' · '}
                {client.loyalty_points} pts au total
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active coupons */}
        {coupons.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="h-4 w-4 text-purple-500" />
                Vos récompenses ({coupons.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {coupons.map((coupon) => (
                <div key={coupon.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">
                      {coupon.tier?.reward_description ?? 'Récompense'}
                    </div>
                    <div className="text-xs text-gray-400">
                      Expire le {format(new Date(coupon.expires_at), 'dd MMM yyyy', { locale: fr })}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleUseCoupon(coupon)}>
                    Utiliser
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Upcoming appointments */}
        {appointments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                Rendez-vous à venir
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {appointments.map((appt) => (
                <div key={appt.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">
                      {format(new Date(appt.scheduled_at), 'EEEE dd MMM à HH:mm', { locale: fr })}
                    </div>
                    {appt.notes && (
                      <div className="text-xs text-gray-400">{appt.notes}</div>
                    )}
                  </div>
                  <Badge variant="secondary">Confirmé</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Pending orders */}
        {orders.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-500" />
                Commandes en cours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">#{order.reference}</div>
                    {order.amount > 0 && (
                      <div className="text-xs text-gray-400">{order.amount} MAD</div>
                    )}
                  </div>
                  {order.status === 'ready' ? (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Prête !</Badge>
                  ) : (
                    <Badge variant="secondary">En préparation</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!program && coupons.length === 0 && appointments.length === 0 && orders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              <Star className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Rien à afficher pour le moment</p>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-center text-gray-300 pb-4">
          Propulsé par LoyaPing
        </p>
      </div>

      {/* Redemption Dialog */}
      <Dialog open={!!activeCoupon} onOpenChange={(o) => { if (!o) { setActiveCoupon(null); setRedemptionCode(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Utiliser votre récompense</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="py-8 text-center text-gray-400">Génération du code...</div>
          ) : redemptionCode ? (
            <div className="space-y-4 py-2">
              <div className="text-center space-y-3">
                <p className="text-sm text-gray-600">{activeCoupon?.tier?.reward_description}</p>

                {/* QR Code */}
                <div className="flex justify-center">
                  <QRCodeComponent value={redemptionCode} />
                </div>

                {/* Code display */}
                <div className="bg-gray-50 rounded-xl py-4">
                  <div className="font-mono text-4xl font-bold tracking-widest text-indigo-600">
                    {redemptionCode}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Valable 10 minutes</p>
                </div>
              </div>
              <p className="text-xs text-center text-gray-400">
                Présentez ce code ou QR à votre commerçant
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Toaster richColors position="bottom-center" />
    </div>
  )
}
