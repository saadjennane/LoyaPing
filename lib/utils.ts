import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Navigation deep links (no paid API) ─────────────────────────────────────

type NavInfo = {
  google_maps_url?: string | null
  waze_url?:        string | null
  latitude?:        number | null
  longitude?:       number | null
  address?:         string | null
}

export function buildNavigationLinks(info: NavInfo): { googleUrl: string | null; wazeUrl: string | null } {
  const { google_maps_url, waze_url, latitude, longitude, address } = info
  const hasLatLng = latitude != null && longitude != null

  let googleUrl: string | null = null
  if (google_maps_url) {
    googleUrl = google_maps_url
  } else if (hasLatLng) {
    googleUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  } else if (address) {
    googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }

  let wazeUrl: string | null = null
  if (waze_url) {
    wazeUrl = waze_url
  } else if (hasLatLng) {
    wazeUrl = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`
  } else if (address) {
    wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
  }

  return { googleUrl, wazeUrl }
}
