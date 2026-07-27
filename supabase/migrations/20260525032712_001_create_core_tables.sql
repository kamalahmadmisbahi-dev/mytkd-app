/*
  # Create Core Tables for Madrasa Academic Performance Management

  1. New Tables
    - `teachers` - Stores teacher profiles with login credentials
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text, Urdu name)
      - `login_id` (text, unique, for login)
      - `phone` (text)
      - `qualification` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)

    - `semesters` - Academic semester management
      - `id` (uuid, primary key)
      - `title` (text, Urdu title)
      - `year` (integer)
      - `semester_type` (text: 'first' or 'second')
      - `start_date` (date)
      - `end_date` (date)
      - `total_academic_days` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamp)

    - `classes` - Madrasa class/group management
      - `id` (uuid, primary key)
      - `name` (text, Urdu name)
      - `level` (integer, order)
      - `is_active` (boolean)
      - `created_at` (timestamp)

    - `books` - Subject books management
      - `id` (uuid, primary key)
      - `name` (text, Urdu name)
      - `subject` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)

    - `publications` - Publication/Matbooah management
      - `id` (uuid, primary key)
      - `name` (text, Urdu name)
      - `is_active` (boolean)
      - `created_at` (timestamp)

    - `teacher_books` - Teacher semester book assignments
      - `id` (uuid, primary key)
      - `teacher_id` (uuid, references teachers)
      - `semester_id` (uuid, references semesters)
      - `class_id` (uuid, references classes)
      - `book_id` (uuid, references books)
      - `publication_id` (uuid, references publications)
      - `total_pages` (integer)
      - `target_pages` (integer, semester target)
      - `start_lesson` (text)
      - `end_lesson` (text)
      - `daily_target` (numeric, auto-calculated)
      - `monthly_target` (numeric, auto-calculated)
      - `required_completion_percentage` (numeric)
      - `created_at` (timestamp)

    - `monthly_progress` - Monthly progress entries by teachers
      - `id` (uuid, primary key)
      - `teacher_book_id` (uuid, references teacher_books)
      - `teacher_id` (uuid, references teachers)
      - `semester_id` (uuid, references semesters)
      - `month` (integer, 1-12)
      - `year` (integer)
      - `pages_taught` (integer)
      - `current_lesson_end` (text)
      - `current_page` (integer)
      - `notes` (text)
      - `quality_remarks` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Admin can access all data
    - Teachers can only access their own data
*/

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  login_id text UNIQUE NOT NULL,
  phone text DEFAULT '',
  qualification text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Semesters table
CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  year integer NOT NULL,
  semester_type text NOT NULL DEFAULT 'first' CHECK (semester_type IN ('first', 'second')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_academic_days integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  level integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Books table
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Publications table
CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Teacher Books (semester assignments) table
CREATE TABLE IF NOT EXISTS teacher_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id),
  book_id uuid NOT NULL REFERENCES books(id),
  publication_id uuid REFERENCES publications(id),
  total_pages integer NOT NULL DEFAULT 0,
  target_pages integer NOT NULL DEFAULT 0,
  start_lesson text DEFAULT '',
  end_lesson text DEFAULT '',
  daily_target numeric DEFAULT 0,
  monthly_target numeric DEFAULT 0,
  required_completion_percentage numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(teacher_id, semester_id, class_id, book_id)
);

-- Monthly Progress table
CREATE TABLE IF NOT EXISTS monthly_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_book_id uuid NOT NULL REFERENCES teacher_books(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id),
  semester_id uuid NOT NULL REFERENCES semesters(id),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL,
  pages_taught integer NOT NULL DEFAULT 0,
  current_lesson_end text DEFAULT '',
  current_page integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  quality_remarks text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(teacher_book_id, month, year)
);

-- Enable RLS on all tables
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_progress ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get teacher id from auth uid
CREATE OR REPLACE FUNCTION get_teacher_id()
RETURNS uuid AS $$
  SELECT id FROM teachers WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Teachers policies
CREATE POLICY "Admin can do everything on teachers"
  ON teachers FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read own profile"
  ON teachers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Teachers can update own profile"
  ON teachers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Semesters policies
CREATE POLICY "Admin can do everything on semesters"
  ON semesters FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read active semesters"
  ON semesters FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin());

-- Classes policies
CREATE POLICY "Admin can do everything on classes"
  ON classes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read active classes"
  ON classes FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin());

-- Books policies
CREATE POLICY "Admin can do everything on books"
  ON books FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read active books"
  ON books FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin());

-- Publications policies
CREATE POLICY "Admin can do everything on publications"
  ON publications FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read active publications"
  ON publications FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin());

-- Teacher Books policies
CREATE POLICY "Admin can do everything on teacher_books"
  ON teacher_books FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read own teacher_books"
  ON teacher_books FOR SELECT
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin());

CREATE POLICY "Teachers can insert own teacher_books"
  ON teacher_books FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = get_teacher_id() OR is_admin());

CREATE POLICY "Teachers can update own teacher_books"
  ON teacher_books FOR UPDATE
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin())
  WITH CHECK (teacher_id = get_teacher_id() OR is_admin());

-- Monthly Progress policies
CREATE POLICY "Admin can do everything on monthly_progress"
  ON monthly_progress FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Teachers can read own monthly_progress"
  ON monthly_progress FOR SELECT
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin());

CREATE POLICY "Teachers can insert own monthly_progress"
  ON monthly_progress FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = get_teacher_id() OR is_admin());

CREATE POLICY "Teachers can update own monthly_progress"
  ON monthly_progress FOR UPDATE
  TO authenticated
  USING (teacher_id = get_teacher_id() OR is_admin())
  WITH CHECK (teacher_id = get_teacher_id() OR is_admin());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_teacher_books_teacher ON teacher_books(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_books_semester ON teacher_books(semester_id);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_teacher ON monthly_progress(teacher_id);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_semester ON monthly_progress(semester_id);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_teacher_book ON monthly_progress(teacher_book_id);
