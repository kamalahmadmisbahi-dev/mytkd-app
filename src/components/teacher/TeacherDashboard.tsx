import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import SemesterSelector from '../shared/SemesterSelector';
import { BookOpen, AlertTriangle, TrendingUp, TrendingDown, Award, Target, Calendar } from 'lucide-react';
import type { TeacherBook, MonthlyProgress, Semester } from '../../types';
import { fetchAllSemesters, fetchActiveSemester, isSemesterFullyFilled } from '../../lib/reportData';

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const getQuality = (pct: number) => pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';
const getQualityColor = (quality: string) => {
  switch (quality) {
    case 'ممتاز': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30';
    case 'بہتر': return 'text-sky-600 bg-sky-100 dark:bg-sky-900/30';
    case 'مناسب': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    default: return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30';
  }
};

interface TeacherRank {
  teacherId: string;
  averagePercentage: number;
  rank: number;
  totalTeachers: number;
}

export default function TeacherDashboard() {
  const { teacherId, teacherProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allSemesters, setAllSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);
  const [teacherBooks, setTeacherBooks] = useState<TeacherBook[]>([]);
  const [progressEntries, setProgressEntries] = useState<MonthlyProgress[]>([]);
  const [teacherRanks, setTeacherRanks] = useState<Map<string, TeacherRank>>(new Map());
  const [prevSemesterIncomplete, setPrevSemesterIncomplete] = useState<Semester | null>(null);

  useEffect(() => {
    (async () => {
      if (!teacherId) {
        setLoading(false);
        return;
      }
      const sems = await fetchAllSemesters();
      setAllSemesters(sems);
      const active = await fetchActiveSemester();
      const initial = active || sems[0] || null;
      setSelectedSemester(initial);

      // Check if previous semester (before the active one) has incomplete performance
      if (teacherId && sems.length > 1) {
        const sorted = [...sems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const activeIdx = sorted.findIndex(s => s.id === initial?.id);
        if (activeIdx >= 0 && activeIdx < sorted.length - 1) {
          const prevSem = sorted[activeIdx + 1];
          const filled = await isSemesterFullyFilled(teacherId, prevSem);
          if (!filled) setPrevSemesterIncomplete(prevSem);
        }
      }

      if (initial) await loadSemesterData(initial.id);
      else setLoading(false);
    })();
  }, [teacherId]);

  async function loadSemesterData(semesterId: string) {
    if (!teacherId) return;
    setLoading(true);
    const [tbRes, mpRes, rankRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', semesterId),
      supabase.from('monthly_progress').select('*').eq('teacher_id', teacherId).eq('semester_id', semesterId),
      supabase.rpc('get_teacher_rankings', { p_semester_id: semesterId }),
    ]);
    setTeacherBooks((tbRes.data as any[]) || []);
    setProgressEntries((mpRes.data as any[]) || []);
    const ranksMap = new Map<string, TeacherRank>();
    ((rankRes.data as any[]) || []).forEach((r: any) => {
      ranksMap.set(r.teacher_id, {
        teacherId: r.teacher_id,
        averagePercentage: r.average_percentage,
        rank: r.rank,
        totalTeachers: r.total_teachers,
      });
    });
    setTeacherRanks(ranksMap);
    setLoading(false);
  }

  function onSemesterChange(id: string) {
    const sem = allSemesters.find(s => s.id === id) || null;
    setSelectedSemester(sem);
    if (sem) loadSemesterData(sem.id);
  }

  if (loading) return <LoadingSpinner />;

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  function getMonthlyAcademicDays(month: number): number {
    if (!selectedSemester) return 0;
    return (selectedSemester as any)[`month_${month}_days`] || 0;
  }

  function getRemainingAcademicDays(fromMonth: number): number {
    if (!selectedSemester) return 0;
    let remainingDays = 0;
    for (let m = fromMonth; m <= 12; m++) {
      remainingDays += (selectedSemester as any)[`month_${m}_days`] || 0;
    }
    return remainingDays;
  }

  function getMonthlyTargetForMonth(tb: TeacherBook, month: number, totalTaught: number): number {
    if (!selectedSemester || !selectedSemester.total_academic_days || selectedSemester.total_academic_days === 0) {
      return Math.round(tb.monthly_target) || 0;
    }
    const remainingPages = tb.total_pages - totalTaught;
    if (remainingPages <= 0) return 0;

    const monthDays = getMonthlyAcademicDays(month);
    if (monthDays === 0) return 0;

    const remainingDays = getRemainingAcademicDays(month);
    if (remainingDays <= 0) return 0;

    const dailyRate = remainingPages / remainingDays;
    return Math.min(remainingPages, Math.round(dailyRate * monthDays));
  }

  // Determine "current" month relative to the selected semester.
  // If the selected semester is in the past, use the semester's end month as the "current" reference.
  function getDisplayMonthYear(): { month: number; year: number } {
    if (!selectedSemester) return { month: currentMonth, year: currentYear };
    const end = new Date(selectedSemester.end_date);
    const now = new Date();
    // If semester end is in the past, use end month/year
    if (end < now) {
      return { month: end.getMonth() + 1, year: end.getFullYear() };
    }
    return { month: currentMonth, year: currentYear };
  }

  const { month: displayMonth, year: displayYear } = getDisplayMonthYear();
  const prevMonth = displayMonth === 1 ? 12 : displayMonth - 1;
  const prevYear = displayMonth === 1 ? displayYear - 1 : displayYear;

  if (teacherBooks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">میری کارکردگی</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{teacherProfile?.name}</p>
          </div>
          {allSemesters.length > 0 && (
            <SemesterSelector
              semesters={allSemesters}
              selectedId={selectedSemester?.id || ''}
              onChange={onSemesterChange}
              label="سمسٹر:"
            />
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            {selectedSemester
              ? 'اس سمسٹر میں ابھی کوئی کتاب شامل نہیں۔'
              : 'کوئی فعال سمسٹر نہیں۔'}
          </p>
        </div>
      </div>
    );
  }

  // Low performing books (based on PREVIOUS month's performance AND not completed curriculum)
  const lowPerformingBooks = teacherBooks.filter(tb => {
    const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
    const totalTaught = entries.reduce((s, mp) => s + mp.pages_taught, 0);
    const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
    const isCompleted = overallPctRaw >= 100;
    if (isCompleted) return false;
    // Exclude books whose overall is already 90%+ (effectively on track / excellent)
    if (overallPctRaw >= 90) return false;

    const taughtBeforeDisplayMonth = entries
      .filter(mp => mp.year < displayYear || (mp.year === displayYear && mp.month < displayMonth))
      .reduce((s, mp) => s + mp.pages_taught, 0);
    const wasCompletedBefore = tb.total_pages > 0 && (taughtBeforeDisplayMonth / tb.total_pages) >= 100;
    if (wasCompletedBefore) return false;

    const monthlyTarget = getMonthlyTargetForMonth(tb, displayMonth, taughtBeforeDisplayMonth);
    if (monthlyTarget <= 0) return false;
    const monthEntries = entries.filter(mp => mp.month === displayMonth && mp.year === displayYear);
    const monthTaught = monthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
    const monthPct = Math.round((monthTaught / monthlyTarget) * 100);
    return monthPct < 70;
  });

  const myRank = teacherId ? teacherRanks.get(teacherId) : undefined;
  const isPastSemester = selectedSemester ? new Date(selectedSemester.end_date) < new Date() : false;

  return (
    <div className="space-y-6">
      {prevSemesterIncomplete && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
              آپ کی پچھلے سمسٹر ({prevSemesterIncomplete.title}) کی کارکردگی نامکمل ہے۔ برائے کرم مکمل درج فرمائیں۔
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">جامعۃ المدینہ فیضان مخدوم لاہوری</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">موڈاسا، گجرات</p>
        </div>
        <div className="flex items-center gap-3">
          {allSemesters.length > 0 && (
            <SemesterSelector
              semesters={allSemesters}
              selectedId={selectedSemester?.id || ''}
              onChange={onSemesterChange}
              label="سمسٹر:"
            />
          )}
          <div className="text-right">
            <p className="text-xl font-bold text-sky-700 dark:text-sky-300">{teacherProfile?.name || 'استاذ'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end">
              <Calendar className="w-3 h-3" />
              {selectedSemester?.title || 'کوئی سمسٹر نہیں'} {selectedSemester?.year || ''}
              {isPastSemester && <span className="text-amber-500 text-xs">(گزشتہ)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Books */}
          <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
            <BookOpen className="w-8 h-8 text-sky-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{teacherBooks.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">کل کتابیں</p>
          </div>

          {/* Previous Month Average */}
          {(() => {
            let prevMonthPctSum = 0;
            let prevMonthBookCount = 0;
            teacherBooks.forEach(tb => {
              const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
              const taughtBeforePrevMonth = entries
                .filter(mp => mp.year < prevYear || (mp.year === prevYear && mp.month < prevMonth))
                .reduce((s, mp) => s + mp.pages_taught, 0);
              const wasCompletedBeforePrev = tb.total_pages > 0 && (taughtBeforePrevMonth / tb.total_pages) >= 100;
              if (wasCompletedBeforePrev) {
                prevMonthPctSum += 100;
              } else {
                const prevMonthEntries = entries.filter(mp => mp.month === prevMonth && mp.year === prevYear);
                const prevMonthTaught = prevMonthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
                const cumulativeUpToPrev = taughtBeforePrevMonth + prevMonthTaught;
                const isCompletedInPrev = tb.total_pages > 0 && (cumulativeUpToPrev / tb.total_pages) >= 100;
                if (isCompletedInPrev) {
                  prevMonthPctSum += 100;
                } else {
                  const prevMonthlyTarget = getMonthlyTargetForMonth(tb, prevMonth, taughtBeforePrevMonth);
                  if (prevMonthlyTarget > 0) {
                    prevMonthPctSum += Math.min(100, Math.round((prevMonthTaught / prevMonthlyTarget) * 100));
                  }
                }
              }
              prevMonthBookCount++;
            });
            const prevMonthAvg = prevMonthBookCount > 0 ? Math.round(prevMonthPctSum / prevMonthBookCount) : 0;
            const prevMonthQuality = getQuality(prevMonthAvg);
            const isPrevLow = prevMonthAvg < 70;
            return (
              <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                {isPrevLow ? (
                  <TrendingDown className="w-8 h-8 text-rose-600 mx-auto mb-2" />
                ) : (
                  <TrendingUp className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                )}
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{prevMonthAvg}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{urduMonths[prevMonth]} فیصد</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${getQualityColor(prevMonthQuality)}`}>{prevMonthQuality}</span>
              </div>
            );
          })()}

          {/* Current/Display Month Average */}
          {(() => {
            let monthPctSum = 0;
            let bookCount = 0;
            teacherBooks.forEach(tb => {
              const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
              const taughtBeforeCurrentMonth = entries
                .filter(mp => mp.year < displayYear || (mp.year === displayYear && mp.month < displayMonth))
                .reduce((s, mp) => s + mp.pages_taught, 0);
              const wasCompletedBefore = tb.total_pages > 0 && (taughtBeforeCurrentMonth / tb.total_pages) >= 100;

              if (wasCompletedBefore) {
                monthPctSum += 100;
              } else {
                const monthEntries = entries.filter(mp => mp.month === displayMonth && mp.year === displayYear);
                const monthTaught = monthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
                const cumulativeUpToThisMonth = taughtBeforeCurrentMonth + monthTaught;
                const isCompletedThisMonth = tb.total_pages > 0 && (cumulativeUpToThisMonth / tb.total_pages) >= 100;
                if (isCompletedThisMonth) {
                  monthPctSum += 100;
                } else {
                  const monthlyTarget = getMonthlyTargetForMonth(tb, displayMonth, taughtBeforeCurrentMonth);
                  if (monthlyTarget > 0) {
                    monthPctSum += Math.min(100, Math.round((monthTaught / monthlyTarget) * 100));
                  }
                }
              }
              bookCount++;
            });
            const monthAvg = bookCount > 0 ? Math.round(monthPctSum / bookCount) : 0;
            const monthQuality = getQuality(monthAvg);
            const isCurrentLow = monthAvg < 70;
            return (
              <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                {isCurrentLow ? (
                  <TrendingDown className="w-8 h-8 text-rose-600 mx-auto mb-2" />
                ) : (
                  <TrendingUp className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                )}
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{monthAvg}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{urduMonths[displayMonth]} فیصد</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${getQualityColor(monthQuality)}`}>{monthQuality}</span>
              </div>
            );
          })()}

          {/* Overall Average */}
          {(() => {
            let overallPctSum = 0;
            let bookCount = 0;
            teacherBooks.forEach(tb => {
              const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
              const totalTaught = entries.reduce((s, mp) => s + mp.pages_taught, 0);
              const overallPct = tb.total_pages > 0 ? Math.min(100, Math.round((totalTaught / tb.total_pages) * 100)) : 0;
              overallPctSum += overallPct;
              bookCount++;
            });
            const overallAvg = bookCount > 0 ? Math.round(overallPctSum / bookCount) : 0;
            const overallQuality = getQuality(overallAvg);
            return (
              <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30">
                <Award className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{overallAvg}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">مجموعی فیصد</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${getQualityColor(overallQuality)}`}>{overallQuality}</span>
              </div>
            );
          })()}

          {/* Rank */}
          <div className="text-center p-4 rounded-lg bg-sky-50 dark:bg-sky-900/20">
            <Award className="w-8 h-8 text-sky-600 mx-auto mb-2" />
            {myRank ? (
              <>
                <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{myRank.rank}/{myRank.totalTeachers}</p>
                <p className="text-xs text-sky-600 dark:text-sky-400">میرا رینک</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-400">--</p>
                <p className="text-xs text-gray-500">رینک</p>
              </>
            )}
          </div>

          {/* Low Performance Alert Count */}
          <div className="text-center p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20">
            <TrendingDown className="w-8 h-8 text-rose-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-rose-700 dark:text-rose-300">{lowPerformingBooks.length}</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">کم کارکردگی</p>
          </div>
        </div>
      </div>

      {/* Display Month Targets Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{urduMonths[displayMonth]} کے اہداف</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{displayYear}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کتاب</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{urduMonths[prevMonth]} فیصد</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">ہدف</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اب تک ہوئے</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">باقی</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اس ماہ فیصد</th>
              </tr>
            </thead>
            <tbody>
              {teacherBooks.map((tb, idx) => {
                const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
                const totalTaught = entries.reduce((s, mp) => s + mp.pages_taught, 0);
                const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
                const isCurriculumComplete = overallPctRaw >= 100;

                const taughtBeforePrevMonth = entries
                  .filter(mp => mp.year < prevYear || (mp.year === prevYear && mp.month < prevMonth))
                  .reduce((s, mp) => s + mp.pages_taught, 0);
                const wasCompletedBeforePrev = tb.total_pages > 0 && (taughtBeforePrevMonth / tb.total_pages) >= 100;
                const prevMonthEntries = entries.filter(mp => mp.month === prevMonth && mp.year === prevYear);
                const prevMonthTaught = prevMonthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
                const prevMonthlyTarget = getMonthlyTargetForMonth(tb, prevMonth, taughtBeforePrevMonth);
                const prevMonthPct = wasCompletedBeforePrev ? 100 : (prevMonthlyTarget > 0 ? Math.round((prevMonthTaught / prevMonthlyTarget) * 100) : 0);

                const prevMonthTotal = entries
                  .filter(mp => {
                    if (mp.year < displayYear) return true;
                    if (mp.year === displayYear && mp.month < displayMonth) return true;
                    return false;
                  })
                  .reduce((s, mp) => s + mp.pages_taught, 0);
                const wasAlreadyCompletedBefore = tb.total_pages > 0 && (prevMonthTotal / tb.total_pages) >= 100;
                const isAfterCompletion = isCurriculumComplete && wasAlreadyCompletedBefore;

                const monthEntries = progressEntries.filter(mp => mp.teacher_book_id === tb.id && mp.month === displayMonth && mp.year === displayYear);
                const monthTaught = monthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
                const monthlyTarget = getMonthlyTargetForMonth(tb, displayMonth, prevMonthTotal);
                const remaining = isAfterCompletion ? 0 : Math.max(0, monthlyTarget - monthTaught);
                const pct = isAfterCompletion ? 100 : (monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0);
                const isComplete = pct >= 100;

                return (
                  <tr key={tb.id} className={`border-b border-gray-100 dark:border-gray-700 ${isCurriculumComplete ? 'bg-emerald-50 dark:bg-emerald-900/10' : idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-700/25' : 'bg-white dark:bg-gray-800'}`}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                      {isCurriculumComplete && <span className="text-emerald-600 ml-1">✓</span>}
                      {tb.book_name}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`font-bold ${prevMonthPct >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>{prevMonthPct}%</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {isAfterCompletion ? (
                        <span className="text-emerald-600 font-bold">مکمل</span>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">{monthlyTarget} صفحات</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={isComplete || isCurriculumComplete ? 'text-emerald-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>
                        {isAfterCompletion ? tb.total_pages : monthTaught} صفحات
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={remaining === 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                        {isAfterCompletion ? '-' : `${remaining} صفحات`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`font-bold ${isComplete || isCurriculumComplete ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Performance Alert */}
      {lowPerformingBooks.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/30 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            <div className="flex-1">
              <h3 className="font-bold text-amber-700 dark:text-amber-300 mb-2">کم کارکردگی الرٹ</h3>
              <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">مندرجہ ذیل کتابوں میں ماہانہ کارکردگی 70% سے کم ہے:</p>
              <div className="flex flex-wrap gap-2">
                {lowPerformingBooks.map(tb => {
                  const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
                  const totalTaughtBeforeCurrent = entries
                    .filter(mp => mp.year < displayYear || (mp.year === displayYear && mp.month < displayMonth))
                    .reduce((s, mp) => s + mp.pages_taught, 0);
                  const monthEntries = entries.filter(mp => mp.month === displayMonth && mp.year === displayYear);
                  const monthTaught = monthEntries.reduce((s, mp) => s + mp.pages_taught, 0);
                  const monthlyTarget = getMonthlyTargetForMonth(tb, displayMonth, totalTaughtBeforeCurrent);
                  const monthPct = monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0;

                  return (
                    <span key={tb.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-medium">
                      <BookOpen className="w-3 h-3" />
                      {tb.book_name}
                      <span className="font-bold">({monthPct}%)</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
