'use client'

import { ThemeProvider } from 'next-themes'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

function PostHogInit({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com'
    if (key && !posthog.__loaded) {
      posthog.init(key, {
        api_host:          host,
        capture_pageview:  true,
        capture_pageleave: true,
        autocapture:       false,
        persistence:       'memory',
      })
    }
  }, [])
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PostHogInit>{children}</PostHogInit>
    </ThemeProvider>
  )
}
