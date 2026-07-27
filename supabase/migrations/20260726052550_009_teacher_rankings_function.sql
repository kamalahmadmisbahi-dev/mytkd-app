/*
  # Teacher rankings RPC function

  Computes per-teacher average overall percentage for a semester and assigns
  competition ranking (same percentage = same rank). Runs as SECURITY DEFINER
  so teachers can read rankings across ALL teachers without being blocked by
  the per-teacher RLS policies on teacher_books / monthly_progress.

  Returns: teacher_id, teacher_name, average_percentage, rank, total_teachers
*/

CREATE OR REPLACE FUNCTION public.get_teacher_rankings(p_semester_id uuid)
RETURNS TABLE (
  teacher_id uuid,
  teacher_name text,
  average_percentage integer,
  rank integer,
  total_teachers integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  CREATE TEMP TABLE _rank_data ON COMMIT DROP AS
  SELECT
    t.id AS teacher_id,
    t.name AS teacher_name,
    COALESCE(ROUND(AVG(
      LEAST(100, CASE WHEN tb.total_pages > 0
        THEN (COALESCE(SUM(mp.pages_taught) FILTER (WHERE mp.id IS NOT NULL), 0) / tb.total_pages) * 100
        ELSE 0 END)
    )), 0)::integer AS average_percentage
  FROM teachers t
  JOIN teacher_books tb ON tb.teacher_id = t.id AND tb.semester_id = p_semester_id
  LEFT JOIN monthly_progress mp ON mp.teacher_book_id = tb.id AND mp.semester_id = p_semester_id
  GROUP BY t.id, t.name;

  SELECT COUNT(*) INTO v_total FROM _rank_data;

  RETURN QUERY
  SELECT
    r.teacher_id,
    r.teacher_name,
    r.average_percentage,
    (SELECT COUNT(*) + 1 FROM _rank_data r2 WHERE r2.average_percentage > r.average_percentage)::integer AS rank,
    v_total::integer AS total_teachers
  FROM _rank_data r
  ORDER BY r.average_percentage DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_rankings(uuid) TO authenticated;
