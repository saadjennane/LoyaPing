# Appointment WhatsApp Messaging — Architecture & Legacy Guide

## Current Architecture (use this)

All WhatsApp messages for appointments flow through the **outbox pattern** using the `scheduled_messages` table, dispatched by a single universal cron worker.

### Tables

| Table | Purpose |
|---|---|
| `appointment_notification_settings` | Per-business config: 3 reminder slots (delay/offset or fixed local HH:mm) + post-show/no-show messages |
| `scheduled_messages` | Universal outbox — every WhatsApp message is a row here |
| `business_profile` | Provides `timezone` (IANA) for DST-safe local→UTC conversion |

### Message types written to `scheduled_messages`

| `message_type` | Trigger |
|---|---|
| `appointment_reminder_1` | Appointment created or rescheduled |
| `appointment_reminder_2` | Appointment created or rescheduled |
| `appointment_reminder_3` | Appointment created or rescheduled |
| `appointment_post_show` | Appointment marked as show |
| `appointment_post_no_show` | Appointment marked as no_show |

### Flow: pre-appointment reminders

```
POST /api/appointments          ─┐
PATCH /api/appointments/:id      ├─► scheduleAppointmentReminders(id)
  (reschedule)                  ─┘      │
                                        ├─ lp_cancel_appointment_reminders() [atomic RPC]
                                        │    cancels all SCHEDULED rows for this appointment
                                        │    where send_at > now()
                                        │
                                        ├─ reads appointment_notification_settings
                                        ├─ reads business_profile.timezone
                                        ├─ computes send_at per reminder (offset or fixed HH:mm)
                                        └─ INSERT into scheduled_messages
```

### Flow: post-status messages

```
PATCH /api/appointments/:id  status=show
  ├─ markAppointmentShow()
  │    ├─ updates appointment (status, points_credited, show_at)
  │    ├─ credits loyalty points
  │    ├─ cancelExistingScheduledForEntity(appointment_post_no_show)  ← cancel opposite
  │    ├─ checks scheduled_messages for existing SENT post_show       ← idempotency
  │    └─ createScheduledMessage(appointment_post_show, sendAt=now)
  │
PATCH /api/appointments/:id  status=no_show
  └─ markNoShow()
       ├─ updates appointment (status, no_show_at)
       ├─ cancelExistingScheduledForEntity(appointment_post_show)     ← cancel opposite
       ├─ checks scheduled_messages for existing SENT post_no_show    ← idempotency
       └─ createScheduledMessage(appointment_post_no_show, sendAt=now)
```

### Force override (silent correction)

```
PATCH /api/appointments/:id  { force: true, status: "show"|"no_show"|"scheduled" }
  └─ direct DB update only — no points, no WhatsApp queued
     response includes { forced: true, whatsappQueued: false }
```

Use `force` only to correct data-entry mistakes, not for normal appointment flow.

### Flow: soft delete

```
DELETE /api/appointments/:id
  └─ sets deleted_at
     └─ cancelAppointmentReminders(id) → lp_cancel_appointment_reminders() RPC
          cancels all SCHEDULED rows for this appointment where send_at > now()
          (post messages have send_at ≈ now so they are unaffected and will still fire)
```

### Cron worker

**`GET /api/jobs/dispatch-scheduled-messages`** — runs every minute (Vercel Cron).

- Requires `CRON_SECRET` (mandatory — returns 500 if missing, 401 if wrong).
- Claims up to 20 due messages atomically via `claim_due_scheduled_messages()` RPC (`FOR UPDATE SKIP LOCKED`).
- Calls `sendWhatsAppMessage()` for each → `markSent()` on success, `markFailed()` on error.
- Retry backoff: 30 s / 60 s / 90 s — max 4 attempts, then permanently `FAILED`.

### Anti-duplication guarantee

```sql
-- Unique partial index on scheduled_messages:
UNIQUE (entity_type, entity_id, message_type)
  WHERE status IN ('SCHEDULED', 'PROCESSING')
```

At most one active message per logical slot. `FAILED` and `CANCELLED` rows do not block new inserts.

---

## Legacy Schema (do not use)

These tables and columns exist in the database but are **not written to by any application code** since the outbox refactor (migration 024). They are kept temporarily for safe rollback.

**Migration 032 adds write-blocking triggers on all three legacy tables.**
Any accidental `INSERT`, `UPDATE`, or `DELETE` will raise a PostgreSQL exception with a clear message.

### Legacy tables

| Table | Created in | Status |
|---|---|---|
| `reminder_configs` | migration 001 | Deprecated — replaced by `appointment_notification_settings` |
| `reminder_sends` | migration 001 | Deprecated — replaced by `scheduled_messages` |
| `appointment_notifications` | migration 018 | Created but never used |

### Legacy columns on `appointments`

| Column | Status |
|---|---|
| `reminder1_sent_at` | Deprecated — not written since outbox refactor |
| `reminder2_sent_at` | Deprecated — not written since outbox refactor |
| `reminder3_sent_at` | Deprecated — not written since outbox refactor |
| `reminders_count` | Deprecated — not updated since outbox refactor |

> **Note:** `reminder_sends` is still referenced in `getAllAppointments()` and `getAppointmentList()`
> as a read-only join for the `notification_failed` UI indicator. This read path is safe and
> unaffected by the write-blocking trigger. It can be removed once the UI is updated.

---

## For developers: where to add new reminder logic

1. **Config**: add columns to `appointment_notification_settings` (or reuse existing reminder 1–3 slots).
2. **Scheduling**: call `scheduleAppointmentReminders(appointmentId)` — it reads settings and writes to `scheduled_messages`.
3. **Sending**: the universal cron `dispatch-scheduled-messages` handles it automatically.
4. **Do not touch**: `reminder_configs`, `reminder_sends`, `appointment_notifications`.

---

## Legacy cleanup plan

| Phase | Action | When |
|---|---|---|
| Now (done) | COMMENT ON + write-blocking triggers | migration 032 |
| Later | Remove `reminder_sends` join from `getAllAppointments` / `getAppointmentList` | After confirming UI no longer needs it |
| Later | DROP TABLE `reminder_configs`, `reminder_sends`, `appointment_notifications` | After ≥ 30 days of production stability |
| Later | DROP COLUMN `reminder1/2/3_sent_at`, `reminders_count` from `appointments` | Same window |
