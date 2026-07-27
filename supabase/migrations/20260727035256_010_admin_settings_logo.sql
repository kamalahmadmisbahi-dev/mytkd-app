/*
# Add logo_image_url to admin_settings

1. Modified Tables
- `admin_settings` — add `logo_image_url` (text) column to store the madrasa/institution logo URL.
  This logo will appear at the top center of the Farhat Nama certificate.
2. Security
- No policy changes. Existing admin-only RLS policies on admin_settings remain unchanged.
*/

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS logo_image_url text DEFAULT '';
