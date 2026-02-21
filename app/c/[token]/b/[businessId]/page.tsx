import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Package, Calendar, Star, Gift, Check, Lock } from 'lucide-react'
import { getPortalBusinessData } from '@/lib/services/clients'
import BusinessHeader from '@/app/c/_components/BusinessHeader'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { LoyaltyTier, Coupon } from '@/lib/types'
import type { CSSProperties } from 'react'

type Props = { params: Promise<{ token: string; businessId: string }> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Block({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
        {icon}
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function BusinessDetailPage({ params }: Props) {
  const { token, businessId } = await params
  const result = await getPortalBusinessData(token, businessId)
  if (!result) notFound()

  const { data: biz } = result
  const primary   = biz.primary_color   ?? '#6366f1'
  const secondary = biz.secondary_color ?? '#e0e7ff'

  // Progress to next tier
  const nextTier = biz.tiers.find((t) => t.required_points > biz.client_points) ?? null
  const topTier  = biz.tiers[biz.tiers.length - 1]
  const maxPts   = nextTier?.required_points ?? topTier?.required_points ?? 100
  const pct      = Math.min((biz.client_points / maxPts) * 100, 100)

  const brandVars = {
    '--brand':   primary,
    '--brand-2': secondary,
  } as CSSProperties

  return (
    <div className="max-w-md mx-auto px-4 pb-10" style={brandVars}>
      {/* Back */}
      <div className="py-4">
        <Link href={`/c/${token}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Tous mes commerces
        </Link>
      </div>

      {/* Business header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
        <BusinessHeader
          name={biz.name}
          logo_url={biz.logo_url}
          address={biz.address}
          google_maps_url={biz.google_maps_url}
          waze_url={biz.waze_url}
          hours={biz.hours}
          phone={biz.phone}
          email={biz.email}
          website={biz.website}
          instagram_url={biz.instagram_url}
          tiktok_url={biz.tiktok_url}
          facebook_url={biz.facebook_url}
          youtube_url={biz.youtube_url}
          primaryColor={primary}
        />
      </div>

      <div className="space-y-4">
        {/* Commande active */}
        {biz.modules.orders_enabled && (
          <Block icon={<Package className="h-4 w-4 text-orange-500" />} title="Commande active">
            {biz.active_orders.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">Aucune commande en cours</p>
            ) : (
              biz.active_orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-sm font-medium">
                      {order.reference ? `#${order.reference}` : 'Commande'}
                    </div>
                    {order.amount > 0 && (
                      <div className="text-xs text-gray-400">{order.amount} {biz.name}</div>
                    )}
                  </div>
                  {order.status === 'ready' ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: '#16a34a' }}>
                      Prête ✓
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                      En préparation
                    </span>
                  )}
                </div>
              ))
            )}
          </Block>
        )}

        {/* Prochain RDV */}
        {biz.modules.appointments_enabled && (
          <Block icon={<Calendar className="h-4 w-4 text-blue-500" />} title="Prochain rendez-vous">
            {biz.upcoming_appointments.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">Aucun rendez-vous à venir</p>
            ) : (
              biz.upcoming_appointments.slice(0, 3).map((appt) => (
                <div key={appt.id} className="py-1.5 border-b last:border-0">
                  <div className="text-sm font-medium capitalize">
                    {format(new Date(appt.scheduled_at), 'EEEE d MMMM à HH:mm', { locale: fr })}
                  </div>
                  {appt.notes && <div className="text-xs text-gray-400">{appt.notes}</div>}
                </div>
              ))
            )}
          </Block>
        )}

        {/* Fidélité */}
        {biz.modules.loyalty_enabled && biz.program && (
          <Block icon={<Star className="h-4 w-4 text-amber-500" />} title="Ma fidélité">
            {/* Points + progress bar */}
            <div className="space-y-2 pb-3">
              <div className="flex justify-between text-sm">
                <span className="font-semibold" style={{ color: primary }}>{biz.client_points} pts</span>
                {nextTier ? (
                  <span className="text-gray-500">
                    Prochain palier à {nextTier.required_points} pts
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">Tous les paliers atteints !</span>
                )}
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: primary }}
                />
              </div>
            </div>

            {/* Tiers list */}
            {biz.tiers.length > 0 && (
              <div className="space-y-1 pt-1">
                {biz.tiers.filter((t) => t.is_enabled !== false).map((tier: LoyaltyTier) => {
                  const reached = biz.client_points >= tier.required_points
                  return (
                    <div key={tier.id} className={`flex items-center gap-2.5 text-sm py-1 ${reached ? '' : 'text-gray-400'}`}>
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={reached
                          ? { borderColor: primary, backgroundColor: primary }
                          : { borderColor: '#d1d5db' }
                        }
                      >
                        {reached
                          ? <Check className="h-3 w-3 text-white" />
                          : <Lock className="h-2.5 w-2.5 text-gray-300" />
                        }
                      </div>
                      <span className={reached ? 'font-medium' : ''}>
                        {tier.required_points} pts — {tier.reward_title ?? tier.reward_description}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Block>
        )}

        {/* Récompenses actives */}
        {biz.modules.loyalty_enabled && biz.active_coupons.length > 0 && (
          <Block icon={<Gift className="h-4 w-4 text-purple-500" />} title={`Récompenses (${biz.active_coupons.length})`}>
            {biz.active_coupons.map((coupon) => {
              const c = coupon as Coupon & { tier?: { reward_description: string; reward_title: string | null } }
              return (
                <div key={c.id} className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">
                      {c.tier?.reward_title ?? c.tier?.reward_description ?? 'Récompense'}
                    </div>
                    <div className="text-xs text-gray-400">
                      Expire le {format(new Date(c.expires_at), 'dd MMM yyyy', { locale: fr })}
                    </div>
                  </div>
                  <Link
                    href={`/c/${token}/redeem/${c.id}`}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ backgroundColor: primary }}
                  >
                    Utiliser
                  </Link>
                </div>
              )
            })}
          </Block>
        )}
      </div>

      <p className="text-xs text-center text-gray-300 mt-6">Propulsé par LoyaPing</p>
    </div>
  )
}
