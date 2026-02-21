import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import QRCodeDisplay from '@/components/client/QRCodeDisplay'

type Props = { params: Promise<{ token: string }> }

export default async function QRPage({ params }: Props) {
  const { token } = await params
  const db = createServerClient()

  const { data: client } = await db
    .from('clients')
    .select('phone_number')
    .eq('magic_token', token)
    .maybeSingle()

  if (!client) notFound()

  // QR content: phone number (allows vendor to identify client by phone)
  const qrValue = client.phone_number

  // Mask phone for display
  const masked =
    client.phone_number.length > 4
      ? client.phone_number.slice(0, -4).replace(/\d/g, '•') + client.phone_number.slice(-4)
      : client.phone_number

  return (
    <div className="max-w-sm mx-auto px-4 py-8 flex flex-col items-center gap-6 min-h-screen">
      {/* Back */}
      <div className="w-full">
        <Link href={`/c/${token}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
      </div>

      <div className="text-center space-y-1 mt-4">
        <h1 className="text-xl font-bold text-gray-900">Mon QR universel</h1>
        <p className="text-sm text-gray-500">Montrez ce QR au comptoir pour vous identifier</p>
      </div>

      {/* QR */}
      <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
        <QRCodeDisplay value={qrValue} size={240} />
      </div>

      {/* Phone display */}
      <div className="text-center">
        <span className="font-mono text-lg font-semibold text-gray-700 tracking-widest">{masked}</span>
      </div>

      {/* Add to home screen hint */}
      <div className="w-full bg-indigo-50 rounded-2xl p-4 text-sm text-indigo-700 space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <Smartphone className="h-4 w-4 shrink-0" />
          Ajouter à l&apos;écran d&apos;accueil
        </div>
        <p className="text-xs text-indigo-600 leading-relaxed">
          <strong>iPhone :</strong> Safari → icône Partager → &quot;Sur l&apos;écran d&apos;accueil&quot;<br />
          <strong>Android :</strong> Chrome → menu ⋮ → &quot;Ajouter à l&apos;écran d&apos;accueil&quot;
        </p>
      </div>

      <p className="text-xs text-gray-300 mt-auto pb-4">Propulsé par LoyaPing</p>
    </div>
  )
}
