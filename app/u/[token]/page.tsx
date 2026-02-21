import { notFound } from 'next/navigation'
import { getClientPageData } from '@/lib/services/clients'
import ClientDashboard from '@/components/client/ClientDashboard'

type Props = { params: Promise<{ token: string }> }

export default async function ClientPage({ params }: Props) {
  const { token } = await params
  const data = await getClientPageData(token)

  if (!data) notFound()

  return <ClientDashboard data={data} />
}
