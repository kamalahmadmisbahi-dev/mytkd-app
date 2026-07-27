/*
# Result Performance Tables

## Purpose
Two new tables to track exam result performance:
1. `teacher_result_performance` — teachers record per-book exam results (present students, failed students) after semester completion.
2. `admin_class_performance` — admins record per-class grade-wise results (total, present, absent, mumtaz-ma-sharaf, mumtaz, jaid-juda, jaid, maqbool, nakam) with auto-calculated success percentage and quality.

## New Tables

### teacher_result_performance
- `id` (uuid, PK)
- `teacher_id` (uuid, FK to teachers)
- `semester_id` (uuid, FK to semesters)
- `class_id` (uuid, FK to classes)
- `teacher_book_id` (uuid, FK to teacher_books) — the book this result is for
- `book_name` (text) — denormalized book name
- `class_name` (text) — denormalized class name
- `total_present` (int) — total students present in exam
- `total_failed` (int) — failed students count
- `percentage` (numeric) — auto-calculated: ((total_present - total_failed) / total_present) * 100
- `quality` (text) — auto-calculated from percentage
- `created_at` (timestamptz)

### admin_class_performance
- `id` (uuid, PK)
- `semester_id` (uuid, FK to semesters)
- `class_id` (uuid, FK to classes)
- `class_name` (text) — denormalized
- `total_students` (int)
- `present` (int)
- `absent` (int)
- `mumtaz_ma_sharaf` (int) — ممتاز مع الشرف
- `mumtaz` (int) — ممتاز
- `jaid_juda` (int) — جید جدا
- `jaid` (int) — جید
- `maqbool` (int) — مقبول
- `nakam` (int) — ناکام
- `percentage` (numeric) — success percentage: (present - nakam) / present * 100, or (mumtaz_ma_sharaf + mumtaz + jaid_juda + jaid + maqbool) / present * 100
- `quality` (text) — auto from percentage
- `created_at` (timestamptz)

## Quality Scale (both tables)
- >= 80: ممتاز
- 70-79: بہتر
- 60-69: مناسب
- 40-59: کمزور
- < 40: تشویش ناک

## Security
- RLS enabled on both tables.
- Teacher table: teachers can CRUD their own rows (auth.uid() = teachers.user_id join).
- Admin table: only admin role can CRUD (auth.uid() app_metadata role = admin).
- All authenticated users can read admin_class_performance.
*/

-- Teacher result performance
CREATE TABLE IF NOT EXISTS teacher_result_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_book_id uuid REFERENCES teacher_books(id) ON DELETE SET NULL,
  book_name text NOT NULL DEFAULT '',
  class_name text NOT NULL DEFAULT '',
  total_present integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  quality text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teacher_result_performance ENABLE ROW LEVEL SECURITY;

-- Teachers can read their own rows
DROP POLICY IF EXISTS "select_own_teacher_results" ON teacher_result_performance;
CREATE POLICY "select_own_teacher_results" ON teacher_result_performance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()));

-- Teachers can insert their own rows
DROP POLICY IF EXISTS "insert_own_teacher_results" ON teacher_result_performance;
CREATE POLICY "insert_own_teacher_results" ON teacher_result_performance
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()));

-- Teachers can update their own rows
DROP POLICY IF EXISTS "update_own_teacher_results" ON teacher_result_performance;
CREATE POLICY "update_own_teacher_results" ON teacher_result_performance
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()));

-- Teachers can delete their own rows
DROP POLICY IF EXISTS "delete_own_teacher_results" ON teacher_result_performance;
CREATE POLICY "delete_own_teacher_results" ON teacher_result_performance
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()));

-- Admin can read all teacher results
DROP POLICY IF EXISTS "admin_read_teacher_results" ON teacher_result_performance;
CREATE POLICY "admin_read_teacher_results" ON teacher_result_performance
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Admin class performance
CREATE TABLE IF NOT EXISTS admin_class_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  class_name text NOT NULL DEFAULT '',
  total_students integer NOT NULL DEFAULT 0,
  present integer NOT NULL DEFAULT 0,
  absent integer NOT NULL DEFAULT 0,
  mumtaz_ma_sharaf integer NOT NULL DEFAULT 0,
  mumtaz integer NOT NULL DEFAULT 0,
  jaid_juda integer NOT NULL DEFAULT 0,
  jaid integer NOT NULL DEFAULT 0,
  maqbool integer NOT NULL DEFAULT 0,
  nakam integer NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  quality text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_class_performance ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
DROP POLICY IF EXISTS "read_admin_class_performance" ON admin_class_performance;
CREATE POLICY "read_admin_class_performance" ON admin_class_performance
  FOR SELECT TO authenticated
  USING (true);

-- Only admin can insert
DROP POLICY IF EXISTS "admin_insert_class_performance" ON admin_class_performance;
CREATE POLICY "admin_insert_class_performance" ON admin_class_performance
  FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Only admin can update
DROP POLICY IF EXISTS "admin_update_class_performance" ON admin_class_performance;
CREATE POLICY "admin_update_class_performance" ON admin_class_performance
  FOR UPDATE TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Only admin can delete
DROP POLICY IF EXISTS "admin_delete_class_performance" ON admin_class_performance;
CREATE POLICY "admin_delete_class_performance" ON admin_class_performance
  FOR DELETE TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trp_teacher_semester ON teacher_result_performance(teacher_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_acp_semester_class ON admin_class_performance(semester_id, class_id);
