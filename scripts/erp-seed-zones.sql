-- Local development seed for the SwiftDrop ERP. Safe to run more than once.
INSERT INTO zones (id, code, name, active, version, created_at) VALUES
  (gen_random_uuid(), 'WP',  'Western',       TRUE, 0, now()),
  (gen_random_uuid(), 'CP',  'Central',       TRUE, 0, now()),
  (gen_random_uuid(), 'SP',  'Southern',      TRUE, 0, now()),
  (gen_random_uuid(), 'NP',  'Northern',      TRUE, 0, now()),
  (gen_random_uuid(), 'EP',  'Eastern',       TRUE, 0, now()),
  (gen_random_uuid(), 'NWP', 'North Western', TRUE, 0, now()),
  (gen_random_uuid(), 'NCP', 'North Central', TRUE, 0, now()),
  (gen_random_uuid(), 'UVA', 'Uva',           TRUE, 0, now()),
  (gen_random_uuid(), 'SAB', 'Sabaragamuwa',  TRUE, 0, now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO pricing_rules (id, origin_zone_id, destination_zone_id, base_fee, per_kg_fee,
                           small_size_surcharge, medium_size_surcharge, large_size_surcharge,
                           currency, active, version, created_at)
SELECT gen_random_uuid(), o.id, d.id,
       CASE WHEN o.id = d.id THEN 350.00 ELSE 450.00 END, 50.00,
       0.00, 100.00, 250.00, 'LKR', TRUE, 0, now()
FROM zones o CROSS JOIN zones d
ON CONFLICT (origin_zone_id, destination_zone_id) DO NOTHING;

SELECT id, code, name FROM zones ORDER BY code;

