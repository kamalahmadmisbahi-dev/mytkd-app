import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import SemesterSelector from '../shared/SemesterSelector';
import { BarChart3, Filter, X, FileSpreadsheet, List, LayoutGrid, Plus, Minus, Download } from 'lucide-react';
import type { Teacher, Semester, Class } from '../../types';
import { fetchTeacherSemesterReportData, fetchAdminAssets, isSemesterFullyFilled } from '../../lib/reportData';
import { downloadReportCardPdf } from '../../lib/reportCardPdf';

interface ReportRow {
  id: string;
  teacher_name: string;
  book_name: string;
  class_name: string;
  publication_name: string;
  total_pages: number;
  daily_target: number;
  monthly_target: number;
  total_academic_days: number;
  monthly_academic_days: number;
  pages_completed_total: number;
  pages_completed_month: number;
  remaining_pages: number;
  monthly_percentage: number;
  monthly_quality: string;
  overall_percentage: number;
  overall_quality: string;
  current_lesson: string;
  current_page: number;
  semester_id: string;
  teacher_id: string;
  class_id: string;
  month: number;
  year: number;
}

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const getQuality = (pct: number) => pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';
const getQualityColor = (quality: string) => {
  switch (quality) {
    case 'ممتاز': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
    case 'بہتر': return 'text-sky-600 bg-sky-50 dark:bg-sky-900/20';
    case 'مناسب': return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    default: return 'text-rose-600 bg-rose-50 dark:bg-rose-900/20';
  }
};

// Cap percentage at 100 for calculations
const capPercent = (pct: number) => Math.min(100, pct);

// Get monthly target based on REMAINING pages and REMAINING academic days
function getMonthlyTargetForMonth(totalPages: number, semester: any, month: number, pagesTaughtBeforeMonth: number): number {
  if (!semester || !semester.total_academic_days || semester.total_academic_days === 0) {
    return 0;
  }
  const remainingPages = totalPages - pagesTaughtBeforeMonth;
  if (remainingPages <= 0) return 0;

  const monthDays = semester[`month_${month}_days`] || 0;
  if (monthDays === 0) return 0;

  // Calculate remaining academic days from this month to end of semester
  let remainingDays = 0;
  for (let m = month; m <= 12; m++) {
    remainingDays += semester[`month_${m}_days`] || 0;
  }
  if (remainingDays <= 0) return 0;

  // monthly_target = (remaining_pages / remaining_academic_days) * this_month_academic_days
  const dailyRate = remainingPages / remainingDays;
  return Math.min(remainingPages, Math.round(dailyRate * monthDays));
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

interface TeacherSummary {
  teacher_id: string;
  teacher_name: string;
  average_monthly_percentage: number;
  average_monthly_quality: string;
  overall_percentage: number;
  overall_quality: string;
}

interface PerformanceFormData {
  month: number;
  year: number;
  pages_taught: number;
  current_lesson: string;
  current_page: number;
}

interface ModalState {
  isOpen: boolean;
  rowId: string;
  teacherBookId: string;
  formData: PerformanceFormData;
}

export default function AdminReports() {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [currentSemester, setCurrentSemester] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'detailed'>('summary');
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    rowId: '',
    teacherBookId: '',
    formData: {
      month: currentMonth,
      year: currentYear,
      pages_taught: 0,
      current_lesson: '',
      current_page: 0,
    },
  });
  const [otherMonthsTotal, setOtherMonthsTotal] = useState(0);

  const [filters, setFilters] = useState({
    semester_id: '', teacher_id: '', class_id: '', book_name: '',
    month: String(currentMonth), year: String(currentYear),
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [tRes, sRes, cRes] = await Promise.all([
      supabase.from('teachers').select('*').order('name'),
      supabase.from('semesters').select('*').order('created_at', { ascending: false }),
      supabase.from('classes').select('*').order('level'),
    ]);
    setTeachers(tRes.data || []);
    setSemesters(sRes.data || []);
    setClasses(cRes.data || []);

    const activeSem = (sRes.data || []).find(s => s.is_active);
    if (activeSem) {
      setCurrentSemester(activeSem);
      setFilters(f => ({ ...f, semester_id: activeSem.id }));
      await loadReportData(activeSem.id);
    } else {
      setLoading(false);
    }
  }

  async function loadReportData(semesterId: string) {
    setLoading(true);
    const [tbRes, mpRes, tRes, sRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('semester_id', semesterId),
      supabase.from('monthly_progress').select('*').eq('semester_id', semesterId),
      supabase.from('teachers').select('*'),
      supabase.from('semesters').select('*').eq('id', semesterId).maybeSingle(),
    ]);

    const semester = (sRes.data as any) || null;
    if (semester) setCurrentSemester(semester);
    const rows: ReportRow[] = [];

    for (const tb of tbRes.data || []) {
      const teacher = (tRes.data || []).find(t => t.id === tb.teacher_id);
      const allProgress = (mpRes.data || []).filter(mp => mp.teacher_book_id === tb.id);
      const totalAcademicDays = semester?.total_academic_days || 0;

      // Group progress by month+year
      const monthGroups: Record<string, { month: number; year: number; pages: number; lesson: string; page: number }> = {};
      for (const mp of allProgress) {
        const key = `${mp.month}-${mp.year}`;
        if (!monthGroups[key]) monthGroups[key] = { month: mp.month, year: mp.year, pages: 0, lesson: '', page: 0 };
        monthGroups[key].pages += mp.pages_taught;
        monthGroups[key].lesson = mp.current_lesson_end || '';
        monthGroups[key].page = mp.current_page || 0;
      }

      const monthKeys = Object.keys(monthGroups).sort((a, b) => {
        const [am, ay] = a.split('-').map(Number);
        const [bm, by] = b.split('-').map(Number);
        return ay !== by ? ay - by : am - bm;
      });

      // Find the month when curriculum was completed (if at all)
      let completionMonth: number | null = null;
      let completionYear: number | null = null;
      const totalTaught = allProgress.reduce((s, mp) => s + mp.pages_taught, 0);
      const overallPctRawTotal = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
      const isCurriculumComplete = overallPctRawTotal >= 100;

      if (isCurriculumComplete && semester) {
        // Find which month it completed in
        let cumulative = 0;
        const sortedProgress = [...allProgress].sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });
        for (const mp of sortedProgress) {
          cumulative += mp.pages_taught;
          if (cumulative >= tb.total_pages) {
            completionMonth = mp.month;
            completionYear = mp.year;
            break;
          }
        }
      }

      // Get all months in the semester
      const semesterMonths: { month: number; year: number }[] = [];
      if (semester) {
        const startDate = new Date(semester.start_date);
        const endDate = new Date(semester.end_date);
        let current = new Date(startDate);
        while (current <= endDate) {
          semesterMonths.push({
            month: current.getMonth() + 1,
            year: current.getFullYear(),
          });
          current.setMonth(current.getMonth() + 1);
        }
      }

      if (monthKeys.length === 0) {
        const monthlyDays = semester ? semester[`month_${currentMonth}_days`] || 0 : 0;
        const monthlyTarget = getMonthlyTargetForMonth(tb.total_pages, semester, currentMonth, 0);
        rows.push({
          id: `${tb.id}-0`, teacher_name: teacher?.name || '-', book_name: tb.book_name || '-',
          class_name: tb.class?.name || '-', publication_name: tb.publication_name || '-',
          total_pages: tb.total_pages, daily_target: tb.daily_target, monthly_target: monthlyTarget,
          total_academic_days: totalAcademicDays, monthly_academic_days: monthlyDays,
          pages_completed_total: 0, pages_completed_month: 0, remaining_pages: tb.total_pages,
          monthly_percentage: 0, monthly_quality: getQuality(0),
          overall_percentage: 0, overall_quality: getQuality(0),
          current_lesson: '', current_page: 0,
          semester_id: tb.semester_id, teacher_id: tb.teacher_id, class_id: tb.class_id,
          month: currentMonth, year: currentYear,
        });
      } else {
        for (const key of monthKeys) {
          const mg = monthGroups[key];
          const monthlyDays = semester ? semester[`month_${mg.month}_days`] || 0 : 0;

          // Cumulative BEFORE this month (for target calculation)
          const cumulativeBeforeThisMonth = allProgress
            .filter(mp => {
              if (mp.year < mg.year) return true;
              if (mp.year === mg.year && mp.month < mg.month) return true;
              return false;
            })
            .reduce((s, mp) => s + mp.pages_taught, 0);

          const monthlyTarget = getMonthlyTargetForMonth(tb.total_pages, semester, mg.month, cumulativeBeforeThisMonth);

          // Cumulative = all months up to and including this one
          const cumulativeUpToThisMonth = allProgress
            .filter(mp => {
              if (mp.year < mg.year) return true;
              if (mp.year === mg.year && mp.month <= mg.month) return true;
              return false;
            })
            .reduce((s, mp) => s + mp.pages_taught, 0);

          const overallPctRawThisMonth = tb.total_pages > 0 ? (cumulativeUpToThisMonth / tb.total_pages) * 100 : 0;
          const overallPctThisMonth = capPercent(overallPctRawThisMonth);
          const isCompletedByThisMonth = overallPctRawThisMonth >= 100;

          // Check if already completed before this month
          const wasCompletedBefore = tb.total_pages > 0 && (cumulativeBeforeThisMonth / tb.total_pages) >= 100;
          const isAfterCompletion = isCompletedByThisMonth && wasCompletedBefore;

          // If completed this month or before, show 100% monthly
          const monthlyPctToShow = isAfterCompletion ? 100 : capPercent(monthlyTarget > 0 ? (mg.pages / monthlyTarget) * 100 : 0);
          const monthlyTargetToShow = isAfterCompletion ? 0 : monthlyTarget;

          rows.push({
            id: `${tb.id}-${key}`, teacher_name: teacher?.name || '-', book_name: tb.book_name || '-',
            class_name: tb.class?.name || '-', publication_name: tb.publication_name || '-',
            total_pages: tb.total_pages, daily_target: tb.daily_target, monthly_target: monthlyTargetToShow,
            total_academic_days: totalAcademicDays, monthly_academic_days: monthlyDays,
            pages_completed_total: cumulativeUpToThisMonth, pages_completed_month: mg.pages,
            remaining_pages: Math.max(0, tb.total_pages - cumulativeUpToThisMonth),
            monthly_percentage: Math.round(monthlyPctToShow), monthly_quality: isAfterCompletion ? 'ممتاز' : getQuality(monthlyPctToShow),
            overall_percentage: Math.round(overallPctThisMonth), overall_quality: isCompletedByThisMonth ? 'ممتاز' : getQuality(overallPctThisMonth),
            current_lesson: mg.lesson, current_page: mg.page,
            semester_id: tb.semester_id, teacher_id: tb.teacher_id, class_id: tb.class_id,
            month: mg.month, year: mg.year,
          });
        }

        // If curriculum is complete, add entries for remaining months in semester showing "مکمل"
        if (isCurriculumComplete && completionMonth && completionYear && semester) {
          for (const sm of semesterMonths) {
            // Skip if this month already has an entry
            if (monthKeys.includes(`${sm.month}-${sm.year}`)) continue;
            // Only add months after completion
            if (sm.year < completionYear || (sm.year === completionYear && sm.month <= completionMonth)) continue;

            const monthlyDays = semester[`month_${sm.month}_days`] || 0;
            rows.push({
              id: `${tb.id}-${sm.month}-${sm.year}-auto`, teacher_name: teacher?.name || '-', book_name: tb.book_name || '-',
              class_name: tb.class?.name || '-', publication_name: tb.publication_name || '-',
              total_pages: tb.total_pages, daily_target: tb.daily_target, monthly_target: 0,
              total_academic_days: totalAcademicDays, monthly_academic_days: monthlyDays,
              pages_completed_total: tb.total_pages, pages_completed_month: 0, remaining_pages: 0,
              monthly_percentage: 100, monthly_quality: 'ممتاز',
              overall_percentage: 100, overall_quality: 'ممتاز',
              current_lesson: 'مکمل', current_page: tb.total_pages,
              semester_id: tb.semester_id, teacher_id: tb.teacher_id, class_id: tb.class_id,
              month: sm.month, year: sm.year,
            });
          }
        }
      }
    }

    setReportData(rows);
    setLoading(false);
  }

  const filteredData = reportData.filter(row => {
    if (filters.semester_id && row.semester_id !== filters.semester_id) return false;
    if (filters.teacher_id && row.teacher_id !== filters.teacher_id) return false;
    if (filters.class_id && row.class_id !== filters.class_id) return false;
    if (filters.book_name && !row.book_name.includes(filters.book_name)) return false;
    if (filters.month && row.month !== parseInt(filters.month)) return false;
    if (filters.year && row.year !== parseInt(filters.year)) return false;
    return true;
  });

  // Calculate teacher summary data
  const teacherSummaries: Record<string, TeacherSummary> = {};
  for (const row of filteredData) {
    if (!teacherSummaries[row.teacher_id]) {
      teacherSummaries[row.teacher_id] = {
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        average_monthly_percentage: 0,
        average_monthly_quality: '',
        overall_percentage: 0,
        overall_quality: ''
      };
    }
  }

  // Calculate averages for each teacher
  for (const teacherId in teacherSummaries) {
    const teacherRows = filteredData.filter(r => r.teacher_id === teacherId);
    if (teacherRows.length > 0) {
      const avgMonthly = Math.round(
        teacherRows.reduce((s, r) => s + r.monthly_percentage, 0) / teacherRows.length
      );
      const avgOverall = Math.round(
        teacherRows.reduce((s, r) => s + r.overall_percentage, 0) / teacherRows.length
      );
      teacherSummaries[teacherId].average_monthly_percentage = avgMonthly;
      teacherSummaries[teacherId].average_monthly_quality = getQuality(avgMonthly);
      teacherSummaries[teacherId].overall_percentage = avgOverall;
      teacherSummaries[teacherId].overall_quality = getQuality(avgOverall);
    }
  }

  const summaryData = Object.values(teacherSummaries).sort((a, b) =>
    a.teacher_name.localeCompare(b.teacher_name)
  );

  const displayMonth = filters.month ? parseInt(filters.month) : currentMonth;
  const displayYear = filters.year ? parseInt(filters.year) : currentYear;

  function clearFilters() {
    setFilters({ semester_id: filters.semester_id, teacher_id: '', class_id: '', book_name: '', month: String(currentMonth), year: String(currentYear) });
  }

  function openPerformanceModal(row: ReportRow, teacherBookId: string) {
    // Find the teacher_book_id from the row
    const allProgress = reportData.filter(r => r.teacher_id === row.teacher_id && r.book_name === row.book_name);
    const otherMonthsSum = allProgress
      .filter(r => !(r.month === row.month && r.year === row.year))
      .reduce((sum, r) => sum + r.pages_completed_month, 0);

    setOtherMonthsTotal(otherMonthsSum);
    setModal({
      isOpen: true,
      rowId: row.id,
      teacherBookId: teacherBookId,
      formData: {
        month: row.month,
        year: row.year,
        pages_taught: row.pages_completed_month,
        current_lesson: row.current_lesson,
        current_page: row.current_page,
      },
    });
  }

  function closePerformanceModal() {
    setModal({
      isOpen: false,
      rowId: '',
      teacherBookId: '',
      formData: {
        month: currentMonth,
        year: currentYear,
        pages_taught: 0,
        current_lesson: '',
        current_page: 0,
      },
    });
  }

  function updateFormData(key: keyof PerformanceFormData, value: any) {
    setModal(prev => ({
      ...prev,
      formData: { ...prev.formData, [key]: value },
    }));
  }

  async function savePerformanceEntry() {
    if (!modal.teacherBookId) {
      addNotification('error', 'غلطی: ٹیچر بک آئی ڈی نہیں ملی');
      return;
    }

    if (!currentSemester) {
      addNotification('error', 'غلطی: سمسٹر منتخب نہیں');
      return;
    }

    const row = reportData.find(r => r.id === modal.rowId);
    if (!row) {
      addNotification('error', 'غلطی: ریکارڈ نہیں ملا');
      return;
    }

    try {
      // Check if entry already exists
      const { data: existingData } = await supabase
        .from('monthly_progress')
        .select('id')
        .eq('teacher_book_id', modal.teacherBookId)
        .eq('month', modal.formData.month)
        .eq('year', modal.formData.year)
        .maybeSingle();

      if (existingData) {
        // Update existing entry
        const { error } = await supabase
          .from('monthly_progress')
          .update({
            pages_taught: modal.formData.pages_taught,
            current_lesson_end: modal.formData.current_lesson,
            current_page: modal.formData.current_page,
          })
          .eq('id', existingData.id);

        if (error) throw error;
      } else {
        // Insert new entry
        const { error } = await supabase
          .from('monthly_progress')
          .insert({
            teacher_book_id: modal.teacherBookId,
            teacher_id: row.teacher_id,
            semester_id: row.semester_id,
            month: modal.formData.month,
            year: modal.formData.year,
            pages_taught: modal.formData.pages_taught,
            current_lesson_end: modal.formData.current_lesson,
            current_page: modal.formData.current_page,
          });

        if (error) throw error;
      }

      addNotification('success', 'کارکردگی محفوظ ہو گئی');
      closePerformanceModal();
      await loadReportData(filters.semester_id);
    } catch (error) {
      console.error('Error saving performance:', error);
      addNotification('error', 'کارکردگی محفوظ نہیں ہو سکی');
    }
  }

  function getTeacherBookId(row: ReportRow): string {
    // Extract teacher_book_id from the row.id which is formatted as `${tb.id}-${key}`
    const parts = row.id.split('-');
    return parts[0];
  }

  function getPreviousMonths(): { month: number; year: number }[] {
    if (!currentSemester) return [];

    const months: { month: number; year: number }[] = [];
    const startDate = new Date(currentSemester.start_date);
    const endDate = new Date(currentSemester.end_date);

    let current = new Date(startDate);
    while (current <= endDate) {
      months.push({
        month: current.getMonth() + 1,
        year: current.getFullYear(),
      });
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  function exportToCSV() {
    const institutionName = 'جامعۃ المدینہ فیضان مخدوم لاہوری';
    const monthLabel = `${urduMonths[displayMonth]} ${displayYear}`;
    if (activeTab === 'summary') {
      const headers = ['جامعہ', 'مہینہ', 'استاد', 'ماہانہ فیصد', 'ماہانہ کیفیت', 'مجموعی فیصد', 'مجموعی کیفیت'];
      const rows = summaryData.map(t => [
        institutionName, monthLabel, t.teacher_name, t.average_monthly_percentage + '%', t.average_monthly_quality,
        t.overall_percentage + '%', t.overall_quality,
      ]);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `اجمالی_رپورٹ_${currentSemester?.title || ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification('success', 'اجمالی سی ایس وی ڈاؤن لوڈ ہو گیا');
    } else {
      const headers = ['جامعہ', 'مہینہ', 'استاد', 'کتاب', 'درجہ', 'مطبعہ', 'نصابی صفحات', 'یومیہ ہدف', 'ماہانہ ہدف', 'کل تعلیمی ایام', 'اس ماہ تعلیمی ایام', 'اب تک پڑھائے', 'اس ماہ پڑھائے', 'موجودہ سبق', 'صفحہ', 'باقی', 'ماہانہ فیصد', 'ماہانہ کیفیت', 'مجموعی فیصد', 'مجموعی کیفیت'];
      const rows = filteredData.map(r => [
        institutionName, monthLabel, r.teacher_name, r.book_name, r.class_name, r.publication_name,
        r.total_pages, r.daily_target, r.monthly_target,
        r.total_academic_days, r.monthly_academic_days,
        r.pages_completed_total, r.pages_completed_month, r.current_lesson, r.current_page, r.remaining_pages,
        r.monthly_percentage + '%', r.monthly_quality, r.overall_percentage + '%', r.overall_quality
      ]);
      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تفصیلی_رپورٹ_${urduMonths[displayMonth]}_${displayYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification('success', 'تفصیلی سی ایس وی ڈاؤن لوڈ ہو گیا');
    }
  }

  async function downloadSingleReportCard(teacherId: string, teacherName: string, mode: 'monthly' | 'semester_first' | 'semester_second' = 'monthly') {
    if (!currentSemester) {
      addNotification('error', 'سمسٹر منتخب نہیں');
      return;
    }
    if (mode !== 'monthly') {
      const filled = await isSemesterFullyFilled(teacherId, currentSemester);
      if (!filled) {
        addNotification('error', `${teacherName} کا سمسٹر مکمل نہیں بھرا — ششماہی رپورٹ کارڈ دستیاب نہیں`);
        return;
      }
    }
    try {
      const adminAssets = await fetchAdminAssets();
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .maybeSingle();
      // For shashmahi cards, find the matching semester (first/second) in the same year
      let semesterToUse = currentSemester;
      if (mode === 'semester_first' || mode === 'semester_second') {
        const wantedType = mode === 'semester_first' ? 'first' : 'second';
        const found = semesters.find(s => s.semester_type === wantedType && s.year === currentSemester.year);
        if (found) semesterToUse = found;
      }
      const data = await fetchTeacherSemesterReportData(
        teacherId,
        semesterToUse,
        teacher as any,
        adminAssets,
        mode,
        mode === 'monthly' ? { month: displayMonth, year: displayYear } : undefined
      );
      const suffix = mode === 'monthly' ? 'Mahana' : mode === 'semester_first' ? 'ShashmahiAwwal' : 'ShashmahiAkhir';
      const filename = `ReportCard_${teacherName}_${semesterToUse.title}_${suffix}.pdf`;
      await downloadReportCardPdf(data, filename);
      addNotification('success', `${teacherName} کا رپورٹ کارڈ ڈاؤن لوڈ ہو گیا`);
    } catch (err: any) {
      addNotification('error', err.message || 'رپورٹ کارڈ بننے میں ناکام');
    }
  }

  if (loading && !reportData.length) return <LoadingSpinner />;

  const semesterMonthlyDays = currentSemester ? currentSemester[`month_${displayMonth}_days`] || 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-sky-600" />
            تفصیلی رپورٹس
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {urduMonths[displayMonth]} {displayYear} | کل تعلیمی ایام: {currentSemester?.total_academic_days || 0} | {urduMonths[displayMonth]} ایام: {semesterMonthlyDays}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SemesterSelector
            semesters={semesters}
            selectedId={currentSemester?.id || ''}
            onChange={(id) => { const s = semesters.find(x => x.id === id); if (s) { setCurrentSemester(s); setFilters(f => ({ ...f, semester_id: id })); loadReportData(id); } }}
            label="سمسٹر:"
          />
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>
            <Filter className="w-4 h-4" /> فلٹرز
          </button>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            <FileSpreadsheet className="w-4 h-4" /> سی ایس وی
          </button>
        </div>
      </div>

      {/* Current Month Info Bar */}
      <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 border border-sky-200 dark:border-sky-800/30">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-sky-700 dark:text-sky-300 font-bold">{urduMonths[displayMonth]} {displayYear}</span>
          <span className="text-gray-600 dark:text-gray-400">کل تعلیمی ایام: <span className="font-bold text-gray-900 dark:text-white">{currentSemester?.total_academic_days || 0}</span></span>
          <span className="text-gray-600 dark:text-gray-400">{urduMonths[displayMonth]} تعلیمی ایام: <span className="font-bold text-gray-900 dark:text-white">{semesterMonthlyDays}</span></span>
          <span className="text-gray-600 dark:text-gray-400">کتب: <span className="font-bold text-gray-900 dark:text-white">{filteredData.length}</span></span>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">فلٹرز</h3>
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <X className="w-3 h-3" /> صاف کریں
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <select value={filters.semester_id} onChange={e => { setFilters(f => ({ ...f, semester_id: e.target.value })); if (e.target.value) loadReportData(e.target.value); }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">سمسٹر</option>
              {semesters.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <select value={filters.teacher_id} onChange={e => setFilters(f => ({ ...f, teacher_id: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">استاد</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filters.class_id} onChange={e => setFilters(f => ({ ...f, class_id: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">درجہ</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="text" value={filters.book_name} onChange={e => setFilters(f => ({ ...f, book_name: e.target.value }))} placeholder="کتاب کا نام"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" dir="rtl" />
            <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">تمام مہینے</option>
              {urduMonths.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} placeholder="سال"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'summary'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            اجمالی
          </button>
          <button
            onClick={() => setActiveTab('detailed')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'detailed'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <List className="w-4 h-4" />
            تفصیلی
          </button>
        </div>
      </div>

      {/* Report Tables */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {activeTab === 'summary' ? (
          // Summary Tab
          <>
            {summaryData.length === 0 ? (
              <EmptyState title="کوئی ریکارڈ نہیں" description="فلٹرز بدلیں یا ڈیٹا شامل کریں" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">استاد</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ماہانہ فیصد</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کیفیت</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">مجموعی فیصد</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کیفیت</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">رپورٹ کارڈ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {summaryData.map(teacher => (
                      <tr key={teacher.teacher_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">{teacher.teacher_name}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-bold whitespace-nowrap">{teacher.average_monthly_percentage}%</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(teacher.average_monthly_quality)}`}>
                            {teacher.average_monthly_quality}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-bold whitespace-nowrap">{teacher.overall_percentage}%</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(teacher.overall_quality)}`}>
                            {teacher.overall_quality}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-1">
                            <button
                              onClick={() => downloadSingleReportCard(teacher.teacher_id, teacher.teacher_name, 'monthly')}
                              className="flex items-center gap-1 px-2 py-1.5 rounded bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                            >
                              <Download className="w-3.5 h-3.5" /> ماہانہ
                            </button>
                            <button
                              onClick={() => downloadSingleReportCard(teacher.teacher_id, teacher.teacher_name, 'semester_first')}
                              className="flex items-center gap-1 px-2 py-1.5 rounded bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                            >
                              <Download className="w-3.5 h-3.5" /> ششماہی اول
                            </button>
                            <button
                              onClick={() => downloadSingleReportCard(teacher.teacher_id, teacher.teacher_name, 'semester_second')}
                              className="flex items-center gap-1 px-2 py-1.5 rounded bg-rose-100 text-rose-700 text-xs font-medium hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50"
                            >
                              <Download className="w-3.5 h-3.5" /> ششماہی آخر
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          // Detailed Tab
          <>
            {filteredData.length === 0 ? (
              <EmptyState title="کوئی ریکارڈ نہیں" description="فلٹرز بدلیں یا ڈیٹا شامل کریں" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">عمل</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">استاد</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کتاب</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">درجہ</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">نصابی صفحات</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">یومیہ ہدف</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ماہانہ ہدف</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کل تعلیمی ایام</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">تعلیمی ایام</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">اب تک پڑھائے</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">اس ماہ پڑھائے</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">موجودہ سبق</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">صفحہ</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">باقی</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ماہانہ فیصد</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کیفیت</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">مجموعی فیصد</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کیفیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredData.map(row => {
                      const isCompleted = row.overall_percentage >= 100 && row.monthly_target === 0;
                      return (
                        <tr key={row.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}`}>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {!isCompleted && (
                              <button
                                onClick={() => openPerformanceModal(row, getTeacherBookId(row))}
                                className="flex items-center gap-1 px-2 py-1.5 rounded bg-sky-100 text-sky-700 text-xs font-medium hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50"
                              >
                                کارکردگی بھریں
                              </button>
                            )}
                            {isCompleted && <span className="text-emerald-600 text-xs font-bold">مکمل</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                            {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                            {row.teacher_name}
                          </td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.book_name}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.class_name}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.total_pages}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.daily_target}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {isCompleted ? <span className="text-emerald-600 font-bold">مکمل</span> : <span className="text-gray-700 dark:text-gray-300">{row.monthly_target}</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.total_academic_days}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.monthly_academic_days}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={isCompleted ? 'text-emerald-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{row.pages_completed_total}</span>
                          </td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{isCompleted ? '-' : row.pages_completed_month}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.current_lesson || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.current_page || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{isCompleted ? '-' : row.remaining_pages}</td>
                          <td className="px-3 py-3 font-bold whitespace-nowrap">
                            <span className={isCompleted ? 'text-emerald-600' : ''}>{row.monthly_percentage}%</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(row.monthly_quality)}`}>{row.monthly_quality}</span>
                          </td>
                          <td className="px-3 py-3 font-bold whitespace-nowrap">
                            <span className={isCompleted ? 'text-emerald-600' : ''}>{row.overall_percentage}%</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(row.overall_quality)}`}>{row.overall_quality}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {(activeTab === 'detailed' ? filteredData.length > 0 : summaryData.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{activeTab === 'detailed' ? 'کل ریکارڈز' : 'کل اساتذہ'}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{activeTab === 'detailed' ? filteredData.length : summaryData.length}</p>
          </div>
          {activeTab === 'detailed' && filteredData.length > 0 && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اوسط ماہانہ فیصد</p>
                <p className="text-xl font-bold text-emerald-600">{Math.round(filteredData.reduce((s, r) => s + r.monthly_percentage, 0) / filteredData.length)}%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اوسط مجموعی فیصد</p>
                <p className="text-xl font-bold text-sky-600">{Math.round(filteredData.reduce((s, r) => s + r.overall_percentage, 0) / filteredData.length)}%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">کل صفحات</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{filteredData.reduce((s, r) => s + r.pages_completed_total, 0)}</p>
              </div>
            </>
          )}
          {activeTab === 'summary' && summaryData.length > 0 && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اوسط ماہانہ فیصد</p>
                <p className="text-xl font-bold text-emerald-600">{Math.round(summaryData.reduce((s, t) => s + t.average_monthly_percentage, 0) / summaryData.length)}%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">اوسط مجموعی فیصد</p>
                <p className="text-xl font-bold text-sky-600">{Math.round(summaryData.reduce((s, t) => s + t.overall_percentage, 0) / summaryData.length)}%</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ممتاز</p>
                <p className="text-xl font-bold text-emerald-600">{summaryData.filter(t => t.overall_quality === 'ممتاز').length}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Performance Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">کارکردگی بھریں</h2>
              <button
                onClick={closePerformanceModal}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Month and Year Dropdowns */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ماہ</label>
                  <select
                    value={modal.formData.month}
                    onChange={(e) => updateFormData('month', parseInt(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {getPreviousMonths().map(m => (
                      <option key={`${m.month}-${m.year}`} value={m.month}>
                        {urduMonths[m.month]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">سال</label>
                  <select
                    value={modal.formData.year}
                    onChange={(e) => updateFormData('year', parseInt(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {currentSemester && (
                      <>
                        {Array.from({ length: new Date(currentSemester.end_date).getFullYear() - new Date(currentSemester.start_date).getFullYear() + 1 }, (_, i) => {
                          const year = new Date(currentSemester.start_date).getFullYear() + i;
                          return (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Pages Taught */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">اب تک پڑھائے کل صفحات</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateFormData('pages_taught', Math.max(0, modal.formData.pages_taught - 1))}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Minus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={modal.formData.pages_taught}
                    onChange={(e) => updateFormData('pages_taught', Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                  />
                  <button
                    onClick={() => updateFormData('pages_taught', modal.formData.pages_taught + 1)}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Plus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>
              </div>

              {/* Pages Taught This Month Calculation */}
              <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 border border-sky-200 dark:border-sky-800/30">
                <p className="text-xs text-sky-700 dark:text-sky-300 mb-1">اس ماہ پڑھائے</p>
                <p className="text-lg font-bold text-sky-900 dark:text-sky-100">
                  {Math.max(0, modal.formData.pages_taught - otherMonthsTotal)} صفحات
                </p>
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
                  ({modal.formData.pages_taught} کل - {otherMonthsTotal} دوسرے مہینے)
                </p>
              </div>

              {/* Current Lesson */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">موجودہ سبق</label>
                <input
                  type="text"
                  value={modal.formData.current_lesson}
                  onChange={(e) => updateFormData('current_lesson', e.target.value)}
                  placeholder="مثال: سبق 5"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  dir="rtl"
                />
              </div>

              {/* Current Page */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">صفحہ نمبر</label>
                <input
                  type="number"
                  min="0"
                  value={modal.formData.current_page}
                  onChange={(e) => updateFormData('current_page', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={savePerformanceEntry}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  محفوظ کریں
                </button>
                <button
                  onClick={closePerformanceModal}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  منسوخ کریں
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
