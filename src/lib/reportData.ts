import { supabase } from './supabase';
import type { Teacher, Semester, TeacherBook, MonthlyProgress } from '../types';
import type { ReportCardData, ReportCardBookRow, ReportCardMonthColumn } from './reportCardPdf';

export const urduMonths = [
  '', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون',
  'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر',
];

export const getQuality = (pct: number): string =>
  pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';

export const capPercent = (pct: number): number => Math.min(100, pct);

// Monthly target based on remaining pages and remaining academic days
export function getMonthlyTargetForMonth(
  totalPages: number,
  semester: Semester | null,
  month: number,
  pagesTaughtBeforeMonth: number
): number {
  if (!semester || !semester.total_academic_days || semester.total_academic_days === 0) {
    return 0;
  }
  const remainingPages = totalPages - pagesTaughtBeforeMonth;
  if (remainingPages <= 0) return 0;

  const monthDays = (semester as any)[`month_${month}_days`] || 0;
  if (monthDays === 0) return 0;

  let remainingDays = 0;
  for (let m = month; m <= 12; m++) {
    remainingDays += (semester as any)[`month_${m}_days`] || 0;
  }
  if (remainingDays <= 0) return 0;

  const dailyRate = remainingPages / remainingDays;
  return Math.min(remainingPages, Math.round(dailyRate * monthDays));
}

export interface SemesterBookStats {
  book: TeacherBook & { class?: any };
  totalTaught: number;
  overallPercentage: number;
  isCompleted: boolean;
  monthlyByMonth: Record<string, { month: number; year: number; pages: number; lesson: string; page: number }>;
}

// Compute per-book stats for a given semester
export function computeBookStats(
  teacherBooks: (TeacherBook & { class?: any })[],
  progress: MonthlyProgress[]
): Map<string, SemesterBookStats> {
  const map = new Map<string, SemesterBookStats>();
  for (const tb of teacherBooks) {
    const entries = progress.filter(mp => mp.teacher_book_id === tb.id);
    const totalTaught = entries.reduce((s, mp) => s + mp.pages_taught, 0);
    const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
    const overallPercentage = capPercent(overallPctRaw);
    const isCompleted = overallPctRaw >= 100;

    const monthlyByMonth: Record<string, { month: number; year: number; pages: number; lesson: string; page: number }> = {};
    for (const mp of entries) {
      const key = `${mp.year}-${mp.month}`;
      if (!monthlyByMonth[key]) {
        monthlyByMonth[key] = { month: mp.month, year: mp.year, pages: 0, lesson: '', page: 0 };
      }
      monthlyByMonth[key].pages += mp.pages_taught;
      monthlyByMonth[key].lesson = mp.current_lesson_end || '';
      monthlyByMonth[key].page = mp.current_page || 0;
    }

    map.set(tb.id, {
      book: tb,
      totalTaught,
      overallPercentage: Math.round(overallPercentage),
      isCompleted,
      monthlyByMonth,
    });
  }
  return map;
}

// Get cumulative pages taught before a given month/year
export function cumulativeBefore(
  stats: SemesterBookStats,
  month: number,
  year: number
): number {
  let total = 0;
  for (const key in stats.monthlyByMonth) {
    const m = stats.monthlyByMonth[key];
    if (m.year < year || (m.year === year && m.month < month)) {
      total += m.pages;
    }
  }
  return total;
}

// Get all months covered by a semester (year-month pairs)
export function getSemesterMonths(semester: Semester): { month: number; year: number }[] {
  const months: { month: number; year: number }[] = [];
  const start = new Date(semester.start_date);
  const end = new Date(semester.end_date);
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endM) {
    months.push({ month: cur.getMonth() + 1, year: cur.getFullYear() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// Compute monthly percentage for a book in a given month
export function monthlyPercentageFor(
  stats: SemesterBookStats,
  semester: Semester | null,
  month: number,
  year: number
): number | null {
  const cumulativeBeforeMonth = cumulativeBefore(stats, month, year);
  const wasCompletedBefore =
    stats.book.total_pages > 0 &&
    cumulativeBeforeMonth / stats.book.total_pages >= 100;

  // If already completed before this month, show 100%
  if (wasCompletedBefore) return 100;

  const key = `${year}-${month}`;
  const m = stats.monthlyByMonth[key];
  const monthPages = m?.pages || 0;
  const target = getMonthlyTargetForMonth(
    stats.book.total_pages,
    semester,
    month,
    cumulativeBeforeMonth
  );
  if (target <= 0) return null;

  const cumulativeUpToThisMonth = cumulativeBeforeMonth + monthPages;
  const isCompletedThisMonth =
    stats.book.total_pages > 0 &&
    cumulativeUpToThisMonth / stats.book.total_pages >= 100;

  // If completed in this month, show 100%
  if (isCompletedThisMonth) return 100;

  return capPercent(Math.round((monthPages / target) * 100));
}

// Check if a teacher has fully filled all monthly progress for a semester.
// "Fully filled" = every month in the semester has at least one progress entry
// for every assigned book (i.e. no month is missing).
export async function isSemesterFullyFilled(
  teacherId: string,
  semester: Semester
): Promise<boolean> {
  const [tbRes, mpRes] = await Promise.all([
    supabase
      .from('teacher_books')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('semester_id', semester.id),
    supabase
      .from('monthly_progress')
      .select('teacher_book_id, month, year')
      .eq('teacher_id', teacherId)
      .eq('semester_id', semester.id),
  ]);
  const teacherBooks = (tbRes.data as any[]) || [];
  const progress = (mpRes.data as any[]) || [];
  if (teacherBooks.length === 0) return false;

  const semesterMonths = getSemesterMonths(semester);
  if (semesterMonths.length === 0) return false;

  // For each book, every semester month must have at least one entry
  for (const tb of teacherBooks) {
    for (const m of semesterMonths) {
      const has = progress.some(
        mp =>
          mp.teacher_book_id === tb.id &&
          mp.month === m.month &&
          mp.year === m.year
      );
      if (!has) return false;
    }
  }
  return true;
}

// Fetch everything needed for a teacher's report card for a given semester
export async function fetchTeacherSemesterReportData(
  teacherId: string,
  semester: Semester,
  teacher: Teacher | null,
  adminAssets?: { sealUrl?: string; signatureUrl?: string },
  mode: 'monthly' | 'semester_first' | 'semester_second' = 'monthly',
  selectedMonth?: { month: number; year: number }
): Promise<ReportCardData> {
  const [tbRes, mpRes] = await Promise.all([
    supabase
      .from('teacher_books')
      .select('*, class:classes(*)')
      .eq('teacher_id', teacherId)
      .eq('semester_id', semester.id),
    supabase
      .from('monthly_progress')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('semester_id', semester.id),
  ]);

  const teacherBooks = (tbRes.data as any[]) || [];
  const progress = (mpRes.data as any[]) || [];
  const stats = computeBookStats(teacherBooks, progress);

  // For monthly mode, only include the selected month column.
  // For semester mode, include all semester months (used for reference but table shows overall only).
  let monthColumns: ReportCardMonthColumn[];
  let selectedMonthLabel: string | undefined;

  if (mode === 'monthly' && selectedMonth) {
    monthColumns = [{
      month: selectedMonth.month,
      year: selectedMonth.year,
      label: `${urduMonths[selectedMonth.month]} ${selectedMonth.year}`,
    }];
    selectedMonthLabel = `${urduMonths[selectedMonth.month]} ${selectedMonth.year}`;
  } else {
    const semesterMonths = getSemesterMonths(semester);
    monthColumns = semesterMonths.map(m => ({
      month: m.month,
      year: m.year,
      label: `${urduMonths[m.month]} ${m.year}`,
    }));
  }

  const bookRows: ReportCardBookRow[] = teacherBooks.map(tb => {
    const s = stats.get(tb.id)!;
    const monthlyPercentages = monthColumns.map(c =>
      monthlyPercentageFor(s, semester, c.month, c.year)
    );
    // Pages taught in the selected month (monthly mode only)
    let pagesTaught = 0;
    if (mode === 'monthly' && selectedMonth) {
      const mp = progress.find(
        p => p.teacher_book_id === tb.id &&
          p.month === selectedMonth.month &&
          p.year === selectedMonth.year
      );
      pagesTaught = mp?.pages_taught || 0;
    }
    return {
      bookName: tb.book_name || '-',
      className: tb.class?.name || '-',
      totalPages: tb.total_pages,
      pagesTaught,
      monthlyPercentages,
      overallPercentage: s.overallPercentage,
      quality: s.isCompleted ? 'ممتاز' : getQuality(s.overallPercentage),
    };
  });

  const grandTotalPercentage =
    bookRows.length > 0
      ? Math.round(bookRows.reduce((s, r) => s + r.overallPercentage, 0) / bookRows.length)
      : 0;
  const grandTotalQuality = getQuality(grandTotalPercentage);

  const dateRange = `${semester.start_date} to ${semester.end_date}`;

  return {
    institutionName: 'جامعۃ المدینہ فیضان مخدوم لاہوری',
    institutionSubtitle: 'موڈاسا، گجرات',
    semesterTitle: semester.title,
    semesterYear: semester.year,
    semesterDateRange: dateRange,
    teacherName: teacher?.name || '-',
    teacherPhotoUrl: teacher?.photo_url || undefined,
    teacherSignatureUrl: teacher?.signature_url || undefined,
    adminSealUrl: adminAssets?.sealUrl || undefined,
    adminSignatureUrl: adminAssets?.signatureUrl || undefined,
    monthColumns,
    bookRows,
    grandTotalPercentage,
    grandTotalQuality,
    nazimLabel: 'دستخط ناظم تعلیمات',
    sealLabel: 'مہر جامعہ',
    teacherSignatureLabel: 'دستخط استاد',
    mode,
    selectedMonthLabel,
  };
}

// Fetch admin assets (seal + signature) from admin_settings singleton
export async function fetchAdminAssets(): Promise<{ sealUrl?: string; signatureUrl?: string }> {
  const { data } = await supabase
    .from('admin_settings')
    .select('seal_image_url, signature_image_url')
    .eq('id', 1)
    .maybeSingle();
  return {
    sealUrl: (data as any)?.seal_image_url || undefined,
    signatureUrl: (data as any)?.signature_image_url || undefined,
  };
}

// Fetch all semesters (for selectors) — most recent first
export async function fetchAllSemesters(): Promise<Semester[]> {
  const { data } = await supabase
    .from('semesters')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as any[]) || [];
}

// Fetch active semester
export async function fetchActiveSemester(): Promise<Semester | null> {
  const { data } = await supabase
    .from('semesters')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  return (data as Semester) || null;
}
