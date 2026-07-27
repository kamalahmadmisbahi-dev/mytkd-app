-- Table to track teachers who can edit past months progress (after 3rd of month)
-- Admin can unlock specific teachers to fill past month progress

CREATE TABLE IF NOT EXISTS progress_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  can_edit_past_months boolean DEFAULT true,
  unlocked_by uuid REFERENCES auth.users(id),
  unlocked_at timestamptz DEFAULT now(),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(teacher_id)
);

-- Enable RLS
ALTER TABLE progress_overrides ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin can do everything on progress_overrides"
  ON progress_overrides FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Teachers can read their own overrides
CREATE POLICY "Teachers can read own progress_overrides"
  ON progress_overrides FOR SELECT
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin());

-- Index
CREATE INDEX IF NOT EXISTS idx_progress_overrides_teacher ON progress_overrides(teacher_id);
