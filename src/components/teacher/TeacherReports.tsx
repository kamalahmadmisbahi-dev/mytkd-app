import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import EmptyState from '../shared/EmptyState';
import LoadingSpinner from '../shared/LoadingSpinner';
import { BarChart3, Filter, X, FileSpreadsheet, FileText, Download, Loader2 } from 'lucide-react';
import type { Semester, MonthlyProgress } from '../../types';
import SemesterSelector from '../shared/SemesterSelector';
import { fetchAllSemesters, fetchActiveSemester, fetchTeacherSemesterReportData, fetchAdminAssets, isSemesterFullyFilled } from '../../lib/reportData';
import { downloadReportCardPdf } from '../../lib/reportCardPdf';
import { downloadFarhatNama } from '../../lib/farhatNama';
import type { FarhatNamaData } from '../../lib/farhatNama';
import { Award } from 'lucide-react';

interface ReportRow {
  id: string;
  book_name: string;
  class_name: string;
  publication_name: string;
  total_pages: number;
  monthly_target: number;
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

export default function TeacherReports() {
  const { teacherId } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [currentSemester, setCurrentSemester] = useState<any>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [semesterFullyFilled, setSemesterFullyFilled] = useState(false);

  const [filters, setFilters] = useState({
    semester_id: '', book_name: '', month: String(currentMonth),
  });
  const [showFilters, setShowFilters] = useState(false);

  // Track selected month/year for proper display
  const selectedMonth = parseInt(filters.month) || currentMonth;
  const selectedYear = currentYear; // For simplicity, using current year

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    if (!teacherId) return;
    setLoading(true);
    const sems = await fetchAllSemesters();
    setSemesters(sems);
    const active = await fetchActiveSemester();
    const initial = active || sems[0] || null;
    if (initial) {
      setCurrentSemester(initial);
      setFilters(f => ({ ...f, semester_id: initial.id }));
      await loadReportData(initial.id);
    } else {
      setLoading(false);
    }
  }

  async function loadReportData(semesterId: string) {
    if (!teacherId) return;
    setLoading(true);

    const [tbRes, mpRes, sRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', semesterId),
      supabase.from('monthly_progress').select('*').eq('teacher_id', teacherId).eq('semester_id', semesterId),
      supabase.from('semesters').select('*').eq('id', semesterId).maybeSingle(),
    ]);

    const semester = (sRes.data as any) || null;
    if (semester) setCurrentSemester(semester);
    const rows: ReportRow[] = [];
    const mpData = (mpRes.data || []) as MonthlyProgress[];

    for (const tb of tbRes.data || []) {
      const allProgress = mpData.filter(mp => mp.teacher_book_id === tb.id);
      const totalTaught = allProgress.reduce((s, mp) => s + mp.pages_taught, 0);
      const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
      const isCurriculumComplete = overallPctRaw >= 100;

      // Find the month when curriculum was completed (if at all)
      let completionMonth: number | null = null;
      let completionYear: number | null = null;
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
          id: `${tb.id}-0`, book_name: tb.book_name || '-', class_name: tb.class?.name || '-',
          publication_name: tb.publication_name || '-', total_pages: tb.total_pages,
          monthly_target: monthlyTarget,
          monthly_academic_days: monthlyDays,
          pages_completed_total: 0, pages_completed_month: 0, remaining_pages: tb.total_pages,
          monthly_percentage: 0, monthly_quality: getQuality(0),
          overall_percentage: 0, overall_quality: getQuality(0),
          current_lesson: '', current_page: 0,
          month: currentMonth, year: currentYear,
        });
      } else {
        // Calculate cumulative up to each month
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
          // If completed this month or before, show 100% monthly and "ممتاز"
          const monthlyPctToShow = isCompletedByThisMonth ? 100 : capPercent(monthlyTarget > 0 ? (mg.pages / monthlyTarget) * 100 : 0);

          rows.push({
            id: `${tb.id}-${key}`, book_name: tb.book_name || '-', class_name: tb.class?.name || '-',
            publication_name: tb.publication_name || '-', total_pages: tb.total_pages,
            monthly_target: isCompletedByThisMonth ? 0 : monthlyTarget, monthly_academic_days: monthlyDays,
            pages_completed_total: cumulativeUpToThisMonth, pages_completed_month: mg.pages,
            remaining_pages: Math.max(0, tb.total_pages - cumulativeUpToThisMonth),
            monthly_percentage: Math.round(monthlyPctToShow), monthly_quality: isCompletedByThisMonth ? 'ممتاز' : getQuality(monthlyPctToShow),
            overall_percentage: Math.round(overallPctThisMonth), overall_quality: isCompletedByThisMonth ? 'ممتاز' : getQuality(overallPctThisMonth),
            current_lesson: mg.lesson, current_page: mg.page,
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
              id: `${tb.id}-${sm.month}-${sm.year}-auto`, book_name: tb.book_name || '-', class_name: tb.class?.name || '-',
              publication_name: tb.publication_name || '-', total_pages: tb.total_pages,
              monthly_target: 0, monthly_academic_days: monthlyDays,
              pages_completed_total: tb.total_pages, pages_completed_month: 0, remaining_pages: 0,
              monthly_percentage: 100, monthly_quality: 'ممتاز',
              overall_percentage: 100, overall_quality: 'ممتاز',
              current_lesson: 'مکمل', current_page: tb.total_pages,
              month: sm.month, year: sm.year,
            });
          }
        }
      }
    }

    setReportData(rows);
    // Check whether the semester is fully filled (for the annual report card gate)
    if (semester && teacherId) {
      const filled = await isSemesterFullyFilled(teacherId, semester);
      setSemesterFullyFilled(filled);
    } else {
      setSemesterFullyFilled(false);
    }
    setLoading(false);
  }

  const filteredData = reportData.filter(row => {
    if (filters.book_name && !row.book_name.includes(filters.book_name)) return false;
    if (filters.month && row.month !== parseInt(filters.month)) return false;
    return true;
  });

  const displayMonth = selectedMonth;
  const displayYear = selectedYear;

  function clearFilters() {
    setFilters({ semester_id: filters.semester_id, book_name: '', month: String(currentMonth) });
  }

  async function exportToCSV() {
    const institutionName = 'جامعۃ المدینہ فیضان مخدوم لاہوری';
    const monthLabel = `${urduMonths[displayMonth]} ${displayYear}`;
    const { data: tData } = await supabase.from('teachers').select('name').eq('id', teacherId).maybeSingle();
    const teacherName = (tData as any)?.name || '';
    const headers = ['جامعہ', 'مہینہ', 'استاد', 'کتاب', 'درجہ', 'مطبعہ', 'نصابی صفحات', 'ماہانہ ہدف', 'تعلیمی ایام', 'اب تک پڑھائے', 'اس ماہ پڑھائے', 'باقی', 'موجودہ سبق', 'صفحہ', 'ماہانہ فیصد', 'کیفیت', 'مجموعی فیصد', 'کیفیت'];
    const rows = filteredData.map(r => [
      institutionName, monthLabel, teacherName,
      r.book_name, r.class_name, r.publication_name,
      r.total_pages, r.monthly_target, r.monthly_academic_days,
      r.pages_completed_total, r.pages_completed_month, r.remaining_pages,
      r.current_lesson, r.current_page,
      r.monthly_percentage + '%', r.monthly_quality,
      r.overall_percentage + '%', r.overall_quality
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `میری_رپورٹ_${urduMonths[displayMonth]}_${displayYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification('success', 'سی ایس وی ڈاؤن لوڈ ہو گیا');
  }

  async function downloadReportCard(mode: 'monthly' | 'semester_first' | 'semester_second') {
    if (!teacherId || !currentSemester) {
      addNotification('error', 'سمسٹر منتخب نہیں');
      return;
    }
    if (mode !== 'monthly' && !semesterFullyFilled) {
      addNotification('error', 'سمسٹر مکمل کارکردگی بھرنے کے بعد ہی ششماہی رپورٹ کارڈ ڈاؤن لوڈ ہو سکتا ہے');
      return;
    }
    setGeneratingPdf(true);
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
      const filename = `ReportCard_${teacher?.name || 'teacher'}_${semesterToUse.title}_${suffix}.pdf`;
      await downloadReportCardPdf(data, filename);
      addNotification('success', 'رپورٹ کارڈ ڈاؤن لوڈ ہو گیا');
    } catch (err: any) {
      addNotification('error', err.message || 'رپورٹ کارڈ بننے میں ناکام');
    }
    setGeneratingPdf(false);
  }

  function exportToPDF() {
    downloadReportCard('monthly');
  }

  const allBooksCompleted = reportData.length > 0 && reportData.every(r => r.overall_percentage >= 100);

  async function downloadFarhatNamaCertificate() {
    if (!teacherId || !currentSemester) {
      addNotification('error', 'سمسٹر منتخب نہیں');
      return;
    }
    setGeneratingPdf(true);
    try {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', teacherId)
        .maybeSingle();
      const data: FarhatNamaData = {
        teacherName: (teacher as any)?.name || '',
        semesterTitle: currentSemester.title,
        semesterYear: currentSemester.year,
        semesterDateRange: `${new Date(currentSemester.start_date).toLocaleDateString('en-GB')} - ${new Date(currentSemester.end_date).toLocaleDateString('en-GB')}`,
        institutionName: 'جامعة المدينة فيضان مخدوم لاهوري',
        institutionLocation: 'موداسا',
        nazimLabel: 'مدير الجامعة',
        sealLabel: 'الختم والتوقيع',
      };
      const filename = `FarhatNama_${(teacher as any)?.name || 'teacher'}_${currentSemester.title}.pdf`;
      await downloadFarhatNama(data, filename);
      addNotification('success', 'فرحت نامہ ڈاؤن لوڈ ہو گیا');
    } catch (err: any) {
      addNotification('error', err.message || 'فرحت نامہ بننے میں ناکام');
    }
    setGeneratingPdf(false);
  }

  if (loading && !reportData.length) return <LoadingSpinner />;

  const semesterMonthlyDays = currentSemester ? currentSemester[`month_${displayMonth}_days`] || 0 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            میری رپورٹس
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {urduMonths[displayMonth]} {displayYear} | {urduMonths[displayMonth]} ایام: {semesterMonthlyDays}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SemesterSelector
            semesters={semesters}
            selectedId={currentSemester?.id || ''}
            onChange={(id) => { const s = semesters.find(x => x.id === id); if (s) { setCurrentSemester(s); setFilters(f => ({ ...f, semester_id: id })); loadReportData(id); } }}
            label="سمسٹر:"
          />
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>
            <Filter className="w-4 h-4" /> فلٹرز
          </button>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            <FileSpreadsheet className="w-4 h-4" /> سی ایس وی
          </button>
          <button onClick={exportToPDF} disabled={generatingPdf} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50">
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} رپورٹ کارڈ
          </button>
        </div>
      </div>

      {/* Current Month Info Bar */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800/30">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-emerald-700 dark:text-emerald-300 font-bold">{urduMonths[displayMonth]} {displayYear}</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <select value={filters.semester_id} onChange={e => { setFilters(f => ({ ...f, semester_id: e.target.value })); if (e.target.value) loadReportData(e.target.value); }}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">سمسٹر</option>
              {semesters.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <input type="text" value={filters.book_name} onChange={e => setFilters(f => ({ ...f, book_name: e.target.value }))} placeholder="کتاب کا نام"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" dir="rtl" />
            <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
              <option value="">تمام مہینے</option>
              {urduMonths.slice(1).map((m, i) => {
                const mNum = i + 1;
                const days = currentSemester ? (currentSemester as any)[`month_${mNum}_days`] || 0 : 0;
                if (days === 0) return null;
                return <option key={i} value={mNum}>{m}</option>;
              })}
            </select>
          </div>
        </div>
      )}

      {/* Report Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {filteredData.length === 0 ? (
          <EmptyState title="کوئی ریکارڈ نہیں" description="سمسٹر فارم میں کتاب شامل کریں" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">کتاب</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">درجہ</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">نصابی صفحات</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">ماہانہ ہدف</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">تعلیمی ایام</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">اب تک پڑھائے</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">اس ماہ پڑھائے</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">موجودہ سبق</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">صفحہ</th>
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
                      <td className="px-3 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                        {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                        {row.book_name}
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.class_name}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.total_pages}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {isCompleted ? <span className="text-emerald-600 font-bold">مکمل</span> : <span className="text-gray-700 dark:text-gray-300">{row.monthly_target}</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.monthly_academic_days}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={isCompleted ? 'text-emerald-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{row.pages_completed_total}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-gray-700 dark:text-gray-300">{isCompleted ? '-' : row.pages_completed_month}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.current_lesson || '-'}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.current_page || '-'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-bold ${isCompleted ? 'text-emerald-600' : ''}`}>{row.monthly_percentage}%</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getQualityColor(row.monthly_quality)}`}>{row.monthly_quality}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`font-bold ${isCompleted ? 'text-emerald-600' : ''}`}>{row.overall_percentage}%</span>
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
      </div>

      {filteredData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">کل کتب</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{filteredData.length}</p>
          </div>
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
        </div>
      )}

      {/* Download Report Card Buttons */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <button
          onClick={() => downloadReportCard('monthly')}
          disabled={generatingPdf || !currentSemester}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 shadow-lg shadow-emerald-500/25 transition-all"
        >
          {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          ماہانہ رپورٹ کارڈ
        </button>
        <button
          onClick={() => downloadReportCard('semester_first')}
          disabled={generatingPdf || !currentSemester || !semesterFullyFilled}
          title={!semesterFullyFilled ? 'سمسٹر مکمل بھرنے کے بعد دستیاب ہو گا' : ''}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-amber-600 to-orange-600 text-white text-sm font-semibold hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 shadow-lg shadow-amber-500/25 transition-all"
        >
          {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          ششماہی اول {!semesterFullyFilled && <span className="text-xs opacity-90">(مکمل بھرنے پر)</span>}
        </button>
        <button
          onClick={() => downloadReportCard('semester_second')}
          disabled={generatingPdf || !currentSemester || !semesterFullyFilled}
          title={!semesterFullyFilled ? 'سمسٹر مکمل بھرنے کے بعد دستیاب ہو گا' : ''}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-rose-600 to-pink-600 text-white text-sm font-semibold hover:from-rose-700 hover:to-pink-700 disabled:opacity-50 shadow-lg shadow-rose-500/25 transition-all"
        >
          {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          ششماہی آخر {!semesterFullyFilled && <span className="text-xs opacity-90">(مکمل بھرنے پر)</span>}
        </button>
        {allBooksCompleted && (
          <button
            onClick={downloadFarhatNamaCertificate}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-yellow-500 to-amber-600 text-white text-sm font-semibold hover:from-yellow-600 hover:to-amber-700 disabled:opacity-50 shadow-lg shadow-amber-500/25 transition-all"
          >
            {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Award className="w-5 h-5" />}
            فرحت نامہ
          </button>
        )}
      </div>
    </div>
  );
}
