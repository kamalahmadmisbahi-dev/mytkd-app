/*
  # Allow teachers to read ALL semesters (for past-semester reports & dashboards)

  1. Security Changes
    - Replaces the existing "Teachers can read active semesters" SELECT policy on
      `semesters` with a new policy "Teachers can read all semesters" so that teachers
      can open past-semester reports and dashboards after a semester ends.
    - Admin access is unchanged (already covered by the admin SELECT policy added in 002).

  2. Why
    - The original policy `USING (is_active = true OR is_admin())` hid inactive/past
      semesters from teachers, so once a semester was deactivated they could no longer
      view its reports or dashboard. Report cards and dashboards need to reference any
      semester, active or not.

  3. Idempotent
    - Drops the old policy first, then creates the new one. Safe to re-run.
*/

DROP POLICY IF EXISTS "Teachers can read active semesters" ON semesters;
DROP POLICY IF EXISTS "Teachers can read all semesters" ON semesters;

CREATE POLICY "Teachers can read all semesters"
  ON semesters FOR SELECT
  TO authenticated
  USING (true);
