-- 028_seed_mock_data.sql
-- Seed realistic mock data (orders, appointments, points, coupons) for existing clients.
-- Safe to run multiple times: only inserts if fewer than 3 orders exist for the business.

DO $$
DECLARE
  v_business_id UUID;
  v_client      RECORD;
  v_tier_ids    UUID[];
  v_tier_id     UUID;
  v_order_id    UUID;
  v_appt_id     UUID;
  v_offset      INTEGER := 0;
BEGIN
  -- Get first business that has clients
  SELECT DISTINCT business_id INTO v_business_id FROM clients LIMIT 1;
  IF v_business_id IS NULL THEN RETURN; END IF;

  -- Skip if already seeded (more than 3 orders)
  IF (SELECT COUNT(*) FROM orders WHERE business_id = v_business_id) > 3 THEN RETURN; END IF;

  -- Collect tier IDs for this business
  SELECT ARRAY(SELECT id FROM loyalty_tiers WHERE business_id = v_business_id ORDER BY required_points)
    INTO v_tier_ids;

  FOR v_client IN
    SELECT id FROM clients WHERE business_id = v_business_id ORDER BY created_at LIMIT 6
  LOOP
    v_offset := v_offset + 1;

    -- ── Orders ──────────────────────────────────────────────────────────
    INSERT INTO orders (client_id, business_id, reference, amount, status, created_at) VALUES
      (v_client.id, v_business_id, 'CMD-' || (1000 + v_offset * 3 - 2), 55.00, 'picked_up',
        NOW() - (v_offset * 3 + 2  || ' days')::INTERVAL),
      (v_client.id, v_business_id, 'CMD-' || (1000 + v_offset * 3 - 1), 32.50, 'picked_up',
        NOW() - (v_offset * 3 + 10 || ' days')::INTERVAL),
      (v_client.id, v_business_id, 'CMD-' || (1000 + v_offset * 3),     78.00, 'pending',
        NOW() - (v_offset          || ' hours')::INTERVAL);

    -- ── Appointments ────────────────────────────────────────────────────
    INSERT INTO appointments (client_id, business_id, scheduled_at, status, created_at) VALUES
      (v_client.id, v_business_id,
        NOW() - ((v_offset * 5 + 3) || ' days')::INTERVAL, 'show',
        NOW() - ((v_offset * 5 + 10) || ' days')::INTERVAL),
      (v_client.id, v_business_id,
        NOW() - ((v_offset * 12) || ' days')::INTERVAL, 'no_show',
        NOW() - ((v_offset * 12 + 7) || ' days')::INTERVAL),
      (v_client.id, v_business_id,
        NOW() + ((v_offset * 2 + 1) || ' days')::INTERVAL, 'scheduled',
        NOW());

    -- ── Points log ──────────────────────────────────────────────────────
    INSERT INTO points_log (client_id, business_id, source_type, points_delta, cycle_points_before, cycle_points_after, created_at) VALUES
      (v_client.id, v_business_id, 'manual', 15, 0,  15, NOW() - ((v_offset * 10 + 5) || ' days')::INTERVAL),
      (v_client.id, v_business_id, 'order',  10, 15, 25, NOW() - ((v_offset * 3 + 2)  || ' days')::INTERVAL),
      (v_client.id, v_business_id, 'order',   5, 25, 30, NOW() - ((v_offset)           || ' days')::INTERVAL);

    -- Update client loyalty points
    UPDATE clients SET loyalty_points = 30, current_cycle_points = 30 WHERE id = v_client.id;

    -- ── Coupons (only if tiers exist) ────────────────────────────────────
    IF array_length(v_tier_ids, 1) > 0 THEN
      v_tier_id := v_tier_ids[1];

      INSERT INTO coupons (client_id, tier_id, status, expires_at, created_at, source) VALUES
        (v_client.id, v_tier_id, 'active',
          NOW() + INTERVAL '30 days',
          NOW() - (v_offset || ' days')::INTERVAL,
          'tier_unlock'),
        (v_client.id, v_tier_id, 'used',
          NOW() - INTERVAL '5 days',
          NOW() - ((v_offset + 30) || ' days')::INTERVAL,
          'tier_unlock'),
        (v_client.id, v_tier_id, 'expired',
          NOW() - INTERVAL '2 days',
          NOW() - ((v_offset + 60) || ' days')::INTERVAL,
          'tier_unlock');

      -- Second tier if available
      IF array_length(v_tier_ids, 1) > 1 THEN
        v_tier_id := v_tier_ids[2];
        INSERT INTO coupons (client_id, tier_id, status, expires_at, created_at, source) VALUES
          (v_client.id, v_tier_id, 'active',
            NOW() + INTERVAL '20 days',
            NOW() - ((v_offset + 5) || ' days')::INTERVAL,
            'tier_unlock');
      END IF;
    END IF;

  END LOOP;
END $$;
