'use client'

import { useState } from 'react'
import { MapPin, Clock, Phone, Globe, Mail, X, Navigation } from 'lucide-react'
import { buildNavigationLinks } from '@/lib/utils'

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

type Hour = {
  day_of_week: number
  is_closed: boolean
  slot1_start: string | null
  slot1_end: string | null
  slot2_start: string | null
  slot2_end: string | null
}

type Props = {
  name: string
  logo_url: string | null
  address: string | null
  google_maps_url: string | null
  waze_url: string | null
  hours: Hour[]
  phone: string | null
  email: string | null
  website: string | null
  instagram_url: string | null
  tiktok_url: string | null
  facebook_url: string | null
  youtube_url: string | null
  primaryColor: string
}

function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function TikTokIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  )
}

function FacebookIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function YouTubeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export default function BusinessHeader({
  name, logo_url, address,
  google_maps_url, waze_url,
  hours, phone, email, website,
  instagram_url, tiktok_url, facebook_url, youtube_url,
  primaryColor,
}: Props) {
  const [showAddress, setShowAddress] = useState(false)
  const [showHours, setShowHours] = useState(false)

  const { googleUrl, wazeUrl } = buildNavigationLinks({ google_maps_url, waze_url, address })
  const hasNavData = !!(address || google_maps_url || waze_url)

  const iconBtn = 'flex items-center justify-center h-9 w-9 rounded-full active:scale-95 transition-transform hover:bg-gray-100'
  const iconStyle = { color: primaryColor }

  const hasSocial = !!(instagram_url || tiktok_url || facebook_url || youtube_url)
  const hasContact = !!(hasNavData || hours.length > 0 || phone || website || email || hasSocial)

  return (
    <>
      {/* Header */}
      <div className="flex flex-col items-center gap-3 pt-6 pb-4">
        {logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo_url} alt={name} className="h-16 w-16 rounded-2xl object-cover border" />
        ) : (
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
            style={{ backgroundColor: primaryColor }}>
            {name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')}
          </div>
        )}
        <h1 className="text-xl font-bold text-gray-900 text-center">{name}</h1>

        {/* Icon row */}
        {hasContact && (
          <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center">
            {hasNavData && (
              <button className={iconBtn} onClick={() => setShowAddress(true)} aria-label="Adresse">
                <MapPin className="h-5 w-5" style={iconStyle} />
              </button>
            )}
            {hours.length > 0 && (
              <button className={iconBtn} onClick={() => setShowHours(true)} aria-label="Horaires">
                <Clock className="h-5 w-5" style={iconStyle} />
              </button>
            )}
            {phone && (
              <a href={`tel:${phone}`} className={iconBtn} aria-label="Appeler">
                <Phone className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Site web">
                <Globe className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={iconBtn} aria-label="Email">
                <Mail className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {instagram_url && (
              <a href={instagram_url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Instagram">
                <InstagramIcon className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {tiktok_url && (
              <a href={tiktok_url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="TikTok">
                <TikTokIcon className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {facebook_url && (
              <a href={facebook_url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Facebook">
                <FacebookIcon className="h-5 w-5" style={iconStyle} />
              </a>
            )}
            {youtube_url && (
              <a href={youtube_url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="YouTube">
                <YouTubeIcon className="h-5 w-5" style={iconStyle} />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Address / navigation sheet */}
      <BottomSheet open={showAddress} onClose={() => setShowAddress(false)} title="Adresse & itinéraire">
        {address && <p className="text-gray-700 mb-4">{address}</p>}
        <div className="grid grid-cols-2 gap-3">
          {googleUrl ? (
            <a
              href={googleUrl}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border font-medium text-sm"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              <Navigation className="h-4 w-4" />
              Google Maps
            </a>
          ) : (
            <button disabled className="flex items-center justify-center gap-2 py-3 rounded-xl border font-medium text-sm opacity-40 cursor-not-allowed">
              <Navigation className="h-4 w-4" />
              Google Maps
            </button>
          )}
          {wazeUrl ? (
            <a
              href={wazeUrl}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border font-medium text-sm"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              <Navigation className="h-4 w-4" />
              Waze
            </a>
          ) : (
            <button disabled className="flex items-center justify-center gap-2 py-3 rounded-xl border font-medium text-sm opacity-40 cursor-not-allowed">
              <Navigation className="h-4 w-4" />
              Waze
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Hours sheet */}
      <BottomSheet open={showHours} onClose={() => setShowHours(false)} title="Horaires d'ouverture">
        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, i) => {
            const h = hours.find((x) => x.day_of_week === i + 1)
            const closed = !h || h.is_closed
            return (
              <div key={i} className="flex items-start justify-between py-1.5 border-b last:border-0">
                <span className="text-sm font-medium text-gray-600 w-10 shrink-0">{DAY_NAMES[i]}</span>
                {closed ? (
                  <span className="text-sm text-gray-400">Fermé</span>
                ) : (
                  <div className="text-sm text-gray-800 text-right space-y-0.5">
                    <div>{h?.slot1_start} – {h?.slot1_end}</div>
                    {h?.slot2_start && h?.slot2_end && (
                      <div className="text-gray-500">{h.slot2_start} – {h.slot2_end}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </BottomSheet>
    </>
  )
}
