'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Gift, Clock, CheckCircle2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import QRCodeDisplay from '@/components/client/QRCodeDisplay'

// ─── Types ────────────────────────────────────────────────────────────────────

type CouponInfo = {
  id: string
  reward_title: string | null
  reward_description: string
  expires_at: string
  business_name: string
  primary_color: string
  token: string
  business_id: string
}

type CodeState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; code: string; expiresAt: Date }
  | { kind: 'error'; message: string }

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiresAt: Date | null) {
  const [remaining, setRemaining] = useState<number>(0)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      setRemaining(diff)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  return { remaining, label: `${mm}:${ss}` }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RedeemPage() {
  const params = useParams<{ token: string; rewardId: string }>()
  const router = useRouter()

  const [coupon, setCoupon] = useState<CouponInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [codeState, setCodeState] = useState<CodeState>({ kind: 'idle' })

  const expiresAt = codeState.kind === 'ready' ? codeState.expiresAt : null
  const { remaining, label: countdown } = useCountdown(expiresAt)

  // Auto-clear expired code
  useEffect(() => {
    if (codeState.kind === 'ready' && remaining === 0) {
      setCodeState({ kind: 'idle' })
    }
  }, [codeState.kind, remaining])

  // Fetch coupon info
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/client/coupon?token=${params.token}&coupon_id=${params.rewardId}`)
        if (!res.ok) { router.replace('/'); return }
        const json = await res.json()
        setCoupon(json.data)
      } catch {
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.token, params.rewardId, router])

  const generateCode = useCallback(async () => {
    setCodeState({ kind: 'loading' })
    try {
      const res = await fetch('/api/loyalty/coupons/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_id: params.rewardId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur')
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
      setCodeState({ kind: 'ready', code: json.data.code, expiresAt })
    } catch (err) {
      setCodeState({ kind: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' })
    }
  }, [params.rewardId])

  const primary = coupon?.primary_color ?? '#6366f1'

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!coupon) return null

  return (
    <div className="max-w-md mx-auto px-4 pb-10">
      {/* Back */}
      <div className="py-4">
        <Link
          href={`/c/${coupon.token}/b/${coupon.business_id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
        <div className="px-4 py-4 border-b" style={{ backgroundColor: primary + '12' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: primary + '20' }}>
              <Gift className="h-5 w-5" style={{ color: primary }} />
            </div>
            <div>
              <div className="font-semibold text-gray-900">
                {coupon.reward_title ?? coupon.reward_description}
              </div>
              <div className="text-xs text-gray-500">{coupon.business_name}</div>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Récompense valide jusqu&apos;au{' '}
          {new Date(coupon.expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Code section */}
      {codeState.kind === 'idle' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center space-y-4">
          <p className="text-sm text-gray-500">
            Présentez ce code au vendeur pour utiliser votre récompense.
          </p>
          <button
            onClick={generateCode}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
            style={{ backgroundColor: primary }}
          >
            Générer mon code
          </button>
        </div>
      )}

      {codeState.kind === 'loading' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex justify-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
        </div>
      )}

      {codeState.kind === 'ready' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-0">
          {/* Code display */}
          <div className="px-6 pt-6 pb-4 text-center">
            <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Code vendeur</div>
            <div
              className="text-5xl font-bold tracking-[0.3em] tabular-nums mb-1"
              style={{ color: primary }}
            >
              {codeState.code}
            </div>
            <div className={`text-sm font-medium mt-2 ${remaining <= 60 ? 'text-red-500' : 'text-gray-400'}`}>
              Expire dans {countdown}
            </div>
          </div>

          {/* QR code */}
          <div className="flex justify-center px-6 pb-4">
            <QRCodeDisplay value={codeState.code} size={200} />
          </div>

          {/* Refresh */}
          <div className="border-t px-6 py-3 flex justify-center">
            <button
              onClick={generateCode}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Régénérer le code
            </button>
          </div>
        </div>
      )}

      {codeState.kind === 'error' && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 text-center space-y-4">
          <p className="text-sm text-red-500">{codeState.message}</p>
          <button
            onClick={generateCode}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-red-500"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Already used / instruction */}
      <div className="mt-6 flex items-start gap-2 text-xs text-gray-400 px-1">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Une fois le code utilisé par le vendeur, votre récompense sera marquée comme utilisée automatiquement.
        </span>
      </div>

      <p className="text-xs text-center text-gray-300 mt-8">Propulsé par LoyaPing</p>
    </div>
  )
}
