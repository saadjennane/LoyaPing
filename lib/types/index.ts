// =========================================
// DATABASE TYPES
// =========================================

export type Business = {
  id: string
  name: string
  phone_number: string
  whatsapp_number: string | null
  created_at: string
}

export type Client = {
  id: string
  business_id: string
  civility: string | null
  first_name: string | null
  last_name: string | null
  phone_number: string
  email: string | null
  birthday: string | null       // DATE as ISO string (YYYY-MM-DD)
  notes: string | null
  magic_token: string
  loyalty_points: number
  current_cycle_points: number
  total_cycles_completed: number
  created_at: string
  last_activity: string | null  // TIMESTAMPTZ, computed by v_clients view
}

export type LoyaltyProgram = {
  id: string
  business_id: string
  type: 'passage' | 'montant'
  currency: string | null
  conversion_rate: number | null              // legacy: rate = 1/X
  conversion_amount_per_point: number | null  // new: X units = 1 point (e.g. 10 MAD)
  points_per_visit: number                    // new: points per passage/appointment
  notify_on_tier: boolean                     // new: WA notification when tier reached
  birthday_reward_enabled: boolean
  birthday_reward_title: string | null
  birthday_message_enabled: boolean
  birthday_message_template: string | null
  birthday_send_hour: number  // 0–23, UTC hour to dispatch the WhatsApp message
  is_active: boolean
  created_at: string
}

export type LoyaltyTier = {
  id: string
  business_id: string
  tier_order: number
  required_points: number
  reward_title: string | null          // new: short title e.g. "-10%"
  reward_description: string
  notification_message_template: string  // new: WA message when tier reached
  is_enabled: boolean                    // new
  validity_days: number | null           // changed: null = no expiry
  created_at: string
}

export type Coupon = {
  id: string
  client_id: string
  tier_id: string
  status: 'active' | 'used' | 'expired'
  source: 'tier_unlock' | 'birthday' | 'manual' | null
  redemption_code: string | null
  redemption_code_expires_at: string | null
  expires_at: string
  used_at: string | null
  created_at: string
  // joined
  tier?: LoyaltyTier
  client?: Client
}

export type OrderMessage = {
  id: string
  order_id: string
  type: string
  status: 'sent' | 'failed'
  error_message: string | null
  created_at: string
}

export type Order = {
  id: string
  client_id: string
  business_id: string
  reference: string | null
  amount: number
  status: 'pending' | 'ready' | 'completed'
  ready_at: string | null
  picked_up_at: string | null
  completed_at: string | null
  ready_sent_at: string | null
  reminder1_sent_at: string | null
  reminder2_sent_at: string | null
  reminder3_sent_at: string | null
  reminders_count: number
  points_credited: boolean
  deleted_at: string | null
  created_at: string
  // joined
  client?: Client
  messages?: OrderMessage[]
}

export type OrderNotificationSettings = {
  business_id: string
  ready_message: string
  reminder1_enabled: boolean
  reminder1_delay_value: number
  reminder1_delay_unit: 'minutes' | 'hours' | 'days'
  reminder1_message: string
  reminder2_enabled: boolean
  reminder2_delay_value: number
  reminder2_delay_unit: 'minutes' | 'hours' | 'days'
  reminder2_message: string
  reminder3_enabled: boolean
  reminder3_delay_value: number
  reminder3_delay_unit: 'minutes' | 'hours' | 'days'
  reminder3_message: string
  order_ready_correction_template: string
  updated_at: string
}

export type OrderScheduledNotification = {
  id:            string
  order_id:      string
  business_id:   string
  type:          'READY' | 'READY_CORRECTION'
  status:        'SCHEDULED' | 'SENT' | 'CANCELLED' | 'FAILED'
  scheduled_for: string
  sent_at:       string | null
  cancelled_at:  string | null
  meta:          Record<string, unknown> | null
  created_at:    string
}

export type Appointment = {
  id: string
  client_id: string | null
  business_id: string
  scheduled_at: string
  ended_at: string | null
  status: 'scheduled' | 'show' | 'no_show'
  amount: number | null
  points_credited: boolean
  notes: string | null
  show_at: string | null
  no_show_at: string | null
  deleted_at: string | null
  created_at: string
  // joined
  client?: Client
  reminderStatus?: ReminderStatus
}

export type AppointmentNotificationSettings = {
  business_id: string
  default_duration_minutes: number | null   // auto end time = start + N minutes; null = no default
  reminder1_enabled: boolean
  reminder1_delay_value: number
  reminder1_delay_unit: 'minutes' | 'hours' | 'days'
  reminder1_fixed_send_time: string | null
  reminder1_message: string
  reminder2_enabled: boolean
  reminder2_delay_value: number
  reminder2_delay_unit: 'minutes' | 'hours' | 'days'
  reminder2_fixed_send_time: string | null
  reminder2_message: string
  reminder3_enabled: boolean
  reminder3_delay_value: number
  reminder3_delay_unit: 'minutes' | 'hours' | 'days'
  reminder3_fixed_send_time: string | null
  reminder3_message: string
  post_messages_enabled: boolean
  post_show_message: string
  post_no_show_message: string
  updated_at: string
}

export type AppointmentNotification = {
  id:             string
  appointment_id: string
  business_id:    string
  reminder_index: 1 | 2 | 3
  status:         'SCHEDULED' | 'SENT' | 'CANCELLED' | 'FAILED'
  scheduled_for:  string
  sent_at:        string | null
  cancelled_at:   string | null
  meta:           Record<string, unknown> | null
  created_at:     string
}

export type ReminderConfig = {
  id: string
  business_id: string
  reminder_order: number
  offset_minutes: number
  message: string
  is_active: boolean
  created_at: string
}

export type ReminderSend = {
  id: string
  appointment_id: string
  reminder_config_id: string
  status: 'sent' | 'failed'
  error_message: string | null
  sent_at: string
}

// ── Reminder status derived from scheduled_messages (outbox) ─────────────────
// Replaces the legacy reminder_sends join in appointment queries.
export type ReminderStatus = {
  nextReminderAt:     string | null  // send_at of nearest SCHEDULED row (in the future)
  lastReminderSentAt: string | null  // sent_at of most recently SENT row
  remindersScheduled: { r1: boolean; r2: boolean; r3: boolean }  // SCHEDULED|PROCESSING|SENT
  hasFailed:          boolean        // any row permanently FAILED (exhausted retries)
}

// ── Appointment list view (lightweight) ──────────────────────────────────────
export type AppointmentListItem = {
  id: string
  client_id:      string | null  // null = imported from calendar with no client match
  client_name:    string         // civility + first_name + last_name, fallback to phone, or '—'
  client_phone:   string
  scheduled_at:   string         // ISO timestamp
  ended_at:       string | null
  status:         'scheduled' | 'show' | 'no_show'
  reminderStatus: ReminderStatus
}

export type PointsLog = {
  id: string
  client_id: string
  business_id: string
  source_type: 'order' | 'appointment' | 'manual' | 'undo'
  source_id: string | null
  points_delta: number
  cycle_points_before: number
  cycle_points_after: number
  created_at: string
}

export type ClientDetailData = {
  tiers: LoyaltyTier[]
  coupons: Coupon[]
  orders: Order[]
  appointments: Appointment[]
  pointsLog: PointsLog[]
}

export type BusinessProfile = {
  business_id:          string
  name:                 string
  logo_url:             string | null
  phone:                string | null
  email:                string | null
  website:              string | null
  currency:             string
  order_number_prefix:  string
  order_number_next:    number
  primary_color:        string | null
  secondary_color:      string | null
  address:              string | null
  default_phone_prefix: string
  google_maps_url:      string | null
  waze_url:             string | null
  instagram_url:        string | null
  tiktok_url:           string | null
  facebook_url:         string | null
  youtube_url:          string | null
  timezone:             string          // IANA timezone, e.g. "Africa/Casablanca"
  updated_at:           string
}

export type BusinessHours = {
  business_id: string
  day_of_week: number   // 1=Mon … 7=Sun
  is_closed:   boolean
  slot1_start: string | null  // "09:00"
  slot1_end:   string | null
  slot2_start: string | null
  slot2_end:   string | null
}

export type BusinessModules = {
  business_id:          string
  orders_enabled:       boolean
  appointments_enabled: boolean
  loyalty_enabled:      boolean
  updated_at:           string
}

// =========================================
// API RESPONSE TYPES
// =========================================

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string }

// =========================================
// CLIENT PAGE TYPES (magic link)
// =========================================

export type ClientPageData = {
  client: Client
  business: Business
  program: LoyaltyProgram | null
  tiers: LoyaltyTier[]
  coupons: Coupon[]
  appointments: Appointment[]
  orders: Order[]
}

// ── Customer index (lightweight, client-side search) ─────────────────────────

export type CustomerIndexItem = {
  id:               string
  display_name:     string   // "Prénom Nom" or phone_number if no name
  phone:            string   // stored as-is
  phone_digits:     string   // digits only for fast phone search
  phone_last4:      string   // last 4 digits
  last_activity_at: string | null
}

// ── Client portal (multi-business) ──────────────────────────────────────────

export type PortalBusinessData = {
  id:              string
  client_id:       string
  client_points:   number   // current_cycle_points for this business
  name:            string
  logo_url:        string | null
  primary_color:   string | null
  secondary_color: string | null
  address:         string | null
  google_maps_url: string | null
  waze_url:        string | null
  phone:           string | null
  email:           string | null
  website:         string | null
  instagram_url:   string | null
  tiktok_url:      string | null
  facebook_url:    string | null
  youtube_url:     string | null
  hours: Array<{
    day_of_week:  number
    is_closed:    boolean
    slot1_start:  string | null
    slot1_end:    string | null
    slot2_start:  string | null
    slot2_end:    string | null
  }>
  modules: {
    orders_enabled:       boolean
    appointments_enabled: boolean
    loyalty_enabled:      boolean
  }
  active_orders:         Order[]
  upcoming_appointments: Appointment[]
  program:               LoyaltyProgram | null
  tiers:                 LoyaltyTier[]
  active_coupons:        Coupon[]
}

export type PortalGlobalData = {
  token:        string
  phone_number: string
  businesses:   PortalBusinessData[]
}

// ── Dashboard summary types ───────────────────────────────────────────────────

export type DashboardOrderItem = {
  id:              string
  reference:       string | null
  client_name:     string
  ready_at:        string | null
  reminders_count: number
  status:          'pending' | 'ready'
}

export type DashboardApptItem = {
  id:           string
  scheduled_at: string
  client_name:  string
  status:       'scheduled' | 'show' | 'no_show'
}

export type DashboardLoyaltyItem = {
  id:           string
  client_name:  string
  reward_title: string | null
  expires_at:   string | null
}

export type DashboardOrdersSection = {
  metrics: {
    ready_count:             number
    pending_count:           number
    uncollected_3reminders:  number
    created_today:           number
  }
  list: DashboardOrderItem[]
}

export type DashboardApptsSection = {
  metrics: {
    today_count:    number
    next_at:        string | null
    no_show_today:  number
    tomorrow_count: number
  }
  list: DashboardApptItem[]
}

export type DashboardLoyaltySection = {
  metrics: {
    active_coupons:   number
    birthday_coupons: number
    expiring_soon:    number
  }
  list: DashboardLoyaltyItem[]
}

export type DashboardSummary = {
  business: {
    name:    string
    modules: { orders_enabled: boolean; appointments_enabled: boolean; loyalty_enabled: boolean }
  }
  orders?:       DashboardOrdersSection
  appointments?: DashboardApptsSection
  loyalty?:      DashboardLoyaltySection
}
