import { redirect } from 'next/navigation'
import { Toaster } from '@/components/ui/sonner'
import { createServerClient } from '@/lib/supabase/server'
import ClientProviders from './ClientProviders'
import MobileBottomNav from '@/components/MobileBottomNav'
import Sidebar from '@/components/Sidebar'
import { DEFAULT_CLIENT_FIELD_CONFIG, type ClientFieldConfig } from '@/lib/context/client-field-config'

const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID ?? '00000000-0000-0000-0000-000000000001'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let modules = { orders_enabled: true, appointments_enabled: true, loyalty_enabled: true, reviews_enabled: false }
  let fieldConfig: ClientFieldConfig = DEFAULT_CLIENT_FIELD_CONFIG
  try {
    const db = createServerClient()
    const [modulesRes, fieldRes, onboardingRes] = await Promise.all([
      db.from('business_modules')
        .select('orders_enabled, appointments_enabled, loyalty_enabled, reviews_enabled')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle(),
      db.from('client_field_config')
        .select('*')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle(),
      db.from('business_profile')
        .select('onboarding_status')
        .eq('business_id', DEFAULT_BUSINESS_ID)
        .maybeSingle(),
    ])
    if (modulesRes.data) modules     = modulesRes.data
    if (fieldRes.data)   fieldConfig = fieldRes.data

    if (!onboardingRes.data || onboardingRes.data.onboarding_status === 'not_started') {
      redirect('/onboarding')
    }
  } catch (err) {
    // If the column doesn't exist yet (migration not applied), allow access
    if (String(err).includes('onboarding_status')) {
      // column not yet migrated — skip redirect
    } else if (String(err).includes('NEXT_REDIRECT')) {
      throw err
    }
  }

  return (
    <ClientProviders initialModules={modules} initialFieldConfig={fieldConfig}>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar — desktop only */}
        <Sidebar />

        {/* Main content — extra bottom padding on mobile for the bottom nav */}
        <main className="flex-1 min-w-0 pb-16 lg:pb-0">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <MobileBottomNav />

        <Toaster richColors position="bottom-right" />
      </div>
    </ClientProviders>
  )
}
