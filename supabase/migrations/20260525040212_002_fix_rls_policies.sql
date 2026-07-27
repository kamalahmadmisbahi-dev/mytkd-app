/*
  # Fix RLS Policies - Replace FOR ALL with Separate Per-Operation Policies

  1. Security Changes
    - Remove all "Admin can do everything on X" FOR ALL policies
    - Replace with separate SELECT, INSERT, UPDATE, DELETE policies for each table
    - This follows the security best practice of granular access control
    - Each policy is restricted to specific operations only

  2. Affected Tables
    - teachers
    - semesters
    - classes
    - books
    - publications
    - teacher_books
    - monthly_progress

  3. Policy Pattern
    - Admin SELECT: USING (is_admin())
    - Admin INSERT: WITH CHECK (is_admin())
    - Admin UPDATE: USING (is_admin()) WITH CHECK (is_admin())
    - Admin DELETE: USING (is_admin())
    - Teacher read policies remain unchanged
    - Teacher write policies remain unchanged
*/

-- Drop old FOR ALL policies
DROP POLICY IF EXISTS "Admin can do everything on teachers" ON teachers;
DROP POLICY IF EXISTS "Admin can do everything on semesters" ON semesters;
DROP POLICY IF EXISTS "Admin can do everything on classes" ON classes;
DROP POLICY IF EXISTS "Admin can do everything on books" ON books;
DROP POLICY IF EXISTS "Admin can do everything on publications" ON publications;
DROP POLICY IF EXISTS "Admin can do everything on teacher_books" ON teacher_books;
DROP POLICY IF EXISTS "Admin can do everything on monthly_progress" ON monthly_progress;

-- Teachers: Admin per-operation policies
CREATE POLICY "Admin can select teachers"
  ON teachers FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert teachers"
  ON teachers FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update teachers"
  ON teachers FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete teachers"
  ON teachers FOR DELETE
  TO authenticated
  USING (is_admin());

-- Semesters: Admin per-operation policies
CREATE POLICY "Admin can select semesters"
  ON semesters FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert semesters"
  ON semesters FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update semesters"
  ON semesters FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete semesters"
  ON semesters FOR DELETE
  TO authenticated
  USING (is_admin());

-- Classes: Admin per-operation policies
CREATE POLICY "Admin can select classes"
  ON classes FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete classes"
  ON classes FOR DELETE
  TO authenticated
  USING (is_admin());

-- Books: Admin per-operation policies
CREATE POLICY "Admin can select books"
  ON books FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (is_admin());

-- Publications: Admin per-operation policies
CREATE POLICY "Admin can select publications"
  ON publications FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert publications"
  ON publications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update publications"
  ON publications FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete publications"
  ON publications FOR DELETE
  TO authenticated
  USING (is_admin());

-- Teacher Books: Admin per-operation policies
CREATE POLICY "Admin can select teacher_books"
  ON teacher_books FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert teacher_books"
  ON teacher_books FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update teacher_books"
  ON teacher_books FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete teacher_books"
  ON teacher_books FOR DELETE
  TO authenticated
  USING (is_admin());

-- Monthly Progress: Admin per-operation policies
CREATE POLICY "Admin can select monthly_progress"
  ON monthly_progress FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admin can insert monthly_progress"
  ON monthly_progress FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin can update monthly_progress"
  ON monthly_progress FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin can delete monthly_progress"
  ON monthly_progress FOR DELETE
  TO authenticated
  USING (is_admin());

-- Add teacher delete policy for teacher_books (was missing)
CREATE POLICY "Teachers can delete own teacher_books"
  ON teacher_books FOR DELETE
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin());

-- Add teacher delete policy for monthly_progress (was missing)
CREATE POLICY "Teachers can delete own monthly_progress"
  ON monthly_progress FOR DELETE
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin());
