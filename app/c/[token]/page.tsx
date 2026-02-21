import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Package, Calendar, Star, Gift, ChevronRight } from 'lucide-react'
import { getPortalGlobalData } from '@/lib/services/clients'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { PortalBusinessData, Coupon, LoyaltyTier } from '@/lib/types'

type Props = { params: Promise<{ token: string }> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPhone(phone: string) {
  if (phone.length <= 4) return phone
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4)
}

function nextTier(tiers: LoyaltyTier[], points: number): LoyaltyTier | null {
  return tiers.find((t) => t.required_points > points) ?? null
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function BusinessRow({ biz, token, children }: { biz: PortalBusinessData; token: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/c/${token}/b/${biz.id}`}
      className="flex items-center gap-3 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors px-1 rounded"
    >
      {/* Logo / initial */}
      {biz.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={biz.logo_url} alt={biz.name} className="h-9 w-9 rounded-lg object-cover shrink-0 border" />
      ) : (
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: biz.primary_color ?? '#6366f1' }}
        >
          {biz.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{biz.name}</div>
        <div className="text-xs text-gray-500">{children}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
    </Link>
  )
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
        {icon}
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function GlobalPortalPage({ params }: Props) {
  const { token } = await params
  const data = await getPortalGlobalData(token)
  if (!data) notFound()

  const { phone_number, businesses } = data

  const hasOrders      = businesses.some((b) => b.modules.orders_enabled)
  const hasAppts       = businesses.some((b) => b.modules.appointments_enabled)
  const hasLoyalty     = businesses.some((b) => b.modules.loyalty_enabled)
  const allCoupons     = businesses.flatMap((b) =>
    b.active_coupons.map((c) => ({ ...c, biz: b }))
  )

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Votre espace fidélité</h1>
          <p className="text-xs text-gray-400">{maskPhone(phone_number)}</p>
        </div>
        <span className="text-xs text-indigo-600 font-semibold">LoyaPing</span>
      </div>


      {/* Commandes */}
      {hasOrders && (
        <SectionCard
          icon={<Package className="h-4 w-4 text-orange-500" />}
          title="Commandes en cours"
        >
          {businesses.filter((b) => b.modules.orders_enabled).map((biz) => {
            const order = biz.active_orders[0]
            return (
              <BusinessRow key={biz.id} biz={biz} token={token}>
                {order ? (
                  <>
                    {order.reference ? `#${order.reference} · ` : ''}
                    {order.status === 'ready'
                      ? <span className="text-green-600 font-medium">Prête !</span>
                      : 'En préparation'
                    }
                  </>
                ) : (
                  'Aucune commande active'
                )}
              </BusinessRow>
            )
          })}
        </SectionCard>
      )}

      {/* Rendez-vous */}
      {hasAppts && (
        <SectionCard
          icon={<Calendar className="h-4 w-4 text-blue-500" />}
          title="Prochains rendez-vous"
        >
          {businesses.filter((b) => b.modules.appointments_enabled).map((biz) => {
            const appt = biz.upcoming_appointments[0]
            return (
              <BusinessRow key={biz.id} biz={biz} token={token}>
                {appt
                  ? format(new Date(appt.scheduled_at), 'EEEE d MMM à HH:mm', { locale: fr })
                  : 'Aucun rendez-vous à venir'
                }
              </BusinessRow>
            )
          })}
        </SectionCard>
      )}

      {/* Fidélité */}
      {hasLoyalty && (
        <SectionCard
          icon={<Star className="h-4 w-4 text-amber-500" />}
          title="Mes points"
        >
          {businesses.filter((b) => b.modules.loyalty_enabled).map((biz) => {
            const next = nextTier(biz.tiers, biz.client_points)
            return (
              <BusinessRow key={biz.id} biz={biz} token={token}>
                {biz.program ? (
                  <>
                    <span className="font-medium text-gray-700">{biz.client_points} pts</span>
                    {next ? ` · Prochain : ${next.reward_title ?? next.reward_description} (${next.required_points} pts)` : ' · Tous les paliers atteints !'}
                  </>
                ) : (
                  'Programme de fidélité'
                )}
              </BusinessRow>
            )
          })}
        </SectionCard>
      )}

      {/* Récompenses actives */}
      {allCoupons.length > 0 && (
        <SectionCard
          icon={<Gift className="h-4 w-4 text-purple-500" />}
          title={`Récompenses actives (${allCoupons.length})`}
        >
          {allCoupons.map(({ biz, ...coupon }) => {
            const c = coupon as Coupon & { tier?: { reward_description: string; reward_title: string | null } }
            return (
              <div key={c.id} className="flex items-center gap-3 py-3 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {c.tier?.reward_title ?? c.tier?.reward_description ?? 'Récompense'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {biz.name} · expire le {format(new Date(c.expires_at), 'dd MMM yyyy', { locale: fr })}
                  </div>
                </div>
                <Link
                  href={`/c/${token}/redeem/${c.id}`}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ backgroundColor: biz.primary_color ?? '#6366f1' }}
                >
                  Utiliser
                </Link>
              </div>
            )
          })}
        </SectionCard>
      )}

      {/* Empty state */}
      {!hasOrders && !hasAppts && !hasLoyalty && (
        <div className="text-center py-16 text-gray-400">
          <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Rien à afficher pour le moment</p>
        </div>
      )}

      <p className="text-xs text-center text-gray-300 pb-4">Propulsé par LoyaPing</p>
    </div>
  )
}
