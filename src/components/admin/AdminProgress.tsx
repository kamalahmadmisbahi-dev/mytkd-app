import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import EmptyState from '../shared/EmptyState';
import { Clipboard as ClipboardEdit, Minus, Plus, Save } from 'lucide-react';
import type { Teacher, Semester, TeacherBook, MonthlyProgress } from '../../types';

const urduMonths = ['', 'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const getQuality = (pct: number) => pct >= 90 ? 'ممتاز' : pct >= 80 ? 'بہتر' : pct >= 70 ? 'مناسب' : 'کمزور';

// Get monthly target based on REMAINING pages and REMAINING academic days
function getMonthlyTargetForMonth(tb: TeacherBook, semester: Semester | null, month: number, totalTaughtBeforeMonth: number): number {
  if (!semester || !semester.total_academic_days || semester.total_academic_days === 0) {
    return Math.round(tb.monthly_target) || 0;
  }
  const remainingPages = tb.total_pages - totalTaughtBeforeMonth;
  if (remainingPages <= 0) return 0;

  const monthDays = (semester as any)[`month_${month}_days`] || 0;
  if (monthDays === 0) return 0;

  // Calculate remaining academic days from this month to end of semester
  let remainingDays = 0;
  for (let m = month; m <= 12; m++) {
    remainingDays += (semester as any)[`month_${m}_days`] || 0;
  }
  if (remainingDays <= 0) return 0;

  // monthly_target = (remaining_pages / remaining_academic_days) * this_month_academic_days
  const dailyRate = remainingPages / remainingDays;
  return Math.min(remainingPages, Math.round(dailyRate * monthDays));
}

export default function AdminProgress() {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [teacherBooks, setTeacherBooks] = useState<TeacherBook[]>([]);
  const [progressEntries, setProgressEntries] = useState<MonthlyProgress[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [editMonth, setEditMonth] = useState<number>(currentMonth);
  const [editYear, setEditYear] = useState<number>(currentYear);

  const [editTotalTaught, setEditTotalTaught] = useState<number>(0);
  const [editLesson, setEditLesson] = useState('');
  const [editPageNum, setEditPageNum] = useState(0);

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const [tRes, sRes] = await Promise.all([
      supabase.from('teachers').select('*').eq('is_active', true).order('name'),
      supabase.from('semesters').select('*').eq('is_active', true).maybeSingle(),
    ]);
    setTeachers(tRes.data || []);
    setActiveSemester((sRes.data as Semester) || null);
    setLoading(false);
  }

  async function loadTeacherData(teacherId: string) {
    if (!activeSemester || !teacherId) return;
    setLoading(true);
    const [tbRes, mpRes] = await Promise.all([
      supabase.from('teacher_books').select('*, class:classes(*)').eq('teacher_id', teacherId).eq('semester_id', activeSemester.id),
      supabase.from('monthly_progress').select('*').eq('teacher_id', teacherId).eq('semester_id', activeSemester.id),
    ]);
    setTeacherBooks((tbRes.data as any[]) || []);
    setProgressEntries((mpRes.data as any[]) || []);
    const tbData = (tbRes.data as any[]) || [];
    if (tbData.length > 0) {
      setSelectedBookId(tbData[0].id);
    } else {
      setSelectedBookId('');
    }
    setLoading(false);
  }

  function getMonthEntry(bookId: string, month: number, year: number): MonthlyProgress | null {
    return progressEntries.find(mp => mp.teacher_book_id === bookId && mp.month === month && mp.year === year) || null;
  }

  // Get cumulative total up to and including the selected month
  function getCumulativeUpToMonth(bookId: string, targetMonth: number, targetYear: number): number {
    return progressEntries
      .filter(mp => mp.teacher_book_id === bookId)
      .filter(mp => {
        if (mp.year < targetYear) return true;
        if (mp.year === targetYear && mp.month <= targetMonth) return true;
        return false;
      })
      .reduce((s, mp) => s + mp.pages_taught, 0);
  }

  // Calculate pages for this month based on cumulative total
  function calcMonthFromCumulative(bookId: string, month: number, year: number, newCumulative: number): number {
    // Get cumulative up to the month BEFORE this one
    const prevCumulative = progressEntries
      .filter(mp => mp.teacher_book_id === bookId)
      .filter(mp => {
        if (mp.year < year) return true;
        if (mp.year === year && mp.month < month) return true;
        return false;
      })
      .reduce((s, mp) => s + mp.pages_taught, 0);
    return Math.max(0, newCumulative - prevCumulative);
  }

  async function handleTotalChange(delta: number) {
    const bp = teacherBooks.find(b => b.id === selectedBookId);
    if (!bp) return;
    const currentCumulative = getCumulativeUpToMonth(selectedBookId, editMonth, editYear);
    const newCumulative = Math.max(0, currentCumulative + delta);
    if (newCumulative > bp.total_pages) {
      addNotification('error', 'کل صفحات نصابی صفحات سے زیادہ نہیں ہو سکتے');
      return;
    }
    const monthPages = calcMonthFromCumulative(selectedBookId, editMonth, editYear, newCumulative);
    const existingEntry = getMonthEntry(selectedBookId, editMonth, editYear);
    await saveEntry(monthPages, existingEntry?.current_lesson_end || '', existingEntry?.current_page || 0);
  }

  async function handleFormSave() {
    const bp = teacherBooks.find(b => b.id === selectedBookId);
    if (!bp) return;
    if (editTotalTaught > bp.total_pages) {
      addNotification('error', 'کل صفحات نصابی صفحات سے زیادہ نہیں ہو سکتے');
      return;
    }
    const monthPages = calcMonthFromCumulative(selectedBookId, editMonth, editYear, editTotalTaught);
    await saveEntry(monthPages, editLesson, editPageNum);
  }

  async function saveEntry(pagesTaught: number, lessonEnd: string, currentPage: number) {
    if (!activeSemester || !selectedTeacherId || !selectedBookId) return;
    setSaving(true);
    const existing = getMonthEntry(selectedBookId, editMonth, editYear);

    try {
      if (existing) {
        const { error } = await supabase.from('monthly_progress').update({
          pages_taught: pagesTaught,
          current_lesson_end: lessonEnd,
          current_page: currentPage,
        }).eq('id', existing.id);
        if (error) throw error;
        addNotification('success', 'کارکردگی اپڈیٹ ہو گئی');
      } else {
        const { error } = await supabase.from('monthly_progress').insert({
          teacher_book_id: selectedBookId,
          teacher_id: selectedTeacherId,
          semester_id: activeSemester.id,
          month: editMonth,
          year: editYear,
          pages_taught: pagesTaught,
          current_lesson_end: lessonEnd,
          current_page: currentPage,
        });
        if (error) throw error;
        addNotification('success', 'کارکردگی محفوظ ہو گئی');
      }
      await loadTeacherData(selectedTeacherId);
    } catch (err: any) {
      addNotification('error', err.message || 'خرابی');
    }
    setSaving(false);
  }

  function startEdit() {
    const bp = teacherBooks.find(b => b.id === selectedBookId);
    if (!bp) return;
    const entry = getMonthEntry(selectedBookId, editMonth, editYear);
    // Initialize with cumulative total up to this month
    setEditTotalTaught(getCumulativeUpToMonth(selectedBookId, editMonth, editYear));
    setEditLesson(entry?.current_lesson_end || '');
    setEditPageNum(entry?.current_page || 0);
  }

  if (loading && !activeSemester) return <LoadingSpinner />;

  const selectedBook = teacherBooks.find(b => b.id === selectedBookId);

  // Get semester months for dropdown (all years covered by semester)
  const semesterYears: number[] = [];
  const semesterMonths: { month: number; year: number }[] = [];
  if (activeSemester) {
    const startYear = new Date(activeSemester.start_date).getFullYear();
    const endYear = new Date(activeSemester.end_date).getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      semesterYears.push(y);
    }
    if (semesterYears.length === 0) semesterYears.push(currentYear);
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        const days = (activeSemester as any)[`month_${m}_days`] || 0;
        if (days > 0) semesterMonths.push({ month: m, year: y });
      }
    }
    if (semesterMonths.length === 0) {
      semesterMonths.push({ month: currentMonth, year: currentYear });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardEdit className="w-6 h-6 text-sky-600" />
          ماہانہ کارکردگی درج کریں
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{activeSemester?.title || 'کوئی فعال سمسٹر نہیں'}</p>
      </div>

      {!activeSemester ? (
        <EmptyState title="کوئی فعال سمسٹر نہیں" description="ایڈمن سمسٹر فعال کرنے تک انتظار کریں" />
      ) : (
        <>
          {/* Step 1: Select Teacher */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">۱۔ استاذ منتخب کریں</h2>
            <select value={selectedTeacherId} onChange={e => {
              const id = e.target.value;
              setSelectedTeacherId(id);
              setSelectedBookId('');
              if (id) loadTeacherData(id);
              else { setTeacherBooks([]); setProgressEntries([]); }
            }}
              className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
              <option value="">استاذ منتخب کریں</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.login_id})</option>)}
            </select>
          </div>

          {/* Step 2: Select Book & Month */}
          {selectedTeacherId && teacherBooks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">۲۔ کتاب، ماہ اور سال منتخب کریں</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <select value={selectedBookId} onChange={e => { setSelectedBookId(e.target.value); startEdit(); }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
                  {teacherBooks.map(tb => (
                    <option key={tb.id} value={tb.id}>{tb.book_name} - {(tb as any).class?.name || '-'}</option>
                  ))}
                </select>
                <select value={editMonth} onChange={e => {
                  setEditMonth(Number(e.target.value));
                  startEdit();
                }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
                  {urduMonths.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select value={editYear} onChange={e => {
                  setEditYear(Number(e.target.value));
                  startEdit();
                }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none">
                  {semesterYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {selectedTeacherId && teacherBooks.length === 0 && !loading && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">اس استاد نے ابھی کوئی کتاب شامل نہیں کی</p>
            </div>
          )}

          {/* Step 3: Fill Progress */}
          {selectedBookId && selectedBook && (() => {
            // Show cumulative up to selected month
            const totalTaught = getCumulativeUpToMonth(selectedBookId, editMonth, editYear);
            const overallPctRaw = selectedBook.total_pages > 0 ? (totalTaught / selectedBook.total_pages) * 100 : 0;
            const isCompleted = overallPctRaw >= 100;

            // Check if this is the completion month or after
            const prevMonth = editMonth === 1 ? 12 : editMonth - 1;
            const prevYear = editMonth === 1 ? editYear - 1 : editYear;
            const prevMonthCumulative = getCumulativeUpToMonth(selectedBookId, prevMonth, prevYear);
            const wasAlreadyCompletedBefore = selectedBook.total_pages > 0 && (prevMonthCumulative / selectedBook.total_pages) >= 100;
            const isAfterCompletion = isCompleted && wasAlreadyCompletedBefore;

            const monthEntry = getMonthEntry(selectedBookId, editMonth, editYear);
            const monthTaught = monthEntry?.pages_taught || 0;
            const monthlyTarget = getMonthlyTargetForMonth(selectedBook, activeSemester, editMonth, prevMonthCumulative);
            const monthPct = isAfterCompletion ? 100 : (monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0);
            const monthQuality = isAfterCompletion ? 'ممتاز' : getQuality(monthPct);

            return (
              <div key={selectedBookId} className={`rounded-xl shadow-sm border p-6 ${isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">۳۔ ماہانہ کارکردگی درج کریں</h2>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">
                      {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                      {selectedBook.book_name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedBook as any).class?.name} | نصابی: {selectedBook.total_pages}
                      {isAfterCompletion ? ' | مکمل' : ` | ماہانہ ہدف: ${monthlyTarget}`}
                    </p>
                  </div>
                  {isCompleted && (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                      {isAfterCompletion ? 'ممتاز' : `${monthPct}%`}
                    </span>
                  )}
                </div>

                {isAfterCompletion ? (
                  <div className="text-center py-6">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">نصاب مکمل</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">کل پڑھائے: {selectedBook.total_pages} صفحات</p>
                  </div>
                ) : (
                  <>
                    {/* Quick +/- on Total */}
                    <div className="flex items-center justify-center gap-6 py-4">
                      <button onClick={() => handleTotalChange(-1)} disabled={saving || totalTaught <= 0}
                        className="w-14 h-14 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center hover:bg-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-30 transition-colors">
                        <Minus className="w-7 h-7" />
                      </button>
                      <div className="text-center">
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">{totalTaught}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">اب تک پڑھائے / {selectedBook.total_pages}</p>
                      </div>
                      <button onClick={() => handleTotalChange(1)} disabled={saving || totalTaught >= selectedBook.total_pages}
                        className="w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-30 transition-colors">
                        <Plus className="w-7 h-7" />
                      </button>
                    </div>

                    {/* Current Info */}
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-sm mb-4">
                      <div className="text-gray-600 dark:text-gray-400">اس ماہ: <span className="font-bold text-gray-900 dark:text-white">{monthTaught} صفحات</span></div>
                      <div className="text-gray-600 dark:text-gray-400">سبق: <span className="font-bold text-gray-900 dark:text-white">{monthEntry?.current_lesson_end || '-'}</span></div>
                      <div className="text-gray-600 dark:text-gray-400">صفحہ: <span className="font-bold text-gray-900 dark:text-white">{monthEntry?.current_page || '-'}</span></div>
                    </div>

                    {/* Edit Form */}
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اب تک پڑھائے (کل)</label>
                          <input type="number" value={editTotalTaught || ''} onChange={e => setEditTotalTaught(Number(e.target.value))}
                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">صفحہ نمبر</label>
                          <input type="number" value={editPageNum || ''} onChange={e => setEditPageNum(Number(e.target.value))}
                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">موجودہ سبق</label>
                          <input type="text" value={editLesson} onChange={e => setEditLesson(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none" dir="rtl" />
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/30 text-sm">
                        <p className="text-sky-700 dark:text-sky-300">اس ماہ پڑھائے: <span className="font-bold">{calcMonthFromCumulative(selectedBookId, editMonth, editYear, editTotalTaught)} صفحات</span> (خودکار حساب)</p>
                      </div>
                      <button onClick={handleFormSave} disabled={saving} className="w-full py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> {saving ? 'محفوظ...' : 'محفوظ کریں'}
                      </button>
                    </div>

                    {/* Monthly Performance */}
                    <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30">
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-700 dark:text-emerald-300">{urduMonths[editMonth]} کارکردگی</span>
                        <span className="font-bold text-emerald-900 dark:text-emerald-100">{monthPct}% - {monthQuality}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* All Books Summary */}
          {selectedTeacherId && teacherBooks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">تمام کتب کا خلاصہ</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کتاب</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اب تک پڑھائے</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">اس ماہ</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">ہدف</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">فیصد</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">کیفیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacherBooks.map((tb) => {
                      const totalTaught = getCumulativeUpToMonth(tb.id, editMonth, editYear);
                      const overallPctRaw = tb.total_pages > 0 ? (totalTaught / tb.total_pages) * 100 : 0;
                      const isCompleted = overallPctRaw >= 100;

                      const prevM = editMonth === 1 ? 12 : editMonth - 1;
                      const prevY = editMonth === 1 ? editYear - 1 : editYear;
                      const prevMonthCumulative = getCumulativeUpToMonth(tb.id, prevM, prevY);
                      const wasAlreadyCompletedBefore = tb.total_pages > 0 && (prevMonthCumulative / tb.total_pages) >= 100;
                      const isAfterCompletion = isCompleted && wasAlreadyCompletedBefore;

                      const monthEntry = getMonthEntry(tb.id, editMonth, editYear);
                      const monthTaught = monthEntry?.pages_taught || 0;
                      const monthlyTarget = getMonthlyTargetForMonth(tb, activeSemester, editMonth, prevMonthCumulative);
                      const monthPct = isAfterCompletion ? 100 : (monthlyTarget > 0 ? Math.round((monthTaught / monthlyTarget) * 100) : 0);
                      const quality = isAfterCompletion ? 'ممتاز' : getQuality(monthPct);
                      const qualityColor = quality === 'ممتاز' ? 'text-emerald-600' : quality === 'بہتر' ? 'text-sky-600' : quality === 'مناسب' ? 'text-amber-600' : 'text-rose-600';

                      return (
                        <tr key={tb.id} className={`border-b cursor-pointer ${isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'border-gray-100 dark:border-gray-700'} ${selectedBookId === tb.id ? 'bg-sky-50 dark:bg-sky-900/10' : ''}`}
                          onClick={() => { setSelectedBookId(tb.id); startEdit(); }}>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium whitespace-nowrap">
                            {isCompleted && <span className="text-emerald-600 ml-1">✓</span>}
                            {tb.book_name}
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <span className={isCompleted ? 'text-emerald-600 font-bold' : 'text-gray-700 dark:text-gray-300'}>{totalTaught}/{tb.total_pages}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{isAfterCompletion ? '-' : monthTaught}</td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            {isAfterCompletion ? <span className="text-emerald-600 font-bold">مکمل</span> : <span className="text-gray-700 dark:text-gray-300">{monthlyTarget}</span>}
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap font-bold">{monthPct}%</td>
                          <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${qualityColor}`}>{quality}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
