/*
# Allow authenticated teachers to read admin_settings

1. Security Changes
- Add a new SELECT policy on `admin_settings` allowing all authenticated users to read
  the institution-wide assets (logo, seal, signature). These are non-sensitive images
  meant to appear on report cards and farhat nama certificates that teachers generate.
- The existing admin-only SELECT policy is kept (it is a subset of the new broader policy,
  but keeping it is harmless and maintains backward compatibility).
- INSERT, UPDATE, DELETE remain admin-only.
*/

DROP POLICY IF EXISTS "Teachers can read admin_settings" ON admin_settings;
CREATE POLICY "Teachers can read admin_settings"
  ON admin_settings FOR SELECT
  TO authenticated USING (true);
