'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Star, ThumbsUp, ThumbsDown, Send, RefreshCw, AlertTriangle, Check, ExternalLink, Bell, MessageCircle, CheckCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import Link from 'next/link'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { ReviewEvent, ReviewStats, Conversation, ConversationMessage, ConversationStatus, ConversationWithMessages } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientName(event: ReviewEvent): string {
  const c = event.client
  if (!c) return 'Client inconnu'
  const parts = [c.civility, c.first_name, c.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : c.phone_number
}

function convClientName(conv: Conversation): string {
  const c = conv.client
  if (!c) return conv.phone
  const parts = [c.civility, c.first_name, c.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : c.phone_number
}

function isWindowOpen(lastInbound: string): boolean {
  return new Date(lastInbound).getTime() + 24 * 60 * 60 * 1000 > Date.now()
}

function convStatusLabel(status: ConversationStatus): string {
  switch (status) {
    case 'TO_TREAT':    return 'À traiter'
    case 'OPEN':        return 'Ouverte'
    case 'IN_PROGRESS': return 'En cours'
    case 'RESOLVED':    return 'Résolue'
  }
}

function convTabLabel(status: ConversationStatus): string {
  switch (status) {
    case 'TO_TREAT':    return 'À traiter'
    case 'OPEN':        return 'Ouvertes'
    case 'IN_PROGRESS': return 'En cours'
    case 'RESOLVED':    return 'Résolues'
  }
}

function convStatusClass(status: ConversationStatus): string {
  switch (status) {
    case 'TO_TREAT':    return 'bg-red-50 text-red-700 border-red-200'
    case 'OPEN':        return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'IN_PROGRESS': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'RESOLVED':    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
}

function eventLabel(type: ReviewEvent['type']): string {
  switch (type) {
    case 'request_sent':     return 'Demande envoyée'
    case 'positive_response': return 'Retour positif'
    case 'negative_response': return 'Retour négatif'
    case 'google_intent':    return 'Intent Google'
    case 'reminder_sent':    return 'Relance envoyée'
    case 'confirmed':        return 'Avis confirmé'
  }
}

function eventIcon(type: ReviewEvent['type']) {
  switch (type) {
    case 'request_sent':     return <Send className="h-3.5 w-3.5 text-blue-500" />
    case 'positive_response': return <ThumbsUp className="h-3.5 w-3.5 text-green-500" />
    case 'negative_response': return <ThumbsDown className="h-3.5 w-3.5 text-red-500" />
    case 'google_intent':    return <Star className="h-3.5 w-3.5 text-amber-500" />
    case 'reminder_sent':    return <Bell className="h-3.5 w-3.5 text-violet-500" />
    case 'confirmed':        return <Check className="h-3.5 w-3.5 text-emerald-500" />
  }
}

function eventBadgeClass(type: ReviewEvent['type']): string {
  switch (type) {
    case 'request_sent':     return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'positive_response': return 'bg-green-50 text-green-700 border-green-200'
    case 'negative_response': return 'bg-red-50 text-red-700 border-red-200'
    case 'google_intent':    return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'reminder_sent':    return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'confirmed':        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, highlight }: {
  label: string
  value: number
  icon: React.ReactNode
  highlight?: 'green' | 'red' | 'amber'
}) {
  const bg = highlight === 'green' ? 'border-green-200 bg-green-50'
           : highlight === 'red'   ? 'border-red-200 bg-red-50'
           : highlight === 'amber' ? 'border-amber-200 bg-amber-50'
           : ''
  const text = highlight === 'green' ? 'text-green-700'
             : highlight === 'red'   ? 'text-red-700'
             : highlight === 'amber' ? 'text-amber-700'
             : 'text-foreground'
  return (
    <Card className={`${bg}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold ${text}`}>{value}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${
            highlight === 'green' ? 'bg-green-100' :
            highlight === 'red'   ? 'bg-red-100'   :
            highlight === 'amber' ? 'bg-amber-100' :
            'bg-muted'
          }`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const CONV_TABS: ConversationStatus[] = ['TO_TREAT', 'OPEN', 'IN_PROGRESS', 'RESOLVED']

export default function ReviewsPage() {
  const [stats,    setStats]    = useState<ReviewStats | null>(null)
  const [events,   setEvents]   = useState<ReviewEvent[]>([])
  const [isActive, setIsActive] = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [treating, setTreating] = useState<string | null>(null)

  // Conversations state
  const [convTab,     setConvTab]     = useState<ConversationStatus>('TO_TREAT')
  const [convs,       setConvs]       = useState<Conversation[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [activeConv,  setActiveConv]  = useState<ConversationWithMessages | null>(null)
  const [chatOpen,    setChatOpen]    = useState(false)
  const [replyBody,   setReplyBody]   = useState('')
  const [sending,     setSending]     = useState(false)
  const [resolving,   setResolving]   = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [statsRes, eventsRes, settingsRes] = await Promise.all([
      fetch('/api/reviews/stats').then((r) => r.json()),
      fetch('/api/reviews/events').then((r) => r.json()),
      fetch('/api/settings/reviews').then((r) => r.json()),
    ])
    if (statsRes.data)    setStats(statsRes.data)
    if (eventsRes.data)   setEvents(eventsRes.data)
    if (settingsRes.data) setIsActive(settingsRes.data.is_active)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Conversations ──────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async (status: ConversationStatus) => {
    setConvLoading(true)
    const res  = await fetch(`/api/conversations?status=${status}`)
    const json = await res.json()
    if (json.data) setConvs(json.data)
    setConvLoading(false)
  }, [])

  useEffect(() => { fetchConversations(convTab) }, [fetchConversations, convTab])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeConv?.messages, chatOpen])

  const openConversation = async (id: string) => {
    const res  = await fetch(`/api/conversations/${id}`)
    const json = await res.json()
    if (json.error) { toast.error('Erreur lors du chargement'); return }
    setActiveConv(json.data)
    setChatOpen(true)
    // Refresh list so TO_TREAT count updates if it transitioned to OPEN
    fetchConversations(convTab)
  }

  const sendReply = async () => {
    if (!activeConv || !replyBody.trim()) return
    setSending(true)
    const res  = await fetch(`/api/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: replyBody.trim() }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error("Erreur lors de l'envoi")
    } else {
      const newMsg: ConversationMessage = {
        id:              json.data.id,
        conversation_id: activeConv.id,
        direction:       'outbound',
        body:            replyBody.trim(),
        created_at:      new Date().toISOString(),
      }
      setActiveConv((prev) => prev ? { ...prev, messages: [...prev.messages, newMsg], status: 'IN_PROGRESS' } : prev)
      setReplyBody('')
    }
    setSending(false)
  }

  const resolveConversation = async () => {
    if (!activeConv) return
    setResolving(true)
    const res  = await fetch(`/api/conversations/${activeConv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error('Erreur lors de la résolution')
    } else {
      toast.success('Conversation résolue')
      setChatOpen(false)
      setActiveConv(null)
      fetchConversations(convTab)
    }
    setResolving(false)
  }

  const markTreated = async (id: string) => {
    setTreating(id)
    const res  = await fetch(`/api/reviews/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ treated: true }),
    })
    const json = await res.json()
    if (json.error) {
      toast.error('Erreur lors de la mise à jour')
    } else {
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, treated: true } : e))
      if (stats) setStats({ ...stats, untreated_negative: Math.max(0, stats.untreated_negative - 1) })
      toast.success('Retour marqué comme traité')
    }
    setTreating(null)
  }

  const untreatedNegatives = events.filter((e) => e.type === 'negative_response' && !e.treated)

  const windowOpen = activeConv ? isWindowOpen(activeConv.last_inbound_at) : false

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shrink-0">
            <Star className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reviews</h1>
            <p className="text-sm text-muted-foreground">Demandes d&apos;avis et retours clients</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border ${
            isActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            {isActive ? 'Actif' : 'Désactivé'}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/reviews">Paramètres</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-12 text-center">Chargement...</div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Demandes envoyées"
              value={stats?.request_sent ?? 0}
              icon={<Send className="h-5 w-5 text-blue-500" />}
            />
            <KpiCard
              label="Retours positifs 👍"
              value={stats?.positive_response ?? 0}
              icon={<ThumbsUp className="h-5 w-5 text-green-500" />}
              highlight="green"
            />
            <KpiCard
              label="Retours négatifs 👎"
              value={stats?.negative_response ?? 0}
              icon={<ThumbsDown className="h-5 w-5 text-red-500" />}
              highlight={stats?.negative_response ? 'red' : undefined}
            />
            <KpiCard
              label="Intent Google ⭐"
              value={stats?.google_intent ?? 0}
              icon={<Star className="h-5 w-5 text-amber-500" />}
              highlight={stats?.google_intent ? 'amber' : undefined}
            />
          </div>
          {stats && stats.reminder_sent > 0 && (
            <p className="text-xs text-muted-foreground -mt-2 ml-1">
              + {stats.reminder_sent} relance{stats.reminder_sent > 1 ? 's' : ''} envoyée{stats.reminder_sent > 1 ? 's' : ''}
            </p>
          )}

          {/* ── Retours négatifs à traiter ────────────────────────────────── */}
          {untreatedNegatives.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Retours à traiter
                  <Badge variant="destructive" className="ml-auto text-xs">
                    {untreatedNegatives.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {untreatedNegatives.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/40 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{clientName(event)}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(event.created_at), 'd MMM yyyy · HH:mm', { locale: fr })}
                        </span>
                      </div>
                      {event.message_content && (
                        <p className="text-sm text-muted-foreground mt-1 italic">
                          &ldquo;{event.message_content}&rdquo;
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={treating === event.id}
                      onClick={() => markTreated(event.id)}
                      className="shrink-0 text-xs h-8"
                    >
                      {treating === event.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Marquer comme traité
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Intent Google ─────────────────────────────────────────────── */}
          {events.filter((e) => e.type === 'google_intent').length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-amber-500" />
                  Intent Google détectés
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.filter((e) => e.type === 'google_intent').map((event) => (
                    <div key={event.id} className="flex items-center justify-between rounded-lg border bg-amber-50/30 px-3 py-2.5">
                      <div>
                        <span className="text-sm font-medium">{clientName(event)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {format(parseISO(event.created_at), 'd MMM yyyy · HH:mm', { locale: fr })}
                        </span>
                      </div>
                      <span className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 border ${
                        events.some((e) => e.client_id === event.client_id && e.type === 'confirmed')
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {events.some((e) => e.client_id === event.client_id && e.type === 'confirmed')
                          ? 'Confirmé'
                          : 'Intent actif'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Timeline ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activité</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Star className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucune activité pour le moment.</p>
                  {!isActive && (
                    <p className="text-xs mt-1">
                      <Link href="/settings/reviews" className="underline underline-offset-4">
                        Activez le module
                      </Link>{' '}
                      pour commencer à collecter des avis.
                    </p>
                  )}
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />
                  <div className="space-y-0">
                    {events.map((event, i) => (
                      <div key={event.id} className={`relative flex gap-3 ${i < events.length - 1 ? 'pb-4' : ''}`}>
                        {/* Dot */}
                        <div className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background`}>
                          {eventIcon(event.type)}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{clientName(event)}</span>
                              <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${eventBadgeClass(event.type)}`}>
                                {eventLabel(event.type)}
                              </span>
                              {event.type === 'negative_response' && event.treated && (
                                <span className="inline-flex items-center text-xs text-muted-foreground">
                                  <Check className="h-3 w-3 mr-0.5" />Traité
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(parseISO(event.created_at), 'd MMM · HH:mm', { locale: fr })}
                            </span>
                          </div>
                          {event.message_content && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic truncate">
                              {event.message_content}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Conversations ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-blue-500" />
                Conversations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Tabs */}
              <div className="flex gap-1 mb-4 border-b">
                {CONV_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setConvTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-md -mb-px border-b-2 transition-colors ${
                      convTab === tab
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {convTabLabel(tab)}
                  </button>
                ))}
              </div>

              {/* List */}
              {convLoading ? (
                <div className="text-sm text-muted-foreground text-center py-8">Chargement...</div>
              ) : convs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Aucune conversation {convTabLabel(convTab).toLowerCase()}.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {convs.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="flex items-start gap-3 rounded-lg border bg-card px-3 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{convClientName(conv)}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDistanceToNow(parseISO(conv.last_inbound_at), { locale: fr, addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{conv.phone}</p>
                        {conv.last_message && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate italic">&ldquo;{conv.last_message}&rdquo;</p>
                        )}
                      </div>
                      <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border shrink-0 ${convStatusClass(conv.status)}`}>
                        {convStatusLabel(conv.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Chat Sheet ────────────────────────────────────────────────────── */}
      <Sheet open={chatOpen} onOpenChange={(o) => { if (!o) { setChatOpen(false) } }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
          {activeConv && (
            <>
              {/* Header */}
              <SheetHeader className="px-4 py-3 border-b shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SheetTitle className="text-base font-semibold leading-tight">
                      {convClientName(activeConv)}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{activeConv.phone}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={resolving || activeConv.status === 'RESOLVED'}
                      onClick={resolveConversation}
                    >
                      {resolving ? (
                        <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <CheckCheck className="h-3 w-3 mr-1" />
                      )}
                      Résoudre
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      asChild
                    >
                      <Link href={activeConv.client?.phone_number ? `/clients?q=${encodeURIComponent(activeConv.phone)}` : '#'}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${convStatusClass(activeConv.status)}`}>
                    {convStatusLabel(activeConv.status)}
                  </span>
                  {!windowOpen && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Fenêtre WhatsApp fermée
                    </span>
                  )}
                </div>
              </SheetHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeConv.messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Aucun message pour le moment.
                  </div>
                )}
                {activeConv.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      msg.direction === 'outbound'
                        ? 'bg-[#3B5BDB] text-white rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-muted-foreground'}`}>
                        {format(parseISO(msg.created_at), 'HH:mm', { locale: fr })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t px-3 py-3 shrink-0">
                {!windowOpen ? (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    La fenêtre de messagerie WhatsApp est expirée (24h). Vous ne pouvez plus envoyer de messages.
                  </div>
                ) : activeConv.status === 'RESOLVED' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                    <X className="h-3.5 w-3.5 shrink-0" />
                    Cette conversation est résolue.
                  </div>
                ) : (
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendReply()
                        }
                      }}
                      placeholder="Écrivez un message..."
                      rows={2}
                      className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      className="h-9 px-3 bg-[#3B5BDB] hover:bg-[#2F4BC7] text-white shrink-0"
                      disabled={sending || !replyBody.trim()}
                      onClick={sendReply}
                    >
                      {sending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
