/*
  # Add profile assets (photo, signature) and admin settings (seal, signature)

  1. New Tables
    - `admin_settings` - Single-row table holding institution-wide assets used in report cards
      - `id` (int, primary key, always 1)
      - `seal_image_url` (text) - URL to the madrasa seal/stamp image (مہر جامعہ)
      - `signature_image_url` (text) - URL to the nazeem-e-taleemat signature image (دستخط ناظم تعلیمات)
      - `updated_at` (timestamptz)
      - `updated_by` (uuid, references auth.users)

  2. Modified Tables
    - `teachers`
      - `photo_url` (text) - optional profile photo URL
      - `signature_url` (text) - optional signature image URL used in teacher report cards
    Both columns are nullable and default to empty string so existing rows are unaffected.

  3. Storage
    - Creates a public storage bucket `profile-assets` for uploading teacher photos, teacher
      signatures, the admin seal, and the admin signature. Files are stored with a path that
      encodes the owner so the RLS policies below can enforce ownership.
      Path conventions:
        teachers/{teacher_id}/photo.{ext}
        teachers/{teacher_id}/signature.{ext}
        admin/seal.{ext}
        admin/signature.{ext}

  4. Security
    - `admin_settings`: only admins can SELECT / INSERT / UPDATE / DELETE.
    - `teachers.photo_url` and `teachers.signature_url`: teachers can update their own row
      (existing policy already covers this) and admins can update any row (existing).
    - Storage bucket `profile-assets`:
      - SELECT (read/download): public (anon) so the PDF generator and <img> tags can fetch
        the images without an authenticated session. The images are non-sensitive (photos,
        signatures, seal) and are meant to appear on printed report cards.
      - INSERT/UPDATE/DELETE: authenticated users can write only into their own folder.
        Teachers can write only under `teachers/{own_teacher_id}/...`.
        Admins can write anywhere (including `admin/...`).

  5. Notes
    - The migration is idempotent: re-running is safe.
    - `admin_settings` is seeded with a single row (id = 1) if none exists.
*/

-- ---------- teachers: photo + signature columns ----------
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS signature_url text DEFAULT '';

-- ---------- admin_settings table ----------
CREATE TABLE IF NOT EXISTS admin_settings (
  id integer PRIMARY KEY DEFAULT 1,
  seal_image_url text DEFAULT '',
  signature_image_url text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT admin_settings_singleton CHECK (id = 1)
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Seed the singleton row if missing
INSERT INTO admin_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Admin-only policies on admin_settings
DROP POLICY IF EXISTS "Admin can select admin_settings" ON admin_settings;
CREATE POLICY "Admin can select admin_settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can insert admin_settings" ON admin_settings;
CREATE POLICY "Admin can insert admin_settings"
  ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can update admin_settings" ON admin_settings;
CREATE POLICY "Admin can update admin_settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can delete admin_settings" ON admin_settings;
CREATE POLICY "Admin can delete admin_settings"
  ON admin_settings FOR DELETE
  TO authenticated
  USING (is_admin());

-- ---------- Storage bucket for profile assets ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-assets', 'profile-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Helper: is the current user an admin? (re-declared defensively; no-op if exists)
-- is_admin() already defined in 001_create_core_tables.

-- Storage policies: public read, owner-scoped write
-- Teachers can manage files under teachers/{their own teacher id}/...
-- Admins can manage anything.

-- SELECT (public read)
DROP POLICY IF EXISTS "public read profile-assets" ON storage.objects;
CREATE POLICY "public read profile-assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'profile-assets');

-- INSERT
DROP POLICY IF EXISTS "auth insert profile-assets" ON storage.objects;
CREATE POLICY "auth insert profile-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-assets'
    AND (
      is_admin()
      OR (
        (storage.foldername(name))[1] = 'teachers'
        AND (storage.foldername(name))[2] = get_teacher_id()::text
      )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "auth update profile-assets" ON storage.objects;
CREATE POLICY "auth update profile-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-assets'
    AND (
      is_admin()
      OR (
        (storage.foldername(name))[1] = 'teachers'
        AND (storage.foldername(name))[2] = get_teacher_id()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'profile-assets'
    AND (
      is_admin()
      OR (
        (storage.foldername(name))[1] = 'teachers'
        AND (storage.foldername(name))[2] = get_teacher_id()::text
      )
    )
  );

-- DELETE
DROP POLICY IF EXISTS "auth delete profile-assets" ON storage.objects;
CREATE POLICY "auth delete profile-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-assets'
    AND (
      is_admin()
      OR (
        (storage.foldername(name))[1] = 'teachers'
        AND (storage.foldername(name))[2] = get_teacher_id()::text
      )
    )
  );
