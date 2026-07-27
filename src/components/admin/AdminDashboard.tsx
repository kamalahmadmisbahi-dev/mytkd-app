import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import StatCard from '../shared/StatCard';
import ProgressBar from '../shared/ProgressBar';
import PercentageCircle from '../shared/PercentageCircle';
import LoadingSpinner from '../shared/LoadingSpinner';
import SemesterSelector from '../shared/SemesterSelector';
import { Users, Calendar, GraduationCap, AlertTriangle, BarChart3, Trophy } from 'lucide-react';
import type { Teacher, Semester, Class, TeacherBook, MonthlyProgress } from '../../types';
import { fetchAllSemesters, fetchActiveSemester } from '../../lib/reportData';

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const getQuality = (pct: number) => pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';
const getQualityColor = (quality: string) => {
  switch (quality) {
    case 'ممتاز': return 'text-emerald-600';
    case 'بہتر': return 'text-sky-600';
    case 'مناسب': return 'text-amber-600';
    default: return 'text-rose-600';
  }
};

const capPercent = (pct: number) => Math.min(100, pct);

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [allSemesters, setAllSemesters] = useState<Semester[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teacherBooks, setTeacherBooks] = useState<TeacherBook[]>([]);
  const [progressEntries, setProgressEntries] = useState<MonthlyProgress[]>([]);
  const [lowPerformers, setLowPerformers] = useState<any[]>([]);
  const [lowPerformingBooks, setLowPerformingBooks] = useState<any[]>([]);
  const [classStats, setClassStats] = useState<Record<string, { target: number; completed: number }>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [teachersRes, classesRes] = await Promise.all([
        supabase.from('teachers').select('*').eq('is_active', true),
        supabase.from('classes').select('*').eq('is_active', true),
      ]);
      setTeachers(teachersRes.data || []);
      setClasses(classesRes.data || []);

      const sems = await fetchAllSemesters();
      setAllSemesters(sems);
      const active = await fetchActiveSemester();
      const initial = active || sems[0] || null;
      setSelectedSemester(initial);
      if (initial) await loadSemesterData(initial.id);
      else setLoading(false);
    })();
  }, []);

  async function loadSemesterData(semesterId: string) {
    setLoading(true);
    const [tbRes, mpRes, sRes] = await Promise.all([
      supabase.from('teacher_books').select('*, teacher:teachers(*), class:classes(*)').eq('semester_id', semesterId),
      supabase.from('monthly_progress').select('*').eq('semester_id', semesterId),
      supabase.from('semesters').select('*').eq('id', semesterId).maybeSingle(),
    ]);
    const semester = (sRes.data as Semester) || null;
    setSelectedSemester(semester);
    setTeacherBooks((tbRes.data as any[]) || []);
    setProgressEntries((mpRes.data as any[]) || []);

    if (semester) {
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const end = new Date(semester.end_date);
      const now = new Date();
      const useMonth = end < now ? end.getMonth() + 1 : currentMonth;
      const useYear = end < now ? end.getFullYear() : currentYear;
      const prevMonth = useMonth === 1 ? 12 : useMonth - 1;
      const prevYear = useMonth === 1 ? useYear - 1 : useYear;

      const low: any[] = [];
      const lowBooks: any[] = [];
      const stats: Record<string, { target: number; completed: number }> = {};
      const teacherMonthStats: Record<string, { monthPctSum: number; overallPctSum: number; bookCount: number; name: string }> = {};

      for (const tb of tbRes.data || []) {
        const entries = (mpRes.data || []).filter((mp: any) => mp.teacher_book_id === tb.id);
        const totalTaught = entries.reduce((s: number, e: any) => s + e.pages_taught, 0);
        const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
        const overallPct = capPercent(overallPctRaw);
        const isCompleted = overallPctRaw >= 100;

        const taughtBeforeCurrentMonth = entries
          .filter((e: any) => e.year < useYear || (e.year === useYear && e.month < useMonth))
          .reduce((s: number, e: any) => s + e.pages_taught, 0);
        const wasCompletedBeforeCurrentMonth = tb.total_pages > 0 && (taughtBeforeCurrentMonth / tb.total_pages) >= 100;
        const isAfterCompletion = isCompleted && wasCompletedBeforeCurrentMonth;

        const monthEntries = entries.filter((e: any) => e.month === useMonth && e.year === useYear);
        const monthTaught = monthEntries.reduce((s: number, e: any) => s + e.pages_taught, 0);
        const monthlyTarget = getMonthlyTargetForMonth(tb as TeacherBook, semester, useMonth, taughtBeforeCurrentMonth);
        const monthPctRaw = monthlyTarget > 0 ? (monthTaught / monthlyTarget) * 100 : 0;
        const monthPct = isAfterCompletion ? 100 : capPercent(monthPctRaw);

        const taughtBeforePrevMonth = entries
          .filter((e: any) => e.year < prevYear || (e.year === prevYear && e.month < prevMonth))
          .reduce((s: number, e: any) => s + e.pages_taught, 0);
        const prevMonthEntries = entries.filter((e: any) => e.month === prevMonth && e.year === prevYear);
        const prevMonthTaught = prevMonthEntries.reduce((s: number, e: any) => s + e.pages_taught, 0);
        const prevMonthlyTarget = getMonthlyTargetForMonth(tb as TeacherBook, semester, prevMonth, taughtBeforePrevMonth);
        const prevMonthPctRaw = prevMonthlyTarget > 0 ? (prevMonthTaught / prevMonthlyTarget) * 100 : 0;
        const prevMonthPct = capPercent(prevMonthPctRaw);

        if (tb.teacher) {
          if (!teacherMonthStats[tb.teacher.id]) {
            teacherMonthStats[tb.teacher.id] = { monthPctSum: 0, overallPctSum: 0, bookCount: 0, name: tb.teacher.name };
          }
          teacherMonthStats[tb.teacher.id].monthPctSum += monthPct;
          teacherMonthStats[tb.teacher.id].overallPctSum += overallPct;
          teacherMonthStats[tb.teacher.id].bookCount += 1;
        }

        if (!isCompleted && prevMonthPct < 70 && prevMonthlyTarget > 0) {
          lowBooks.push({
            book_id: tb.id,
            book_name: tb.book_name,
            teacher_name: tb.teacher?.name || 'نامعلوم',
            class_name: tb.class?.name || 'نامعلوم',
            monthly_percentage: Math.round(prevMonthPct),
            overall_percentage: Math.round(overallPct),
          });
        }

        const className = tb.class?.name || 'نامعلوم';
        if (!stats[className]) stats[className] = { target: 0, completed: 0 };
        stats[className].target += tb.total_pages;
        stats[className].completed += totalTaught;
      }

      for (const [id, data] of Object.entries(teacherMonthStats)) {
        const avgMonthPct = data.bookCount > 0 ? Math.round(data.monthPctSum / data.bookCount) : 0;
        const avgOverallPct = data.bookCount > 0 ? Math.round(data.overallPctSum / data.bookCount) : 0;
        if (avgMonthPct < 70 || avgOverallPct < 70) {
          low.push({
            teacher_id: id,
            teacher_name: data.name,
            monthly_percentage: avgMonthPct,
            overall_percentage: avgOverallPct,
          });
        }
      }

      setLowPerformers(low);
      setLowPerformingBooks(lowBooks);
      setClassStats(stats);
    }
    setLoading(false);
  }

  function onSemesterChange(id: string) {
    const sem = allSemesters.find(s => s.id === id) || null;
    setSelectedSemester(sem);
    if (sem) loadSemesterData(sem.id);
  }

  function getMonthlyAcademicDays(semester: Semester | null, month: number): number {
    if (!semester) return 0;
    return (semester as any)[`month_${month}_days`] || 0;
  }

  function getMonthlyTargetForMonth(tb: TeacherBook, semester: Semester | null, month: number, totalTaughtBeforeMonth: number): number {
    if (!semester || !semester.total_academic_days || semester.total_academic_days === 0) {
      return Math.round(tb.monthly_target) || 0;
    }
    const remainingPages = tb.total_pages - totalTaughtBeforeMonth;
    if (remainingPages <= 0) return 0;

    const monthDays = getMonthlyAcademicDays(semester, month);
    if (monthDays === 0) return 0;

    let remainingDays = 0;
    for (let m = month; m <= 12; m++) {
      remainingDays += getMonthlyAcademicDays(semester, m);
    }
    if (remainingDays <= 0) return 0;

    const dailyRate = remainingPages / remainingDays;
    return Math.min(remainingPages, Math.round(dailyRate * monthDays));
  }

  if (loading) return <LoadingSpinner />;

  const currentMonth = new Date().getMonth() + 1;
  const end = selectedSemester ? new Date(selectedSemester.end_date) : null;
  const now = new Date();
  const displayMonth = end && end < now ? end.getMonth() + 1 : currentMonth;
  const isPastSemester = selectedSemester ? new Date(selectedSemester.end_date) < new Date() : false;

  const monthlyData: Record<number, { target: number; completed: number }> = {};
  for (const tb of teacherBooks) {
    const monthlyTarget = Number(tb.monthly_target) || 0;
    for (let m = 1; m <= 12; m++) {
      if (!monthlyData[m]) monthlyData[m] = { target: 0, completed: 0 };
      monthlyData[m].target += monthlyTarget;
    }
  }
  for (const mp of progressEntries) {
    if (!monthlyData[mp.month]) monthlyData[mp.month] = { target: 0, completed: 0 };
    monthlyData[mp.month].completed += mp.pages_taught;
  }

  const totalTarget = Object.values(classStats).reduce((s, v) => s + v.target, 0);
  const totalCompleted = Object.values(classStats).reduce((s, v) => s + v.completed, 0);
  const curriculumPct = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;

  const teacherRanking: { id: string; name: string; overallPct: number }[] = [];
  const teacherBookStats: Record<string, { totalPctSum: number; bookCount: number }> = {};
  for (const tb of teacherBooks) {
    if (!tb.teacher) continue;
    if (!teacherBookStats[tb.teacher.id]) {
      teacherBookStats[tb.teacher.id] = { totalPctSum: 0, bookCount: 0 };
      teacherRanking.push({ id: tb.teacher.id, name: tb.teacher.name, overallPct: 0 });
    }
    const entries = progressEntries.filter(mp => mp.teacher_book_id === tb.id);
    const completed = entries.reduce((s, mp) => s + mp.pages_taught, 0);
    const rawPct = tb.total_pages > 0 ? (completed / tb.total_pages) * 100 : 0;
    teacherBookStats[tb.teacher.id].totalPctSum += capPercent(rawPct);
    teacherBookStats[tb.teacher.id].bookCount += 1;
  }
  for (const t of teacherRanking) {
    const d = teacherBookStats[t.id];
    t.overallPct = d.bookCount > 0 ? Math.round(d.totalPctSum / d.bookCount) : 0;
  }
  teacherRanking.sort((a, b) => b.overallPct - a.overallPct);
  // Competition ranking: same percentage = same rank
  const rankedTop: { id: string; name: string; overallPct: number; rank: number }[] = [];
  let prevPct: number | null = null;
  let prevRank = 0;
  teacherRanking.forEach((t, idx) => {
    if (prevPct === null || t.overallPct !== prevPct) {
      prevRank = idx + 1;
      prevPct = t.overallPct;
    }
    rankedTop.push({ ...t, rank: prevRank });
  });
  const top3 = rankedTop.slice(0, 3);

  return (
    <div className="space-y-6">
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
            <p className="text-xl font-bold text-sky-700 dark:text-sky-300">ایڈمن ڈیش بورڈ</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end">
              <Calendar className="w-3 h-3" />
              {selectedSemester ? `${selectedSemester.title} ${selectedSemester.year}` : 'کوئی سمسٹر نہیں'}
              {isPastSemester && <span className="text-amber-500 text-xs">(گزشتہ)</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="کل اساتذہ" value={teachers.length} icon={<Users className="w-5 h-5" />} color="emerald" />
        <StatCard title="منتخب سمسٹر" value={selectedSemester?.title || '-'} icon={<Calendar className="w-5 h-5" />} color="sky" />
        <StatCard title="کل درجات" value={classes.length} icon={<GraduationCap className="w-5 h-5" />} color="teal" />
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <PercentageCircle percentage={curriculumPct} size={56} strokeWidth={6} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">مجموعی کارکردگی</p>
            <p className={`text-lg font-bold ${getQualityColor(getQuality(curriculumPct))}`}>{getQuality(curriculumPct)}</p>
          </div>
        </div>
      </div>

      {/* Grade-wise Performance & Top 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-teal-600" />
            درجہ وار کارکردگی
          </h2>
          {Object.keys(classStats).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">ابھی کوئی ڈیٹا نہیں</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(classStats).map(([className, stats]) => {
                const pct = stats.target > 0 ? Math.round((stats.completed / stats.target) * 100) : 0;
                const quality = getQuality(pct);
                return (
                  <div key={className} className="p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{className}</span>
                      <span className={`text-sm font-bold ${getQualityColor(quality)}`}>{pct}%</span>
                    </div>
                    <ProgressBar percentage={pct} size="sm" showValue={false} />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.completed}/{stats.target} | {quality}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            ٹاپ تھری اساتذہ
          </h2>
          {top3.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">ابھی کوئی ڈیٹا نہیں</p>
          ) : (
            <div className="space-y-3">
              {top3.map((t, idx) => {
                const medals = ['bg-amber-500', 'bg-gray-400', 'bg-amber-700'];
                const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];
                const quality = getQuality(t.overallPct);
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${medals[idx] || 'bg-gray-300'}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                      <p className={`text-xs font-bold ${medalColors[idx] || 'text-gray-500'}`}>{t.overallPct}% - {quality}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Line Graph & Low Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            ماہانہ کارکردگی
          </h2>
          {(() => {
            const dataPoints = Object.entries(monthlyData)
              .filter(([, v]) => v.target > 0)
              .map(([m, data]) => ({
                month: Number(m),
                percentage: data.target > 0 ? Math.round((data.completed / data.target) * 100) : 0,
              }));

            if (dataPoints.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">ابھی کوئی ڈیٹا نہیں</p>;

            const maxPercent = Math.max(...dataPoints.map(d => d.percentage), 100);
            const chartHeight = 200;
            const chartWidth = 400;
            const padding = 30;

            const points = dataPoints.map((d, idx) => {
              const x = padding + (idx / (dataPoints.length - 1 || 1)) * (chartWidth - padding * 2);
              const y = chartHeight - padding - (d.percentage / maxPercent) * (chartHeight - padding * 2);
              return { x, y, percentage: d.percentage, label: urduMonths[d.month] };
            });

            return (
              <div className="flex justify-center">
                <svg width={chartWidth} height={chartHeight} className="text-gray-300 dark:text-gray-600">
                  <line x1={padding} y1={chartHeight - padding} x2={padding} y2={padding} stroke="currentColor" strokeWidth="1" />
                  <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="currentColor" strokeWidth="1" />
                  {[0, 25, 50, 75, 100].map((val) => {
                    const y = chartHeight - padding - (val / maxPercent) * (chartHeight - padding * 2);
                    return (
                      <g key={val}>
                        <line x1={padding - 5} y1={y} x2={chartWidth - padding} y2={y} stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
                        <text x={padding - 10} y={y + 4} fontSize="10" textAnchor="end" className="fill-gray-500 dark:fill-gray-400">{val}%</text>
                      </g>
                    );
                  })}
                  <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" />
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4" fill="#10b981" />
                      <text x={p.x} y={p.y - 10} fontSize="10" textAnchor="middle" className="fill-emerald-600 font-bold">{p.percentage}%</text>
                      <text x={p.x} y={chartHeight - padding + 15} fontSize="9" textAnchor="middle" className="fill-gray-600 dark:fill-gray-400">{p.label}</text>
                    </g>
                  ))}
                </svg>
              </div>
            );
          })()}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            مجموعی کم کارکردگی الرٹس
          </h2>
          {lowPerformers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">سب کچھ ٹھیک ہے</p>
          ) : (
            <div className="space-y-2">
              {lowPerformers.map((lp, i) => {
                const overallQual = getQuality(lp.overall_percentage);
                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/30">
                    <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{lp.teacher_name}</span>
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-gray-400">مجموعی فیصد</p>
                      <p className={`font-bold ${getQualityColor(overallQual)}`}>{lp.overall_percentage}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Book-wise Low Performance Alerts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            کتاب وائز کم کارکردگی الرٹ
          </h2>
        </div>
        {lowPerformingBooks.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">سب کتابوں میں کارکردگی 70% سے زیادہ ہے</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کتاب</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">استاذ</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">درجہ</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{urduMonths[displayMonth]} فیصد</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">مجموعی فیصد</th>
                </tr>
              </thead>
              <tbody>
                {lowPerformingBooks.map((lb, idx) => {
                  const monthQual = getQuality(lb.monthly_percentage);
                  const overallQual = getQuality(lb.overall_percentage);
                  return (
                    <tr key={lb.book_id} className={`border-b border-gray-100 dark:border-gray-700 ${idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-700/25' : 'bg-white dark:bg-gray-800'}`}>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">{lb.book_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{lb.teacher_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{lb.class_name}</td>
                      <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${getQualityColor(monthQual)}`}>{lb.monthly_percentage}%</td>
                      <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${getQualityColor(overallQual)}`}>{lb.overall_percentage}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
