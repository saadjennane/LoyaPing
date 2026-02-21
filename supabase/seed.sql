-- =========================================
-- MOCK DATA — dev only
-- Run in Supabase SQL editor after migrations
-- Safe to re-run (ON CONFLICT DO NOTHING)
-- =========================================

-- ── Clients ──────────────────────────────────────────────────────────────────
INSERT INTO clients (id, business_id, civility, first_name, last_name, phone_number, loyalty_points, current_cycle_points, total_cycles_completed)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mr',  'Youssef', 'Benali',  '+212612345678', 12, 2,  1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Mme', 'Fatima',  'Ziani',   '+212698765432', 8,  8,  0),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Mr',  'Karim',   'Tahiri',  '+212655443322', 3,  3,  0),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Mme', 'Nadia',   'Chraibi', '+212677889900', 20, 0,  2),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Mr',  'Mohamed', 'Alaoui',  '+212633221100', 5,  5,  0)
ON CONFLICT DO NOTHING;

-- ── Loyalty program ───────────────────────────────────────────────────────────
INSERT INTO loyalty_programs (id, business_id, type, is_active)
VALUES ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'passage', true)
ON CONFLICT DO NOTHING;

-- ── Loyalty tiers ─────────────────────────────────────────────────────────────
INSERT INTO loyalty_tiers (id, business_id, tier_order, required_points, reward_description, validity_days)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1,  5,  'Café offert',                   30),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2, 10,  '-20% sur la prochaine commande', 30),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 3, 20,  'Livraison offerte',              60),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 4, 30,  'Commande offerte',               90)
ON CONFLICT DO NOTHING;

-- ── Orders ────────────────────────────────────────────────────────────────────
INSERT INTO orders (id, client_id, business_id, reference, amount, status, ready_at, picked_up_at, points_credited, created_at)
VALUES
  -- En cours (pending)
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'CMD-001', 150, 'pending', NULL, NULL, false, NOW() - INTERVAL '2 hours'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
    'CMD-002', 0,   'pending', NULL, NULL, false, NOW() - INTERVAL '45 minutes'),

  -- En attente (ready)
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    'CMD-003', 320, 'ready', NOW() - INTERVAL '30 minutes', NULL, false, NOW() - INTERVAL '3 hours'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
    'CMD-004', 75,  'ready', NOW() - INTERVAL '1 hour',    NULL, false, NOW() - INTERVAL '4 hours'),

  -- Récupérées (picked_up)
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
    'CMD-005', 200, 'picked_up', NOW() - INTERVAL '5 hours',  NOW() - INTERVAL '3 hours',  true,  NOW() - INTERVAL '8 hours'),
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'CMD-006', 90,  'picked_up', NOW() - INTERVAL '2 days',   NOW() - INTERVAL '2 days' + INTERVAL '2 hours', true, NOW() - INTERVAL '2 days'),
  ('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    'CMD-007', 450, 'picked_up', NOW() - INTERVAL '3 days',   NOW() - INTERVAL '3 days' + INTERVAL '1 hour',  true, NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- ── Order messages ────────────────────────────────────────────────────────────
-- CMD-003 : envoyé ✓
-- CMD-004 : échec ✗ → déclenchera le warning banner
INSERT INTO order_messages (id, order_id, type, status, error_message, created_at)
VALUES
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'ready_notification', 'sent',   NULL,
    NOW() - INTERVAL '30 minutes'),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'ready_notification', 'failed', 'Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID',
    NOW() - INTERVAL '1 hour'),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', 'ready_notification', 'sent',   NULL,
    NOW() - INTERVAL '5 hours'),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000006', 'ready_notification', 'sent',   NULL,
    NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- ── Appointments ──────────────────────────────────────────────────────────────
INSERT INTO appointments (id, client_id, business_id, scheduled_at, status, points_credited, notes, created_at)
VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '2 days',  'scheduled', false, NULL,                    NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '3 days',  'scheduled', false, 'Consultation coloriste', NOW() - INTERVAL '2 days'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '1 day',   'scheduled', false, 'Coupe + soin',           NOW() - INTERVAL '1 hour'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 day',   'show',      true,  NULL,                    NOW() - INTERVAL '3 days'),
  ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '2 days',  'no_show',   false, NULL,                    NOW() - INTERVAL '4 days')
ON CONFLICT DO NOTHING;

-- ── Reminder configs ──────────────────────────────────────────────────────────
INSERT INTO reminder_configs (id, business_id, reminder_order, offset_minutes, message, is_active)
VALUES
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 1440,
    'Bonjour ! Rappel : vous avez un rendez-vous demain. À bientôt !', true),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2, 60,
    'Rappel : votre rendez-vous est dans 1 heure. Nous vous attendons !', true)
ON CONFLICT DO NOTHING;

-- ── Coupons ───────────────────────────────────────────────────────────────────
-- Nadia (20 pts → tier 3 : Livraison offerte)
-- Youssef (12 pts → tier 2 : -20%)
INSERT INTO coupons (id, client_id, tier_id, status, expires_at, created_at)
VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003',
    'active', NOW() + INTERVAL '60 days', NOW() - INTERVAL '1 day'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
    'active', NOW() + INTERVAL '30 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ── Reminder sends ─────────────────────────────────────────────────────────────
-- Appt 1 (Youssef, tomorrow)   : J-1 envoyé ✓
-- Appt 3 (Mohamed, tomorrow)   : J-1 échoué ✗ → déclenchera le warning banner
-- Appt 4 (Karim, show/passé)   : J-1 envoyé ✓
INSERT INTO reminder_sends (id, appointment_id, reminder_config_id, status, error_message, sent_at)
VALUES
  ('A0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
    'sent',   NULL,                                                             NOW() - INTERVAL '1 hour'),
  ('A0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001',
    'failed', 'Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID',         NOW() - INTERVAL '2 hours'),
  ('A0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000001',
    'sent',   NULL,                                                             NOW() - INTERVAL '4 days')
ON CONFLICT DO NOTHING;

-- ── Points log ────────────────────────────────────────────────────────────────
INSERT INTO points_log (id, client_id, business_id, source_type, source_id, points_delta, cycle_points_before, cycle_points_after, created_at)
VALUES
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    'order', '40000000-0000-0000-0000-000000000006', 1, 1, 2, NOW() - INTERVAL '2 days'),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
    'order', '40000000-0000-0000-0000-000000000007', 1, 7, 8, NOW() - INTERVAL '3 days'),
  ('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
    'order', '40000000-0000-0000-0000-000000000005', 1, 4, 5, NOW() - INTERVAL '5 hours'),
  ('90000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
    'appointment', '50000000-0000-0000-0000-000000000004', 1, 2, 3, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;
