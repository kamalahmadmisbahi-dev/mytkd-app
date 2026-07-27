/*
  # Add monthly academic days to semesters

  1. Changes
    - Add columns for monthly academic days (month_1 through month_12)
    - Each column stores the number of academic days for that month in the semester

  2. Notes
    - Allows tracking varying academic days per month
    - Used for calculating monthly targets more accurately
*/

ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_1_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_2_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_3_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_4_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_5_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_6_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_7_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_8_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_9_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_10_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_11_days integer DEFAULT 0;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS month_12_days integer DEFAULT 0;
